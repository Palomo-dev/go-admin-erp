'use client';

import { Suspense } from 'react';
import { CostoRecetasPage } from '@/components/inventario/reportes/costo-recetas';

/** Costo de recetas. `Suspense` porque el reporte lee su estado de la URL con `useSearchParams`. */
export default function Page() {
  return (
    <div className="min-h-full bg-canvas p-4 sm:p-6">
      <Suspense fallback={null}>
        <CostoRecetasPage />
      </Suspense>
    </div>
  );
}
