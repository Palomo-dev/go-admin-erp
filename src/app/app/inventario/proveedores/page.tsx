import { Suspense } from 'react';
import CatalogoProveedores from '@/components/inventario/proveedores/CatalogoProveedores';

/**
 * Listado de proveedores. `Suspense` porque el listado lee su estado
 * (búsqueda, filtros, orden y página) de la URL con `useSearchParams`.
 */
export default function ProveedoresPage() {
  return (
    <div className="min-h-full bg-canvas p-4 sm:p-6">
      <Suspense fallback={null}>
        <CatalogoProveedores />
      </Suspense>
    </div>
  );
}