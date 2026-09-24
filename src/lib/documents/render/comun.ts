/**
 * Piezas compartidas por los renderizadores (carta/A4 y 80 mm): valor de un
 * campo o de una celda ya formateado y ESCAPADO, rótulos y tonos.
 */

import { escaparHtml } from '../escape';
import type { Formateador } from '../formato';
import type { Traductor } from '../textos';
import type { CeldaTabla, ColumnaTabla, DocumentoPayload, FilaTotal, Tono, Valor } from '../tipos';

export const OCULTO = '***';

/** Texto plano (sin escapar) de un valor. */
export function textoDeValor(valor: Valor, f: Formateador, t: Traductor): string {
  switch (valor.tipo) {
    case 'texto':
      return valor.v ?? '';
    case 'clave':
      return t(valor.v, valor.vars);
    case 'dinero':
      return valor.v === null ? '' : f.dinero(valor.v);
    case 'instante':
      return f.instante(valor.v);
    case 'instanteHora':
      return f.instanteHora(valor.v);
    case 'fecha':
      return f.fecha(valor.v);
    case 'numero':
      return valor.v === null ? '' : f.numero(valor.v, valor.decimales);
    case 'oculto':
      return OCULTO;
  }
}

/** HTML escapado de un valor. */
export function htmlDeValor(valor: Valor, f: Formateador, t: Traductor): string {
  return escaparHtml(textoDeValor(valor, f, t));
}

export function esOculta(celda: CeldaTabla): celda is { oculto: true } {
  return typeof celda === 'object' && celda !== null && 'oculto' in celda;
}

/** Texto plano (sin escapar) de una celda según el tipo de su columna. */
export function textoDeCelda(columna: ColumnaTabla, celda: CeldaTabla, f: Formateador, t: Traductor): string {
  if (celda === null || celda === undefined || celda === '') return '';
  if (esOculta(celda)) return OCULTO;
  switch (columna.tipo) {
    case 'dinero':
      return f.dinero(celda as number | string);
    case 'instante':
      return f.instante(String(celda));
    case 'instanteHora':
      return f.instanteHora(String(celda));
    case 'fecha':
      return f.fecha(String(celda));
    case 'numero':
      return f.numero(celda as number | string);
    case 'clave':
      return t(String(celda));
    default:
      return String(celda);
  }
}

export function textoDeTotal(fila: FilaTotal, f: Formateador): string {
  if (fila.oculto) return OCULTO;
  if (fila.valor === null) return '';
  const monto = f.dinero(Math.abs(fila.valor));
  const negativo = fila.resta || fila.valor < 0;
  return negativo && fila.valor !== 0 ? `- ${monto}` : monto;
}

export function titulo(doc: DocumentoPayload, t: Traductor): string {
  return t(`tipos.${doc.tituloClave}`);
}

/** NIT con dígito de verificación: `900123456-7`. */
export function nitConDv(nit: string | null, dv: string | null): string | null {
  if (!nit) return null;
  return dv !== null && dv !== '' ? `${nit}-${dv}` : nit;
}

export function claseTono(tono: Tono): string {
  return `tono-${tono}`;
}
