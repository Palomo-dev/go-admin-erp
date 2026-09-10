'use client';

/**
 * Editor visual de bloques (FASE-07 §5.2): paleta | canvas | propiedades.
 * Controlado: `value` (BlockDocument) + `onChange`. Undo/redo (50 pasos) con
 * Ctrl+Z / Ctrl+Shift+Z dentro del editor. Reutilizado por TemplateEditorPage,
 * ComposeEmailDialogFull y SignatureEditor (con `allowed`).
 */

import { useEffect, useRef, type KeyboardEvent } from 'react';
import { Redo2, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { BlockDocument, BlockType } from '@/lib/services/crm/email/blocks';
import type { RenderContext } from '@/lib/services/crm/email/variables';
import { cn } from '@/utils/Utils';
import { BlockCanvas } from './BlockCanvas';
import { BlockPalette } from './BlockPalette';
import { BlockPropertiesPanel } from './BlockPropertiesPanel';
import { useBlockDocument } from './useBlockDocument';

export interface EmailBlockEditorProps {
  value: BlockDocument;
  onChange: (doc: BlockDocument) => void;
  /** Contexto real o de ejemplo para mostrar valores en el canvas. */
  context: RenderContext | null;
  readOnly?: boolean;
  /** Restringe los tipos disponibles (p. ej. firma). */
  allowed?: BlockType[];
  className?: string;
  /** Alto del área de trabajo (clase Tailwind), por defecto `h-[70vh]`. */
  heightClassName?: string;
}

export function EmailBlockEditor({ value, onChange, context, readOnly, allowed, className, heightClassName = 'h-[70vh]' }: EmailBlockEditorProps) {
  const api = useBlockDocument(value, onChange);
  const lastEmitted = useRef<BlockDocument>(api.doc);

  // Sincroniza cambios externos (plantilla cargada, borrador IA) sin romper el historial interno.
  useEffect(() => {
    if (value !== api.doc && value !== lastEmitted.current) api.replace(value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  useEffect(() => {
    lastEmitted.current = api.doc;
  }, [api.doc]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (readOnly) return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); api.undo(); }
    else if (mod && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) { e.preventDefault(); api.redo(); }
  };

  return (
    <div className={cn('flex flex-col gap-2', className)} onKeyDown={onKeyDown}>
      <div className="flex items-center justify-between rounded-md border border-gray-200 bg-white px-2 py-1 dark:border-gray-700 dark:bg-gray-800">
        <span className="text-xs text-gray-500 dark:text-gray-400">{api.doc.blocks.length} bloque{api.doc.blocks.length === 1 ? '' : 's'}</span>
        <div className="flex items-center gap-1">
          <Button type="button" size="sm" variant="ghost" onClick={api.undo} disabled={!api.canUndo || readOnly} aria-label="Deshacer (Ctrl+Z)" className="h-7 px-2">
            <Undo2 className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={api.redo} disabled={!api.canRedo || readOnly} aria-label="Rehacer (Ctrl+Shift+Z)" className="h-7 px-2">
            <Redo2 className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>
        </div>
      </div>
      <div className={cn('grid gap-3 lg:grid-cols-[180px_minmax(0,1fr)_280px]', heightClassName)}>
        <ScrollArea className="rounded-md border border-gray-200 bg-white p-2 dark:border-gray-700 dark:bg-gray-800">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Bloques</h3>
          {readOnly ? <p className="text-xs text-gray-400">Solo lectura</p> : <BlockPalette allowed={allowed} onInsert={(t) => api.insert(t)} />}
        </ScrollArea>
        <ScrollArea className="rounded-md border border-gray-200 dark:border-gray-700">
          <BlockCanvas
            doc={api.doc}
            selectedId={api.selectedId}
            ctx={context}
            onSelect={api.select}
            onMove={api.move}
            onMoveBy={api.moveBy}
            onDuplicate={api.duplicate}
            onRemove={api.remove}
            readOnly={readOnly}
          />
        </ScrollArea>
        <ScrollArea className="rounded-md border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-800">
          <BlockPropertiesPanel
            selected={api.selected}
            settings={api.doc.settings}
            ctx={context}
            onChangeBlock={(props) => api.selectedId && api.update(api.selectedId, props)}
            onChangeSettings={api.updateSettings}
            readOnly={readOnly}
          />
        </ScrollArea>
      </div>
    </div>
  );
}
