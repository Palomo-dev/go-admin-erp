'use client';

import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { Checkbox } from '@/components/ui/checkbox';
import { RowActionsMenu } from './RowActionsMenu';
import type { AccionFila } from './acciones';

/**
 * Tarjeta de listado móvil (Figma `ListCard` 580:277858): icono de la entidad
 * en caja tintada de 40 px, título (1 línea), subtítulo, meta, valor y badge
 * de estado a la derecha y «⋯» que abre la hoja de acciones.
 *
 * Toda la tarjeta abre el detalle (el título es el botón y estira su área a la
 * tarjeta); la casilla y el «⋯» quedan por encima y no la disparan. En modo
 * selección la tarjeta gana la casilla y el borde de marca de 2 px.
 */
export interface ListCardProps {
  icono: LucideIcon;
  titulo: string;
  subtitulo?: ReactNode;
  meta?: ReactNode;
  /** Importe o cifra a la derecha («$ 12,5 M»). */
  valor?: ReactNode;
  /** Normalmente `<StatusBadge tamano="sm" />`. */
  estado?: ReactNode;
  onClick?: () => void;
  acciones?: readonly AccionFila[];
  /** Muestra la casilla (modo selección múltiple). */
  seleccionable?: boolean;
  seleccionado?: boolean;
  onSeleccionChange?: (seleccionado: boolean) => void;
  className?: string;
}

export function ListCard({
  icono: Icono,
  titulo,
  subtitulo,
  meta,
  valor,
  estado,
  onClick,
  acciones,
  seleccionable,
  seleccionado,
  onSeleccionChange,
  className,
}: ListCardProps) {
  return (
    <div
      className={cn(
        'relative flex items-center gap-3 rounded-xl bg-surface py-3 pl-3 pr-2 transition-colors',
        seleccionado ? 'border-2 border-line-brand' : 'border border-line',
        onClick && 'hover:bg-hover has-[button[data-principal]:focus-visible]:ring-2 has-[button[data-principal]:focus-visible]:ring-brand',
        className,
      )}
    >
      {seleccionable && (
        <Checkbox
          checked={!!seleccionado}
          onCheckedChange={(v) => onSeleccionChange?.(v === true)}
          aria-label={`Seleccionar ${titulo}`}
          className="relative z-10 size-[18px] rounded"
        />
      )}
      <div aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-brand-tint text-brand">
        <Icono className="size-5" strokeWidth={1.5} />
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        {onClick ? (
          <button
            type="button"
            data-principal=""
            onClick={onClick}
            className="truncate text-left text-sm font-medium leading-5 text-fg outline-none after:absolute after:inset-0 after:rounded-xl after:content-['']"
          >
            {titulo}
          </button>
        ) : (
          <span className="truncate text-sm font-medium leading-5 text-fg">{titulo}</span>
        )}
        {subtitulo && <span className="line-clamp-2 text-[13px] leading-[18px] text-fg-secondary">{subtitulo}</span>}
        {meta && <span className="truncate text-xs font-medium leading-4 text-fg-muted">{meta}</span>}
      </div>

      {(valor !== undefined || estado) && (
        <div className="flex shrink-0 flex-col items-end gap-1">
          {valor !== undefined && <span className="whitespace-nowrap text-sm font-medium leading-5 text-fg tabular-nums">{valor}</span>}
          {estado}
        </div>
      )}

      {acciones && acciones.length > 0 && (
        <div className="relative z-10">
          <RowActionsMenu acciones={acciones} titulo={titulo} />
        </div>
      )}
    </div>
  );
}
