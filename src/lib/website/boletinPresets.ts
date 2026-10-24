/** Presets del boletín. No incluyen el título: ese ya vive en el contenido. */

export const LAYOUTS_BOLETIN = ['centered', 'image_left', 'image_right', 'image_top', 'image_bottom', 'card_floating', 'inline_bar', 'split_bg'] as const

export type LayoutBoletin = (typeof LAYOUTS_BOLETIN)[number]

export const ETIQUETA_LAYOUT: Record<LayoutBoletin, string> = {
  centered: 'Centrado',
  image_left: 'Imagen izquierda',
  image_right: 'Imagen derecha',
  image_top: 'Imagen arriba',
  image_bottom: 'Imagen abajo',
  card_floating: 'Tarjeta flotante',
  inline_bar: 'Franja',
  split_bg: 'Mitad y mitad',
}

export function precargaBoletin(layout: LayoutBoletin): Record<string, unknown> {
  const comun = { align: layout === 'centered' || layout === 'image_top' || layout === 'image_bottom' || layout === 'card_floating' ? 'center' : 'left' }
  if (layout === 'card_floating') {
    return {
      ...comun,
      background: { gradient_1: '#111827', gradient_2: '#374151', gradient_type: 'linear', angle: 135 },
      container: { color: '#ffffff', radius: 16, shadow: true, padding: 28 },
      form: { arrangement: 'stacked' },
    }
  }
  if (layout === 'inline_bar') {
    return { ...comun, form: { arrangement: 'inline' }, container: { padding: 16, radius: 12 } }
  }
  if (layout === 'split_bg') {
    return { ...comun, background: { width: 'full' }, form: { arrangement: 'stacked' } }
  }
  if (layout === 'image_left' || layout === 'image_right') {
    return { ...comun, form: { arrangement: 'stacked' } }
  }
  return { ...comun, form: { arrangement: 'inline' } }
}
