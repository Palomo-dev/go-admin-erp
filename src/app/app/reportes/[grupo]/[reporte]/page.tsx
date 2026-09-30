import { Suspense } from 'react';
import { PaginaVisor } from '@/components/reportes/PaginaVisor';

/** Visor de un reporte. */
export default function ReportesVisorPage() {
  return (
    <div className="min-h-full bg-canvas">
      <Suspense fallback={null}>
        <PaginaVisor />
      </Suspense>
    </div>
  );
}
