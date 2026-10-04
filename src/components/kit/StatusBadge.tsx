'use client';

import type { LucideIcon } from 'lucide-react';
import { Badge, type TamanoBadge } from '@/components/ui/badge';
import { cn } from '@/utils/Utils';
import { resolverEstado, type AparienciaBadge, type TonoBadge } from './estadoTono';
import { useEtiquetaEstado } from './useIdiomaKit';

/**
 * Badge de estado (Figma `Badge` 7:70): el tono sale de la tabla única de
 * SISTEMA-BADGES.md §4, nunca de la pantalla. «Pagada» es verde en cobrar y en
 * pagar; «Anulada» es roja con contorno en el listado y en el detalle.
 *
 * ```tsx
 * <StatusBadge estado="paid" />                 // «Pagada», éxito · suave
 * <StatusBadge estado="Vencida 12 d" />         // peligro · suave, los días dentro
 * <StatusBadge estado="caliente" />             // peligro con punto (CRM)
 * ```
 */
export interface StatusBadgeProps {
  /** Valor del estado: en español («Pagada») o como lo guarda la BD (`paid`). */
  estado: string | null | undefined;
  /** Texto a mostrar si difiere del estado (género, plural, días). */
  etiqueta?: string;
  /** `sm` 22 px en tablas y tarjetas densas; `md` 24 px en cabeceras. */
  tamano?: TamanoBadge;
  /** Opt-in al texto 12/16 de Figma sin modificar la altura ni la receta de color. */
  tipografia?: 'actual' | 'figma';
  icono?: LucideIcon;
  /** Solo para excepciones documentadas en SISTEMA-BADGES.md. */
  tono?: TonoBadge;
  apariencia?: AparienciaBadge;
  className?: string;
}

export function StatusBadge({ estado, etiqueta, tamano = 'sm', tipografia = 'actual', icono, tono, apariencia, className }: StatusBadgeProps) {
  const etiquetaEstado = useEtiquetaEstado();
  const r = resolverEstado(estado);
  return (
    <Badge
      tono={tono ?? r.tono}
      apariencia={apariencia ?? r.apariencia}
      tamano={tamano}
      punto={r.punto}
      icono={icono}
      className={cn(tipografia === 'figma' && 'text-xs leading-4', className)}
    >
      {etiqueta ?? etiquetaEstado(estado)}
    </Badge>
  );
}
