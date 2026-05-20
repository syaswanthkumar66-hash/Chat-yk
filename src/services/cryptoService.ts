/**
 * End-to-End Encryption (E2EE) using WebCrypto API
 * Uses ECDH for key exchange and AES-GCM for message/file encryption
 */

export class CryptoService {
  private keyPair: CryptoKeyPair | null = null;
  private derivedKeys: Map<string, CryptoKey> = new Map();

  async initKeys() {
    if (this.keyPair) return;
    this.keyPair = await crypto.subtle.generateKey(
      {
        name: "ECDH",
        namedCurve: "P-256",
      },
      true,
      ["deriveKey"]
    );
  }

  async getMyPublicKeyBase64(): Promise<string> {
    await this.initKeys();
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

  async deriveSharedSecret(remoteUserId: string, remotePublicKeyBase64: string): Promise<CryptoKey> {
    if (this.derivedKeys.has(remoteUserId)) return this.derivedKeys.get(remoteUserId)!;
    
    await this.initKeys();
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
    
    this.derivedKeys.set(remoteUserId, sharedSecret);
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
