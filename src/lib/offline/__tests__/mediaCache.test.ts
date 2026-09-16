/**
 * Caché de medios del Desktop (fase 4D): tope por imagen, tope total con
 * desalojo LRU, precalentado por lotes que salta lo ya guardado y se detiene
 * sin red, y el núcleo del hook `useCachedImage` con y sin red.
 */
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';

import {
  MEDIA_MAX_ITEM_BYTES,
  MEDIA_MAX_TOTAL_BYTES,
  __resetMediaCacheForTests,
  __setMediaLimitsForTests,
  cacheImageFromNetwork,
  clearMediaCache,
  getCachedMedia,
  getCachedMediaEntry,
  getMediaCacheStats,
  hasCachedMedia,
  listCachedMediaUrls,
  putCachedMedia,
  resolveCachedImageSrc,
  warmMediaCache,
  type FetchLike,
} from '../mediaCache';

const KB = 1024;

function blobOf(bytes: number, type = 'image/png'): Blob {
  return new Blob([new Uint8Array(bytes)], { type });
}

function fakeFetch(
  table: Record<string, { bytes?: number; status?: number; contentLength?: number; fail?: boolean }>,
  calls: string[] = [],
): FetchLike {
  return async (url: string) => {
    calls.push(url);
    const spec = table[url];
    if (!spec || spec.fail) throw new Error(`sin red para ${url}`);
    const status = spec.status ?? 200;
    const bytes = spec.bytes ?? 10 * KB;
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: { get: (name: string) => (name.toLowerCase() === 'content-length' ? String(spec.contentLength ?? bytes) : null) },
      blob: async () => blobOf(bytes),
    };
  };
}

describe('mediaCache', () => {
  beforeEach(async () => {
    await __resetMediaCacheForTests();
    (globalThis as Record<string, unknown>).indexedDB = new IDBFactory();
    __setMediaLimitsForTests(null);
  });

  afterAll(async () => {
    __setMediaLimitsForTests(null);
    await __resetMediaCacheForTests();
  });

  it('constantes: 80 MB en total y 300 KB por imagen', () => {
    expect(MEDIA_MAX_TOTAL_BYTES).toBe(80 * 1024 * 1024);
    expect(MEDIA_MAX_ITEM_BYTES).toBe(300 * 1024);
  });

  it('guarda y devuelve el blob por URL, y lleva el total', async () => {
    expect(await putCachedMedia('https://cdn.test/a.png', blobOf(10 * KB), 1_000)).toBe('stored');
    expect(await hasCachedMedia('https://cdn.test/a.png')).toBe(true);
    expect(await hasCachedMedia('https://cdn.test/nope.png')).toBe(false);
    const blob = await getCachedMedia('https://cdn.test/a.png', 2_000);
    expect(blob?.size).toBe(10 * KB);
    expect(await getMediaCacheStats()).toEqual({ count: 1, totalBytes: 10 * KB, maxBytes: MEDIA_MAX_TOTAL_BYTES });

    // Reemplazar la misma URL no duplica el total.
    expect(await putCachedMedia('https://cdn.test/a.png', blobOf(4 * KB), 3_000)).toBe('stored');
    expect((await getMediaCacheStats()).totalBytes).toBe(4 * KB);
  });

  it('rechaza imágenes por encima del tope por imagen (300 KB)', async () => {
    expect(await putCachedMedia('https://cdn.test/grande.png', blobOf(MEDIA_MAX_ITEM_BYTES + 1))).toBe('too_large');
    expect(await putCachedMedia('https://cdn.test/justa.png', blobOf(MEDIA_MAX_ITEM_BYTES))).toBe('stored');
    expect(await hasCachedMedia('https://cdn.test/grande.png')).toBe(false);
    expect((await getMediaCacheStats()).count).toBe(1);
  });

  it('desaloja las menos usadas (LRU) para respetar el tope total', async () => {
    __setMediaLimitsForTests({ maxTotalBytes: 30 * KB, maxItemBytes: 300 * KB });
    await putCachedMedia('https://cdn.test/1.png', blobOf(10 * KB), 1_000);
    await putCachedMedia('https://cdn.test/2.png', blobOf(10 * KB), 2_000);
    await putCachedMedia('https://cdn.test/3.png', blobOf(10 * KB), 3_000);
    // Usar la 1 mucho después: pasa a ser la más reciente.
    expect(await getCachedMedia('https://cdn.test/1.png', 200_000)).not.toBeNull();

    // La 4 no cabe: sale la menos usada, que ahora es la 2.
    expect(await putCachedMedia('https://cdn.test/4.png', blobOf(10 * KB), 300_000)).toBe('stored');
    expect([...(await listCachedMediaUrls())].sort()).toEqual(['https://cdn.test/1.png', 'https://cdn.test/3.png', 'https://cdn.test/4.png']);
    expect((await getMediaCacheStats()).totalBytes).toBe(30 * KB);

    // Una imagen de 15 KB obliga a sacar dos: la 3 (3 000) y luego la 1 (200 000); la 4 (300 000) se queda.
    expect(await putCachedMedia('https://cdn.test/5.png', blobOf(15 * KB), 400_000)).toBe('stored');
    expect([...(await listCachedMediaUrls())].sort()).toEqual(['https://cdn.test/4.png', 'https://cdn.test/5.png']);
    expect((await getMediaCacheStats()).totalBytes).toBe(25 * KB);
  });

  it('cacheImageFromNetwork: baja y guarda; ni lee el cuerpo si Content-Length supera el tope', async () => {
    const calls: string[] = [];
    const doFetch = fakeFetch(
      {
        'https://cdn.test/ok.png': { bytes: 20 * KB },
        'https://cdn.test/grande.png': { bytes: 10 * KB, contentLength: MEDIA_MAX_ITEM_BYTES + 5 },
        'https://cdn.test/404.png': { status: 404 },
        'https://cdn.test/caida.png': { fail: true },
      },
      calls,
    );
    expect(await cacheImageFromNetwork('https://cdn.test/ok.png', { fetchImpl: doFetch, now: 1_000 })).toBe('stored');
    expect(await cacheImageFromNetwork('https://cdn.test/grande.png', { fetchImpl: doFetch })).toBe('too_large');
    expect(await cacheImageFromNetwork('https://cdn.test/404.png', { fetchImpl: doFetch })).toBe('fetch_failed');
    expect(await cacheImageFromNetwork('https://cdn.test/caida.png', { fetchImpl: doFetch })).toBe('fetch_failed');
    // Fresca: no se vuelve a bajar.
    expect(await cacheImageFromNetwork('https://cdn.test/ok.png', { fetchImpl: doFetch, skipIfFresh: true, now: 2_000 })).toBe('fresh');
    // Vieja (más de 7 días): se refresca.
    expect(await cacheImageFromNetwork('https://cdn.test/ok.png', { fetchImpl: doFetch, skipIfFresh: true, now: 1_000 + 8 * 24 * 3600 * 1000 })).toBe('stored');
    expect(calls.filter((u) => u.endsWith('ok.png'))).toHaveLength(2);
  });

  it('warmMediaCache: lotes pequeños, salta lo guardado y se detiene si se va la red', async () => {
    const calls: string[] = [];
    const table: Record<string, { bytes?: number }> = {};
    const urls: string[] = [];
    for (let i = 1; i <= 7; i++) {
      const url = `https://cdn.test/p${i}.png`;
      urls.push(url);
      table[url] = { bytes: 5 * KB };
    }
    await putCachedMedia(urls[0], blobOf(5 * KB));

    let online = true;
    let batches = 0;
    const result = await warmMediaCache([...urls, urls[1], ''], {
      fetchImpl: fakeFetch(table, calls),
      concurrency: 2,
      shouldContinue: () => {
        batches++;
        if (batches === 3) online = false; // se va la red antes del tercer lote
        return online;
      },
    });
    expect(result.requested).toBe(7);
    expect(result.skipped).toBe(1);
    expect(result.stored).toBe(4); // dos lotes de 2
    expect(result.aborted).toBe(true);
    expect(calls).toHaveLength(4);
    expect(calls).not.toContain(urls[0]);
  });

  it('warmMediaCache: dos llamadas concurrentes comparten la misma pasada', async () => {
    const calls: string[] = [];
    const table = { 'https://cdn.test/x.png': { bytes: KB }, 'https://cdn.test/y.png': { bytes: KB } };
    const fetchImpl = fakeFetch(table, calls);
    const [a, b] = await Promise.all([warmMediaCache(Object.keys(table), { fetchImpl }), warmMediaCache(Object.keys(table), { fetchImpl })]);
    expect(a).toBe(b);
    expect(calls).toHaveLength(2);
  });

  describe('resolveCachedImageSrc (núcleo de useCachedImage)', () => {
    const URL_A = 'https://cdn.test/producto.png';

    it('con red devuelve la URL tal cual y refresca la caché en segundo plano', async () => {
      const calls: string[] = [];
      const fetchImpl = fakeFetch({ [URL_A]: { bytes: 3 * KB } }, calls);
      const resolved = await resolveCachedImageSrc(URL_A, true, { fetchImpl });
      expect(resolved).toEqual({ src: URL_A, fromCache: false });
      // El refresco corre aparte: esperar a que termine.
      await new Promise((r) => setTimeout(r, 20));
      expect(calls).toEqual([URL_A]);
      expect(await hasCachedMedia(URL_A)).toBe(true);
    });

    it('sin red devuelve un blob: URL de la copia local, revocable', async () => {
      await putCachedMedia(URL_A, blobOf(2 * KB, 'image/webp'));
      const resolved = await resolveCachedImageSrc(URL_A, false);
      expect(resolved?.fromCache).toBe(true);
      expect(resolved?.src.startsWith('blob:')).toBe(true);
      expect(typeof resolved?.revoke).toBe('function');
      resolved?.revoke?.();
    });

    it('sin red y sin copia devuelve null (la tarjeta muestra «Sin imagen»)', async () => {
      expect(await resolveCachedImageSrc(URL_A, false)).toBeNull();
      expect(await resolveCachedImageSrc(null, false)).toBeNull();
      expect(await resolveCachedImageSrc('', true)).toBeNull();
    });

    it('con red pero carga fallida (forceCache) cae a la copia local', async () => {
      await putCachedMedia(URL_A, blobOf(KB));
      const resolved = await resolveCachedImageSrc(URL_A, true, { forceCache: true, refresh: false });
      expect(resolved?.fromCache).toBe(true);
      resolved?.revoke?.();
    });
  });

  it('clearMediaCache vacía blobs y total', async () => {
    await putCachedMedia('https://cdn.test/a.png', blobOf(KB));
    await clearMediaCache();
    expect(await getMediaCacheStats()).toEqual({ count: 0, totalBytes: 0, maxBytes: MEDIA_MAX_TOTAL_BYTES });
    expect(await getCachedMediaEntry('https://cdn.test/a.png')).toBeNull();
  });
});
