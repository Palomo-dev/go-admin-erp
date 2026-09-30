'use client';

/**
 * Fila de filtros del centro de reportes (Figma 14 Reportes: «Septiembre 2026
 * · Día completo», «Comparar: agosto 2026», «Todas las sucursales», «Franja:
 * no aplica»). Con un reporte (`def`) los filtros que no admite se ven
 * deshabilitados con el motivo, no se esconden: así se entiende por qué la
 * cifra no cambia. En móvil, comparar y sucursal van al panel «Filtros».
 */
import { useId } from 'react';
import { useTranslations } from 'next-intl';
import { FilterPanel } from '@/components/kit';
import { cn } from '@/utils/Utils';
import { periodoComparado, type Comparacion, type FiltrosReportes } from '@/lib/services/reportes/filtrosUrl';
import type { ReportDefinition } from '@/lib/services/reportes/types';
import { SelectorPeriodo, useEtiquetaPeriodo } from './SelectorPeriodo';
import type { ContextoReportes } from './useContextoReportes';

export const clasesSelect =
  'h-10 min-w-0 rounded-lg border border-line-strong bg-surface px-3 text-sm text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:bg-subtle disabled:text-fg-muted';

export interface BarraFiltrosProps {
  filtros: FiltrosReportes;
  onCambiar: (parcial: Partial<FiltrosReportes>) => void;
  hoy: string;
  ctx: ContextoReportes;
  /** Reporte abierto: decide qué filtros aplican. Sin él (inicio, pestañas) aplican todos. */
  def?: Pick<ReportDefinition, 'filtros' | 'alcance'> | null;
  /** Sin comparativo (pestañas Cierres, Programados…). */
  sinComparar?: boolean;
  /** Ranura extra al final (filtro de usuario del historial). */
  extra?: React.ReactNode;
  className?: string;
}

export function BarraFiltros({ filtros, onCambiar, hoy, ctx, def, sinComparar, extra, className }: BarraFiltrosProps) {
  const t = useTranslations('reportes.filtros');
  const etiqueta = useEtiquetaPeriodo();
  const id = useId();

  const admiteFranja = !def || def.filtros.includes('franja');
  const admiteComparar = !sinComparar && (!def || def.filtros.includes('comparativo'));
  const deOrganizacion = def?.alcance === 'organizacion';
  const sucursal = ctx.resolverSucursal(filtros);

  const opcionComparar = (c: Comparacion) => {
    const p = periodoComparado(filtros.periodo, c);
    return p ? t('compararCon', { periodo: etiqueta.periodo(p) }) : '';
  };

  const selectComparar = (sufijo: string) => (
    <select
      id={`${id}-comparar-${sufijo}`}
      aria-label={t('comparar')}
      className={clasesSelect}
      disabled={!admiteComparar}
      title={admiteComparar ? undefined : t('compararNoAplica')}
      value={admiteComparar ? (filtros.comparar ?? '') : ''}
      onChange={(e) => onCambiar({ comparar: (e.target.value || null) as Comparacion | null })}
    >
      {admiteComparar ? (
        <>
          <option value="">{t('sinComparar')}</option>
          <option value="anterior">{opcionComparar('anterior')}</option>
          <option value="anio-anterior">{opcionComparar('anio-anterior')}</option>
        </>
      ) : (
        <option value="">{t('compararNoAplica')}</option>
      )}
    </select>
  );

  const selectSucursal = (sufijo: string) => (
    <select
      id={`${id}-sucursal-${sufijo}`}
      aria-label={t('sucursal')}
      className={clasesSelect}
      disabled={deOrganizacion || ctx.sucursalFija}
      title={deOrganizacion ? t('sucursalNoAplica') : ctx.sucursalFija ? t('sucursalFija') : undefined}
      value={deOrganizacion ? 'org' : sucursal === null ? 'todas' : String(sucursal)}
      onChange={(e) => onCambiar({ sucursal: e.target.value === 'todas' ? null : Number(e.target.value) })}
    >
      {deOrganizacion && <option value="org">{t('todaLaOrganizacion')}</option>}
      {!deOrganizacion && ctx.accesoTotal && <option value="todas">{t('todasLasSucursales')}</option>}
      {!deOrganizacion && ctx.sucursales.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
    </select>
  );

  const activos = (filtros.comparar && admiteComparar ? 1 : 0) + (filtros.sucursal !== undefined && !deOrganizacion ? 1 : 0);

  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      <SelectorPeriodo
        periodo={filtros.periodo}
        hoy={hoy}
        franja={admiteFranja ? 'si' : 'noAplica'}
        onPeriodoChange={(periodo) => onCambiar({ periodo })}
        className="max-lg:flex-1"
      />
      <div className="hidden flex-wrap items-center gap-2 lg:flex">
        {!sinComparar && selectComparar('e')}
        {selectSucursal('e')}
        {!admiteFranja && (
          <span aria-disabled className="inline-flex h-10 items-center rounded-lg border border-line bg-subtle px-3 text-sm text-fg-muted" title={t('franjaNoAplicaMotivo')}>
            {t('franjaNoAplica')}
          </span>
        )}
        {extra}
      </div>
      <div className="lg:hidden">
        <FilterPanel
          conteo={activos}
          onLimpiar={() => onCambiar({ comparar: null, sucursal: undefined })}
          titulo={t('titulo')}
        >
          <div className="flex flex-col gap-4">
            {!sinComparar && (
              <label htmlFor={`${id}-comparar-m`} className="flex flex-col gap-1.5 text-xs font-semibold text-fg-secondary">
                {t('comparar')}
                {selectComparar('m')}
              </label>
            )}
            <label htmlFor={`${id}-sucursal-m`} className="flex flex-col gap-1.5 text-xs font-semibold text-fg-secondary">
              {t('sucursal')}
              {selectSucursal('m')}
            </label>
            {extra}
          </div>
        </FilterPanel>
      </div>
    </div>
  );
}
