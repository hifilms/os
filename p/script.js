let db, peer, activeConnections = {}, currentChatId = null;

// Database Version 18 (Optimized)
const request = indexedDB.open("MessengerV18", 1);
request.onupgradeneeded = (e) => {
    let database = e.target.result;
    database.createObjectStore("friends", { keyPath: "phone" });
    database.createObjectStore("messages", { keyPath: "id", autoIncrement: true });
};
request.onsuccess = (e) => { 
    db = e.target.result; 
    checkAuth(); 
    checkStorageUsage(); // মেমোরি চেক করার জন্য
};

// মেমোরি কতটুকু ব্যবহার হচ্ছে তা দেখার ফাংশন
async function checkStorageUsage() {
    if (navigator.storage && navigator.storage.estimate) {
        const {usage, quota} = await navigator.storage.estimate();
        const usageInMB = (usage / (1024 * 1024)).toFixed(2);
        console.log(`Storage used: ${usageInMB} MB of ${(quota / (1024 * 1024 * 1024)).toFixed(2)} GB`);
    }
}

function checkAuth() {
    const user = JSON.parse(localStorage.getItem("me"));
    if (user) {
        document.getElementById("reg-screen").classList.add("hidden");
        document.getElementById("home-screen").classList.remove("hidden");
        document.getElementById("my-name-display").innerText = user.name;
        document.getElementById("my-phone-display").innerText = user.phone;
        initPeer(user.phone);
        loadFriends();
    }
}

function initPeer(id) {
    peer = new Peer(id);
    peer.on('connection', (conn) => { setupConn(conn); });
    setInterval(() => {
        if (peer && !peer.disconnected) attemptBackgroundSync();
    }, 5000); 
}

function attemptBackgroundSync() {
    const tx = db.transaction("friends", "readonly");
    tx.objectStore("friends").openCursor().onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
            const phone = cursor.value.phone;
            if (!activeConnections[phone] || !activeConnections[phone].open) {
                setupConn(peer.connect(phone));
            }
            cursor.continue();
        }
    };
}

function setupConn(conn) {
    if(activeConnections[conn.peer]) activeConnections[conn.peer].close();
    activeConnections[conn.peer] = conn;

    conn.on('open', () => {
        if (currentChatId === conn.peer) {
            document.getElementById("chat-with-status").innerText = "Online";
            sendReadReceipt(conn.peer);
        }
        loadFriends();
        sendPendingMessages(conn);
    });

    conn.on('data', async (data) => {
        if (data.type === "read-receipt") {
            updateMessageStatusToSeen(conn.peer);
            return;
        }

        await autoAddFriend(conn.peer);
        const msg = { 
            senderId: conn.peer, 
            receiverId: peer.id, 
            text: data.text || "", 
            file: data.file || null, 
            fileName: data.fileName || null, 
            timestamp: data.timestamp || Date.now(), 
            status: "received" 
        };
        const tx = db.transaction(["messages", "friends"], "readwrite");
        tx.objectStore("messages").add(msg);
        tx.objectStore("friends").get(conn.peer).onsuccess = (ev) => {
            let f = ev.target.result;
            if(f) { 
                f.lastTime = Date.now(); 
                if(currentChatId !== conn.peer) f.unreadCount = (f.unreadCount || 0) + 1; 
                tx.objectStore("friends").put(f); 
            }
        };
        tx.oncomplete = () => { 
            if (currentChatId === conn.peer) {
                renderChat();
                sendReadReceipt(conn.peer);
            }
            loadFriends(); 
        };
    });

    conn.on('close', () => {
        delete activeConnections[conn.peer];
        if (currentChatId === conn.peer) document.getElementById("chat-with-status").innerText = "Offline";
        loadFriends();
    });
}

function sendReadReceipt(targetPhone) {
    const conn = activeConnections[targetPhone];
    if (conn && conn.open) {
        conn.send({ type: "read-receipt" });
    }
}

function updateMessageStatusToSeen(phone) {
    const tx = db.transaction("messages", "readwrite");
    const store = tx.objectStore("messages");
    store.openCursor().onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
            const m = cursor.value;
            if (m.receiverId === phone && m.status === "sent") {
                m.status = "seen";
                store.put(m);
            }
            cursor.continue();
        } else {
            if (currentChatId === phone) renderChat();
        }
    };
}

function sendTextMessage() {
    const input = document.getElementById("msg-input");
    const text = input.value.trim();
    if (!text || !currentChatId) return;
    let status = "pending";
    const timestamp = Date.now();
    if (activeConnections[currentChatId] && activeConnections[currentChatId].open) {
        activeConnections[currentChatId].send({ text, timestamp });
        status = "sent";
    }
    saveAndRenderMsg({ text, status, timestamp });
    input.value = "";
}

function sendFile(input) {
    const file = input.files[0];
    if (!file || !currentChatId) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        const msgData = { text: "📁 " + file.name, file: e.target.result, fileName: file.name, timestamp: Date.now() };
        let status = "pending";
        if (activeConnections[currentChatId] && activeConnections[currentChatId].open) {
            activeConnections[currentChatId].send(msgData);
            status = "sent";
        }
        saveAndRenderMsg({ ...msgData, status });
    };
    reader.readAsDataURL(file);
}

function renderChat() {
    const area = document.getElementById("chat-messages");
    area.innerHTML = "";
    let msgs = [];
    db.transaction("messages", "readonly").objectStore("messages").openCursor().onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
            const m = cursor.value;
            if (m.senderId === currentChatId || m.receiverId === currentChatId) msgs.push(m);
            cursor.continue();
        } else {
            msgs.sort((a,b) => a.timestamp - b.timestamp);
            let lastDate = null;
            msgs.forEach(m => {
                const msgDate = new Date(m.timestamp).toDateString();
                if (msgDate !== lastDate) {
                    const dateDiv = document.createElement("div");
                    dateDiv.className = "date-separator";
                    const today = new Date().toDateString();
                    const yesterday = new Date(Date.now() - 86400000).toDateString();
                    let dateLabel = new Date(m.timestamp).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
                    if (msgDate === today) dateLabel = "Today";
                    else if (msgDate === yesterday) dateLabel = "Yesterday";
                    dateDiv.innerHTML = `<span>${dateLabel}</span>`;
                    area.appendChild(dateDiv);
                    lastDate = msgDate;
                }
                const div = document.createElement("div");
                div.className = `msg ${m.senderId === peer.id ? 'sent' : 'received'}`;
                const time = new Date(m.timestamp).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
                let content = m.file ? `<a href="${m.file}" download="${m.fileName}" style="color:inherit; font-weight:bold;">📁 ${m.fileName}</a>` : m.text;
                let statusMark = "";
                if (m.senderId === peer.id) {
                    if (m.status === "pending") statusMark = " ⏳";
                    else if (m.status === "sent") statusMark = " ✓";
                    else if (m.status === "seen") statusMark = " ✓✓";
                }
                div.innerHTML = `${content} <span class="msg-time">${time}${statusMark}</span>`;
                area.appendChild(div);
            });
            area.scrollTop = area.scrollHeight;
        }
    };
}

function loadFriends() {
    const list = document.getElementById("friend-list");
    list.innerHTML = "";
    db.transaction("friends", "readonly").objectStore("friends").openCursor().onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
            const f = cursor.value;
            const isOnline = (activeConnections[f.phone] && activeConnections[f.phone].open);
            const time = f.lastTime ? new Date(f.lastTime).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : "";
            const displayName = (f.name === f.phone) ? "Unknown" : f.name;
            const div = document.createElement("div");
            div.className = "friend-item";
            div.onclick = () => openChat(f.phone, f.name);
            div.innerHTML = `
                <div class="avatar-circle">${displayName[0].toUpperCase()}</div>
                <div class="friend-info">
                    <strong><span class="status-dot ${isOnline?'online-dot':'offline-dot'}"></span>${displayName}</strong>
                    <br><small>${f.phone}</small>
                </div>
                <div style="text-align: right; flex: 1;">
                    <div style="font-size: 10px; color: #999;">${time}</div>
                    ${f.unreadCount > 0 ? `<span style="background:#25d366; color:white; border-radius:10px; padding:2px 7px; font-size:11px;">${f.unreadCount}</span>` : ''}
                </div>`;
            list.appendChild(div);
            cursor.continue();
        }
    };
}

function openChat(phone, name) {
    currentChatId = phone;
    document.getElementById("home-screen").classList.add("hidden");
    document.getElementById("chat-screen").classList.remove("hidden");
    const displayName = (name === phone) ? "Unknown" : name;
    document.getElementById("chat-with-name").innerText = displayName;
    document.getElementById("friend-initial").innerText = displayName[0].toUpperCase();
    const isOnline = (activeConnections[phone] && activeConnections[phone].open);
    document.getElementById("chat-with-status").innerText = isOnline ? "Online" : "Offline";
    
    const tx = db.transaction("friends", "readwrite");
    tx.objectStore("friends").get(phone).onsuccess = (e) => {
        if(e.target.result) { e.target.result.unreadCount = 0; tx.objectStore("friends").put(e.target.result); }
    };
    tx.oncomplete = () => { 
        loadFriends(); 
        renderChat(); 
        sendReadReceipt(phone);
    };
    if (!isOnline) setupConn(peer.connect(phone));
}

function showAddSheet(isEdit = false) {
    const sheet = document.getElementById("add-sheet");
    const nameInp = document.getElementById("new-friend-name");
    const phoneInp = document.getElementById("new-friend-phone");
    const title = document.getElementById("sheet-title");

    if (isEdit && currentChatId) {
        title.innerText = "Edit Profile";
        db.transaction("friends", "readonly").objectStore("friends").get(currentChatId).onsuccess = (e) => {
            const f = e.target.result;
            nameInp.value = (f.name === f.phone) ? "Unknown" : f.name;
            phoneInp.value = f.phone;
            phoneInp.disabled = true;
        };
    } else {
        title.innerText = "Add New Friend";
        nameInp.value = ""; phoneInp.value = ""; phoneInp.disabled = false;
    }
    sheet.classList.remove("hidden");
    setTimeout(()=>sheet.classList.add("active"), 10);
}

function deleteFriend() {
    if(confirm("Are you sure you want to delete this friend?")) {
        const tx = db.transaction(["friends", "messages"], "readwrite");
        tx.objectStore("friends").delete(currentChatId);
        const msgStore = tx.objectStore("messages");
        msgStore.openCursor().onsuccess = (e) => {
            const cursor = e.target.result;
            if (cursor) {
                if (cursor.value.senderId === currentChatId || cursor.value.receiverId === currentChatId) msgStore.delete(cursor.key);
                cursor.continue();
            }
        };
        tx.oncomplete = () => { checkStorageUsage(); showHome(); };
    }
}

async function autoAddFriend(phone) {
    return new Promise(r => {
        const tx = db.transaction("friends", "readwrite");
        const store = tx.objectStore("friends");
        store.get(phone).onsuccess = (e) => {
            if (!e.target.result) { 
                store.add({ name: phone, phone, unreadCount: 0, lastTime: Date.now() }); 
                tx.oncomplete = () => { loadFriends(); r(); }; 
            } else r();
        };
    });
}

function saveAndRenderMsg(data) {
    const msg = { senderId: peer.id, receiverId: currentChatId, ...data };
    const tx = db.transaction(["messages", "friends"], "readwrite");
    tx.objectStore("messages").add(msg);
    tx.objectStore("friends").get(currentChatId).onsuccess = (e) => {
        let f = e.target.result;
        if(f) { f.lastTime = Date.now(); tx.objectStore("friends").put(f); }
    };
    tx.oncomplete = () => { renderChat(); loadFriends(); checkStorageUsage(); };
}

function sendPendingMessages(conn) {
    const tx = db.transaction("messages", "readwrite");
    const store = tx.objectStore("messages");
    store.openCursor().onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
            const m = cursor.value;
            if (m.receiverId === conn.peer && m.status === "pending") {
                conn.send({ text: m.text, file: m.file, fileName: m.fileName, timestamp: m.timestamp });
                m.status = "sent"; store.put(m);
            }
            cursor.continue();
        }
    };
}

function showHome() { document.getElementById("chat-screen").classList.add("hidden"); document.getElementById("home-screen").classList.remove("hidden"); currentChatId = null; loadFriends(); }
function toggleMenu(id, event) { event.stopPropagation(); document.getElementById(id).classList.toggle("hidden"); }
window.onclick = (e) => { if (!e.target.closest('.icon-btn')) document.querySelectorAll('.menu-content').forEach(m => m.classList.add("hidden")); };
function hideAddSheet() { document.getElementById("add-sheet").classList.remove("active"); setTimeout(()=>document.getElementById("add-sheet").classList.add("hidden"),300); }

function saveFriend() {
    const name = document.getElementById("new-friend-name").value.trim();
    const phone = document.getElementById("new-friend-phone").value.trim();
    if (phone.length < 7 || phone.length > 15 || isNaN(phone)) {
        alert("Please enter a valid mobile number (7-15 digits)");
        return;
    }
    if (name && phone) {
        const tx = db.transaction("friends", "readwrite");
        tx.objectStore("friends").put({ name, phone, unreadCount: 0, lastTime: Date.now() });
        tx.oncomplete = () => { hideAddSheet(); loadFriends(); };
    }
}

// Optimized Clear Chat
function clearChat() {
    if(!confirm("Do you want to clear all chat messages? This will free up storage.")) return;
    const tx = db.transaction("messages", "readwrite");
    const store = tx.objectStore("messages");
    store.openCursor().onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
            if (cursor.value.senderId === currentChatId || cursor.value.receiverId === currentChatId) store.delete(cursor.key);
            cursor.continue();
        } else {
            renderChat();
            checkStorageUsage(); // ক্লিনআপের পর মেমোরি চেক
        }
    };
}

function registerUser() {
    const name = document.getElementById("user-name").value.trim();
    const phone = document.getElementById("user-phone").value.trim();
    if (phone.length < 7 || phone.length > 15 || isNaN(phone)) {
        alert("Please enter a valid mobile number (7-15 digits)");
        return;
    }
    if (name && phone) { localStorage.setItem("me", JSON.stringify({ name, phone })); location.reload(); }
}

function logout() {
    if (confirm("Are you sure you want to log out? Your session will be ended.")) {
        localStorage.clear();
        location.reload();
    }
}

function clearAllData() {
    if (confirm("WARNING: This will delete ALL data permanently. Freeing up all storage. Proceed?")) {
        indexedDB.deleteDatabase("MessengerV18");
        localStorage.clear();
        location.reload();
    }
}