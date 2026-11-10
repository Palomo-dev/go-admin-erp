/**
 * «Efecto al pasar el mouse» de los botones del tema (`tema.tokens.hover`, PLANO §2 ítem 12, Figma
 * A3). Puro, sin React: lo prueba `__tests__/hoverBotonesTema.test.tsx`.
 *
 * El sitio pone `data-tema-hover` solo con `sutil` (oscurece 8 %) o `expresivo` (sube 1 px y la
 * flecha avanza 3 px): `hoverDeTokens` de `tokensDiseno.ts`. «Ninguno» = el hover de hoy, y por eso
 * NO se guarda: se borra `tokens.hover` (y `tokens` si queda vacío), así el tema queda como estaba.
 * Ningún preset escribe `hover`, así que borrarlo no pisa nada que venga de un preset.
 */
import { valorPropio, type DocumentoSitio } from '@/lib/website/contrato/documentoSitio';
import { HOVERS_BOTON, hoverDeTokens, type HoverBoton, type TokensCrudos } from '@/lib/website/v2/tokensDiseno';

export type OpcionHoverBotones = 'ninguno' | HoverBoton;
export const OPCIONES_HOVER_BOTONES: readonly OpcionHoverBotones[] = ['ninguno', ...HOVERS_BOTON];

type TokensDoc = NonNullable<DocumentoSitio['tema']['tokens']>;

/** Lo que pinta hoy el sitio: `sutil`, `expresivo` o `ninguno` (sin valor o con uno inválido). */
export function leerHoverBotones(documento: DocumentoSitio | null | undefined): OpcionHoverBotones {
  return hoverDeTokens(documento?.tema.tokens as TokensCrudos | undefined) ?? 'ninguno';
}

/** Escribe la opción en el documento (inmutable). Un valor fuera del contrato no cambia nada. */
export function cambiarHoverBotones(documento: DocumentoSitio, opcion: OpcionHoverBotones): DocumentoSitio {
  if (!(OPCIONES_HOVER_BOTONES as readonly string[]).includes(opcion)) return documento;
  const tokens = { ...(documento.tema.tokens ?? {}) } as TokensDoc;
  if (opcion === 'ninguno') {
    if (!documento.tema.tokens || !('hover' in documento.tema.tokens)) return documento;
    delete tokens.hover;
  } else {
    tokens.hover = valorPropio(opcion);
  }
  const tema = { ...documento.tema };
  if (Object.keys(tokens).length > 0) tema.tokens = tokens;
  else delete tema.tokens;
  return { ...documento, tema };
}
