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
import { createTemplate, duplicateTemplate, getTemplate, listTemplates, updateTemplate } from '@/components/crm/email/emailApi';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { useTemplatePreview, type TemplateContextIds } from './useTemplatePreview';
import { useTemplateText } from './useTemplateText';

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
  const tr = useTemplateText();
  const { organization } = useOrganization(); const orgId = organization?.id ?? null;
  const scope = `${orgId ?? ''}:${templateId ?? 'new'}`;
  const currentScope = useRef(scope); currentScope.current = scope;
  const [loadedScope, setLoadedScope] = useState('');
  const [canManage, setCanManage] = useState(false);
  const [contextIds, setContextIds] = useState<TemplateContextIds>({});
  const [reload, setReload] = useState(0);
  const pending = useRef(false);
  const [template, setTemplate] = useState<Template | null>(null);
  const [form, setForm] = useState<TemplateForm>(EMPTY);
  const [loading, setLoading] = useState(!!templateId);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [stats, setStats] = useState<TemplateStats | null>(null);
  const previewState = useTemplatePreview(form, loading || loadedScope !== scope, contextIds, orgId ? scope : '');

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setLoadError(null); setCanManage(false); setTemplate(null); setStats(null); setForm(EMPTY); setDirty(false);
    if (!orgId) { setLoading(false); return; }
    (templateId ? getTemplate(templateId, true) : listTemplates({ channel: 'email', pageSize: 1 }))
      .then((r) => {
        if (cancelled) return;
        setCanManage(r.can_manage === true); setLoadedScope(scope);
        if (!Array.isArray(r.data)) {
          setTemplate(r.data); setForm(fromTemplate(r.data));
          setStats('stats' in r ? r.stats ?? null : null);
        }
        setDirty(false);
      })
      .catch((err: Error) => { if (!cancelled) { setLoadedScope(scope); setLoadError(err.message); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [templateId, orgId, scope, reload]);

  useEffect(() => { setContextIds({}); }, [orgId, templateId]);

  const patch = useCallback((p: Partial<TemplateForm>) => {
    if (!canManage || loadedScope !== scope || pending.current) return;
    setForm((f) => ({ ...f, ...p }));
    setDirty(true);
  }, [canManage, loadedScope, scope]);

  const validate = useCallback((): string | null => {
    if (!form.name.trim()) return tr("El nombre es obligatorio");
    if (!form.subject.trim()) return tr("El asunto es obligatorio");
    if (form.engine === 'blocks' && form.doc.blocks.length === 0) return tr("Añade al menos un bloque");
    if (form.engine === 'html' && !form.html.trim()) return tr("El HTML está vacío");
    return null;
  }, [form, tr]);

  const save = useCallback(async (): Promise<Template | null> => {
    if (!canManage || loadedScope !== scope || pending.current) return null;
    const err = validate();
    if (err) { toast({ title: tr("Revisa la plantilla"), description: err, variant: 'destructive' }); return null; }
    pending.current = true; setSaving(true);
    try {
      const body: Record<string, unknown> = {
        name: form.name.trim(), kind: form.kind, subject: form.subject, preheader: form.preheader, description: form.description || null,
        is_active: form.is_active, engine: form.engine, ...(form.engine === 'blocks' ? { blocks_json: form.doc } : { body_html: form.html }),
        ...(templateId ? { expected_version: template?.version } : {}),
      };
      const r = templateId ? await updateTemplate(templateId, body) : await createTemplate(body);
      if (currentScope.current !== scope) return null;
      setTemplate(r.data);
      setForm(fromTemplate(r.data));
      setDirty(false);
      toast({ title: tr(templateId ? 'Plantilla guardada.' : 'Plantilla creada.'), description: `${r.data.name} · v${r.data.version}` });
      if (!templateId) router.replace(`/app/crm/plantillas/${r.data.id}`);
      return r.data;
    } catch (e) {
      toast({ title: tr("No se pudo guardar"), description: e instanceof Error ? e.message : 'Error', variant: 'destructive' });
      return null;
    } finally {
      pending.current = false; setSaving(false);
    }
  }, [form, templateId, template, router, canManage, loadedScope, scope, tr, validate]);

  const duplicate = useCallback(async () => {
    if (!templateId || !canManage || loadedScope !== scope || pending.current) return;
    pending.current = true; setSaving(true);
    try {
      const r = await duplicateTemplate(templateId);
      if (currentScope.current !== scope) return;
      toast({ title: tr("Plantilla duplicada"), description: r.data.name });
      router.push(`/app/crm/plantillas/${r.data.id}`);
    } catch (e) {
      toast({ title: tr("No se pudo duplicar"), description: e instanceof Error ? e.message : 'Error', variant: 'destructive' });
    } finally { pending.current = false; setSaving(false); }
  }, [templateId, router, canManage, loadedScope, scope, tr]);

  return { template, form, patch, loading: loading || loadedScope !== scope, loadError, saving, dirty, stats, ...previewState,
    contextIds, setContextIds, canManage: canManage && loadedScope === scope, retryLoad: () => setReload(n => n + 1),
    save, duplicate, isSystem: !!template?.metadata?.is_system };
}
