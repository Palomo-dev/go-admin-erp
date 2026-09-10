'use client';

/**
 * Firma personal del usuario (profiles.metadata.email_signature_html):
 * RichTextEditor + variables + vista previa con contexto de ejemplo. La usa el
 * bloque `signature` (source user_default).
 */

import { useEffect, useMemo, useState } from 'react';
import { Loader2, PenLine, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { RichTextEditor } from '@/components/shared/RichTextEditor';
import { VariablePicker } from '@/components/crm/email/VariablePicker';
import { renderVariables, sampleContext } from '@/lib/services/crm/email/variables';

interface Props {
  value: string;
  onSave: (html: string) => Promise<boolean | null>;
  busy: boolean;
}

export function SignatureEditor({ value, onSave, busy }: Props) {
  const [html, setHtml] = useState(value);
  useEffect(() => setHtml(value), [value]);
  const ctx = useMemo(() => sampleContext(), []);
  const preview = useMemo(() => renderVariables(html, ctx, { escapeHtml: true }).out, [html, ctx]);
  const dirty = html !== value;

  return (
    <Card className="dark:border-gray-700 dark:bg-gray-800">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base"><PenLine className="h-4 w-4" aria-hidden="true" /> Mi firma</CardTitle>
        <CardDescription>Se añade automáticamente con el bloque “Firma”. Si la dejas vacía se usa nombre, cargo, empresa, teléfono y correo.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-600 dark:text-gray-300">Contenido</span>
              <VariablePicker values={ctx} onInsert={(expr) => setHtml((h) => `${h}${expr}`)} />
            </div>
            <RichTextEditor value={html} onChange={setHtml} minHeight={140} placeholder="Ana Gómez · Ejecutiva comercial · {{org.name}}" className="bg-white dark:bg-gray-900" />
          </div>
          <div className="space-y-2">
            <span className="text-xs text-gray-600 dark:text-gray-300">Vista previa (datos de ejemplo)</span>
            <div className="min-h-[140px] rounded-md border border-gray-200 bg-white p-3 text-sm text-gray-800 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100">
              {html.trim() ? <div dangerouslySetInnerHTML={{ __html: preview }} /> : <p className="text-gray-400">Sin firma personalizada: se usará la firma automática.</p>}
            </div>
          </div>
        </div>
        <div className="flex justify-end">
          <Button type="button" size="sm" onClick={() => onSave(html)} disabled={!dirty || busy} className="gap-1">
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Save className="h-3.5 w-3.5" aria-hidden="true" />} Guardar firma
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
