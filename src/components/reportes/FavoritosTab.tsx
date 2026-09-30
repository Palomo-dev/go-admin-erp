'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Star } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { DataTable, EmptyState, ListCard } from '@/components/kit';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { aQuery } from '@/lib/services/reportes/filtrosUrl';
import { listarGuardados, marcarFavorito, type ReporteGuardado } from '@/lib/services/reportes/lecturasReportes';
import { getReporteById } from '@/lib/services/reportes/reportesCatalogo';
import { rutaReporte } from './rutasReportes';
import type { ContextoReportes } from './useContextoReportes';

export function FavoritosTab({ ctx, recarga }: { ctx: ContextoReportes; recarga: number }) {
  const t = useTranslations('reportes');
  const router = useRouter();
  const { formatDateTime } = useFormatDate();
  const [filas, setFilas] = useState<ReporteGuardado[] | null>(null);
  const [error, setError] = useState(false);

  const cargar = () => {
    if (!ctx.orgId) return;
    setError(false);
    void listarGuardados(ctx.orgId)
      .then((lista) => setFilas(lista.filter((f) => f.favorito)))
      .catch(() => setError(true));
  };

  useEffect(() => {
    cargar();
    // cargar lee orgId y recarga, que son las dependencias.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx.orgId, recarga]);

  const favoritos = (filas ?? []).flatMap((f) => {
    const def = getReporteById(f.reportId);
    return def ? [{ ...f, titulo: def.titulo, grupo: def.grupo, grupoNombre: t(`grupos.${def.grupo}`), alcance: def.alcance }] : [];
  });

  if (error) return <EmptyState variante="error" onReintentar={cargar} />;

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold text-fg">{t('favoritos.titulo', { n: favoritos.length })}</h2>
      <DataTable
        etiqueta={t('favoritos.colReporte')}
        estado={filas === null ? 'cargando' : favoritos.length === 0 ? 'vacio' : 'listo'}
        filas={favoritos}
        obtenerId={(f) => f.id}
        vacio={{ titulo: t('favoritos.vacio'), descripcion: t('favoritos.vacioDesc'), icono: Star }}
        onFilaClick={(f) => router.push(rutaReporte(f.grupo, f.reportId, Object.keys(f.filtros).length ? aQuery(f.filtros) : ''))}
        acciones={(f) => [
          {
            id: 'quitar',
            etiqueta: t('favoritos.quitar'),
            icono: Star,
            onSelect: () => {
              if (!ctx.orgId) return;
              setFilas((prev) => prev?.filter((x) => x.id !== f.id) ?? prev);
              void marcarFavorito(ctx.orgId, f.reportId, false).catch(cargar);
            },
          },
        ]}
        columnas={[
          { id: 'titulo', encabezado: t('favoritos.colReporte'), celda: (f) => (<span className="block"><span className="block font-medium">{f.titulo}</span><span className="block text-xs text-fg-secondary">{f.grupoNombre}</span></span>) },
          { id: 'filtros', encabezado: t('favoritos.colFiltros'), ocultarDebajo: 'md', celda: (f) => Object.values(f.filtros).join(' · ') || '—' },
          { id: 'alcance', encabezado: t('favoritos.colAlcance'), ocultarDebajo: 'lg', celda: (f) => (f.alcance === 'organizacion' ? t('badges.todaLaOrg') : t('badges.porSucursal')) },
          { id: 'cuando', encabezado: t('favoritos.colCuando'), celda: (f) => (f.usadoEn ? formatDateTime(f.usadoEn) : '—') },
        ]}
        tarjetaMovil={(f) => <ListCard titulo={f.titulo} subtitulo={f.grupoNombre} meta={f.usadoEn ? formatDateTime(f.usadoEn) : undefined} onClick={() => router.push(rutaReporte(f.grupo, f.reportId, aQuery(f.filtros)))} />}
      />
      <p className="text-xs text-fg-secondary">{t('favoritos.pie')}</p>
    </div>
  );
}
