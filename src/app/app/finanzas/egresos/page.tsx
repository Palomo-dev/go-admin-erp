import { Suspense } from 'react';
import { Skeleton } from '@/components/kit';
import { ListaTesoreria } from '@/components/finanzas/tesoreria/compartido';

/** Egresos: la lista de Movimientos con el tipo fijado en salidas (Figma 2386:721). */
export default function Page() {
  return (
    <Suspense fallback={<Skeleton className="m-4 h-64 sm:m-6" />}>
      <ListaTesoreria vista="egresos" />
    </Suspense>
  );
}
