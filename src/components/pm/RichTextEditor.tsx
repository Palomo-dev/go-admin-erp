'use client';

import React, { useRef, useEffect, useCallback } from 'react';
import {
  Bold,
  Italic,
  Underline,
  List,
  ListOrdered,
  AlignLeft,
  AlignCenter,
  AlignRight,
} from 'lucide-react';
import { cn } from '@/utils/Utils';

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  className?: string;
}

interface ToolbarButton {
  command: string;
  icon: React.ReactNode;
  title: string;
  arg?: string;
}

const TOOLBAR: ToolbarButton[] = [
  { command: 'bold', icon: <Bold className="h-3.5 w-3.5" />, title: 'Negrita' },
  { command: 'italic', icon: <Italic className="h-3.5 w-3.5" />, title: 'Cursiva' },
  { command: 'underline', icon: <Underline className="h-3.5 w-3.5" />, title: 'Subrayado' },
  { command: 'insertUnorderedList', icon: <List className="h-3.5 w-3.5" />, title: 'Viñetas' },
  { command: 'insertOrderedList', icon: <ListOrdered className="h-3.5 w-3.5" />, title: 'Numeración' },
  { command: 'justifyLeft', icon: <AlignLeft className="h-3.5 w-3.5" />, title: 'Alinear izquierda' },
  { command: 'justifyCenter', icon: <AlignCenter className="h-3.5 w-3.5" />, title: 'Centrar' },
  { command: 'justifyRight', icon: <AlignRight className="h-3.5 w-3.5" />, title: 'Alinear derecha' },
];

// Editor de texto enriquecido ligero basado en contentEditable (sin dependencias externas).
export function RichTextEditor({ value, onChange, placeholder, className }: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);

  // Sincroniza el contenido inicial/externo sin perder el cursor durante la edición
  useEffect(() => {
    const el = editorRef.current;
    if (el && el.innerHTML !== value) {
      el.innerHTML = value || '';
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const emitChange = useCallback(() => {
    if (editorRef.current) onChange(editorRef.current.innerHTML);
  }, [onChange]);

  const exec = useCallback((command: string, arg?: string) => {
    editorRef.current?.focus();
    document.execCommand(command, false, arg);
    emitChange();
  }, [emitChange]);

  const isEmpty = !value || value === '<br>' || value.replace(/<[^>]*>/g, '').trim() === '';

  return (
    <div className={cn('rounded-md border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 overflow-hidden', className)}>
      <div className="flex flex-wrap items-center gap-0.5 border-b border-gray-200 dark:border-gray-700 px-1.5 py-1 bg-white/60 dark:bg-gray-900/40">
        {TOOLBAR.map((btn, i) => (
          <React.Fragment key={btn.command}>
            {(i === 3 || i === 5) && <span className="mx-1 h-4 w-px bg-gray-200 dark:bg-gray-700" />}
            <button
              type="button"
              title={btn.title}
              onMouseDown={(e) => { e.preventDefault(); exec(btn.command, btn.arg); }}
              className="p-1.5 rounded text-gray-500 hover:bg-gray-200 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-100 transition-colors"
            >
              {btn.icon}
            </button>
          </React.Fragment>
        ))}
      </div>
      <div className="relative">
        {isEmpty && placeholder && (
          <span className="pointer-events-none absolute left-3 top-2 text-sm text-gray-400 dark:text-gray-500">{placeholder}</span>
        )}
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          onInput={emitChange}
          onBlur={emitChange}
          className="prose-sm max-w-none min-h-[80px] px-3 py-2 text-sm text-gray-700 dark:text-gray-200 focus:outline-none [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5"
        />
      </div>
    </div>
  );
}
