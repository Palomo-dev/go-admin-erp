'use client';

import * as React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { formatTimeInTz } from '@/lib/utils/dateDisplay';
import type { KitchenTicket } from '@/lib/services/kitchenService';
import {
  alergiaPendiente,
  columnaDe,
  itemsDeEstacion,
  minutosTranscurridos,
  nivelTiempo,
  objetivoDe,
  type FiltroEstacion,
  type GrupoMesa,
} from '@/lib/pos/cocina/tableroComandas';
import { cantidadComanda, textoCantidadComanda } from '@/components/pos/comandas/TicketCard';
import type { ProductoModoVenta } from '@/lib/pos/peso/modoVenta';
import { useTituloComanda, type AccionTarjeta } from './ComandaTarjeta';

/**
 * «Agrupar por mesa» (Figma 959:584798): una tarjeta por mesa o pedido con sus
 * rondas apiladas y el estado de cada una. La acción principal actúa sobre la
 * ronda más antigua pendiente.
 */
export function GrupoMesaTarjeta({
  grupo,
  estacion,
  rondas,
  ahora,
  timezone,
  puedeOperar,
  ocupada,
  onAccion,
  onConfirmarAlergia,
  onVer,
}: {
  grupo: GrupoMesa<KitchenTicket>;
  estacion: FiltroEstacion;
  rondas: Map<number, number>;
  ahora: Date;
  timezone: string;
  puedeOperar: boolean;
  ocupada?: boolean;
  onAccion: (c: KitchenTicket, accion: AccionTarjeta) => void;
  onConfirmarAlergia: (c: KitchenTicket) => void;
  onVer?: (c: KitchenTicket) => void;
}) {
  const t = useTranslations('posComandasV2.tarjeta');
  const tg = useTranslations('posComandasV2.agrupado');
  const locale = useLocale();
  const titulo = useTituloComanda();
  const primera = grupo.comandas[0];
  const titular = primera.pedido_web ? titulo(primera) : primera.table_sessions?.restaurant_tables?.name || titulo(primera);
  const mesero = primera.table_sessions?.serverName || primera.server_name || null;
  const zona = primera.table_sessions?.restaurant_tables?.zone || null;
  const comensales = primera.table_sessions?.customers ?? null;
  const web = primera.pedido_web;
  const sub = web
    ? [web.tipo === 'dine_in' ? t('comerAqui') : web.tipo === 'pickup' ? t('webRecoger') : t('domicilio'),
      web.estimated_ready_at ? t('promesa', { hora: formatTimeInTz(web.estimated_ready_at, timezone) }) : null]
    : primera.table_sessions?.restaurant_tables?.name
      ? [zona, mesero, comensales ? tg('comensales', { n: comensales }) : null]
      : ['POS', primera.server_name];

  const pendiente = grupo.pendiente;
  const colPend = pendiente ? columnaDe(pendiente, estacion) : null;
  const rondaPend = pendiente ? rondas.get(pendiente.id) : null;
  const alergia = pendiente ? alergiaPendiente(pendiente) : false;
  const accion: AccionTarjeta | null = colPend === 'new' ? 'preparing' : colPend === 'preparing' ? 'ready' : colPend === 'ready' ? 'delivered' : null;
  const variasRondas = grupo.comandas.filter((c) => c.ticket_type !== 'adjustment').length > 1;
  const etiqueta = alergia
    ? t('confirmarAlergia')
    : accion === 'preparing'
      ? t('empezar')
      : accion === 'ready'
        ? variasRondas && rondaPend ? tg('marcarRondaLista', { n: rondaPend }) : t('marcarLista')
        : t('entregar');

  return (
    <article className="rounded-xl border border-line bg-surface p-4">
      <h3 className="text-lg font-semibold leading-6 text-fg">{titular}</h3>
      <p className="mt-0.5 text-xs text-fg-secondary">{sub.filter(Boolean).join(' · ')}</p>
      <div className="mt-3 space-y-2">
        {grupo.comandas.map((c) => {
          const col = columnaDe(c, estacion);
          const esAjuste = c.ticket_type === 'adjustment';
          const n = rondas.get(c.id);
          const etiquetaRonda = esAjuste
            ? tg('ajusteDe', { id: c.adjusts_ticket_id ?? '' })
            : c.table_sessions?.restaurant_tables?.name ? tg('ronda', { n: n ?? 1 }) : tg('pedido');
          const minutos = minutosTranscurridos(c, ahora);
          const nivel = nivelTiempo(minutos, objetivoDe(c, estacion));
          const aumento = (c.kitchen_ticket_items ?? []).find((i) => i.adjustment_kind === 'increase');
          let estadoTxt: string;
          let tono: string;
          if (alergiaPendiente(c)) {
            estadoTxt = tg('alergiaPorConfirmar');
            tono = 'border-line-danger text-danger-text';
          } else if (col === 'delivered') {
            estadoTxt = tg('servida', { hora: formatTimeInTz(c.updated_at, timezone) });
            tono = 'border-line-success text-success-text';
          } else if (col === 'ready') {
            estadoTxt = tg('lista', { hora: formatTimeInTz(c.ready_at, timezone) });
            tono = 'border-line-success text-success-text';
          } else if (col === 'preparing') {
            estadoTxt = tg('enPreparacion', { n: minutos });
            tono = nivel === 'critico' ? 'border-line-danger text-danger-text' : 'border-line-warning text-warning-text';
          } else {
            estadoTxt = esAjuste && aumento
              ? tg('nuevaAumento', { n: Math.abs(Number(aumento.quantity_delta) || 0), producto: aumento.product_name ?? '' })
              : tg('nueva', { n: minutos });
            tono = esAjuste
              ? 'border-line-warning text-warning-text'
              : nivel === 'critico' ? 'border-line-danger text-danger-text' : 'border-line-info text-info-text';
          }
          const items = itemsDeEstacion(c, estacion);
          const anulados = esAjuste ? (c.kitchen_ticket_items ?? []).filter((i) => i.adjustment_kind === 'void') : [];
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => onVer?.(c)}
              className="block w-full rounded-lg bg-subtle px-2.5 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <span className="flex flex-wrap items-center gap-2">
                <span className="text-[13px] font-semibold text-fg">{etiquetaRonda}</span>
                <span className={cn('rounded-full border bg-surface px-1.5 text-xs font-medium leading-5', tono)}>{estadoTxt}</span>
              </span>
              {items.filter((i) => i.adjustment_kind !== 'increase' || !esAjuste).filter((i) => i.adjustment_kind !== 'void').map((i) => (
                <span key={i.id} className="mt-1 block text-[13px] text-fg">
                  {textoCantidadComanda(cantidadComanda(i), i.sale_items?.products as ProductoModoVenta | undefined, locale).replace(/x$/, '×')}{' '}
                  {i.product_name || i.sale_items?.products?.name}
                  {(i.status === 'ready' || i.status === 'delivered') && col !== 'delivered' ? ' ✓' : ''}
                </span>
              ))}
              {anulados.map((i) => (
                <span key={i.id} className="mt-1 block text-[13px] text-danger-text">
                  {t('anular')} {textoCantidadComanda(cantidadComanda(i), null, locale).replace(/x$/, '×')} {i.product_name}
                </span>
              ))}
            </button>
          );
        })}
      </div>
      {pendiente && accion && puedeOperar && (
        <button
          type="button"
          disabled={ocupada}
          onClick={() => (alergia ? onConfirmarAlergia(pendiente) : onAccion(pendiente, accion))}
          className={cn(
            'mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:opacity-60',
            alergia
              ? 'bg-solid-danger text-on-solid hover:bg-danger-hover'
              : accion === 'delivered'
                ? 'bg-brand-tint text-brand-deep hover:bg-brand-tint-hover'
                : 'bg-brand-action text-fg-on-brand hover:bg-brand-action-hover',
          )}
        >
          {ocupada && <Loader2 aria-hidden="true" className="size-4 animate-spin" />}
          {etiqueta}
        </button>
      )}
    </article>
  );
}
