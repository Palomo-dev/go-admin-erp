'use client';

import { Building2, Link2, Pencil } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { useTextosComun } from './textos';

/**
 * Origen de un valor en un sitio por sede (Figma D/02 InheritanceTag; editor
 * D/05-22/23 y Menú y navegación D/04-10):
 *
 * - `heredado`: «Heredado de la principal» (neutro, icono de enlace).
 * - `personalizado`: «Personalizado · Restablecer» (marca; «Restablecer»
 *   vuelve al valor del sitio principal).
 * - `sucursal`: «De la sucursal · solo lectura» (dato operativo de la sede).
 */
export type OrigenValor = 'heredado' | 'personalizado' | 'sucursal';

export interface InheritanceTagProps {
  origen: OrigenValor;
  /** Solo con `personalizado`: muestra «· Restablecer». */
  onRestablecer?: () => void;
  className?: string;
}

export function InheritanceTag({ origen, onRestablecer, className }: InheritanceTagProps) {
  const tx = useTextosComun();
  const base = 'inline-flex h-7 items-center gap-1.5 rounded-full px-3 text-[13px] leading-[18px]';
  if (origen === 'personalizado') {
    return (
      <span className={cn(base, 'bg-brand-tint text-brand-deep', className)}>
        <Pencil aria-hidden="true" className="size-3.5" strokeWidth={1.5} />
        {tx('herencia.personalizado')}
        {onRestablecer && (
          <>
            <span aria-hidden="true">·</span>
            <button
              type="button"
              onClick={onRestablecer}
              aria-label={tx('herencia.restablecerAria')}
              className="rounded-sm font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              {tx('herencia.restablecer')}
            </button>
          </>
        )}
      </span>
    );
  }
  const Icono = origen === 'heredado' ? Link2 : Building2;
  return (
    <span className={cn(base, 'bg-subtle text-fg-secondary', className)}>
      <Icono aria-hidden="true" className="size-3.5" strokeWidth={1.5} />
      {origen === 'heredado' ? tx('herencia.heredado') : tx('herencia.sucursal')}
    </span>
  );
}
