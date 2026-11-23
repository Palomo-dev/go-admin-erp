/**
 * Transporte › Viajes › Despachos de hoy (Figma «23 Transporte» › 6: 2876:3844, 2877:4386,
 * 2877:4521). Lógica pura: estado de cada salida, indicadores y lectura de lo que devuelven
 * `fn_transporte_cumplimiento` y `transporte_despachar_viaje` (migración 20261123220000).
 *
 * La regla del bloqueo vive en la base (la misma para la pantalla, la RPC y la guarda de
 * `trips`); aquí solo se lee y se presenta.
 */

export const CAUSAS_BLOQUEO = [
  'sin_vehiculo',
  'sin_conductor',
  'sin_credencial',
  'soat',
  'tecnomecanica',
  'poliza',
  'tarjeta_operacion',
  'licencia',
  'examen_medico',
] as const;
export type CausaBloqueo = (typeof CAUSAS_BLOQUEO)[number];
export type GrupoCausa = 'asignacion' | 'vehiculo' | 'conductor';

export interface Bloqueo {
  causa: CausaBloqueo;
  grupo: GrupoCausa;
  /** Fecha (`date`) en que venció el documento; sin hora ni zona. */
  vence: string | null;
  /** ¿Se puede despachar con excepción autorizada? (según Configuración › Transporte). */
  excepcion: boolean;
}

export interface Aviso {
  causa: CausaBloqueo;
  grupo: GrupoCausa;
  vence: string;
  /** Días que le quedan al documento contados desde la fecha del viaje. */
  dias: number;
}

export interface Cumplimiento {
  tripId: string;
  bloqueos: Bloqueo[];
  avisos: Aviso[];
  admiteExcepcion: boolean;
  pidePin: boolean;
}

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const esCausa = (v: unknown): v is CausaBloqueo => (CAUSAS_BLOQUEO as readonly unknown[]).includes(v);
const grupo = (v: unknown): GrupoCausa => (v === 'vehiculo' || v === 'conductor' ? v : 'asignacion');

/** Un elemento del jsonb de `fn_transporte_cumplimiento_interno`. Lo desconocido se descarta. */
export function leerCumplimiento(valor: unknown): Cumplimiento | null {
  const f = obj(valor);
  if (typeof f.trip_id !== 'string') return null;
  const bloqueos = (Array.isArray(f.bloqueos) ? f.bloqueos : [])
    .map(obj)
    .filter((b) => esCausa(b.causa))
    .map<Bloqueo>((b) => ({ causa: b.causa as CausaBloqueo, grupo: grupo(b.grupo), vence: typeof b.vence === 'string' ? b.vence : null, excepcion: b.excepcion === true }));
  const avisos = (Array.isArray(f.avisos) ? f.avisos : [])
    .map(obj)
    .filter((a) => esCausa(a.causa) && typeof a.vence === 'string')
    .map<Aviso>((a) => ({ causa: a.causa as CausaBloqueo, grupo: grupo(a.grupo), vence: a.vence as string, dias: Number(a.dias) || 0 }));
  return { tripId: f.trip_id, bloqueos, avisos, admiteExcepcion: f.admite_excepcion === true, pidePin: f.pide_pin !== false };
}

export function leerCumplimientos(valor: unknown): Map<string, Cumplimiento> {
  const lista = Array.isArray(valor) ? valor : [];
  const out = new Map<string, Cumplimiento>();
  for (const x of lista) {
    const c = leerCumplimiento(x);
    if (c) out.set(c.tripId, c);
  }
  return out;
}

/** Viaje tal como lo lee la pantalla (columnas de `trips` que usa el despacho). */
export interface ViajeDespacho {
  id: string;
  status: string | null;
  dispatched_at?: string | null;
  dispatch_override_by?: string | null;
}

export type EstadoDespacho = 'despachado' | 'excepcion' | 'bloqueado' | 'listo' | 'cancelado';

const SALIDOS = new Set(['in_transit', 'arrived', 'completed']);

/** Estado de la salida en Despachos de hoy (InsigniaCumplimiento 2896:12415). */
export function estadoDespacho(v: ViajeDespacho, c: Cumplimiento | null | undefined): EstadoDespacho {
  if (v.status === 'cancelled') return 'cancelado';
  if (v.dispatched_at || SALIDOS.has(v.status ?? '')) return v.dispatch_override_by ? 'excepcion' : 'despachado';
  return c && c.bloqueos.length > 0 ? 'bloqueado' : 'listo';
}

export const ESTADOS_POR_DESPACHAR: readonly EstadoDespacho[] = ['listo', 'bloqueado'];

export function porDespachar(e: EstadoDespacho): boolean {
  return ESTADOS_POR_DESPACHAR.includes(e);
}

export function yaSalio(e: EstadoDespacho): boolean {
  return e === 'despachado' || e === 'excepcion';
}

export interface KpisDespachos {
  /** Viajes del día sin contar los cancelados. */
  total: number;
  despachados: number;
  porDespachar: number;
  listos: number;
  bloqueados: number;
  /** Documentos que vencen en 30 días o menos entre los viajes por despachar. */
  porVencer: number;
}

export function kpisDespachos(filas: readonly { estado: EstadoDespacho; cumplimiento?: Cumplimiento | null }[]): KpisDespachos {
  const k: KpisDespachos = { total: 0, despachados: 0, porDespachar: 0, listos: 0, bloqueados: 0, porVencer: 0 };
  for (const f of filas) {
    if (f.estado === 'cancelado') continue;
    k.total += 1;
    if (yaSalio(f.estado)) k.despachados += 1;
    if (f.estado === 'listo') k.listos += 1;
    if (f.estado === 'bloqueado') k.bloqueados += 1;
    if (porDespachar(f.estado)) k.porVencer += f.cumplimiento?.avisos.length ?? 0;
  }
  k.porDespachar = k.listos + k.bloqueados;
  return k;
}

/** Orden de la lista: primero lo que falta por salir (bloqueados arriba), luego por hora. */
export function ordenarDespachos<T extends { estado: EstadoDespacho; salida: string }>(filas: readonly T[]): T[] {
  const peso: Record<EstadoDespacho, number> = { bloqueado: 0, listo: 1, excepcion: 2, despachado: 3, cancelado: 4 };
  return [...filas].sort((a, b) => peso[a.estado] - peso[b.estado] || a.salida.localeCompare(b.salida));
}

export type EstadoResultado =
  | 'despachado'
  | 'despachado_con_excepcion'
  | 'bloqueado'
  | 'no_admite_excepcion'
  | 'motivo_invalido'
  | 'pin_rechazado'
  | 'pin_bloqueado'
  | 'sin_permiso_excepcion'
  | 'no_despachable';

export interface ResultadoDespacho {
  estado: EstadoResultado;
  planilla: string | null;
  cumplimiento: Cumplimiento | null;
}

const ESTADOS_RESULTADO: readonly EstadoResultado[] = [
  'despachado',
  'despachado_con_excepcion',
  'bloqueado',
  'no_admite_excepcion',
  'motivo_invalido',
  'pin_rechazado',
  'pin_bloqueado',
  'sin_permiso_excepcion',
  'no_despachable',
];

/** Respuesta de `transporte_despachar_viaje`. Algo inesperado cuenta como «no se pudo». */
export function leerResultadoDespacho(valor: unknown): ResultadoDespacho | null {
  const f = obj(valor);
  if (!(ESTADOS_RESULTADO as readonly unknown[]).includes(f.estado)) return null;
  return {
    estado: f.estado as EstadoResultado,
    planilla: typeof f.planilla === 'string' ? f.planilla : null,
    cumplimiento: f.cumplimiento ? leerCumplimiento(f.cumplimiento) : null,
  };
}

export const MOTIVO_MIN = 10;
export const MOTIVO_MAX = 500;
export const PIN = /^[0-9]{6}$/;

/** ¿Está completo el formulario de excepción? (la base vuelve a validar todo). */
export function excepcionCompleta(motivo: string, pin: string, pidePin: boolean): boolean {
  const m = motivo.trim();
  return m.length >= MOTIVO_MIN && m.length <= MOTIVO_MAX && (!pidePin || PIN.test(pin));
}

/** Documento del pasajero en la planilla: solo los 4 últimos (Figma 2877:4521). */
export function enmascararDocumento(doc: string | null | undefined): string {
  const limpio = (doc ?? '').replace(/\s+/g, '');
  if (!limpio) return '';
  if (limpio.length <= 4) return '•'.repeat(limpio.length);
  return `${'•'.repeat(Math.min(limpio.length - 4, 6))}${limpio.slice(-4)}`;
}

/** Puestos vendidos y ocupación (0–100) de un viaje. */
export function ocupacion(total: number, disponibles: number): { vendidos: number; porcentaje: number } {
  const t = Math.max(0, Math.trunc(total) || 0);
  const vendidos = Math.min(t, Math.max(0, t - (Math.trunc(disponibles) || 0)));
  return { vendidos, porcentaje: t > 0 ? Math.round((vendidos / t) * 100) : 0 };
}
