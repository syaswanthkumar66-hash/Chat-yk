/**
 * End-to-End Encryption (E2EE) using WebCrypto API
 * Uses ECDH for key exchange and AES-GCM for message/file encryption
 */

import { auth } from '../firebase';

export class CryptoService {
  private keyPair: CryptoKeyPair | null = null;
  private currentUserId: string | null = null;
  private derivedKeys: Map<string, CryptoKey> = new Map();

  clearState() {
    this.keyPair = null;
    this.currentUserId = null;
    this.derivedKeys.clear();
  }

  async initKeys(userId?: string) {
    const activeUserId = userId || auth.currentUser?.uid || "default_user";
    if (this.keyPair && this.currentUserId === activeUserId) return;

    // Retrieve the user's Gmail / email address from auth, or fallback to storage or standard suffix
    let email = auth.currentUser?.email;
    if (!email) {
      try {
        const storeUser = (await import('../store')).useAppStore.getState().user;
        if (storeUser?.email) {
          email = storeUser.email;
        }
      } catch (e) {
        console.warn("Could not import useAppStore to retrieve email:", e);
      }
    }
    if (!email) {
      email = `${activeUserId}@protocol.net`;
    }

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
        console.error("Failed to import E2E keys from localStorage, attempting Firestore PBKDF2 restoration...", err);
      }
    }

    // ─── FIRESTORE GMAIL-KEY RESTORATION ───
    try {
      const { db, getDoc, doc } = await import('../firebase');
      const userDoc = await getDoc(doc(db, 'users', activeUserId));
      if (userDoc && userDoc.exists()) {
        const userData = userDoc.data();
        if (userData.encryptedPrivateKey && userData.privateKeyIv && userData.publicKeyJwk) {
          console.log("Restoring E2E keys encrypted using Gmail key from Firestore backup...");
          const masterKey = await this.deriveMasterKeyFromEmail(email, activeUserId);

          const iv = new Uint8Array(atob(userData.privateKeyIv).split('').map(c => c.charCodeAt(0)));
          const ciphertext = new Uint8Array(atob(userData.encryptedPrivateKey).split('').map(c => c.charCodeAt(0)));

          const decryptedBytes = await crypto.subtle.decrypt(
            { name: "AES-GCM", iv },
            masterKey,
            ciphertext
          );

          const privateJwk = JSON.parse(new TextDecoder().decode(decryptedBytes));
          const publicJwk = userData.publicKeyJwk;

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

          if (typeof window !== 'undefined') {
            localStorage.setItem(storageKey, JSON.stringify({ publicJwk, privateJwk }));
          }
          console.log("E2E keys successfully restored and decrypted using Gmail key!");
          return;
        }
      }
    } catch (e) {
      console.warn("Could not restore E2E keys from Firestore backup:", e);
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

      // Secure backup to Firestore using Gmail-derived master key
      const masterKey = await this.deriveMasterKeyFromEmail(email, activeUserId);
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const encryptedPrivateBytes = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        masterKey,
        new TextEncoder().encode(JSON.stringify(privateJwk))
      );

      const encryptedPrivateKeyBase64 = btoa(String.fromCharCode(...new Uint8Array(encryptedPrivateBytes)));
      const ivBase64 = btoa(String.fromCharCode(...iv));

      const { db, doc, updateDoc } = await import('../firebase');
      await updateDoc(doc(db, 'users', activeUserId), {
        publicKeyJwk: publicJwk,
        encryptedPrivateKey: encryptedPrivateKeyBase64,
        privateKeyIv: ivBase64,
        publicKey: await this.getMyPublicKeyBase64(activeUserId)
      });
      console.log("Secure E2E key pair created and synced to Firestore (encrypted via user's Gmail/email key).");
    } catch (err) {
      console.error("Failed to save and back up E2E keys to Firestore:", err);
    }
  }

  // Derive a strong AES-256 GCM key from the user's Gmail/email
  private async deriveMasterKeyFromEmail(email: string, userId: string): Promise<CryptoKey> {
    const rawPassword = new TextEncoder().encode(email.toLowerCase().trim());
    const salt = new TextEncoder().encode(userId + "_protocol_secure_salt_v1");

    const baseKey = await crypto.subtle.importKey(
      "raw",
      rawPassword,
      "PBKDF2",
      false,
      ["deriveKey"]
    );

    return await crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt,
        iterations: 1000,
        hash: "SHA-256"
      },
      baseKey,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"]
    );
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
