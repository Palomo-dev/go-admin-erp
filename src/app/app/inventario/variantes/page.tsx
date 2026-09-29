import { Suspense } from 'react';
import { VariantesPage } from '@/components/inventario/variantes';

/**
 * «Variantes»: tipos y valores del catálogo en una página con pestañas
 * (`?tab=tipos|valores`). `Suspense` porque los listados leen la URL.
 */
export default function InventarioVariantesPage() {
  return (
    <div className="min-h-full bg-canvas">
      <Suspense fallback={null}>
        <VariantesPage />
      </Suspense>
    </div>
  );
}
