'use client';

import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { esGrupoReporte } from '@/lib/services/reportes/reportesCatalogo';
import { CentroReportes } from './CentroReportes';
import { ListaGrupo } from './ListaGrupo';
import { rutaCentro } from './rutasReportes';
import { useContextoReportes } from './useContextoReportes';
import { useFiltrosReportes } from './useFiltrosReportes';

/** Lista de un grupo, o de los módulos que no están en el plan (`adicionales`). */
export function PaginaGrupo() {
  const params = useParams();
  const grupo = String(params.grupo ?? '');
  const t = useTranslations('reportes');
  const ctx = useContextoReportes();
  const { queryFiltros } = useFiltrosReportes();
  const adicionales = grupo === 'adicionales';
  const conocido = adicionales || esGrupoReporte(grupo);
  const nombre = conocidos(grupo) ? t(`grupos.${grupo}`) : grupo;

  return (
    <CentroReportes
      titulo={adicionales ? t('lista.adicionales') : conocido ? t('lista.titulo', { grupo: nombre }) : t('visor.bloqueado')}
      subtitulo={adicionales ? t('lista.subtituloAdicionales') : undefined}
      migas={[{ etiqueta: adicionales ? t('lista.adicionales') : nombre, href: adicionales ? undefined : rutaCentro(queryFiltros()) }]}
    >
      {conocido ? <ListaGrupo grupoId={grupo} ctx={ctx} query={queryFiltros()} /> : null}
    </CentroReportes>
  );
}

function conocidos(grupo: string): grupo is 'contabilidad' | 'finanzas' | 'ventas' | 'inventario' | 'compras' | 'personas' | 'clientes' | 'atencion' | 'operacion' | 'hoteleria' | 'parqueadero' | 'membresias' | 'transporte' {
  return esGrupoReporte(grupo);
}
