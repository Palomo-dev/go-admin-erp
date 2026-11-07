import { Suspense } from 'react';
import { Skeleton } from '@/components/kit';
import { ListaTesoreria } from '@/components/finanzas/tesoreria/compartido';

/** Ingresos: la lista de Movimientos con el tipo fijado en entradas (Figma 2335:142791). */
export default function Page() {
  return (
    <Suspense fallback={<Skeleton className="m-4 h-64 sm:m-6" />}>
      <ListaTesoreria vista="ingresos" />
    </Suspense>
  );
}
