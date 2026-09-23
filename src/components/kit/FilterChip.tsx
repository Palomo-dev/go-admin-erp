'use client';

import { X } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { useKitT } from './useIdiomaKit';

/**
 * Chip de filtro activo (Figma `Chip Variant=filter`): tinte de marca, texto
 * profundo y «×» para quitarlo. Va debajo de la fila del buscador, nunca dentro
 * del panel.
 */
export interface FilterChipProps {
  /** «Estado: Activos». */
  etiqueta: string;
  onQuitar: () => void;
  className?: string;
}

export function FilterChip({ etiqueta, onQuitar, className }: FilterChipProps) {
  const t = useKitT();
  return (
    <span
      className={cn(
        'inline-flex h-7 max-w-full shrink-0 items-center gap-1 rounded-full border border-line-brand bg-brand-tint pl-2.5 pr-1 text-xs font-medium text-brand-deep',
        className,
      )}
    >
      <span className="truncate">{etiqueta}</span>
      <button
        type="button"
        onClick={onQuitar}
        aria-label={t('filtros.quitar', { etiqueta })}
        className="flex size-5 shrink-0 items-center justify-center rounded-full hover:bg-brand-tint-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
      >
        <X aria-hidden="true" className="size-3.5" strokeWidth={2} />
      </button>
    </span>
  );
}
