import { Suspense } from 'react';
import { Skeleton } from '@/components/kit';
import { ListaTesoreria } from '@/components/finanzas/tesoreria/compartido';

// La pestaña (Todos · Entradas · Salidas · Traslados) va en la URL (`?tipo=`): useSearchParams pide Suspense.
export default function Page() {
  return (
    <Suspense fallback={<Skeleton className="m-4 h-64 sm:m-6" />}>
      <ListaTesoreria vista="movimientos" />
    </Suspense>
  );
}
