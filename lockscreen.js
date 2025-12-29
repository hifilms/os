/**
 * lockscreen.js 
 * Safe Version: Fixed Desktop App Persistence
 */

let idleTime = 0;
let wrongAttempts = 0; 
let LOCK_LIMIT = 20; // টেস্ট করার জন্য ২০ সেকেন্ড

function createLockScreen() {
    const savedPass = localStorage.getItem('os_password');
    if (!savedPass || savedPass === "") return; 

    if(document.getElementById('lock-screen')) return; // অলরেডি থাকলে আর দরকার নেই

    const lockHTML = `
    <div id="lock-screen" class="lock-overlay">
        <div class="lock-top">
            <h1 id="lock-time">00:00</h1>
            <p id="lock-date">Loading...</p>
        </div>
        
        <div class="lock-bottom">
            <div id="lock-input-container">
                <input type="password" id="lock-input" placeholder="Enter Password" autocomplete="off">
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

    lockInput.addEventListener('input', () => {
        if (lockInput.value === savedPass) {
            unlockNow();
        } 
        else if (lockInput.value.length >= savedPass.length) {
            wrongAttempts++;
            lockInput.parentElement.style.borderBottomColor = "#ef4444";
            
            const savedHint = localStorage.getItem('os_hint');
            hintEl.innerText = "Incorrect Password!" + (savedHint ? " | Hint: " + savedHint : "");

            if (wrongAttempts >= 3) resetBtn.style.display = "block";

            setTimeout(() => {
                if(lockInput.value !== savedPass) {
                    lockInput.parentElement.style.borderBottomColor = "rgba(255, 255, 255, 0.3)";
                    lockInput.value = ""; 
                }
            }, 1000);
        }
    });
}

// রিসেট ফাংশন - সতর্কতার সাথে ব্যবহার করুন
async function factoryReset() {
    if (confirm("Are you sure? This will WIPE ALL APPS and settings!")) {
        if (confirm("FINAL WARNING: Everything will be deleted. Proceed?")) {
            localStorage.clear();
            sessionStorage.clear();

            // IndexedDB ক্লিন করা (সব অ্যাপস মুছে যাবে)
            if (window.indexedDB.databases) {
                const databases = await window.indexedDB.databases();
                databases.forEach(db => window.indexedDB.deleteDatabase(db.name));
            }

            alert("System Wiped. Restarting...");
            location.reload(); 
        }
    }
}

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

function unlockNow() {
    const screen = document.getElementById('lock-screen');
    if(screen) {
        screen.classList.add('hide-lock');
        wrongAttempts = 0;
        idleTime = 0;
        setTimeout(() => screen.remove(), 1000);
    }
}

// টাইমার রিসেট ইভেন্টস
const resetIdle = () => idleTime = 0;
window.onmousemove = resetIdle;
window.onmousedown = resetIdle;
window.onkeypress = resetIdle;

setInterval(() => {
    if (localStorage.getItem('os_password') && !document.getElementById('lock-screen')) {
        idleTime++;
        if(idleTime >= LOCK_LIMIT) createLockScreen();
    } else {
        idleTime = 0;
    }
}, 1000);

window.addEventListener('DOMContentLoaded', createLockScreen);