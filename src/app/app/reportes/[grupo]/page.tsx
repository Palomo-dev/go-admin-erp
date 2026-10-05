import { Suspense } from 'react';
import { EsqueletoCentro } from '@/components/reportes/EsqueletoCentro';
import { PaginaGrupo } from '@/components/reportes/PaginaGrupo';

/** Reportes de un módulo, o los que el plan no incluye (`adicionales`). */
export default function ReportesGrupoPage() {
  return (
    <div className="min-h-full bg-canvas">
      <Suspense fallback={<EsqueletoCentro />}>
        <PaginaGrupo />
      </Suspense>
    </div>
  );
}
