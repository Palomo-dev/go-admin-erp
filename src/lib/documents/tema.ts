/**
 * Colores de los documentos: salen de los tokens de Figma
 * (`src/styles/figma-tokens.json`, la misma fuente que `tokens.css`), no de
 * hex sueltos. El acento es el color primario de la organización si tiene
 * contraste suficiente con blanco (texto blanco sobre la cabecera de la
 * tabla); si no, el Azul GO. La factura de compra (documento de un tercero)
 * usa la paleta sobria en gris (decisión del dueño, DOCUMENTOS-PDF.md §8.5).
 */

import tokens from '@/styles/figma-tokens.json';
import { colorHexSeguro } from './escape';
import { contraste as contrasteHex } from '@/lib/utils/contrasteColor';

const P = (tokens as { primitivos: Record<string, string> }).primitivos;

function token(nombre: string, respaldo: string): string {
  return colorHexSeguro(P[nombre]) ?? respaldo;
}

export interface TemaDocumento {
  acento: string;
  acentoSuave: string;
  texto: string;
  textoSecundario: string;
  textoTenue: string;
  borde: string;
  bordeFuerte: string;
  fondoSuave: string;
  exito: string;
  exitoSuave: string;
  aviso: string;
  avisoSuave: string;
  peligro: string;
  peligroSuave: string;
  info: string;
  infoSuave: string;
}

/** Contraste WCAG entre dos colores hex (implementación única: `@/lib/utils/contrasteColor`). */
export function contraste(a: string, b: string): number {
  return contrasteHex(a, b) ?? 1;
}

/** Color de acento: el de la organización si se lee texto blanco encima (≥ 4.5:1). */
export function acentoDocumento(colorOrganizacion: string | null, sobrio: boolean): string {
  if (sobrio) return token('slate/700', '#334155');
  const propio = colorHexSeguro(colorOrganizacion);
  if (propio && contraste(propio, '#ffffff') >= 4.5) return propio;
  return token('blue/600', '#3651d4');
}

export function temaDocumento(colorOrganizacion: string | null, sobrio: boolean): TemaDocumento {
  return {
    acento: acentoDocumento(colorOrganizacion, sobrio),
    acentoSuave: sobrio ? token('slate/100', '#f1f5f9') : token('blue/50', '#eef1fe'),
    texto: token('slate/900', '#0f172a'),
    textoSecundario: token('slate/600', '#475569'),
    textoTenue: token('slate/500', '#64748b'),
    borde: token('slate/200', '#e2e8f0'),
    bordeFuerte: token('slate/300', '#cbd5e1'),
    fondoSuave: token('slate/50', '#f8fafc'),
    exito: token('green/700', '#15803d'),
    exitoSuave: token('green/50', '#f0fdf4'),
    aviso: token('amber/700', '#b45309'),
    avisoSuave: token('amber/50', '#fffbeb'),
    peligro: token('red/700', '#b91c1c'),
    peligroSuave: token('red/50', '#fef2f2'),
    info: token('sky/700', '#0369a1'),
    infoSuave: token('sky/50', '#f0f9ff'),
  };
}
