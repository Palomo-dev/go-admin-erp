import { Suspense } from 'react';
import { Skeleton } from '@/components/kit';
import { ConsignacionesPagina } from '@/components/inventario/consignaciones/ConsignacionesPagina';

/** Inventario › Consignaciones: Entregadas · Recibidas · Por aceptar (decisión del dueño 2026-11-07). */
export default function Page() {
  return (
    <Suspense fallback={<Skeleton className="m-4 h-64 sm:m-6" />}>
      <ConsignacionesPagina />
    </Suspense>
  );
}
