'use client';

import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { getReporteById } from '@/lib/services/reportes/reportesCatalogo';
import { CentroReportes } from './CentroReportes';
import { rutaGrupo } from './rutasReportes';
import { useContextoReportes } from './useContextoReportes';
import { useFiltrosReportes } from './useFiltrosReportes';
import { VisorReporte } from './VisorReporte';

/** Visor de un reporte del catálogo. */
export function PaginaVisor() {
  const params = useParams();
  const id = String(params.reporte ?? '');
  const t = useTranslations('reportes');
  const ctx = useContextoReportes();
  const { filtros, hoy, cambiar, queryFiltros } = useFiltrosReportes();
  const def = getReporteById(id);

  return (
    <CentroReportes
      titulo={def?.titulo ?? t('visor.bloqueado')}
      subtitulo={def ? t(`grupos.${def.grupo}`) : undefined}
      migas={
        def
          ? [
              { etiqueta: t(`grupos.${def.grupo}`), href: rutaGrupo(def.grupo, queryFiltros()) },
              { etiqueta: def.titulo },
            ]
          : [{ etiqueta: id }]
      }
    >
      <VisorReporte reporteId={id} ctx={ctx} filtros={filtros} hoy={hoy} onCambiar={cambiar} />
    </CentroReportes>
  );
}
