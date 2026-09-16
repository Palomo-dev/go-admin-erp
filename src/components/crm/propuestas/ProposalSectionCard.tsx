'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Check, Loader2, Pencil, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { cn } from '@/utils/Utils';

/**
 * F10 — una sección narrativa de la propuesta: lectura con «Editar» en su
 * sitio; al guardar, el foco vuelve al botón «Editar» (brief §4).
 */
export interface ProposalSectionCardProps {
  sectionKey: string;
  title: string;
  content: string;
  /** Contenido extra bajo el texto (tabla de precios, resumen ROI…). */
  children?: React.ReactNode;
  /** Botón de acción propio de la sección (p. ej. «Calcular ROI»). */
  action?: React.ReactNode;
  disabled?: boolean;
  onSave: (content: string) => Promise<void>;
}

export function ProposalSectionCard({ sectionKey, title, content, children, action, disabled, onSave }: ProposalSectionCardProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(content);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const editButton = useRef<HTMLButtonElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const id = useId();

  useEffect(() => { if (!editing) setDraft(content); }, [content, editing]);
  useEffect(() => { if (editing) textarea.current?.focus(); }, [editing]);
  // El foco vuelve al disparador (brief §4), no al body: el botón «Editar» se
  // desmonta mientras se edita, así que se enfoca DESPUÉS de que React lo monte.
  const restoreFocus = useRef(false);
  useEffect(() => {
    if (!editing && restoreFocus.current) { restoreFocus.current = false; editButton.current?.focus(); }
  }, [editing]);

  const close = () => {
    restoreFocus.current = true;
    setEditing(false);
    setError(null);
  };

  const save = async () => {
    if (draft.trim().length === 0) { setError('El texto no puede quedar vacío.'); textarea.current?.focus(); return; }
    setSaving(true);
    setError(null);
    try {
      await onSave(draft.trim());
      close();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar');
      textarea.current?.focus();
    } finally {
      setSaving(false);
    }
  };

  return (
    <section aria-labelledby={`${id}-title`} className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
      <div className="flex items-start justify-between gap-3">
        <h3 id={`${id}-title`} className="text-sm font-semibold text-gray-900 dark:text-gray-100">{title}</h3>
        <div className="flex items-center gap-1.5 shrink-0">
          {action}
          {!editing && (
            <Button ref={editButton} type="button" variant="ghost" size="sm" className="h-8 px-2 text-gray-600 dark:text-gray-300" onClick={() => setEditing(true)} disabled={disabled} aria-label={`Editar ${title}`}>
              <Pencil className="h-3.5 w-3.5 mr-1" aria-hidden="true" />Editar
            </Button>
          )}
        </div>
      </div>
      {editing ? (
        <div className="mt-3 space-y-2">
          <Label htmlFor={`${id}-text`} className="sr-only">{title}</Label>
          <Textarea
            id={`${id}-text`}
            ref={textarea}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={Math.min(14, Math.max(4, draft.split('\n').length + 1))}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${id}-error` : undefined}
            className="text-sm bg-white dark:bg-gray-900"
            onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); setDraft(content); close(); } }}
          />
          {error && <p id={`${id}-error`} role="alert" className="text-xs text-red-700 dark:text-red-300">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => { setDraft(content); close(); }} disabled={saving}><X className="h-3.5 w-3.5 mr-1" aria-hidden="true" />Cancelar</Button>
            <Button type="button" size="sm" className="bg-blue-600 hover:bg-blue-700 text-white" onClick={save} disabled={saving}>
              {saving ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" aria-hidden="true" /> : <Check className="h-3.5 w-3.5 mr-1" aria-hidden="true" />}Guardar
            </Button>
          </div>
        </div>
      ) : (
        <p className={cn('mt-2 whitespace-pre-line text-sm leading-relaxed text-gray-700 dark:text-gray-300', !content && 'italic text-gray-500 dark:text-gray-400')} data-section={sectionKey}>
          {content || 'Sin contenido todavía.'}
        </p>
      )}
      {children}
    </section>
  );
}
