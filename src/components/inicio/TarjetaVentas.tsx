'use client';

/**
 * «Ventas del periodo» (Figma 445:137185, decisión del dueño V.9b/V.9c): lo
 * COBRADO en el periodo del selector (criterio de caja), su variación frente
 * al periodo anterior, número de ventas, ticket promedio y el desglose por
 * canal (una sucursal) o por sucursal («Todas»).
 *
 * Datos: `GET /api/inicio/ventas` → `fn_inicio_ventas_periodo` →
 * `fn_inicio_ventas_rango`, la misma regla que los KPI de Ventas del POS. Con
 * cobros en varias monedas no se muestra un total (no se suman monedas). Sin
 * permiso de ventas (403) no se pinta.
 */
import { useMemo } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/kit/EmptyState';
import { StatusBadge } from '@/components/kit/StatusBadge';
import { formatMoneda } from '@/lib/utils/moneda';
import { queryPeriodo, type FechasPeriodo, type HorasPeriodo, type PeriodoInicio } from '@/lib/dashboard/periodo';
import { desgloseVentas, monedaUnica } from '@/lib/dashboard/ventasInicio';
import { variacion } from '@/lib/dashboard/resumenModulos';
import type { VentasPeriodo } from '@/lib/dashboard/inicio.server';
import { formatoEntero, formatoVariacion, useLecturaInicio } from './useLecturaInicio';

const CANALES_CONOCIDOS = ['pos', 'web', 'factura', 'mesa'];

export interface TarjetaVentasProps {
  organizationId: number;
  periodo: PeriodoInicio;
  horas?: HorasPeriodo | null;
  fechas?: FechasPeriodo | null;
  sucursal: number | null;
  version?: number;
}

export function TarjetaVentas({ organizationId, periodo, horas, fechas, sucursal, version = 0 }: TarjetaVentasProps) {
  const t = useTranslations('home.ventasPeriodo');
  const locale = useLocale();
  const url = `/api/inicio/ventas?${queryPeriodo({ periodo, horas, fechas, sucursal })}`;
  const { estado, recargar } = useLecturaInicio<VentasPeriodo & { unaSucursal: boolean }>(url, organizationId, version);

  const vista = useMemo(() => {
    if (estado.fase !== 'listo') return null;
    const d = estado.datos;
    const moneda = monedaUnica(d.monedas, d.moneda_base);
    const importe = (v: number) => (moneda ? formatMoneda(v, moneda, { decimals: 0 }) : '');
    const delta = moneda ? variacion(Number(d.actual?.neto) || 0, Number(d.anterior?.neto) || 0) : null;
    const desglose = moneda ? desgloseVentas(d.actual?.por_canal, d.actual?.por_sucursal, d.unaSucursal) : null;
    return { d, moneda, importe, delta, desglose };
  }, [estado]);

  if (estado.fase === 'sinPermiso') return null;

  const etiquetaDesglose = (clave: string, tipo: 'canal' | 'sucursal', nombres: Record<string, string>) => {
    if (clave === 'otros') return t('otros');
    if (tipo === 'canal') return CANALES_CONOCIDOS.includes(clave) ? t(`canales.${clave}`) : t('otroCanal');
    return nombres[clave] ?? t('sucursalSinNombre', { id: clave });
  };

  return (
    <section aria-labelledby="inicio-ventas-titulo" className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4 sm:p-5">
      <h2 id="inicio-ventas-titulo" className="text-lg font-semibold leading-6 text-fg">
        {t('titulo')}
      </h2>
      {estado.fase === 'cargando' ? (
        <div className="flex flex-col gap-2" aria-busy="true">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-64" />
        </div>
      ) : estado.fase === 'error' ? (
        <EmptyState variante="error" compacto onReintentar={() => recargar(false)} />
      ) : vista ? (
        <>
          <div className="flex flex-wrap items-baseline gap-2">
            <p className="text-[28px] font-semibold leading-9 tracking-[-0.3px] text-fg tabular-nums" data-cifra="neto">
              {vista.moneda ? vista.importe(Number(vista.d.actual?.neto) || 0) : t('variasMonedas')}
            </p>
            {vista.delta !== null ? (
              <StatusBadge
                estado="variacion"
                etiqueta={formatoVariacion(vista.delta, locale)}
                tono={vista.delta >= 0 ? 'exito' : 'peligro'}
                apariencia="suave"
              />
            ) : vista.moneda ? (
              <span className="text-xs text-fg-secondary">{t('sinBase')}</span>
            ) : null}
          </div>
          <p className="text-sm leading-5 text-fg-secondary">
            {Number(vista.d.actual?.ventas_cobradas) > 0
              ? t('resumen', {
                  n: Number(vista.d.actual.ventas_cobradas),
                  ventas: formatoEntero(Number(vista.d.actual.ventas_cobradas), locale),
                  ticket: vista.moneda ? vista.importe(Number(vista.d.actual.ticket_promedio) || 0) : '—',
                })
              : t('sinVentas')}
            {vista.moneda && Number(vista.d.actual?.reintegros) > 0 && (
              <> · {t('incluyeReintegros', { valor: vista.importe(Number(vista.d.actual.reintegros)) })}</>
            )}
          </p>
          {vista.moneda && Number(vista.d.anterior?.neto) > 0 && (
            <p className="text-xs leading-4 text-fg-secondary">{t('anterior', { valor: vista.importe(Number(vista.d.anterior.neto)) })}</p>
          )}
          {vista.desglose && (
            <div>
              <h3 className="mb-1 text-xs font-medium text-fg-secondary">{t(vista.desglose.tipo === 'canal' ? 'porCanal' : 'porSucursal')}</h3>
              <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-fg" data-desglose={vista.desglose.tipo}>
                {vista.desglose.filas.map((f) => (
                  <li key={f.clave} className="tabular-nums">
                    <span className="text-fg-secondary">{etiquetaDesglose(f.clave, vista.desglose!.tipo, vista.d.sucursales ?? {})}</span>{' '}
                    {vista.importe(f.total)}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      ) : null}
    </section>
  );
}
