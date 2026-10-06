/**
 * Lógica pura del listado de Llamadas (Figma 1351:18, 1358:17/1082/1687).
 * Sin React: la usan `CallsTable` y `CallsFilters`, y se prueba sola.
 *
 * - Los días se mandan como `YYYY-MM-DD`: el SERVIDOR los convierte con la
 *   zona de la organización (`normalizarFechasLlamadas`).
 * - `q` busca en número, cliente y transcripción (lo resuelve la RPC).
 */
import type { CallListRow } from '@/lib/services/crm/callManagementService';
import type { DispositionOutcome } from '@/lib/services/crm/callDispositionService';

export interface CallsTableFilters {
  direction: string;
  mode: string;
  outcome: string;
  mine: boolean;
  hasRecording: boolean;
  q: string;
  fromDate: string;
  toDate: string;
}

export const EMPTY_FILTERS: CallsTableFilters = {
  direction: '',
  mode: '',
  outcome: '',
  mine: false,
  hasRecording: false,
  q: '',
  fromDate: '',
  toDate: '',
};

export function parametrosLlamadas(filters: CallsTableFilters, page: number, limit: number): URLSearchParams {
  const params = new URLSearchParams({ limit: String(limit), offset: String(Math.max(0, page - 1) * limit) });
  const valores: Record<string, string> = {
    direction: filters.direction,
    mode: filters.mode,
    outcome: filters.outcome,
    user_id: filters.mine ? 'me' : '',
    has_recording: filters.hasRecording ? 'true' : '',
    q: filters.q.trim(),
    from_date: filters.fromDate,
    to_date: filters.toDate,
  };
  for (const [k, v] of Object.entries(valores)) if (v) params.set(k, v);
  return params;
}

/** Filtros del panel (sin búsqueda ni rango): cuentan para el botón y salen como chips. */
export const CLAVES_PANEL = ['direction', 'outcome', 'mode', 'mine', 'hasRecording'] as const;
export type ClavePanel = (typeof CLAVES_PANEL)[number];

export function filtrosActivosPanel(f: CallsTableFilters): ClavePanel[] {
  return CLAVES_PANEL.filter((k) => !!f[k]);
}

/** ¿El usuario filtró algo distinto del rango por defecto? (decide «vacío» vs «sin resultados»). */
export function hayFiltrosLlamadas(f: CallsTableFilters, rangoPorDefecto: { fromDate: string; toDate: string }): boolean {
  if (f.q.trim() || filtrosActivosPanel(f).length > 0) return true;
  return f.fromDate !== rangoPorDefecto.fromDate || f.toDate !== rangoPorDefecto.toDate;
}

export function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) return '—';
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Duración media de la cifra «Duración media» (m:ss); 0 → «0:00». */
export const formatDurationMedia = (seconds: number): string => formatDuration(seconds || 0);

/** Porcentaje entero (0 si no hay base). */
export function porcentaje(parte: number, total: number): number {
  return total > 0 ? Math.round((100 * parte) / total) : 0;
}

/** Minutos de voz usados a partir de segundos (siempre hacia arriba: un minuto empezado se cobra). */
export const minutosDeVoz = (segundos: number): number => Math.ceil(Math.max(0, segundos) / 60);

/** Celda a prueba de inyección de fórmulas al abrir el CSV en una hoja de cálculo. */
export function celdaCsv(value: unknown): string {
  let text = String(value ?? '');
  if (/^[\s]*[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function csvLlamadas(rows: readonly CallListRow[], encabezados: readonly string[], fecha: (valor: string) => string): string {
  const filas = rows.map((c) => [
    fecha(c.started_at ?? c.created_at),
    c.customer?.full_name ?? '',
    numeroContraparte(c),
    c.direction,
    c.mode,
    [c.user?.first_name, c.user?.last_name].filter(Boolean).join(' ') || c.user?.email || '',
    c.duration_seconds ?? '',
    c.disposition_outcome ?? '',
    c.status,
    c.sentiment ?? '',
  ]);
  return '﻿' + [encabezados, ...filas].map((f) => f.map(celdaCsv).join(',')).join('\r\n');
}

export function numeroContraparte(c: Pick<CallListRow, 'direction' | 'from_number' | 'to_number'>): string {
  return c.direction === 'inbound' ? c.from_number : c.to_number;
}

/** Tono del kit para el resultado de la fila (Figma: verde contactado, rojo sin contestar, ámbar no contestó/buzón). */
export type TonoResultado = 'exito' | 'peligro' | 'advertencia' | 'informacion' | 'neutro';

export interface ResultadoFila {
  /** Clave de `crm.llamadas.resultados.*`. */
  clave: DispositionOutcome | 'missed' | 'failed' | 'canceled' | 'inProgress' | 'completed';
  tono: TonoResultado;
}

const TONO_DISPOSICION: Record<DispositionOutcome, TonoResultado> = {
  answered: 'exito',
  callback_requested: 'informacion',
  no_answer: 'advertencia',
  voicemail: 'neutro',
  busy: 'advertencia',
  wrong_number: 'peligro',
};

/**
 * Resultado que muestra la fila: la disposición que registró la persona (o el
 * agente) manda; si no hay, se deriva del estado técnico de la llamada.
 */
export function resultadoDeLlamada(c: Pick<CallListRow, 'disposition_outcome' | 'status' | 'direction'>): ResultadoFila | null {
  const d = c.disposition_outcome as DispositionOutcome | null;
  if (d && d in TONO_DISPOSICION) return { clave: d, tono: TONO_DISPOSICION[d] };
  switch (c.status) {
    case 'no_answer':
      return c.direction === 'inbound' ? { clave: 'missed', tono: 'peligro' } : { clave: 'no_answer', tono: 'advertencia' };
    case 'busy':
      return { clave: 'busy', tono: 'advertencia' };
    case 'voicemail':
      return { clave: 'voicemail', tono: 'neutro' };
    case 'failed':
      return { clave: 'failed', tono: 'peligro' };
    case 'canceled':
      return c.direction === 'inbound' ? { clave: 'missed', tono: 'peligro' } : { clave: 'canceled', tono: 'neutro' };
    case 'dialing':
    case 'ringing':
    case 'in_progress':
      return { clave: 'inProgress', tono: 'informacion' };
    case 'completed':
      return { clave: 'completed', tono: 'neutro' };
    default:
      return null;
  }
}

/** Clave de `crm.llamadas.tipos.*` («Saliente · web», «Entrante perdida», «Agente IA»…). */
export function tipoDeLlamada(c: Pick<CallListRow, 'direction' | 'mode' | 'status'>): string {
  if (c.mode === 'ai_agent') return 'agenteIa';
  if (c.direction === 'inbound') return c.status === 'no_answer' || c.status === 'canceled' ? 'entrantePerdida' : 'entrante';
  if (c.status === 'voicemail') return 'salienteBuzon';
  if (c.mode === 'bridge') return 'salienteCelular';
  if (c.mode === 'manual') return 'salienteManual';
  return 'salienteWeb';
}

export type EstadoGrabacion = 'lista' | 'procesando' | 'ninguna';

export function estadoGrabacion(c: Pick<CallListRow, 'recordings'>): EstadoGrabacion {
  if (c.recordings.some((r) => r.status === 'ready')) return 'lista';
  if (c.recordings.some((r) => r.status === 'processing')) return 'procesando';
  return 'ninguna';
}
