const SERVER_URL = "https://hifilms.github.io/os/as/";
const IMG_EXT = ".webp";
const AUDIO_EXT = ".mp3";

const audio = document.getElementById('main-audio');
const playBtnM = document.getElementById('m-play-btn');
const playBtnF = document.getElementById('f-play-btn');
const seekBar = document.getElementById('seek-bar');
const miniProgressBar = document.getElementById('mini-progress-bar');
const slider = document.getElementById('slider-wrapper');
const mImg = document.getElementById('m-img');
const fImg = document.getElementById('f-img');

const PLAY_ICON = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
const PAUSE_ICON = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>';

let db, allData = [], currentPlayingId = null;
let currentSlide = 0, startX = 0, isDragging = false;

const request = indexedDB.open("HiStoryDB", 2);
request.onupgradeneeded = e => {
    const db = e.target.result;
    if (!db.objectStoreNames.contains("stories")) db.createObjectStore("stories", { keyPath: "id" });
    if (!db.objectStoreNames.contains("downloads")) db.createObjectStore("downloads", { keyPath: "id" });
};
request.onsuccess = e => { db = e.target.result; initApp(); };

async function initApp() {
    try {
        const res = await fetch(`${SERVER_URL}/data.json`);
        allData = await res.json();
        const tx = db.transaction("stories", "readwrite");
        allData.forEach(story => tx.objectStore("stories").put({ id: story[0], cat: story[1], name: story[2] }));
    } catch {
        const tx = db.transaction("stories", "readonly");
        const req = tx.objectStore("stories").getAll();
        await new Promise(r => req.onsuccess = () => {
            allData = req.result.map(i => [i.id, i.cat, i.name]);
            r();
        });
    }

    renderHome(allData);

    const lastPlayedId = localStorage.getItem('lastPlayedId');
    const lastPosition = parseFloat(localStorage.getItem('lastPosition') || '0');

    if (lastPlayedId) {
        const story = allData.find(s => s[0] === lastPlayedId);
        if (story) {
            setDefaultAudio(story, lastPosition);
        }
    } else if (allData[0]) {
        setDefaultAudio(allData[0]);
    }

    const savedTheme = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);
    updateThemeIcon(savedTheme);
}

function setDefaultAudio(story, position = 0) {
    updatePlayerUI(story);
    audio.src = `${SERVER_URL}/audio/${story[0]}${AUDIO_EXT}`;
    audio.currentTime = position;
}

function updatePlayerUI(story) {
    currentPlayingId = story[0];
    localStorage.setItem('lastPlayedId', currentPlayingId);
    document.getElementById('m-name').innerText = story[2];
    document.getElementById('f-name').innerText = story[2];
    document.getElementById('m-cat').innerText = story[1];
    document.getElementById('f-cat').innerText = story[1];
    const imgUrl = `${SERVER_URL}/img/${story[0]}${IMG_EXT}`;
    mImg.src = imgUrl;
    fImg.src = imgUrl;
    highlightActiveCard(story[0]);
    updateBookmarkUI(story[0]);
    checkDownloadStatus(story[0]);
}

function initHeroSlider(data) {
    const limit = data.slice(0, 10);
    slider.innerHTML = limit.map(s => `<div class="slide-img" style="background-image: url('${SERVER_URL}/img/${s[0]}${IMG_EXT}')" onclick="playSong('${s[0]}')"></div>`).join('');
    let slideCount = limit.length;
    setInterval(() => { if (!isDragging) moveSlide(1, slideCount); }, 5000);

    slider.addEventListener('touchstart', e => { startX = e.touches[0].clientX; isDragging = true; });
    slider.addEventListener('touchend', e => {
        let diff = startX - e.changedTouches[0].clientX;
        if (Math.abs(diff) > 50) moveSlide(diff > 0 ? 1 : -1, slideCount);
        isDragging = false;
    });
}

function moveSlide(dir, total) {
    currentSlide = (currentSlide + dir + total) % total;
    slider.style.transform = `translateX(-${currentSlide * 100}%)`;
    const counter = document.getElementById('slider-counter');
    if (counter) counter.innerText = `${currentSlide + 1}/${total}`;
}

async function renderHome(data) {
    initHeroSlider(data);
    await renderOfflinePlaylists();

    const container = document.getElementById('home-content');
    container.innerHTML = "";
    const categories = [...new Set(data.map(i => i[1]))];
    categories.forEach(cat => {
        const stories = data.filter(i => i[1] === cat);
        container.innerHTML += `
            <div class="category-section">
                <div class="cat-header"><h2>${cat}</h2><span class="see-more" onclick="openGrid('${cat}')">See More ></span></div>
                <div class="horizontal-slider">
                    ${stories.map(s => `<div class="card" onclick="playSong('${s[0]}')"><img src="${SERVER_URL}/img/${s[0]}${IMG_EXT}"></div>`).join('')}
                </div>
            </div>`;
    });
}

async function renderOfflinePlaylists() {
    const offlineContainer = document.getElementById('offline-playlist-container');
    offlineContainer.innerHTML = "";

    const tx = db.transaction("downloads", "readonly");
    const req = tx.objectStore("downloads").getAll();
    const downloads = await new Promise(r => req.onsuccess = () => r(req.result || []));

    if (downloads && downloads.length > 0) {
        offlineContainer.innerHTML += `
            <div class="category-section">
                <div class="cat-header"><h2>Downloaded Stories</h2><span class="see-more" onclick="openGrid('Downloaded Stories', true)">See More ></span></div>
                <div class="horizontal-slider">
                    ${downloads.map(d => `<div class="card" onclick="playSong('${d.id}')"><img src="${SERVER_URL}/img/${d.id}${IMG_EXT}"></div>`).join('')}
                </div>
            </div>`;
    }

    const bookmarks = JSON.parse(localStorage.getItem('bookmarks') || '[]');
    if (bookmarks.length > 0) {
        const bookmarkedSongs = allData.filter(s => bookmarks.includes(s[0]));
        if (bookmarkedSongs.length > 0) {
            offlineContainer.innerHTML += `
                <div class="category-section">
                    <div class="cat-header"><h2>Bookmarked Stories</h2><span class="see-more" onclick="openGrid('Bookmarked Stories', false, true)">See More ></span></div>
                    <div class="horizontal-slider">
                        ${bookmarkedSongs.map(s => `<div class="card" onclick="playSong('${s[0]}')"><img src="${SERVER_URL}/img/${s[0]}${IMG_EXT}"></div>`).join('')}
                    </div>
                </div>`;
        }
    }
}

async function openGrid(category, isDownload = false, isBookmark = false) {
    document.getElementById('main-header').style.display = "none";
    document.getElementById('home-page').style.display = "none";
    document.getElementById('grid-view').style.display = "block";
    document.getElementById('grid-title').innerText = category;
    const grid = document.getElementById('grid-container');

    let items = [];
    if (isDownload) {
        const tx = db.transaction("downloads", "readonly");
        const req = tx.objectStore("downloads").getAll();
        const downloads = await new Promise(r => req.onsuccess = () => r(req.result || []));
        items = downloads;
    } else if (isBookmark) {
        const bookmarks = JSON.parse(localStorage.getItem('bookmarks') || '[]');
        items = allData.filter(s => bookmarks.includes(s[0]));
    } else {
        items = allData.filter(s => s[1] === category);
    }

    grid.innerHTML = items.map(s => `<div class="grid-card" data-id="${s.id || s[0]}" onclick="playSong('${s.id || s[0]}')"><img src="${SERVER_URL}/img/${s.id || s[0]}${IMG_EXT}"></div>`).join('');
    highlightActiveCard(currentPlayingId);
}

async function playSong(id) {
    const story = allData.find(s => s[0] === id);
    if (!story) return;
    updatePlayerUI(story);

    const tx = db.transaction("downloads", "readonly");
    const req = tx.objectStore("downloads").get(id);
    const download = await new Promise(r => req.onsuccess = () => r(req.result));

    if (download && download.blob) {
        audio.src = URL.createObjectURL(download.blob);
    } else {
        audio.src = `${SERVER_URL}/audio/${id}${AUDIO_EXT}`;
    }

    audio.play();
    updateBtn(true);
}

function nextSong() {
    const currentStory = allData.find(s => s[0] === currentPlayingId);
    if (!currentStory) return;
    const catStories = allData.filter(s => s[1] === currentStory[1]);
    let nextIdx = catStories.findIndex(s => s[0] === currentPlayingId) + 1;
    if (nextIdx >= catStories.length) nextIdx = 0;
    playSong(catStories[nextIdx][0]);
}

function prevSong() {
    const currentStory = allData.find(s => s[0] === currentPlayingId);
    if (!currentStory) return;
    const catStories = allData.filter(s => s[1] === currentStory[1]);
    let prevIdx = catStories.findIndex(s => s[0] === currentPlayingId) - 1;
    if (prevIdx < 0) prevIdx = catStories.length - 1;
    playSong(catStories[prevIdx][0]);
}

function skipTime(seconds) {
    audio.currentTime = Math.max(0, Math.min(audio.duration, audio.currentTime + seconds));
}

function highlightActiveCard(id) {
    document.querySelectorAll('.card, .grid-card').forEach(c => c.classList.remove('active'));
    document.querySelectorAll(`[data-id="${id}"], [onclick="playSong('${id}')"]`).forEach(c => c.classList.add('active'));
}

function togglePlay() {
    if (audio.paused) {
        audio.play();
        updateBtn(true);
    } else {
        audio.pause();
        updateBtn(false);
    }
}

function updateBtn(isPlaying) {
    playBtnM.innerHTML = isPlaying ? PAUSE_ICON : PLAY_ICON;
    playBtnF.innerHTML = isPlaying ? PAUSE_ICON : PLAY_ICON;
    if (isPlaying) {
        mImg.classList.add('playing');
        fImg.classList.add('playing');
    } else {
        mImg.classList.remove('playing');
        fImg.classList.remove('playing');
    }
}

audio.onended = () => { nextSong(); };

audio.ontimeupdate = () => {
    if (isNaN(audio.duration)) return;
    const progress = (audio.currentTime / audio.duration) * 100 || 0;
    seekBar.value = progress;
    if (miniProgressBar) miniProgressBar.style.width = `${progress}%`;
    document.getElementById('current-time').innerText = formatTime(audio.currentTime);
    document.getElementById('duration-time').innerText = formatTime(audio.duration);
    localStorage.setItem('lastPosition', audio.currentTime);
};

seekBar.oninput = () => {
    audio.currentTime = (seekBar.value / 100) * audio.duration;
};

function formatTime(s) {
    if (isNaN(s)) return "0:00";
    let m = Math.floor(s / 60), sec = Math.floor(s % 60);
    return `${m}:${sec < 10 ? '0' : ''}${sec}`;
}

// Window Scroll for Header
window.onscroll = () => {
    const header = document.getElementById('main-header');
    if (window.scrollY > 50) {
        header.classList.add('scrolled');
    } else {
        header.classList.remove('scrolled');
    }
};

// Settings Menu Toggle
function toggleSettings() {
    const overlay = document.getElementById('settings-overlay');
    overlay.classList.toggle('active');
}

// Timer Logic
// Timer Logic
let sleepTimer = null;
let countdownInterval = null;

function toggleTimerMenu() {
    document.getElementById('timer-overlay').classList.toggle('active');
}

function setSleepTimer(minutes) {
    if (sleepTimer) clearTimeout(sleepTimer);
    if (countdownInterval) clearInterval(countdownInterval);

    const display = document.getElementById('timer-display');
    const btn = document.querySelector('.timer-btn');

    if (minutes > 0) {
        let remainingSeconds = minutes * 60;

        // Update display immediately
        updateTimerDisplay(remainingSeconds);

        // Start countdown
        countdownInterval = setInterval(() => {
            remainingSeconds--;
            if (remainingSeconds <= 0) {
                // Timer finished
                clearInterval(countdownInterval);
                audio.pause();
                updateBtn(false);
                if (display) display.innerText = "";
                if (btn) btn.style.color = '';
            } else {
                updateTimerDisplay(remainingSeconds);
            }
        }, 1000);

        if (btn) btn.style.color = 'var(--accent-color)';
    } else {
        // Cancel
        if (btn) btn.style.color = '';
        if (display) display.innerText = "";
    }
    toggleTimerMenu();
}

function updateTimerDisplay(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    const text = `${m}:${s < 10 ? '0' : ''}${s}`;
    const display = document.getElementById('timer-display');
    if (display) display.innerText = text;
}
document.querySelector('.settings-dots').onclick = toggleSettings;

function backToHome() {
    document.getElementById('main-header').style.display = "flex";
    document.getElementById('home-page').style.display = "block";
    document.getElementById('grid-view').style.display = "none";
}

function expandPlayer() {
    document.getElementById('player-container').className = 'full';
    document.body.style.overflow = "hidden"; // Lock body scroll
}
function minimizePlayer() {
    document.getElementById('player-container').className = 'mini';
    document.body.style.overflow = ""; // Unlock body scroll
}

function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    updateThemeIcon(newTheme);
}

function updateThemeIcon(theme) {
    const themeIcon = document.getElementById('theme-icon');
    if (theme === 'dark') {
        themeIcon.innerHTML = '<path d="M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9 9-4.03 9-9c0-.46-.04-.92-.1-1.36-.98 1.37-2.58 2.26-4.4 2.26-3.03 0-5.5-2.47-5.5-5.5 0-1.82.89-3.42 2.26-4.4-.44-.06-.9-.1-1.36-.1z"/>';
    } else {
        themeIcon.innerHTML = '<path d="M12 7c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zM2 13h2c.55 0 1-.45 1-1s-.45-1-1-1H2c-.55 0-1 .45-1 1s.45 1 1 1zm18 0h2c.55 0 1-.45 1-1s-.45-1-1-1h-2c-.55 0-1 .45-1 1s.45 1 1 1zM11 2v2c0 .55.45 1 1 1s1-.45 1-1V2c0-.55-.45-1-1-1s-1 .45-1 1zm0 18v2c0 .55.45 1 1 1s1-.45 1-1v-2c0-.55-.45-1-1-1s-1 .45-1 1zM5.99 4.58c-.39-.39-1.03-.39-1.41 0s-.39 1.03 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0s.39-1.03 0-1.41L5.99 4.58zm12.37 12.37c-.39-.39-1.03-.39-1.41 0s-.39 1.03 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0s.39-1.03 0-1.41l-1.06-1.06zm1.06-12.37c-.39-.39-1.03-.39-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06c.39-.38.39-1.02 0-1.41zm-12.37 12.37c-.39-.39-1.03-.39-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06c.39-.38.39-1.02 0-1.41z"/>';
    }
}

function toggleBookmark() {
    let bookmarks = JSON.parse(localStorage.getItem('bookmarks') || '[]');
    if (bookmarks.includes(currentPlayingId)) {
        bookmarks = bookmarks.filter(id => id !== currentPlayingId);
    } else {
        bookmarks.push(currentPlayingId);
    }
    localStorage.setItem('bookmarks', JSON.stringify(bookmarks));
    updateBookmarkUI(currentPlayingId);
    renderHome(allData);
}

function updateBookmarkUI(id) {
    const bookmarks = JSON.parse(localStorage.getItem('bookmarks') || '[]');
    const isBookmarked = bookmarks.includes(id);
    const btn = document.getElementById('fav-btn');
    if (btn) {
        btn.innerHTML = isBookmarked ?
            '<svg viewBox="0 0 24 24" fill="var(--accent-color)"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>' :
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>';
    }
}

async function checkDownloadStatus(id) {
    const tx = db.transaction("downloads", "readonly");
    const req = tx.objectStore("downloads").get(id);
    req.onsuccess = () => {
        const isDownloaded = !!req.result;
        const btn = document.getElementById('download-btn');
        if (btn) {
            btn.innerHTML = isDownloaded ?
                '<svg viewBox="0 0 24 24" fill="var(--accent-color)"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>' :
                '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>';
            btn.dataset.downloaded = isDownloaded;
        }
    };
}

async function handleDownloadClick() {
    const btn = document.getElementById('download-btn');
    if (btn.dataset.downloaded === "true") {
        deleteDownload();
    } else {
        downloadSong();
    }
}

async function downloadSong() {
    const id = currentPlayingId;
    const story = allData.find(s => s[0] === id);
    if (!story) return;

    const btn = document.getElementById('download-btn');
    btn.classList.add('download-loading');
    btn.disabled = true;

    try {
        const response = await fetch(`${SERVER_URL}/audio/${id}${AUDIO_EXT}`);
        const blob = await response.blob();

        const tx = db.transaction("downloads", "readwrite");
        await tx.objectStore("downloads").put({ id: id, name: story[2], cat: story[1], blob: blob });

        checkDownloadStatus(id);
        renderHome(allData);
    } catch (e) {
        console.error(e);
        alert("Download failed.");
    } finally {
        btn.classList.remove('download-loading');
        btn.disabled = false;
    }
}

async function deleteDownload() {
    const id = currentPlayingId;
    const tx = db.transaction("downloads", "readwrite");
    await tx.objectStore("downloads").delete(id);

    checkDownloadStatus(id);
    renderHome(allData);

}
