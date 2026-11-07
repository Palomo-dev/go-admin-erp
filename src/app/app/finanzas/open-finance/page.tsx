'use client';

import { Suspense } from 'react';
import { ConectarBancoPage } from '@/components/finanzas/open-finance/ConectarBancoPage';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * Finanzas › Tesorería › Conectar banco (Finanzas, ronda 2 · A3–A6). Antes era
 * el tablero de Open Finance con el estado de las variables de entorno: eso va
 * a la consola de la plataforma. La pestaña va en la URL (`?tab=autorizaciones`).
 */
export default function OpenFinancePage() {
  return (
    <Suspense fallback={<Skeleton className="m-4 h-64 sm:m-6" />}>
      <ConectarBancoPage />
    </Suspense>
  );
}
