'use client';

import { AlignLeft, Image as ImageIcon, LayoutGrid, Link2, Minus, MoveVertical, Package, PenLine, Receipt, Share2, Square, Type, Variable } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { BLOCK_LABELS, BLOCK_TYPES, type BlockType } from '@/lib/services/crm/email/blocks';
import { cn } from '@/utils/Utils';

export const BLOCK_ICONS: Record<BlockType, LucideIcon> = {
  header: Square,
  text: Type,
  button: Link2,
  image: ImageIcon,
  divider: Minus,
  spacer: MoveVertical,
  columns: LayoutGrid,
  product_card: Package,
  quote_summary: Receipt,
  signature: PenLine,
  social: Share2,
  footer_legal: AlignLeft,
  variable: Variable,
};

interface Props {
  onInsert: (type: BlockType) => void;
  /** Restringe los tipos (p. ej. firma: text,image,social,divider). */
  allowed?: BlockType[];
  className?: string;
}

/** Paleta de bloques: clic (o Enter/Espacio) inserta al final del canvas. */
export function BlockPalette({ onInsert, allowed, className }: Props) {
  const types = allowed ? BLOCK_TYPES.filter((t) => allowed.includes(t)) : BLOCK_TYPES;
  return (
    <div className={cn('grid grid-cols-2 gap-2', className)} role="list" aria-label="Bloques disponibles">
      {types.map((type) => {
        const Icon = BLOCK_ICONS[type];
        return (
          <button
            key={type}
            type="button"
            role="listitem"
            onClick={() => onInsert(type)}
            className="flex flex-col items-center gap-1 rounded-md border border-gray-200 bg-white px-2 py-3 text-xs text-gray-700 transition-colors hover:border-blue-400 hover:bg-blue-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:border-blue-500 dark:hover:bg-blue-900/20"
            aria-label={`Insertar bloque ${BLOCK_LABELS[type]}`}
          >
            <Icon className="h-4 w-4 text-gray-500 dark:text-gray-400" aria-hidden="true" />
            <span>{BLOCK_LABELS[type]}</span>
          </button>
        );
      })}
    </div>
  );
}
