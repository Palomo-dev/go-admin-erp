/**
 * Caché local de medios para Go Admin Desktop (fase 4D — imágenes sin red).
 *
 * Las imágenes de producto viven en Supabase Storage; sin red no hay nada
 * local salvo lo que Chromium tenga en su caché HTTP, que no se controla.
 * Aquí se guardan los `Blob` por URL en IndexedDB `goadmin-media`
 * (independiente de `goadmin-catalog` y `goadmin-outbox`):
 *
 *  - Tope total `MEDIA_MAX_TOTAL_BYTES` (80 MB) con desalojo LRU por
 *    `last_used_at`; tope por imagen `MEDIA_MAX_ITEM_BYTES` (300 KB): lo que
 *    pese más no se guarda (la tarjeta del POS no necesita más).
 *  - `catalogReplicator` la rellena en segundo plano con la imagen primaria de
 *    cada producto (`warmMediaCache`, lotes pequeños, cede el hilo, solo con
 *    red y sin bloquear la UI).
 *  - `resolveCachedImageSrc(url, online)` es el núcleo del hook
 *    `useCachedImage` (`useCachedImage.ts`): con red devuelve la URL tal cual
 *    y refresca la caché; sin red (o si la carga en red falló) devuelve un
 *    `blob:` URL del `Blob` guardado, o null si no hay copia.
 *
 * Este módulo no sabe de React ni de Supabase: solo IndexedDB y `fetch`,
 * para probarlo con `fake-indexeddb`.
 */

export const MEDIA_DB_NAME = 'goadmin-media';
export const MEDIA_DB_VERSION = 1;
export const MEDIA_STORE = 'blobs';
const META_STORE = 'meta';
const TOTAL_KEY = 'total_bytes';

/** Tope total de la caché (80 MB). */
export const MEDIA_MAX_TOTAL_BYTES = 80 * 1024 * 1024;
/** Tope por imagen (300 KB): más grande no se guarda. */
export const MEDIA_MAX_ITEM_BYTES = 300 * 1024;

let maxTotalBytes = MEDIA_MAX_TOTAL_BYTES;
let maxItemBytes = MEDIA_MAX_ITEM_BYTES;

/** Solo para tests: topes pequeños para probar el desalojo sin escribir 80 MB. */
export function __setMediaLimitsForTests(limits: { maxTotalBytes?: number; maxItemBytes?: number } | null): void {
  maxTotalBytes = limits?.maxTotalBytes ?? MEDIA_MAX_TOTAL_BYTES;
  maxItemBytes = limits?.maxItemBytes ?? MEDIA_MAX_ITEM_BYTES;
}
/** Una entrada más vieja que esto se vuelve a bajar con red (refresco). */
export const MEDIA_REFRESH_AFTER_MS = 7 * 24 * 60 * 60 * 1000;
/** `last_used_at` no se reescribe si el último toque fue hace menos de esto. */
const TOUCH_MIN_INTERVAL_MS = 60 * 1000;

export interface MediaCacheEntry {
  url: string;
  blob: Blob;
  size: number;
  type: string;
  stored_at: number;
  last_used_at: number;
}

export interface MediaCacheStats {
  count: number;
  totalBytes: number;
  maxBytes: number;
}

// ── IndexedDB ────────────────────────────────────────────────────────────────

let dbPromise: Promise<IDBDatabase> | null = null;

export function isMediaCacheAvailable(): boolean {
  return typeof indexedDB !== 'undefined';
}

function openMediaDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (!isMediaCacheAvailable()) {
      reject(new Error('IndexedDB no disponible'));
      return;
    }
    const request = indexedDB.open(MEDIA_DB_NAME, MEDIA_DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('goadmin-media bloqueada por otra pestaña'));
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      resolve(db);
    };
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(MEDIA_STORE)) {
        const store = db.createObjectStore(MEDIA_STORE, { keyPath: 'url' });
        store.createIndex('by_last_used', 'last_used_at');
      }
      if (!db.objectStoreNames.contains(META_STORE)) db.createObjectStore(META_STORE, { keyPath: 'key' });
    };
  });
  dbPromise.catch(() => {
    dbPromise = null;
  });
  return dbPromise;
}

/** Solo para tests: cierra la conexión para que el siguiente acceso reabra la BD. */
export async function __resetMediaCacheForTests(): Promise<void> {
  if (dbPromise) {
    try {
      (await dbPromise).close();
    } catch {
      // ya cerrada
    }
  }
  dbPromise = null;
}

function req<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('Transacción abortada'));
  });
}

async function readTotal(meta: IDBObjectStore): Promise<number> {
  const row = (await req(meta.get(TOTAL_KEY))) as { key: string; value: number } | undefined;
  return row?.value ?? 0;
}

// ── Lectura ──────────────────────────────────────────────────────────────────

export async function hasCachedMedia(url: string): Promise<boolean> {
  if (!isMediaCacheAvailable() || !url) return false;
  try {
    const db = await openMediaDB();
    const tx = db.transaction(MEDIA_STORE, 'readonly');
    const key = await req(tx.objectStore(MEDIA_STORE).getKey(url));
    return key !== undefined;
  } catch {
    return false;
  }
}

/** Entrada completa (sin tocar `last_used_at`). */
export async function getCachedMediaEntry(url: string): Promise<MediaCacheEntry | null> {
  if (!isMediaCacheAvailable() || !url) return null;
  try {
    const db = await openMediaDB();
    const tx = db.transaction(MEDIA_STORE, 'readonly');
    const row = (await req(tx.objectStore(MEDIA_STORE).get(url))) as MediaCacheEntry | undefined;
    return row ?? null;
  } catch {
    return null;
  }
}

/**
 * `Blob` guardado para la URL, o null. Marca la entrada como usada (LRU),
 * como mucho una vez por minuto para no reescribir en cada render.
 */
export async function getCachedMedia(url: string, now: number = Date.now()): Promise<Blob | null> {
  if (!isMediaCacheAvailable() || !url) return null;
  try {
    const db = await openMediaDB();
    const tx = db.transaction(MEDIA_STORE, 'readwrite');
    const store = tx.objectStore(MEDIA_STORE);
    const row = (await req(store.get(url))) as MediaCacheEntry | undefined;
    if (!row) return null;
    if (now - row.last_used_at > TOUCH_MIN_INTERVAL_MS) store.put({ ...row, last_used_at: now });
    await txDone(tx);
    return row.blob;
  } catch {
    return null;
  }
}

/** Claves (URLs) guardadas: el precalentado las usa para saltarse lo que ya está. */
export async function listCachedMediaUrls(): Promise<Set<string>> {
  if (!isMediaCacheAvailable()) return new Set();
  try {
    const db = await openMediaDB();
    const tx = db.transaction(MEDIA_STORE, 'readonly');
    const keys = await req(tx.objectStore(MEDIA_STORE).getAllKeys());
    return new Set(keys.map(String));
  } catch {
    return new Set();
  }
}

export async function getMediaCacheStats(): Promise<MediaCacheStats> {
  const empty = { count: 0, totalBytes: 0, maxBytes: maxTotalBytes };
  if (!isMediaCacheAvailable()) return empty;
  try {
    const db = await openMediaDB();
    const tx = db.transaction([MEDIA_STORE, META_STORE], 'readonly');
    const [count, total] = await Promise.all([req(tx.objectStore(MEDIA_STORE).count()), readTotal(tx.objectStore(META_STORE))]);
    return { count, totalBytes: total, maxBytes: maxTotalBytes };
  } catch {
    return empty;
  }
}

// ── Escritura ────────────────────────────────────────────────────────────────

export type PutMediaResult = 'stored' | 'too_large' | 'unavailable';

/**
 * Guarda el `Blob` bajo la URL. Si supera `MEDIA_MAX_ITEM_BYTES` no se guarda
 * (`too_large`). Antes de escribir desaloja las entradas menos usadas hasta
 * que quepa dentro de `MEDIA_MAX_TOTAL_BYTES`. Todo en una transacción.
 */
export async function putCachedMedia(url: string, blob: Blob, now: number = Date.now()): Promise<PutMediaResult> {
  if (!isMediaCacheAvailable() || !url) return 'unavailable';
  if (blob.size > maxItemBytes) return 'too_large';
  const db = await openMediaDB();
  const tx = db.transaction([MEDIA_STORE, META_STORE], 'readwrite');
  const store = tx.objectStore(MEDIA_STORE);
  const meta = tx.objectStore(META_STORE);

  let total = await readTotal(meta);
  const previous = (await req(store.get(url))) as MediaCacheEntry | undefined;
  if (previous) total -= previous.size;

  // Desalojo LRU: las más antiguas por `last_used_at` primero.
  if (total + blob.size > maxTotalBytes) {
    const index = store.index('by_last_used');
    const cursorReq = index.openCursor();
    await new Promise<void>((resolve, reject) => {
      cursorReq.onerror = () => reject(cursorReq.error);
      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result;
        if (!cursor || total + blob.size <= maxTotalBytes) {
          resolve();
          return;
        }
        const victim = cursor.value as MediaCacheEntry;
        if (victim.url !== url) {
          total -= victim.size;
          cursor.delete();
        }
        cursor.continue();
      };
    });
  }

  const entry: MediaCacheEntry = { url, blob, size: blob.size, type: blob.type, stored_at: now, last_used_at: now };
  store.put(entry);
  meta.put({ key: TOTAL_KEY, value: Math.max(0, total + blob.size) });
  await txDone(tx);
  return 'stored';
}

export async function deleteCachedMedia(url: string): Promise<void> {
  if (!isMediaCacheAvailable() || !url) return;
  const db = await openMediaDB();
  const tx = db.transaction([MEDIA_STORE, META_STORE], 'readwrite');
  const store = tx.objectStore(MEDIA_STORE);
  const meta = tx.objectStore(META_STORE);
  const row = (await req(store.get(url))) as MediaCacheEntry | undefined;
  if (row) {
    const total = await readTotal(meta);
    store.delete(url);
    meta.put({ key: TOTAL_KEY, value: Math.max(0, total - row.size) });
  }
  await txDone(tx);
}

export async function clearMediaCache(): Promise<void> {
  if (!isMediaCacheAvailable()) return;
  const db = await openMediaDB();
  const tx = db.transaction([MEDIA_STORE, META_STORE], 'readwrite');
  tx.objectStore(MEDIA_STORE).clear();
  tx.objectStore(META_STORE).clear();
  await txDone(tx);
}

// ── Descarga y precalentado ──────────────────────────────────────────────────

export type FetchLike = (url: string, init?: { signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; headers: { get(name: string): string | null }; blob(): Promise<Blob> }>;

function defaultFetch(): FetchLike | null {
  return typeof fetch === 'function' ? (fetch as unknown as FetchLike) : null;
}

export type CacheFromNetworkResult = PutMediaResult | 'fetch_failed' | 'fresh';

/**
 * Baja la imagen y la guarda. Si `Content-Length` ya dice que supera el tope
 * por imagen, ni se lee el cuerpo. Con `skipIfFresh`, no vuelve a bajar una
 * entrada más nueva que `MEDIA_REFRESH_AFTER_MS`.
 */
export async function cacheImageFromNetwork(
  url: string,
  options: { fetchImpl?: FetchLike; signal?: AbortSignal; skipIfFresh?: boolean; now?: number } = {},
): Promise<CacheFromNetworkResult> {
  if (!isMediaCacheAvailable() || !url) return 'unavailable';
  const now = options.now ?? Date.now();
  if (options.skipIfFresh) {
    const existing = await getCachedMediaEntry(url);
    if (existing && now - existing.stored_at < MEDIA_REFRESH_AFTER_MS) return 'fresh';
  }
  const doFetch = options.fetchImpl ?? defaultFetch();
  if (!doFetch) return 'unavailable';
  try {
    const res = await doFetch(url, { signal: options.signal });
    if (!res.ok) return 'fetch_failed';
    const declared = Number(res.headers.get('content-length'));
    if (Number.isFinite(declared) && declared > maxItemBytes) return 'too_large';
    const blob = await res.blob();
    return putCachedMedia(url, blob, now);
  } catch {
    return 'fetch_failed';
  }
}

export interface WarmMediaCacheOptions {
  fetchImpl?: FetchLike;
  /** Descargas simultáneas (pequeño: no compite con el POS). */
  concurrency?: number;
  /** Se consulta entre lotes; si devuelve false, el precalentado para. */
  shouldContinue?: () => boolean;
  onProgress?: (done: number, total: number) => void;
}

export interface WarmMediaCacheResult {
  requested: number;
  stored: number;
  skipped: number;
  failed: number;
  tooLarge: number;
  aborted: boolean;
}

function yieldToUi(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

let warmInFlight: Promise<WarmMediaCacheResult> | null = null;

export function isMediaCacheWarming(): boolean {
  return warmInFlight !== null;
}

/**
 * Precalienta la caché con las URLs dadas, en lotes de `concurrency` (2 por
 * defecto) cediendo el hilo entre lotes. Salta lo que ya está guardado. Una
 * sola pasada a la vez: las llamadas concurrentes comparten la promesa.
 */
export function warmMediaCache(urls: Iterable<string>, options: WarmMediaCacheOptions = {}): Promise<WarmMediaCacheResult> {
  if (warmInFlight) return warmInFlight;
  warmInFlight = runWarm(urls, options).finally(() => {
    warmInFlight = null;
  });
  return warmInFlight;
}

async function runWarm(urls: Iterable<string>, options: WarmMediaCacheOptions): Promise<WarmMediaCacheResult> {
  const result: WarmMediaCacheResult = { requested: 0, stored: 0, skipped: 0, failed: 0, tooLarge: 0, aborted: false };
  if (!isMediaCacheAvailable()) return result;
  const concurrency = Math.max(1, options.concurrency ?? 2);
  const already = await listCachedMediaUrls();
  const pending: string[] = [];
  for (const url of new Set(urls)) {
    if (!url) continue;
    result.requested++;
    if (already.has(url)) result.skipped++;
    else pending.push(url);
  }
  let done = result.skipped;
  for (let i = 0; i < pending.length; i += concurrency) {
    if (options.shouldContinue && !options.shouldContinue()) {
      result.aborted = true;
      break;
    }
    const batch = pending.slice(i, i + concurrency);
    const outcomes = await Promise.all(batch.map((url) => cacheImageFromNetwork(url, { fetchImpl: options.fetchImpl })));
    for (const outcome of outcomes) {
      if (outcome === 'stored') result.stored++;
      else if (outcome === 'too_large') result.tooLarge++;
      else if (outcome === 'fresh') result.skipped++;
      else result.failed++;
    }
    done += batch.length;
    options.onProgress?.(done, result.requested);
    await yieldToUi();
  }
  return result;
}

// ── Resolución para la UI ────────────────────────────────────────────────────

export type ResolvedImageSource = { src: string; fromCache: boolean; revoke?: () => void } | null;

function createObjectUrl(blob: Blob): string | null {
  if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') return null;
  return URL.createObjectURL(blob);
}

/**
 * Núcleo de `useCachedImage`:
 *  - `online: true` → la URL tal cual (`fromCache: false`) y, en segundo
 *    plano, refresco de la caché si la entrada falta o es vieja.
 *  - `online: false` (o `forceCache`, tras un error de carga en red) → un
 *    `blob:` URL del `Blob` guardado (`fromCache: true`, con `revoke`), o
 *    null si no hay copia.
 */
export async function resolveCachedImageSrc(
  url: string | null | undefined,
  online: boolean,
  options: { forceCache?: boolean; refresh?: boolean; fetchImpl?: FetchLike } = {},
): Promise<ResolvedImageSource> {
  if (!url) return null;
  if (online && !options.forceCache) {
    if (options.refresh !== false && isMediaCacheAvailable()) {
      void cacheImageFromNetwork(url, { skipIfFresh: true, fetchImpl: options.fetchImpl }).catch(() => undefined);
    }
    return { src: url, fromCache: false };
  }
  const blob = await getCachedMedia(url);
  if (!blob) return null;
  const objectUrl = createObjectUrl(blob);
  if (!objectUrl) return null;
  return {
    src: objectUrl,
    fromCache: true,
    revoke: () => {
      try {
        URL.revokeObjectURL(objectUrl);
      } catch {
        // ya revocada
      }
    },
  };
}
