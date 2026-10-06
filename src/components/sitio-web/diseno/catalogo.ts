/**
 * Catálogo de estilos y plantillas que usan Diseño, Plantillas (y, cuando se
 * conecten, el asistente y el editor): `construirCatalogo` sobre las plantillas
 * reales del sitio (`TEMPLATE_PRESETS`, solo lectura). Además, cómo se PINTA un
 * estilo del cliente dentro de las muestras (StylePresetCard, miniaturas y vista
 * esquemática): sus colores y fuentes solo viven ahí, nunca en el cromo del ERP.
 */
import { TEMPLATE_PRESETS } from '@/lib/services/websiteSettingsService';
import { getSectionDefinition } from '@/lib/services/websitePageBuilderService';
import { construirCatalogo, tieneSerifa, type EstiloCatalogo } from '@/lib/website/contrato/catalogoPlantillas';
import { radioBoton, textoSobreAcento, type TokensEstilo } from '@/lib/website/v2/tokensEstilo';
import { hexARgb, rgbAHex } from '@/lib/utils/contrasteColor';
import type { MuestraEstilo } from '../ui/StylePresetCard';
import type { TemaVistaSitio } from '../ui/temaVistaSitio';

export const CATALOGO_SITIO = construirCatalogo(TEMPLATE_PRESETS);

/** `font-family` CSS de una familia del sitio, con su respaldo genérico. */
export function familiaCss(familia: string): string {
  return `'${familia.replace(/'/g, '')}', ${tieneSerifa(familia) ? 'serif' : 'sans-serif'}`;
}

/** Mezcla dos hex (`t` = 0 → `a`, 1 → `b`); si alguno no es válido, `a`. */
export function mezclar(a: string, b: string, t: number): string {
  const x = hexARgb(a);
  const y = hexARgb(b);
  if (!x || !y) return a;
  return rgbAHex({ r: x.r + (y.r - x.r) * t, g: x.g + (y.g - x.g) * t, b: x.b + (y.b - x.b) * t });
}

/** Muestra de StylePresetCard: «Aa», texto y botón con los tokens del estilo. */
export function muestraDeEstilo(e: TokensEstilo): MuestraEstilo {
  return {
    fondo: e.fondo,
    texto: e.texto,
    acento: e.acento,
    textoAcento: textoSobreAcento(e.acento),
    fuenteTitulos: familiaCss(e.fuenteTitulos),
    fuenteTexto: familiaCss(e.fuenteCuerpo),
    radioBoton: radioBoton(e),
    puntos: [e.texto, mezclar(e.texto, e.fondo, 0.5), mezclar(e.fondo, e.texto, 0.12)],
  };
}

/** Tema de las vistas esquemáticas (miniatura de plantilla, encabezado y pie). */
export function temaVistaDeEstilo(e: TokensEstilo): TemaVistaSitio {
  return {
    ...muestraDeEstilo(e),
    fondoSecundario: mezclar(e.fondo, e.texto, 0.06),
    textoSuave: mezclar(e.texto, e.fondo, 0.4),
    linea: mezclar(e.fondo, e.texto, 0.16),
  };
}

/** «Libre Caslon Text · Inter». */
export function nombreFuentes(e: Pick<EstiloCatalogo, 'fuenteTitulos' | 'fuenteCuerpo'>): string {
  return `${e.fuenteTitulos} · ${e.fuenteCuerpo}`;
}

/** Nombre visible de un tipo de sección (el del catálogo del editor: «Carta destacada»). */
export function nombreSeccion(tipo: string): string | null {
  return getSectionDefinition(tipo)?.label ?? null;
}

/** Variante visible («Pestañas») si el catálogo del editor la nombra. */
export function nombreVariante(tipo: string, variante: string): string | null {
  return getSectionDefinition(tipo)?.variants.find((v) => v.id === variante)?.label ?? null;
}
