/* ==========================================
   1. CONFIGURATIONS
   ========================================== */
// TODO: আপনার ImgBB API Key এখানে বসান
const IMGBB_API_KEY = "da21bb336d82acfe943456ba0c162b3f";

// TODO: আপনার Firebase Config কনসোল থেকে কপি করে এখানে বসান
const firebaseConfig = {
  apiKey: "AIzaSyAGaSsz3SZtOKJhFQ_cGfiNfjuKPHHiFRs",
  authDomain: "imgbiswa.firebaseapp.com",
  databaseURL: "https://imgbiswa-default-rtdb.firebaseio.com",
  projectId: "imgbiswa",
  storageBucket: "imgbiswa.firebasestorage.app",
  messagingSenderId: "650987357047",
  appId: "1:650987357047:web:22f6df675e37e469e89772",
  measurementId: "G-CGW6TC9TGV"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

/* ==========================================
   2. INDEXEDDB LOCAL STORAGE ENGINE
   ========================================== */
const DB_NAME = "MiniSocialDB";
const DB_VERSION = 1;
let indexedDBInstance = null;

function initIndexedDB() {
    return new Promise((resolve, reject) => {
        const request = window.indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = (e) => reject("IndexedDB error: " + e.target.errorCode);

        request.onsuccess = (e) => {
            indexedDBInstance = e.target.result;
            resolve(indexedDBInstance);
        };

        request.onupgradeneeded = (e) => {
            const idb = e.target.result;
            if (!idb.objectStoreNames.contains("currentUser")) {
                idb.createObjectStore("currentUser", { keyPath: "mobileNumber" });
            }
            if (!idb.objectStoreNames.contains("cachedFollowing")) {
                idb.createObjectStore("cachedFollowing", { keyPath: "mobileNumber" });
            }
        };
    });
}

// Local User Save & Get
async function saveLocalUser(userData) {
    if (!indexedDBInstance) await initIndexedDB();
    return new Promise((resolve, reject) => {
        const tx = indexedDBInstance.transaction(["currentUser"], "readwrite");
        const store = tx.objectStore("currentUser");
        store.clear(); // Keep only active session
        const req = store.put(userData);
        req.onsuccess = () => resolve(true);
        req.onerror = () => reject(false);
    });
}

async function getLocalUser() {
    if (!indexedDBInstance) await initIndexedDB();
    return new Promise((resolve) => {
        const tx = indexedDBInstance.transaction(["currentUser"], "readonly");
        const store = tx.objectStore("currentUser");
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result[0] || null);
        req.onerror = () => resolve(null);
    });
}

async function clearLocalUser() {
    if (!indexedDBInstance) await initIndexedDB();
    const tx = indexedDBInstance.transaction(["currentUser"], "readwrite");
    tx.objectStore("currentUser").clear();
}

// Cache Following Profiles locally
async function cacheFollowingUser(userObj) {
    if (!indexedDBInstance) await initIndexedDB();
    const tx = indexedDBInstance.transaction(["cachedFollowing"], "readwrite");
    tx.objectStore("cachedFollowing").put(userObj);
}

async function getCachedFollowingList() {
    if (!indexedDBInstance) await initIndexedDB();
    return new Promise((resolve) => {
        const tx = indexedDBInstance.transaction(["cachedFollowing"], "readonly");
        const req = tx.objectStore("cachedFollowing").getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => resolve([]);
    });
}

/* ==========================================
   3. CLIENT-SIDE IMAGE COMPRESSION (CANVAS)
   ========================================== */
function compressImage(file, maxWidth = 1080, quality = 0.7) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                const canvas = document.createElement("canvas");
                let width = img.width;
                let height = img.height;

                if (width > maxWidth) {
                    height = Math.round((height * maxWidth) / width);
                    width = maxWidth;
                }

                canvas.width = width;
                canvas.height = height;

                const ctx = canvas.getContext("2d");
                ctx.drawImage(img, 0, 0, width, height);

                canvas.toBlob(
                    (blob) => {
                        if (blob) resolve(blob);
                        else reject(new Error("Image Compression Failed"));
                    },
                    "image/jpeg",
                    quality
                );
            };
        };
        reader.onerror = (error) => reject(error);
    });
}

/* ==========================================
   4. IMGBB UPLOAD ENGINE
   ========================================== */
async function uploadToImgBB(fileBlob) {
    const formData = new FormData();
    formData.append("image", fileBlob);

    const response = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, {
        method: "POST",
        body: formData
    });

    const data = await response.json();
    if (data && data.success) {
        return data.data.url; // Returns direct Image URL
    } else {
        throw new Error("ImgBB Upload Failed!");
    }
}

/* ==========================================
   5. FIRESTORE DATABASE ACTIONS
   ========================================== */
// User Actions
async function registerUserInFirestore(userData) {
    await db.collection("users").doc(userData.mobileNumber).set(userData);
}

async function getUserFromFirestore(mobileNumber) {
    const doc = await db.collection("users").doc(mobileNumber).get();
    return doc.exists ? doc.data() : null;
}

async function getAllUsersFromFirestore() {
    const snapshot = await db.collection("users").get();
    const users = [];
    snapshot.forEach((doc) => users.push(doc.data()));
    return users;
}

// Follow/Unfollow Logic
async function toggleFollowUser(currentMobile, targetMobile, isFollowing) {
    const userRef = db.collection("users").doc(currentMobile);
    if (isFollowing) {
        await userRef.update({
            following: firebase.firestore.FieldValue.arrayRemove(targetMobile)
        });
    } else {
        await userRef.update({
            following: firebase.firestore.FieldValue.arrayUnion(targetMobile)
        });
    }
}

// Post Actions
async function createPostInFirestore(postData) {
    return await db.collection("posts").add(postData);
}

async function getPostsFromFirestore() {
    const snapshot = await db.collection("posts").get();
    const posts = [];
    snapshot.forEach((doc) => posts.push({ id: doc.id, ...doc.data() }));
    // Client-side sort: Latest first
    return posts.reverse();
}

async function deletePostFromFirestore(postId) {
    await db.collection("posts").doc(postId).delete();
}