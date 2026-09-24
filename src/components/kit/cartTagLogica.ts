/**
 * `CartTag` sin React (Figma `CartTag`, sección «POS v2»: neutral · brand ·
 * warning · danger · success · info + descuento-manual · general · promoción).
 * Solo tokens semánticos: nada de `dark:`, hex ni `gray-*`.
 *
 * Promoción no tiene token propio en `tokens.css`: fondo violeta translúcido
 * (sirve en claro y oscuro) con el texto en `text-fg` para no perder
 * contraste; el icono va en violeta. Pendiente: token `promo` en Figma.
 */

export type TonoCartTag = 'neutro' | 'marca' | 'advertencia' | 'peligro' | 'exito' | 'informacion' | 'promocion';

/** Origen de un descuento de línea (`discount_source`: manual · general · promotion; nulo se lee como manual). */
export type OrigenDescuento = 'manual' | 'general' | 'promocion';

/** Icono por defecto de la etiqueta (el componente lo traduce a un icono lucide). */
export type IconoCartTag = 'etiqueta' | 'porcentaje' | null;

export interface VistaCartTag {
  tono: TonoCartTag;
  /** Icono por defecto si la pantalla no pasa uno. */
  icono: IconoCartTag;
  /** Sufijo que se añade al texto («−$ 6.667 · general»). */
  sufijo: 'general' | null;
  /** Clave de `kit.carrito` con el tooltip por defecto. */
  claveTitulo: 'descuentoManualTitulo' | 'descuentoGeneralTitulo' | 'descuentoPromocionTitulo' | null;
}

/**
 * Tono, icono, sufijo y tooltip por defecto. Con `origen` (descuentos) manda el
 * origen: manual y general en rojo (general con «%» y «· general»), promoción
 * en violeta. Sin origen, el tono pedido (neutro si no llega).
 */
export function vistaCartTag({ tono, origen }: { tono?: TonoCartTag; origen?: OrigenDescuento | null }): VistaCartTag {
  switch (origen) {
    case 'manual':
      return { tono: 'peligro', icono: 'etiqueta', sufijo: null, claveTitulo: 'descuentoManualTitulo' };
    case 'general':
      return { tono: 'peligro', icono: 'porcentaje', sufijo: 'general', claveTitulo: 'descuentoGeneralTitulo' };
    case 'promocion':
      return { tono: 'promocion', icono: 'etiqueta', sufijo: null, claveTitulo: 'descuentoPromocionTitulo' };
    default:
      return { tono: tono ?? 'neutro', icono: null, sufijo: null, claveTitulo: null };
  }
}

/** Fondo y texto de la etiqueta por tono. */
export function clasesTonoCartTag(tono: TonoCartTag = 'neutro'): { caja: string; icono: string } {
  switch (tono) {
    case 'marca':
      return { caja: 'bg-brand-tint text-brand-deep', icono: '' };
    case 'advertencia':
      return { caja: 'bg-warning-subtle text-warning-text', icono: '' };
    case 'peligro':
      return { caja: 'bg-danger-subtle text-danger-text', icono: '' };
    case 'exito':
      return { caja: 'bg-success-subtle text-success-text', icono: '' };
    case 'informacion':
      return { caja: 'bg-info-subtle text-info-text', icono: '' };
    case 'promocion':
      return { caja: 'bg-violet-500/15 text-fg', icono: 'text-violet-500' };
    default:
      return { caja: 'bg-subtle text-fg-secondary', icono: '' };
  }
}
