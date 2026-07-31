/**
 * Offline Cache - Sistema de cache offline para Supabase queries.
 *
 * Funciona interceptando las peticiones fetch de Supabase:
 * - GET: Cachea respuestas en IndexedDB para servir offline
 * - POST/PATCH/DELETE: Encola acciones para sincronizar cuando vuelva la conexión
 *
 * Solo se activa dentro del app de Electron (desktop).
 */

const DB_NAME = 'goadmin-offline';
const DB_VERSION = 1;
const CACHE_STORE = 'query-cache';
const QUEUE_STORE = 'action-queue';
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos

let dbInstance: IDBDatabase | null = null;
let isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
let syncInProgress = false;

// ── Inicialización ──

function openDB(): Promise<IDBDatabase> {
  if (dbInstance) return Promise.resolve(dbInstance);

  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB no disponible'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      dbInstance = request.result;
      resolve(dbInstance);
    };

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(CACHE_STORE)) {
        db.createObjectStore(CACHE_STORE, { keyPath: 'key' });
      }

      if (!db.objectStoreNames.contains(QUEUE_STORE)) {
        db.createObjectStore(QUEUE_STORE, { keyPath: 'id', autoIncrement: true });
      }
    };
  });
}

// ── Cache de queries GET ──

interface CacheEntry {
  key: string;
  data: string;
  timestamp: number;
  status: number;
}

function getCacheKey(url: string, method: string): string {
  return `${method}:${url}`;
}

export async function getCachedResponse(url: string, method: string): Promise<{ data: string; status: number } | null> {
  try {
    const db = await openDB();
    const key = getCacheKey(url, method);

    return new Promise((resolve, reject) => {
      const tx = db.transaction(CACHE_STORE, 'readonly');
      const store = tx.objectStore(CACHE_STORE);
      const request = store.get(key);

      request.onsuccess = () => {
        const entry = request.result as CacheEntry | undefined;
        if (!entry) {
          resolve(null);
          return;
        }

        const age = Date.now() - entry.timestamp;
        if (age > CACHE_TTL_MS) {
          resolve(null);
          return;
        }

        resolve({ data: entry.data, status: entry.status });
      };

      request.onerror = () => reject(request.error);
    });
  } catch {
    return null;
  }
}

export async function setCachedResponse(url: string, method: string, data: string, status: number): Promise<void> {
  try {
    const db = await openDB();
    const key = getCacheKey(url, method);
    const entry: CacheEntry = { key, data, status, timestamp: Date.now() };

    return new Promise((resolve, reject) => {
      const tx = db.transaction(CACHE_STORE, 'readwrite');
      const store = tx.objectStore(CACHE_STORE);
      const request = store.put(entry);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch {
    // Silenciar errores de cache
  }
}

// ── Cola de acciones offline ──

export interface QueuedAction {
  id?: number;
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string;
  timestamp: number;
  retries: number;
}

export async function queueAction(action: Omit<QueuedAction, 'id' | 'timestamp' | 'retries'>): Promise<void> {
  const db = await openDB();
  const entry: QueuedAction = {
    ...action,
    timestamp: Date.now(),
    retries: 0,
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction(QUEUE_STORE, 'readwrite');
    const store = tx.objectStore(QUEUE_STORE);
    const request = store.add(entry);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function getQueuedActions(): Promise<QueuedAction[]> {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(QUEUE_STORE, 'readonly');
    const store = tx.objectStore(QUEUE_STORE);
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result as QueuedAction[]);
    request.onerror = () => reject(request.error);
  });
}

export async function removeQueuedAction(id: number): Promise<void> {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(QUEUE_STORE, 'readwrite');
    const store = tx.objectStore(QUEUE_STORE);
    const request = store.delete(id);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function incrementActionRetries(id: number): Promise<void> {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(QUEUE_STORE, 'readwrite');
    const store = tx.objectStore(QUEUE_STORE);
    const getRequest = store.get(id);

    getRequest.onsuccess = () => {
      const action = getRequest.result as QueuedAction | undefined;
      if (action) {
        action.retries++;
        store.put(action);
      }
    };

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ── Sincronización de cola ──

export async function syncQueue(): Promise<{ synced: number; failed: number }> {
  if (syncInProgress) return { synced: 0, failed: 0 };
  syncInProgress = true;

  try {
    const actions = await getQueuedActions();
    let synced = 0;
    let failed = 0;

    for (const action of actions) {
      if (action.retries >= 5) {
        if (action.id) await removeQueuedAction(action.id);
        failed++;
        continue;
      }

      try {
        const response = await fetch(action.url, {
          method: action.method,
          headers: action.headers,
          body: action.body,
        });

        if (response.ok) {
          if (action.id) await removeQueuedAction(action.id);
          synced++;
          console.log(`[offline] Acción sincronizada: ${action.method} ${action.url}`);
        } else {
          if (action.id) await incrementActionRetries(action.id);
          failed++;
          console.warn(`[offline] Error sincronizando (${response.status}): ${action.method} ${action.url}`);
        }
      } catch (err) {
        if (action.id) await incrementActionRetries(action.id);
        failed++;
        console.error('[offline] Error sincronizando acción:', err);
      }
    }

    if (synced > 0) {
      console.log(`[offline] Sincronización completa: ${synced} acciones, ${failed} fallos`);
      window.dispatchEvent(new CustomEvent('goadmin:offline-synced', { detail: { synced, failed } }));
    }

    return { synced, failed };
  } finally {
    syncInProgress = false;
  }
}

// ── Utilidades ──

export function setOnline(online: boolean): void {
  const wasOffline = !isOnline;
  isOnline = online;

  if (online && wasOffline) {
    console.log('[offline] Conexión restaurada, sincronizando cola...');
    syncQueue();
    window.dispatchEvent(new CustomEvent('goadmin:online'));
  } else if (!online) {
    window.dispatchEvent(new CustomEvent('goadmin:offline'));
  }
}

export function isAppOnline(): boolean {
  return isOnline;
}

export async function getQueueCount(): Promise<number> {
  const actions = await getQueuedActions();
  return actions.length;
}

export async function clearCache(): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(CACHE_STORE, 'readwrite');
      const store = tx.objectStore(CACHE_STORE);
      const request = store.clear();

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch {
    // Silenciar
  }
}

// ── Inicialización de listeners ──

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => setOnline(true));
  window.addEventListener('offline', () => setOnline(false));

  // Verificar estado inicial
  isOnline = navigator.onLine;
}
