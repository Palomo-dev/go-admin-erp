/**
 * Agrupa los tokens del modelo en trozos de 2–3 palabras antes de mandarlos a
 * ConversationRelay (2026-10-07).
 *
 * Desde 435052e5 cada token salía hacia Twilio en cuanto llegaba. Un token es
 * a menudo media palabra («Ent», «iendo») y, según el dueño, la voz sonaba
 * entrecortada a mitad de respuesta. Twilio recomienda mandar el texto en
 * cuanto exista y no esperar a la respuesta completa. Aquí no se espera a la
 * frase: se espera a tener palabras COMPLETAS.
 *
 *  - Primer trozo: 2 palabras completas, o antes si cierra una puntuación
 *    («Sí, …» sale con «Sí, »). A ~50 tokens/s eso son unos 50–80 ms más que
 *    el primer token, mucho menos que la síntesis.
 *  - Siguientes: 3 palabras completas, o antes en puntuación.
 *  - Nunca se corta una palabra: el corte va siempre tras un espacio.
 *  - Texto sin espacios muy largo (una URL): se suelta al pasar de
 *    `MAX_SIN_ESPACIO` caracteres para no retenerlo.
 *  - `vaciar()` devuelve lo pendiente al terminar el turno (va con `last:true`).
 *
 * La concatenación de los trozos es SIEMPRE idéntica al texto del modelo.
 * Módulo puro: sin red ni base.
 */

export const PALABRAS_PRIMER_TROZO = 2;
export const PALABRAS_POR_TROZO = 3;
export const MAX_SIN_ESPACIO = 40;

/** Una palabra que termina en puntuación cierra un trozo aunque falten palabras. */
const PUNTUACION_CIERRE = /[.,;:!?…)»"]$/;

export class AgrupadorTrozos {
  private pendiente = '';
  private enviados = 0;

  /** Añade un delta del modelo. Devuelve el trozo listo para Twilio o `null`. */
  agregar(delta: string): string | null {
    if (!delta) return null;
    this.pendiente += delta;

    const objetivo = this.enviados === 0 ? PALABRAS_PRIMER_TROZO : PALABRAS_POR_TROZO;
    // Palabras completas = las que ya tienen espacio detrás. Si el trozo está
    // listo se mandan TODAS las completas (un delta grande puede traer
    // varias): no se retiene texto que ya se puede decir.
    const completas = /\S+\s+/g;
    const palabras: string[] = [];
    let corte = -1;
    let m: RegExpExecArray | null;
    while ((m = completas.exec(this.pendiente)) !== null) {
      palabras.push(m[0].trim());
      corte = m.index + m[0].length;
    }

    let listo = palabras.length >= objetivo || palabras.some((p) => PUNTUACION_CIERRE.test(p));
    if (!listo && !/\s/.test(this.pendiente) && this.pendiente.length > MAX_SIN_ESPACIO) {
      corte = this.pendiente.length;
      listo = true;
    }
    if (!listo) return null;

    const trozo = this.pendiente.slice(0, corte);
    this.pendiente = this.pendiente.slice(corte);
    this.enviados++;
    return trozo;
  }

  /** Lo que queda sin enviar (puede ser `''`). Deja el agrupador vacío. */
  vaciar(): string {
    const resto = this.pendiente;
    this.pendiente = '';
    return resto;
  }
}
