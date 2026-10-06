'use client';

/**
 * Editor de plantilla a pantalla completa (/app/crm/plantillas/nueva y /[id]):
 * cabecera + editor (bloques | HTML) + vista previa del servidor.
 */

import { useState } from 'react';
import { Blocks, Code2 } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { SegmentedControl } from '@/components/kit/SegmentedControl';
import { EmailBlockEditor } from '@/components/crm/email/editor/EmailBlockEditor';
import { EmailHtmlEditor } from '@/components/crm/email/EmailHtmlEditor';
import { EmailPreview } from '@/components/crm/email/EmailPreview';
import type { TemplateEngine } from '@/lib/services/crm/email/types';
import { TemplateEditorHeader } from './TemplateEditorHeader';
import { TestSendDialog } from './TestSendDialog';
import { useTemplateEditor } from './useTemplateEditor';

export function TemplateEditorPage({ templateId }: { templateId?: string }) {
  const ed = useTemplateEditor(templateId);
  const [testOpen, setTestOpen] = useState(false);

  if (ed.loading) {
    return (
      <div className="space-y-4 p-4" aria-busy="true" aria-label="Cargando plantilla">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-[60vh] w-full" />
      </div>
    );
  }
  if (ed.loadError) {
    return (
      <div className="p-4">
        <Alert variant="destructive">
          <AlertTitle>No se pudo cargar la plantilla</AlertTitle>
          <AlertDescription>{ed.loadError}</AlertDescription>
        </Alert>
      </div>
    );
  }

  const switchEngine = (engine: TemplateEngine) => {
    if (engine === ed.form.engine) return;
    if (engine === 'html' && !ed.form.html.trim() && ed.preview?.html) {
      // Punto de partida: el HTML renderizado de los bloques actuales.
      ed.patch({ engine, html: ed.preview.html });
      return;
    }
    ed.patch({ engine });
  };

  return (
    <div className="space-y-4 p-4">
      <TemplateEditorHeader
        form={ed.form}
        patch={ed.patch}
        context={ed.context}
        version={ed.template?.version ?? null}
        isSystem={ed.isSystem}
        isNew={!templateId}
        dirty={ed.dirty}
        saving={ed.saving}
        stats={ed.stats}
        onSave={() => void ed.save()}
        onDuplicate={() => void ed.duplicate()}
        onTestSend={() => setTestOpen(true)}
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        {/* Bloques / HTML: dos VISTAS del mismo cuerpo → control segmentado (regla de pestañas 2026-10-06). */}
        <div className="min-w-0">
          <SegmentedControl
            etiqueta="Modo de edición"
            valor={ed.form.engine}
            onValorChange={(v) => switchEngine(v)}
            opciones={[
              { valor: 'blocks' as TemplateEngine, etiqueta: 'Bloques', icono: Blocks },
              { valor: 'html' as TemplateEngine, etiqueta: 'HTML', icono: Code2 },
            ]}
          />
          <div className="mt-3">
            {ed.form.engine === 'html' && <EmailHtmlEditor value={ed.form.html} onChange={(html) => ed.patch({ html })} context={ed.context} minHeight={520} />}
            {ed.form.engine === 'blocks' && <EmailBlockEditor value={ed.form.doc} onChange={(doc) => ed.patch({ doc })} context={ed.context} heightClassName="h-[65vh]" />}
          </div>
        </div>
        <EmailPreview data={ed.preview} loading={ed.previewLoading} error={ed.previewError} heightClassName="h-[58vh]" />
      </div>

      <TestSendDialog open={testOpen} onOpenChange={setTestOpen} templateId={templateId ?? null} templateName={ed.form.name} />
    </div>
  );
}
