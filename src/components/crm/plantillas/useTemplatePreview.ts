'use client';
import { useEffect, useRef, useState } from 'react';
import { getVariables, previewEmail, type PreviewBody } from '@/components/crm/email/emailApi';
import type { RenderContext } from '@/lib/services/crm/email/variables';
import type { EmailPreviewData } from '@/components/crm/email/EmailPreview';
import type { TemplateForm } from './useTemplateEditor';
import { useTemplateText } from './useTemplateText';
export type TemplateContextIds = NonNullable<PreviewBody['context_ids']>;
/** El servidor distingue muestra explícita sin refs de contexto real; nunca hay fallback por error. */
export function useTemplatePreview(form: TemplateForm, loading: boolean, ids: TemplateContextIds, scope: string) {
  const tr = useTemplateText();
  const [context, setContext] = useState<RenderContext | null>(null);
  const [contextLoading, setContextLoading] = useState(true);
  const [contextError, setContextError] = useState<string | null>(null);
  const [sample, setSample] = useState(false);
  const [retry, setRetry] = useState(0);
  const [preview, setPreview] = useState<EmailPreviewData | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const revision = useRef(0);
  const contextKey = JSON.stringify(ids);

  useEffect(() => {
    const epoch = revision;
    let active = true;
    revision.current++;
    setContext(null); setContextError(null); setContextLoading(true); setSample(false);
    setPreview(null); setPreviewLoading(false); setPreviewError(null);
    if (!scope) { setContextLoading(false); return; }
    getVariables(JSON.parse(contextKey))
      .then((r) => { if (active) { setContext(r.data.values); setSample(r.data.sample === true); } })
      .catch((error) => { if (active) setContextError(error instanceof Error ? error.message : tr('No se pudieron cargar las variables del contexto.')); })
      .finally(() => { if (active) setContextLoading(false); });
    return () => { active = false; epoch.current++; };
  }, [contextKey, scope, retry, tr]);

  useEffect(() => {
    const epoch = revision;
    const current = ++revision.current;
    setPreview(null); setPreviewLoading(false); setPreviewError(null);
    if (loading || contextLoading || contextError || !context) return;
    const handle = setTimeout(async () => {
      setPreviewLoading(true);
      try {
        const body = form.engine === 'blocks' ? { blocks: form.doc } : { html: form.html };
        const r = await previewEmail({ ...body, subject: form.subject, preheader: form.preheader, context_ids: JSON.parse(contextKey) });
        if (current !== revision.current) return;
        setPreview({ html: r.data.html, text: r.data.text, subject: r.data.subject, preheader: r.data.preheader, missing: r.data.missing_variables });
      } catch (error) {
        if (current === revision.current) setPreviewError(error instanceof Error ? error.message : tr('No se pudo generar la vista previa.'));
      } finally { if (current === revision.current) setPreviewLoading(false); }
    }, 600);
    return () => { clearTimeout(handle); epoch.current++; };
  }, [form.engine, form.doc, form.html, form.subject, form.preheader, loading, contextLoading, contextError, context, contextKey, scope, tr]);

  return { context, contextLoading, contextError, sample, preview, previewLoading, previewError, retryContext: () => setRetry((n) => n + 1) };
}
