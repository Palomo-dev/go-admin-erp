'use client';

import { Check } from 'lucide-react';
import { cn } from '@/utils/Utils';

/**
 * Chip que se prende y se apaga (`aria-pressed`) bajo el buscador de los
 * diálogos del documento: «Persona», «Empresa», «Solo activos», «Con saldo
 * por cobrar», «Con stock», «Solo del proveedor». El filtro se aplica al
 * instante. Activo: tinte de marca con ✓ (Figma `Chip Variant=filter`).
 */
export interface ChipAlternableProps {
  etiqueta: string;
  activo: boolean;
  onAlternar: () => void;
  className?: string;
}

export function ChipAlternable({ etiqueta, activo, onAlternar, className }: ChipAlternableProps) {
  return (
    <button
      type="button"
      aria-pressed={activo}
      onClick={onAlternar}
      className={cn(
        'inline-flex h-7 shrink-0 items-center gap-1 rounded-full border px-2.5 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
        activo ? 'border-line-brand bg-brand-tint text-brand-deep hover:bg-brand-tint-hover' : 'border-line-strong bg-surface text-fg-secondary hover:bg-hover',
        className,
      )}
    >
      {activo && <Check aria-hidden="true" className="size-3.5" strokeWidth={2} />}
      {etiqueta}
    </button>
  );
}
