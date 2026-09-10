'use client';

/**
 * Estado del editor de plantillas: carga, formulario, vista previa con
 * debounce (POST /api/email/templates/preview), guardar (POST/PATCH),
 * duplicar y estadísticas.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from '@/components/ui/use-toast';
import { emptyDocument, safeParseBlockDocument, type BlockDocument } from '@/lib/services/crm/email/blocks';
import type { Template, TemplateEngine, TemplateKind } from '@/lib/services/crm/email/types';
import { sampleContext, type RenderContext } from '@/lib/services/crm/email/variables';
import { createTemplate, duplicateTemplate, getTemplate, getVariables, previewEmail, updateTemplate } from '@/components/crm/email/emailApi';
import type { EmailPreviewData } from '@/components/crm/email/EmailPreview';

export interface TemplateForm {
  name: string;
  kind: TemplateKind;
  subject: string;
  preheader: string;
  description: string;
  is_active: boolean;
  engine: TemplateEngine;
  doc: BlockDocument;
  html: string;
}

export interface TemplateStats { sent: number; opened: number; clicked: number; bounced: number }

const EMPTY: TemplateForm = { name: '', kind: 'transactional', subject: '', preheader: '', description: '', is_active: true, engine: 'blocks', doc: emptyDocument(), html: '' };

function fromTemplate(t: Template): TemplateForm {
  const parsed = t.blocks_json ? safeParseBlockDocument(t.blocks_json) : null;
  return {
    name: t.name,
    kind: (t.kind ?? 'transactional') as TemplateKind,
    subject: t.subject ?? '',
    preheader: t.preheader ?? '',
    description: t.description ?? '',
    is_active: t.is_active,
    engine: t.engine === 'html' ? 'html' : 'blocks',
    doc: parsed?.ok ? parsed.doc : emptyDocument(),
    html: t.body_html ?? '',
  };
}

export function useTemplateEditor(templateId?: string) {
  const router = useRouter();
  const [template, setTemplate] = useState<Template | null>(null);
  const [form, setForm] = useState<TemplateForm>(EMPTY);
  const [loading, setLoading] = useState(!!templateId);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [stats, setStats] = useState<TemplateStats | null>(null);
  const [context, setContext] = useState<RenderContext | null>(null);
  const [preview, setPreview] = useState<EmailPreviewData | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const previewSeq = useRef(0);

  useEffect(() => {
    let cancelled = false;
    getVariables().then((r) => { if (!cancelled) setContext(r.data.values); }).catch(() => { if (!cancelled) setContext(sampleContext()); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!templateId) { setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    getTemplate(templateId, true)
      .then((r) => {
        if (cancelled) return;
        setTemplate(r.data);
        setForm(fromTemplate(r.data));
        setStats(r.stats ?? null);
        setDirty(false);
      })
      .catch((err: Error) => { if (!cancelled) setLoadError(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [templateId]);

  const patch = useCallback((p: Partial<TemplateForm>) => {
    setForm((f) => ({ ...f, ...p }));
    setDirty(true);
  }, []);

  // Vista previa con debounce sobre el contenido/asunto/preheader.
  useEffect(() => {
    if (loading) return;
    const seq = ++previewSeq.current;
    const handle = setTimeout(async () => {
      setPreviewLoading(true);
      try {
        const body = form.engine === 'blocks' ? { blocks: form.doc } : { html: form.html };
        const r = await previewEmail({ ...body, subject: form.subject, preheader: form.preheader });
        if (seq !== previewSeq.current) return;
        setPreview({ html: r.data.html, text: r.data.text, subject: r.data.subject, preheader: r.data.preheader, missing: r.data.missing_variables });
        setPreviewError(null);
      } catch (err) {
        if (seq !== previewSeq.current) return;
        setPreviewError(err instanceof Error ? err.message : 'No se pudo generar la vista previa');
      } finally {
        if (seq === previewSeq.current) setPreviewLoading(false);
      }
    }, 600);
    return () => clearTimeout(handle);
  }, [form.engine, form.doc, form.html, form.subject, form.preheader, loading]);

  const validate = (): string | null => {
    if (!form.name.trim()) return 'El nombre es obligatorio';
    if (!form.subject.trim()) return 'El asunto es obligatorio';
    if (form.engine === 'blocks' && form.doc.blocks.length === 0) return 'Añade al menos un bloque';
    if (form.engine === 'html' && !form.html.trim()) return 'El HTML está vacío';
    return null;
  };

  const save = useCallback(async (): Promise<Template | null> => {
    const err = validate();
    if (err) { toast({ title: 'Revisa la plantilla', description: err, variant: 'destructive' }); return null; }
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        name: form.name.trim(), kind: form.kind, subject: form.subject, preheader: form.preheader, description: form.description || null,
        is_active: form.is_active, engine: form.engine, ...(form.engine === 'blocks' ? { blocks_json: form.doc } : { body_html: form.html }),
      };
      const r = templateId ? await updateTemplate(templateId, body) : await createTemplate(body);
      setTemplate(r.data);
      setForm(fromTemplate(r.data));
      setDirty(false);
      toast({ title: templateId ? 'Plantilla guardada' : 'Plantilla creada', description: `${r.data.name} · v${r.data.version}` });
      if (!templateId) router.replace(`/app/crm/plantillas/${r.data.id}`);
      return r.data;
    } catch (e) {
      toast({ title: 'No se pudo guardar', description: e instanceof Error ? e.message : 'Error', variant: 'destructive' });
      return null;
    } finally {
      setSaving(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, templateId, router]);

  const duplicate = useCallback(async () => {
    if (!templateId) return;
    try {
      const r = await duplicateTemplate(templateId);
      toast({ title: 'Plantilla duplicada', description: r.data.name });
      router.push(`/app/crm/plantillas/${r.data.id}`);
    } catch (e) {
      toast({ title: 'No se pudo duplicar', description: e instanceof Error ? e.message : 'Error', variant: 'destructive' });
    }
  }, [templateId, router]);

  return { template, form, patch, loading, loadError, saving, dirty, stats, context, preview, previewLoading, previewError, save, duplicate, isSystem: !!template?.metadata?.is_system };
}
