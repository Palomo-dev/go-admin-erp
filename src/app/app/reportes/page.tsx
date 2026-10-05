import { Suspense } from 'react';
import { EsqueletoCentro } from '@/components/reportes/EsqueletoCentro';
import { CentroReportes } from '@/components/reportes/CentroReportes';

/** Centro de reportes: inicio, favoritos, cierres, programados e historial. */
export default function ReportesPage() {
  return (
    <div className="min-h-full bg-canvas">
      <Suspense fallback={<EsqueletoCentro />}>
        <CentroReportes />
      </Suspense>
    </div>
  );
}
