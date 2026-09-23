import { Suspense } from 'react';
import { EtiquetasPage } from '@/components/inventario/etiquetas/EtiquetasPage';

/**
 * «Etiquetas de producto»: los tags de clasificación del catálogo (las
 * etiquetas de papel se imprimen desde el catálogo de productos).
 *
 * `Suspense` porque el listado lee búsqueda, filtro, orden y página de la URL.
 */
export default function InventarioEtiquetasPage() {
  return (
    <div className="min-h-full bg-canvas">
      <Suspense fallback={null}>
        <EtiquetasPage />
      </Suspense>
    </div>
  );
}
