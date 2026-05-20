import * as fflate from 'fflate';

/**
 * Lossless compression using gzip via fflate
 */
export const compressionService = {
  async compressFile(file: File | Blob): Promise<Blob> {
    const buffer = new Uint8Array(await file.arrayBuffer());
    return new Promise((resolve, reject) => {
      fflate.gzip(buffer, { level: 9 }, (err, data) => {
        if (err) reject(err);
        else resolve(new Blob([data], { type: file.type }));
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
