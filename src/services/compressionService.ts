import * as fflate from 'fflate';

/**
 * Lossless gzip compression + smart canvas image downscaling
 */
export const compressionService = {
  async compressImage(file: Blob, maxWidth = 1600, maxHeight = 1600, quality = 0.82): Promise<Blob> {
    if (!file.type || !file.type.startsWith('image/') || file.type.includes('svg') || file.type.includes('gif')) {
      return file;
    }
    return new Promise((resolve) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        let width = img.naturalWidth || img.width;
        let height = img.naturalHeight || img.height;

        if (width > maxWidth || height > maxHeight) {
          if (width > height) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          } else {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(file);
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob((blob) => {
          resolve(blob || file);
        }, 'image/jpeg', quality);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(file);
      };
      img.src = url;
    });
  },

  async compressFile(file: File | Blob): Promise<Blob> {
    let processed: Blob = file;
    if (file.type && file.type.startsWith('image/')) {
      try {
        processed = await this.compressImage(file);
      } catch (e) {
        console.warn("Image downscaling failed, using original:", e);
      }
    }
    const buffer = new Uint8Array(await processed.arrayBuffer());
    return new Promise((resolve, reject) => {
      fflate.gzip(buffer, { level: 9 }, (err, data) => {
        if (err) reject(err);
        else resolve(new Blob([data], { type: processed.type }));
      });
    });
  },

  async decompressFile(blob: Blob): Promise<Blob> {
    const buffer = new Uint8Array(await blob.arrayBuffer());
    return new Promise((resolve, reject) => {
      fflate.gunzip(buffer, (err, data) => {
        if (err) reject(err);
        else resolve(new Blob([data], { type: blob.type }));
      });
    });
  }
};

