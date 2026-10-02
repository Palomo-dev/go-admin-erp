import { Badge, type BadgeProps } from '@/components/ui/badge';
import { cn } from '@/utils/Utils';
import type { TonoBadge } from './estadoTono';

/** Etiqueta de categoría o cuota con la receta existente, sin inventar un estado. */
export interface BadgeTonoProps extends Omit<BadgeProps, 'variant' | 'tono'> {
  tono: TonoBadge;
  /** 12/16 en Figma; conserva la geometría y el color de Badge. */
  tipografia?: 'actual' | 'figma';
}

export function BadgeTono({ tono, tipografia = 'figma', className, ...props }: BadgeTonoProps) {
  return <Badge {...props} tono={tono} className={cn(tipografia === 'figma' && 'text-xs leading-4', className)} />;
}
