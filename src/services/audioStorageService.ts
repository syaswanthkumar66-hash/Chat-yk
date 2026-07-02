class AudioStorageService {
  private dbName = 'audio-storage-db';
  private storeName = 'audio-chunks';
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

  /**
   * Save an audio chunk to the IndexedDB.
   */
  async saveChunk(transferId: string, chunkIndex: number, offset: number, data: string): Promise<void> {
    try {
      const db = await this.getDB();
      return new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(this.storeName, 'readwrite');
        const store = transaction.objectStore(this.storeName);
        // Use composite key padding to prevent sort issues and support range bounds:
        const key = `${transferId}_${chunkIndex.toString().padStart(6, '0')}`;
        const record = {
          transferId,
          chunkIndex,
          offset,
          data,
          timestamp: Date.now()
        };
        const request = store.put(record, key);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    } catch (e) {
      console.error('Error saving audio chunk to IndexedDB:', e);
    }
  }

  /**
   * Get all chunks for a specific transferId, sorted by chunkIndex.
   */
  async getChunks(transferId: string): Promise<{ chunkIndex: number; offset: number; data: string }[]> {
    try {
      const db = await this.getDB();
      return new Promise((resolve) => {
        const transaction = db.transaction(this.storeName, 'readonly');
        const store = transaction.objectStore(this.storeName);
        const keyRange = IDBKeyRange.bound(`${transferId}_`, `${transferId}_\uffff`);
        const request = store.openCursor(keyRange);
        const results: { chunkIndex: number; offset: number; data: string }[] = [];

        request.onsuccess = (event: any) => {
          const cursor = event.target.result;
          if (cursor) {
            results.push(cursor.value);
            cursor.continue();
          } else {
            // Explicitly sort by chunkIndex to ensure reassembly in correct sequence order
            results.sort((a, b) => a.chunkIndex - b.chunkIndex);
            resolve(results);
          }
        };

        request.onerror = () => {
          resolve([]);
        };
      });
    } catch (e) {
      console.error('Error retrieving audio chunks from IndexedDB:', e);
      return [];
    }
  }

  /**
   * Reassemble fragmented audio chunks into a fully functional Blob.
   */
  async reassembleAudio(transferId: string, mimeType: string, totalChunks: number): Promise<Blob | null> {
    try {
      const chunks = await this.getChunks(transferId);
      if (chunks.length === 0) {
        console.warn(`No chunks found for transferId ${transferId}`);
        return null;
      }

      if (chunks.length < totalChunks) {
        console.warn(`Reassembly requested but only ${chunks.length}/${totalChunks} chunks are stored.`);
      }

      // Convert sorted chunks from Base64 to Uint8Array
      const byteArrays = chunks.map(chunk => {
        const byteCharacters = atob(chunk.data);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        return new Uint8Array(byteNumbers);
      });

      return new Blob(byteArrays, { type: mimeType });
    } catch (e) {
      console.error('Error reassembling audio from IndexedDB chunks:', e);
      return null;
    }
  }

  /**
   * Delete stored chunks for a transferId.
   */
  async clearChunks(transferId: string): Promise<void> {
    try {
      const db = await this.getDB();
      return new Promise<void>((resolve) => {
        const transaction = db.transaction(this.storeName, 'readwrite');
        const store = transaction.objectStore(this.storeName);
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
      console.error('Error clearing audio chunks from IndexedDB:', e);
    }
  }
}

export const audioStorageService = new AudioStorageService();
