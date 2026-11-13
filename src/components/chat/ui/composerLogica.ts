/**
 * Reglas puras del compositor del Chat (`ComposerChat`, Figma 91-chat-00):
 * qué estado muestra, qué respuestas rápidas ofrece y cuándo deja enviar.
 */

/** Responder al cliente o dejar una nota que solo ve el equipo. */
export type ModoComposer = 'responder' | 'nota';

/**
 * - `normal`: se escribe y se envía.
 * - `cerrada`: la conversación está cerrada → aviso con «Reabrir conversación».
 * - `ventanaVencida`: WhatsApp, más de 24 h sin mensaje del cliente → solo
 *   plantilla aprobada («Elegir plantilla»).
 * - `sinConsentimiento`: el cliente pidió no recibir WhatsApp.
 *
 * Las notas internas no salen al cliente: en `ventanaVencida` y
 * `sinConsentimiento` se pueden seguir escribiendo; en `cerrada`, no.
 */
export type EstadoComposer = 'normal' | 'cerrada' | 'ventanaVencida' | 'sinConsentimiento';

export interface EntradaEstadoComposer {
  /** `conversations.status`. */
  estadoConversacion: string | null | undefined;
  /** `channels.type`. */
  tipoCanal: string | null | undefined;
  /**
   * Ventana de WhatsApp según el servidor (`/api/crm/whatsapp/window`).
   * `null` = aún no se sabe o no aplica: no se bloquea por algo que no se sabe.
   */
  ventana?: { abierta: boolean; puedeContactar: boolean } | null;
}

export function estadoComposer({ estadoConversacion, tipoCanal, ventana }: EntradaEstadoComposer): EstadoComposer {
  if (estadoConversacion === 'closed' || estadoConversacion === 'archived') return 'cerrada';
  if ((tipoCanal ?? '').toLowerCase() === 'whatsapp' && ventana) {
    if (!ventana.puedeContactar) return 'sinConsentimiento';
    if (!ventana.abierta) return 'ventanaVencida';
  }
  return 'normal';
}

/** ¿Se puede escribir en este modo y estado? */
export function puedeEscribir(modo: ModoComposer, estado: EstadoComposer): boolean {
  if (estado === 'cerrada') return false;
  if (modo === 'nota') return true;
  return estado === 'normal';
}

/** ¿Hay algo que enviar? */
export function puedeEnviar(texto: string, modo: ModoComposer, estado: EstadoComposer, ocupado = false): boolean {
  return !ocupado && puedeEscribir(modo, estado) && texto.trim().length > 0;
}

export interface RespuestaRapidaComposer {
  id: string;
  title: string;
  content: string;
  shortcut: string | null;
}

/**
 * Respuestas rápidas que se ofrecen mientras el texto empieza por «/». `null`
 * = no mostrar el menú. Busca en el atajo y el título, sin tildes.
 */
export function respuestasParaTexto<T extends RespuestaRapidaComposer>(lista: readonly T[], texto: string): T[] | null {
  if (!texto.startsWith('/') || texto.includes('\n')) return null;
  const q = normalizar(texto.slice(1));
  return lista.filter((r) => !q || normalizar(r.shortcut ?? '').includes(q) || normalizar(r.title).includes(q));
}

function normalizar(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

/** «1:05» para la grabación de audio. */
export function duracionGrabacion(segundos: number): string {
  const s = Math.max(0, Math.floor(segundos));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Emojis frecuentes del selector (lista corta, sin dependencia externa). */
export const EMOJIS_FRECUENTES = [
  '😀', '😃', '😄', '😁', '😅', '😂', '🤣', '😊', '😇', '🙂',
  '😉', '😌', '😍', '🥰', '😘', '😋', '😛', '😜', '🤗', '🤔',
  '😐', '😏', '🙄', '😬', '😔', '😴', '😷', '🤒', '🥵', '😎',
  '👍', '👎', '👌', '✌️', '🤞', '🤟', '🤙', '👋', '🙏', '👏',
  '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '💯', '✅', '❌',
  '⭐', '🌟', '🎉', '🎊', '🔥', '💪', '👀', '📦', '🚚', '🙌',
] as const;
