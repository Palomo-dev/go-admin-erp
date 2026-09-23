import { Suspense } from 'react';
import { ArbolCategorias } from '@/components/inventario/categorias/ArbolCategorias';

/**
 * Árbol de categorías. `Suspense` porque el listado lee su estado (búsqueda,
 * filtros, orden y página) de la URL con `useSearchParams`.
 */
export default function CategoriasPage() {
  return (
    <div className="min-h-full bg-canvas p-4 sm:p-6">
      <Suspense fallback={null}>
        <ArbolCategorias />
      </Suspense>
    </div>
  );
}
