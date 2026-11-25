'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { cn } from '@/utils/Utils';

/**
 * Cómo se acomoda un nombre largo:
 * - `truncar`: una línea con «…» (celdas de tabla en computador).
 * - `envolver`: hasta 3 líneas, partiendo palabras largas si hace falta, y «…»
 *   en la tercera (tarjetas de celular).
 * - `envolverEnMovil`: `envolver` por debajo de `lg` y `truncar` desde `lg`
 *   (listas que se ven igual en ambos tamaños, como el detalle del pedido).
 */
export type AjusteNombreLinea = 'truncar' | 'envolver' | 'envolverEnMovil';

/**
 * Clases del texto del nombre. `[overflow-wrap:anywhere]` además baja el ancho
 * mínimo del texto: sin eso, un nombre en una sola línea (`truncate` es
 * `nowrap`) le pide al contenedor todo su ancho y empuja la tarjeta fuera de la
 * pantalla.
 */
export const CLASES_AJUSTE_NOMBRE: Record<AjusteNombreLinea, string> = {
  truncar: 'truncate',
  envolver: 'line-clamp-3 break-words [overflow-wrap:anywhere]',
  envolverEnMovil: 'max-lg:line-clamp-3 max-lg:break-words max-lg:[overflow-wrap:anywhere] lg:truncate',
};

/** El ícono baja con la primera línea cuando el nombre puede ocupar varias. */
const ALINEAR_ICONO: Record<AjusteNombreLinea, { enlace: string; icono: string }> = {
  truncar: { enlace: 'items-center', icono: '' },
  envolver: { enlace: 'items-start', icono: 'mt-[0.2em]' },
  envolverEnMovil: { enlace: 'max-lg:items-start lg:items-center', icono: 'max-lg:mt-[0.2em]' },
};

export interface NombreLineaProps {
  nombre: string;
  /** Con enlace: `<a>` real (Ctrl/⌘ + clic abre otra pestaña) en color de enlace con «↗». */
  href?: string | null;
  /** Texto al pasar el puntero o mantener presionado; por defecto, el nombre completo. */
  titulo?: string;
  ajuste?: AjusteNombreLinea;
  className?: string;
  /** Lo que va junto al nombre sin enlace (p. ej. «Producto eliminado»). */
  children?: ReactNode;
}

/**
 * Nombre del producto en una línea de documento: factura de venta y de compra,
 * nota, cotización, venta, pedido en línea y devolución. Una sola pieza para
 * que el nombre largo nunca se monte sobre el total ni ensanche la tarjeta:
 * el enlace no pasa del ancho de su columna (`max-w-full`) y el «↗» va en el
 * flujo, detrás del texto.
 */
export function NombreLinea({ nombre, href, titulo, ajuste = 'truncar', className, children }: NombreLineaProps) {
  const texto = <span className={cn('min-w-0', CLASES_AJUSTE_NOMBRE[ajuste])}>{nombre}</span>;
  if (href) {
    return (
      <Link
        href={href}
        onClick={(e) => e.stopPropagation()}
        title={titulo ?? nombre}
        className={cn(
          'inline-flex min-w-0 max-w-full gap-1 rounded font-medium text-link hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
          ALINEAR_ICONO[ajuste].enlace,
          className,
        )}
      >
        {texto}
        <ArrowUpRight aria-hidden="true" className={cn('size-3.5 shrink-0', ALINEAR_ICONO[ajuste].icono)} strokeWidth={1.75} />
      </Link>
    );
  }
  return (
    <span title={ajuste === 'truncar' ? undefined : titulo ?? nombre} className={cn('inline-flex min-w-0 max-w-full flex-wrap items-center gap-x-2 font-medium text-fg', className)}>
      {texto}
      {children}
    </span>
  );
}
