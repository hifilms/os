const dbName = "GeminiOS_DB";
const dbVersion = 1;

// ডাটাবেস ওপেন করার ফাংশন
function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(dbName, dbVersion);

        // প্রথমবার ডাটাবেস তৈরি বা ভার্সন আপডেট হলে এটি কল হবে
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains("installed_apps")) {
                // 'id' কে কি-পাথ হিসেবে রেখে স্টোর তৈরি করা হচ্ছে
                db.createObjectStore("installed_apps", { keyPath: "id" });
            }
        };

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

// নতুন অ্যাপ ইন্সটল (সেভ) করার ফাংশন
async function installApp(app) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction("installed_apps", "readwrite");
        const store = tx.objectStore("installed_apps");
        const request = store.put(app); // অ্যাপ ডাটা সেভ করা

        request.onsuccess = () => {
            console.log(`${app.name} installed successfully!`);
            resolve(true);
        };
        request.onerror = () => reject(request.error);
    });
}

// ইন্সটল করা সব অ্যাপের লিস্ট পাওয়ার ফাংশন
async function getInstalledApps() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction("installed_apps", "readonly");
        const store = tx.objectStore("installed_apps");
        const request = store.getAll(); // সব ডাটা নিয়ে আসা

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

// অ্যাপ আন-ইন্সটল করার ফাংশন (ভবিষ্যতের জন্য)
async function uninstallApp(id) {
    const db = await openDB();
    const tx = db.transaction("installed_apps", "readwrite");
    const store = tx.objectStore("installed_apps");
    store.delete(id);
    return tx.complete;
}


async function clearAppDatabase() {
    // যদি আপনি IndexedDB ব্যবহার করেন
    const db = await openDB(); // আপনার ডাটাবেজ ওপেন করার ফাংশন
    const tx = db.transaction('apps', 'readwrite');
    await tx.objectStore('apps').clear();
    await tx.done;
}