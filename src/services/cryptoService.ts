/**
 * End-to-End Encryption (E2EE) using WebCrypto API
 * Uses ECDH for key exchange and AES-GCM for message/file encryption
 */

import { auth } from '../firebase';

export class CryptoService {
  private keyPair: CryptoKeyPair | null = null;
  private currentUserId: string | null = null;
  private derivedKeys: Map<string, CryptoKey> = new Map();

  async initKeys(userId?: string) {
    const activeUserId = userId || auth.currentUser?.uid || "default_user";
    if (this.keyPair && this.currentUserId === activeUserId) return;

    const storageKey = `e2e_keys_${activeUserId}`;
    let cached: string | null = null;
    try {
      cached = typeof window !== 'undefined' ? localStorage.getItem(storageKey) : null;
    } catch (e) {
      console.warn("localStorage is not accessible:", e);
    }

    if (cached) {
      try {
        const { publicJwk, privateJwk } = JSON.parse(cached);
        const publicKey = await crypto.subtle.importKey(
          "jwk",
          publicJwk,
          { name: "ECDH", namedCurve: "P-256" },
          true,
          []
        );
        const privateKey = await crypto.subtle.importKey(
          "jwk",
          privateJwk,
          { name: "ECDH", namedCurve: "P-256" },
          true,
          ["deriveKey"]
        );
        this.keyPair = { publicKey, privateKey };
        this.currentUserId = activeUserId;
        return;
      } catch (err) {
        console.error("Failed to import E2E keys from localStorage, regenerating...", err);
      }
    }

    // Generate brand new keys if not found or import failed
    this.keyPair = await crypto.subtle.generateKey(
      {
        name: "ECDH",
        namedCurve: "P-256",
      },
      true,
      ["deriveKey"]
    );
    this.currentUserId = activeUserId;

    try {
      const publicJwk = await crypto.subtle.exportKey("jwk", this.keyPair.publicKey);
      const privateJwk = await crypto.subtle.exportKey("jwk", this.keyPair.privateKey);
      if (typeof window !== 'undefined') {
        localStorage.setItem(storageKey, JSON.stringify({ publicJwk, privateJwk }));
      }
    } catch (err) {
      console.error("Failed to save E2E keys to localStorage", err);
    }
  }

  async getMyPublicKeyBase64(userId?: string): Promise<string> {
    await this.initKeys(userId);
    const exported = await crypto.subtle.exportKey("spki", this.keyPair!.publicKey);
    return btoa(String.fromCharCode(...new Uint8Array(exported)));
  }

  private async importPublicKey(base64Key: string): Promise<CryptoKey> {
    const raw = atob(base64Key);
    const buf = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) buf[i] = raw.charCodeAt(i);
    
    return await crypto.subtle.importKey(
      "spki",
      buf,
      { name: "ECDH", namedCurve: "P-256" },
      true,
      []
    );
  }

  async deriveSharedSecret(remoteUserId: string, remotePublicKeyBase64: string, myUserId?: string): Promise<CryptoKey> {
    const activeUserId = myUserId || auth.currentUser?.uid || "default_user";
    const cacheKey = `${activeUserId}_${remoteUserId}`;
    if (this.derivedKeys.has(cacheKey)) return this.derivedKeys.get(cacheKey)!;
    
    await this.initKeys(activeUserId);
    const remoteKey = await this.importPublicKey(remotePublicKeyBase64);
    
    const sharedSecret = await crypto.subtle.deriveKey(
      {
        name: "ECDH",
        public: remoteKey
      },
      this.keyPair!.privateKey,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"]
    );
    
    this.derivedKeys.set(cacheKey, sharedSecret);
    return sharedSecret;
  }

  async encryptText(text: string, sharedSecret: CryptoKey) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(text);
    const ciphertext = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      sharedSecret,
      encoded
    );
    return {
      iv: Array.from(iv),
      ciphertext: Array.from(new Uint8Array(ciphertext))
    };
  }

  async decryptText(ivArray: number[], ciphertextArray: number[], sharedSecret: CryptoKey) {
    const iv = new Uint8Array(ivArray);
    const ciphertext = new Uint8Array(ciphertextArray);
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      sharedSecret,
      ciphertext
    );
    return new TextDecoder().decode(decrypted);
  }

  async encryptFile(blob: Blob, sharedSecret: CryptoKey) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const arrayBuffer = await blob.arrayBuffer();
    const ciphertext = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      sharedSecret,
      arrayBuffer
    );
    return {
      iv: Array.from(iv),
      encryptedBlob: new Blob([ciphertext])
    };
  }

  async decryptFile(encryptedBlob: Blob, ivArray: number[], sharedSecret: CryptoKey, fileType: string) {
    const iv = new Uint8Array(ivArray);
    const arrayBuffer = await encryptedBlob.arrayBuffer();
    const decryptedBuffer = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      sharedSecret,
      arrayBuffer
    );
    return new Blob([decryptedBuffer], { type: fileType });
  }
}

export const cryptoService = new CryptoService();
