// IndexedDB Setup
const dbName = "PrivateCallDB";
let db;

const initDB = () => {
    return new Promise((resolve) => {
        const request = indexedDB.open(dbName, 1);
        request.onupgradeneeded = (e) => {
            db = e.target.result;
            if (!db.objectStoreNames.contains("contacts")) {
                db.createObjectStore("contacts", { keyPath: "number" });
            }
        };
        request.onsuccess = (e) => {
            db = e.target.result;
            resolve(db);
        };
    });
};

// কন্টাক্ট সেভ করা (All, Unknown, Blocked handles via status property)
const saveContact = async (name, number, status = "all") => {
    const transaction = db.transaction(["contacts"], "readwrite");
    const store = transaction.objectStore("contacts");
    await store.put({ name, number, status });
};

const getContacts = () => {
    return new Promise((resolve) => {
        const transaction = db.transaction(["contacts"], "readonly");
        const store = transaction.objectStore("contacts");
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result);
    });
};

const deleteContact = async (number) => {
    const transaction = db.transaction(["contacts"], "readwrite");
    const store = transaction.objectStore("contacts");
    await store.delete(number);
};