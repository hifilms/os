const DB_NAME = 'EduBoardStudioDB';
const DB_VERSION = 1;
const STORE_PROJECTS = 'projects';
const STORE_SETTINGS = 'settings';

const AppDB = {
  db: null,

  async init() {
    if (this.db) return this.db;
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_PROJECTS)) {
          db.createObjectStore(STORE_PROJECTS, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORE_SETTINGS)) {
          db.createObjectStore(STORE_SETTINGS, { keyPath: 'key' });
        }
      };
      req.onsuccess = () => {
        this.db = req.result;
        resolve(this.db);
      };
      req.onerror = () => reject(req.error);
    });
  },

  async getAllProjects() {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_PROJECTS, 'readonly');
      const req = tx.objectStore(STORE_PROJECTS).getAll();
      req.onsuccess = () => {
        const list = req.result || [];
        list.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
        resolve(list);
      };
      req.onerror = () => reject(req.error);
    });
  },

  async getProject(id) {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_PROJECTS, 'readonly');
      const req = tx.objectStore(STORE_PROJECTS).get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  },

  async saveProject(project) {
    const db = await this.init();
    project.updatedAt = Date.now();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_PROJECTS, 'readwrite');
      const req = tx.objectStore(STORE_PROJECTS).put(project);
      req.onsuccess = () => resolve(project);
      req.onerror = () => reject(req.error);
    });
  },

  async deleteProject(id) {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_PROJECTS, 'readwrite');
      const req = tx.objectStore(STORE_PROJECTS).delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  },

  async getSetting(key) {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_SETTINGS, 'readonly');
      const req = tx.objectStore(STORE_SETTINGS).get(key);
      req.onsuccess = () => resolve(req.result ? req.result.value : null);
      req.onerror = () => reject(req.error);
    });
  },

  async setSetting(key, value) {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_SETTINGS, 'readwrite');
      const req = tx.objectStore(STORE_SETTINGS).put({ key, value });
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  },

  async checkStorageStatus() {
    let usedBytes = 0;
    let quotaBytes = 0;
    let ratio = 0;

    if (navigator.storage && navigator.storage.estimate) {
      const est = await navigator.storage.estimate();
      usedBytes = est.usage || 0;
      quotaBytes = est.quota || 0;
      ratio = quotaBytes > 0 ? usedBytes / quotaBytes : 0;
    }

    const projects = await this.getAllProjects();
    let videoBytes = 0;
    projects.forEach((p) => {
      if (p.recordingBlob && p.recordingBlob.size) {
        videoBytes += p.recordingBlob.size;
      }
    });

    // Warn when quota > 75% OR stored videos exceed 500 MB
    const isNearLimit = ratio >= 0.75 || videoBytes >= 500 * 1024 * 1024;
    return { usedBytes, quotaBytes, videoBytes, ratio, isNearLimit };
  }
};