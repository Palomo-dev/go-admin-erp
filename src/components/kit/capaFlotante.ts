/**
 * Un Select o un Popover de Radix se pinta en un portal, fuera del diálogo.
 * El clic en esa lista es "fuera" para el diálogo y lo cierra. Estas capas
 * no deben cerrarlo.
 */
const SELECTORES = [
  '[data-radix-popper-content-wrapper]',
  '[data-radix-select-content]',
  '[data-radix-popover-content]',
  '[role="listbox"]',
  '[role="menu"]',
];

export function esCapaFlotante(objetivo: EventTarget | null): boolean {
  if (!(objetivo instanceof Element)) return false;
  return SELECTORES.some((selector) => objetivo.closest(selector) != null);
}
