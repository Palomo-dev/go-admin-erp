import { Suspense } from 'react';
import { Skeleton } from '@/components/kit';
import { CuentaBancariaDetalle } from '@/components/finanzas/tesoreria/cuentas/CuentaBancariaDetalle';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense fallback={<Skeleton className="m-4 h-64 sm:m-6" />}>
      <CuentaBancariaDetalle id={id} />
    </Suspense>
  );
}
