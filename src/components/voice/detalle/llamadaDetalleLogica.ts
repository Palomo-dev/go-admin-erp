/**
 * Lógica pura del detalle de una llamada (Figma 1363:20 listo, 1365:800947
 * transcribiendo, 1365:801445 sin grabación, 1368:17 móvil). Sin React ni red:
 * se prueba con jest.
 */

import type { CallDirection, CallMode, RecordingStatus } from '@/lib/services/crm/callManagementService';

/** Grabación tal como la devuelve `GET /api/crm/calls/[id]`. */
export interface GrabacionDetalle {
  id: string;
  status: RecordingStatus;
  duration_seconds: number | null;
  retention_until: string | null;
  created_at: string;
}

export interface ActaConsentimiento {
  consent_type: string;
  method: string;
}

/** Llamada tal como la devuelve `GET /api/crm/calls/[id]` (con sus relaciones). */
export interface LlamadaDetalle {
  id: string;
  provider: string;
  direction: CallDirection;
  mode: CallMode;
  status: string;
  from_number: string;
  to_number: string;
  customer_id: string | null;
  opportunity_id: string | null;
  user_id: string | null;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
  duration_seconds: number | null;
  recording_enabled: boolean;
  consent_given: boolean;
  metadata: Record<string, unknown> | null;
  recordings: GrabacionDetalle[];
  consents: ActaConsentimiento[];
  customer: { id: string; full_name: string | null; first_name: string | null; last_name: string | null; phone: string | null } | null;
  opportunity: { id: string; name: string; amount: number | null; currency: string | null; stage_name: string | null } | null;
  user: { id: string; first_name: string | null; last_name: string | null; email: string | null } | null;
  disposition_user: { id: string; first_name: string | null; last_name: string | null; email: string | null } | null;
  customer_calls: { count: number; last_started_at: string | null } | null;
}

/** Minutos que se espera el audio del proveedor tras colgar (anotación 1365:801444: 1–2 min). */
export const ESPERA_GRABACION_MS = 10 * 60 * 1000;

export type EstadoGrabacion =
  | { tipo: 'lista'; grabacion: GrabacionDetalle; conservaHasta: string | null }
  | { tipo: 'procesando' }
  | { tipo: 'sin'; motivo: 'apagada' | 'consentimiento' | 'vencida' | 'fallida'; eliminadaEl: string | null };

/**
 * Qué muestra la tarjeta «Grabación» (anotación 1365:801929): la grabación
 * lista; «procesando» mientras el proveedor la entrega; o «sin grabación» por
 * grabación apagada, consentimiento negado, retención vencida o fallo.
 * `hoy` es el día de la ORGANIZACIÓN (`YYYY-MM-DD`); `ahoraMs`, el instante actual.
 */
export function estadoGrabacion(llamada: Pick<LlamadaDetalle, 'recording_enabled' | 'consent_given' | 'consents' | 'recordings' | 'ended_at' | 'status'>, hoy: string, ahoraMs: number): EstadoGrabacion {
  const grabaciones = llamada.recordings ?? [];
  const lista = grabaciones.find((g) => g.status === 'ready');
  if (lista) {
    const vencida = !!lista.retention_until && lista.retention_until < hoy;
    if (!vencida) return { tipo: 'lista', grabacion: lista, conservaHasta: lista.retention_until };
    return { tipo: 'sin', motivo: 'vencida', eliminadaEl: lista.retention_until };
  }
  const borrada = grabaciones.find((g) => g.status === 'deleted');
  if (borrada) return { tipo: 'sin', motivo: 'vencida', eliminadaEl: borrada.retention_until };
  if (grabaciones.some((g) => g.status === 'processing')) return { tipo: 'procesando' };

  const actaNegada = (llamada.consents ?? []).some((c) => c.consent_type === 'recording' && /declin|rechaz|denied|refus/i.test(c.method));
  if (!llamada.recording_enabled) return { tipo: 'sin', motivo: actaNegada || llamada.consent_given === false ? 'consentimiento' : 'apagada', eliminadaEl: null };
  if (grabaciones.some((g) => g.status === 'failed')) return { tipo: 'sin', motivo: 'fallida', eliminadaEl: null };

  // Sin fila todavía: si la llamada terminó hace poco, el audio está en camino.
  const finMs = llamada.ended_at ? Date.parse(llamada.ended_at) : NaN;
  const enCurso = !llamada.ended_at && (llamada.status === 'in_progress' || llamada.status === 'ringing' || llamada.status === 'dialing');
  if (enCurso || (Number.isFinite(finMs) && ahoraMs - finMs < ESPERA_GRABACION_MS)) return { tipo: 'procesando' };
  return { tipo: 'sin', motivo: actaNegada || llamada.consent_given === false ? 'consentimiento' : 'apagada', eliminadaEl: null };
}

/** `mm:ss` con ceros (Figma: «01:12», «04:38»). */
export function formatoReloj(ms: number | null | undefined): string {
  const s = Math.max(0, Math.floor((ms ?? 0) / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

/** Duración corta de la cabecera (Figma «4:12»). */
export function formatoDuracionCorta(segundos: number | null | undefined): string {
  const s = Math.max(0, Math.round(segundos ?? 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * Alturas (0,2–1) de las barras de la onda del reproductor. No es el espectro
 * real del audio (no se descarga el archivo para dibujarla): es una forma
 * estable por llamada, la misma en cada visita, que sirve de barra de progreso.
 */
export function barrasOnda(semilla: string, n: number): number[] {
  let h = 2166136261;
  for (let i = 0; i < semilla.length; i++) {
    h ^= semilla.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const barras: number[] = [];
  for (let i = 0; i < n; i++) {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    const r = ((h >>> 0) % 1000) / 1000;
    // Envolvente suave para que no parezca ruido plano.
    const envolvente = 0.55 + 0.45 * Math.sin((i / Math.max(1, n - 1)) * Math.PI * 3);
    barras.push(Math.round((0.2 + 0.8 * r * envolvente) * 100) / 100);
  }
  return barras;
}

export const VELOCIDADES = [1, 1.5, 2] as const;
export type Velocidad = (typeof VELOCIDADES)[number];

export function velocidadSiguiente(v: number): Velocidad {
  const i = VELOCIDADES.indexOf(v as Velocidad);
  return VELOCIDADES[(i + 1) % VELOCIDADES.length];
}

/** Intensidad del sentimiento en % (`sentiment_score` va de -1 a 1). */
export function porcentajeSentimiento(score: number | null | undefined): number | null {
  if (typeof score !== 'number' || !Number.isFinite(score)) return null;
  return Math.round(Math.min(1, Math.abs(score)) * 100);
}

/** Proporción 0–1 → % entero, o `null`. */
export function porcentaje(ratio: number | null | undefined): number | null {
  if (typeof ratio !== 'number' || !Number.isFinite(ratio)) return null;
  return Math.round(Math.min(1, Math.max(0, ratio)) * 100);
}

interface SegmentoMinimo {
  start_ms: number;
  text: string;
}

const normalizar = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9ñ ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Instante (ms) del segmento donde se dijo la cita de una objeción, o `null`. */
export function instanteDeCita(segmentos: readonly SegmentoMinimo[], cita: string | null | undefined): number | null {
  const q = normalizar(cita ?? '');
  if (q.length < 4) return null;
  const corta = q.slice(0, 40);
  const seg = segmentos.find((s) => normalizar(s.text).includes(corta));
  return seg ? seg.start_ms : null;
}

/** Nombre visible de un perfil, o `null`. */
export function nombrePerfil(p: { first_name: string | null; last_name: string | null; email?: string | null } | null | undefined): string | null {
  if (!p) return null;
  return [p.first_name, p.last_name].filter(Boolean).join(' ').trim() || p.email || null;
}

/** Nombre del cliente, o `null` (número desconocido). */
export function nombreCliente(c: LlamadaDetalle['customer']): string | null {
  if (!c) return null;
  return c.full_name || [c.first_name, c.last_name].filter(Boolean).join(' ').trim() || null;
}

/** El número del otro lado de la llamada. */
export function numeroContraparteDetalle(l: Pick<LlamadaDetalle, 'direction' | 'from_number' | 'to_number'>): string {
  return l.direction === 'inbound' ? l.from_number : l.to_number;
}

/** Nota del vendedor: la de la disposición o, si no, la que dejó en vivo. */
export function notaVendedor(metadata: Record<string, unknown> | null | undefined): { texto: string | null; en: string | null } {
  const m = metadata ?? {};
  const disp = typeof m.disposition_note === 'string' && m.disposition_note.trim() ? m.disposition_note.trim() : null;
  const viva = typeof m.live_note === 'string' && m.live_note.trim() ? m.live_note.trim() : null;
  const en = typeof m.disposition_at === 'string' ? m.disposition_at : null;
  return { texto: disp ?? viva, en: disp ? en : null };
}

/** Índices de las tareas sugeridas que aún no se crearon (`applied_actions` lleva `task:i`). */
export function tareasPendientes(total: number, aplicadas: ReadonlySet<string>): number[] {
  const r: number[] = [];
  for (let i = 0; i < total; i++) if (!aplicadas.has(`task:${i}`)) r.push(i);
  return r;
}
