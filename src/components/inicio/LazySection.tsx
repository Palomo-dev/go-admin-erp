'use client';

/**
 * Wrapper que renderiza su contenido solo cuando entra en el viewport
 * usando IntersectionObserver. Muestra un skeleton mientras no se haya
 * activado. Reduce las queries iniciales al cargar /app/inicio.
 */

import React, { useEffect, useRef, useState } from 'react';
import { Skeleton } from '@/components/ui/skeleton';

interface LazySectionProps {
  children: React.ReactNode;
  /** Altura mínima del placeholder en píxeles (default 200) */
  minHeight?: number;
  /** Root margin para activar antes de que sea visible (default 100px) */
  rootMargin?: string;
}

export function LazySection({
  children,
  minHeight = 200,
  rootMargin = '100px',
}: LazySectionProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Si ya está visible (e.g. SSR sin scroll), mostrar inmediatamente
    if (typeof IntersectionObserver === 'undefined') {
      setIsVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin, threshold: 0 },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [rootMargin]);

  if (isVisible) {
    return <>{children}</>;
  }

  return (
    <div ref={ref} style={{ minHeight }} className="space-y-3">
      <Skeleton className="h-6 w-1/4 rounded-lg" />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-lg" />
        ))}
      </div>
      <Skeleton className="h-40 w-full rounded-lg" />
    </div>
  );
}
