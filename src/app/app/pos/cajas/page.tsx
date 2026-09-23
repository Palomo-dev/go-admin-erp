'use client';

import { Suspense } from 'react';
import { CajasPage } from '@/components/pos/cajas/listado/CajasPage';

/**
 * /app/pos/cajas — «Mi caja», «Cajas abiertas» e «Historial» (Figma 680:404392).
 * La pestaña y los filtros del historial viven en la URL (`useSearchParams`),
 * por eso la página va dentro de `Suspense`.
 */
export default function CajasRoute() {
  return (
    <Suspense fallback={null}>
      <CajasPage />
    </Suspense>
  );
}
