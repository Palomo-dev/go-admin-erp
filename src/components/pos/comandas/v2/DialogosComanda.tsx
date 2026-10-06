'use client';

import * as React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { ArrowLeftRight, Ban, Check, ChefHat, Info, Loader2, RotateCcw, TriangleAlert, Undo2, X } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { ConfirmDialog, Dialogo, DialogoMotivo, FormField } from '@/components/kit';
import { clasesBoton } from '@/components/kit/botonClases';
import { formatTimeInTz } from '@/lib/utils/dateDisplay';
import type { KitchenTicket, KitchenTicketItem } from '@/lib/services/kitchenService';
import { ESTACIONES_COCINA } from '@/lib/pos/estacionEfectiva';
import {
  columnaDe,
  estacionDelItem,
  itemsDeEstacion,
  minutosTranscurridos,
  objetivoDe,
  type FiltroEstacion,
} from '@/lib/pos/cocina/tableroComandas';
import { cantidadComanda, textoCantidadComanda } from '@/components/pos/comandas/TicketCard';
import type { ProductoModoVenta } from '@/lib/pos/peso/modoVenta';
import type { EventoComanda } from '@/components/pos/cocina/cocinaCliente';
import { EstacionChip, useNombreEstacion } from './estacionUi';
import { useTituloComanda } from './ComandaTarjeta';

const ESTADO_TONO: Record<string, string> = {
  new: 'border-line-info bg-info-subtle text-info-text',
  preparing: 'border-line-warning bg-warning-subtle text-warning-text',
  ready: 'border-line-success bg-success-subtle text-success-text',
  delivered: 'border-line bg-subtle text-fg-secondary',
  cancelled: 'border-line-danger bg-danger-subtle text-danger-text',
};

function Pastilla({ tono, children }: { tono: string; children: React.ReactNode }) {
  return <span className={cn('inline-flex h-[22px] items-center rounded-full border px-2 text-xs font-semibold', tono)}>{children}</span>;
}

// ─── Detalle de comanda (Figma 961:278836) ───────────────────────────────────

export interface LineaTiempo {
  hora: string;
  texto: string;
  pendiente?: boolean;
}

/** Línea de tiempo: eventos guardados y, si aún no hay tabla, las horas de la comanda. */
export function armarLineaTiempo(
  c: KitchenTicket,
  eventos: EventoComanda[],
  t: (k: string, v?: Record<string, string | number>) => string,
  nombreEstacion: (k: string | null) => string,
  timezone: string,
  ronda: number | null,
): LineaTiempo[] {
  const lineas: LineaTiempo[] = [];
  const quien = c.table_sessions?.serverName || c.server_name || null;
  lineas.push({
    hora: formatTimeInTz(c.created_at, timezone),
    texto: quien
      ? ronda ? t('tl.enviadaPorRonda', { quien, n: ronda }) : t('tl.enviadaPor', { quien })
      : t('tl.enviada'),
  });
  if (c.printed_at) lineas.push({ hora: formatTimeInTz(c.printed_at, timezone), texto: t('tl.impresa') });
  if (c.allergy_ack_at) lineas.push({ hora: formatTimeInTz(c.allergy_ack_at, timezone), texto: t('tl.alergiaConfirmada') });
  if (eventos.length > 0) {
    for (const e of eventos) {
      const est = e.station ? nombreEstacion(e.station) : null;
      const actor = e.actor_nombre ? ` · ${e.actor_nombre}` : '';
      const clave = `tl.${e.event}`;
      const motivo = typeof e.detail?.motivo === 'string' ? e.detail.motivo : '';
      lineas.push({
        hora: formatTimeInTz(e.created_at, timezone),
        texto: `${t(clave, { estacion: est ?? t('tl.todas'), motivo, hacia: nombreEstacion(String(e.detail?.hacia ?? '')) })}${actor}`,
      });
    }
  } else {
    if (c.started_at) lineas.push({ hora: formatTimeInTz(c.started_at, timezone), texto: t('tl.empezada', { estacion: t('tl.todas') }) });
    if (c.ready_at) lineas.push({ hora: formatTimeInTz(c.ready_at, timezone), texto: t('tl.lista', { estacion: t('tl.todas') }) });
    if (c.status === 'delivered') lineas.push({ hora: formatTimeInTz(c.updated_at, timezone), texto: t('tl.entregada', { estacion: t('tl.todas') }) });
    if ((c.status as string) === 'cancelled' && c.cancelled_at) {
      lineas.push({ hora: formatTimeInTz(c.cancelled_at, timezone), texto: t('tl.cancelada', { motivo: c.cancellation_reason ?? '' }) });
    }
  }
  // Lo que falta: cada estación que aún no marcó lista.
  if ((c.status as string) !== 'cancelled' && c.status !== 'delivered') {
    const estaciones = Array.from(new Set(itemsDeEstacion(c, 'todas').map(estacionDelItem)));
    for (const e of estaciones) {
      const col = columnaDe(c, e);
      if (col === 'new' || col === 'preparing') {
        lineas.push({ hora: '—', texto: t('tl.pendienteLista', { estacion: nombreEstacion(e) }), pendiente: true });
      }
    }
  }
  return lineas;
}

export function DetalleComandaDialog({
  comanda: c,
  abierto,
  onAbiertoChange,
  eventos,
  timezone,
  ahora,
  ronda,
  estacion,
  permisos,
  ocupada,
  onAccion,
  onItem,
  onReimprimir,
  onCancelar,
}: {
  comanda: KitchenTicket | null;
  abierto: boolean;
  onAbiertoChange: (v: boolean) => void;
  eventos: EventoComanda[];
  timezone: string;
  ahora: Date;
  ronda: number | null;
  estacion: FiltroEstacion;
  permisos: { operar: boolean; gestionar: boolean };
  ocupada?: boolean;
  onAccion: (c: KitchenTicket, accion: 'preparing' | 'ready' | 'delivered', station: string | null) => void;
  onItem: (c: KitchenTicket, item: KitchenTicketItem, hecho: boolean) => void;
  onReimprimir: (c: KitchenTicket) => void;
  onCancelar: (c: KitchenTicket) => void;
}) {
  const t = useTranslations('posComandasV2.detalle');
  const tt = useTranslations('posComandasV2.tarjeta');
  const te = useTranslations('posComandasV2.estados');
  const locale = useLocale();
  const titulo = useTituloComanda();
  const nombreEstacion = useNombreEstacion();
  if (!c) return null;

  const porEstacion = new Map<string, KitchenTicketItem[]>();
  for (const i of c.kitchen_ticket_items ?? []) {
    const k = estacionDelItem(i);
    porEstacion.set(k, [...(porEstacion.get(k) ?? []), i]);
  }
  const lineas = armarLineaTiempo(c, eventos, (k, v) => t(k, v), nombreEstacion, timezone, ronda);
  const quien = c.table_sessions?.serverName || c.server_name || null;
  const zona = c.table_sessions?.restaurant_tables?.zone || null;
  const origen = c.pedido_web ? t('desdeWeb') : c.table_sessions?.restaurant_tables?.name ? t('desdeMesa') : t('desdeCaja');
  const sub = [t('comanda', { id: c.id }), quien, zona, `${t('enviada', { hora: formatTimeInTz(c.created_at, timezone) })} ${origen}`]
    .filter(Boolean)
    .join(' · ');
  const estadoTicket = c.status as string;

  // Acción principal: la de la estación activa o, en «Todas», la primera estación que falte.
  const estacionAccion = estacion !== 'todas'
    ? estacion
    : Array.from(porEstacion.keys()).find((e) => {
        const col = columnaDe(c, e);
        return col === 'new' || col === 'preparing';
      }) ?? null;
  const colAccion = estacionAccion ? columnaDe(c, estacionAccion) : columnaDe(c, 'todas');
  const accion = colAccion === 'new' ? 'preparing' : colAccion === 'preparing' ? 'ready' : colAccion === 'ready' ? 'delivered' : null;
  const etiquetaAccion = accion === 'preparing'
    ? t('empezarEstacion', { estacion: nombreEstacion(estacionAccion) })
    : accion === 'ready'
      ? t('listaEstacion', { estacion: nombreEstacion(estacionAccion) })
      : tt('entregar');

  return (
    <Dialog open={abierto} onOpenChange={onAbiertoChange}>
      <DialogContent
        hideCloseButton
        className="flex max-h-[calc(100dvh-32px)] w-[calc(100%-32px)] max-w-none flex-col gap-0 overflow-hidden rounded-2xl border-line bg-surface p-0 text-fg sm:max-w-[640px]"
      >
        <div className="flex items-start gap-3 px-6 pb-3 pt-5">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <DialogTitle className="text-xl font-semibold leading-7 text-fg">
                {titulo(c)}{ronda && c.table_sessions?.restaurant_tables?.name ? ` · ${t('ronda', { n: ronda })}` : ''}
              </DialogTitle>
              <Pastilla tono={ESTADO_TONO[estadoTicket] ?? ESTADO_TONO.delivered}>{te(estadoTicket)}</Pastilla>
            </div>
            <DialogDescription className="mt-1 text-[13px] text-fg-secondary">{sub}</DialogDescription>
          </div>
          <button
            type="button"
            aria-label={t('cerrar')}
            onClick={() => onAbiertoChange(false)}
            className="flex size-8 shrink-0 items-center justify-center rounded-lg text-fg-secondary hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            <X aria-hidden="true" className="size-5" strokeWidth={1.5} />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 pb-4">
          {c.has_allergy && (
            <div className={cn('flex items-start gap-2 rounded-lg px-3 py-2 text-[13px] font-medium', c.allergy_ack_at ? 'bg-danger-subtle text-danger-text' : 'bg-solid-danger text-on-solid')}>
              <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} />
              {c.allergy_ack_at ? t('alergiaConfirmada', { hora: formatTimeInTz(c.allergy_ack_at, timezone) }) : t('alergiaPendiente')}
            </div>
          )}
          {Array.from(porEstacion.entries()).map(([est, items]) => {
            const col = columnaDe(c, est);
            const vivos = items.filter((i) => i.status !== 'cancelled');
            const evento = (tipos: string[]) =>
              eventos.filter((e) => tipos.includes(e.event) && (e.station === est || e.station === null)).map((e) => e.created_at);
            const empezada = vivos.map((i) => i.started_at).filter(Boolean).sort()[0]
              ?? evento(['empezada'])[0] ?? (col !== 'new' ? c.started_at ?? null : null);
            const lista = vivos.every((i) => i.status === 'ready' || i.status === 'delivered')
              ? vivos.map((i) => i.ready_at).filter(Boolean).sort().pop() ?? evento(['lista', 'item_hecho']).pop() ?? c.ready_at
              : null;
            const objetivo = objetivoDe(c, est);
            const minutos = minutosTranscurridos({ created_at: empezada ?? c.created_at, ready_at: null }, ahora);
            const estadoEst = col === 'ready' || col === 'delivered'
              ? <Pastilla tono={ESTADO_TONO.ready}>{lista ? t('listaHora', { hora: formatTimeInTz(lista, timezone) }) : te('ready')}</Pastilla>
              : col === 'preparing'
                ? <Pastilla tono={ESTADO_TONO.preparing}>{empezada ? t('empezadaHora', { hora: formatTimeInTz(empezada, timezone), n: minutos, objetivo }) : te('preparing')}</Pastilla>
                : col === 'new'
                  ? <Pastilla tono={ESTADO_TONO.new}>{te('new')}</Pastilla>
                  : null;
            return (
              <section key={est} className="rounded-xl border border-line p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <EstacionChip clave={est} />
                  {estadoEst}
                </div>
                <div className="mt-2 space-y-2">
                  {items.map((i) => {
                    const anulado = i.status === 'cancelled' || !!i.cancelled_at;
                    const hecho = !anulado && (i.status === 'ready' || i.status === 'delivered');
                    const puedeTocar = permisos.operar && !anulado && i.status !== 'delivered' && !(c.has_allergy && !c.allergy_ack_at) && (c.status as string) !== 'cancelled';
                    const mods = (i.modifiers ?? []).map((m) => m.name);
                    return (
                      <div key={i.id} className="flex items-start gap-2.5">
                        <button
                          type="button"
                          disabled={!puedeTocar}
                          onClick={() => onItem(c, i, !hecho)}
                          aria-pressed={hecho}
                          aria-label={hecho ? tt('deshacerItem', { producto: i.product_name ?? '' }) : tt('marcarItemHecho', { producto: i.product_name ?? '' })}
                          className="mt-0.5 shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-default"
                        >
                          {anulado ? (
                            <X aria-hidden="true" className="size-5 text-danger" />
                          ) : hecho ? (
                            <span className="flex size-5 items-center justify-center rounded-full bg-success text-white"><Check aria-hidden="true" className="size-3.5" strokeWidth={2.5} /></span>
                          ) : (
                            <span className="block size-5 rounded-full border-2 border-line-strong" />
                          )}
                        </button>
                        <div className="min-w-0 flex-1">
                          <p className={cn('text-sm', anulado ? 'text-danger-text line-through' : hecho ? 'text-fg-muted' : 'text-fg')}>
                            <span className={cn(!hecho && !anulado && 'font-medium')}>
                              {textoCantidadComanda(cantidadComanda(i), i.sale_items?.products as ProductoModoVenta | undefined, locale).replace(/x$/, '×')}
                            </span>{' '}
                            {i.product_name || i.sale_items?.products?.name}
                          </p>
                          {mods.length > 0 && <p className="text-xs text-fg-secondary">{mods.map((m) => `+ ${m}`).join(' · ')}</p>}
                          {i.notes && typeof i.notes === 'string' && (
                            <p className={cn('mt-1 flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs', i.is_allergy ? 'bg-danger-subtle font-semibold text-danger-text' : 'bg-subtle text-fg-secondary')}>
                              {i.is_allergy ? <TriangleAlert aria-hidden="true" className="size-3.5" /> : <ChefHat aria-hidden="true" className="size-3.5" strokeWidth={1.5} />}
                              {i.notes}
                            </p>
                          )}
                          {anulado && i.cancel_reason && <p className="text-xs text-danger-text">{tt('motivo', { motivo: i.cancel_reason })}</p>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}

          <section aria-labelledby="linea-tiempo">
            <h4 id="linea-tiempo" className="text-sm font-semibold text-fg">{t('lineaTiempo')}</h4>
            <ol className="mt-2 space-y-1.5">
              {lineas.map((l, i) => (
                <li key={`${l.hora}-${i}`} className="flex items-center gap-3 text-[13px]">
                  <span aria-hidden="true" className={cn('size-1.5 shrink-0 rounded-full', l.pendiente ? 'bg-line-strong' : 'bg-brand')} />
                  <span className="w-11 shrink-0 tabular-nums text-fg-secondary">{l.hora}</span>
                  <span className={l.pendiente ? 'text-fg-secondary' : 'text-fg'}>{l.texto}</span>
                </li>
              ))}
            </ol>
          </section>
        </div>

        <div className="flex flex-col-reverse gap-2 bg-subtle px-6 py-4 sm:flex-row sm:items-center">
          {permisos.gestionar && (c.status as string) !== 'cancelled' && c.status !== 'delivered' && (
            <button type="button" onClick={() => onCancelar(c)} className={cn(clasesBoton({ variante: 'fantasma', tamano: 'md' }), 'sm:mr-auto')}>
              {t('cancelarComanda')}
            </button>
          )}
          <span className="hidden flex-1 sm:block" />
          <button type="button" onClick={() => onReimprimir(c)} className={clasesBoton({ variante: 'secundario', tamano: 'md' })}>
            {t('reimprimir')}
          </button>
          {accion && permisos.operar && (c.status as string) !== 'cancelled' && (
            <button
              type="button"
              disabled={ocupada || (c.has_allergy && !c.allergy_ack_at)}
              onClick={() => onAccion(c, accion, estacion === 'todas' && accion !== 'delivered' ? estacionAccion : estacion === 'todas' ? null : estacion)}
              className={clasesBoton({ variante: 'primario', tamano: 'md' })}
            >
              {ocupada && <Loader2 aria-hidden="true" className="size-4 animate-spin" />}
              {etiquetaAccion}
            </button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Cancelar comanda (961:279025) ───────────────────────────────────────────

export function CancelarComandaDialog({
  comanda,
  abierto,
  onAbiertoChange,
  ronda,
  cargando,
  onConfirmar,
}: {
  comanda: KitchenTicket | null;
  abierto: boolean;
  onAbiertoChange: (v: boolean) => void;
  ronda: number | null;
  cargando?: boolean;
  onConfirmar: (motivo: string) => void | Promise<void>;
}) {
  const t = useTranslations('posComandasV2.cancelar');
  const titulo = useTituloComanda();
  const nombreEstacion = useNombreEstacion();
  const [motivo, setMotivo] = React.useState('');
  const [tocado, setTocado] = React.useState(false);
  React.useEffect(() => {
    if (abierto) {
      setMotivo('');
      setTocado(false);
    }
  }, [abierto]);
  if (!comanda) return null;
  const estaciones = Array.from(new Set(itemsDeEstacion(comanda, 'todas').map(estacionDelItem))).map(nombreEstacion);
  const nombre = `${titulo(comanda)}${ronda && comanda.table_sessions?.restaurant_tables?.name ? ` · ${t('ronda', { n: ronda })}` : ''}`;
  const limpio = motivo.trim();
  const invalido = limpio.length < 3;
  return (
    <Dialogo
      abierto={abierto}
      onAbiertoChange={onAbiertoChange}
      titulo={t('titulo', { comanda: nombre })}
      descripcion={t('descripcion', { estaciones: estaciones.join(t('y')) || t('cocina') })}
      textoCancelar={t('volver')}
      ancho={520}
      primario={{
        etiqueta: t('confirmar'),
        destructiva: true,
        cargando,
        onClick: () => {
          setTocado(true);
          if (!invalido) void onConfirmar(limpio.slice(0, 500));
        },
      }}
    >
      <FormField etiqueta={t('motivo')} obligatorio error={tocado && invalido ? t('motivoRequerido') : undefined}>
        <input
          value={motivo}
          maxLength={500}
          onChange={(e) => setMotivo(e.target.value)}
          onBlur={() => setTocado(true)}
          placeholder={t('placeholder')}
          className="h-10 w-full rounded-lg border border-line-strong bg-surface px-3 text-sm text-fg placeholder:text-fg-muted focus-visible:border-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/20"
        />
      </FormField>
      <div className="flex items-start gap-2 rounded-lg bg-info-subtle px-3 py-2.5 text-[13px] text-info-text">
        <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} />
        <span>{t('aviso')}</span>
      </div>
    </Dialogo>
  );
}

// ─── Devolver a «Nuevas» (961:279085) ───────────────────────────────────────

export function DevolverComandaDialog({
  comanda,
  abierto,
  onAbiertoChange,
  ronda,
  cargando,
  onConfirmar,
}: {
  comanda: KitchenTicket | null;
  abierto: boolean;
  onAbiertoChange: (v: boolean) => void;
  ronda: number | null;
  cargando?: boolean;
  onConfirmar: () => void | Promise<void>;
}) {
  const t = useTranslations('posComandasV2.devolver');
  const titulo = useTituloComanda();
  if (!comanda) return null;
  const nombre = `${titulo(comanda)}${ronda && comanda.table_sessions?.restaurant_tables?.name ? ` · ${t('ronda', { n: ronda })}` : ''}`;
  return (
    <ConfirmDialog
      abierto={abierto}
      onAbiertoChange={onAbiertoChange}
      titulo={t('titulo')}
      descripcion={t('descripcion', { comanda: nombre })}
      textoConfirmar={t('confirmar')}
      tono="marca"
      icono={Undo2}
      cargando={cargando}
      onConfirmar={onConfirmar}
    />
  );
}

// ─── Confirmar alergia (960:278490) ─────────────────────────────────────────

export function ConfirmarAlergiaDialog({
  comanda,
  abierto,
  onAbiertoChange,
  cargando,
  oscuro,
  timezone,
  onConfirmar,
}: {
  comanda: KitchenTicket | null;
  abierto: boolean;
  onAbiertoChange: (v: boolean) => void;
  cargando?: boolean;
  oscuro?: boolean;
  timezone: string;
  onConfirmar: () => void | Promise<void>;
}) {
  const t = useTranslations('posComandasV2.alergia');
  const tt = useTranslations('posComandasV2.tarjeta');
  const locale = useLocale();
  const titulo = useTituloComanda();
  const [marcado, setMarcado] = React.useState(false);
  React.useEffect(() => {
    if (abierto) setMarcado(false);
  }, [abierto]);
  if (!comanda) return null;
  const conAlergia = (comanda.kitchen_ticket_items ?? []).filter((i) => i.is_allergy);
  const alergenos = conAlergia.map((i) => String(i.notes ?? '')).filter(Boolean);
  const quien = comanda.table_sessions?.serverName || comanda.server_name || null;
  return (
    <Dialog open={abierto} onOpenChange={(v) => !cargando && onAbiertoChange(v)}>
      <DialogContent
        hideCloseButton
        className={cn(
          'w-[calc(100%-32px)] max-w-none gap-0 rounded-2xl border-line bg-surface p-6 text-fg sm:max-w-[520px]',
          oscuro && 'dark',
        )}
      >
        <div className="flex items-center gap-2.5">
          <TriangleAlert aria-hidden="true" className="size-6 shrink-0 text-danger" strokeWidth={1.5} />
          <DialogTitle className="text-xl font-semibold text-fg">{t('titulo', { comanda: titulo(comanda) })}</DialogTitle>
        </div>
        <DialogDescription className="sr-only">{t('ayuda')}</DialogDescription>
        <div className="mt-4 rounded-lg bg-solid-danger px-4 py-3 text-on-solid">
          <p className="text-lg font-bold uppercase">{alergenos.join(' · ') || t('sinDetalle')}</p>
          {quien && <p className="text-[13px]">{t('anotadoPor', { quien, hora: formatTimeInTz(comanda.created_at, timezone) })}</p>}
        </div>
        <div className="mt-4 space-y-1.5">
          {conAlergia.map((i) => (
            <div key={i.id}>
              <p className="text-base font-semibold text-fg">
                {textoCantidadComanda(cantidadComanda(i), i.sale_items?.products as ProductoModoVenta | undefined, locale).replace(/x$/, '×')}{' '}
                {i.product_name || i.sale_items?.products?.name}
              </p>
              {i.notes && (
                <p className="mt-1 flex items-center gap-1.5 rounded-md bg-solid-danger/80 px-2 py-0.5 text-xs font-semibold text-on-solid">
                  <TriangleAlert aria-hidden="true" className="size-3.5" />
                  {tt('alergiaNota', { nota: String(i.notes) })}
                </p>
              )}
            </div>
          ))}
        </div>
        <label className="mt-4 flex items-center gap-2.5 text-sm text-fg">
          <Checkbox checked={marcado} onCheckedChange={(v) => setMarcado(v === true)} />
          {t('casilla')}
        </label>
        <p className="mt-3 text-[13px] text-fg-secondary">{t('ayuda')}</p>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <button type="button" disabled={cargando} onClick={() => onAbiertoChange(false)} className={cn(clasesBoton({ variante: 'secundario', tamano: 'lg' }), 'h-12')}>
            {t('volver')}
          </button>
          <button
            type="button"
            disabled={!marcado || cargando}
            onClick={() => void onConfirmar()}
            className={cn(clasesBoton({ variante: 'destructivo', tamano: 'lg' }), 'h-12')}
          >
            {cargando && <Loader2 aria-hidden="true" className="size-4 animate-spin" />}
            {t('confirmar')}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Enviar ítem a otra estación ────────────────────────────────────────────

export function MoverItemDialog({
  comanda,
  abierto,
  onAbiertoChange,
  cargando,
  onConfirmar,
}: {
  comanda: KitchenTicket | null;
  abierto: boolean;
  onAbiertoChange: (v: boolean) => void;
  cargando?: boolean;
  onConfirmar: (itemId: number, estacion: string) => void | Promise<void>;
}) {
  const t = useTranslations('posComandasV2.mover');
  const nombreEstacion = useNombreEstacion();
  const items = comanda ? itemsDeEstacion(comanda, 'todas').filter((i) => i.status !== 'delivered') : [];
  const [itemId, setItemId] = React.useState<number | null>(null);
  const [destino, setDestino] = React.useState<string>('');
  React.useEffect(() => {
    if (abierto) {
      setItemId(items[0]?.id ?? null);
      setDestino('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto, comanda?.id]);
  const actual = items.find((i) => i.id === itemId);
  const opciones = (ESTACIONES_COCINA as readonly string[]).filter((e) => e !== (actual ? estacionDelItem(actual) : ''));
  return (
    <Dialogo
      abierto={abierto}
      onAbiertoChange={onAbiertoChange}
      titulo={t('titulo')}
      descripcion={t('descripcion')}
      icono={ArrowLeftRight}
      primario={{
        etiqueta: t('confirmar'),
        cargando,
        deshabilitada: !itemId || !destino,
        onClick: () => itemId && destino && void onConfirmar(itemId, destino),
      }}
    >
      <fieldset className="space-y-2">
        <legend className="text-[13px] font-medium text-fg">{t('item')}</legend>
        {items.map((i) => (
          <label key={i.id} className="flex items-center gap-2.5 rounded-lg border border-line px-3 py-2 text-sm">
            <input type="radio" name="item" checked={itemId === i.id} onChange={() => setItemId(i.id)} className="accent-[rgb(var(--brand-action))]" />
            <span className="flex-1">{cantidadComanda(i)}× {i.product_name || i.sale_items?.products?.name}</span>
            <EstacionChip clave={estacionDelItem(i)} />
          </label>
        ))}
      </fieldset>
      <fieldset className="space-y-2">
        <legend className="text-[13px] font-medium text-fg">{t('destino')}</legend>
        <div className="flex flex-wrap gap-2">
          {opciones.map((e) => (
            <button
              key={e}
              type="button"
              aria-pressed={destino === e}
              onClick={() => setDestino(e)}
              className={cn(
                'h-8 rounded-full border px-3 text-[13px] font-medium',
                destino === e ? 'border-line-brand bg-brand-tint text-brand-deep' : 'border-line-strong bg-surface text-fg-secondary hover:bg-hover',
              )}
            >
              {nombreEstacion(e)}
            </button>
          ))}
        </div>
      </fieldset>
    </Dialogo>
  );
}

// ─── Revisar y cerrar las de días anteriores ────────────────────────────────

export function CerrarAnterioresDialog({
  abierto,
  onAbiertoChange,
  cantidad,
  cargando,
  onConfirmar,
}: {
  abierto: boolean;
  onAbiertoChange: (v: boolean) => void;
  cantidad: number;
  cargando?: boolean;
  onConfirmar: (motivo: string) => void | Promise<void>;
}) {
  const t = useTranslations('posComandasV2.anteriores');
  return (
    <DialogoMotivo
      abierto={abierto}
      onAbiertoChange={onAbiertoChange}
      titulo={t('titulo', { n: cantidad })}
      descripcion={t('descripcion')}
      textoConfirmar={t('confirmar', { n: cantidad })}
      motivosRapidos={[t('motivoRapido')]}
      etiquetaMotivo={t('motivo')}
      destructiva={false}
      minimo={3}
      cargando={cargando}
      icono={RotateCcw}
      onConfirmar={onConfirmar}
    />
  );
}
