'use client';

/**
 * Tarjeta «Tienda web» del inicio (Figma 445:137185, bloque `463:15506`;
 * móvil 448:205216): visitantes, pedidos web y conversión del periodo con su
 * variación y su miniatura (`463:15529` «Miniatura (serie real)»), el badge
 * de visitantes en vivo y «Ver analítica web».
 *
 * Datos: `GET /api/inicio/tienda-web` → `fn_inicio_tienda_web`, que trae la
 * serie por hora/día local del periodo (migración 20260930230100) y los
 * pedidos pendientes con los que expiran hoy (`fn_inicio_pedidos_web_pendientes`,
 * la misma del bloque «Hoy»). Sin tienda (ni pedidos ni visitas nunca) o sin
 * permiso de ventas, no se pinta. Sin importes: `web_orders` no guarda moneda.
 */
import { useEffect } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/kit/EmptyState';
import { StatusBadge } from '@/components/kit/StatusBadge';
import { clasesBoton } from '@/components/kit';
import { queryPeriodo, type FechasPeriodo, type HorasPeriodo, type PeriodoInicio } from '@/lib/dashboard/periodo';
import { variacion } from '@/lib/dashboard/resumenModulos';
import { conversionPorPunto } from '@/lib/dashboard/serieInicio';
import type { TiendaWeb } from '@/lib/dashboard/inicio.server';
import { LiveVisitorsBadge } from './LiveVisitorsBadge';
import { MiniaturaSerie, type TonoMiniatura } from './MiniaturaSerie';
import { formatoEntero, formatoVariacion, useLecturaInicio } from './useLecturaInicio';

export interface TarjetaTiendaWebProps {
  organizationId: number;
  periodo: PeriodoInicio;
  horas?: HorasPeriodo | null;
  fechas?: FechasPeriodo | null;
  sucursal: number | null;
  version?: number;
  refresco?: number;
  onFalloRefresco?: () => void;
  /**
   * Avisa al inicio si la persona ve la página de analítica (lo decide el
   * servidor: `hrefAnalitica` de `GET /api/inicio/tienda-web`), para la acción
   * «Ver analítica web» del menú «⋯». `null` = no la ve o no hay dato.
   */
  onHrefAnalitica?: (href: string | null) => void;
}

function Casilla({
  etiqueta,
  valor,
  delta,
  detalle,
  deltaTexto,
  serie,
  tono,
}: {
  etiqueta: string;
  valor: string;
  delta: number | null;
  detalle: string;
  deltaTexto?: string;
  serie: readonly number[];
  tono: TonoMiniatura;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5 rounded-xl border border-line bg-subtle px-3.5 py-3">
      <h3 className="text-xs font-medium leading-4 text-fg-secondary">{etiqueta}</h3>
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-[22px] font-semibold leading-7 tracking-[-0.2px] text-fg tabular-nums">{valor}</p>
        {delta !== null && deltaTexto && (
          <StatusBadge estado="variacion" etiqueta={deltaTexto} tono={delta >= 0 ? 'exito' : 'peligro'} apariencia="suave" />
        )}
      </div>
      <p className="text-xs leading-[18px] text-fg-secondary">{detalle}</p>
      {serie.length > 1 && <MiniaturaSerie valores={serie} tono={tono} />}
    </div>
  );
}

export function TarjetaTiendaWeb({
  organizationId,
  periodo,
  horas,
  fechas,
  sucursal,
  version = 0,
  refresco,
  onFalloRefresco,
  onHrefAnalitica,
}: TarjetaTiendaWebProps) {
  const t = useTranslations('home.tiendaWeb');
  const locale = useLocale();
  const url = `/api/inicio/tienda-web?${queryPeriodo({ periodo, horas, fechas, sucursal })}`;
  const { estado, recargar } = useLecturaInicio<TiendaWeb>(url, organizationId, version, { refresco, onFalloRefresco });

  // Antes de los `return null`: las reglas de hooks exigen el mismo orden.
  const hrefAnalitica = estado.fase === 'listo' ? estado.datos.hrefAnalitica ?? null : null;
  useEffect(() => {
    onHrefAnalitica?.(hrefAnalitica);
  }, [hrefAnalitica, onHrefAnalitica]);

  if (estado.fase === 'sinPermiso') return null;
  if (estado.fase === 'listo' && !estado.datos.activa) return null;

  const pct = (v: number) => new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(v);

  return (
    <section aria-labelledby="inicio-tienda-titulo" className="flex flex-col gap-3 rounded-xl border border-line bg-surface px-4 py-3.5">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="inicio-tienda-titulo" className="text-lg font-semibold leading-6 text-fg">
          {t('titulo')}
        </h2>
        <LiveVisitorsBadge organizationId={organizationId} />
        <span className="flex-1" />
        {estado.fase === 'listo' && estado.datos.hrefAnalitica && (
          <Link href={estado.datos.hrefAnalitica} className={clasesBoton({ variante: 'fantasma', tamano: 'sm', className: 'text-fg' })}>
            {t('verAnalitica')}
          </Link>
        )}
      </div>
      {estado.fase === 'cargando' ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3" aria-busy="true">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-[150px] rounded-xl" />
          ))}
        </div>
      ) : estado.fase === 'error' ? (
        <EmptyState variante="error" compacto onReintentar={() => recargar(false)} />
      ) : estado.fase === 'listo' && estado.datos.actual && estado.datos.anterior ? (
        (() => {
          const d = estado.datos;
          const a = d.actual!;
          const b = d.anterior!;
          const serie = Array.isArray(d.serie) ? d.serie : [];
          const visitas = serie.map((p) => Number(p.visitantes) || 0);
          const pedidos = serie.map((p) => Number(p.pedidos) || 0);
          const conversiones = conversionPorPunto(visitas, serie.map((p) => Number(p.pagados) || 0));
          const conv = a.visitantes > 0 ? (a.pedidos_pagados / a.visitantes) * 100 : 0;
          const convAnt = b.visitantes > 0 ? (b.pedidos_pagados / b.visitantes) * 100 : null;
          const visitaPedido = a.visitantes > 0 ? (a.pedidos / a.visitantes) * 100 : 0;
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
                  serie={visitas}
                  tono="marca"
                />
                <Casilla
                  etiqueta={t('pedidos')}
                  valor={formatoEntero(a.pedidos, locale)}
                  delta={dPed}
                  deltaTexto={dPed !== null ? formatoVariacion(dPed, locale) : undefined}
                  detalle={t('detallePendientes', { pendientes: d.pendientes ?? 0, expiran: d.expiran_hoy ?? 0 })}
                  serie={pedidos}
                  tono="advertencia"
                />
                <Casilla
                  etiqueta={t('conversion')}
                  valor={`${pct(conv)} %`}
                  delta={dConv}
                  deltaTexto={dConv !== null ? t('puntos', { valor: `${dConv > 0 ? '+' : dConv < 0 ? '−' : ''}${pct(Math.abs(dConv))}` }) : undefined}
                  detalle={t('detalleConversionPedidos', { visitaPedido: pct(visitaPedido), pagados: formatoEntero(a.pedidos_pagados, locale) })}
                  serie={conversiones}
                  tono="exito"
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
