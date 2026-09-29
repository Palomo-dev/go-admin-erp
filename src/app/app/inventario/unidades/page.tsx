import { Suspense } from 'react';
import { UnidadesPage } from '@/components/inventario/unidades';

/** «Unidades de medida» (pestaña Unidades de «Unidades y conversiones»). */
export default function InventarioUnidadesPage() {
  return (
    <div className="min-h-full bg-canvas">
      <Suspense fallback={null}>
        <UnidadesPage pestana="unidades" />
      </Suspense>
    </div>
  );
}
