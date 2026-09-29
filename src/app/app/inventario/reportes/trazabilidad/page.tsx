import { Suspense } from 'react';
import { TrazabilidadPage } from '@/components/inventario/reportes/trazabilidad';

/** Trazabilidad de un lote, un serial o un documento. `Suspense`: el código buscado vive en la URL. */
export default function InventarioTrazabilidadPage() {
  return (
    <div className="min-h-full bg-canvas p-4 sm:p-6">
      <Suspense fallback={null}>
        <TrazabilidadPage />
      </Suspense>
    </div>
  );
}
