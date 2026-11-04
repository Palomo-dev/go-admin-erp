/**
 * «Color del ícono» de la rejilla de categorías (`categories_grid`, `contenido.icon_color`).
 *
 * Una sola clave en el contrato (`esquemaColorIconoCategoria`): 'category' | 'primary' |
 * 'secondary' | '#hex'. El panel la muestra como chips De la categoría · Primario · Secundario ·
 * Personalizado; «Personalizado» abre el campo de color y guarda el hex (nunca la palabra).
 * La tienda la lee en goadmin-websites `lib/website/iconosCategoria.ts`.
 *
 * El mismo campo sirve para «Color del separador» de la franja (`marquee.separator_color`:
 * 'secondary' | 'primary' | '#hex'), con el chip «Del texto» (`inherit`) que borra la clave.
 */
import { esquemaColorIconoCategoria } from '@/lib/website/contrato/documentoSitio';

export type ChipColorIcono = 'category' | 'primary' | 'secondary' | 'custom';

/** Chip que se ve: un hex válido es «Personalizado»; ausente o inválido, «De la categoría» (lo de hoy). */
export function chipColorIcono(valor: unknown): ChipColorIcono {
  return chipColorTokens(valor, 'category') as ChipColorIcono;
}

/** Chip que se ve con otro chip para «sin valor» (`vacio`), p. ej. «Del texto» del separador. */
export function chipColorTokens(valor: unknown, vacio: string): string {
  const r = esquemaColorIconoCategoria.safeParse(valor);
  if (!r.success) return vacio;
  return r.data.startsWith('#') ? 'custom' : r.data;
}

/** Chip que borra la clave (lo de hoy): se guarda `null`. */
export const CHIP_SIN_COLOR = 'inherit';

/** Hex guardado, o `null`. */
export function hexColorIcono(valor: unknown): string | null {
  const r = esquemaColorIconoCategoria.safeParse(valor);
  return r.success && r.data.startsWith('#') ? r.data : null;
}

/**
 * Valor a guardar al elegir un chip. «Personalizado» conserva el hex que ya había o arranca con
 * `inicial` (el color primario del tema).
 */
export function valorColorIcono(chip: ChipColorIcono, actual: unknown, inicial: string): string;
export function valorColorIcono(chip: string, actual: unknown, inicial: string): string | null;
export function valorColorIcono(chip: string, actual: unknown, inicial: string): string | null {
  if (chip === CHIP_SIN_COLOR) return null;
  if (chip !== 'custom') return chip;
  const hex = hexColorIcono(actual);
  if (hex) return hex;
  return esquemaColorIconoCategoria.safeParse(inicial).success && inicial.startsWith('#') ? inicial : '#111827';
}
