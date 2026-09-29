import { Suspense } from 'react';
import { FormularioAjuste } from '@/components/inventario/ajustes';

/**
 * Nuevo ajuste o ajuste por conteo. Lee `?producto_id`, `?modo` (o `?type`),
 * `?branchId` y `?desde` con `useSearchParams`, de ahí el `Suspense`.
 */
export default function InventarioNuevoAjustePage() {
  return (
    <div className="min-h-full bg-canvas p-4 sm:p-6">
      <Suspense fallback={null}>
        <FormularioAjuste />
      </Suspense>
    </div>
  );
}
