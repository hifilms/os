/**
 * lockscreen.js - Master Stable Version
 * fixes: video detection, cross-origin iframe activity, and timer stability.
 */

let idleTime = 0;
let wrongAttempts = 0; 
let LOCK_LIMIT = 40; // আপনার দেওয়া সময় (সেকেন্ডে)
let isLocked = false;

// ১. লক স্ক্রিন তৈরি
function createLockScreen() {
    const savedPass = localStorage.getItem('os_password');
    if (!savedPass || savedPass === "" || isLocked) return; 

    isLocked = true;
    if(document.getElementById('lock-screen')) return; 

    const lockHTML = `
    <div id="lock-screen" class="lock-overlay">
        <div class="lock-top">
            <h1 id="lock-time">00:00</h1>
            <p id="lock-date">Loading...</p>
        </div>
        <div class="lock-bottom">
            <div id="lock-input-container">
                <input type="password" id="lock-input" placeholder=" " autocomplete="off">
                <i class="fas fa-eye toggle-pass" id="eye-icon" onclick="toggleLockPass()"></i>
            </div>
            <div class="lock-msg-area">
                <p id="lock-hint" class="hint-text"></p>
                <button id="reset-btn" class="reset-btn" onclick="factoryReset()">RESET SYSTEM & WIPE DATABASE</button>
            </div>
        </div>
    </div>`;

    document.body.insertAdjacentHTML('afterbegin', lockHTML);
    startLockServices();
}

// ২. লক স্ক্রিন সার্ভিস (টাইম ও ইনপুট)
function startLockServices() {
    const updateTime = () => {
        const now = new Date();
        const timeStr = now.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', hour12: false});
        const dateStr = now.toLocaleDateString([], {weekday: 'long', month: 'long', day: 'numeric'});
        
        if(document.getElementById('lock-time')) document.getElementById('lock-time').innerText = timeStr;
        if(document.getElementById('lock-date')) document.getElementById('lock-date').innerText = dateStr;
    };
    updateTime();
    let timeInterval = setInterval(() => {
        if(!isLocked) clearInterval(timeInterval);
        updateTime();
    }, 1000);

    const lockInput = document.getElementById('lock-input');
    const savedPass = localStorage.getItem('os_password');
    const hintEl = document.getElementById('lock-hint');
    const resetBtn = document.getElementById('reset-btn');

    setTimeout(() => { if(lockInput) lockInput.focus(); }, 500);

    function handleWrongAttempt() {
        wrongAttempts++;
        lockInput.parentElement.style.borderBottomColor = "#ef4444";
        const savedHint = localStorage.getItem('os_hint');
        hintEl.innerText = "Incorrect Password!" + (savedHint ? " | Hint: " + savedHint : "");
        if (wrongAttempts >= 3) resetBtn.style.display = "block";
        setTimeout(() => {
            if(lockInput && lockInput.value !== savedPass) {
                lockInput.parentElement.style.borderBottomColor = "rgba(255, 255, 255, 0.3)";
                lockInput.value = ""; 
                lockInput.focus();
            }
        }, 1000);
    }

    lockInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            if (lockInput.value === savedPass) unlockNow();
            else if (lockInput.value.length > 0) handleWrongAttempt();
        }
    });

    lockInput.addEventListener('input', () => {
        if (lockInput.value === savedPass) unlockNow();
    });
}

// ৩. আনলক ফাংশন
function unlockNow() {
    const screen = document.getElementById('lock-screen');
    if(screen) {
        screen.classList.add('hide-lock');
        wrongAttempts = 0;
        idleTime = 0;
        isLocked = false;
        setTimeout(() => screen.remove(), 1000);
    }
}

// ৪. মেইন টাইমার ইঞ্জিন (ভিডিও ডিটেকশন সহ)
setInterval(() => {
    if (isLocked) {
        idleTime = 0;
        return;
    }

    let videoActive = false;
    
    // ইউটিউব প্লেয়ার চেক
    if (typeof player !== 'undefined' && player.getPlayerState) {
        if (player.getPlayerState() === 1) videoActive = true;
    }
    
    // সাধারণ HTML5 ভিডিও ট্যাগ চেক
    const videos = document.getElementsByTagName('video');
    for (let v of videos) {
        if (!v.paused && !v.ended && v.readyState > 2) videoActive = true;
    }

    if (localStorage.getItem('os_password')) {
        if (videoActive) {
            idleTime = 0; // ভিডিও চললে রিসেট থাকবে
        } else {
            idleTime++;
        }
        
        if (idleTime >= LOCK_LIMIT) createLockScreen();
    }
}, 1000);

// ৫. অ্যাক্টিভিটি ট্র্যাকার (Main Window + Iframe)
function resetIdle() {
    idleTime = 0;
}

['mousemove', 'mousedown', 'keypress', 'touchstart', 'scroll'].forEach(evt => {
    window.addEventListener(evt, resetIdle, { passive: true });
});

// আইফ্রেম থেকে সিগন্যাল রিসিভ করা (Cross-Origin Support)
window.addEventListener('message', function(event) {
    const validMessages = ['reset_lock', 'user_active', 'keep_awake', 'video_is_playing'];
    if (validMessages.includes(event.data)) {
        resetIdle();
    }
}, false);

// ৬. ইউটিলিটি ফাংশনস (রিসেট ও পাসওয়ার্ড টগল)
async function factoryReset() {
    if (confirm("Are you sure? This will WIPE EVERYTHING!")) {
        localStorage.clear();
        location.reload(); 
    }
}

function toggleLockPass() {
    const input = document.getElementById('lock-input');
    if(input) input.type = (input.type === "password") ? "text" : "password";
}

window.addEventListener('DOMContentLoaded', createLockScreen);

