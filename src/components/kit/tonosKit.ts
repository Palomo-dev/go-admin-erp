/**
 * Tonos de `FilaDato` y `Tarjeta`, sin React (los prueban los tests). Solo
 * tokens semánticos: nada de `dark:`, hex ni `gray-*`.
 */

export type TonoFilaDato = 'neutro' | 'fuerte' | 'exito' | 'peligro' | 'advertencia' | 'enlace';
export type TonoTarjeta = 'neutro' | 'peligro' | 'advertencia' | 'exito' | 'informacion';

/** Clases del valor de una `FilaDato` por tono. */
export function clasesTonoFilaDato(tono: TonoFilaDato = 'neutro'): string {
  switch (tono) {
    case 'fuerte':
      return 'font-semibold text-fg';
    case 'exito':
      return 'font-medium text-success-text';
    case 'peligro':
      return 'font-medium text-danger-text';
    case 'advertencia':
      return 'font-medium text-warning-text';
    case 'enlace':
      return 'font-medium text-link';
    default:
      return 'text-fg';
  }
}

/** Borde y caja del icono de una `Tarjeta` por tono. */
export function clasesTonoTarjeta(tono: TonoTarjeta = 'neutro'): { borde: string; icono: string } {
  switch (tono) {
    case 'peligro':
      return { borde: 'border-line-danger', icono: 'bg-danger-subtle text-danger-text' };
    case 'advertencia':
      return { borde: 'border-line-warning', icono: 'bg-warning-subtle text-warning-text' };
    case 'exito':
      return { borde: 'border-line-success', icono: 'bg-success-subtle text-success-text' };
    case 'informacion':
      return { borde: 'border-line-info', icono: 'bg-info-subtle text-info-text' };
    default:
      return { borde: 'border-line', icono: 'bg-brand-tint text-brand' };
  }
}
