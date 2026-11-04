/**
 * «Color del ícono» de la rejilla de categorías (`categories_grid`, `contenido.icon_color`).
 *
 * Una sola clave en el contrato (`esquemaColorIconoCategoria`): 'category' | 'primary' |
 * 'secondary' | '#hex'. El panel la muestra como chips De la categoría · Primario · Secundario ·
 * Personalizado; «Personalizado» abre el campo de color y guarda el hex (nunca la palabra).
 * La tienda la lee en goadmin-websites `lib/website/iconosCategoria.ts`.
 */
import { esquemaColorIconoCategoria } from '@/lib/website/contrato/documentoSitio';

export type ChipColorIcono = 'category' | 'primary' | 'secondary' | 'custom';

/** Chip que se ve: un hex válido es «Personalizado»; ausente o inválido, «De la categoría» (lo de hoy). */
export function chipColorIcono(valor: unknown): ChipColorIcono {
  const r = esquemaColorIconoCategoria.safeParse(valor);
  if (!r.success) return 'category';
  return r.data.startsWith('#') ? 'custom' : (r.data as ChipColorIcono);
}

/** Hex guardado, o `null`. */
export function hexColorIcono(valor: unknown): string | null {
  const r = esquemaColorIconoCategoria.safeParse(valor);
  return r.success && r.data.startsWith('#') ? r.data : null;
}

/**
 * Valor a guardar al elegir un chip. «Personalizado» conserva el hex que ya había o arranca con
 * `inicial` (el color primario del tema).
 */
export function valorColorIcono(chip: ChipColorIcono, actual: unknown, inicial: string): string {
  if (chip !== 'custom') return chip;
  const hex = hexColorIcono(actual);
  if (hex) return hex;
  return esquemaColorIconoCategoria.safeParse(inicial).success && inicial.startsWith('#') ? inicial : '#111827';
}
