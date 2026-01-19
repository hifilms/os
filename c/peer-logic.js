let peer;
let localStream;
let currentCall;

const initPeer = (myNumber) => {
    // মোবাইল নাম্বারকে আইডি হিসেবে ব্যবহার করে পিয়ার তৈরি
    peer = new Peer(myNumber);

    peer.on('open', (id) => {
        console.log('My peer ID is: ' + id);
        updateOnlineStatus(true);
    });

    // ইনকামিং কল হ্যান্ডলার
    peer.on('call', (call) => {
        const incomingPopup = document.getElementById('incoming-popup');
        const callerNum = call.peer;
        
        // মেটাডেটা থেকে কলারের নাম চেক করা (আমরা পরে অ্যাড করব)
        document.getElementById('in-caller-name').innerText = "Incoming Call";
        document.getElementById('in-caller-number').innerText = callerNum;
        incomingPopup.classList.add('show');

        document.getElementById('accept-call').onclick = () => {
            incomingPopup.classList.remove('show');
            navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
                localStream = stream;
                call.answer(stream);
                handleCallStream(call);
            });
        };

        document.getElementById('decline-call').onclick = () => {
            call.close();
            incomingPopup.classList.remove('show');
        };
    });

    peer.on('error', (err) => {
        console.error('PeerJS Error:', err);
        if(err.type === 'peer-unavailable') alert('ইউজারটি বর্তমানে অফলাইনে আছে');
    });
};

// কল শুরু করা
const startCall = (remoteNumber, remoteName) => {
    document.getElementById('call-screen').classList.add('active');
    document.getElementById('call-name').innerText = remoteName;
    document.getElementById('call-number').innerText = remoteNumber;
    document.getElementById('call-status').innerText = "Calling...";

    navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
        localStream = stream;
        const call = peer.call(remoteNumber, stream);
        handleCallStream(call);
    }).catch(err => {
        alert("মাইক্রোফোন পারমিশন প্রয়োজন!");
        document.getElementById('call-screen').classList.remove('active');
    });
};

// স্ট্রিম হ্যান্ডেল করা (অডিও শোনা)
const handleCallStream = (call) => {
    currentCall = call;
    call.on('stream', (remoteStream) => {
        const audio = document.getElementById('remote-audio');
        audio.srcObject = remoteStream;
        audio.play();
        document.getElementById('call-status').innerText = "Connected";
    });

    call.on('close', () => {
        endCallUI();
    });
};

const endCallUI = () => {
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
    }
    document.getElementById('call-screen').classList.remove('active');
    document.getElementById('remote-audio').srcObject = null;
};

document.getElementById('hangup-btn').addEventListener('click', () => {
    if (currentCall) currentCall.close();
    endCallUI();
});