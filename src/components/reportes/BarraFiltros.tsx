'use client';

/**
 * Fila de filtros del centro de reportes (Figma 14 Reportes: «Septiembre 2026
 * · Día completo», «Comparar: agosto 2026», «Todas las sucursales», «Franja:
 * no aplica»). Con un reporte (`def`) los filtros que no admite se ven
 * deshabilitados con el motivo, no se esconden: así se entiende por qué la
 * cifra no cambia. En móvil, comparar y sucursal van al panel «Filtros».
 *
 * Persona, método de pago y «Contar por» (Figma 2733:51399) solo aparecen en
 * los reportes de ventas que los declaran: en los demás no se muestran, para
 * no llenar la barra de filtros que no aplican.
 */
import { useId } from 'react';
import { useTranslations } from 'next-intl';
import { FilterPanel, SegmentedControl } from '@/components/kit';
import { MultiSelect } from '@/components/kit/MultiSelect';
import { SearchSelect } from '@/components/ui/search-select';
import { cn } from '@/utils/Utils';
import { periodoComparado, type Comparacion, type FiltrosReportes } from '@/lib/services/reportes/filtrosUrl';
import { CONTAR_POR_DEFECTO, type ContarPor } from '@/lib/services/reportes/filtrosVentas';
import type { ReportDefinition } from '@/lib/services/reportes/types';
import { SelectorPeriodo, useEtiquetaPeriodo } from './SelectorPeriodo';
import type { ContextoReportes } from './useContextoReportes';
import { useOpcionesVentas } from './useOpcionesVentas';

/** Con más personas que esto, el selector lleva buscador. */
const PERSONAS_SIN_BUSCADOR = 8;

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
  /** Sucursales que no se ofrecen en el filtro (PMS: restaurantes salvo «incluir todas»). */
  ocultarSucursalIds?: number[];
}

export function BarraFiltros({ filtros, onCambiar, hoy, ctx, def, sinComparar, extra, className, ocultarSucursalIds }: BarraFiltrosProps) {
  const t = useTranslations('reportes.filtros');
  const etiqueta = useEtiquetaPeriodo();
  const id = useId();

  const admiteFranja = !def || def.filtros.includes('franja');
  const admiteComparar = !sinComparar && (!def || def.filtros.includes('comparativo'));
  const deOrganizacion = def?.alcance === 'organizacion';
  const sucursal = ctx.resolverSucursal(filtros);
  const admitePersona = !!def?.filtros.includes('persona');
  const admiteMetodo = !!def?.filtros.includes('metodoPago');
  const admiteContar = !!def?.filtros.includes('contarPor');
  const { opciones: opcionesVentas } = useOpcionesVentas(ctx.orgId, admitePersona || admiteMetodo);

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
      {!deOrganizacion && ctx.sucursales.filter((s) => s.id === sucursal || !ocultarSucursalIds?.includes(s.id)).map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
    </select>
  );

  const opcionesPersona = opcionesVentas.personas.map((p) => ({ value: p.id, label: p.rol ? `${p.nombre} · ${p.rol}` : p.nombre }));
  // Una persona de la URL que ya no está en la lista (miembro inactivo) se sigue viendo elegida.
  if (filtros.persona && !opcionesPersona.some((o) => o.value === filtros.persona)) opcionesPersona.push({ value: filtros.persona, label: t('personaOtra') });

  const selectPersona = (sufijo: string) =>
    opcionesPersona.length > PERSONAS_SIN_BUSCADOR ? (
      <SearchSelect
        id={`${id}-persona-${sufijo}`}
        options={opcionesPersona}
        value={filtros.persona ?? 'todas'}
        onValueChange={(v) => onCambiar({ persona: v === 'todas' ? null : v })}
        noneLabel={t('personaTodas')}
        noneValue="todas"
        placeholder={t('personaTodas')}
        searchPlaceholder={t('personaBuscar')}
        emptyText={t('sinResultados')}
        className="h-10"
      />
    ) : (
      <select
        id={`${id}-persona-${sufijo}`}
        aria-label={t('persona')}
        className={clasesSelect}
        value={filtros.persona ?? ''}
        onChange={(e) => onCambiar({ persona: e.target.value || null })}
      >
        <option value="">{t('personaTodas')}</option>
        {opcionesPersona.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    );

  const opcionesMetodo = opcionesVentas.metodos.map((m) => ({ valor: m.codigo, etiqueta: m.nombre }));
  for (const codigo of filtros.metodos) if (!opcionesMetodo.some((o) => o.valor === codigo)) opcionesMetodo.push({ valor: codigo, etiqueta: codigo });

  const selectMetodo = (sufijo: string) => (
    <MultiSelect
      id={`${id}-metodo-${sufijo}`}
      aria-labelledby={`${id}-metodo-${sufijo}-etiqueta`}
      opciones={opcionesMetodo}
      valores={filtros.metodos}
      onValoresChange={(metodos) => onCambiar({ metodos })}
      placeholder={t('metodoTodos')}
      placeholderBusqueda={t('metodoBuscar')}
      textoVacio={t('sinResultados')}
    />
  );

  const opcionesContar: { valor: ContarPor; etiqueta: string }[] = [
    { valor: 'cajero', etiqueta: t('contarCajero') },
    { valor: 'vendedor', etiqueta: t('contarVendedor') },
    { valor: 'mesero', etiqueta: t('contarMesero') },
  ];
  const selectContar = (sufijo: string) => (
    <SegmentedControl<ContarPor>
      id={`${id}-contar-${sufijo}`}
      aria-labelledby={`${id}-contar-${sufijo}-etiqueta`}
      aria-describedby={`${id}-contar-${sufijo}-ayuda`}
      opciones={opcionesContar}
      valor={filtros.contarPor ?? CONTAR_POR_DEFECTO}
      onValorChange={(v) => onCambiar({ contarPor: v === CONTAR_POR_DEFECTO ? null : v })}
      tamano="sm"
    />
  );

  const activos =
    (filtros.comparar && admiteComparar ? 1 : 0) +
    (filtros.sucursal !== undefined && !deOrganizacion ? 1 : 0) +
    (admitePersona && filtros.persona ? 1 : 0) +
    (admiteMetodo && filtros.metodos.length > 0 ? 1 : 0) +
    (admiteContar && filtros.contarPor ? 1 : 0);

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
        {admitePersona && (
          <div className="w-56">
            <label htmlFor={`${id}-persona-e`} className="sr-only">
              {t('persona')}
            </label>
            {selectPersona('e')}
          </div>
        )}
        {admiteMetodo && (
          <div className="w-60">
            <span id={`${id}-metodo-e-etiqueta`} className="sr-only">
              {t('metodoPago')}
            </span>
            {selectMetodo('e')}
          </div>
        )}
        {admiteContar && (
          <div className="flex items-center gap-2" title={t('contarAyuda')}>
            <span id={`${id}-contar-e-etiqueta`} className="text-sm text-fg-secondary">
              {t('contarPor')}
            </span>
            {selectContar('e')}
            <span id={`${id}-contar-e-ayuda`} className="sr-only">
              {t('contarAyuda')}
            </span>
          </div>
        )}
        {extra}
      </div>
      <div className="lg:hidden">
        <FilterPanel
          conteo={activos}
          onLimpiar={() => onCambiar({ comparar: null, sucursal: undefined, persona: null, metodos: [], contarPor: null })}
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
            {admitePersona && (
              <div className="flex flex-col gap-1.5">
                <label htmlFor={`${id}-persona-m`} className="text-xs font-semibold text-fg-secondary">
                  {t('persona')}
                </label>
                {selectPersona('m')}
              </div>
            )}
            {admiteMetodo && (
              <div className="flex flex-col gap-1.5">
                <span id={`${id}-metodo-m-etiqueta`} className="text-xs font-semibold text-fg-secondary">
                  {t('metodoPago')}
                </span>
                {selectMetodo('m')}
              </div>
            )}
            {admiteContar && (
              <div className="flex flex-col gap-1.5">
                <span id={`${id}-contar-m-etiqueta`} className="text-xs font-semibold text-fg-secondary">
                  {t('contarPor')}
                </span>
                {selectContar('m')}
                <p id={`${id}-contar-m-ayuda`} className="text-xs text-fg-secondary">
                  {t('contarAyuda')}
                </p>
              </div>
            )}
            {extra}
          </div>
        </FilterPanel>
      </div>
    </div>
  );
}
