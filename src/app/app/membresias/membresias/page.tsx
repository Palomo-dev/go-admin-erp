import { Suspense } from 'react';
import ListadoMembresias from '@/components/membresias/listado/ListadoMembresias';

/**
 * Membresías (contratos): Figma C1 984:611196 · móvil C6 985:617686. `Suspense` porque el
 * listado lee su estado (búsqueda, estado, plan, cliente, página) de la URL.
 */
export default function MembresiasListadoPage() {
  return (
    <div className="min-h-full bg-canvas p-4 sm:p-6">
      <Suspense fallback={null}>
        <ListadoMembresias />
      </Suspense>
    </div>
  );
}
