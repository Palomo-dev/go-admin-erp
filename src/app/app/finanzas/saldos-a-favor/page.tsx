import { Suspense } from 'react';
import { ListadoSaldosAFavor } from '@/components/finanzas/saldos-a-favor';

export default function Page() {
  // `useSearchParams` (estado del listado y hoja `?saldo=`) pide un límite de Suspense.
  return (
    <Suspense fallback={null}>
      <ListadoSaldosAFavor />
    </Suspense>
  );
}
