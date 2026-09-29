import { Suspense } from 'react';
import { ImagenesPage } from '@/components/inventario/imagenes';

/**
 * «Imágenes» del inventario: la biblioteca compartida y las fotos de los
 * productos. `Suspense` porque la galería lee pestaña, búsqueda, filtros y
 * página de la URL.
 */
export default function InventarioImagenesPage() {
  return (
    <div className="min-h-full bg-canvas">
      <Suspense fallback={null}>
        <ImagenesPage />
      </Suspense>
    </div>
  );
}
