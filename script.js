// ১. ঘড়ি এবং তারিখ ফাংশন
function startClock() {
    const clock = document.getElementById('clock');
    const dateDisp = document.getElementById('date');
    setInterval(() => {
        const now = new Date();
        clock.innerText = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }).toUpperCase();
        dateDisp.innerText = now.toLocaleDateString('en-IN');
    }, 1000);
}

// ২. ওয়ালপেপার লোড
function loadSavedSettings() {
    const savedWallpaper = localStorage.getItem('os-wallpaper');
    if (savedWallpaper) {
        document.getElementById('desktop').style.backgroundImage = `url('${savedWallpaper}')`;
    }
}

// ৩. হোম বাটন
function goToHome() {
    document.querySelectorAll('.window').forEach(w => w.classList.remove('active-win'));
    document.querySelectorAll('.task-item').forEach(t => t.classList.remove('active'));
}

// ৪. অ্যাপ লঞ্চ (iframe ব্যবহার করে)
function launchApp(id, name, icon) {
    const windowContainer = document.getElementById('window-container');
    const runningApps = document.getElementById('running-apps');

    if (!document.getElementById(`win-${id}`)) {
        const win = document.createElement('div');
        win.id = `win-${id}`;
        win.className = 'window'; 
        win.innerHTML = `
            <div class="window-content" style="padding:0; overflow:hidden; height:100%;">
                <iframe src="apps/${id}/index.html" 
                        style="width:100%; height:100%; border:none;" 
                        title="${name}">
                </iframe>
            </div>
        `;
        windowContainer.appendChild(win);

        const taskTab = document.createElement('div');
        taskTab.id = `tab-${id}`;
        taskTab.className = 'task-item';
        taskTab.onclick = () => focusApp(id);
        taskTab.innerHTML = `
            <img src="${icon}">
            <span class="task-text">${name}</span>
            <div class="task-close" onclick="event.stopPropagation(); closeApp('${id}')">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
            </div>
        `;
        runningApps.appendChild(taskTab);
    }
    focusApp(id);
}

function focusApp(id) {
    document.querySelectorAll('.window').forEach(w => w.classList.remove('active-win'));
    document.querySelectorAll('.task-item').forEach(t => t.classList.remove('active'));
    const targetWin = document.getElementById(`win-${id}`);
    const targetTab = document.getElementById(`tab-${id}`);
    if (targetWin) targetWin.classList.add('active-win');
    if (targetTab) targetTab.classList.add('active');
}

function closeApp(id) {
    const win = document.getElementById(`win-${id}`);
    const tab = document.getElementById(`tab-${id}`);
    if (win) win.remove();
    if (tab) tab.remove();
}

// ৫. আইকন তৈরি করার কমন ফাংশন
function createDesktopIcon(app) {
    const grid = document.getElementById('app-grid');
    const div = document.createElement('div');
    div.className = 'desktop-app';
    div.onclick = () => launchApp(app.id, app.name, app.icon);
    div.innerHTML = `
        <div class="app-icon-container"><img src="${app.icon}"></div>
        <span class="app-label">${app.name}</span>
    `;
    grid.appendChild(div);
}

// ৬. ওএস বুট লজিক (সংশোধিত)
async function initOS() {

    
    
const savedWallpaper = localStorage.getItem('os_wallpaper');
    if (savedWallpaper) {
        const desktop = document.getElementById('desktop');
        if(desktop) desktop.style.backgroundImage = `url('${savedWallpaper}')`;
    }

    
    console.log("OS Initializing...");
    const grid = document.getElementById('app-grid');
    
    if(!grid) return;
    
    grid.innerHTML = ''; // গ্রিড খালি করা

    try {
        // ১. আগে apps.json থেকে সিস্টেম অ্যাপগুলো লোড করা
        const response = await fetch('apps.json');
        const data = await response.json();
        if(data.system_apps) {
            data.system_apps.forEach(app => createDesktopIcon(app));
        }

        // ২. এরপর IndexedDB থেকে ইন্সটল করা অ্যাপগুলো লোড করা
        if (typeof getInstalledApps === "function") {
            const installedApps = await getInstalledApps();
            installedApps.forEach(app => createDesktopIcon(app));
        }
    } catch (e) {
        console.error("OS Boot Error:", e);
    }
}



const taskbar = document.getElementById('taskbar');
const trigger = document.getElementById('mouse-trigger');
let hideTimeout;

function showTaskbar() {
    taskbar.classList.remove('autohide');
    clearTimeout(hideTimeout);
}

function startHideTimer() {
    clearTimeout(hideTimeout);
    hideTimeout = setTimeout(() => {
        // যদি স্টার্ট মেনু বা কোনো পপআপ খোলা না থাকে তবেই হাইড হবে
        taskbar.classList.add('autohide');
    }, 4000); // ৪ সেকেন্ড পর হাইড
}

// মাউস ট্রিগার জোনে গেলেই শো করবে
trigger.addEventListener('mouseenter', showTaskbar);

// টাস্কবারে মাউস থাকলেও শো করবে
taskbar.addEventListener('mouseenter', showTaskbar);

// টাস্কবার থেকে মাউস সরে গেলে টাইমার শুরু
taskbar.addEventListener('mouseleave', startHideTimer);

// শুরুতে ১৫ সেকেন্ড পর প্রথমবার হাইড হবে
setTimeout(startHideTimer, 10000);


function updateWallpaper(url) {
    document.getElementById('desktop').style.backgroundImage = `url('${url}')`;
}


// গুরুত্বপূর্ণ: গ্লোবাল এক্সেস দেওয়া যাতে iframe থেকে ডাকা যায়
window.initOS = initOS;

// পেজ লোড হলে শুরু করো
window.onload = () => {
    startClock();
    loadSavedSettings();
    const homeBtn = document.getElementById('home-btn');
    if(homeBtn) homeBtn.onclick = goToHome;
    initOS();
};





function updateWallpaper(url) {
    document.getElementById('desktop').style.backgroundImage = `url('${url}')`;
}

function updateUsername(name) {
    const nameLabel = document.getElementById('start-menu-user'); // আপনার স্টার্ট মেনুর ইউজার আইডির নাম দিন
    if(nameLabel) nameLabel.innerText = name;
}



function toggleOSFullScreen() {
    const container = document.getElementById('fs-icon-container');
    const btn = document.getElementById('fullscreen-btn');
    
    const iconFull = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path></svg>`;
    const iconExit = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14h6m0 0v6m0-6L3 21m17-7h-6m0 0v6m0-6l7 7m-7-11V4m0 6l7-7M10 10V4m0 6L3 3"></path></svg>`;

    if (!document.fullscreenElement) {
        if (document.documentElement.requestFullscreen) {
            document.documentElement.requestFullscreen();
        }
        container.innerHTML = iconExit;
        btn.title = "Exit Full Screen"; // মাউস রাখলে এখন এটি দেখাবে
    } else {
        if (document.exitFullscreen) {
            document.exitFullscreen();
        }
        container.innerHTML = iconFull;
        btn.title = "Full Screen"; // মাউস রাখলে আবার এটি দেখাবে
    }
}

// Esc কিবোর্ড বাটন চাপলে টাইটেল ঠিক করার জন্য
document.addEventListener('fullscreenchange', () => {
    const container = document.getElementById('fs-icon-container');
    const btn = document.getElementById('fullscreen-btn');
    const iconFull = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path></svg>`;
    
    if (!document.fullscreenElement) {
        container.innerHTML = iconFull;
        btn.title = "Full Screen";
    }
});

