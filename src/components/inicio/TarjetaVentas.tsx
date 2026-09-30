'use client';

/**
 * «Ventas del periodo» (Figma 445:137185, `447:73036`; móvil 448:205216):
 * total cobrado del periodo (criterio de caja), variación, «POS + tienda web ·
 * frente a los 30 días anteriores · COP» y la gráfica periodo actual frente al
 * anterior DENTRO de la tarjeta, con su leyenda y el rango. Al pulsarla abre
 * el detalle (448:196680 escritorio, 448:205745 hoja en móvil).
 *
 * Sustituye a la pareja `TarjetaVentas` (cifras) + `DashboardTendencia`
 * (gráfica aparte de 30 días fijos, con otra regla de ventas —`sales.total`
 * por `sale_date`— y sin sucursal ni periodo). Ahora una sola lectura:
 * `GET /api/inicio/ventas` → `fn_inicio_ventas_periodo` →
 * `fn_inicio_ventas_rango`, la regla única de ventas, que ya trae la serie por
 * hora/día local del periodo y del anterior. Con cobros en varias monedas no
 * hay total ni gráfica (no se suman monedas). Sin permiso de ventas (403) no
 * se pinta.
 */
import { useEffect, useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/kit/EmptyState';
import { StatusBadge } from '@/components/kit/StatusBadge';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { queryPeriodo, type FechasPeriodo, type HorasPeriodo, type PeriodoInicio } from '@/lib/dashboard/periodo';
import { formatoVariacion, useLecturaInicio, type LecturaInicio } from './useLecturaInicio';
import { GraficoVentas } from './GraficoVentas';
import { DetalleVentas } from './DetalleVentas';
import { claveComparacion, clavesLeyenda } from './textosPeriodo';
import { CANALES_CONOCIDOS, vistaVentas, type DatosVentas } from './vistaVentas';

export type { DatosVentas };

export interface TarjetaVentasProps {
  organizationId: number;
  periodo: PeriodoInicio;
  horas?: HorasPeriodo | null;
  fechas?: FechasPeriodo | null;
  sucursal: number | null;
  /** Nombre del alcance para el detalle («Sucursal Principal», «Todas las sucursales»). */
  alcance?: string;
  version?: number;
  /** «Actualizar» del encabezado: recarga sin esqueleto (ver `useLecturaInicio`). */
  refresco?: number;
  onFalloRefresco?: () => void;
  /** La página junta el error de ventas y actividad en un solo estado (445:137833). */
  onFase?: (fase: LecturaInicio<unknown>['fase']) => void;
  className?: string;
}

export function TarjetaVentas({
  organizationId,
  periodo,
  horas,
  fechas,
  sucursal,
  alcance,
  version = 0,
  refresco,
  onFalloRefresco,
  onFase,
  className,
}: TarjetaVentasProps) {
  const t = useTranslations('home.ventasPeriodo');
  const locale = useLocale();
  const { timezone } = useFormatDate(sucursal);
  const [detalleAbierto, setDetalleAbierto] = useState(false);
  const url = `/api/inicio/ventas?${queryPeriodo({ periodo, horas, fechas, sucursal })}`;
  const { estado, recargar } = useLecturaInicio<DatosVentas>(url, organizationId, version, { refresco, onFalloRefresco });

  useEffect(() => onFase?.(estado.fase), [estado.fase, onFase]);

  const vista = useMemo(
    () => (estado.fase === 'listo' ? { d: estado.datos, ...vistaVentas(estado.datos, locale, timezone) } : null),
    [estado, locale, timezone],
  );

  if (estado.fase === 'sinPermiso') return null;

  const leyenda = clavesLeyenda(periodo);
  const comparacion = claveComparacion(periodo);
  const canales = vista
    ? Object.entries(vista.d.actual?.por_canal ?? {})
        .filter(([, v]) => Number(v) !== 0)
        .sort((a, b) => Number(b[1]) - Number(a[1]))
        .map(([c]) => (CANALES_CONOCIDOS.includes(c) ? t(`canales.${c}`) : t('otroCanal')))
    : [];
  const subtitulo = vista
    ? [canales.length > 0 ? Array.from(new Set(canales)).join(' + ') : null, t(`frente.${comparacion.clave}`, comparacion.params), vista.moneda]
        .filter(Boolean)
        .join(' · ')
    : '';

  return (
    <section aria-labelledby="inicio-ventas-titulo" className={className ?? 'flex min-h-[368px] flex-col rounded-xl border border-line bg-surface'}>
      {estado.fase === 'cargando' ? (
        <div className="flex flex-1 flex-col gap-3 px-4 py-3.5" aria-busy="true">
          <h2 id="inicio-ventas-titulo" className="text-base font-semibold leading-[22px] text-fg">
            {t('titulo')}
          </h2>
          <Skeleton className="h-4 w-64" />
          <Skeleton className="min-h-[180px] w-full flex-1 rounded-lg" />
        </div>
      ) : estado.fase === 'error' ? (
        <div className="flex flex-1 flex-col gap-3 px-4 py-3.5">
          <h2 id="inicio-ventas-titulo" className="text-base font-semibold leading-[22px] text-fg">
            {t('titulo')}
          </h2>
          <EmptyState variante="error" compacto onReintentar={() => recargar(false)} />
        </div>
      ) : vista ? (
        <>
          {/* Toda la tarjeta abre el detalle: el botón del título se estira
              sobre ella («enlace estirado»), sin meter un encabezado dentro de
              un botón. */}
          <div className="relative flex flex-1 flex-col gap-3 rounded-xl px-4 py-3.5 transition-colors hover:bg-hover/40">
            <div className="flex w-full flex-wrap items-center gap-2">
              <h2 id="inicio-ventas-titulo" className="text-base font-semibold leading-[22px] text-fg">
                <button
                  type="button"
                  onClick={() => setDetalleAbierto(true)}
                  aria-haspopup="dialog"
                  title={t('abrirDetalle')}
                  className="rounded-sm text-left outline-none after:absolute after:inset-0 after:rounded-xl focus-visible:after:ring-2 focus-visible:after:ring-brand"
                >
                  {t('titulo')}
                </button>
              </h2>
              <span className="flex-1" />
              <span className="text-base font-semibold leading-[22px] text-fg tabular-nums" data-cifra="neto">
                {vista.moneda ? vista.importe(vista.neto) : t('variasMonedas')}
              </span>
              {vista.delta !== null && (
                <StatusBadge
                  estado="variacion"
                  etiqueta={formatoVariacion(vista.delta, locale)}
                  tono={vista.delta >= 0 ? 'exito' : 'peligro'}
                  apariencia="suave"
                />
              )}
            </div>
            <p className="text-[13px] leading-[18px] text-fg-secondary" data-subtitulo="ventas">
              {vista.moneda && vista.neto === 0 && vista.netoAnterior === 0 ? t('sinVentas') : subtitulo}
            </p>
            {vista.hayGrafica ? (
              <GraficoVentas
                puntos={vista.puntos}
                etiqueta={vista.etiqueta}
                importe={vista.importe}
                leyendaActual={t(`leyenda.${leyenda.actual}`)}
                leyendaAnterior={t(`leyenda.${leyenda.anterior}`)}
                titulo={t('grafica')}
                className="min-h-[180px] w-full flex-1"
              />
            ) : (
              <p className="flex min-h-[120px] flex-1 items-center justify-center text-center text-[13px] text-fg-secondary">
                {vista.moneda ? t('sinGrafica') : t('sinGraficaMonedas')}
              </p>
            )}
            {vista.hayGrafica && (
              <div className="flex w-full flex-wrap items-center gap-4 text-[13px] leading-[18px]">
                <span className="text-fg-secondary">— {t(`leyenda.${leyenda.actual}`)}</span>
                <span className="text-fg-secondary">- - {t(`leyenda.${leyenda.anterior}`)}</span>
                <span className="flex-1" />
                <span className="text-fg-secondary tabular-nums">{vista.rango}</span>
              </div>
            )}
          </div>
          <DetalleVentas
            abierto={detalleAbierto}
            onAbiertoChange={setDetalleAbierto}
            datos={vista.d}
            periodo={periodo}
            fechas={fechas ?? null}
            alcance={alcance}
            zona={timezone}
            onAbrir={() => recargar(true)}
          />
        </>
      ) : null}
    </section>
  );
}
