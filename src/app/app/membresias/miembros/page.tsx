import { Suspense } from 'react';
import ListadoMiembros from '@/components/membresias/miembros/ListadoMiembros';

/**
 * Miembros: personas con membresía (P8). `Suspense` porque el listado lee búsqueda, filtro y
 * página de la URL (`useSearchParams`).
 */
export default function MiembrosPage() {
  return (
    <div className="min-h-full bg-canvas p-4 sm:p-6">
      <Suspense fallback={null}>
        <ListadoMiembros />
      </Suspense>
    </div>
  );
}
