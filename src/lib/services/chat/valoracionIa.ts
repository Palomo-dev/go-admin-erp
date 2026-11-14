/**
 * 👍/👎 de la respuesta sugerida por la IA del Chat (Figma
 * 93-chat-pendientes-03): reglas puras compartidas por el panel IA, la ruta
 * `/api/chat/ai/trabajos/[id]/valoracion` e IA › Trabajos.
 *
 * Se guarda en `ai_training_feedback` (ligada al trabajo `ai_jobs`):
 * 👍 → feedback_type 'correct', 👎 → 'incorrect' + `motivo` + `notes`
 * (migración 20261113221213).
 */

export const MOTIVOS_VALORACION = ['dato_incorrecto', 'no_respondio', 'tono', 'muy_larga', 'otro'] as const;
export type MotivoValoracion = (typeof MOTIVOS_VALORACION)[number];
export type VotoValoracion = 'util' | 'no_util';

export const COMENTARIO_MAXIMO = 1000;

export interface ValoracionPedida {
  voto: VotoValoracion;
  motivo: MotivoValoracion | null;
  comentario: string | null;
}

/** Fila de `ai_training_feedback` que lee IA › Trabajos. */
export interface ValoracionTrabajo {
  feedback_type: string;
  motivo: string | null;
  notes: string | null;
  created_at: string | null;
  feedback_by_member_id: number | null;
}

export const COLUMNAS_VALORACION = 'feedback_type, motivo, notes, created_at, feedback_by_member_id';

export function esMotivo(v: unknown): v is MotivoValoracion {
  return typeof v === 'string' && (MOTIVOS_VALORACION as readonly string[]).includes(v);
}

/**
 * Valida el cuerpo de la petición. 👎 exige motivo; 👍 no lleva motivo ni
 * comentario (se descartan). Devuelve `null` si no es válido.
 */
export function leerValoracion(cuerpo: unknown): ValoracionPedida | null {
  if (!cuerpo || typeof cuerpo !== 'object') return null;
  const c = cuerpo as Record<string, unknown>;
  if (c.voto === 'util') return { voto: 'util', motivo: null, comentario: null };
  if (c.voto !== 'no_util' || !esMotivo(c.motivo)) return null;
  if (c.comentario != null && typeof c.comentario !== 'string') return null;
  const comentario = typeof c.comentario === 'string' ? c.comentario.trim().slice(0, COMENTARIO_MAXIMO) : '';
  return { voto: 'no_util', motivo: c.motivo, comentario: comentario || null };
}

/** Valor de `feedback_type` (CHECK de la tabla) para cada voto. */
export function tipoFeedback(voto: VotoValoracion): 'correct' | 'incorrect' {
  return voto === 'util' ? 'correct' : 'incorrect';
}

/** Voto de una fila guardada, o `null` si es de otro tipo (p. ej. 'off_topic'). */
export function votoDeFeedback(tipo: string | null | undefined): VotoValoracion | null {
  if (tipo === 'correct') return 'util';
  if (tipo === 'incorrect' || tipo === 'partially_correct' || tipo === 'inappropriate' || tipo === 'off_topic') return 'no_util';
  return null;
}

/** Resumen para la columna de Trabajos: cuántos 👍 y 👎 tiene el trabajo. */
export function resumenValoraciones(filas: readonly Pick<ValoracionTrabajo, 'feedback_type'>[] | null | undefined): { util: number; noUtil: number } {
  let util = 0;
  let noUtil = 0;
  for (const f of filas ?? []) {
    const v = votoDeFeedback(f.feedback_type);
    if (v === 'util') util += 1;
    else if (v === 'no_util') noUtil += 1;
  }
  return { util, noUtil };
}
