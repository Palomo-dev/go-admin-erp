import type { LucideIcon } from 'lucide-react';

/**
 * Icono de la cabecera de las tarjetas del detalle del pedido (Figma `2725:192149`, manual
 * de marca): chip de 28 px en azul claro de marca con el icono en azul de marca.
 */
export function IconoCabecera({ icono: Icono }: { icono: LucideIcon }) {
  return (
    <span aria-hidden="true" className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-brand-tint text-brand">
      <Icono className="size-4" strokeWidth={1.5} />
    </span>
  );
}
