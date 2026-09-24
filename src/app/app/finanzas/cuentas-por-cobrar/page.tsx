import { Suspense } from 'react';
import { ListadoCartera } from '@/components/finanzas/cuentas-por-cobrar/listado/ListadoCartera';

/** Cuentas por cobrar de Finanzas. `Suspense`: el listado lee su estado de la URL. */
export default function CuentasPorCobrarPageRoute() {
  return (
    <Suspense fallback={null}>
      <ListadoCartera origen="finanzas" />
    </Suspense>
  );
}
