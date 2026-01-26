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

const STATUS_ICONS = {
    pending: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>',
    sent: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>',
    seen: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#34B7F1" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>'
};

// Initialize
async function init() {
    try {
        await db.open();
        myProfile = await db.getProfile();
        const storedBlacklist = await db._get('settings', 'blacklist');
        if (storedBlacklist) blacklist = storedBlacklist.list || [];

        // Theme Init
        const storedTheme = await db._get('settings', 'theme');
        const theme = storedTheme ? storedTheme.value : 'light';
        setTheme(theme);

        if (myProfile) {
            showMainApp();
            initNetwork(myProfile.mobile);
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
        // Show the OPPOSITE theme name on the button (the one you'll switch to)
        btn.textContent = theme === 'light' ? 'Dark Mode' : 'Light Mode';
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

function initNetwork(id) {
    peerManager.init(id, (peerId) => {
        console.log('Peer ready:', peerId);
    }, (peerId, status) => {
        if (blacklist.includes(peerId)) return;
        if (status === 'online') onlinePeers.add(peerId);
        else onlinePeers.delete(peerId);
        updateUIStatus(peerId);
    }, (peerId) => {
        return blacklist.includes(peerId);
    });

    peerManager.onMessage(async (data, fromPeerId) => {
        if (blacklist.includes(fromPeerId)) return;

        if (data.type === 'seen_ack') {
            const msgs = await db.getMessages(fromPeerId);
            for (const m of msgs) {
                if (m.isMine && m.status !== 'seen') {
                    await db.updateMessageStatus(m.id, 'seen');
                }
            }
            if (currentChatPeerId === fromPeerId) refreshMessages();
            return;
        }

        let contacts = await db.getContacts();
        let contact = contacts.find(c => c.mobile === fromPeerId);
        if (!contact) {
            contact = { mobile: fromPeerId, name: `User ${fromPeerId.slice(-4)}` };
            await db.addContact(contact.mobile, contact.name);
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
            loadContacts();
        }
    });
}

function updateUIStatus(peerId) {
    if (currentChatPeerId === peerId) {
        chatStatusEl.textContent = onlinePeers.has(peerId) ? 'online' : 'offline';
        chatStatusEl.className = 'chat-status ' + (onlinePeers.has(peerId) ? 'online' : 'offline');
    }
    const dot = document.querySelector(`.contact-item[data-id="${peerId}"] .status-dot`);
    if (dot) dot.className = 'status-dot ' + (onlinePeers.has(peerId) ? 'online' : '');
}

// Global Nav
document.getElementById('btn-back').onclick = () => {
    chatAreaEl.classList.remove('active');
    sidebarEl.classList.remove('hidden');
    currentChatPeerId = null;
    loadContacts();
};

// Menu Togglers
document.getElementById('btn-main-menu').onclick = (e) => { e.stopPropagation(); mainMenu.style.display = mainMenu.style.display === 'flex' ? 'none' : 'flex'; };
document.getElementById('btn-chat-menu').onclick = (e) => { e.stopPropagation(); chatMenu.style.display = chatMenu.style.display === 'flex' ? 'none' : 'flex'; };
window.onclick = () => { mainMenu.style.display = 'none'; chatMenu.style.display = 'none'; };

// Bottom Sheet Helpers
const openSheet = (id) => {
    const sheet = document.getElementById(id);
    sheet.style.display = 'flex';
    setTimeout(() => sheet.classList.add('show'), 10);
};

window.closeSheets = () => {
    document.querySelectorAll('.modal').forEach(sheet => {
        sheet.classList.remove('show');
        setTimeout(() => sheet.style.display = 'none', 300);
    });
};
document.querySelectorAll('.modal').forEach(m => m.onclick = (e) => { if (e.target === m) closeSheets(); });

// Load Contacts
async function loadContacts() {
    let contacts = await db.getContacts();
    const contactData = [];

    for (const contact of contacts) {
        if (blacklist.includes(contact.mobile)) continue;
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
        div.className = 'contact-item';
        div.dataset.id = data.mobile;
        const unread = unreadCounts[data.mobile] || 0;
        const badge = unread > 0 ? `<div class="unread-badge">${unread}</div>` : '';

        let lastMsgTime = '';
        if (data.lastMsg) {
            const date = new Date(data.lastMsg.timestamp);
            lastMsgTime = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }

        div.innerHTML = `
            <div class="avatar-container">
                <div class="avatar"></div>
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
        div.onclick = () => {
            unreadCounts[data.mobile] = 0;
            openChat(data);
        };
        contactListEl.appendChild(div);
        if (!onlinePeers.has(data.mobile)) peerManager.connect(data.mobile);
    });
}

// Action Handlers
document.getElementById('btn-add-contact').onclick = () => openSheet('sheet-add-contact');

// Blacklist UI
document.getElementById('btn-show-blacklist').onclick = async () => {
    const container = document.getElementById('blacklist-container');
    container.innerHTML = '';
    if (blacklist.length === 0) {
        container.innerHTML = `<div style="padding:40px 20px; text-align:center;"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#3b4a54" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg><p style="color:var(--text-secondary);font-size:14px;margin-top:10px;">No blocked contacts</p></div>`;
    } else {
        const allContacts = await db.getContacts();
        blacklist.forEach(num => {
            const contact = allContacts.find(c => c.mobile === num) || { name: 'Unknown', mobile: num };
            const item = document.createElement('div');
            item.className = 'blocked-item';
            item.innerHTML = `
                <div class="avatar" style="width:40px;height:40px;"></div>
                <div class="blocked-info">
                    <span class="contact-name">${contact.name}</span>
                    <span class="contact-last-msg">${num}</span>
                </div>
                <button class="btn-unblock" title="Unblock">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 9.9-1"></path></svg>
                </button>`;
            item.querySelector('button').onclick = async () => {
                blacklist = blacklist.filter(n => n !== num);
                await db._put('settings', { id: 'blacklist', list: blacklist });
                document.getElementById('btn-show-blacklist').click();
                loadContacts();
            };
            container.appendChild(item);
        });
    }
    openSheet('sheet-blacklist');
};

// Chat Menu Actions
document.getElementById('btn-chat-rename').onclick = () => { openSheet('sheet-rename'); document.getElementById('rename-input').value = chatNameEl.textContent; };
document.getElementById('btn-chat-block').onclick = () => openSheet('sheet-confirm-block');
document.getElementById('btn-chat-clear').onclick = () => openSheet('sheet-confirm-clear');
document.getElementById('btn-chat-delete').onclick = () => openSheet('sheet-confirm-delete-contact');

// Message Actions (Copy & Forward)
document.getElementById('sheet-btn-copy').onclick = () => {
    if (currentSelectedMsg) {
        const text = currentSelectedMsg.type === 'text' ? currentSelectedMsg.content : `File: ${currentSelectedMsg.fileName}`;
        navigator.clipboard.writeText(text);
        closeSheets();
    }
};

document.getElementById('sheet-btn-forward').onclick = async () => {
    if (!currentSelectedMsg) return;
    const container = document.getElementById('forward-contact-list');
    container.innerHTML = '';
    const contacts = await db.getContacts();

    contacts.forEach(contact => {
        if (blacklist.includes(contact.mobile)) return;
        const item = document.createElement('div');
        item.className = 'sheet-item';
        item.innerHTML = `<div class="avatar" style="width:36px;height:36px;"></div><span style="flex:1;">${contact.name}</span><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"></polyline></svg>`;
        item.onclick = async () => {
            await forwardMessage(currentSelectedMsg, contact.mobile);
            closeSheets();
        };
        container.appendChild(item);
    });

    closeSheets();
    setTimeout(() => openSheet('sheet-forward'), 350);
};

async function forwardMessage(msg, targetPeerId) {
    const forwardedMsg = {
        peerId: targetPeerId, from: myProfile.mobile, to: targetPeerId,
        type: msg.type, content: msg.content, file: msg.file,
        fileName: msg.fileName, fileType: msg.fileType,
        timestamp: Date.now(), isMine: true, status: 'pending'
    };

    const sent = peerManager.sendMessage(targetPeerId, {
        type: forwardedMsg.type, timestamp: forwardedMsg.timestamp, content: forwardedMsg.content,
        file: forwardedMsg.file, fileName: forwardedMsg.fileName, fileType: forwardedMsg.fileType
    });

    if (sent) forwardedMsg.status = 'sent';
    await db.addMessage(forwardedMsg);
    if (currentChatPeerId === targetPeerId) refreshMessages();
}

// Confirmation Handlers
document.getElementById('btn-block-confirm').onclick = async () => { if (currentChatPeerId) { blacklist.push(currentChatPeerId); await db._put('settings', { id: 'blacklist', list: blacklist }); loadContacts(); document.getElementById('btn-back').click(); closeSheets(); } };
document.getElementById('btn-save-rename').onclick = async () => { const newName = document.getElementById('rename-input').value.trim(); if (newName && currentChatPeerId) { await db.addContact(currentChatPeerId, newName); chatNameEl.textContent = newName; loadContacts(); closeSheets(); } };
document.getElementById('btn-clear-confirm').onclick = async () => { await db.clearChat(currentChatPeerId); refreshMessages(); closeSheets(); };
document.getElementById('btn-delete-contact-confirm').onclick = async () => { await db.deleteContact(currentChatPeerId); loadContacts(); document.getElementById('btn-back').click(); closeSheets(); };
document.getElementById('btn-logout').onclick = () => { mainMenu.style.display = 'none'; openSheet('sheet-logout'); };
document.getElementById('btn-confirm-logout').onclick = async () => { await db.clearData(); location.reload(); };

// Messaging
document.getElementById('btn-send').onclick = () => { sendMessage('text'); msgInput.style.height = '40px'; };
msgInput.oninput = () => { msgInput.style.height = '40px'; msgInput.style.height = (msgInput.scrollHeight) + 'px'; };
msgInput.onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage('text'); msgInput.style.height = '40px'; } };
fileInput.onchange = () => { if (fileInput.files[0]) sendMessage('file', fileInput.files[0]); };

function addDateSeparatorIfNeeded(timestamp) {
    const label = getDateLabel(timestamp);
    if (label !== lastDateLabel) {
        const separator = document.createElement('div');
        separator.className = 'date-separator';
        separator.innerHTML = `<span class="date-badge">${label}</span>`;
        chatMessages.appendChild(separator);
        lastDateLabel = label;
    }
}

async function sendMessage(type, file = null) {
    if (!currentChatPeerId) return;
    const content = type === 'text' ? msgInput.value.trim() : `Sent a file`;
    if (type === 'text' && !content) return;
    const sent = peerManager.sendMessage(currentChatPeerId, { type, timestamp: Date.now(), content, file, fileName: file?.name, fileType: file?.type });
    const savedMsg = { peerId: currentChatPeerId, from: myProfile.mobile, to: currentChatPeerId, type, content, file, fileName: file?.name, fileType: file?.type, timestamp: Date.now(), isMine: true, status: sent ? 'sent' : 'pending' };
    const id = await db.addMessage(savedMsg);
    savedMsg.id = id;
    addDateSeparatorIfNeeded(savedMsg.timestamp);
    appendMessageToUI(savedMsg);
    msgInput.value = ''; fileInput.value = '';
}

async function openChat(contact) {
    currentChatPeerId = contact.mobile;
    sidebarEl.classList.add('hidden'); chatAreaEl.classList.add('active');
    chatNameEl.textContent = contact.name;
    updateUIStatus(contact.mobile); refreshMessages();
    unreadCounts[contact.mobile] = 0;
    peerManager.sendMessage(contact.mobile, { type: 'seen_ack' });
}

async function refreshMessages() {
    chatMessages.innerHTML = '';
    lastDateLabel = null;
    const messages = await db.getMessages(currentChatPeerId);
    messages.sort((a, b) => a.timestamp - b.timestamp);

    messages.forEach(msg => {
        addDateSeparatorIfNeeded(msg.timestamp);
        appendMessageToUI(msg);
    });
}

function getDateLabel(timestamp) {
    const date = new Date(timestamp);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);

    if (date.toDateString() === today.toDateString()) return 'Today';
    if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';

    return date.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
}

document.getElementById('sheet-btn-delete-msg').onclick = async () => { if (currentSelectedMsg) { await db.deleteMessage(currentSelectedMsg.id); refreshMessages(); closeSheets(); } };

function appendMessageToUI(msg) {
    const div = document.createElement('div');
    div.className = `message ${msg.isMine ? 'sent' : 'received'}`;
    div.onclick = () => { currentSelectedMsg = msg; openSheet('sheet-msg-actions'); };

    let content = msg.content;
    if (msg.type === 'file') {
        const url = URL.createObjectURL(new Blob([msg.file], { type: msg.fileType }));
        if (msg.fileType?.startsWith('image/')) {
            content = `<img src="${url}" class="file-preview">`;
        } else {
            const ext = msg.fileName.split('.').pop();
            content = `<div class="file-card"><div class="file-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg></div><div style="flex:1;overflow:hidden;"><div style="font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${msg.fileName}</div><div style="font-size:10px;color:rgba(255,255,255,0.5);">${ext.toUpperCase()} file</div></div></div>`;
        }
    }

    const timeStr = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const statusIcon = msg.isMine ? `<span class="msg-status-icon">${STATUS_ICONS[msg.status] || ''}</span>` : '';

    div.innerHTML = `
        <div class="msg-content">${content}</div>
        <div class="time">${timeStr}${statusIcon}</div>
    `;

    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Global Auth
document.getElementById('btn-login').onclick = async () => { const mobile = document.getElementById('login-mobile').value.trim(); const name = document.getElementById('login-name').value.trim(); if (mobile && name) { await db.saveProfile(mobile, name); myProfile = { mobile, name }; showMainApp(); initNetwork(mobile); loadContacts(); } };
function showMainApp() {
    loginOverlay.style.display = 'none'; mainApp.style.display = 'block';
    document.getElementById('my-name').textContent = myProfile.name;
    document.getElementById('my-mobile').textContent = myProfile.mobile;
}
document.getElementById('btn-save-contact').onclick = async () => { const mobile = document.getElementById('contact-mobile').value.trim(); const name = document.getElementById('contact-name').value.trim(); if (mobile && name) { await db.addContact(mobile, name); loadContacts(); closeSheets(); } };
setInterval(async () => { const contacts = await db.getContacts(); contacts.forEach(c => { if (!onlinePeers.has(c.mobile) && !blacklist.includes(c.mobile)) peerManager.connect(c.mobile); }); }, 10000);
init();
