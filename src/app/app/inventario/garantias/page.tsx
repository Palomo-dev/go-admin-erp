import { Suspense } from 'react';
import { GarantiasPage } from '@/components/inventario/garantias';

/** Reclamos de garantía. `Suspense`: el listado lee su estado de la URL. */
export default function InventarioGarantiasPage() {
  return (
    <div className="min-h-full bg-canvas p-4 sm:p-6">
      <Suspense fallback={null}>
        <GarantiasPage />
      </Suspense>
    </div>
  );
}
