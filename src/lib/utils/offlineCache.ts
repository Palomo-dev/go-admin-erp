/**
 * Offline Cache - Sistema de cache offline para Supabase queries.
 *
 * Funciona interceptando las peticiones fetch de Supabase:
 * - GET: Cachea respuestas en IndexedDB para servir offline
 * - POST /rest/v1/rpc/<fn> (RPC de lectura): se cachea por función + hash del
 *   body y se sirve offline; NUNCA se encola (fase 4A del Desktop)
 * - POST/PATCH/DELETE REST: Encola acciones para sincronizar cuando vuelva la conexión
 *
 * Solo se activa dentro del app de Electron (desktop).
 */

import { desktopReportsConnectivity, getDesktopBridge, isDesktop, onDesktopConnectivity } from '@/lib/utils/desktop';

const DB_NAME = 'goadmin-offline';
const DB_VERSION = 1;
const CACHE_STORE = 'query-cache';
const QUEUE_STORE = 'action-queue';
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos
/** Clave en localStorage de la última sincronización correcta (ms epoch). */
const LAST_SYNC_KEY = 'goadmin-offline:last-sync-at';
/** No escribir en localStorage más de una vez cada 5 s (los GET son frecuentes). */
const LAST_SYNC_PERSIST_MIN_MS = 5_000;

let dbInstance: IDBDatabase | null = null;
/**
 * Estado de conexión.
 *
 * En Go Admin Desktop lo alimenta el proceso principal por el bridge
 * (`connectivity:state`, health-check con histéresis contra Supabase) y es
 * la única fuente de verdad: `navigator.onLine` devuelve true con WiFi
 * enlazado y router sin internet. En navegador lo alimentan los eventos
 * `online`/`offline` de `window`.
 */
let isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
let syncInProgress = false;
let lastSyncAt: number | null = null;
let lastSyncPersistedAt = 0;

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

// ── RPC (POST /rest/v1/rpc/<fn>) como lectura cacheable ──

const RPC_PATH_RE = /\/rest\/v1\/rpc\/([A-Za-z0-9_]+)/;

/** Nombre de la función si `url` es una llamada RPC de PostgREST; null si no. */
export function getRpcFunctionName(url: string): string | null {
  const m = RPC_PATH_RE.exec(url);
  return m ? m[1] : null;
}

/**
 * RPC que MUTAN datos: nunca se cachean ni se sirven desde caché. Servir una
 * respuesta guardada de `fn_register_stock_entry` o `decrement_ai_credits`
 * haría creer a la UI que la escritura se hizo. Fuera de esta lista (y de
 * las excepciones de contexto de sesión) toda RPC se trata como lectura.
 */
const RPC_WRITE_RE = /^(fn_)?(create|insert|update|upsert|delete|remove|soft_delete|decrement|increment|deduct|refund|register|mark|revoke|release|reserve|issue|manage|toggle|process|apply|cancel|close|open|sync|log|generate|claim|transfer|consume|charge|assistant|checkout|pay|void|add|assign|move|reset|rotate|purge|archive|restore|send|enqueue|save|record|adjust|approve|reject|confirm|start|finish|complete|redeem|activate|deactivate|enable|disable|set)(_|$)/;
/** Setters de contexto de sesión: sin efecto persistente, se pueden cachear. */
const RPC_SESSION_CONTEXT = new Set(['set_org_context', 'set_session_org_id', 'set_config']);

/** true si la RPC se considera una lectura (cacheable y servible sin red). */
export function isCacheableRpc(fnName: string): boolean {
  if (RPC_SESSION_CONTEXT.has(fnName)) return true;
  return !RPC_WRITE_RE.test(fnName);
}

// ── Tablas de venta que no pasan por la cola HTTP (fase 4B) ──

const REST_TABLE_RE = /\/rest\/v1\/([A-Za-z0-9_]+)(?:\?|$)/;

/** Nombre de la tabla si `url` es una petición REST a PostgREST (no RPC); null si no. */
export function getRestTableName(url: string): string | null {
  if (RPC_PATH_RE.test(url)) return null;
  const m = REST_TABLE_RE.exec(url);
  return m ? m[1] : null;
}

/**
 * Escrituras que componen una venta del POS. Sin red van al outbox como un
 * sobre completo (`src/lib/offline/salesOutbox.ts`), nunca como peticiones
 * sueltas a `action-queue`.
 */
export const SALE_TABLES_NOT_QUEUED: ReadonlySet<string> = new Set([
  'sales',
  'sale_items',
  'invoice_sales',
  'invoice_items',
  'payments',
  'accounts_receivable',
  'tips',
  'commissions',
]);

/** FNV-1a de 32 bits en hexadecimal: clave corta y estable para el body. */
export function hashBody(body: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < body.length; i++) {
    h ^= body.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/** Clave de caché de una RPC: `rpc:<fn>:<hash del body>`. */
export function getRpcCacheKey(fnName: string, body: string): string {
  return `rpc:${fnName}:${hashBody(body || '')}`;
}

async function readCacheEntry(key: string): Promise<{ data: string; status: number } | null> {
  try {
    const db = await openDB();

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

        // Solo verificar TTL si estamos online (refrescar datos periódicamente).
        // Si estamos offline, servir el cache sin importar antigüedad.
        // `isAppOnline()` usa la conectividad real del Desktop cuando existe.
        if (isAppOnline()) {
          const age = Date.now() - entry.timestamp;
          if (age > CACHE_TTL_MS) {
            resolve(null);
            return;
          }
        }

        resolve({ data: entry.data, status: entry.status });
      };

      request.onerror = () => reject(request.error);
    });
  } catch {
    return null;
  }
}

export async function getCachedResponse(url: string, method: string): Promise<{ data: string; status: number } | null> {
  return readCacheEntry(getCacheKey(url, method));
}

/** Respuesta cacheada de una RPC (por función + hash del body), o null. */
export async function getCachedRpcResponse(fnName: string, body: string): Promise<{ data: string; status: number } | null> {
  return readCacheEntry(getRpcCacheKey(fnName, body));
}

async function writeCacheEntry(key: string, data: string, status: number): Promise<void> {
  try {
    const db = await openDB();
    const entry: CacheEntry = { key, data, status, timestamp: Date.now() };

    return new Promise((resolve, reject) => {
      const tx = db.transaction(CACHE_STORE, 'readwrite');
      const store = tx.objectStore(CACHE_STORE);
      const request = store.put(entry);

      request.onsuccess = () => {
        // Una respuesta fresca del servidor es, por definición, una
        // sincronización correcta de datos.
        markSynced();
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
  } catch {
    // Silenciar errores de cache
  }
}

export async function setCachedResponse(url: string, method: string, data: string, status: number): Promise<void> {
  return writeCacheEntry(getCacheKey(url, method), data, status);
}

/** Guarda la respuesta de una RPC de lectura con clave `rpc:<fn>:<hash>`. */
export async function setCachedRpcResponse(fnName: string, body: string, data: string, status: number): Promise<void> {
  return writeCacheEntry(getRpcCacheKey(fnName, body), data, status);
}

/**
 * Decide qué hacer con una petición de datos cuando el Desktop está sin red.
 * Es el único punto de decisión del interceptor de `config.ts`:
 *
 *  - `GET`: se sirve de caché por URL; si no hay, `503 Offline`.
 *  - `POST /rest/v1/rpc/<fn>`: se trata como LECTURA. Se sirve de caché por
 *    `rpc:<fn>:<hash del body>`; si no hay, `503 Offline`. **Nunca se encola**:
 *    una RPC no es una acción de negocio reproducible y encolarla es lo que
 *    llenaba el contador de «acciones pendientes» con lecturas.
 *  - Resto (`POST/PATCH/PUT/DELETE` REST): se encola en `action-queue` y se
 *    responde `202` como hasta ahora.
 */
export async function resolveOfflineDataRequest(args: {
  url: string;
  method: string;
  body: string;
  headers: Record<string, string>;
}): Promise<Response> {
  const { url, method, body, headers } = args;
  const offlineHeaders = { 'Content-Type': 'application/json', 'X-Offline-Cache': 'true' };
  const noData = () =>
    new Response(JSON.stringify({ data: null, error: { message: 'Offline: no cached data' } }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });

  if (method === 'GET') {
    const cached = await getCachedResponse(url, method);
    return cached ? new Response(cached.data, { status: cached.status, headers: offlineHeaders }) : noData();
  }

  const rpcName = getRpcFunctionName(url);
  if (rpcName !== null) {
    if (method === 'POST' && isCacheableRpc(rpcName)) {
      const cached = await getCachedRpcResponse(rpcName, body);
      if (cached) return new Response(cached.data, { status: cached.status, headers: offlineHeaders });
    }
    return noData();
  }

  // Tablas de venta (fase 4B): NUNCA a la cola HTTP. Un 202 con `data: null`
  // rompe la cadena venta → líneas → pagos y sincroniza una venta vacía. El
  // POS las guarda como sobre completo en el outbox (`salesOutbox.ts`); si
  // otro flujo llega aquí, falla con un error claro en vez de "guardar".
  const restTable = getRestTableName(url);
  if (restTable !== null && SALE_TABLES_NOT_QUEUED.has(restTable)) {
    return new Response(
      JSON.stringify({ data: null, error: { message: `Offline: la tabla ${restTable} no se encola; la venta debe ir al outbox`, code: 'OFFLINE_SALE_TABLE' } }),
      { status: 503, headers: { 'Content-Type': 'application/json' } },
    );
  }

  await queueAction({ url, method, headers, body });
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('goadmin:action-queued'));
  }
  return new Response(JSON.stringify({ data: null, error: null, offline: true, queued: true }), {
    status: 202,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Guarda una respuesta fresca del servidor si es cacheable: `GET` por URL o
 * RPC de lectura por función + hash del body. Devuelve false si no aplica.
 */
export async function cacheFreshResponse(args: {
  url: string;
  method: string;
  body: string;
  text: string;
  status: number;
}): Promise<boolean> {
  const { url, method, body, text, status } = args;
  if (method === 'GET') {
    await setCachedResponse(url, method, text, status);
    return true;
  }
  if (method === 'POST') {
    const rpcName = getRpcFunctionName(url);
    if (rpcName !== null && isCacheableRpc(rpcName)) {
      await setCachedRpcResponse(rpcName, body, text, status);
      return true;
    }
  }
  return false;
}

/** true si `method`+`url` puede guardarse en caché (GET o RPC de lectura). */
export function isCacheableRequest(url: string, method: string): boolean {
  if (method === 'GET') return true;
  if (method !== 'POST') return false;
  const rpcName = getRpcFunctionName(url);
  return rpcName !== null && isCacheableRpc(rpcName);
}

/** Respuesta cacheada para `method`+`url` (+`body` en RPC), o null. */
export async function getCachedForRequest(url: string, method: string, body: string): Promise<{ data: string; status: number } | null> {
  if (method === 'GET') return getCachedResponse(url, method);
  const rpcName = getRpcFunctionName(url);
  if (method === 'POST' && rpcName !== null && isCacheableRpc(rpcName)) {
    return getCachedRpcResponse(rpcName, body);
  }
  return null;
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
      markSynced();
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
  // Desktop: la variable interna la alimenta el health-check del proceso
  // principal (ver bloque de inicialización); navigator.onLine miente ahí.
  if (desktopReportsConnectivity()) return isOnline;
  // Navegador: navigator.onLine refleja el estado del adaptador en todo momento.
  if (typeof navigator !== 'undefined') {
    return navigator.onLine;
  }
  return isOnline;
}

// ── Última sincronización correcta ──

/**
 * Registra "ahora" como última sincronización correcta: se llama cuando el
 * servidor devolvió datos frescos (GET cacheado) o cuando la cola de acciones
 * offline se envió. Se persiste en localStorage (con límite de frecuencia)
 * para que el banner pueda mostrar la hora aunque la app arranque sin red.
 */
export function markSynced(at: number = Date.now()): void {
  lastSyncAt = at;
  if (typeof window === 'undefined') return;
  if (at - lastSyncPersistedAt < LAST_SYNC_PERSIST_MIN_MS) return;
  lastSyncPersistedAt = at;
  try {
    window.localStorage.setItem(LAST_SYNC_KEY, String(at));
  } catch {
    // localStorage puede no estar disponible (modo privado, cuota)
  }
  window.dispatchEvent(new CustomEvent('goadmin:last-sync', { detail: { at } }));
}

/** Instante (ms epoch) de la última sincronización correcta, o null si nunca. */
export function getLastSyncAt(): number | null {
  if (lastSyncAt !== null) return lastSyncAt;
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(LAST_SYNC_KEY);
    const parsed = raw ? Number(raw) : NaN;
    if (Number.isFinite(parsed) && parsed > 0) lastSyncAt = parsed;
  } catch {
    // Silenciar
  }
  return lastSyncAt;
}

export async function getQueueCount(): Promise<number> {
  const actions = await getQueuedActions();
  return actions.length;
}

export interface QueueCountsByType {
  total: number;
  /** RPC encoladas por error (versiones anteriores del interceptor). */
  rpc: number;
  /** Escrituras REST legítimas (`POST/PATCH/PUT/DELETE` a tablas). */
  rest: number;
  byMethod: Record<string, number>;
}

/** Cuántas acciones pendientes hay, separadas por tipo. */
export async function getQueueCountsByType(): Promise<QueueCountsByType> {
  const actions = await getQueuedActions();
  const counts: QueueCountsByType = { total: actions.length, rpc: 0, rest: 0, byMethod: {} };
  for (const action of actions) {
    if (getRpcFunctionName(action.url) !== null) counts.rpc++;
    else counts.rest++;
    counts.byMethod[action.method] = (counts.byMethod[action.method] || 0) + 1;
  }
  return counts;
}

/**
 * Elimina de la cola las RPC que versiones anteriores del interceptor
 * encolaron como si fueran escrituras (eran lecturas: `pos_product_ranking`,
 * `get_organization_currencies`, …). Reenviarlas no aporta nada y su
 * conteo confundía al banner. Devuelve cuántas se retiraron.
 */
export async function purgeQueuedRpcActions(): Promise<number> {
  let removed = 0;
  try {
    const actions = await getQueuedActions();
    for (const action of actions) {
      if (action.id !== undefined && getRpcFunctionName(action.url) !== null) {
        await removeQueuedAction(action.id);
        removed++;
      }
    }
  } catch {
    // IndexedDB no disponible: no hay cola que limpiar.
  }
  if (removed > 0 && typeof window !== 'undefined') {
    console.log(`[offline] ${removed} RPC retiradas de la cola de acciones`);
    window.dispatchEvent(new CustomEvent('goadmin:action-queued'));
  }
  return removed;
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
  if (isDesktop()) {
    // Limpiar las RPC que el interceptor anterior encoló como escrituras.
    purgeQueuedRpcActions().catch(() => {});
  }
  if (desktopReportsConnectivity()) {
    // Desktop: solo el bridge. No se mezclan los eventos de `window`, que
    // pueden decir "online" mientras el health-check sigue en fallo.
    onDesktopConnectivity((online) => setOnline(online));
    getDesktopBridge()
      ?.isOnline?.()
      .then((online) => {
        if (typeof online === 'boolean') setOnline(online);
      })
      .catch(() => {
        // Sin respuesta del bridge: se conserva el valor por defecto (true)
      });
  } else {
    window.addEventListener('online', () => setOnline(true));
    window.addEventListener('offline', () => setOnline(false));

    // Verificar estado inicial
    isOnline = navigator.onLine;
  }
}
