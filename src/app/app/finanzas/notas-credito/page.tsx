import { Suspense } from 'react';
import { ListadoNotas } from '@/components/finanzas/notas/ListadoNotas';

/**
 * Notas: listado único de notas crédito y débito (pestañas, `?tipo=debito`).
 * La ruta se conserva por los enlaces existentes. `Suspense` porque el listado
 * lee su estado de la URL; los datos los arma el servidor (`GET /api/notas`).
 */
export default function NotasPage() {
  return (
    <Suspense fallback={null}>
      <ListadoNotas />
    </Suspense>
  );
}
