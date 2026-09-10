'use client';

/**
 * Canvas del editor de bloques: lista ordenable (@dnd-kit/sortable) con
 * selección, mover con teclado (↑/↓ en la barra del bloque), duplicar y
 * eliminar. La vista es aproximada (BlockPreview); la definitiva la genera el
 * servidor en EmailPreview.
 */

import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ArrowDown, ArrowUp, Copy, GripVertical, Trash2 } from 'lucide-react';
import type { Block, BlockDocument } from '@/lib/services/crm/email/blocks';
import { BLOCK_LABELS } from '@/lib/services/crm/email/blocks';
import type { RenderContext } from '@/lib/services/crm/email/variables';
import { cn } from '@/utils/Utils';
import { BlockPreview } from './blocks/BlockPreview';

interface Props {
  doc: BlockDocument;
  selectedId: string | null;
  ctx: RenderContext | null;
  onSelect: (id: string | null) => void;
  onMove: (from: number, to: number) => void;
  onMoveBy: (id: string, delta: number) => void;
  onDuplicate: (id: string) => void;
  onRemove: (id: string) => void;
  readOnly?: boolean;
}

interface ItemProps {
  block: Block;
  index: number;
  total: number;
  selected: boolean;
  settings: BlockDocument['settings'];
  ctx: RenderContext | null;
  readOnly?: boolean;
  onSelect: (id: string) => void;
  onMoveBy: (id: string, delta: number) => void;
  onDuplicate: (id: string) => void;
  onRemove: (id: string) => void;
}

function SortableBlock({ block, index, total, selected, settings, ctx, readOnly, onSelect, onMoveBy, onDuplicate, onRemove }: ItemProps) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: block.id, disabled: readOnly });
  const style = { transform: CSS.Transform.toString(transform), transition };
  const label = BLOCK_LABELS[block.type];

  return (
    <div
      ref={setNodeRef}
      style={style}
      role="option"
      aria-selected={selected}
      aria-label={`Bloque ${index + 1} de ${total}: ${label}`}
      tabIndex={0}
      onClick={() => onSelect(block.id)}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(block.id); }
        if (!readOnly && (e.key === 'Delete' || e.key === 'Backspace')) { e.preventDefault(); onRemove(block.id); }
        if (!readOnly && e.altKey && e.key === 'ArrowUp') { e.preventDefault(); onMoveBy(block.id, -1); }
        if (!readOnly && e.altKey && e.key === 'ArrowDown') { e.preventDefault(); onMoveBy(block.id, 1); }
      }}
      className={cn(
        'group relative rounded-md border px-3 py-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
        selected ? 'border-blue-500 bg-blue-50/40 dark:border-blue-400 dark:bg-blue-900/10' : 'border-transparent hover:border-gray-300 dark:hover:border-gray-600',
        isDragging && 'opacity-60 shadow-lg',
      )}
    >
      {!readOnly && (
        <div
          className={cn(
            'absolute -top-3 right-2 z-10 flex items-center gap-0.5 rounded-md border border-gray-200 bg-white px-1 py-0.5 shadow-sm dark:border-gray-700 dark:bg-gray-800',
            selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100',
          )}
          onClick={(e) => e.stopPropagation()}
        >
          <span className="px-1 text-[10px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">{label}</span>
          <button ref={setActivatorNodeRef} type="button" {...attributes} {...listeners} aria-label={`Arrastrar bloque ${label}`} className="cursor-grab rounded p-1 text-gray-500 hover:bg-gray-100 active:cursor-grabbing dark:text-gray-300 dark:hover:bg-gray-700">
            <GripVertical className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          <button type="button" onClick={() => onMoveBy(block.id, -1)} disabled={index === 0} aria-label="Subir bloque" className="rounded p-1 text-gray-500 hover:bg-gray-100 disabled:opacity-30 dark:text-gray-300 dark:hover:bg-gray-700">
            <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          <button type="button" onClick={() => onMoveBy(block.id, 1)} disabled={index === total - 1} aria-label="Bajar bloque" className="rounded p-1 text-gray-500 hover:bg-gray-100 disabled:opacity-30 dark:text-gray-300 dark:hover:bg-gray-700">
            <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          <button type="button" onClick={() => onDuplicate(block.id)} aria-label="Duplicar bloque" className="rounded p-1 text-gray-500 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700">
            <Copy className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          <button type="button" onClick={() => onRemove(block.id)} aria-label="Eliminar bloque" className="rounded p-1 text-red-500 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/30">
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      )}
      <BlockPreview block={block} settings={settings} ctx={ctx} />
    </div>
  );
}

export function BlockCanvas({ doc, selectedId, ctx, onSelect, onMove, onMoveBy, onDuplicate, onRemove, readOnly }: Props) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const ids = doc.blocks.map((b) => b.id);

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from >= 0 && to >= 0) onMove(from, to);
  };

  return (
    <div className="flex justify-center rounded-lg p-4" style={{ background: doc.settings.bg }} onClick={() => onSelect(null)}>
      <div
        className="w-full rounded-lg bg-white shadow-sm dark:bg-gray-900"
        style={{ maxWidth: doc.settings.width, fontFamily: doc.settings.font }}
        onClick={(e) => e.stopPropagation()}
      >
        {doc.blocks.length === 0 ? (
          <div className="m-4 rounded-md border-2 border-dashed border-gray-300 p-10 text-center text-sm text-gray-500 dark:border-gray-600 dark:text-gray-400">
            Añade bloques desde la paleta para construir el correo.
          </div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={ids} strategy={verticalListSortingStrategy}>
              <div role="listbox" aria-label="Bloques del correo" className="space-y-2 p-4">
                {doc.blocks.map((b, i) => (
                  <SortableBlock
                    key={b.id}
                    block={b}
                    index={i}
                    total={doc.blocks.length}
                    selected={b.id === selectedId}
                    settings={doc.settings}
                    ctx={ctx}
                    readOnly={readOnly}
                    onSelect={onSelect}
                    onMoveBy={onMoveBy}
                    onDuplicate={onDuplicate}
                    onRemove={onRemove}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>
    </div>
  );
}
