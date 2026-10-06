/**
 * Lógica pura del detalle de campaña de voz (Figma CRM 1809:144962).
 * Sin React: decide la etiqueta y el tono de cada llamada, el progreso de la
 * audiencia y el tiempo relativo. No evalúa reglas de negocio: todo sale de
 * lo que devuelve el servidor (`crm_voice_campaign_detail` + `crm_voice_campaign_hoy`).
 */
import type { TonoBadge } from '@/components/kit/estadoTono';
import type { FilaHoy, LlamadaCampanaVoz } from '@/lib/services/crm/voiceCampaignDetailService';

export type ClaveFila =
  | 'enCurso'
  | 'noVolver'
  | 'reunion'
  | 'devolucion'
  | 'buzon'
  | 'ley2300'
  | 'noContesto'
  | 'fallo'
  | 'conversacion'
  | 'completada';

export interface EtiquetaFila {
  /** Clave de `crm.campanaVoz.filas.*`. */
  clave: ClaveFila;
  tono: TonoBadge;
  /** Instante que acompaña la etiqueta («· mié 8 oct 10:00»). */
  cuando: string | null;
  /** Texto libre del resultado (p. ej. «No interesado · precio»), ya recortado. */
  detalle: string | null;
}

const EN_CURSO = new Set(['dialing', 'ringing', 'in_progress']);

/** Resultados técnicos del despachador (no son texto para mostrar). */
const RESULTADOS_TECNICOS = new Set([
  'no-answer',
  'no_answer',
  'answered_by_human',
  'answered_by_unknown',
  'answered_by_machine',
  'buzon',
  'voicemail',
  'failed',
  'completed',
  'busy',
  'canceled',
]);

/** Texto libre que dejó el agente (no un código técnico ni una devolución), recortado. */
export function resultadoLibre(resultado: string | null | undefined, max = 60): string | null {
  const t = (resultado ?? '').trim();
  if (!t || RESULTADOS_TECNICOS.has(t.toLowerCase()) || /^callback\b/i.test(t)) return null;
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

export function etiquetaFila(llamada: Pick<LlamadaCampanaVoz, 'status'>, fila?: FilaHoy | null): EtiquetaFila {
  const base = { cuando: null, detalle: null };
  if (EN_CURSO.has(llamada.status)) return { ...base, clave: 'enCurso', tono: 'informacion' };
  if (fila?.no_volver_a_llamar) return { ...base, clave: 'noVolver', tono: 'peligro' };
  if (fila?.reunion_at) return { ...base, clave: 'reunion', tono: 'exito', cuando: fila.reunion_at };
  if (fila?.devolucion_at) return { ...base, clave: 'devolucion', tono: 'informacion', cuando: fila.devolucion_at };
  const estado = fila?.estado || llamada.status;
  const resultado = (fila?.resultado ?? '').toLowerCase();
  if (estado === 'voicemail' || llamada.status === 'voicemail' || resultado === 'buzon') {
    return { ...base, clave: 'buzon', tono: 'advertencia', cuando: fila?.reintento_at ?? null };
  }
  if (fila?.ley2300) return { ...base, clave: 'ley2300', tono: 'informacion', cuando: fila.reintento_at };
  if (estado === 'no_answer' || llamada.status === 'no_answer' || llamada.status === 'busy') {
    return { ...base, clave: 'noContesto', tono: 'advertencia', cuando: fila?.reintento_at ?? null };
  }
  if (estado === 'failed' || llamada.status === 'failed' || llamada.status === 'canceled') return { ...base, clave: 'fallo', tono: 'peligro' };
  const libre = resultadoLibre(fila?.resultado);
  if (libre) return { ...base, clave: 'conversacion', tono: 'neutro', detalle: libre };
  return { ...base, clave: 'completada', tono: 'neutro' };
}

/** Porcentaje entero de la audiencia contactada (0 sin audiencia). */
export function progresoAudiencia(contactados: number, encolados: number): number {
  return encolados > 0 ? Math.min(100, Math.round((100 * contactados) / encolados)) : 0;
}

/** Días de cupo que faltan para terminar la audiencia encolada (null si no hay tope o nada pendiente). */
export function diasRestantes(contactados: number, encolados: number, topeDia: number): number | null {
  const faltan = encolados - contactados;
  if (faltan <= 0 || topeDia <= 0) return null;
  return Math.ceil(faltan / topeDia);
}

export type UnidadRelativa = 'second' | 'minute' | 'hour' | 'day';

/** «hace 4 min»: valor negativo y unidad para `Intl.RelativeTimeFormat`. `null` si ya es «ahora». */
export function tiempoRelativo(iso: string | null | undefined, ahora: number): { valor: number; unidad: UnidadRelativa } | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const s = Math.round((ahora - t) / 1000);
  if (s < 60) return null;
  if (s < 3600) return { valor: -Math.floor(s / 60), unidad: 'minute' };
  if (s < 86_400) return { valor: -Math.floor(s / 3600), unidad: 'hour' };
  return { valor: -Math.floor(s / 86_400), unidad: 'day' };
}

/** Cronómetro «02:14» de una llamada en curso. */
export function cronometro(inicioIso: string | null | undefined, ahora: number): string {
  const t = inicioIso ? Date.parse(inicioIso) : NaN;
  if (!Number.isFinite(t)) return '00:00';
  const s = Math.max(0, Math.floor((ahora - t) / 1000));
  const h = Math.floor(s / 3600);
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** Estado legible de la campaña (clave de `crm.campanaVoz.estados.*`) y su tono. */
export function estadoCampana(c: { status: string; emergency_stop: boolean }): { clave: string; tono: TonoBadge } {
  if (c.emergency_stop) return { clave: 'detenida', tono: 'peligro' };
  switch (c.status) {
    case 'running':
      return { clave: 'enCurso', tono: 'exito' };
    case 'paused':
      return { clave: 'pausada', tono: 'advertencia' };
    case 'scheduled':
      return { clave: 'programada', tono: 'informacion' };
    case 'completed':
      return { clave: 'terminada', tono: 'neutro' };
    default:
      return { clave: 'borrador', tono: 'neutro' };
  }
}
