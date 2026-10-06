'use client';

import { cn } from '@/utils/Utils';
import { formatMoneda } from '@/lib/utils/moneda';
import { useTextosComun } from './textos';

/**
 * Precio de un dominio (Figma B/02; Comprar dominio B/07): «$ 89.900 COP / año»
 * y debajo «Renueva a $ 89.900 / año». `sm` en listas de resultados y `lg` en
 * el resumen de compra. Números tabulares; decimales y separadores de la moneda (en pesos: «$ 89.900»).
 */
export interface PriceTagProps {
  /** Importe del primer año, en la unidad de la moneda (pesos, no centavos). */
  valor: number;
  /** Importe de la renovación; si no se pasa o es igual, no se muestra la línea. */
  renovacion?: number | null;
  /** Código ISO de la moneda del precio (la que cotiza el registrador); nunca se supone. */
  moneda: string;
  tamano?: 'sm' | 'lg';
  /** Muestra «Renueva a…» aunque sea igual al primer año (el diseño lo pide en la compra). */
  mostrarRenovacionSiempre?: boolean;
  className?: string;
}

/** «$ 89.900»: formato único de moneda (`formatMoneda`), con los decimales de la moneda. */
export function formatearPrecio(valor: number, moneda: string): string {
  return formatMoneda(valor, moneda);
}

export function PriceTag({ valor, renovacion, moneda, tamano = 'sm', mostrarRenovacionSiempre, className }: PriceTagProps) {
  const tx = useTextosComun();
  const grande = tamano === 'lg';
  const verRenovacion = typeof renovacion === 'number' && (mostrarRenovacionSiempre || renovacion !== valor);
  return (
    <span className={cn('inline-flex flex-col', className)}>
      <span className="inline-flex items-baseline gap-1 whitespace-nowrap">
        <span className={cn('font-semibold tabular-nums text-fg', grande ? 'text-[28px] leading-8' : 'text-sm leading-5')}>
          {formatearPrecio(valor, moneda)}
        </span>
        <span className={cn('text-fg-secondary', grande ? 'text-sm' : 'text-xs')}>
          {moneda} {tx('precio.porAnio')}
        </span>
      </span>
      {verRenovacion && (
        <span className="text-xs tabular-nums text-fg-muted">{tx('precio.renueva', { precio: formatearPrecio(renovacion!, moneda) })}</span>
      )}
    </span>
  );
}
