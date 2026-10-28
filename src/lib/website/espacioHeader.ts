/**
 * Hueco entre el encabezado y la primera sección, y si el hero se mete debajo.
 *
 * El default es 0 y sin solape: lo pidió el producto. `overlap_header` sigue
 * como alias de la sección. `header_transparent_over_hero: false` (guardado)
 * gana y deja el header opaco, aunque la sección pida solape.
 */

export const RESPALDO_HEADER_PX = 72

export function pxEnRango(valor: unknown, min: number, max: number): number | null {
  const n = typeof valor === 'number' ? valor : typeof valor === 'string' && valor.trim() !== '' ? Number(valor) : NaN
  if (!Number.isFinite(n)) return null
  const r = Math.round(n)
  return r >= min && r <= max ? r : null
}

type AjustesHeader = {
  header_transparent_over_hero?: unknown
  header_style?: unknown
  first_section_offset_px?: unknown
} | null | undefined

/** El encabezado sale del flujo y queda encima del hero. */
export function headerSobreHero(ajustes: AjustesHeader): boolean {
  if (ajustes?.header_style === 'transparent' && ajustes.header_transparent_over_hero !== false) return true
  return ajustes?.header_transparent_over_hero === true
}

/**
 * El hero reserva `padding-top: var(--header-h)` y no usa margen negativo.
 * Sin clave, no solapa. `overlap_header: true` es el alias de antes.
 */
export function heroSolapa(ajustes: AjustesHeader, overlapHeader: unknown): boolean {
  if (ajustes?.header_transparent_over_hero === false) return false
  if (headerSobreHero(ajustes)) return overlapHeader !== false
  return overlapHeader === true
}

/** Píxeles extra encima de la primera sección. Ausente = 0. */
export function offsetPrimeraPx(ajustes: AjustesHeader): number {
  return pxEnRango(ajustes?.first_section_offset_px, 0, 240) ?? 0
}

export function paddingExplicito(valor: unknown): boolean {
  return typeof valor === 'string' && valor.trim() !== ''
}

export function margenExplicito(valor: unknown): boolean {
  return typeof valor === 'string' && valor.trim() !== '' && valor !== 'none'
}
