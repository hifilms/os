// ১. ওএস লোড হওয়ার সাথে সাথে ব্যাকগ্রাউন্ডে এআই তৈরি করা
window.initAISidebar = function() {
    let sidebar = document.getElementById('ai-sidebar');
    if (!sidebar) {
        sidebar = document.createElement('div');
        sidebar.id = 'ai-sidebar';
        sidebar.style.display = 'none'; 
        
        sidebar.innerHTML = `
            <div class="sidebar-header" style="padding: 12px 15px; z-index: 9990; display:flex; justify-content:space-between; align-items:center; background:#1a1b1e; color:#fff; border-bottom:1px solid #333; border-radius: 12px 0 0 0;">
                <div style="display:flex; align-items:center; gap:10px;">
                    <div style="width:10px; height:10px; background:#4285f4; border-radius:50%; box-shadow:0 0 10px #4285f4;"></div>
                    <span style="font-weight:bold; font-family:sans-serif; font-size:13px;">GEMINI AI 3.0</span>
                </div>
                <button onclick="toggleAISidebar()" style="background:none; border:none; color:#777; font-size:24px; cursor:pointer;">&times;</button>
            </div>
            
            <div id="ai-viewport" style="flex:1; overflow:hidden; position:relative; background:#ffffff;">
                <iframe id="ai-frame" 
                    src="https://www.easemate.ai/webapp/chat" 
                    scrolling="no" 
                    style="position:absolute; top:-10px; left:-75px; width:calc(100% + 95px); height:calc(100% + 0px); border:none; overflow:hidden;">
                </iframe>
            </div>
        `;
        document.body.appendChild(sidebar);
    }
}

// ২. টগল ফাংশন
window.toggleAISidebar = function() {
    let sidebar = document.getElementById('ai-sidebar');
    if (sidebar) {
        if (sidebar.style.display === 'none') {
            sidebar.style.display = 'flex';
            setTimeout(() => sidebar.classList.add('active'), 10);
        } else {
            sidebar.classList.toggle('active');
        }
    }
}

// ৩. অটো-লোড
window.addEventListener('DOMContentLoaded', (event) => {
    window.initAISidebar();

});
