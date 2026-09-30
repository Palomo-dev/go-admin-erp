'use client';

/**
 * Tarjeta «Tienda web» del inicio (Figma 445:137185, bloque `463:15506`):
 * visitantes, pedidos web y conversión del periodo con su variación, y el
 * badge de visitantes en vivo (único tiempo real que funciona, §C.13).
 *
 * Datos: `GET /api/inicio/tienda-web` → `fn_inicio_tienda_web`. Sin tienda
 * (ni pedidos ni visitas nunca) o sin permiso de ventas, no se pinta. Sin
 * importes: `web_orders` no guarda moneda. «Ver analítica web» lleva a la vista
 * de detalle (`/app/inicio/analitica-web`). Las miniaturas del Figma quedan
 * pendientes (hacen falta series diarias en la RPC).
 */
import { useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/kit/EmptyState';
import { StatusBadge } from '@/components/kit/StatusBadge';
import { queryPeriodo, type FechasPeriodo, type HorasPeriodo, type PeriodoInicio } from '@/lib/dashboard/periodo';
import { variacion } from '@/lib/dashboard/resumenModulos';
import type { TiendaWeb } from '@/lib/dashboard/inicio.server';
import { LiveVisitorsBadge } from './LiveVisitorsBadge';
import { formatoEntero, formatoVariacion, useLecturaInicio } from './useLecturaInicio';

export interface TarjetaTiendaWebProps {
  organizationId: number;
  periodo: PeriodoInicio;
  horas?: HorasPeriodo | null;
  fechas?: FechasPeriodo | null;
  sucursal: number | null;
  version?: number;
}

function Casilla({ etiqueta, valor, delta, detalle, deltaTexto }: { etiqueta: string; valor: string; delta: number | null; detalle: string; deltaTexto?: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-lg border border-line bg-canvas p-3">
      <h3 className="text-xs font-medium leading-4 text-fg-secondary">{etiqueta}</h3>
      <div className="flex flex-wrap items-baseline gap-2">
        <p className="text-[22px] font-semibold leading-7 text-fg tabular-nums">{valor}</p>
        {delta !== null && deltaTexto && (
          <StatusBadge estado="variacion" etiqueta={deltaTexto} tono={delta >= 0 ? 'exito' : 'peligro'} apariencia="suave" />
        )}
      </div>
      <p className="text-xs leading-[18px] text-fg-secondary">{detalle}</p>
    </div>
  );
}

export function TarjetaTiendaWeb({ organizationId, periodo, horas, fechas, sucursal, version = 0 }: TarjetaTiendaWebProps) {
  const t = useTranslations('home.tiendaWeb');
  const locale = useLocale();
  const url = `/api/inicio/tienda-web?${queryPeriodo({ periodo, horas, fechas, sucursal })}`;
  const { estado, recargar } = useLecturaInicio<TiendaWeb>(url, organizationId, version);

  if (estado.fase === 'sinPermiso') return null;
  if (estado.fase === 'listo' && !estado.datos.activa) return null;

  const pct = (v: number) => new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(v);

  return (
    <section aria-labelledby="inicio-tienda-titulo" className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="inicio-tienda-titulo" className="text-lg font-semibold leading-6 text-fg">
          {t('titulo')}
        </h2>
        <LiveVisitorsBadge organizationId={organizationId} />
        {estado.fase === 'listo' && (estado.datos.hrefAnalitica || estado.datos.hrefPedidos) && (
          <span className="ml-auto flex flex-wrap gap-1">
            {estado.datos.hrefPedidos && (
              <Link
                href={estado.datos.hrefPedidos}
                className="rounded-lg px-2 py-1 text-sm font-medium text-link outline-none hover:underline focus-visible:ring-2 focus-visible:ring-brand"
              >
                {t('verPedidos')}
              </Link>
            )}
            {estado.datos.hrefAnalitica && (
              <Link
                href={estado.datos.hrefAnalitica}
                className="rounded-lg px-2 py-1 text-sm font-medium text-link outline-none hover:underline focus-visible:ring-2 focus-visible:ring-brand"
              >
                {t('verAnalitica')}
              </Link>
            )}
          </span>
        )}
      </div>
      {estado.fase === 'cargando' ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3" aria-busy="true">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-[104px] rounded-lg" />
          ))}
        </div>
      ) : estado.fase === 'error' ? (
        <EmptyState variante="error" compacto onReintentar={() => recargar(false)} />
      ) : estado.fase === 'listo' && estado.datos.actual && estado.datos.anterior ? (
        (() => {
          const a = estado.datos.actual;
          const b = estado.datos.anterior;
          const conv = a.visitantes > 0 ? (a.pedidos_pagados / a.visitantes) * 100 : 0;
          const convAnt = b.visitantes > 0 ? (b.pedidos_pagados / b.visitantes) * 100 : null;
          const dVis = variacion(a.visitantes, b.visitantes);
          const dPed = variacion(a.pedidos, b.pedidos);
          const dConv = convAnt === null || a.visitantes === 0 ? null : conv - convAnt;
          return (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Casilla
                  etiqueta={t('visitantes')}
                  valor={formatoEntero(a.visitantes, locale)}
                  delta={dVis}
                  deltaTexto={dVis !== null ? formatoVariacion(dVis, locale) : undefined}
                  detalle={t('detalleVisitantes', {
                    sesiones: formatoEntero(a.sesiones, locale),
                    nuevas: pct(a.sesiones > 0 ? (a.sesiones_nuevas / a.sesiones) * 100 : 0),
                  })}
                />
                <Casilla
                  etiqueta={t('pedidos')}
                  valor={formatoEntero(a.pedidos, locale)}
                  delta={dPed}
                  deltaTexto={dPed !== null ? formatoVariacion(dPed, locale) : undefined}
                  detalle={t('detallePedidos', { pagados: a.pedidos_pagados, pendientes: estado.datos.pendientes ?? 0 })}
                />
                <Casilla
                  etiqueta={t('conversion')}
                  valor={`${pct(conv)} %`}
                  delta={dConv}
                  deltaTexto={dConv !== null ? t('puntos', { valor: `${dConv > 0 ? '+' : dConv < 0 ? '−' : ''}${pct(Math.abs(dConv))}` }) : undefined}
                  detalle={t('detalleConversion')}
                />
              </div>
              {sucursal !== null && <p className="text-xs leading-4 text-fg-secondary">{t('visitasTodaTienda')}</p>}
            </>
          );
        })()
      ) : null}
    </section>
  );
}
