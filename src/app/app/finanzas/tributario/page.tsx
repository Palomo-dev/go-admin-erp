import { Suspense } from 'react';
import { Skeleton } from '@/components/kit';
import { CentroTributarioPage } from '@/components/finanzas/tributario/centro/CentroTributarioPage';

/**
 * Centro tributario (Finanzas R4-A, Figma 2335:136794): obligaciones del periodo
 * según el perfil tributario, vencimientos del calendario oficial y enlace a cada
 * borrador o reporte. `?corte=YYYY-MM` elige el mes de corte.
 */
export default function Page() {
  // El periodo va en la URL: useSearchParams pide Suspense.
  return (
    <Suspense fallback={<Skeleton className="m-4 h-64 sm:m-6" />}>
      <CentroTributarioPage />
    </Suspense>
  );
}
