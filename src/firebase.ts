import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { 
  initializeFirestore, 
  persistentLocalCache, 
  persistentMultipleTabManager,
  doc as firestoreDoc,
  getDoc as firestoreGetDoc,
  getDocs as firestoreGetDocs,
  setDoc as firestoreSetDoc,
  updateDoc as firestoreUpdateDoc,
  deleteDoc as firestoreDeleteDoc,
  addDoc as firestoreAddDoc,
  query as firestoreQuery,
  where as firestoreWhere,
  collection as firestoreCollection,
  onSnapshot as firestoreOnSnapshot,
  getDocFromServer as firestoreGetDocFromServer
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';
import { BACKEND_URL } from './config';

const app = initializeApp(firebaseConfig);

// Initialize Firestore with persistent offline cache enabled
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager()
  }),
  experimentalForceLongPolling: true
}, firebaseConfig.firestoreDatabaseId);

export const auth = getAuth(app);

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };

  console.error('Firestore Error: ', JSON.stringify(errInfo));

  const msg = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  const code = (error && typeof error === 'object' && 'code' in error) ? String(error.code).toLowerCase() : '';
  const isPermission = msg.includes('permission') || msg.includes('denied') || code.includes('permission-denied');

  if (isPermission) {
    throw new Error(JSON.stringify(errInfo));
  } else {
    console.warn('Suppressing non-permission Firestore error to maintain offline functionality:', error);
  }
}

// Re-export core builders directly
export { doc, collection, query, where, serverTimestamp } from 'firebase/firestore';

// Recursive Timestamp converter to parse backend timestamps gracefully
function convertTimestamps(val: any): any {
  if (val === null || val === undefined) return val;
  if (typeof val === 'object') {
    const sec = val._seconds ?? val.seconds;
    const nano = val._nanoseconds ?? val.nanoseconds;
    if (typeof sec === 'number' && typeof nano === 'number') {
      return {
        toMillis: () => sec * 1000 + Math.floor(nano / 1000000),
        toDate: () => new Date(sec * 1000 + Math.floor(nano / 1000000)),
        seconds: sec,
        nanoseconds: nano
      };
    }
    if (Array.isArray(val)) {
      return val.map(convertTimestamps);
    }
    const res: any = {};
    for (const key of Object.keys(val)) {
      res[key] = convertTimestamps(val[key]);
    }
    return res;
  }
  return val;
}

// Wrapped execution functions
export async function getDoc(docRef: any) {
  try {
    return await firestoreGetDoc(docRef);
  } catch (err: any) {
    const isNetworkError = err.message?.toLowerCase().includes('unavailable') || 
                           err.message?.toLowerCase().includes('offline') || 
                           err.message?.toLowerCase().includes('could not reach');
    if (isNetworkError) {
      const proxySnap = await fetchDocViaProxy(docRef);
      if (proxySnap.exists()) {
        // Backport to local cache so next time standard client can read it locally
        firestoreSetDoc(docRef, proxySnap.data(), { merge: true }).catch(e => {
          console.warn("Failed to backport proxy getDoc to local cache:", e);
        });
      }
      return proxySnap;
    }
    throw err;
  }
}

async function fetchDocViaProxy(docRef: any) {
  console.warn("Client-side Firestore offline/unavailable, proxying getDoc:", docRef.path);
  const targetUrl = BACKEND_URL || window.location.origin;
  const response = await fetch(`${targetUrl}/api/firestore/get?path=${encodeURIComponent(docRef.path)}`);
  if (!response.ok) throw new Error(await response.text());
  const result = await response.json();
  const convertedData = convertTimestamps(result.data);
  return {
    exists: () => result.exists,
    data: () => convertedData,
    id: docRef.id
  };
}

export async function getDocFromServer(docRef: any) {
  try {
    return await firestoreGetDocFromServer(docRef);
  } catch (err: any) {
    const isNetworkError = err.message?.toLowerCase().includes('unavailable') || 
                           err.message?.toLowerCase().includes('offline') || 
                           err.message?.toLowerCase().includes('could not reach');
    if (isNetworkError) {
      const proxySnap = await fetchDocViaProxy(docRef);
      if (proxySnap.exists()) {
        firestoreSetDoc(docRef, proxySnap.data(), { merge: true }).catch(e => {
          console.warn("Failed to backport proxy getDocFromServer to local cache:", e);
        });
      }
      return proxySnap;
    }
    throw err;
  }
}

export async function setDoc(docRef: any, data: any, options?: any) {
  // Try writing to local Firestore client (with robust persistent offline caching)
  try {
    await firestoreSetDoc(docRef, data, options);
  } catch (err: any) {
    console.warn("Local setDoc write failed/delayed, falling back to proxy:", err);
    try {
      await setDocViaProxy(docRef, data, options);
    } catch (proxyErr: any) {
      console.error("setDocViaProxy fallback also failed:", proxyErr);
    }
  }
}

async function setDocViaProxy(docRef: any, data: any, options?: any) {
  console.warn("Client-side Firestore offline/unavailable, proxying setDoc:", docRef.path);
  const targetUrl = BACKEND_URL || window.location.origin;
  const response = await fetch(`${targetUrl}/api/firestore/set`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      path: docRef.path,
      data,
      merge: options?.merge !== false
    })
  });
  if (!response.ok) throw new Error(await response.text());
}

export async function updateDoc(docRef: any, data: any) {
  try {
    await firestoreUpdateDoc(docRef, data);
  } catch (err: any) {
    console.warn("Local updateDoc write failed/delayed, falling back to proxy:", err);
    try {
      await updateDocViaProxy(docRef, data);
    } catch (proxyErr: any) {
      console.error("updateDocViaProxy fallback also failed:", proxyErr);
    }
  }
}

async function updateDocViaProxy(docRef: any, data: any) {
  console.warn("Client-side Firestore offline/unavailable, proxying updateDoc:", docRef.path);
  const targetUrl = BACKEND_URL || window.location.origin;
  const response = await fetch(`${targetUrl}/api/firestore/update`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      path: docRef.path,
      data
    })
  });
  if (!response.ok) throw new Error(await response.text());
}

export async function deleteDoc(docRef: any) {
  try {
    await firestoreDeleteDoc(docRef);
  } catch (err: any) {
    console.warn("Local deleteDoc write failed/delayed, falling back to proxy:", err);
    try {
      await deleteDocViaProxy(docRef);
    } catch (proxyErr: any) {
      console.error("deleteDocViaProxy fallback also failed:", proxyErr);
    }
  }
}

async function deleteDocViaProxy(docRef: any) {
  console.warn("Client-side Firestore offline/unavailable, proxying deleteDoc:", docRef.path);
  const targetUrl = BACKEND_URL || window.location.origin;
  const response = await fetch(`${targetUrl}/api/firestore/delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      path: docRef.path
    })
  });
  if (!response.ok) throw new Error(await response.text());
}

export async function addDoc(collectionRef: any, data: any) {
  try {
    return await firestoreAddDoc(collectionRef, data);
  } catch (err: any) {
    const isNetworkError = err.message?.toLowerCase().includes('unavailable') || 
                           err.message?.toLowerCase().includes('offline') || 
                           err.message?.toLowerCase().includes('could not reach');
    if (isNetworkError) {
      const res = await addDocViaProxy(collectionRef, data);
      const docRef = firestoreDoc(db, collectionRef.path, res.id);
      firestoreSetDoc(docRef, data, { merge: true }).catch(e => {
        console.warn("Failed to backport proxy addDoc to local cache:", e);
      });
      return res;
    }
    throw err;
  }
}

async function addDocViaProxy(collectionRef: any, data: any) {
  const randomId = `doc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const docPath = `${collectionRef.path}/${randomId}`;
  console.warn("Client-side Firestore offline/unavailable, proxying addDoc via setDoc:", docPath);
  const targetUrl = BACKEND_URL || window.location.origin;
  const response = await fetch(`${targetUrl}/api/firestore/set`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      path: docPath,
      data
    })
  });
  if (!response.ok) throw new Error(await response.text());
  return { id: randomId };
}

export async function getDocs(queryObj: any) {
  try {
    return await firestoreGetDocs(queryObj);
  } catch (err: any) {
    const isNetworkError = err.message?.toLowerCase().includes('unavailable') || 
                           err.message?.toLowerCase().includes('offline') || 
                           err.message?.toLowerCase().includes('could not reach');
    if (isNetworkError) {
      const proxySnap = await fetchDocsViaProxy(queryObj);
      // Backport results to local cache
      const pathSegs = queryObj.path || queryObj._query?.path?.toString() || '';
      proxySnap.docs.forEach((docSnap: any) => {
        if (pathSegs) {
          const docRef = firestoreDoc(db, pathSegs, docSnap.id);
          firestoreSetDoc(docRef, docSnap.data(), { merge: true }).catch(e => {
            console.warn("Failed to backport proxy getDocs to local cache:", e);
          });
        }
      });
      return proxySnap;
    }
    throw err;
  }
}

async function fetchDocsViaProxy(queryObj: any) {
  let colName = '';
  const filters: any[] = [];

  if (queryObj.path) {
    colName = queryObj.path;
  } else if (queryObj._query?.path?.segments) {
    colName = queryObj._query.path.segments.join('/');
  } else if (queryObj.collection?.path) {
    colName = queryObj.collection.path;
  }

  if (!colName && queryObj._query) {
    colName = queryObj._query.path?.toString() || '';
  }

  // Parse where filters from queryObj if present
  if (queryObj._query?.filters) {
    for (const f of queryObj._query.filters) {
      if (f.field && f.op && f.value) {
        filters.push({
          field: f.field.segments?.join('.') || String(f.field),
          op: f.op,
          value: f.value
        });
      }
    }
  }

  console.warn("Client-side Firestore offline, proxying getDocs for collection:", colName);

  const targetUrl = BACKEND_URL || window.location.origin;
  const response = await fetch(`${targetUrl}/api/firestore/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      collection: colName,
      where: filters
    })
  });
  if (!response.ok) throw new Error(await response.text());
  const result = await response.json();
  const docs = (result.results || []).map((r: any) => {
    const convertedData = convertTimestamps(r.data);
    return {
      id: r.id,
      data: () => convertedData,
      exists: () => true
    };
  });
  return {
    docs,
    empty: docs.length === 0,
    forEach: (callback: any) => docs.forEach(callback)
  };
}

export function onSnapshot(queryRef: any, onNext: (snapshot: any) => void, onError?: (error: any) => void) {
  let activeUnsubscribe: (() => void) | null = null;
  let isUnsubscribed = false;

  const handleUnsubscribe = () => {
    isUnsubscribed = true;
    if (activeUnsubscribe) {
      activeUnsubscribe();
    }
  };

  try {
    const origUnsubscribe = firestoreOnSnapshot(queryRef, (snap) => {
      if (!isUnsubscribed) onNext(snap);
    }, (err) => {
      const isNetworkError = err.message?.toLowerCase().includes('unavailable') || 
                             err.message?.toLowerCase().includes('offline') || 
                             err.message?.toLowerCase().includes('could not reach');
      if (isNetworkError && !isUnsubscribed) {
        console.warn("Client-side onSnapshot connection failed, dynamically switching to polling proxy listener...");
        if (activeUnsubscribe) activeUnsubscribe();
        activeUnsubscribe = setupPollingOnSnapshot(queryRef, onNext, onError);
      } else {
        if (onError) onError(err);
      }
    });

    activeUnsubscribe = origUnsubscribe;
  } catch (err: any) {
    const isNetworkError = err.message?.toLowerCase().includes('unavailable') || 
                           err.message?.toLowerCase().includes('offline') || 
                           err.message?.toLowerCase().includes('could not reach');
    if (isNetworkError && !isUnsubscribed) {
      activeUnsubscribe = setupPollingOnSnapshot(queryRef, onNext, onError);
    } else {
      if (onError) onError(err);
    }
  }

  return handleUnsubscribe;
}

function setupPollingOnSnapshot(queryRef: any, onNext: (snapshot: any) => void, onError?: (error: any) => void) {
  console.log("Setting up polling-based onSnapshot fallback for path:", queryRef.path || "query");
  
  let isStopped = false;
  const runPoll = async () => {
    if (isStopped) return;
    try {
      const snap = await fetchDocsViaProxy(queryRef);
      if (!isStopped) {
        onNext(snap);
      }
    } catch (err) {
      if (onError) onError(err);
    }
  };
  
  runPoll();
  const intervalId = setInterval(runPoll, 7000);
  
  return () => {
    isStopped = true;
    clearInterval(intervalId);
  };
}
