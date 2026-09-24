'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { EyeOff } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { clasesTonoFilaDato, type TonoFilaDato } from './tonosKit';
import { useKitT } from './useIdiomaKit';

/**
 * Fila etiqueta–valor (Figma `FilaDato` 680:406357, 6 tonos): «Subtotal ·
 * $ 120.000», «Cajero · Ana Ríos», «Diferencia · −$ 2.000». La etiqueta a la
 * izquierda, el valor a la derecha con números tabulares.
 *
 * Es un par `<dt>`/`<dd>`: va dentro de `ListaDatos` (un `<dl>`), de
 * `ResumenTotales`, de `Tarjeta` o de `ResultadoOperacion`.
 *
 * `oculto` es el cierre ciego de cajas: el valor no se pinta y en su lugar
 * sale «Oculto» con un ojo tachado.
 */
export { clasesTonoFilaDato, type TonoFilaDato };

export interface FilaDatoProps {
  etiqueta: ReactNode;
  valor?: ReactNode;
  tono?: TonoFilaDato;
  /** Sub-fila (impuesto por tarifa bajo «Impuestos», retenciones). */
  sangria?: 0 | 1 | 2;
  /** Segunda línea atenuada bajo la etiqueta («Base $ 100.000»). */
  descripcion?: ReactNode;
  /** Icono, badge o botón pequeño a la derecha del valor. */
  accesorio?: ReactNode;
  /** El valor no se muestra (cierre ciego). */
  oculto?: boolean;
  /** `lg` para el total. */
  tamano?: 'sm' | 'md' | 'lg';
  /** El valor es un enlace (tono `enlace`). */
  href?: string;
  /** Divisor encima (antes del total). */
  separadorAntes?: boolean;
  className?: string;
}

const TAMANO = {
  sm: { fila: 'min-h-7 text-[13px]', valor: '' },
  md: { fila: 'min-h-8 text-sm', valor: '' },
  lg: { fila: 'min-h-10 text-base', valor: 'text-lg font-semibold leading-7' },
} as const;

const SANGRIA = { 0: '', 1: 'pl-4', 2: 'pl-8' } as const;

export function FilaDato({
  etiqueta,
  valor,
  tono = 'neutro',
  sangria = 0,
  descripcion,
  accesorio,
  oculto,
  tamano = 'md',
  href,
  separadorAntes,
  className,
}: FilaDatoProps) {
  const t = useKitT();
  const tonoFinal = href && tono === 'neutro' ? 'enlace' : tono;
  const contenidoValor = oculto ? (
    <span className="inline-flex items-center gap-1 text-fg-muted">
      <EyeOff aria-hidden="true" className="size-3.5" strokeWidth={1.5} />
      {t('filaDato.oculto')}
    </span>
  ) : href ? (
    <Link href={href} className="rounded underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">
      {valor}
    </Link>
  ) : (
    valor
  );
  return (
    <div
      className={cn(
        'flex items-start justify-between gap-3 py-1',
        TAMANO[tamano].fila,
        SANGRIA[sangria],
        separadorAntes && 'mt-1 border-t border-line pt-2',
        className,
      )}
    >
      <dt className={cn('min-w-0 text-fg-secondary', tamano === 'lg' && 'font-semibold text-fg')}>
        <span className="block truncate">{etiqueta}</span>
        {descripcion && <span className="block text-xs leading-4 text-fg-muted">{descripcion}</span>}
      </dt>
      <dd className={cn('flex shrink-0 items-center gap-1.5 text-right tabular-nums', clasesTonoFilaDato(oculto ? 'neutro' : tonoFinal), TAMANO[tamano].valor)}>
        {contenidoValor ?? '—'}
        {accesorio}
      </dd>
    </div>
  );
}

/** Contenedor `<dl>` de varias `FilaDato`. */
export interface ListaDatosProps {
  children: ReactNode;
  /** Nombre accesible si no hay un título visible cerca. */
  etiqueta?: string;
  /** Divisor fino entre filas (desglose de caja). */
  divisores?: boolean;
  className?: string;
}

export function ListaDatos({ children, etiqueta, divisores, className }: ListaDatosProps) {
  return (
    <dl aria-label={etiqueta} className={cn('flex flex-col', divisores && 'divide-y divide-line', className)}>
      {children}
    </dl>
  );
}
