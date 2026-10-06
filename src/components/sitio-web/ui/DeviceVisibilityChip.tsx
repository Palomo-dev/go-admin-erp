'use client';

import { EyeOff } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { resumirVisibilidad, type VisibilidadDispositivos } from './visibilidadDispositivo';
import { useTextosComun } from './textos';

/**
 * Chip «Oculta en celular» / «Solo en computador» (Figma «figma-estilo» 09).
 * Va como `detalle` de `SortableRow` (10) y en la lista de secciones del
 * editor. Si la sección se ve en todos los dispositivos no pinta nada.
 */
export interface DeviceVisibilityChipProps {
  visibilidad: VisibilidadDispositivos;
  className?: string;
}

export function DeviceVisibilityChip({ visibilidad, className }: DeviceVisibilityChipProps) {
  const tx = useTextosComun();
  const r = resumirVisibilidad(visibilidad);
  if (r.tipo === 'todos') return null;
  const texto =
    r.tipo === 'ninguno'
      ? tx('dispositivos.ninguno')
      : r.tipo === 'oculta'
        ? tx(`dispositivos.ocultaEn.${r.dispositivo}`)
        : tx(`dispositivos.soloEn.${r.dispositivo}`);
  return (
    <span
      className={cn(
        'inline-flex h-[22px] max-w-full items-center gap-1 rounded-md border border-line bg-subtle px-1.5 text-xs font-medium text-fg-secondary',
        className,
      )}
    >
      <EyeOff aria-hidden="true" className="size-3.5 shrink-0" strokeWidth={1.5} />
      <span className="truncate">{texto}</span>
    </span>
  );
}
