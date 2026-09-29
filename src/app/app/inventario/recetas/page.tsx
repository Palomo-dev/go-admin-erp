'use client';

import { Suspense } from 'react';
import { RecetasPage } from '@/components/inventario/recetas';

/** Recetas. `Suspense` porque el listado lee su estado de la URL con `useSearchParams`. */
export default function InventarioRecetasPage() {
  return (
    <div className="min-h-full bg-canvas p-4 sm:p-6">
      <Suspense fallback={null}>
        <RecetasPage />
      </Suspense>
    </div>
  );
}
