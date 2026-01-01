/**
 * lockscreen.js - Optimized Professional Version
 * Fixes: Iframe sync, Activity tracking, and Video integration.
 */

let idleTime = 0;
let wrongAttempts = 0; 
let LOCK_LIMIT = 200; // আপনার দেওয়া লিমিট

// ১. লক স্ক্রিন তৈরি করার ফাংশন
function createLockScreen() {
    const savedPass = localStorage.getItem('os_password');
    if (!savedPass || savedPass === "") return; 
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

// ২. লক স্ক্রিনের ভেতরের সার্ভিসসমূহ
function startLockServices() {
    const updateTime = () => {
        const now = new Date();
        const timeStr = now.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', hour12: false});
        const dateStr = now.toLocaleDateString([], {weekday: 'long', month: 'long', day: 'numeric'});
        if(document.getElementById('lock-time')) document.getElementById('lock-time').innerText = timeStr;
        if(document.getElementById('lock-date')) document.getElementById('lock-date').innerText = dateStr;
    };
    updateTime();
    setInterval(updateTime, 1000);

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

// ৩. আনলক করার ফাংশন
function unlockNow() {
    const screen = document.getElementById('lock-screen');
    if(screen) {
        screen.classList.add('hide-lock');
        wrongAttempts = 0;
        idleTime = 0; // আনলক হওয়ার সাথে সাথে টাইমার জিরো
        setTimeout(() => screen.remove(), 1000);
    }
}

// ৪. ওএস রিসেট এবং পাসওয়ার্ড টগল (অপরিবর্তিত)
async function factoryReset() {
    if (confirm("Are you sure? This will WIPE ALL APPS!")) {
        localStorage.clear();
        location.reload(); 
    }
}
function toggleLockPass() {
    const input = document.getElementById('lock-input');
    input.type = (input.type === "password") ? "text" : "password";
}

// ৫. মাউস ও কিবোর্ড ডিটেকশন (উন্নত লজিক)
const resetIdle = () => {
    idleTime = 0;
};

// মেইন উইন্ডোর সব মুভমেন্ট ট্র্যাকিং
['mousemove', 'mousedown', 'keypress', 'touchstart', 'scroll'].forEach(evt => {
    window.addEventListener(evt, resetIdle, { passive: true });
});

// ৬. মেইন টাইমার ইঞ্জিন (প্রতি সেকেন্ডে রান হবে)
setInterval(() => {
    let isPlaying = false;
    // ইউটিউব এবং ভিডিও প্লেয়ার সাপোর্ট
    if (typeof player !== 'undefined' && player.getPlayerState && player.getPlayerState() === 1) { 
        isPlaying = true;
    }

    if (localStorage.getItem('os_password') && !document.getElementById('lock-screen')) {
        if (isPlaying) {
            idleTime = 0; 
        } else {
            idleTime++; 
        }
        
        // লক হওয়ার কন্ডিশন
        if(idleTime >= LOCK_LIMIT) createLockScreen();
    } else {
        idleTime = 0;
    }
}, 1000);

// ৭. আইফ্রেম কমিউনিকেশন (সব ধরণের মেসেজ রিসিভার)
window.addEventListener('message', function(event) {
    const activeSignals = ['reset_lock', 'user_active', 'keep_awake', 'video_is_playing'];
    if (activeSignals.includes(event.data)) {
        idleTime = 0;
        // console.log("Iframe Signal Sync Success");
    }
}, false);

// ৮. আইফ্রেম ট্র্যাকার (ব্যাকআপ লজিক)
function trackAllAppActivity() {
    const iframes = document.getElementsByTagName('iframe');
    for (let i = 0; i < iframes.length; i++) {
        try {
            // সেম অরিজিন হলে সরাসরি ইনজেক্ট করবে
            iframes[i].contentWindow.onmousemove = resetIdle;
            iframes[i].contentWindow.onkeydown = resetIdle;
        } catch (e) {
            // ক্রস ডোমেইন হলে পোস্ট মেসেজের ওপর নির্ভর করবে
        }
    }
}
setInterval(trackAllAppActivity, 3000);

window.addEventListener('DOMContentLoaded', createLockScreen);
