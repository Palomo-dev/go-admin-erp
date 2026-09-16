'use client';

/**
 * `useCachedImage(url)` — imagen de producto con respaldo local (fase 4D).
 *
 * Fuera de Go Admin Desktop devuelve la URL tal cual y no toca IndexedDB:
 * la web no cambia. En Desktop:
 *  - con red → la URL normal (y refresca la caché en segundo plano);
 *  - sin red, o si `onError` avisa de que la carga en red falló → un
 *    `blob:` URL del `Blob` guardado en `goadmin-media`, o null si no hay
 *    copia (la tarjeta muestra «Sin imagen»).
 *
 * Los `blob:` URL se revocan al cambiar de imagen o desmontar.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { isDesktop } from '@/lib/utils/desktop';
import { isAppOnline } from '@/lib/utils/offlineCache';
import { resolveCachedImageSrc, type ResolvedImageSource } from './mediaCache';

export interface CachedImage {
  /** Qué poner en `src`; null = sin imagen disponible. */
  src: string | null;
  /** true si `src` es un `blob:` de la caché local. */
  fromCache: boolean;
  /** Pásalo al `onError` de la `<img>`/`<Image>`: intenta la copia local. */
  onError: () => void;
}

export function useCachedImage(url: string | null | undefined): CachedImage {
  const desktop = isDesktop();
  const [state, setState] = useState<{ url: string | null | undefined; src: string | null; fromCache: boolean }>(() => ({
    url,
    src: url ?? null,
    fromCache: false,
  }));
  const [forceCache, setForceCache] = useState(false);
  // Cambia con `goadmin:online` / `goadmin:offline` para volver a resolver.
  const [connectivityTick, setConnectivityTick] = useState(0);
  const resolvedRef = useRef<ResolvedImageSource>(null);

  useEffect(() => {
    if (!desktop || typeof window === 'undefined') return;
    const bump = () => {
      setForceCache(false);
      setConnectivityTick((t) => t + 1);
    };
    window.addEventListener('goadmin:online', bump);
    window.addEventListener('goadmin:offline', bump);
    return () => {
      window.removeEventListener('goadmin:online', bump);
      window.removeEventListener('goadmin:offline', bump);
    };
  }, [desktop]);

  useEffect(() => {
    if (!desktop) return;
    let cancelled = false;
    const online = isAppOnline();
    resolveCachedImageSrc(url, online, { forceCache })
      .then((resolved) => {
        if (cancelled) {
          resolved?.revoke?.();
          return;
        }
        resolvedRef.current?.revoke?.();
        resolvedRef.current = resolved;
        setState({ url, src: resolved?.src ?? null, fromCache: resolved?.fromCache ?? false });
      })
      .catch(() => {
        if (!cancelled) setState({ url, src: null, fromCache: false });
      });
    return () => {
      cancelled = true;
    };
  }, [url, desktop, forceCache, connectivityTick]);

  // Al cambiar de URL, la anterior deja de forzar la caché.
  useEffect(() => {
    setForceCache(false);
  }, [url]);

  useEffect(
    () => () => {
      resolvedRef.current?.revoke?.();
      resolvedRef.current = null;
    },
    [],
  );

  const onError = useCallback(() => {
    if (desktop) setForceCache(true);
  }, [desktop]);

  if (!desktop) return { src: url ?? null, fromCache: false, onError };
  // Mientras se resuelve una URL nueva no se muestra la anterior: con red va
  // la URL directa (sin parpadeo); sin red, nada hasta leer la caché.
  if (state.url !== url) return { src: isAppOnline() && !forceCache ? (url ?? null) : null, fromCache: false, onError };
  return { src: state.src, fromCache: state.fromCache, onError };
}
