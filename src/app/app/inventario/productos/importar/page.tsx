import { Suspense } from 'react';
import { ImportarProductosAsistente } from '@/components/inventario/productos/importar/ImportarProductosAsistente';

/**
 * Importar productos: asistente de archivo (CSV/XLS/XLSX) y de web (IA).
 * `?origen=web` abre la importación desde una tienda en línea.
 *
 * `Suspense` porque el asistente lee `?origen` con `useSearchParams`.
 */
export default function ImportarProductosPage() {
  return (
    <div className="mx-auto min-h-full w-full max-w-6xl bg-canvas p-4 sm:p-6">
      <Suspense fallback={null}>
        <ImportarProductosAsistente />
      </Suspense>
    </div>
  );
}
