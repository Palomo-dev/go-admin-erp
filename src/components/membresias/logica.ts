/**
 * Lógica pura de las pantallas de Membresías (sin React ni red): lectura de la URL,
 * tono de los badges, días calendario y el cálculo que muestra el diálogo «Congelar».
 *
 * Los días son calendario de la ORGANIZACIÓN (`YYYY-MM-DD`); los instantes llegan de la base
 * como ISO (timestamptz) y se convierten con la zona que trae cada respuesta (`zona`).
 * La regla de congelar es espejo de `fn_membresia_congelar` (migración 20260929001000):
 * días = hasta − desde + 1, el vencimiento se corre esos días; la base valida igual.
 */
import type { TonoBadge } from '@/components/kit/estadoTono';
import type {
  CongelamientoMembresia,
  EstadoMembresia,
  EstadoVisual,
  FiltroEstado,
  ReglasPlan,
} from '@/lib/services/membresias/tipos';
import { addPlainDays, toPlainDate } from '@/lib/utils/dateCore';

// ─── Badges (SISTEMA-BADGES §4) ─────────────────────────────────────────────

export const TONO_ESTADO_MEMBRESIA: Readonly<Record<EstadoVisual, TonoBadge>> = {
  pendiente_pago: 'advertencia',
  por_activar: 'informacion',
  activa: 'exito',
  congelada: 'informacion',
  en_gracia: 'advertencia',
  vencida: 'peligro',
  cancelada: 'neutro',
};

export function tonoEstadoMembresia(estado: EstadoVisual | string | null | undefined): TonoBadge {
  return (estado && TONO_ESTADO_MEMBRESIA[estado as EstadoVisual]) || 'neutro';
}

// ─── Filtros de la URL (lista blanca: lo que se lee termina en el servidor) ─

export const FILTROS_ESTADO: readonly FiltroEstado[] = [
  'todas',
  'activa',
  'por_vencer',
  'en_gracia',
  'congelada',
  'pendiente',
  'vencida',
  'cancelada',
  'renovacion_pendiente',
];

export function leerFiltroEstado(valor: string | null | undefined): FiltroEstado {
  return valor && (FILTROS_ESTADO as readonly string[]).includes(valor) ? (valor as FiltroEstado) : 'todas';
}

export function leerPlan(valor: string | null | undefined): number | null {
  if (!valor || !/^\d{1,9}$/.test(valor)) return null;
  const n = Number(valor);
  return n > 0 ? n : null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function leerCliente(valor: string | null | undefined): string | null {
  return valor && UUID_RE.test(valor) ? valor.toLowerCase() : null;
}

export type FiltroMiembros = 'todos' | 'con_vigente' | 'sin_vigente';

export function leerFiltroMiembros(valor: string | null | undefined): FiltroMiembros {
  return valor === 'con_vigente' || valor === 'sin_vigente' ? valor : 'todos';
}

const DIA_RE = /^\d{4}-\d{2}-\d{2}$/;

export function esDiaPlano(valor: string | null | undefined): valor is string {
  if (!valor || !DIA_RE.test(valor)) return false;
  const [y, m, d] = valor.split('-').map(Number);
  const f = new Date(Date.UTC(y, m - 1, d));
  return f.getUTCFullYear() === y && f.getUTCMonth() === m - 1 && f.getUTCDate() === d;
}

/** Rango de la URL de Pagos: si falta o es inválido, el mes en curso (del 1 a hoy). */
export function leerRangoPagos(
  desde: string | null | undefined,
  hasta: string | null | undefined,
  hoy: string,
): { desde: string; hasta: string } {
  const inicioMes = `${hoy.slice(0, 8)}01`;
  let d = esDiaPlano(desde) ? desde : inicioMes;
  let h = esDiaPlano(hasta) ? hasta : hoy;
  if (d > h) [d, h] = [h, d];
  return { desde: d, hasta: h };
}

// ─── Días calendario ────────────────────────────────────────────────────────

function utcDe(plain: string): number {
  const [y, m, d] = plain.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

/** Días calendario de `a` a `b` (b − a); negativo si `b` es anterior. */
export function diasEntre(a: string, b: string): number {
  return Math.round((utcDe(b) - utcDe(a)) / 86_400_000);
}

/**
 * Día calendario puro con el idioma dado. Se formatea al mediodía UTC con `timeZone: 'UTC'`:
 * un `date` de la base ya es un día, no un instante (igual en TZ=UTC que en TZ=America/Bogota).
 */
export function formatearDiaPlano(
  plain: string | null | undefined,
  locale: string,
  opciones: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' },
): string {
  if (!esDiaPlano(plain)) return '';
  const [y, m, d] = plain.split('-').map(Number);
  return new Intl.DateTimeFormat(locale, { ...opciones, timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d, 12)));
}

/** Nombres cortos de los días del horario (1 = lunes … 7 = domingo) en el idioma dado. */
export function diasSemana(dias: readonly number[] | undefined, locale: string): string[] {
  if (!dias || dias.length === 0) return [];
  const fmt = new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' });
  // 2024-01-01 fue lunes.
  return Array.from(new Set(dias))
    .filter((d) => Number.isInteger(d) && d >= 1 && d <= 7)
    .sort((a, b) => a - b)
    .map((d) => fmt.format(new Date(Date.UTC(2024, 0, d, 12))));
}

// ─── Vigencia (barra «Día 28 de 38») ────────────────────────────────────────

export interface ProgresoVigencia {
  dia: number;
  total: number;
  porcentaje: number;
}

export function progresoVigencia(
  desde: string | null,
  hasta: string,
  ahora: Date,
  zona: string,
): ProgresoVigencia | null {
  if (!desde) return null;
  const inicio = toPlainDate(new Date(desde), zona);
  const fin = toPlainDate(new Date(hasta), zona);
  const hoy = toPlainDate(ahora, zona);
  const total = diasEntre(inicio, fin) + 1;
  if (!Number.isFinite(total) || total < 1) return null;
  const dia = Math.min(Math.max(diasEntre(inicio, hoy) + 1, 0), total);
  return { dia, total, porcentaje: Math.round((dia / total) * 100) };
}

// ─── Congelar (C3) ──────────────────────────────────────────────────────────

export function congelamientoVigente(
  congelamientos: readonly CongelamientoMembresia[],
): CongelamientoMembresia | null {
  return congelamientos.find((c) => c.estado === 'active' || c.estado === 'scheduled') ?? null;
}

export function estadoCongelable(estado: EstadoMembresia): boolean {
  return estado === 'active' || estado === 'past_due';
}

export type BloqueoCongelar =
  | 'fechas_invalidas'
  | 'congelamiento_en_el_pasado'
  | 'congelamiento_despues_del_vencimiento'
  | 'congelamiento_tope_veces'
  | 'congelamiento_tope_dias';

export interface EntradaCongelar {
  /** Primer día congelado (YYYY-MM-DD de la organización). */
  desde: string;
  /** Días que se piden (incluye el primero). */
  dias: number | null;
  /** Hoy en la zona de la organización. */
  hoy: string;
  /** Vencimiento actual (instante ISO). */
  vence: string;
  zona: string;
  reglas: Pick<ReglasPlan, 'freezeMaxTimes' | 'freezeMaxDays'>;
  usado: { dias: number; veces: number };
}

export interface ResultadoCongelar {
  /** Último día congelado. */
  hasta: string | null;
  /** Día en que vuelve a entrar. */
  vuelve: string | null;
  /** Día del vencimiento actual y del nuevo (vencimiento + días). */
  venceActual: string;
  nuevoVence: string | null;
  /** Lo que queda del plan DESPUÉS de este congelamiento (null = sin tope). */
  quedanVeces: number | null;
  quedanDias: number | null;
  /** Días que quedan ANTES de este congelamiento (para el mensaje de tope). */
  disponiblesDias: number | null;
  bloqueo: BloqueoCongelar | null;
}

export function calcularCongelamiento(e: EntradaCongelar): ResultadoCongelar {
  const venceActual = toPlainDate(new Date(e.vence), e.zona);
  const dias = e.dias !== null && Number.isFinite(e.dias) ? Math.floor(e.dias) : 0;
  const disponiblesVeces = e.reglas.freezeMaxTimes === null ? null : Math.max(e.reglas.freezeMaxTimes - e.usado.veces, 0);
  const disponiblesDias = e.reglas.freezeMaxDays === null ? null : Math.max(e.reglas.freezeMaxDays - e.usado.dias, 0);

  const valido = esDiaPlano(e.desde) && dias >= 1;
  const hasta = valido ? addPlainDays(e.desde, dias - 1) : null;
  const vuelve = hasta ? addPlainDays(hasta, 1) : null;
  const nuevoVence = valido ? addPlainDays(venceActual, dias) : null;

  let bloqueo: BloqueoCongelar | null = null;
  if (!valido) bloqueo = 'fechas_invalidas';
  else if (e.desde < e.hoy) bloqueo = 'congelamiento_en_el_pasado';
  else if (e.desde > venceActual) bloqueo = 'congelamiento_despues_del_vencimiento';
  else if (disponiblesVeces !== null && disponiblesVeces <= 0) bloqueo = 'congelamiento_tope_veces';
  else if (disponiblesDias !== null && dias > disponiblesDias) bloqueo = 'congelamiento_tope_dias';

  return {
    hasta,
    vuelve,
    venceActual,
    nuevoVence,
    quedanVeces: disponiblesVeces === null ? null : Math.max(disponiblesVeces - 1, 0),
    quedanDias: disponiblesDias === null ? null : Math.max(disponiblesDias - Math.max(dias, 0), 0),
    disponiblesDias,
    bloqueo,
  };
}

// ─── Historial y entradas ───────────────────────────────────────────────────

export const TIPOS_EVENTO = [
  'created',
  'activated',
  'renewed',
  'reactivated',
  'frozen',
  'unfrozen',
  'cancelled',
  'expired',
  'trimmed',
  'grace_started',
  'access_granted',
  'access_denied',
  'payment_received',
  'payment_failed',
  'plan_changed',
  'notes_updated',
  'renewal_due',
] as const;

export type TipoEvento = (typeof TIPOS_EVENTO)[number] | 'otro';

export function tipoEvento(tipo: string): TipoEvento {
  return (TIPOS_EVENTO as readonly string[]).includes(tipo) ? (tipo as TipoEvento) : 'otro';
}

export const MOTIVOS_RECHAZO = [
  'sin_membresia',
  'pendiente_de_pago',
  'congelada',
  'vencida',
  'sede_no_permitida',
  'fuera_de_horario',
  'limite_diario',
] as const;

export type MotivoRechazo = (typeof MOTIVOS_RECHAZO)[number] | 'otro';

export function motivoRechazo(motivo: string | null | undefined): MotivoRechazo {
  return motivo && (MOTIVOS_RECHAZO as readonly string[]).includes(motivo) ? (motivo as MotivoRechazo) : 'otro';
}

export const METODOS_ENTRADA = ['qr', 'manual', 'rfid', 'fingerprint', 'facial'] as const;
export type MetodoEntrada = (typeof METODOS_ENTRADA)[number] | 'otro';

export function metodoEntrada(metodo: string | null | undefined): MetodoEntrada {
  return metodo && (METODOS_ENTRADA as readonly string[]).includes(metodo) ? (metodo as MetodoEntrada) : 'otro';
}

// ─── Enlaces ────────────────────────────────────────────────────────────────

export const RUTA_MEMBRESIAS = '/app/membresias';

export function rutaDetalle(id: number): string {
  return `${RUTA_MEMBRESIAS}/membresias/${id}`;
}

export function rutaListadoCliente(clienteId: string): string {
  return `${RUTA_MEMBRESIAS}/membresias?cliente=${encodeURIComponent(clienteId)}`;
}

/** POS con el cliente y el producto (la lectura de estos parámetros es del POS). */
export function rutaCobrarEnPos(clienteId: string | null, productId: number | null): string {
  const q = new URLSearchParams();
  if (clienteId) q.set('cliente', clienteId);
  if (productId) q.set('producto', String(productId));
  const s = q.toString();
  return s ? `/app/pos?${s}` : '/app/pos';
}

/** Nueva factura de venta (el formulario v2 ya acepta `?cliente=`). */
export function rutaNuevaFactura(clienteId: string | null): string {
  return clienteId
    ? `/app/finanzas/facturas-venta/nuevo?cliente=${encodeURIComponent(clienteId)}`
    : '/app/finanzas/facturas-venta/nuevo';
}
