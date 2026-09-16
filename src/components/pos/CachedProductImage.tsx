'use client';

/**
 * Imagen de producto del POS con respaldo local (fase 4D).
 *
 * Envuelve `useCachedImage`: fuera del Desktop es la URL de siempre; en
 * Desktop sin red (o si la carga falla) muestra el `blob:` guardado en
 * `goadmin-media`, y si no hay copia, el `fallback`. Dos presentaciones:
 *  - `card`: `next/image` con `fill` (tarjeta de `ProductSearch`);
 *  - `thumb`: `<img>` simple (miniatura del carrito).
 *
 * Un `blob:` no pasa por el optimizador de Next (`unoptimized` implícito).
 */

import Image from 'next/image';
import type { ReactNode } from 'react';
import { useCachedImage } from '@/lib/offline/useCachedImage';

interface CachedProductImageProps {
  src: string | null | undefined;
  alt: string;
  mode: 'card' | 'thumb';
  className?: string;
  sizes?: string;
  fallback: ReactNode;
}

export function CachedProductImage({ src, alt, mode, className, sizes, fallback }: CachedProductImageProps) {
  const { src: resolved, fromCache, onError } = useCachedImage(src && src.startsWith('http') ? src : null);
  if (!resolved) return <>{fallback}</>;
  if (mode === 'thumb') {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={resolved} alt={alt} className={className} onError={onError} />;
  }
  return <Image src={resolved} alt={alt} fill unoptimized={fromCache} className={className} sizes={sizes} onError={onError} />;
}

export default CachedProductImage;
