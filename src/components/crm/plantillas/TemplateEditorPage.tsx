'use client';

/**
 * Editor de plantilla a pantalla completa (/app/crm/plantillas/nueva y /[id]):
 * cabecera + editor (bloques | HTML) + vista previa del servidor.
 */

import { useState } from 'react';
import { Blocks, Code2 } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EmailBlockEditor } from '@/components/crm/email/editor/EmailBlockEditor';
import { EmailHtmlEditor } from '@/components/crm/email/EmailHtmlEditor';
import { EmailPreview } from '@/components/crm/email/EmailPreview';
import type { TemplateEngine } from '@/lib/services/crm/email/types';
import { TemplateEditorHeader } from './TemplateEditorHeader';
import { TestSendDialog } from './TestSendDialog';
import { useTemplateEditor } from './useTemplateEditor';
import { Button } from '@/components/ui/button';
import { TemplateContextPicker } from './TemplateContextPicker';
import { useTemplateText } from './useTemplateText';

export function TemplateEditorPage({ templateId }: { templateId?: string }) {
  const ed = useTemplateEditor(templateId);
  const tr = useTemplateText();
  const [testOpen, setTestOpen] = useState(false);

  if (ed.loading) {
    return (
      <div className="space-y-4 p-4" aria-busy="true" aria-label={tr("Cargando plantilla")}>
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-[60vh] w-full" />
      </div>
    );
  }
  if (ed.loadError) {
    return (
      <div className="p-4">
        <Alert variant="destructive">
          <AlertTitle> {tr("No se pudo cargar la plantilla")} </AlertTitle>
          <AlertDescription>{ed.loadError}</AlertDescription>
          <Button variant="outline" onClick={ed.retryLoad}>{tr('Reintentar')}</Button>
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
        canManage={ed.canManage}
        stats={ed.stats}
        onSave={() => void ed.save()}
        onDuplicate={() => void ed.duplicate()}
        onTestSend={() => { if (ed.canManage && !ed.dirty && !ed.saving && !ed.contextError) setTestOpen(true); }}
      />
      <TemplateContextPicker ids={ed.contextIds} onChange={ed.setContextIds} disabled={ed.saving} />
      <p className="text-xs text-fg-muted">{ed.sample ? tr('Contexto de ejemplo') : tr('Datos del contexto seleccionado')}</p>
      {ed.contextError && <div role="alert" className="flex items-center gap-2 rounded-lg border border-line-danger bg-danger-subtle p-3 text-sm text-danger-text">
        {tr('No se pudieron cargar las variables del contexto.')} <Button variant="outline" onClick={ed.retryContext}>{tr('Reintentar')}</Button>
      </div>}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Tabs value={ed.form.engine} onValueChange={(v) => switchEngine(v as TemplateEngine)}>
          <TabsList aria-label={tr("Modo de edición")}>
            <TabsTrigger value="blocks" className="gap-1"><Blocks className="h-3.5 w-3.5" aria-hidden="true" />  {tr("Bloques")} </TabsTrigger>
            <TabsTrigger value="html" className="gap-1"><Code2 className="h-3.5 w-3.5" aria-hidden="true" />  {tr("HTML")} </TabsTrigger>
          </TabsList>
          <TabsContent value="blocks" className="mt-3">
            <EmailBlockEditor value={ed.form.doc} onChange={(doc) => ed.patch({ doc })} context={ed.context} readOnly={!ed.canManage || ed.saving} heightClassName="h-[65vh]" />
          </TabsContent>
          <TabsContent value="html" className="mt-3">
            <EmailHtmlEditor value={ed.form.html} onChange={(html) => ed.patch({ html })} context={ed.context} readOnly={!ed.canManage || ed.saving} minHeight={520} text={tr} />
          </TabsContent>
        </Tabs>
        <EmailPreview data={ed.preview} loading={ed.previewLoading || ed.contextLoading} error={ed.previewError} heightClassName="h-[58vh]" text={tr} />
      </div>

      <TestSendDialog open={testOpen && ed.canManage} onOpenChange={setTestOpen} templateId={templateId ?? null} templateName={ed.form.name}
        canManage={ed.canManage && !ed.dirty && !ed.saving && !ed.contextError} contextIds={ed.contextIds} />
    </div>
  );
}
