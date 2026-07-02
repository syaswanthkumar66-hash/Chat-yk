class VoiceNoteCache {
  private dbName = 'voice-note-cache-db';
  private storeName = 'voice-notes';
  private chunkStoreName = 'voice-chunks';
  private dbPromise: Promise<IDBDatabase> | null = null;

  private getDB(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise((resolve, reject) => {
      // Upgrade database to version 2 to create 'voice-chunks' store
      const request = indexedDB.open(this.dbName, 2);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName);
        }
        if (!db.objectStoreNames.contains(this.chunkStoreName)) {
          db.createObjectStore(this.chunkStoreName);
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

  // --- Existing cache methods for fully reassembled voice notes ---
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

  // --- New methods for chunk-based persistent storage ---
  async saveChunk(transferId: string, chunkIndex: number, offset: number, data: string): Promise<void> {
    try {
      const db = await this.getDB();
      return new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(this.chunkStoreName, 'readwrite');
        const store = transaction.objectStore(this.chunkStoreName);
        // Use a composite padded key to enable range queries: "transferId_chunkIndex"
        const key = `${transferId}_${chunkIndex.toString().padStart(6, '0')}`;
        const record = {
          transferId,
          chunkIndex,
          offset,
          data
        };
        const request = store.put(record, key);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    } catch (e) {
      console.error('Error saving chunk to VoiceNoteCache:', e);
    }
  }

  async getChunks(transferId: string): Promise<{ chunkIndex: number; offset: number; data: string }[]> {
    try {
      const db = await this.getDB();
      return new Promise((resolve) => {
        const transaction = db.transaction(this.chunkStoreName, 'readonly');
        const store = transaction.objectStore(this.chunkStoreName);
        
        // Use standard key range search to find all chunks for this transfer ID
        const keyRange = IDBKeyRange.bound(`${transferId}_`, `${transferId}_\uffff`);
        const request = store.openCursor(keyRange);
        const results: { chunkIndex: number; offset: number; data: string }[] = [];

        request.onsuccess = (event: any) => {
          const cursor = event.target.result;
          if (cursor) {
            results.push(cursor.value);
            cursor.continue();
          } else {
            // Sort by chunkIndex to ensure proper order
            results.sort((a, b) => a.chunkIndex - b.chunkIndex);
            resolve(results);
          }
        };

        request.onerror = () => {
          resolve([]);
        };
      });
    } catch (e) {
      console.error('Error getting chunks from VoiceNoteCache:', e);
      return [];
    }
  }

  async clearChunks(transferId: string): Promise<void> {
    try {
      const db = await this.getDB();
      return new Promise<void>((resolve) => {
        const transaction = db.transaction(this.chunkStoreName, 'readwrite');
        const store = transaction.objectStore(this.chunkStoreName);
        const keyRange = IDBKeyRange.bound(`${transferId}_`, `${transferId}_\uffff`);
        const request = store.openCursor(keyRange);

        request.onsuccess = (event: any) => {
          const cursor = event.target.result;
          if (cursor) {
            cursor.delete();
            cursor.continue();
          } else {
            resolve();
          }
        };

        request.onerror = () => {
          resolve();
        };
      });
    } catch (e) {
      console.error('Error clearing chunks from VoiceNoteCache:', e);
    }
  }
}

export const voiceNoteCache = new VoiceNoteCache();
