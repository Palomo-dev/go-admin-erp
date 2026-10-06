'use client';

import * as React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import {
  ArrowLeftRight,
  Ban,
  Check,
  ChefHat,
  Clock,
  Eye,
  Loader2,
  Printer,
  RefreshCcw,
  TriangleAlert,
  Undo2,
  X,
} from 'lucide-react';
import { cn } from '@/utils/Utils';
import { RowActionsMenu } from '@/components/kit';
import type { AccionFila } from '@/components/kit/acciones';
import { formatTimeInTz } from '@/lib/utils/dateDisplay';
import type { KitchenTicket, KitchenTicketItem } from '@/lib/services/kitchenService';
import {
  alergiaPendiente,
  estacionDelItem,
  itemsDeEstacion,
  minutosTranscurridos,
  nivelTiempo,
  objetivoDe,
  type ColumnaComanda,
  type FiltroEstacion,
} from '@/lib/pos/cocina/tableroComandas';
import { cantidadComanda, textoCantidadComanda } from '@/components/pos/comandas/TicketCard';
import type { ProductoModoVenta } from '@/lib/pos/peso/modoVenta';
import { EstacionChip, useNombreEstacion } from './estacionUi';

/**
 * Tarjeta de comanda del Figma `ComandaKDS v2` (953:195581): 6 estados (nueva,
 * preparando, lista, demorada, alergia, ajuste) × 2 densidades (`tablero` en
 * el escritorio y el móvil, `kds` en la pantalla de cocina). Reutiliza el
 * `ComandaItemKDS` de abajo (953:194792): pendiente / hecho / anulado / ajuste.
 */
export type Densidad = 'tablero' | 'kds';

export type AccionTarjeta = 'preparing' | 'ready' | 'delivered' | 'recibido';

export interface PermisosTarjeta {
  operar: boolean;
  gestionar: boolean;
}

export interface ComandaTarjetaProps {
  comanda: KitchenTicket;
  columna: ColumnaComanda;
  estacion: FiltroEstacion;
  densidad: Densidad;
  ahora: Date;
  timezone: string;
  ronda?: number | null;
  permisos: PermisosTarjeta;
  /** Acción pendiente de enviar (KDS sin conexión). */
  pendienteEnvio?: boolean;
  ocupada?: boolean;
  onAccion: (comanda: KitchenTicket, accion: AccionTarjeta) => void;
  onConfirmarAlergia: (comanda: KitchenTicket) => void;
  onItem?: (comanda: KitchenTicket, item: KitchenTicketItem, hecho: boolean) => void;
  onVer?: (comanda: KitchenTicket) => void;
  onReimprimir?: (comanda: KitchenTicket) => void;
  onMover?: (comanda: KitchenTicket) => void;
  onDevolver?: (comanda: KitchenTicket) => void;
  onCancelar?: (comanda: KitchenTicket) => void;
  /** La tarjeta acaba de llegar (aviso visual 3 s, sin parpadeo). */
  nueva?: boolean;
}

/** Título grande: «Mesa 4», «Mostrador #52», «Web W-1044 · Mesa 4». */
export function useTituloComanda() {
  const t = useTranslations('posComandasV2.tarjeta');
  return React.useCallback(
    (c: KitchenTicket) => {
      const web = c.pedido_web;
      if (web) {
        const destino =
          web.tipo === 'dine_in'
            ? web.mesa
              ? t('webMesa', { mesa: web.mesa })
              : t('webComerAqui')
            : web.tipo === 'pickup'
              ? t('webRecoger')
              : t('webDomicilio');
        return `${t('web', { numero: web.order_number })} · ${destino}`;
      }
      const mesa = c.table_sessions?.restaurant_tables?.name;
      if (mesa) return mesa;
      if (c.source === 'web') return t('webSinPedido');
      return t('mostrador', { id: c.id });
    },
    [t],
  );
}

function contexto(
  c: KitchenTicket,
  t: ReturnType<typeof useTranslations>,
  timezone: string,
  ronda: number | null | undefined,
): string {
  const hora = formatTimeInTz(c.created_at, timezone);
  const mesero = c.table_sessions?.serverName || c.server_name || null;
  const zona = c.table_sessions?.restaurant_tables?.zone || null;
  if (c.ticket_type === 'adjustment') {
    return [c.adjusts_ticket_id ? t('ajusteDeComanda', { id: c.adjusts_ticket_id }) : t('ajuste'), hora].join(' · ');
  }
  const web = c.pedido_web;
  if (web) {
    const promesa = web.estimated_ready_at ? formatTimeInTz(web.estimated_ready_at, timezone) : null;
    const pago = web.payment_status === 'paid' ? t('pagadoEnLinea') : web.payment_status ? t('pagoAlRecibir') : null;
    if (web.tipo === 'dine_in') return [t('comerAqui'), hora, pago, zona].filter(Boolean).join(' · ');
    if (web.tipo === 'pickup') return [promesa ? t('para', { hora: promesa }) : hora, web.customer_name, pago].filter(Boolean).join(' · ');
    return [t('domicilio'), hora, promesa ? t('promesa', { hora: promesa }) : null].filter(Boolean).join(' · ');
  }
  if (!c.table_sessions?.restaurant_tables?.name) {
    return ['POS', hora, mesero].filter(Boolean).join(' · ');
  }
  return [ronda ? t('ronda', { n: ronda }) : null, hora, mesero, zona].filter(Boolean).join(' · ');
}

function modificadores(item: KitchenTicketItem): string[] {
  const notasVenta = item.sale_items?.notes;
  const deVenta = notasVenta && typeof notasVenta === 'object' ? notasVenta.modifiers ?? [] : [];
  const mods = (deVenta && deVenta.length ? deVenta : item.modifiers ?? []) as Array<{ name: string }>;
  const variantes = item.sale_items?.products?.variant_data || item.variant_data || {};
  return [...Object.values(variantes).filter(Boolean).map(String), ...mods.map((m) => m.name).filter(Boolean)];
}

function notaDeLinea(item: KitchenTicketItem): string | null {
  if (item.notes && typeof item.notes === 'string') return item.notes;
  const notasVenta = item.sale_items?.notes;
  if (notasVenta && typeof notasVenta === 'object' && typeof notasVenta.customer_notes === 'string') return notasVenta.customer_notes;
  return null;
}

/** Ítem de la comanda (`ComandaItemKDS`). */
function ItemComanda({
  item,
  densidad,
  tocable,
  onTocar,
}: {
  item: KitchenTicketItem;
  densidad: Densidad;
  tocable: boolean;
  onTocar?: () => void;
}) {
  const t = useTranslations('posComandasV2.tarjeta');
  const locale = useLocale();
  const kds = densidad === 'kds';
  const anulado = item.status === 'cancelled' || !!item.cancelled_at || item.adjustment_kind === 'void';
  const hecho = !anulado && (item.status === 'ready' || item.status === 'delivered');
  const esAumentoItem = item.adjustment_kind === 'increase' && Number(item.quantity_delta) > 0;
  const cantidad = textoCantidadComanda(
    esAumentoItem ? Math.abs(Number(item.quantity_delta)) : cantidadComanda(item),
    item.sale_items?.products as ProductoModoVenta | undefined,
    locale,
  ).replace(/x$/, '×');
  const nombre = item.product_name || item.sale_items?.products?.name || t('producto');
  const mods = modificadores(item);
  const nota = notaDeLinea(item);
  const delta = Math.abs(Number(item.quantity_delta) || 0);
  const esAumento = item.adjustment_kind === 'increase';

  const marcador = anulado ? (
    <X aria-hidden="true" className={cn('shrink-0 text-danger', kds ? 'mt-1 size-5' : 'mt-0.5 size-4')} strokeWidth={2} />
  ) : esAumento ? (
    <span aria-hidden="true" className={cn('shrink-0 text-center font-semibold text-warning-text', kds ? 'mt-0.5 w-6 text-lg' : 'w-5 text-sm')}>+</span>
  ) : hecho ? (
    <span className={cn('flex shrink-0 items-center justify-center rounded-full bg-success text-white', kds ? 'mt-0.5 size-6' : 'mt-0.5 size-5')}>
      <Check aria-hidden="true" className={kds ? 'size-4' : 'size-3.5'} strokeWidth={2.5} />
    </span>
  ) : (
    <span className={cn('shrink-0 rounded-full border-2 border-line-strong', kds ? 'mt-0.5 size-6' : 'mt-0.5 size-5')} />
  );

  const contenido = (
    <>
      {marcador}
      <span className="min-w-0 flex-1">
        <span className={cn('flex flex-wrap items-center gap-x-1.5 gap-y-0.5', kds ? 'text-lg font-semibold' : 'text-sm')}>
          {esAumento && delta > 0 && (
            <span className="rounded-full bg-warning px-1.5 text-xs font-semibold leading-5 text-on-solid-warning">+{delta}</span>
          )}
          {anulado && item.adjustment_kind === 'void' && (
            <span className="rounded-full bg-solid-danger px-1.5 text-xs font-semibold leading-5 text-on-solid">{t('anular')}</span>
          )}
          <span
            className={cn(
              'break-words',
              anulado ? 'text-danger-text' : hecho ? 'text-fg-muted' : 'text-fg',
              kds && !hecho && !anulado && 'font-semibold',
            )}
          >
            <span className={cn(!kds && !hecho && !anulado && 'font-medium')}>{cantidad}</span> {nombre}
          </span>
        </span>
        {mods.length > 0 && (
          <span className={cn('mt-0.5 block', kds ? 'text-sm' : 'text-xs', hecho ? 'text-fg-muted' : 'text-fg-secondary')}>
            {mods.map((m) => `+ ${m}`).join(' · ')}
          </span>
        )}
        {esAumento && item.quantity != null && (
          <span className={cn('mt-0.5 block text-warning-text', kds ? 'text-sm' : 'text-xs')}>{t('ahoraEnTotal', { n: Number(item.quantity) })}</span>
        )}
        {anulado && (item.cancel_reason || item.adjustment_reason) && (
          <span className={cn('mt-0.5 block text-danger-text', kds ? 'text-sm' : 'text-xs')}>
            {t('motivo', { motivo: item.cancel_reason || item.adjustment_reason || '' })}
          </span>
        )}
        {nota && !item.is_allergy && (
          <span className={cn('mt-1.5 flex items-center gap-1.5 rounded-md bg-subtle px-2 text-fg-secondary', kds ? 'py-1 text-sm' : 'py-0.5 text-xs')}>
            <ChefHat aria-hidden="true" className="size-3.5 shrink-0" strokeWidth={1.5} />
            <span className="break-words">{nota}</span>
          </span>
        )}
        {nota && item.is_allergy && (
          <span
            className={cn(
              'mt-1.5 flex items-center gap-1.5 rounded-md px-2 font-semibold',
              kds ? 'bg-solid-danger py-1 text-xs text-on-solid' : 'bg-danger-subtle py-0.5 text-xs text-danger-text',
            )}
          >
            <TriangleAlert aria-hidden="true" className="size-3.5 shrink-0" strokeWidth={1.5} />
            <span className="break-words">{t('alergiaNota', { nota })}</span>
          </span>
        )}
      </span>
    </>
  );

  if (tocable && onTocar) {
    return (
      <button
        type="button"
        onClick={onTocar}
        aria-pressed={hecho}
        aria-label={hecho ? t('deshacerItem', { producto: nombre }) : t('marcarItemHecho', { producto: nombre })}
        className={cn(
          'flex w-full items-start text-left rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
          kds ? 'gap-3 py-1' : 'gap-2.5 py-0.5',
        )}
      >
        {contenido}
      </button>
    );
  }
  return <div className={cn('flex items-start', kds ? 'gap-3 py-1' : 'gap-2.5 py-0.5')}>{contenido}</div>;
}

export function ComandaTarjeta({
  comanda: c,
  columna,
  estacion,
  densidad,
  ahora,
  timezone,
  ronda,
  permisos,
  pendienteEnvio,
  ocupada,
  onAccion,
  onConfirmarAlergia,
  onItem,
  onVer,
  onReimprimir,
  onMover,
  onDevolver,
  onCancelar,
  nueva,
}: ComandaTarjetaProps) {
  const t = useTranslations('posComandasV2.tarjeta');
  const titulo = useTituloComanda();
  const nombreEstacion = useNombreEstacion();
  const kds = densidad === 'kds';
  const esAjuste = c.ticket_type === 'adjustment';
  const alergia = alergiaPendiente(c);
  const minutos = minutosTranscurridos(c, ahora);
  const nivel = columna === 'new' || columna === 'preparing' ? nivelTiempo(minutos, objetivoDe(c, estacion)) : 'normal';
  const items = estacion === 'todas' ? (c.kitchen_ticket_items ?? []) : (c.kitchen_ticket_items ?? []).filter((i) => estacionDelItem(i) === estacion);
  const otras = estacion === 'todas' ? [] : itemsDeEstacion(c, 'todas').filter((i) => estacionDelItem(i) !== estacion);
  const estaciones = Array.from(new Set(itemsDeEstacion(c, 'todas').map(estacionDelItem)));
  const alergenos = (c.kitchen_ticket_items ?? []).filter((i) => i.is_allergy && i.notes).map((i) => String(i.notes));
  const tieneAumentos = (c.kitchen_ticket_items ?? []).some((i) => i.adjustment_kind === 'increase');
  const accion: AccionTarjeta | null = esAjuste && columna === 'new'
    ? 'recibido'
    : columna === 'new' ? 'preparing' : columna === 'preparing' ? 'ready' : columna === 'ready' ? 'delivered' : null;

  const borde = alergia || nivel === 'critico'
    ? 'border-line-danger'
    : esAjuste
      ? 'border-line-warning'
      : columna === 'ready'
        ? 'border-line-success'
        : 'border-line';

  const pastillaTiempo = columna === 'ready' && c.ready_at ? (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full font-medium tabular-nums',
        kds ? 'bg-success-subtle px-3 py-0.5 text-xl font-semibold text-success-text' : 'h-[22px] bg-subtle px-2 text-xs text-fg-secondary',
      )}
    >
      {!kds && <Clock aria-hidden="true" className="size-3.5" strokeWidth={1.5} />}
      {t('lista', { hora: formatTimeInTz(c.ready_at, timezone) })}
    </span>
  ) : columna === 'delivered' ? null : (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full font-medium tabular-nums',
        kds ? 'px-3 py-0.5 text-xl font-semibold' : 'h-[22px] px-2 text-xs',
        nivel === 'critico'
          ? kds ? 'bg-solid-danger text-on-solid' : 'bg-danger-subtle text-danger-text'
          : nivel === 'atencion'
            ? kds ? 'bg-warning-subtle text-warning-text' : 'bg-warning-subtle text-warning-text'
            : 'bg-subtle text-fg-secondary',
      )}
    >
      {!kds && <Clock aria-hidden="true" className="size-3.5" strokeWidth={1.5} />}
      {minutos < 1 && esAjuste ? t('ahora') : t('minutos', { n: minutos })}
    </span>
  );

  const menu: AccionFila[] = [
    ...(onVer ? [{ id: 'ver', etiqueta: t('menu.ver'), icono: Eye, onSelect: () => onVer(c) }] : []),
    ...(onReimprimir ? [{ id: 'reimprimir', etiqueta: t('menu.reimprimir'), icono: Printer, onSelect: () => onReimprimir(c) }] : []),
    ...(onMover && permisos.gestionar
      ? [{ id: 'mover', etiqueta: t('menu.mover'), icono: ArrowLeftRight, onSelect: () => onMover(c) }]
      : []),
    ...(onDevolver && permisos.gestionar && columna !== 'new'
      ? [{ id: 'devolver', etiqueta: t('menu.devolver'), icono: Undo2, onSelect: () => onDevolver(c) }]
      : []),
    ...(onCancelar && permisos.gestionar
      ? [{ id: 'cancelar', etiqueta: t('menu.cancelar'), icono: Ban, destructiva: true, onSelect: () => onCancelar(c) }]
      : []),
  ];

  const etiquetaAccion = accion === 'preparing'
    ? t('empezar')
    : accion === 'ready'
      ? t('marcarLista')
      : accion === 'delivered'
        ? t('entregar')
        : accion === 'recibido'
          ? t('recibido')
          : '';

  return (
    <div className="relative">
      {pendienteEnvio && (
        <span className="absolute left-3 top-0 z-10 -translate-y-1/2 rounded-full bg-warning px-2 text-xs font-semibold leading-5 text-on-solid-warning">
          {t('pendienteEnviar')}
        </span>
      )}
    <article
      aria-label={titulo(c)}
      className={cn(
        'relative overflow-hidden rounded-xl border-2 bg-surface',
        borde,
        nueva && 'shadow-[0_0_0_3px_rgb(var(--brand-primary)/0.35)] transition-shadow duration-700',
      )}
    >
      <header className={cn('flex items-start gap-2', kds ? 'px-4 pt-4' : 'px-4 pt-3.5')}>
        <div className="min-w-0 flex-1">
          <h3 className={cn('break-words font-semibold text-fg', kds ? 'text-2xl leading-7' : 'text-lg leading-6')}>
            {titulo(c)}
          </h3>
          <p className={cn('mt-0.5 text-fg-secondary', kds ? 'text-sm' : 'text-xs')}>{contexto(c, t, timezone, ronda)}</p>
          {!kds && pastillaTiempo && <div className="mt-1.5">{pastillaTiempo}</div>}
        </div>
        {kds && pastillaTiempo}
        {!kds && menu.length > 0 && (
          <RowActionsMenu orientacion="horizontal" tamano="sm" titulo={titulo(c)} acciones={menu} className="-mr-1 -mt-0.5" />
        )}
      </header>

      {alergia && (
        <div role="alert" className={cn('mt-3 flex items-start gap-2 bg-solid-danger px-4 py-2 font-semibold text-on-solid', kds ? 'text-sm' : 'text-xs')}>
          <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} />
          <span>{t('alergiaBanda', { alergeno: alergenos.join(', ') || t('alergiaSinDetalle') })}</span>
        </div>
      )}
      {esAjuste && (
        <div className={cn('mt-3 flex items-start gap-2 bg-warning-subtle px-4 py-2 font-medium text-warning-text', kds ? 'text-sm' : 'text-xs')}>
          <RefreshCcw aria-hidden="true" className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} />
          <span>{t('ajusteBanda', { id: c.adjusts_ticket_id ?? '' })}</span>
        </div>
      )}

      <div className={cn(kds ? 'space-y-2 px-4 pb-4 pt-3' : 'space-y-2 px-4 pb-4 pt-2.5')}>
        {!kds && estacion === 'todas' && estaciones.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {estaciones.map((e) => <EstacionChip key={e} clave={e} />)}
          </div>
        )}
        <div className={kds ? 'space-y-2' : 'space-y-1.5'}>
          {items.map((item) => {
            const anulado = item.status === 'cancelled' || !!item.cancelled_at;
            const tocable = !!onItem && permisos.operar && !alergia && !anulado && !esAjuste
              && columna !== 'delivered' && item.status !== 'delivered';
            return (
              <ItemComanda
                key={item.id}
                item={item}
                densidad={densidad}
                tocable={tocable}
                onTocar={() => onItem?.(c, item, !(item.status === 'ready'))}
              />
            );
          })}
        </div>
        {otras.length > 0 && (
          <p className={cn('text-fg-muted', kds ? 'text-xs' : 'text-xs')}>
            {t('otraEstacion', {
              n: otras.length,
              estaciones: Array.from(new Set(otras.map(estacionDelItem))).map(nombreEstacion).join(', '),
            })}
          </p>
        )}
        {accion && permisos.operar && (
          <button
            type="button"
            disabled={ocupada}
            onClick={() => (alergia ? onConfirmarAlergia(c) : onAccion(c, accion === 'recibido' ? (tieneAumentos ? 'preparing' : 'delivered') : accion))}
            className={cn(
              'mt-1 flex w-full items-center justify-center gap-2 rounded-lg font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:opacity-60',
              kds ? 'h-12 text-base' : 'h-10 text-sm',
              alergia
                ? 'bg-solid-danger text-on-solid hover:bg-danger-hover'
                : accion === 'recibido'
                  ? 'border border-line-strong bg-surface text-fg hover:bg-hover'
                  : accion === 'delivered'
                    ? 'bg-brand-tint text-brand-deep hover:bg-brand-tint-hover'
                    : 'bg-brand-action text-fg-on-brand hover:bg-brand-action-hover',
            )}
          >
            {ocupada && <Loader2 aria-hidden="true" className="size-4 animate-spin" />}
            {alergia ? t('confirmarAlergia') : etiquetaAccion}
          </button>
        )}
        {kds && esAjuste && <span className="sr-only">{t('ajuste')}</span>}
      </div>
    </article>
    </div>
  );
}

/** Fila compacta de «Entregadas» (últimos 30 min). */
export function FilaEntregada({ comanda: c, timezone, onVer }: { comanda: KitchenTicket; timezone: string; onVer?: (c: KitchenTicket) => void }) {
  const t = useTranslations('posComandasV2.tarjeta');
  const titulo = useTituloComanda();
  const preparada = c.ready_at
    ? Math.max(0, Math.round((new Date(c.ready_at).getTime() - new Date(c.created_at).getTime()) / 60000))
    : null;
  const contenido = (
    <>
      <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-success" strokeWidth={2} />
      <span className="min-w-0">
        <span className="block text-sm font-medium text-fg">{titulo(c)}</span>
        <span className="block text-xs text-fg-secondary">
          {[t('entregada', { hora: formatTimeInTz(c.updated_at, timezone) }), preparada != null ? t('preparadaEn', { n: preparada }) : null]
            .filter(Boolean)
            .join(' · ')}
        </span>
      </span>
    </>
  );
  return onVer ? (
    <button
      type="button"
      onClick={() => onVer(c)}
      className="flex w-full items-start gap-2.5 rounded-xl border border-line bg-surface px-3.5 py-3 text-left hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
    >
      {contenido}
    </button>
  ) : (
    <div className="flex items-start gap-2.5 rounded-xl border border-line bg-surface px-3.5 py-3">{contenido}</div>
  );
}
