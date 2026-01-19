// ইন্টারনেট কানেকশন চেক
window.addEventListener('online', () => {
    document.getElementById('no-internet').style.display = 'none';
});
window.addEventListener('offline', () => {
    document.getElementById('no-internet').style.display = 'block';
});

// কন্টাক্ট অ্যাড করার ফাংশন (বটম শিট থেকে কল হয়)
async function addNewContact() {
    const name = document.getElementById('new-name').value;
    const number = document.getElementById('new-number').value;
    if (name && number) {
        await saveContact(name, number, "all");
        renderContacts('all');
        closeBottomSheet();
    }
}

// মিউট এবং স্পিকার লজিক (বেসিক)
let isMuted = false;
document.getElementById('mute-btn').addEventListener('click', () => {
    isMuted = !isMuted;
    localStream.getAudioTracks()[0].enabled = !isMuted;
    document.getElementById('mute-btn').style.background = isMuted ? 'red' : 'rgba(255,255,255,0.1)';
});

// শুরুর প্রোফাইল লোড হলে PeerJS চালু করা
const savedProfile = JSON.parse(localStorage.getItem('myProfile'));
if (savedProfile) {
    initPeer(savedProfile.number);
}

// অনলাইন স্ট্যাটাস আপডেট করার ফাংশন (নমুনা)
function updateOnlineStatus(status) {
    // এখানে আপনি নিজের স্ট্যাটাস কোনো সার্ভারে পাঠাতে পারেন
    // আপাতত এটি লোকাল ইন্ডিকেটর হিসেবে কাজ করবে
    console.log(status ? "You are Online" : "You are Offline");
}