'use client';

/**
 * Cuerpo de «Analítica» del módulo Sitio web (Figma B/09-01 escritorio,
 * B/09-02 móvil, B/09-03 estados; E-analitica/02 y 16). La cabecera la pone la
 * página con `MarcoSitioWeb` («Actualizar», «Exportar CSV»); el estado vive en
 * `useAnaliticaWeb` (una sola lectura de cada ruta del servidor).
 *
 * Se conserva lo que ya había (KPIs, embudo, evolución y geografía) y se
 * añaden fuentes, páginas más vistas, conversión a pedido y a reserva (esta,
 * solo restaurante) y el hueco de «Píxeles y medición».
 *
 * Datos: `GET /api/analitica-web` (RPC `fn_analitica_web`) y
 * `GET /api/sitio-web/analitica/trafico` (RPC `fn_analitica_web_trafico`).
 * Aquí no se calcula negocio salvo derivados de presentación (`lib/analiticaWeb`).
 */
import type { ReactNode } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { BranchBadge, DateRangeButton, EmptyState, KpiStrip, SegmentedControl, StatCard, StatusBadge, Tarjeta, useEsEscritorio } from '@/components/kit';
import { Skeleton } from '@/components/ui/skeleton';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import {
  PERIODOS_ANALITICA,
  embudo as calcularEmbudo,
  indicadores as calcularIndicadores,
  type PeriodoAnalitica,
} from '@/lib/analiticaWeb/analiticaWeb';
import { useTextosSeoAnalitica } from '@/components/sitio-web/seoanalitica/textos';
import { GraficoVisitas } from './GraficoVisitas';
import { DeDondeEntran } from './DeDondeEntran';
import { ConversionPedido, ConversionReserva, DeDondeLlegan, PaginasMasVistas } from './BloquesTrafico';
import type { AnaliticaWebEstado } from './useAnaliticaWeb';
import { ICONO_BLOQUE_ANALITICA, ICONO_KPI_ANALITICA } from './iconosAnalitica';
import { ICONO_ACCION_SEO } from '@/components/sitio-web/seoanalitica/iconosSeoAnalitica';
import { CLASE_TAMANO_ICONO, TRAZO_ICONO } from '@/components/sitio-web/ui/iconosSitio';

const ETIQUETA_PERIODO: Record<Exclude<PeriodoAnalitica, 'personalizado'>, string> = {
  hoy: 'today',
  ayer: 'yesterday',
  '7d': '7days',
  '30d': '30days',
  '90d': '90days',
  año: 'year',
};

export interface AnaliticaWebProps {
  a: AnaliticaWebEstado;
  /** Dirección pública (para «Copiar enlace» del vacío). */
  host: string | null;
  /** «Píxeles y medición» (B/09-01): lo pone la página del módulo. */
  pixeles?: ReactNode;
}

/** Esqueleto de B/09-03 y de cada bloque de E-analitica/02. */
export function EsqueletoAnalitica() {
  return (
    <div className="flex flex-col gap-4 lg:gap-6" aria-busy="true" data-testid="esqueleto-analitica">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-6">
        <Skeleton className="h-64 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    </div>
  );
}

export function AnaliticaWeb({ a, host, pixeles }: AnaliticaWebProps) {
  const esRestaurante = a.trafico.conReservas;
  const t = useTranslations('analiticaWeb');
  const tp = useTranslations('home.periods');
  const ts = useTextosSeoAnalitica();
  const locale = useLocale();
  const moneda = useMonedaOrganizacion();
  const escritorio = useEsEscritorio();

  const nf = new Intl.NumberFormat(locale);
  const pf = new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 1, minimumFractionDigits: 1 });
  const signo = (v: number) => `${v >= 0 ? '+' : '−'}${nf.format(Math.abs(Math.round(v * 10) / 10))}`;
  const var1 = (v: number | null) => (v === null ? t('kpi.sinComparacion') : ts('analitica.kpi.vsAnterior', { v: `${signo(v)} %` }));

  const opcionesPeriodo = [
    ...PERIODOS_ANALITICA.map((p) => ({ valor: p as PeriodoAnalitica, etiqueta: tp(ETIQUETA_PERIODO[p]) })),
    { valor: 'personalizado' as PeriodoAnalitica, etiqueta: tp('custom') },
  ];

  const filtros = (
    <div className="flex min-w-0 flex-wrap items-center gap-2 lg:gap-3">
      {a.nombreSucursal ? (
        <BranchBadge alcance="una" nombre={a.nombreSucursal} />
      ) : (
        <BranchBadge alcance="todas" cantidad={a.numSucursales} />
      )}
      {escritorio && <p className="min-w-0 flex-1 truncate text-xs text-fg-secondary">{ts('analitica.notaSucursal')}</p>}
      {escritorio ? (
        <SegmentedControl<PeriodoAnalitica>
          opciones={opcionesPeriodo}
          valor={a.periodo}
          onValorChange={a.setPeriodo}
          etiqueta={tp('label')}
          tamano="sm"
          className="max-w-full overflow-x-auto [scrollbar-width:none]"
        />
      ) : (
        <select
          aria-label={tp('label')}
          value={a.periodo}
          onChange={(e) => a.setPeriodo(e.target.value as PeriodoAnalitica)}
          className="ml-auto h-10 rounded-lg border border-line-strong bg-surface px-3 text-sm text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          {opcionesPeriodo.map((o) => (
            <option key={o.valor} value={o.valor}>
              {o.etiqueta}
            </option>
          ))}
        </select>
      )}
      {a.periodo === 'personalizado' && (
        <DateRangeButton valor={a.rangoCustom ?? a.rango} onValorChange={a.setRangoCustom} hoy={a.hoy} etiqueta={tp('customRange')} />
      )}
    </div>
  );

  if (a.estado.tipo === 'cargando') {
    return (
      <div className="flex flex-col gap-4 lg:gap-6">
        {filtros}
        <span role="status" className="sr-only">
          {t('cargando')}
        </span>
        <EsqueletoAnalitica />
      </div>
    );
  }
  if (a.estado.tipo === 'sinPermiso') {
    return (
      <div className="rounded-xl border border-line bg-surface">
        <EmptyState variante="forbidden" titulo={ts('analitica.estados.sinPermisoTitulo')} descripcion={ts('analitica.estados.sinPermisoTexto')} />
      </div>
    );
  }
  if (a.estado.tipo === 'error') {
    return (
      <div className="flex flex-col gap-4 lg:gap-6">
        {filtros}
        <div className="rounded-xl border border-line bg-surface">
          <EmptyState variante="error" titulo={ts('analitica.estados.errorTitulo')} descripcion={ts('analitica.estados.errorTexto')} onReintentar={a.actualizar} />
        </div>
      </div>
    );
  }
  if (a.vacio) {
    const copiar = async () => {
      if (!host) return;
      try {
        await navigator.clipboard.writeText(`https://${host}`);
        toast.success(ts('analitica.acciones.enlaceCopiado'));
      } catch {
        // El portapapeles puede no estar disponible (http o permisos): no pasa nada.
      }
    };
    return (
      <div className="flex flex-col gap-4 lg:gap-6">
        {filtros}
        <div className="rounded-xl border border-line bg-surface">
          <EmptyState
            variante="empty"
            titulo={ts('analitica.estados.vacioTitulo')}
            descripcion={host ? ts('analitica.estados.vacioTexto', { host }) : ts('analitica.estados.vacioTextoSinHost')}
            accion={host ? { etiqueta: ts('analitica.acciones.copiarEnlace'), icono: ICONO_ACCION_SEO.copiarEnlace, onClick: () => void copiar() } : undefined}
          />
        </div>
        {pixeles}
      </div>
    );
  }

  const d = a.estado.datos;
  const k = calcularIndicadores(d);
  const e = calcularEmbudo(d.actual);
  const conv = k.conversion.diferenciaPp;
  const ventaMedia = k.ventaMedia.variacion;

  return (
    <div className="flex flex-col gap-4 lg:gap-6">
      {filtros}

      <div data-testid="kpis">
        <KpiStrip columnas={5} etiqueta={t('kpi.visitantes')} className={escritorio ? undefined : 'grid-flow-row grid-cols-2 overflow-visible pb-0'}>
          <StatCard
            etiqueta={t('kpi.visitantes')}
            icono={ICONO_KPI_ANALITICA.visitantes}
            valor={nf.format(k.visitantes.valor)}
            detalle={var1(k.visitantes.variacion)}
          />
          <StatCard
            etiqueta={t('kpi.sesiones')}
            icono={ICONO_KPI_ANALITICA.sesiones}
            valor={nf.format(k.sesiones.valor)}
            detalle={ts('analitica.kpi.nuevos', {
              v: k.sesiones.variacion === null ? t('kpi.sinComparacion') : `${signo(k.sesiones.variacion)} %`,
              pct: pf.format(k.sesiones.pctNuevos),
            })}
          />
          {escritorio && (
            <StatCard
              etiqueta={t('kpi.pedidos')}
              icono={ICONO_KPI_ANALITICA.pedidos}
              valor={nf.format(k.pedidos.valor)}
              detalle={ts('analitica.kpi.pendientes', {
                v: k.pedidos.variacion === null ? t('kpi.sinComparacion') : `${signo(k.pedidos.variacion)} %`,
                n: nf.format(k.pedidos.pendientes),
              })}
            />
          )}
          <StatCard
            etiqueta={t('kpi.conversion')}
            icono={ICONO_KPI_ANALITICA.conversion}
            valor={pf.format(k.conversion.valor)}
            detalle={conv === null ? t('kpi.sinComparacion') : ts('analitica.kpi.ppVsAnterior', { v: signo(conv) })}
            tono={conv === null ? 'neutro' : conv >= 0 ? 'exito' : 'peligro'}
            tendencia={conv === null ? undefined : conv >= 0 ? 'sube' : 'baja'}
          />
          <StatCard
            etiqueta={t('kpi.ventaMedia')}
            icono={ICONO_KPI_ANALITICA.ventaMedia}
            valor={k.ventaMedia.valor === null ? '—' : moneda.formatear(k.ventaMedia.valor)}
            detalle={
              ventaMedia === null
                ? t('kpi.sinComparacion')
                : a.nombreSucursal
                  ? ts('analitica.kpi.ventaMediaSucursal', { v: `${signo(ventaMedia)} %`, sucursal: a.nombreSucursal })
                  : `${signo(ventaMedia)} %`
            }
            tono={ventaMedia === null ? 'neutro' : ventaMedia >= 0 ? 'exito' : 'peligro'}
            tendencia={ventaMedia === null ? undefined : ventaMedia >= 0 ? 'sube' : 'baja'}
          />
        </KpiStrip>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-6">
        <Tarjeta titulo={t('embudo.titulo')} icono={ICONO_BLOQUE_ANALITICA.embudo}>
          <ol className="flex flex-col gap-3" data-testid="embudo">
            {[
              { etiqueta: t('embudo.visitantes'), valor: e.visitantes, ancho: 1, detalle: '', color: 'bg-brand' },
              { etiqueta: t('embudo.pedidos'), valor: e.pedidos, ancho: e.pctPedidos, detalle: t('embudo.deVisitantes', { pct: pf.format(e.pctPedidos) }), color: 'bg-warning' },
              {
                etiqueta: t('embudo.completados'),
                valor: e.completados,
                ancho: e.pctPedidos * e.pctCompletados,
                detalle: t('embudo.dePedidos', { pct: pf.format(e.pctCompletados) }),
                color: 'bg-success',
              },
            ].map((paso) => (
              <li key={paso.etiqueta} className="grid grid-cols-[88px_minmax(0,1fr)] items-center gap-3 text-[13px] lg:grid-cols-[88px_minmax(0,1fr)_minmax(0,140px)]">
                <span className="text-fg-secondary">{paso.etiqueta}</span>
                <span className="relative block h-7 rounded-md bg-subtle">
                  <span
                    className={`absolute inset-y-0 left-0 flex items-center rounded-md px-2 text-xs font-semibold text-fg-on-brand tabular-nums ${paso.color}`}
                    style={{ width: `${Math.max(14, Math.min(100, paso.ancho * 100))}%` }}
                  >
                    {nf.format(paso.valor)}
                  </span>
                </span>
                <span className="col-span-2 truncate text-right text-xs text-fg-muted lg:col-span-1">{paso.detalle}</span>
              </li>
            ))}
          </ol>
          <p className="mt-3 text-xs text-fg-muted">
            {t('embudo.abandono', { pct: pf.format(e.pctAbandono), n: e.cancelados })} {t('embudo.nota')}
          </p>
        </Tarjeta>

        {escritorio && (
          <Tarjeta>
            <GraficoVisitas serie={d.serie} titulo={t('grafico.titulo')} />
          </Tarjeta>
        )}
      </div>

      {escritorio && (
        <>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-6">
            <DeDondeLlegan trafico={a.trafico} />
            <PaginasMasVistas trafico={a.trafico} />
          </div>
          <div className={`grid grid-cols-1 gap-4 lg:gap-6 ${esRestaurante ? 'lg:grid-cols-2' : ''}`}>
            <ConversionPedido trafico={a.trafico} />
            {esRestaurante && <ConversionReserva trafico={a.trafico} />}
          </div>
          {pixeles}
        </>
      )}

      <section aria-labelledby="analitica-web-geo" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="analitica-web-geo" className="flex items-center gap-2 text-base font-semibold text-fg">
            <ICONO_BLOQUE_ANALITICA.geo aria-hidden="true" className={`${CLASE_TAMANO_ICONO.base} shrink-0 text-fg-secondary`} strokeWidth={TRAZO_ICONO} />
            {t('geo.titulo')}
            <StatusBadge estado="nuevo" etiqueta={ts('analitica.geo.nuevo')} />
          </h2>
          {escritorio && <p className="text-xs text-fg-muted">{ts('analitica.geo.privacidad')}</p>}
        </div>
        <DeDondeEntran datos={d} cargandoPais={a.cargandoPais} onElegirPais={a.elegirPais} />
      </section>

      {!escritorio && (
        <>
          <Tarjeta>
            <GraficoVisitas serie={d.serie} titulo={t('grafico.titulo')} />
          </Tarjeta>
          <DeDondeLlegan trafico={a.trafico} />
          <PaginasMasVistas trafico={a.trafico} />
          <ConversionPedido trafico={a.trafico} />
          {esRestaurante && <ConversionReserva trafico={a.trafico} />}
          {pixeles}
        </>
      )}
    </div>
  );
}
