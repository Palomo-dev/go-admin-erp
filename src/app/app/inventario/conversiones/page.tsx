import { Suspense } from 'react';
import { UnidadesPage } from '@/components/inventario/unidades';

/** «Conversiones de unidades» (pestaña Conversiones de «Unidades y conversiones»). */
export default function InventarioConversionesPage() {
  return (
    <div className="min-h-full bg-canvas">
      <Suspense fallback={null}>
        <UnidadesPage pestana="conversiones" />
      </Suspense>
    </div>
  );
}
