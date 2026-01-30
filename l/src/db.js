const DB_NAME = 'WhatsappP2P_DB';
const DB_VERSION = 2;

class Store {
    constructor() {
        this.db = null;
    }

    async open() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onerror = (event) => reject('Database error: ' + event.target.errorCode);

            request.onupgradeneeded = (event) => {
                this.db = event.target.result;

                // User Profile Store
                if (!this.db.objectStoreNames.contains('profile')) {
                    this.db.createObjectStore('profile', { keyPath: 'id' });
                }

                // Contacts Store
                if (!this.db.objectStoreNames.contains('contacts')) {
                    this.db.createObjectStore('contacts', { keyPath: 'mobile' });
                }

                // Messages Store
                if (!this.db.objectStoreNames.contains('messages')) {
                    const msgStore = this.db.createObjectStore('messages', { keyPath: 'id', autoIncrement: true });
                    msgStore.createIndex('peerId', 'peerId', { unique: false });
                }

                // Settings Store (for Blacklist etc)
                if (!this.db.objectStoreNames.contains('settings')) {
                    this.db.createObjectStore('settings', { keyPath: 'id' });
                }
            };

            request.onsuccess = (event) => {
                this.db = event.target.result;
                resolve(this.db);
            };
        });
    }

    // Profile Methods
    async getProfile() {
        return this._get('profile', 'me');
    }

    async saveProfile(mobile, name, avatar = null) {
        return this._put('profile', { id: 'me', mobile, name, avatar });
    }

    // Contact Methods
    async getContacts() {
        return this._getAll('contacts');
    }

    async addContact(mobile, name, avatar = null) {
        return this._put('contacts', { mobile, name, avatar });
    }

    async updateContactAvatar(mobile, avatar) {
        const contact = await this._get('contacts', mobile);
        if (contact) {
            contact.avatar = avatar;
            return this._put('contacts', contact);
        }
    }

    // Message Methods
    async getMessages(peerId) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['messages'], 'readonly');
            const store = transaction.objectStore('messages');
            const index = store.index('peerId');
            const request = index.getAll(IDBKeyRange.only(peerId));

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async getLastMessage(peerId) {
        return new Promise((resolve, reject) => {
            try {
                const transaction = this.db.transaction(['messages'], 'readonly');
                const store = transaction.objectStore('messages');
                const index = store.index('peerId');
                const request = index.openCursor(IDBKeyRange.only(peerId), 'prev');

                request.onsuccess = (event) => {
                    const cursor = event.target.result;
                    resolve(cursor ? cursor.value : null);
                };
                request.onerror = () => reject(request.error);
            } catch (e) {
                reject(e);
            }
        });
    }

    async addMessage(msg) {
        // msg: { peerId, from, to, content, timestamp, isMine }
        return this._put('messages', msg);
    }

    async clearChat(peerId) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['messages'], 'readwrite');
            const store = transaction.objectStore('messages');
            const index = store.index('peerId');
            const request = index.openCursor(IDBKeyRange.only(peerId));
            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    // Don't delete system messages (like block notifications)
                    if (cursor.value.type !== 'system') {
                        store.delete(cursor.primaryKey);
                    }
                    cursor.continue();
                } else {
                    resolve();
                }
            };
            request.onerror = () => reject(request.error);
        });
    }

    async deleteContact(mobile) {
        await this._delete('contacts', mobile);
        await this.clearChat(mobile);
    }

    async deleteMessage(id) {
        return this._delete('messages', id);
    }

    async _delete(storeName, key) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.delete(key);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    async clearData() {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['profile', 'contacts', 'messages'], 'readwrite');
            transaction.objectStore('profile').clear();
            transaction.objectStore('contacts').clear();
            transaction.objectStore('messages').clear();
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error);
        });
    }

    async updateMessageStatus(id, status) {
        const msg = await this._get('messages', id);
        if (msg) {
            msg.status = status;
            return this._put('messages', msg);
        }
    }

    async markMessagesAsSeen(peerId) {
        return new Promise((resolve, reject) => {
            try {
                const transaction = this.db.transaction(['messages'], 'readwrite');
                const store = transaction.objectStore('messages');
                const index = store.index('peerId');
                const request = index.openCursor(IDBKeyRange.only(peerId));

                request.onsuccess = (event) => {
                    const cursor = event.target.result;
                    if (cursor) {
                        const msg = cursor.value;
                        if (msg.isMine && msg.status !== 'seen') {
                            msg.status = 'seen';
                            cursor.update(msg);
                        }
                        cursor.continue();
                    } else {
                        resolve();
                    }
                };
                request.onerror = () => reject(request.error);
            } catch (e) {
                reject(e);
            }
        });
    }

    async getPendingMessages(peerId) {
        const msgs = await this.getMessages(peerId);
        return msgs.filter(m => m.status === 'pending');
    }

    // Generic Helpers
    _get(storeName, key) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.get(key);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    _getAll(storeName) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    _put(storeName, data) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.put(data);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }
}

export const db = new Store();
