/**
 * Especificacion unica de los formatos de papel termico.
 *
 * Todo el codigo de impresion (ESC/POS y HTML) debe derivar sus medidas de aqui
 * para que los distintos caminos de impresion produzcan el mismo resultado.
 *
 * Por que `printableMm` no es igual al ancho del rollo:
 *   Una impresora termica de 80mm tiene un cabezal de 576 puntos a 203 dpi.
 *     576 / 203 = 2.837 pulgadas = 72.06 mm  -> area imprimible real
 *   Los ~4mm de cada borde son mecanicamente inalcanzables.
 *
 * Por que la PAGINA mide `rollMm` y no `printableMm`:
 *   `printableMm` es el area que alcanza el cabezal, no el tamano del papel.
 *   Si se declara `@page size: 72.06mm` sobre un papel de 80mm, el driver
 *   entiende que la hoja es mas pequena que el papel y ESCALA la pagina para
 *   llenarlo (x1.11), con lo que el contenido termina midiendo 80mm sobre un
 *   cabezal de 72mm y se recorta por AMBOS lados.
 *   Por eso la pagina se declara al ancho real del rollo y el area imprimible
 *   se respeta con un padding de `safeMarginMm`: asi no hay nada que escalar.
 *
 * Por que `charsPerLine` es 48 y 32:
 *   La fuente Font A de ESC/POS mide 12 puntos de ancho.
 *     80mm -> 576 / 12 = 48 caracteres
 *     58mm -> 384 / 12 = 32 caracteres
 *   Coincide exactamente con el area imprimible, por lo que ambas medidas
 *   describen la misma linea fisica.
 */

export type PaperWidth = '58mm' | '80mm';

export interface PaperSpec {
  /** Valor canonico tal como se guarda en `printers.paper_width`. */
  width: PaperWidth;
  /** Ancho nominal del rollo en mm (solo informativo / UI). */
  rollMm: number;
  /** Ancho imprimible real en mm. Es el que se usa para maquetar. */
  printableMm: number;
  /** Ancho imprimible en micrones. Informativo: la pagina usa `rollMicrons`. */
  printableMicrons: number;
  /** Ancho imprimible en px CSS a 96 dpi. Ancho util para maquetar. */
  cssPx: number;
  /** Caracteres por linea con Font A. Base de separadores y alineacion. */
  charsPerLine: number;
  /** Ancho del rollo en micrones, para `webContents.print({ pageSize })`. */
  rollMicrons: number;
  /** Ancho del rollo en px CSS. Ancho de la BrowserWindow oculta. */
  rollCssPx: number;
  /**
   * Margen lateral inalcanzable por el cabezal, en mm. Se aplica como padding
   * para que el contenido caiga dentro del area imprimible sin escalar.
   */
  safeMarginMm: number;
}

const MM_TO_CSS_PX = 96 / 25.4;

function buildSpec(width: PaperWidth, rollMm: number, dots: number): PaperSpec {
  // 203 dpi es el estandar de facto en impresoras termicas de tickets.
  const printableMm = (dots / 203) * 25.4;
  // El sobrante del rollo se reparte a partes iguales entre los dos bordes.
  const safeMarginMm = Math.max(0, (rollMm - printableMm) / 2);
  return {
    width,
    rollMm,
    printableMm: Math.round(printableMm * 100) / 100,
    printableMicrons: Math.round(printableMm * 1000),
    cssPx: Math.floor(printableMm * MM_TO_CSS_PX),
    // Font A = 12 puntos de ancho.
    charsPerLine: Math.floor(dots / 12),
    rollMicrons: Math.round(rollMm * 1000),
    rollCssPx: Math.floor(rollMm * MM_TO_CSS_PX),
    safeMarginMm: Math.round(safeMarginMm * 100) / 100,
  };
}

const SPECS: Record<PaperWidth, PaperSpec> = {
  '58mm': buildSpec('58mm', 58, 384),
  '80mm': buildSpec('80mm', 80, 576),
};

export const DEFAULT_PAPER_WIDTH: PaperWidth = '80mm';

/**
 * Normaliza el valor de `printers.paper_width`, que llega de la base de datos
 * como texto libre. Acepta "80mm", "80", 80, " 58 MM ", null, undefined.
 * Cualquier valor no reconocido cae en el ancho por defecto.
 */
export function normalizePaperWidth(raw: unknown): PaperWidth {
  if (raw === null || raw === undefined) return DEFAULT_PAPER_WIDTH;

  const parsed = parseInt(String(raw).replace(/mm/i, '').trim(), 10);
  if (Number.isNaN(parsed) || parsed <= 0) return DEFAULT_PAPER_WIDTH;

  // Se asigna al formato estandar mas cercano por debajo para no desbordar
  // el area imprimible de una impresora mas angosta de lo declarado.
  return parsed <= 58 ? '58mm' : '80mm';
}

/** Devuelve la especificacion completa a partir de un `paper_width` crudo. */
export function getPaperSpec(raw: unknown): PaperSpec {
  return SPECS[normalizePaperWidth(raw)];
}
