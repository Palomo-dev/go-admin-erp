/**
 * Orden del hilo de una conversación (Figma 91-chat-01): mensajes y notas
 * internas intercalados por fecha, con un separador por día calendario en la
 * zona de la organización. Puro, sin React.
 */
import { toPlainDate } from '@/lib/utils/dateDisplay';

export interface MensajeHilo {
  id: string;
  created_at: string;
}

export interface NotaHilo {
  id: string;
  created_at: string;
  note: string;
  member_id: number | null;
}

export type ElementoHilo<M extends MensajeHilo, N extends NotaHilo> =
  | { tipo: 'dia'; clave: string; dia: string }
  | { tipo: 'mensaje'; clave: string; mensaje: M }
  | { tipo: 'nota'; clave: string; nota: N };

/**
 * Intercala mensajes y notas por `created_at` y agrega un separador al empezar
 * cada día (`YYYY-MM-DD` en `tz`). Las notas anteriores al mensaje más viejo
 * cargado no se muestran mientras haya más historia por cargar: si no, quedarían
 * fuera de lugar.
 */
export function elementosHilo<M extends MensajeHilo, N extends NotaHilo>(
  mensajes: readonly M[],
  notas: readonly N[],
  tz: string | undefined,
  hayMasHistoria: boolean,
): ElementoHilo<M, N>[] {
  const desde = hayMasHistoria && mensajes.length > 0 ? mensajes.reduce((min, m) => (m.created_at < min ? m.created_at : min), mensajes[0].created_at) : null;
  const items: Array<{ t: number; e: ElementoHilo<M, N> }> = [
    ...mensajes.map((m) => ({ t: Date.parse(m.created_at), e: { tipo: 'mensaje' as const, clave: `m-${m.id}`, mensaje: m } })),
    ...notas
      .filter((n) => !desde || n.created_at >= desde)
      .map((n) => ({ t: Date.parse(n.created_at), e: { tipo: 'nota' as const, clave: `n-${n.id}`, nota: n } })),
  ].sort((a, b) => a.t - b.t);

  const out: ElementoHilo<M, N>[] = [];
  let diaActual: string | null = null;
  for (const { t, e } of items) {
    const dia = toPlainDate(new Date(t), tz);
    if (dia !== diaActual) {
      out.push({ tipo: 'dia', clave: `d-${dia}`, dia });
      diaActual = dia;
    }
    out.push(e);
  }
  return out;
}

/** Relación del día con hoy: para «Hoy» / «Ayer» antes de la fecha. */
export function relacionDia(dia: string, hoy: string): 'hoy' | 'ayer' | 'otro' {
  if (dia === hoy) return 'hoy';
  const h = Date.parse(`${hoy}T12:00:00Z`);
  const d = Date.parse(`${dia}T12:00:00Z`);
  return Math.round((h - d) / 86_400_000) === 1 ? 'ayer' : 'otro';
}

/** «viernes, 13 de noviembre» de un día calendario `YYYY-MM-DD`, en el idioma de la interfaz. */
export function fechaLargaDia(dia: string, locale: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dia);
  if (!m) return dia;
  const fecha = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12));
  return new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(fecha);
}
