import { Suspense } from 'react';
import { Skeleton } from '@/components/kit';
import { CertificadosRetencionPage } from '@/components/finanzas/tributario/certificados/CertificadosRetencionPage';

/**
 * Certificados de retención por tercero y periodo (Finanzas R4-A, Figma
 * 2335:138003). `?anio=` y `?p=anual|b1..b6` fijan el periodo.
 */
export default function Page() {
  // El periodo va en la URL: useSearchParams pide Suspense.
  return (
    <Suspense fallback={<Skeleton className="m-4 h-64 sm:m-6" />}>
      <CertificadosRetencionPage />
    </Suspense>
  );
}
