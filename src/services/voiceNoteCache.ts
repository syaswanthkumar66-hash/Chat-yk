class VoiceNoteCache {
  private dbName = 'voice-note-cache-db';
  private storeName = 'voice-notes';
  private dbPromise: Promise<IDBDatabase> | null = null;

  private getDB(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName);
        }
      };
      request.onsuccess = () => {
        resolve(request.result);
      };
      request.onerror = () => {
        reject(request.error);
      };
    });

    return this.dbPromise;
  }

  async get(id: string): Promise<Blob | null> {
    try {
      const db = await this.getDB();
      return new Promise((resolve) => {
        const transaction = db.transaction(this.storeName, 'readonly');
        const store = transaction.objectStore(this.storeName);
        const request = store.get(id);
        request.onsuccess = () => {
          resolve(request.result || null);
        };
        request.onerror = () => {
          resolve(null);
        };
      });
    } catch (e) {
      console.error('Error fetching from VoiceNoteCache:', e);
      return null;
    }
  }

  async set(id: string, blob: Blob): Promise<void> {
    try {
      const db = await this.getDB();
      return new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(this.storeName, 'readwrite');
        const store = transaction.objectStore(this.storeName);
        const request = store.put(blob, id);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    } catch (e) {
      console.error('Error saving to VoiceNoteCache:', e);
    }
  }
}

export const voiceNoteCache = new VoiceNoteCache();
