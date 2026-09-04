'use client';

import { useRef, useState } from 'react';
import { Bold, Italic, Link as LinkIcon } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { BaseFieldProps } from './types';

/**
 * Editor de texto enriquecido mínimo (F0.3 — Ronda 2).
 *
 * Produce HTML simple (`<strong>`, `<em>`, `<a href="...">`) que el sitio
 * renderiza vía `dangerouslySetInnerHTML` en los componentes `text_block`.
 *
 * No es un WYSIWYG completo: es un textarea con toolbar que inserta tags
 * HTML alrededor de la selección. Suficiente para negritas, cursivas y
 * enlaces sin añadir dependencias externas.
 */
export default function RichTextField({ field, value, onChange }: BaseFieldProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [showLinkDialog, setShowLinkDialog] = useState(false);
  const [linkUrl, setLinkUrl] = useState('https://');
  const [pendingSelection, setPendingSelection] = useState<{ start: number; end: number } | null>(null);

  const wrapSelection = (openTag: string, closeTag: string) => {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const current = typeof value === 'string' ? value : '';
    const selected = current.slice(start, end);
    const newValue = current.slice(0, start) + openTag + selected + closeTag + current.slice(end);
    onChange(newValue);
    // Restaurar foco y selección tras el re-render
    requestAnimationFrame(() => {
      el.focus();
      const newStart = start + openTag.length;
      el.setSelectionRange(newStart, newStart + selected.length);
    });
  };

  const handleBold = () => wrapSelection('<strong>', '</strong>');
  const handleItalic = () => wrapSelection('<em>', '</em>');

  const handleLink = () => {
    const el = textareaRef.current;
    if (!el) return;
    setPendingSelection({ start: el.selectionStart, end: el.selectionEnd });
    setLinkUrl('https://');
    setShowLinkDialog(true);
  };

  const confirmLink = () => {
    if (!pendingSelection || !linkUrl.trim()) return;
    const current = typeof value === 'string' ? value : '';
    const selected = current.slice(pendingSelection.start, pendingSelection.end);
    const tag = `<a href="${linkUrl.trim()}">${selected || linkUrl.trim()}</a>`;
    const newValue = current.slice(0, pendingSelection.start) + tag + current.slice(pendingSelection.end);
    onChange(newValue);
    setShowLinkDialog(false);
    setPendingSelection(null);
  };

  const text = typeof value === 'string' ? value : '';

  return (
    <div className="space-y-1.5">
      {field.label && (
        <label className="text-xs font-medium text-gray-600 dark:text-gray-400">{field.label}</label>
      )}
      <div className="flex items-center gap-1 rounded-t-md border border-b-0 border-gray-200 bg-gray-50 px-1.5 py-1 dark:border-gray-700 dark:bg-gray-800">
        <button
          type="button"
          onClick={handleBold}
          className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
          title="Negrita"
          aria-label="Negrita"
        >
          <Bold className="h-3.5 w-3.5 text-gray-600 dark:text-gray-400" />
        </button>
        <button
          type="button"
          onClick={handleItalic}
          className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
          title="Cursiva"
          aria-label="Cursiva"
        >
          <Italic className="h-3.5 w-3.5 text-gray-600 dark:text-gray-400" />
        </button>
        <button
          type="button"
          onClick={handleLink}
          className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
          title="Enlace"
          aria-label="Enlace"
        >
          <LinkIcon className="h-3.5 w-3.5 text-gray-600 dark:text-gray-400" />
        </button>
      </div>
      <textarea
        ref={textareaRef}
        value={text}
        onChange={(e) => onChange(e.target.value)}
        placeholder={field.placeholder || 'Escribe el contenido...'}
        rows={6}
        className="w-full rounded-b-md border border-gray-200 px-3 py-2 text-xs text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
      />
      {field.helpText && (
        <p className="text-[10px] text-gray-400 dark:text-gray-500">{field.helpText}</p>
      )}

      {/* Diálogo para URL del enlace (reemplaza window.prompt) */}
      <Dialog open={showLinkDialog} onOpenChange={setShowLinkDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Insertar enlace</DialogTitle>
            <DialogDescription>Ingresa la URL del enlace.</DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Input
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              placeholder="https://"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') confirmLink();
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowLinkDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={confirmLink} disabled={!linkUrl.trim()}>
              Insertar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
