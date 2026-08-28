/**
 * styleUtils (FASE 12.4)
 *
 * Utilidades para copiar/pegar estilo entre secciones.
 * "Estilo" = las claves de STYLE_FIELDS + CARD_FIELDS (fondo, texto, bordes,
 * sombra, radio, layout de tarjeta, etc.). No se copia el contenido.
 */

import { STYLE_FIELDS, CARD_FIELDS } from '@/lib/services/website/sectionFieldGroups';

/** Claves que componen el "estilo" de una sección. */
export const STYLE_KEYS: string[] = [
  ...STYLE_FIELDS.map((f) => f.key),
  ...CARD_FIELDS.map((f) => f.key),
];

/**
 * Extrae solo las claves de estilo del content de una sección.
 */
export function extractStyle(content: Record<string, any>): Record<string, any> {
  const style: Record<string, any> = {};
  for (const key of STYLE_KEYS) {
    if (key in content && content[key] !== undefined) {
      style[key] = content[key];
    }
  }
  return style;
}

/**
 * Aplica un estilo copiado al content de una sección, preservando el resto.
 */
export function applyStyle(
  content: Record<string, any>,
  style: Record<string, any>,
): Record<string, any> {
  // Limpiar claves de estilo existentes y aplicar las nuevas
  const cleaned: Record<string, any> = {};
  for (const [k, v] of Object.entries(content)) {
    if (!STYLE_KEYS.includes(k)) {
      cleaned[k] = v;
    }
  }
  return { ...cleaned, ...style };
}
