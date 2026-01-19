// UI Elements
const launchScreen = document.getElementById('launch-screen');
const homeScreen = document.getElementById('home-screen');
const bottomSheet = document.getElementById('bottom-sheet');
const overlay = document.getElementById('bottom-sheet-overlay');
const sheetContent = document.getElementById('sheet-content');

// অ্যাপ শুরু হওয়ার লজিক
window.addEventListener('load', async () => {
    await initDB();
    const myProfile = JSON.parse(localStorage.getItem('myProfile'));
    if (myProfile) {
        showHomeScreen(myProfile);
    } else {
        launchScreen.classList.add('active');
    }
    renderContacts();
});

// প্রোফাইল সেভ করা (প্রথমবার)
document.getElementById('save-profile-btn').addEventListener('click', () => {
    const name = document.getElementById('user-name-input').value;
    const number = document.getElementById('user-phone-input').value;
    if (name && number) {
        const profile = { name, number };
        localStorage.setItem('myProfile', JSON.stringify(profile));
        showHomeScreen(profile);
    }
});

function showHomeScreen(profile) {
    launchScreen.classList.remove('active');
    homeScreen.classList.add('active');
    document.getElementById('display-name').innerText = profile.name;
    document.getElementById('display-number').innerText = profile.number;
}

// বটম শিট ওপেন করা
function openBottomSheet(type, data = {}) {
    overlay.style.display = 'block';
    bottomSheet.classList.add('show');
    
    if (type === 'add') {
        sheetContent.innerHTML = `
            <h3>নতুন কন্টাক্ট</h3>
            <input type="text" id="new-name" placeholder="নাম">
            <input type="number" id="new-number" placeholder="মোবাইল নাম্বার">
            <button onclick="addNewContact()">সেভ করুন</button>
            <button class="cancel-btn" onclick="closeBottomSheet()">ক্যানসেল</button>
        `;
    } else if (type === 'settings') {
        const myProfile = JSON.parse(localStorage.getItem('myProfile'));
        sheetContent.innerHTML = `
            <h3>প্রোফাইল সেটিংস</h3>
            <p>নাম: <input type="text" id="edit-my-name" value="${myProfile.name}"></p>
            <p>নাম্বার: ${myProfile.number} (পরিবর্তনযোগ্য নয়)</p>
            <button onclick="updateMyProfile()">সেভ</button>
            <button onclick="logout()">লগআউট</button>
            <button onclick="closeBottomSheet()">বন্ধ করুন</button>
        `;
    }
}

function closeBottomSheet() {
    overlay.style.display = 'none';
    bottomSheet.classList.remove('show');
}

overlay.addEventListener('click', closeBottomSheet);
document.getElementById('add-contact-btn').addEventListener('click', () => openBottomSheet('add'));
document.getElementById('main-settings-btn').addEventListener('click', () => openBottomSheet('settings'));

// ট্যাব ফিল্টারিং
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        document.querySelector('.tab-btn.active').classList.remove('active');
        e.target.classList.add('active');
        renderContacts(e.target.dataset.tab);
    });
});

async function renderContacts(filter = 'all') {
    const list = document.getElementById('contact-list');
    const contacts = await getContacts();
    list.innerHTML = '';
    
    contacts.filter(c => c.status === filter).forEach(c => {
        const item = document.createElement('div');
        item.className = 'contact-item';
        item.innerHTML = `
            <div class="contact-info" onclick="startCall('${c.number}', '${c.name}')">
                <div class="avatar">${c.name[0]}<div class="status-dot" id="dot-${c.number}"></div></div>
                <div>
                    <h4>${c.name}</h4>
                    <p>${c.number}</p>
                </div>
            </div>
            <div onclick="openContactOptions('${c.number}')">⋮</div>
        `;
        list.appendChild(item);
    });
}