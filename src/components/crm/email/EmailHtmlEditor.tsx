'use client';

/**
 * Editor de HTML crudo: textarea monoespaciada con Tab → 2 espacios,
 * inserción de variables en el cursor y contador. El HTML se sanitiza en el
 * servidor al guardar/enviar (sanitize-html); aquí solo se edita.
 */

import { useId, useRef, type KeyboardEvent } from 'react';
import { Label } from '@/components/ui/label';
import type { RenderContext } from '@/lib/services/crm/email/variables';
import { cn } from '@/utils/Utils';
import { VariablePicker } from './VariablePicker';

interface Props {
  value: string;
  onChange: (html: string) => void;
  context?: RenderContext | null;
  readOnly?: boolean;
  minHeight?: number;
  className?: string;
  label?: string;
}

export function EmailHtmlEditor({ value, onChange, context, readOnly, minHeight = 360, className, label = 'HTML del correo' }: Props) {
  const id = useId();
  const ref = useRef<HTMLTextAreaElement>(null);

  const insertAtCursor = (text: string) => {
    const el = ref.current;
    if (!el) { onChange(`${value}${text}`); return; }
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    const next = `${value.slice(0, start)}${text}${value.slice(end)}`;
    onChange(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + text.length, start + text.length);
    });
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab' && !e.shiftKey && !readOnly) {
      e.preventDefault();
      insertAtCursor('  ');
    }
  };

  const lines = value ? value.split('\n').length : 0;

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={id} className="text-xs text-gray-600 dark:text-gray-300">{label}</Label>
        {!readOnly && <VariablePicker values={context ?? null} withDefault onInsert={insertAtCursor} />}
      </div>
      <textarea
        id={id}
        ref={ref}
        value={value}
        readOnly={readOnly}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        spellCheck={false}
        wrap="off"
        aria-describedby={`${id}-hint`}
        style={{ minHeight }}
        className="w-full resize-y rounded-md border border-gray-300 bg-gray-50 p-3 font-mono text-xs leading-5 text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
        placeholder={'<table role="presentation" width="100%">\n  <tr><td>Hola {{contact.first_name|hola}} …</td></tr>\n</table>'}
      />
      <p id={`${id}-hint`} className="text-[11px] text-gray-500 dark:text-gray-400">
        {lines} líneas · {value.length.toLocaleString('es-CO')} caracteres · Tab inserta 2 espacios · script/iframe/form se eliminan al guardar.
      </p>
    </div>
  );
}
