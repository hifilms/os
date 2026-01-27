import { db } from './db.js';
import { peerManager } from './network.js';

// State
let myProfile = null;
let currentChatPeerId = null;
const onlinePeers = new Set();
const unreadCounts = {};
let blacklist = [];
let currentSelectedMsg = null;
let lastDateLabel = null;
let currentAvatarBase64 = null;

const DEFAULT_AVATAR = 'https://upload.wikimedia.org/wikipedia/commons/9/93/Google_Contacts_icon.svg';

const STATUS_ICONS = {
    pending: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>',
    sent: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>',
    seen: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#34B7F1" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>'
};

// DOM Elements
const loginOverlay = document.getElementById('login-overlay');
const mainApp = document.getElementById('main-app');
const sidebarEl = document.getElementById('sidebar');
const chatAreaEl = document.getElementById('chat-area');
const contactListEl = document.getElementById('contact-list');
const chatMessages = document.getElementById('chat-messages');
const chatNameEl = document.getElementById('chat-name');
const chatStatusEl = document.getElementById('chat-status');
const msgInput = document.getElementById('msg-input');
const fileInput = document.getElementById('file-input');
const mainMenu = document.getElementById('main-menu');
const chatMenu = document.getElementById('chat-menu');

// Initialize
async function init() {
    try {
        await db.open();
        myProfile = await db.getProfile();

        const storedBlacklist = await db._get('settings', 'blacklist');
        if (storedBlacklist) blacklist = storedBlacklist.list || [];

        const storedTheme = await db._get('settings', 'theme');
        const theme = storedTheme ? storedTheme.value : 'light';
        setTheme(theme);

        if (myProfile) {
            currentAvatarBase64 = myProfile.avatar;
            showMainApp();
            initNetwork(myProfile.mobile);

            // Restore chat if hash exists
            const hash = window.location.hash.substring(1);
            if (hash) {
                const contacts = await db.getContacts();
                const contact = contacts.find(c => c.mobile === hash);
                if (contact) openChat(contact, false);
                else openChat({ mobile: hash, name: `User ${hash.slice(-4)}` }, false);
            }
        } else {
            loginOverlay.style.display = 'flex';
        }
        loadContacts();
    } catch (err) {
        console.error('Init error:', err);
    }
}

function setTheme(theme) {
    document.body.setAttribute('data-theme', theme);
    const btn = document.getElementById('btn-toggle-theme');
    if (btn) {
        const icon = theme === 'light'
            ? '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>'
            : '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>';
        btn.innerHTML = `${icon} <span>${theme === 'light' ? 'Dark Mode' : 'Light Mode'}</span>`;
    }
}

document.getElementById('btn-toggle-theme').onclick = async (e) => {
    e.stopPropagation();
    const currentTheme = document.body.getAttribute('data-theme') || 'light';
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    await db._put('settings', { id: 'theme', value: newTheme });
    mainMenu.style.display = 'none';
};

function forceSetAvatar(id, avatarUrl) {
    const el = document.getElementById(id);
    if (el) {
        const timestamp = Date.now();
        // If it's base64, we don't need cache busting, but setting src is enough.
        // We ensure it's visible and the src is updated.
        el.src = avatarUrl || DEFAULT_AVATAR;
        el.style.display = 'block';
        console.log(`Avatar updated for ${id}`);
    }
}

function initNetwork(id) {
    peerManager.init(id, (peerId) => {
        console.log('Peer ready:', peerId);
    }, (peerId, status) => {
        if (blacklist.includes(peerId)) return;
        if (status === 'online') {
            onlinePeers.add(peerId);
            peerManager.sendMessage(peerId, { type: 'profile_request' });
        } else {
            onlinePeers.delete(peerId);
        }
        updateUIStatus(peerId);
    }, (peerId) => blacklist.includes(peerId));

    peerManager.onMessage(async (data, fromPeerId) => {
        if (blacklist.includes(fromPeerId)) return;

        if (data.type === 'profile_request') {
            peerManager.sendMessage(fromPeerId, { type: 'profile_response', name: myProfile.name, avatar: myProfile.avatar });
            return;
        }

        if (data.type === 'profile_response') {
            const contact = await db._get('contacts', fromPeerId);
            if (contact) {
                await db.addContact(fromPeerId, contact.name, data.avatar);
                loadContacts();
                if (currentChatPeerId === fromPeerId) {
                    forceSetAvatar('header-avatar', data.avatar);
                }
            }
            // Mark as online when we get a profile response
            onlinePeers.add(fromPeerId);
            updateUIStatus(fromPeerId);
            return;
        }

        if (data.type === 'seen_ack') {
            const msgs = await db.getMessages(fromPeerId);
            for (const m of msgs) { if (m.isMine && m.status !== 'seen') await db.updateMessageStatus(m.id, 'seen'); }
            if (currentChatPeerId === fromPeerId) refreshMessages();
            return;
        }

        let contacts = await db.getContacts();
        let contact = contacts.find(c => c.mobile === fromPeerId);
        if (!contact) {
            contact = { mobile: fromPeerId, name: `User ${fromPeerId.slice(-4)}` };
            await db.addContact(contact.mobile, contact.name);
            peerManager.sendMessage(fromPeerId, { type: 'profile_request' });
        }

        const msg = {
            peerId: fromPeerId, from: fromPeerId, to: myProfile.mobile,
            content: data.content, type: data.type || 'text',
            file: data.file, fileName: data.fileName, fileType: data.fileType,
            timestamp: data.timestamp, isMine: false, status: 'seen'
        };
        await db.addMessage(msg);

        if (currentChatPeerId === fromPeerId) {
            addDateSeparatorIfNeeded(msg.timestamp);
            appendMessageToUI(msg);
            peerManager.sendMessage(fromPeerId, { type: 'seen_ack' });
        } else {
            unreadCounts[fromPeerId] = (unreadCounts[fromPeerId] || 0) + 1;
        }
        loadContacts();
    });
}

function updateUIStatus(peerId) {
    if (currentChatPeerId === peerId) {
        chatStatusEl.textContent = onlinePeers.has(peerId) ? 'online' : 'offline';
        chatStatusEl.className = 'chat-status ' + (onlinePeers.has(peerId) ? 'online' : 'offline');
    }
    const dots = document.querySelectorAll(`.contact-item[data-id="${peerId}"] .status-dot`);
    dots.forEach(dot => {
        dot.className = 'status-dot ' + (onlinePeers.has(peerId) ? 'online' : '');
    });
}

// Nav
function closeChatUI() {
    chatAreaEl.classList.remove('active');
    sidebarEl.classList.remove('hidden');
    currentChatPeerId = null;
    loadContacts();
}

document.getElementById('btn-back').onclick = () => {
    window.location.hash = '';
};
document.getElementById('btn-main-menu').onclick = (e) => { e.stopPropagation(); mainMenu.style.display = mainMenu.style.display === 'flex' ? 'none' : 'flex'; };
document.getElementById('btn-chat-menu').onclick = (e) => { e.stopPropagation(); chatMenu.style.display = chatMenu.style.display === 'flex' ? 'none' : 'flex'; };
window.onclick = () => { mainMenu.style.display = 'none'; chatMenu.style.display = 'none'; };

const openSheet = (id) => { const sheet = document.getElementById(id); if (sheet) { sheet.style.display = 'flex'; setTimeout(() => sheet.classList.add('show'), 10); } };
window.closeSheets = () => { document.querySelectorAll('.modal').forEach(sheet => { sheet.classList.remove('show'); setTimeout(() => sheet.style.display = 'none', 300); }); };
document.querySelectorAll('.modal').forEach(m => m.onclick = (e) => { if (e.target === m) closeSheets(); });

// Avatar & Cropping
const handleAvatarChange = (e, previewId) => {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
            const dataUrl = event.target.result;
            currentAvatarBase64 = dataUrl;
            forceSetAvatar(previewId, dataUrl);
        };
        reader.readAsDataURL(file);
    }
};


document.getElementById('login-avatar-input').onchange = (e) => handleAvatarChange(e, 'login-avatar-preview');
document.getElementById('edit-avatar-input').onchange = (e) => handleAvatarChange(e, 'edit-avatar-preview');

// Load Contacts
async function loadContacts(query = '') {
    let contacts = await db.getContacts();
    let contactData = [];
    const lowerQuery = query.toLowerCase();

    for (const contact of contacts) {
        if (blacklist.includes(contact.mobile)) continue;
        if (query && !contact.name.toLowerCase().includes(lowerQuery) && !contact.mobile.includes(query)) continue;
        const messages = await db.getMessages(contact.mobile);
        const lastMsg = messages.length ? messages.sort((a, b) => b.timestamp - a.timestamp)[0] : null;
        contactData.push({ ...contact, lastMsg });
    }

    contactData.sort((a, b) => {
        const timeA = a.lastMsg ? a.lastMsg.timestamp : 0;
        const timeB = b.lastMsg ? b.lastMsg.timestamp : 0;
        if (timeB !== timeA) return timeB - timeA;
        return (unreadCounts[b.mobile] || 0) - (unreadCounts[a.mobile] || 0);
    });

    contactListEl.innerHTML = '';
    contactData.forEach(data => {
        const div = document.createElement('div');
        div.className = 'contact-item'; div.dataset.id = data.mobile;
        const unread = unreadCounts[data.mobile] || 0;
        const badge = unread > 0 ? `<div class="unread-badge">${unread}</div>` : '';
        let lastMsgTime = '';
        if (data.lastMsg) { lastMsgTime = new Date(data.lastMsg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }

        div.innerHTML = `
            <div class="avatar-container">
                <div class="avatar">
                    <img src="${data.avatar || DEFAULT_AVATAR}" loading="lazy">
                </div>
                <div class="status-dot ${onlinePeers.has(data.mobile) ? 'online' : ''}"></div>
            </div>
            <div class="contact-info">
                <span class="contact-name">${data.name}</span>
                <span class="contact-mobile-id">${data.mobile}</span>
            </div>
            <div class="contact-meta">
                <span class="contact-time">${lastMsgTime}</span>
                ${badge}
            </div>
        `;
        div.onclick = () => { unreadCounts[data.mobile] = 0; openChat(data); };
        contactListEl.appendChild(div);
        if (!onlinePeers.has(data.mobile)) peerManager.connect(data.mobile);
    });
}

// Action Handlers
document.getElementById('btn-add-contact').onclick = () => openSheet('sheet-add-contact');
document.getElementById('btn-show-blacklist').onclick = async () => {
    const container = document.getElementById('blacklist-container'); container.innerHTML = '';
    const allContacts = await db.getContacts();

    if (blacklist.length === 0) {
        container.innerHTML = `
            <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 40px 20px; color: var(--text-secondary); opacity: 0.7;">
                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="margin-bottom: 16px;">
                    <path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z"></path>
                    <path d="M12 8V12L14 14"></path>
                </svg>
                <span style="font-size: 14px; font-weight: 500;">No blocked contacts</span>
            </div>
        `;
    } else {
        blacklist.forEach(num => {
            const contact = allContacts.find(c => c.mobile === num) || { name: 'Unknown', mobile: num };
            const item = document.createElement('div'); item.className = 'blocked-item';
            item.innerHTML = `
                <div class="avatar" style="width:40px;height:40px;">
                    <img src="${contact.avatar || DEFAULT_AVATAR}">
                </div>
                <div class="blocked-info">
                    <span class="contact-name">${contact.name}</span>
                    <span class="contact-last-msg">${num}</span>
                </div>
                <button class="btn-unblock" title="Unblock">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 9.9-1"></path></svg>
                </button>`;
            item.querySelector('button').onclick = async () => { blacklist = blacklist.filter(n => n !== num); await db._put('settings', { id: 'blacklist', list: blacklist }); document.getElementById('btn-show-blacklist').click(); loadContacts(); };
            container.appendChild(item);
        });
    }
    openSheet('sheet-blacklist');
};

// Settings & Chat Menu
document.getElementById('btn-profile-header').onclick = () => {
    if (myProfile) {
        document.getElementById('edit-name-input').value = myProfile.name;
        document.getElementById('edit-mobile-display').textContent = myProfile.mobile;
        forceSetAvatar('edit-avatar-preview', myProfile.avatar);
        currentAvatarBase64 = myProfile.avatar;
    }
    openSheet('sheet-edit-profile');
};

document.getElementById('btn-save-profile').onclick = async () => {
    const newName = document.getElementById('edit-name-input').value.trim();
    if (newName && myProfile) {
        try {
            myProfile.name = newName;
            myProfile.avatar = currentAvatarBase64;

            await db.saveProfile(myProfile.mobile, myProfile.name, myProfile.avatar);

            // Critical: Update Global State and UI
            forceSetAvatar('my-avatar', myProfile.avatar);
            document.getElementById('my-name').textContent = myProfile.name;

            Object.keys(peerManager.connections).forEach(peerId => {
                peerManager.sendMessage(peerId, { type: 'profile_response', name: myProfile.name, avatar: myProfile.avatar });
            });

            closeSheets();
            loadContacts();
        } catch (err) { alert('Save Error: ' + err.message); }
    }
};

document.getElementById('btn-chat-rename').onclick = () => { openSheet('sheet-rename'); document.getElementById('rename-input').value = chatNameEl.textContent; };
document.getElementById('btn-chat-block').onclick = () => openSheet('sheet-confirm-block');
document.getElementById('btn-chat-clear').onclick = () => openSheet('sheet-confirm-clear');
document.getElementById('btn-chat-delete').onclick = () => openSheet('sheet-confirm-delete-contact');

// Message Actions (Copy & Forward & Delete)
document.getElementById('sheet-btn-copy').onclick = () => { if (currentSelectedMsg) { navigator.clipboard.writeText(currentSelectedMsg.type === 'text' ? currentSelectedMsg.content : `File: ${currentSelectedMsg.fileName}`); closeSheets(); } };
document.getElementById('sheet-btn-forward').onclick = async () => {
    if (!currentSelectedMsg) return;
    const container = document.getElementById('forward-contact-list'); container.innerHTML = '';
    const contacts = await db.getContacts();
    contacts.forEach(contact => {
        if (blacklist.includes(contact.mobile)) return;
        const item = document.createElement('div'); item.className = 'sheet-item';
        item.innerHTML = `
            <div class="avatar" style="width:36px;height:36px;">
                <img src="${contact.avatar || DEFAULT_AVATAR}">
            </div>
            <span style="flex:1; margin-left:12px;">${contact.name}</span>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"></polyline></svg>`;
        item.onclick = async () => { await forwardMessage(currentSelectedMsg, contact.mobile); closeSheets(); };
        container.appendChild(item);
    });
    closeSheets(); setTimeout(() => openSheet('sheet-forward'), 350);
};

async function forwardMessage(msg, targetPeerId) {
    const fMsg = { peerId: targetPeerId, from: myProfile.mobile, to: targetPeerId, type: msg.type, content: msg.content, file: msg.file, fileName: msg.fileName, fileType: msg.fileType, timestamp: Date.now(), isMine: true, status: 'pending' };
    const sent = peerManager.sendMessage(targetPeerId, { type: fMsg.type, timestamp: fMsg.timestamp, content: fMsg.content, file: fMsg.file, fileName: fMsg.fileName, fileType: fMsg.fileType });
    if (sent) fMsg.status = 'sent';
    await db.addMessage(fMsg);
    if (currentChatPeerId === targetPeerId) refreshMessages();
    loadContacts();
}

document.getElementById('sheet-btn-delete-msg').onclick = async () => { if (currentSelectedMsg) { await db.deleteMessage(currentSelectedMsg.id); refreshMessages(); closeSheets(); loadContacts(); } };

// Other Confirmation Handlers
document.getElementById('btn-block-confirm').onclick = async () => { if (currentChatPeerId) { blacklist.push(currentChatPeerId); await db._put('settings', { id: 'blacklist', list: blacklist }); loadContacts(); document.getElementById('btn-back').click(); closeSheets(); } };
document.getElementById('btn-save-rename').onclick = async () => { const newName = document.getElementById('rename-input').value.trim(); if (newName && currentChatPeerId) { await db.addContact(currentChatPeerId, newName); chatNameEl.textContent = newName; loadContacts(); closeSheets(); } };
document.getElementById('btn-clear-confirm').onclick = async () => { await db.clearChat(currentChatPeerId); refreshMessages(); closeSheets(); loadContacts(); };
document.getElementById('btn-delete-contact-confirm').onclick = async () => { await db.deleteContact(currentChatPeerId); loadContacts(); document.getElementById('btn-back').click(); closeSheets(); };
document.getElementById('btn-logout').onclick = () => { mainMenu.style.display = 'none'; openSheet('sheet-logout'); };
document.getElementById('btn-confirm-logout').onclick = async () => { await db.clearData(); location.reload(); };

// Messaging UI & Controls
document.getElementById('btn-send').onclick = () => { sendMessage('text'); msgInput.style.height = '40px'; };
msgInput.oninput = () => { msgInput.style.height = '40px'; msgInput.style.height = (msgInput.scrollHeight) + 'px'; };
msgInput.onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage('text'); msgInput.style.height = '40px'; } };
fileInput.onchange = () => { if (fileInput.files[0]) sendMessage('file', fileInput.files[0]); };
document.getElementById('contact-search').oninput = (e) => loadContacts(e.target.value);

async function sendMessage(type, file = null) {
    if (!currentChatPeerId) return;
    const content = type === 'text' ? msgInput.value.trim() : `Sent a file`;
    if (type === 'text' && !content) return;
    const sent = peerManager.sendMessage(currentChatPeerId, { type, timestamp: Date.now(), content, file, fileName: file?.name, fileType: file?.type });
    const sMsg = { peerId: currentChatPeerId, from: myProfile.mobile, to: currentChatPeerId, type, content, file, fileName: file?.name, fileType: file?.type, timestamp: Date.now(), isMine: true, status: sent ? 'sent' : 'pending' };
    await db.addMessage(sMsg);
    addDateSeparatorIfNeeded(sMsg.timestamp); appendMessageToUI(sMsg);
    msgInput.value = ''; fileInput.value = '';
    loadContacts();
}

async function openChat(contact, updateHash = true) {
    currentChatPeerId = contact.mobile; sidebarEl.classList.add('hidden'); chatAreaEl.classList.add('active');
    chatNameEl.textContent = contact.name;
    forceSetAvatar('header-avatar', contact.avatar);
    updateUIStatus(contact.mobile); refreshMessages(); unreadCounts[contact.mobile] = 0;
    peerManager.sendMessage(contact.mobile, { type: 'seen_ack' });
    if (updateHash) window.location.hash = contact.mobile;
    loadContacts();
}

window.addEventListener('hashchange', async () => {
    const hash = window.location.hash.substring(1);
    if (!hash) {
        if (currentChatPeerId) closeChatUI();
    } else {
        if (currentChatPeerId !== hash) {
            const contacts = await db.getContacts();
            const contact = contacts.find(c => c.mobile === hash);
            if (contact) openChat(contact, false);
            else {
                // If contact not found (e.g. initial reload with hash), could be a new peer
                // The network logic normally handles discovery, but for UI we at least show placeholder
                openChat({ mobile: hash, name: `User ${hash.slice(-4)}` }, false);
            }
        }
    }
});

async function refreshMessages() {
    chatMessages.innerHTML = ''; lastDateLabel = null;
    const messages = await db.getMessages(currentChatPeerId);
    messages.sort((a, b) => a.timestamp - b.timestamp).forEach(msg => { addDateSeparatorIfNeeded(msg.timestamp); appendMessageToUI(msg); });
}

function linkify(text) {
    const urlPattern = /(\b(https?|ftp|file):\/\/[-A-Z0-9+&@#\/%?=~_|!:,.;]*[-A-Z0-9+&@#\/%=~_|])/ig;
    return text.replace(urlPattern, '<a href="$1" target="_blank" rel="noopener noreferrer" class="chat-link">$1</a>');
}

function appendMessageToUI(msg) {
    const div = document.createElement('div'); div.className = `message ${msg.isMine ? 'sent' : 'received'}`;

    let content = msg.content;
    if (msg.type === 'file') {
        const url = URL.createObjectURL(new Blob([msg.file], { type: msg.fileType }));
        if (msg.fileType?.startsWith('image/')) content = `<img src="${url}" class="file-preview">`;
        else content = `<div class="file-card"><div class="file-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg></div><div style="flex:1;overflow:hidden;"><div style="font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${msg.fileName}</div><div style="font-size:10px;color:rgba(255,255,255,0.5);">${(msg.fileName.split('.').pop()).toUpperCase()} file</div></div></div>`;
    } else {
        content = linkify(content);
    }
    const timeStr = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    div.innerHTML = `
        <div class="msg-options-btn">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>
        </div>
        <div class="msg-content">${content}</div>
        <div class="time">${timeStr}${msg.isMine ? `<span class="msg-status-icon">${STATUS_ICONS[msg.status] || ''}</span>` : ''}</div>
    `;

    div.querySelector('.msg-options-btn').onclick = (e) => {
        e.stopPropagation();
        currentSelectedMsg = msg;
        openSheet('sheet-msg-actions');
    };

    chatMessages.appendChild(div); chatMessages.scrollTop = chatMessages.scrollHeight;
}

function getDateLabel(timestamp) { const d = new Date(timestamp), t = new Date(), y = new Date(); y.setDate(t.getDate() - 1); if (d.toDateString() === t.toDateString()) return 'Today'; if (d.toDateString() === y.toDateString()) return 'Yesterday'; return d.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' }); }
function addDateSeparatorIfNeeded(ts) { const l = getDateLabel(ts); if (l !== lastDateLabel) { const s = document.createElement('div'); s.className = 'date-separator'; s.innerHTML = `<span class="date-badge">${l}</span>`; chatMessages.appendChild(s); lastDateLabel = l; } }

// Auth
document.getElementById('btn-login').onclick = async () => {
    const el = document.getElementById('login-mobile');
    const m = el.value.trim(), n = document.getElementById('login-name').value.trim();
    el.classList.remove('validation-error');
    if (m && n) {
        if (!/^\d+$/.test(m) || m.length < 8) {
            el.classList.add('validation-error');
            return;
        }
        await db.saveProfile(m, n, currentAvatarBase64);
        myProfile = { mobile: m, name: n, avatar: currentAvatarBase64 };
        showMainApp(); initNetwork(m); loadContacts();
    }
};

document.getElementById('login-mobile').oninput = (e) => {
    e.target.value = e.target.value.replace(/[^0-9]/g, '');
    e.target.classList.remove('validation-error');
};
function showMainApp() {
    loginOverlay.style.display = 'none'; mainApp.style.display = 'block';
    if (myProfile) {
        document.getElementById('my-name').textContent = myProfile.name;
        document.getElementById('my-mobile').textContent = myProfile.mobile;
        forceSetAvatar('my-avatar', myProfile.avatar);
    }
}
document.getElementById('btn-save-contact').onclick = async () => { const m = document.getElementById('contact-mobile').value.trim(), n = document.getElementById('contact-name').value.trim(); if (m && n) { await db.addContact(m, n); loadContacts(); closeSheets(); } };

setInterval(async () => {
    const cs = await db.getContacts();
    cs.forEach(c => {
        if (!onlinePeers.has(c.mobile) && !blacklist.includes(c.mobile)) {
            peerManager.connect(c.mobile);
        }
    });
    // Request profile updates periodically to refresh online status
    onlinePeers.forEach(id => {
        if (!blacklist.includes(id)) peerManager.sendMessage(id, { type: 'profile_request' });
    });
}, 10000);
init();
