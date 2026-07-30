/* AUTO-GENERADO por sync-agent.js — NO EDITAR */
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
 * Por que la PAGINA mide `printableMm` y no `rollMm`:
 *   El driver de la impresora del sistema ya expone solo el area imprimible.
 *   Si se declara `@page size: 80mm` (el rollo), el driver recorta o escala
 *   el contenido para que quepa en su area imprimible, lo que produce
 *   margenes dobles y recortes en el lado derecho.
 *   Declarar `@page size: printableMm` hace que la pagina coincida exactamente
 *   con lo que el cabezal puede imprimir, sin escalado ni recorte.
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
  /** Ancho imprimible en micrones, para `webContents.print({ pageSize })`. */
  printableMicrons: number;
  /** Ancho imprimible en px CSS a 96 dpi. Ancho de la BrowserWindow oculta. */
  cssPx: number;
  /** Caracteres por linea con Font A. Base de separadores y alineacion. */
  charsPerLine: number;
}

const MM_TO_CSS_PX = 96 / 25.4;

function buildSpec(width: PaperWidth, rollMm: number, dots: number): PaperSpec {
  // 203 dpi es el estandar de facto en impresoras termicas de tickets.
  const printableMm = (dots / 203) * 25.4;
  return {
    width,
    rollMm,
    printableMm: Math.round(printableMm * 100) / 100,
    printableMicrons: Math.round(printableMm * 1000),
    cssPx: Math.floor(printableMm * MM_TO_CSS_PX),
    // Font A = 12 puntos de ancho.
    charsPerLine: Math.floor(dots / 12),
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
