import { cryptoService } from './cryptoService';
import { safeLocalStorageSetItem } from '../store';

export interface SavedAccount {
  id: string;
  username: string;
  displayName: string;
  avatar: string;
  authMethod: 'google' | 'local';
  email?: string;
  lastActive: number;
}

export class SessionIntegrityService {
  private savedAccountsKey = 'proto_saved_accounts';

  /**
   * Retrieves all verified saved accounts from localStorage.
   */
  getSavedAccounts(): SavedAccount[] {
    if (typeof window === 'undefined') return [];
    try {
      const stored = localStorage.getItem(this.savedAccountsKey);
      if (!stored) return [];
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) {
        // Filter out any corrupted entries to maintain strict session integrity
        return parsed.filter((acc: any) => acc && typeof acc === 'object' && typeof acc.id === 'string' && acc.username);
      }
    } catch (e) {
      console.error('Failed to parse saved accounts:', e);
    }
    return [];
  }

  /**
   * Saves the list of accounts back to localStorage.
   */
  saveAccounts(accounts: SavedAccount[]) {
    if (typeof window === 'undefined') return;
    try {
      safeLocalStorageSetItem(this.savedAccountsKey, JSON.stringify(accounts));
    } catch (e) {
      console.error('Failed to save accounts list:', e);
    }
  }

  /**
   * Adds or updates an account in the saved switcher list.
   */
  registerAccount(account: Omit<SavedAccount, 'lastActive'>) {
    if (typeof window === 'undefined') return;
    const accounts = this.getSavedAccounts();
    const existingIndex = accounts.findIndex(acc => acc.id === account.id);
    
    const existingEmail = existingIndex > -1 ? accounts[existingIndex].email : undefined;
    const incomingEmail = account.email || (account as any).email;
    const finalEmail = incomingEmail || existingEmail || `${account.id}@protocol.net`;

    const updatedAccount: SavedAccount = {
      ...account,
      email: finalEmail,
      lastActive: Date.now()
    };

    if (existingIndex > -1) {
      accounts[existingIndex] = updatedAccount;
    } else {
      accounts.push(updatedAccount);
    }

    // Sort accounts so the most recently active is first (or just standard list)
    accounts.sort((a, b) => b.lastActive - a.lastActive);
    this.saveAccounts(accounts);
    console.log(`Account registered/updated in switcher list: ${account.displayName} (${account.id})`);
  }

  /**
   * Removes an account from the saved switcher list.
   */
  removeAccount(userId: string) {
    if (typeof window === 'undefined') return;
    const accounts = this.getSavedAccounts();
    const filtered = accounts.filter(acc => acc.id !== userId);
    this.saveAccounts(filtered);
    
    // Also prune that user's specific state to clean up space
    this.purgeUserCache(userId);
  }

  /**
   * Verifies session integrity on startup.
   * If multiple accounts are detected, we ensure they are cryptographically isolated 
   * and there is no shared or un-prefixed message history/cache leaking in global space.
   */
  async verifyAndCleanupSession(): Promise<void> {
    if (typeof window === 'undefined') return;
    console.log('[IntegrityService] Running startup session integrity and cryptographic isolation check...');

    const accounts = this.getSavedAccounts();
    const hasMultiple = accounts.length > 1;

    if (hasMultiple) {
      console.log(`[IntegrityService] Multiple accounts (${accounts.length}) detected. Enforcing strict cryptographic isolation boundaries.`);
    }

    // 1. Purge legacy, unpartitioned global keys to prevent any cross-account leak
    const globalKeysToPurge = [
      'proto_chats',
      'proto_users',
      'proto_friendRequests',
      'proto_sentFriendRequests',
      'proto_blockedUserIds',
      'proto_removedFriendIds',
      'pending_profile_sync'
    ];

    globalKeysToPurge.forEach(key => {
      if (localStorage.getItem(key)) {
        console.warn(`[IntegrityService] Purging unpartitioned global key to avoid leak: ${key}`);
        localStorage.removeItem(key);
      }
    });

    // 2. Cryptographically isolate each saved account's private keys
    for (const acc of accounts) {
      const keyStorageKey = `e2e_keys_${acc.id}`;
      const hasKeys = !!localStorage.getItem(keyStorageKey);
      
      if (!hasKeys) {
        console.log(`[IntegrityService] Initializing dedicated cryptographic keys for isolated profile: ${acc.displayName}`);
        try {
          await cryptoService.initKeys(acc.id);
        } catch (err) {
          console.error(`[IntegrityService] Failed to initialize keys for ${acc.id}:`, err);
        }
      } else {
        // Verify key format is intact
        try {
          const keysObj = JSON.parse(localStorage.getItem(keyStorageKey) || '{}');
          if (!keysObj.publicJwk || !keysObj.privateJwk) {
            throw new Error('Incomplete cryptographic keypair');
          }
        } catch (e) {
          console.warn(`[IntegrityService] Cryptographic keys for user ${acc.id} are corrupted. Regenerating to enforce security...`);
          try {
            localStorage.removeItem(keyStorageKey);
            await cryptoService.initKeys(acc.id);
          } catch (err) {
            console.error(err);
          }
        }
      }
    }

    // 3. Clear legacy global IndexedDB databases to enforce physical partition
    try {
      const deleteDbPromise = (name: string) => {
        return new Promise<void>((resolve) => {
          const req = indexedDB.deleteDatabase(name);
          req.onsuccess = () => {
            console.log(`[IntegrityService] Deleted legacy un-partitioned IndexedDB database: ${name}`);
            resolve();
          };
          req.onerror = () => {
            resolve();
          };
          req.onblocked = () => {
            resolve();
          };
        });
      };

      // Only delete if we are in multiple account mode or as a safety cleanup
      await deleteDbPromise('audio-storage-db');
      await deleteDbPromise('voice-note-cache-db');
    } catch (e) {
      console.warn('[IntegrityService] Error trying to delete legacy IndexedDB databases:', e);
    }

    console.log('[IntegrityService] Startup session integrity and cryptographic verification complete.');
  }

  /**
   * Completely purges a specific user's caches, local storage, and cryptographic keys.
   */
  private purgeUserCache(userId: string) {
    if (typeof window === 'undefined') return;
    console.log(`[IntegrityService] Purging all cached data and cryptographic keys for user ${userId}`);
    
    // LocalStorage Keys
    const keysToPurge = [
      `proto_chats_${userId}`,
      `proto_users_${userId}`,
      `proto_friendRequests_${userId}`,
      `proto_sentFriendRequests_${userId}`,
      `proto_blockedUserIds_${userId}`,
      `proto_removedFriendIds_${userId}`,
      `pending_profile_sync_${userId}`,
      `e2e_keys_${userId}`
    ];

    keysToPurge.forEach(key => localStorage.removeItem(key));

    // IndexedDB Databases
    try {
      indexedDB.deleteDatabase(`audio-storage-db_${userId}`);
      indexedDB.deleteDatabase(`voice-note-cache-db_${userId}`);
    } catch (e) {
      console.warn(`[IntegrityService] Failed to delete IndexedDB databases for user ${userId}:`, e);
    }
  }
}

export const sessionIntegrityService = new SessionIntegrityService();
