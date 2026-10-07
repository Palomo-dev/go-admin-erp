/**
 * Contraste de color WCAG 2.x: una sola implementación para el ERP.
 *
 * La usan el campo de color del sitio web (Figma A/07e: aviso «Contraste 2,9:1
 * con el fondo. Mínimo 4,5:1 (AA)» y «Corregir automáticamente»), el panel de
 * estilo del sitio y el editor. `src/lib/documents/tema.ts` delega aquí su
 * `contraste`; `src/components/pos-display/logic.ts` tiene su propia copia
 * (fuera del módulo Sitio web): conviene que también delegue.
 *
 * Puro, sin React ni DOM.
 */

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

/** Mínimo AA para texto normal; 3:1 para texto grande (≥ 24 px o 18,66 px en negrita). */
export const CONTRASTE_AA = 4.5;
export const CONTRASTE_AA_GRANDE = 3;
export const CONTRASTE_AAA = 7;

/** `#rgb` o `#rrggbb` (con o sin `#`) → RGB; `null` si no es un hex válido. */
export function hexARgb(valor: unknown): Rgb | null {
  if (typeof valor !== 'string') return null;
  const hex = valor.trim().replace(/^#/, '');
  if (!/^[0-9a-f]{3}$/i.test(hex) && !/^[0-9a-f]{6}$/i.test(hex)) return null;
  const completo = hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex;
  return {
    r: parseInt(completo.slice(0, 2), 16),
    g: parseInt(completo.slice(2, 4), 16),
    b: parseInt(completo.slice(4, 6), 16),
  };
}

/** RGB → `#RRGGBB` (mayúsculas, como lo muestran los diseños: «#C8A97E»). */
export function rgbAHex({ r, g, b }: Rgb): string {
  const canal = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${canal(r)}${canal(g)}${canal(b)}`.toUpperCase();
}

/** Mezcla dos hex (`t` = 0 → `a`, 1 → `b`); si alguno no es válido, devuelve `a` tal cual. */
export function mezclarHex(a: string, b: string, t: number): string {
  const x = hexARgb(a);
  const y = hexARgb(b);
  if (!x || !y) return a;
  return rgbAHex({ r: x.r + (y.r - x.r) * t, g: x.g + (y.g - x.g) * t, b: x.b + (y.b - x.b) * t });
}

/** Normaliza un hex válido a `#RRGGBB`; `null` si no lo es. */
export function normalizarHex(valor: unknown): string | null {
  const rgb = hexARgb(valor);
  return rgb ? rgbAHex(rgb) : null;
}

function lineal(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

/** Luminancia relativa WCAG (0 = negro, 1 = blanco). */
export function luminanciaRelativa({ r, g, b }: Rgb): number {
  return 0.2126 * lineal(r) + 0.7152 * lineal(g) + 0.0722 * lineal(b);
}

/** Razón de contraste entre dos RGB (1 a 21). */
export function contrasteRgb(a: Rgb, b: Rgb): number {
  const [claro, oscuro] = [luminanciaRelativa(a), luminanciaRelativa(b)].sort((x, y) => y - x);
  return (claro + 0.05) / (oscuro + 0.05);
}

/** Razón de contraste entre dos hex; `null` si alguno no es válido. */
export function contraste(a: string, b: string): number | null {
  const ra = hexARgb(a);
  const rb = hexARgb(b);
  return ra && rb ? contrasteRgb(ra, rb) : null;
}

export type NivelContraste = 'AAA' | 'AA' | 'AA grande' | 'insuficiente';

/** Nivel WCAG de una razón (texto normal; «AA grande» solo vale para títulos). */
export function nivelContraste(razon: number): NivelContraste {
  if (razon >= CONTRASTE_AAA) return 'AAA';
  if (razon >= CONTRASTE_AA) return 'AA';
  if (razon >= CONTRASTE_AA_GRANDE) return 'AA grande';
  return 'insuficiente';
}

/**
 * Razón con una cifra decimal TRUNCADA (nunca redondeada hacia arriba: 4,46 no
 * se puede mostrar como «4,5:1» si no pasa) y la coma del idioma: «7,1:1».
 */
export function formatearRazon(razon: number, locale = 'es-CO'): string {
  const truncada = Math.floor(razon * 10) / 10;
  return `${truncada.toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}:1`;
}

/**
 * Corrige un color para que cumpla `minimo` contra `fondo`, moviéndolo hacia
 * negro o hacia blanco (el lado que más contraste da con el fondo) en pasos
 * del 4 % y conservando el matiz. Se evalúa sobre el hex redondeado que de
 * verdad se pinta. Si ya cumple, se devuelve normalizado; si alguno no es un
 * hex válido, `null`.
 */
export function ajustarHastaContraste(color: string, fondo: string, minimo = CONTRASTE_AA): string | null {
  const c = hexARgb(color);
  const f = hexARgb(fondo);
  if (!c || !f) return null;
  if (contrasteRgb(c, f) >= minimo) return rgbAHex(c);
  const haciaNegro = contrasteRgb({ r: 0, g: 0, b: 0 }, f) >= contrasteRgb({ r: 255, g: 255, b: 255 }, f);
  let actual = c;
  // 80 pasos del 4 % llevan cualquier color al extremo: el bucle siempre termina.
  for (let i = 0; i < 80; i += 1) {
    actual = haciaNegro
      ? { r: Math.floor(actual.r * 0.96), g: Math.floor(actual.g * 0.96), b: Math.floor(actual.b * 0.96) }
      : {
          r: Math.ceil(actual.r + (255 - actual.r) * 0.04),
          g: Math.ceil(actual.g + (255 - actual.g) * 0.04),
          b: Math.ceil(actual.b + (255 - actual.b) * 0.04),
        };
    const redondeado = hexARgb(rgbAHex(actual))!;
    if (contrasteRgb(redondeado, f) >= minimo) return rgbAHex(redondeado);
  }
  return haciaNegro ? '#000000' : '#FFFFFF';
}
