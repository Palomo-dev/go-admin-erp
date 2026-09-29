/**
 * Renovación automática de membresías — lógica pura (docs/design/MEMBRESIAS-FASE-1-2.md §12).
 *
 * «Automática» NO cobra ni factura: la tarea horaria (`fn_membresias_generar_renovaciones`, llamada
 * por `fn_membresias_vencer_todas` desde pg_cron) deja una RENOVACIÓN PENDIENTE (evento
 * `renewal_due`) 7 días antes del vencimiento; cobrarla es vender el producto del plan (POS, factura
 * o enlace de pago) y la extensión la hace la base dentro de la venta o del pago.
 *
 * Este módulo es el espejo de esa regla para la interfaz y las pruebas: la base es la fuente de
 * verdad y la prueba `renovacionAutomatica.test.ts` exige que la ventana (7 días) coincida con la
 * migración.
 */

/** Días antes del vencimiento en que se genera la renovación pendiente (igual que «Vencen en 7 días»). */
export const DIAS_AVISO_RENOVACION = 7;

export const EVENTO_RENOVACION_PENDIENTE = 'renewal_due';

const DIA_MS = 86_400_000;

export interface MembresiaParaRenovar {
  id: number;
  status: string;
  end_date: string;
  grace_until?: string | null;
  cancel_reason?: string | null;
  /** `membership_plans.renewal_mode` del plan vigente. */
  renewal_mode: string | null;
  /** Producto del plan: sin producto no hay nada que vender. */
  product_id: number | null;
}

export interface EventoRenovacion {
  membership_id: number;
  event_type: typeof EVENTO_RENOVACION_PENDIENTE;
  metadata: { periodo_hasta: string; periodo_hasta_epoch: string; dias_aviso: number; precio?: number | null };
}

function ms(valor: string | null | undefined): number {
  if (!valor) return Number.NaN;
  return Date.parse(valor);
}

/**
 * Clave del periodo: el vencimiento en segundos enteros (como
 * `floor(extract(epoch from end_date))::bigint::text` de la base). Al renovarse, `end_date` cambia y
 * la clave también: la pendiente del periodo anterior deja de aplicar.
 */
export function claveRenovacion(endDate: string): string {
  const t = ms(endDate);
  return Number.isFinite(t) ? String(Math.floor(t / 1000)) : '';
}

/** Misma condición que el `where` de `fn_membresias_generar_renovaciones`. */
export function debeGenerarRenovacion(m: MembresiaParaRenovar, ahora: Date): boolean {
  if (m.renewal_mode !== 'automatic' || !m.product_id) return false;
  if (m.cancel_reason === 'renovacion_aplicada') return false;
  const fin = ms(m.end_date);
  if (!Number.isFinite(fin)) return false;
  const t = ahora.getTime();
  if (fin > t + DIAS_AVISO_RENOVACION * DIA_MS) return false;
  if (m.status === 'active') return true;
  if (m.status === 'past_due') {
    const gracia = ms(m.grace_until ?? m.end_date);
    return Number.isFinite(gracia) && gracia >= t;
  }
  return false;
}

/**
 * Una pasada de la tarea, simulada: devuelve los eventos que se insertarían y la lista resultante.
 * Idempotente como la base (índice único por membresía + periodo): una segunda pasada con los
 * eventos ya generados no devuelve nada nuevo.
 */
export function simularGeneracion(
  membresias: readonly MembresiaParaRenovar[],
  existentes: readonly EventoRenovacion[],
  ahora: Date,
  precio: (m: MembresiaParaRenovar) => number | null = () => null,
): { nuevos: EventoRenovacion[]; eventos: EventoRenovacion[] } {
  const ya = new Set(existentes.map((e) => `${e.membership_id}:${e.metadata.periodo_hasta_epoch}`));
  const nuevos: EventoRenovacion[] = [];
  for (const m of membresias) {
    if (!debeGenerarRenovacion(m, ahora)) continue;
    const clave = claveRenovacion(m.end_date);
    const k = `${m.id}:${clave}`;
    if (ya.has(k)) continue;
    ya.add(k);
    nuevos.push({
      membership_id: m.id,
      event_type: EVENTO_RENOVACION_PENDIENTE,
      metadata: { periodo_hasta: m.end_date, periodo_hasta_epoch: clave, dias_aviso: DIAS_AVISO_RENOVACION, precio: precio(m) },
    });
  }
  return { nuevos, eventos: [...existentes, ...nuevos] };
}

export interface RenovacionPendiente {
  /** Cuándo la generó la tarea (ISO). */
  generada: string;
  /** Vencimiento del periodo que hay que renovar (ISO). */
  periodoHasta: string;
  /** Precio vigente del producto cuando se generó (el cobro usa el precio vigente al vender). */
  precio: number | null;
}

/** Estados en los que una pendiente sigue sirviendo: cobrarla renueva o reactiva la misma membresía. */
const ESTADOS_CON_PENDIENTE = new Set(['active', 'past_due', 'expired']);

/**
 * La renovación pendiente vigente de una membresía: el evento `renewal_due` del periodo ACTUAL
 * (misma clave que su `end_date`). Si ya se renovó, el vencimiento cambió y no hay pendiente.
 */
export function renovacionPendiente(
  m: { estado: string; hasta: string },
  eventos: ReadonlyArray<{ tipo: string; fecha: string; metadata: Record<string, unknown> }>,
): RenovacionPendiente | null {
  if (!ESTADOS_CON_PENDIENTE.has(m.estado)) return null;
  const clave = claveRenovacion(m.hasta);
  if (!clave) return null;
  const e = eventos.find((x) => x.tipo === EVENTO_RENOVACION_PENDIENTE && String(x.metadata?.periodo_hasta_epoch ?? '') === clave);
  if (!e) return null;
  const precio = Number(e.metadata?.precio);
  return {
    generada: e.fecha,
    periodoHasta: typeof e.metadata?.periodo_hasta === 'string' ? (e.metadata.periodo_hasta as string) : m.hasta,
    precio: e.metadata?.precio === null || e.metadata?.precio === undefined || !Number.isFinite(precio) ? null : precio,
  };
}
