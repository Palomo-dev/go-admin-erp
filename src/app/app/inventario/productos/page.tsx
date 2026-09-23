import { Suspense } from 'react';
import CatalogoProductos from '@/components/inventario/productos/CatalogoProductos';

/**
 * Catálogo de productos: listado con búsqueda, filtros, orden, acciones
 * masivas, importación y exportación (CSV y Facebook).
 *
 * `Suspense` porque el listado lee su estado (búsqueda, filtros, orden y
 * página) de la URL con `useSearchParams`.
 */
export default function ProductosPage() {
  return (
    <div className="min-h-full bg-canvas p-4 sm:p-6">
      <Suspense fallback={null}>
        <CatalogoProductos />
      </Suspense>
    </div>
  );
}
