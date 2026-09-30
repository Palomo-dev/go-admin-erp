'use client';

/**
 * Pantalla «Analítica web» (Figma 03 › 464:237482: listo 464:237485, sin
 * ubicación 465:241025, cargando 465:241434, móvil 465:241800 / 465:241980).
 *
 * Datos: `GET /api/analitica-web` (organización de la sesión, permiso en el
 * servidor, RPC `fn_analitica_web`). Aquí no se calcula nada de negocio salvo
 * derivados de presentación (`lib/analiticaWeb`).
 *
 * - Periodo: atajos + personalizado; «hoy» en la zona de la sucursal activa o,
 *   si no tiene, de la organización (`useFormatDate().getToday()`, regla única).
 * - Sucursal: la del header. Las visitas son de la tienda (no tienen sucursal);
 *   los pedidos y la venta media sí la respetan.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Download, RefreshCw } from 'lucide-react';
import { SegmentedControl, DateRangeButton, type RangoFechas } from '@/components/kit';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { useBranchOpcional } from '@/lib/context/BranchContext';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import {
  PERIODOS_ANALITICA,
  csvAnalitica,
  embudo as calcularEmbudo,
  indicadores as calcularIndicadores,
  rangoDePeriodo,
  type DatosAnalitica,
  type PeriodoAnalitica,
} from '@/lib/analiticaWeb/analiticaWeb';
import { GraficoVisitas } from './GraficoVisitas';
import { DeDondeEntran } from './DeDondeEntran';

type Estado =
  | { tipo: 'cargando' }
  | { tipo: 'error' }
  | { tipo: 'sinPermiso' }
  | { tipo: 'listo'; datos: DatosAnalitica; puedeExportar: boolean };

const ETIQUETA_PERIODO: Record<Exclude<PeriodoAnalitica, 'personalizado'>, string> = {
  hoy: 'today',
  ayer: 'yesterday',
  '7d': '7days',
  '30d': '30days',
  '90d': '90days',
  año: 'year',
};

function Tarjeta({ etiqueta, valor, detalle }: { etiqueta: string; valor: string; detalle?: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-lg border border-line bg-surface p-3">
      <p className="truncate text-xs font-medium text-fg-secondary">{etiqueta}</p>
      <p className="text-xl font-semibold tabular-nums text-fg">{valor}</p>
      {detalle && <p className="truncate text-xs text-fg-secondary">{detalle}</p>}
    </div>
  );
}

function Seccion({ titulo, children, accion }: { titulo: string; children: React.ReactNode; accion?: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-fg">{titulo}</h2>
        {accion}
      </div>
      {children}
    </section>
  );
}

export function AnaliticaWeb() {
  const t = useTranslations('analiticaWeb');
  const tp = useTranslations('home.periods');
  const locale = useLocale();
  const { getToday } = useFormatDate();
  const sucursalCtx = useBranchOpcional();
  const { organization } = useOrganization();
  const moneda = useMonedaOrganizacion();

  const [periodo, setPeriodo] = useState<PeriodoAnalitica>('30d');
  const [rangoCustom, setRangoCustom] = useState<RangoFechas | null>(null);
  const [comparar, setComparar] = useState(true);
  const [pais, setPais] = useState<string | null>(null);
  const [estado, setEstado] = useState<Estado>({ tipo: 'cargando' });
  const [cargandoPais, setCargandoPais] = useState(false);
  const pedido = useRef(0);

  const hoy = getToday();
  const sucursal = sucursalCtx?.branchFilter ?? null;
  const rango = useMemo(
    () => (periodo === 'personalizado' && rangoCustom ? rangoCustom : rangoDePeriodo(periodo === 'personalizado' ? '30d' : periodo, hoy)),
    [periodo, rangoCustom, hoy],
  );

  const cargar = useCallback(
    async (opciones?: { soloPais?: boolean }) => {
      const id = ++pedido.current;
      if (opciones?.soloPais) setCargandoPais(true);
      else setEstado({ tipo: 'cargando' });
      const qs = new URLSearchParams({ desde: rango.desde, hasta: rango.hasta });
      if (sucursal !== null) qs.set('sucursal', String(sucursal));
      if (pais) qs.set('pais', pais);
      try {
        const res = await fetch(`/api/analitica-web?${qs.toString()}`, { cache: 'no-store' });
        if (id !== pedido.current) return;
        if (res.status === 403) {
          setEstado({ tipo: 'sinPermiso' });
          return;
        }
        if (!res.ok) throw new Error(String(res.status));
        const json = (await res.json()) as { datos: DatosAnalitica; puedeExportar: boolean };
        if (id !== pedido.current) return;
        setEstado({ tipo: 'listo', datos: json.datos, puedeExportar: json.puedeExportar });
      } catch {
        if (id === pedido.current) setEstado({ tipo: 'error' });
      } finally {
        if (id === pedido.current) setCargandoPais(false);
      }
    },
    [rango.desde, rango.hasta, sucursal, pais],
  );

  // Periodo o sucursal: recarga completa. País: solo la parte geográfica.
  const ultimaClave = useRef('');
  useEffect(() => {
    const clave = `${rango.desde}|${rango.hasta}|${sucursal ?? ''}`;
    const soloPais = clave === ultimaClave.current;
    ultimaClave.current = clave;
    void cargar({ soloPais });
  }, [cargar, rango.desde, rango.hasta, sucursal]);

  const nf = useMemo(() => new Intl.NumberFormat(locale), [locale]);
  const pf = useMemo(() => new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 1 }), [locale]);
  const var1 = (v: number | null) =>
    v === null ? t('kpi.sinComparacion') : t('kpi.vsAnterior', { v: `${v >= 0 ? '+' : '−'}${nf.format(Math.abs(Math.round(v * 10) / 10))} %` });

  const exportar = () => {
    if (estado.tipo !== 'listo') return;
    const csv = csvAnalitica(estado.datos, {
      fecha: t('csv.fecha'),
      visitantes: t('csv.visitantes'),
      pedidos: t('csv.pedidos'),
      visitantesAnterior: t('csv.visitantesAnterior'),
      pedidosAnterior: t('csv.pedidosAnterior'),
      pais: t('csv.pais'),
      sesiones: t('csv.sesiones'),
    });
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `analitica-web_${rango.desde}_${rango.hasta}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const opcionesPeriodo = [
    ...PERIODOS_ANALITICA.map((p) => ({ valor: p as PeriodoAnalitica, etiqueta: tp(ETIQUETA_PERIODO[p]) })),
    { valor: 'personalizado' as PeriodoAnalitica, etiqueta: tp('custom') },
  ];
  const numSucursales = sucursalCtx?.branches.length ?? 0;
  const nombreSucursal = sucursal !== null ? sucursalCtx?.branches.find((b) => Number(b.id) === sucursal)?.name : undefined;

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-fg">{t('titulo')}</h1>
          <p className="text-sm text-fg-secondary">
            {organization?.name ? t('subtitulo', { organizacion: organization.name }) : t('subtituloSinOrg')}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void cargar()}
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-line-strong bg-surface px-3 text-sm font-medium text-fg hover:bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            {t('actualizar')}
          </button>
          {estado.tipo === 'listo' && estado.puedeExportar && (
            <button
              type="button"
              onClick={exportar}
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-line-strong bg-surface px-3 text-sm font-medium text-fg hover:bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              {t('exportar')}
            </button>
          )}
        </div>
      </header>

      <div className="flex flex-col gap-2">
        <p className="text-xs text-fg-secondary">
          <span className="font-medium text-fg">
            {nombreSucursal ? t('sucursal', { nombre: nombreSucursal }) : t('todasSucursales', { n: numSucursales })}
          </span>{' '}
          · {t('notaSucursal')}
        </p>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <SegmentedControl<PeriodoAnalitica>
            opciones={opcionesPeriodo}
            valor={periodo}
            onValorChange={setPeriodo}
            etiqueta={tp('label')}
            tamano="sm"
            className="max-w-full overflow-x-auto [scrollbar-width:none]"
          />
          {periodo === 'personalizado' && (
            <DateRangeButton valor={rangoCustom ?? rango} onValorChange={setRangoCustom} hoy={hoy} etiqueta={tp('customRange')} />
          )}
          <label className="inline-flex items-center gap-2 text-sm text-fg">
            <input type="checkbox" checked={comparar} onChange={(e) => setComparar(e.target.checked)} className="h-4 w-4 accent-brand" />
            {t('compararAnterior')}
          </label>
        </div>
      </div>

      {estado.tipo === 'cargando' && (
        <div role="status" aria-live="polite" className="flex flex-col gap-4">
          <span className="sr-only">{t('cargando')}</span>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="h-24 animate-pulse rounded-lg bg-subtle" />
            ))}
          </div>
          <div className="h-64 animate-pulse rounded-lg bg-subtle" />
        </div>
      )}

      {estado.tipo === 'sinPermiso' && (
        <p role="alert" className="rounded-lg border border-line bg-subtle p-4 text-sm text-fg">
          {t('sinPermiso')}
        </p>
      )}

      {estado.tipo === 'error' && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-subtle p-4">
          <p className="text-sm text-fg">{t('error')}</p>
          <button
            type="button"
            onClick={() => void cargar()}
            className="inline-flex h-8 items-center rounded-md border border-line-strong bg-surface px-3 text-sm font-medium text-fg hover:bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            {t('reintentar')}
          </button>
        </div>
      )}

      {estado.tipo === 'listo' && (() => {
        const d = estado.datos;
        const k = calcularIndicadores(d);
        const e = calcularEmbudo(d.actual);
        return (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-5" data-testid="kpis">
              <Tarjeta etiqueta={t('kpi.visitantes')} valor={nf.format(k.visitantes.valor)} detalle={comparar ? var1(k.visitantes.variacion) : undefined} />
              <Tarjeta
                etiqueta={t('kpi.sesiones')}
                valor={nf.format(k.sesiones.valor)}
                detalle={t('kpi.nuevos', { pct: pf.format(k.sesiones.pctNuevos) })}
              />
              <Tarjeta
                etiqueta={t('kpi.pedidos')}
                valor={nf.format(k.pedidos.valor)}
                detalle={t('kpi.pendientes', { n: k.pedidos.pendientes })}
              />
              <Tarjeta
                etiqueta={t('kpi.conversion')}
                valor={pf.format(k.conversion.valor)}
                detalle={
                  comparar
                    ? k.conversion.diferenciaPp === null
                      ? t('kpi.sinComparacion')
                      : t('kpi.ppVsAnterior', {
                          v: `${k.conversion.diferenciaPp >= 0 ? '+' : '−'}${nf.format(Math.abs(Math.round(k.conversion.diferenciaPp * 10) / 10))}`,
                        })
                    : undefined
                }
              />
              <Tarjeta
                etiqueta={t('kpi.ventaMedia')}
                valor={k.ventaMedia.valor === null ? '—' : moneda.formatear(k.ventaMedia.valor)}
                detalle={comparar ? var1(k.ventaMedia.variacion) : undefined}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Seccion titulo={t('embudo.titulo')}>
                <ol className="flex flex-col gap-2" data-testid="embudo">
                  {[
                    { etiqueta: t('embudo.visitantes'), valor: e.visitantes, ancho: 1, detalle: '' },
                    { etiqueta: t('embudo.pedidos'), valor: e.pedidos, ancho: e.pctPedidos, detalle: t('embudo.deVisitantes', { pct: pf.format(e.pctPedidos) }) },
                    { etiqueta: t('embudo.completados'), valor: e.completados, ancho: e.pctPedidos * e.pctCompletados, detalle: t('embudo.dePedidos', { pct: pf.format(e.pctCompletados) }) },
                  ].map((paso) => (
                    <li key={paso.etiqueta} className="flex flex-col gap-1">
                      <div className="flex items-baseline justify-between gap-2 text-sm">
                        <span className="text-fg">{paso.etiqueta}</span>
                        <span className="tabular-nums text-fg">
                          {nf.format(paso.valor)} {paso.detalle && <span className="text-xs text-fg-secondary">· {paso.detalle}</span>}
                        </span>
                      </div>
                      <span className="block h-2 rounded-full bg-brand/80" style={{ width: `${Math.max(2, Math.min(100, paso.ancho * 100))}%` }} aria-hidden="true" />
                    </li>
                  ))}
                </ol>
                <p className="text-xs text-fg-secondary">
                  {t('embudo.abandono', { pct: pf.format(e.pctAbandono), n: e.cancelados })} {t('embudo.nota')}
                </p>
              </Seccion>

              <Seccion titulo={t('grafico.titulo')}>
                <GraficoVisitas serie={d.serie} comparar={comparar} />
                <p className="text-xs text-fg-secondary">{t('zona', { zona: d.zona })}</p>
              </Seccion>
            </div>

            <Seccion titulo={t('geo.titulo')}>
              <DeDondeEntran datos={d} cargandoPais={cargandoPais} onElegirPais={setPais} />
            </Seccion>
          </>
        );
      })()}
    </div>
  );
}
