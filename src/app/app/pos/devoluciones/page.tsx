import { Suspense } from 'react';
import { DevolucionesPage } from '@/components/pos/devoluciones/DevolucionesPage';

/**
 * Devoluciones del POS (Figma `873:573998`). `Suspense` porque el listado lee
 * su estado de la URL (`useSearchParams`); los datos los pagina el servidor
 * (`GET /api/pos/devoluciones`).
 */
export default function DevolucionesRoute() {
  return (
    <Suspense fallback={null}>
      <DevolucionesPage />
    </Suspense>
  );
}
