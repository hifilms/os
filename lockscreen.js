/**
 * lockscreen.js 
 * Final Version: Auto-focus, Keyboard Support, and Video Playback Integration
 */

let idleTime = 0;
let wrongAttempts = 0; 
let LOCK_LIMIT = 25; // লক হওয়ার সময় (সেকেন্ডে)

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

// ২. লক স্ক্রিনের ভেতরের সার্ভিসসমূহ (টাইম, ইনপুট, ফোকাস)
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

    // *** অটো-ফোকাস লজিক ***
    setTimeout(() => {
        if(lockInput) {
            lockInput.focus();
            console.log("Input focused automatically");
        }
    }, 500);

    // ভুল পাসওয়ার্ড হ্যান্ডেল করার ফাংশন
    function handleWrongAttempt() {
        wrongAttempts++;
        lockInput.parentElement.style.borderBottomColor = "#ef4444";
        const savedHint = localStorage.getItem('os_hint');
        hintEl.innerText = "Incorrect Password!" + (savedHint ? " | Hint: " + savedHint : "");

        if (wrongAttempts >= 3) resetBtn.style.display = "block";

        setTimeout(() => {
            if(lockInput.value !== savedPass) {
                lockInput.parentElement.style.borderBottomColor = "rgba(255, 255, 255, 0.3)";
                lockInput.value = ""; 
                lockInput.focus(); // ভুল হলে আবার অটো-ফোকাস
            }
        }, 1000);
    }

    // এন্টার কী প্রেস করলে আনলক হবে
    lockInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            if (lockInput.value === savedPass) {
                unlockNow();
            } else if (lockInput.value.length > 0) {
                handleWrongAttempt();
            }
        }
    });

    // টাইপ করার সময় চেক করা
    lockInput.addEventListener('input', () => {
        if (lockInput.value === savedPass) {
            unlockNow();
        } 
        else if (lockInput.value.length >= savedPass.length) {
            handleWrongAttempt();
        }
    });
}

// ৩. সিস্টেম রিসেট ফাংশন
async function factoryReset() {
    if (confirm("Are you sure? This will WIPE ALL APPS and settings!")) {
        if (confirm("FINAL WARNING: Everything will be deleted. Proceed?")) {
            localStorage.clear();
            sessionStorage.clear();
            if (window.indexedDB.databases) {
                const databases = await window.indexedDB.databases();
                databases.forEach(db => window.indexedDB.deleteDatabase(db.name));
            }
            alert("System Wiped. Restarting...");
            location.reload(); 
        }
    }
}

// ৪. পাসওয়ার্ড দেখানো/লুকানোর ফাংশন
function toggleLockPass() {
    const input = document.getElementById('lock-input');
    if (input.type === "password") {
        input.type = "text";
        input.style.letterSpacing = "normal";
    } else {
        input.type = "password";
        input.style.letterSpacing = "10px";
    }
}

// ৫. আনলক করার ফাংশন
function unlockNow() {
    const screen = document.getElementById('lock-screen');
    if(screen) {
        screen.classList.add('hide-lock');
        wrongAttempts = 0;
        idleTime = 0;
        setTimeout(() => screen.remove(), 1000);
    }
}

// --- মাউস ও কিবোর্ড ডিটেকশন ---
const resetIdle = () => idleTime = 0;
window.onmousemove = resetIdle;
window.onmousedown = resetIdle;
window.onkeypress = resetIdle;

// --- মেইন টাইমার লজিক (ভিডিও সাপোর্টসহ) ---
setInterval(() => {
    let isPlaying = false;
    
    // ইউটিউব প্লেয়ার চেক
    if (typeof player !== 'undefined' && player.getPlayerState) {
        if (player.getPlayerState() === 1) { 
            isPlaying = true;
        }
    }

    if (localStorage.getItem('os_password') && !document.getElementById('lock-screen')) {
        if (isPlaying) {
            idleTime = 0; 
        } else {
            idleTime++; 
        }
        
        if(idleTime >= LOCK_LIMIT) createLockScreen();
    } else {
        idleTime = 0;
    }
}, 1000);

// --- অ্যাপ কমিউনিকেশন (Message Receiver) ---
window.addEventListener('message', function(event) {
    // বিভিন্ন অ্যাপ থেকে আসা সিগন্যাল রিসিভ করা
    if (event.data === 'keep_awake' || event.data === 'video_is_playing' || event.data === 'reset_lock') {
        idleTime = 0;
        console.log("Activity Signal Received from App: Timer Reset");
    }
});

// --- আইফ্রেম ট্র্যাকার (অ্যাপের ভেতরে মাউস ট্র্যাক করা) ---
function trackAllAppActivity() {
    const iframes = document.getElementsByTagName('iframe');
    for (let i = 0; i < iframes.length; i++) {
        try {
            iframes[i].contentWindow.onmousemove = resetIdle;
            iframes[i].contentWindow.onkeydown = resetIdle;
            iframes[i].contentWindow.onmousedown = resetIdle;
        } catch (e) {
            // Cross-origin frames will be ignored safely
        }
    }
}
setInterval(trackAllAppActivity, 5000);

// পেজ লোড হলে লক স্ক্রিন চেক
window.addEventListener('DOMContentLoaded', createLockScreen);



// আইফ্রেম থেকে আসা মেসেজ রিসিভ করা
window.addEventListener('message', function(event) {
    if (event.data === 'user_is_active') {
        // এখানে আপনার লক স্ক্রিনের টাইম রিসেট করার ফাংশনটি কল করুন
        // উদাহরণস্বরূপ:
        resetYourLockTimer(); 
        console.log("User is active inside Iframe");
    }
});

// আপনার বর্তমান যে ফাংশনটি টাইম রিসেট করে (যেমন নিচের মত হতে পারে)
function resetYourLockTimer() {
    clearTimeout(idleTimer); // আপনার ভেরিয়েবল নাম অনুযায়ী এটি পরিবর্তন করুন
    idleTimer = setTimeout(showLockScreen, 60000); // ৬০ সেকেন্ড পর লক হবে
}

