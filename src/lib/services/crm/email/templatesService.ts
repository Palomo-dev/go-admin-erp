/**
 * CRUD de plantillas de email sobre `templates` (channel='email').
 *
 * - engine='blocks': fuente de verdad `blocks_json`; `body_html` es el render
 *   cacheado (contexto de ejemplo) que se regenera al guardar.
 * - engine='html': fuente de verdad `body_html` (sanitizado al guardar).
 * - `version` se incrementa en cada guardado (misma fila).
 * - Campos sin columna (is_system, usage_count, parent_template_id) → metadata.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { EmailError, type Template, type TemplateKind, type TemplateSummary, type TemplateEngine } from './types';
import { parseBlockDocument } from './blocks';
import { renderEmail } from './render';
import { sanitizeBlockDocument, sanitizeEmailHtml } from './sanitize';
import { extractVariablePaths, sampleContext, type RenderContext } from './variables';
import { seedEmailTemplates } from './seeds/emailTemplates';

export interface TemplateFilters {
  channel?: 'email' | 'whatsapp' | 'sms';
  kind?: TemplateKind;
  q?: string;
  active?: boolean;
  page?: number;
  pageSize?: number;
}

export interface CreateTemplateInput {
  name: string;
  channel?: 'email';
  kind?: TemplateKind;
  engine: TemplateEngine;
  subject?: string;
  preheader?: string;
  description?: string;
  blocks_json?: unknown;
  body_html?: string;
  variables?: string[];
  is_active?: boolean;
  metadata?: Record<string, unknown>;
}
export type UpdateTemplateInput = Partial<CreateTemplateInput>;

const SUMMARY_COLS = 'id, organization_id, name, channel, kind, engine, subject, preheader, description, variables, is_active, version, created_by, metadata, created_at, updated_at';

const TEMPLATE_KINDS: TemplateKind[] = ['transactional', 'marketing', 'sequence', 'signature', 'hsm', 'onboarding'];

function normalizeName(name: string): string {
  const n = (name ?? '').trim();
  if (!n) throw new EmailError('VALIDATION', 'El nombre es obligatorio', 400);
  if (n.length > 120) throw new EmailError('VALIDATION', 'Nombre demasiado largo (máx 120)', 400);
  return n;
}

async function assertNameFree(orgId: number, name: string, supabase: SupabaseClient, excludeId?: string): Promise<void> {
  let q = supabase.from('templates').select('id').eq('organization_id', orgId).eq('channel', 'email').ilike('name', name);
  if (excludeId) q = q.neq('id', excludeId);
  const { data } = await q.limit(1);
  if (data && data.length > 0) throw new EmailError('NAME_EXISTS', `Ya existe una plantilla llamada "${name}"`, 409);
}

/** Prepara columnas de contenido (valida bloques / sanitiza HTML / cachea render). */
async function buildContentColumns(input: UpdateTemplateInput, engine: TemplateEngine, subject: string, preheader: string): Promise<Record<string, unknown>> {
  const cols: Record<string, unknown> = {};
  const ctx = sampleContext();
  if (engine === 'blocks') {
    if (input.blocks_json === undefined) return cols;
    let doc;
    try {
      doc = parseBlockDocument(input.blocks_json);
    } catch (err) {
      throw new EmailError('INVALID_BLOCKS', err instanceof Error ? err.message : 'Bloques inválidos', 422);
    }
    // Se guarda ya saneado: el canvas del editor lee `blocks_json` directamente
    // (tester r2, fallo nuevo #2) y el render solo saneaba de salida.
    doc = sanitizeBlockDocument(doc);
    cols.blocks_json = doc;
    const r = await renderEmail({ blocks: doc }, { ctx, subject, preheader });
    cols.body_html = r.html;
    cols.variables = input.variables ?? Array.from(new Set([...extractVariablePaths(JSON.stringify(doc)), ...extractVariablePaths(subject), ...extractVariablePaths(preheader)]));
  } else if (engine === 'html') {
    if (input.body_html === undefined) return cols;
    const clean = sanitizeEmailHtml(input.body_html);
    cols.body_html = clean;
    cols.blocks_json = null;
    cols.variables = input.variables ?? Array.from(new Set([...extractVariablePaths(clean), ...extractVariablePaths(subject), ...extractVariablePaths(preheader)]));
  }
  return cols;
}

export async function listTemplates(orgId: number, filters: TemplateFilters, supabase: SupabaseClient): Promise<{ data: TemplateSummary[]; total: number }> {
  const page = Math.max(1, filters.page ?? 1);
  const size = Math.min(100, Math.max(1, filters.pageSize ?? 50));
  let q = supabase
    .from('templates')
    .select(SUMMARY_COLS, { count: 'exact' })
    .eq('organization_id', orgId)
    .eq('channel', filters.channel ?? 'email')
    .order('updated_at', { ascending: false })
    .range((page - 1) * size, page * size - 1);
  if (filters.kind) q = q.eq('kind', filters.kind);
  if (filters.active !== undefined) q = q.eq('is_active', filters.active);
  if (filters.q) q = q.ilike('name', `%${filters.q.replace(/[%_]/g, '')}%`);
  const { data, error, count } = await q;
  if (error) throw new EmailError('DB', error.message, 500);
  return { data: (data ?? []) as unknown as TemplateSummary[], total: count ?? 0 };
}

export async function getTemplate(orgId: number, id: string, supabase: SupabaseClient): Promise<Template | null> {
  const { data, error } = await supabase.from('templates').select('*').eq('id', id).eq('organization_id', orgId).maybeSingle();
  if (error) throw new EmailError('DB', error.message, 500);
  return (data as Template | null) ?? null;
}

export async function requireTemplate(orgId: number, id: string, supabase: SupabaseClient): Promise<Template> {
  const t = await getTemplate(orgId, id, supabase);
  if (!t) throw new EmailError('NOT_FOUND', 'Plantilla no encontrada', 404);
  return t;
}

export async function createTemplate(orgId: number, userId: string | null, input: CreateTemplateInput, supabase: SupabaseClient): Promise<Template> {
  const name = normalizeName(input.name);
  const engine: TemplateEngine = input.engine === 'html' ? 'html' : 'blocks';
  const kind = input.kind && TEMPLATE_KINDS.includes(input.kind) ? input.kind : 'transactional';
  await assertNameFree(orgId, name, supabase);
  const subject = input.subject ?? '';
  const preheader = input.preheader ?? '';
  const content = await buildContentColumns(
    { ...input, blocks_json: input.blocks_json ?? (engine === 'blocks' ? { version: 1, settings: {}, blocks: [] } : undefined), body_html: input.body_html ?? (engine === 'html' ? '' : undefined) },
    engine, subject, preheader,
  );
  const row = {
    organization_id: orgId,
    name,
    channel: 'email',
    kind,
    engine,
    subject,
    preheader,
    description: input.description ?? null,
    body_html: '',
    blocks_json: null,
    variables: [],
    is_active: input.is_active ?? true,
    version: 1,
    created_by: userId,
    metadata: { usage_count: 0, ...(input.metadata ?? {}), is_system: false },
    ...content,
  };
  const { data, error } = await supabase.from('templates').insert(row).select('*').single();
  if (error || !data) throw new EmailError('DB', error?.message ?? 'No se pudo crear la plantilla', 500);
  return data as Template;
}

export async function updateTemplate(orgId: number, userId: string | null, id: string, input: UpdateTemplateInput, supabase: SupabaseClient): Promise<Template> {
  const current = await requireTemplate(orgId, id, supabase);
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString(), version: (current.version ?? 1) + 1 };
  if (input.name !== undefined) {
    patch.name = normalizeName(input.name);
    if (String(patch.name).toLowerCase() !== current.name.toLowerCase()) await assertNameFree(orgId, patch.name as string, supabase, id);
  }
  if (input.kind !== undefined) {
    if (!TEMPLATE_KINDS.includes(input.kind)) throw new EmailError('VALIDATION', 'kind inválido', 400);
    patch.kind = input.kind;
  }
  const engine: TemplateEngine = input.engine ?? current.engine;
  patch.engine = engine;
  if (input.subject !== undefined) patch.subject = input.subject;
  if (input.preheader !== undefined) patch.preheader = input.preheader;
  if (input.description !== undefined) patch.description = input.description;
  if (input.is_active !== undefined) patch.is_active = input.is_active;
  if (input.metadata) patch.metadata = { ...current.metadata, ...input.metadata, is_system: current.metadata?.is_system ?? false };
  const subject = (patch.subject as string | undefined) ?? current.subject ?? '';
  const preheader = (patch.preheader as string | undefined) ?? current.preheader ?? '';
  const contentInput: UpdateTemplateInput = { ...input };
  // Si cambia engine sin contenido nuevo, forzar re-render con el contenido actual
  if (engine !== current.engine) {
    if (engine === 'blocks' && contentInput.blocks_json === undefined) contentInput.blocks_json = current.blocks_json ?? { version: 1, settings: {}, blocks: [] };
    if (engine === 'html' && contentInput.body_html === undefined) contentInput.body_html = current.body_html ?? '';
  } else if (engine === 'blocks' && contentInput.blocks_json === undefined && (input.subject !== undefined || input.preheader !== undefined) && current.blocks_json) {
    contentInput.blocks_json = current.blocks_json;
  }
  Object.assign(patch, await buildContentColumns(contentInput, engine, subject, preheader));
  void userId;
  const { data, error } = await supabase.from('templates').update(patch).eq('id', id).eq('organization_id', orgId).select('*').single();
  if (error || !data) throw new EmailError('DB', error?.message ?? 'No se pudo actualizar la plantilla', 500);
  return data as Template;
}

export async function duplicateTemplate(orgId: number, userId: string | null, id: string, name: string | undefined, supabase: SupabaseClient): Promise<Template> {
  const src = await requireTemplate(orgId, id, supabase);
  let newName = (name ?? `${src.name} (copia)`).trim();
  for (let i = 2; i < 50; i++) {
    const { data } = await supabase.from('templates').select('id').eq('organization_id', orgId).eq('channel', 'email').ilike('name', newName).limit(1);
    if (!data || data.length === 0) break;
    newName = `${src.name} (copia ${i})`;
  }
  return createTemplate(orgId, userId, {
    name: newName,
    kind: (src.kind ?? 'transactional') as TemplateKind,
    engine: src.engine,
    subject: src.subject ?? '',
    preheader: src.preheader ?? '',
    description: src.description ?? undefined,
    blocks_json: src.blocks_json ?? undefined,
    body_html: src.body_html ?? undefined,
    metadata: { parent_template_id: src.id },
  }, supabase);
}

/** 409 si es de sistema; soft-delete (is_active=false) si tiene uso; borrado real si no. */
export async function deleteTemplate(orgId: number, id: string, supabase: SupabaseClient): Promise<{ deleted: boolean; deactivated: boolean }> {
  const t = await requireTemplate(orgId, id, supabase);
  if (t.metadata?.is_system) throw new EmailError('SYSTEM_TEMPLATE', 'Las plantillas base no se pueden eliminar (puedes desactivarlas o duplicarlas)', 409);
  const used = (t.metadata?.usage_count ?? 0) > 0;
  if (used) {
    const { error } = await supabase.from('templates').update({ is_active: false, updated_at: new Date().toISOString() }).eq('id', id).eq('organization_id', orgId);
    if (error) throw new EmailError('DB', error.message, 500);
    return { deleted: false, deactivated: true };
  }
  const { error } = await supabase.from('templates').delete().eq('id', id).eq('organization_id', orgId);
  if (error) throw new EmailError('DB', error.message, 500);
  return { deleted: true, deactivated: false };
}

/** usage_count++ y last_used_at en metadata (best-effort). */
export async function touchTemplateUsage(orgId: number, id: string, supabase: SupabaseClient): Promise<void> {
  const { data } = await supabase.from('templates').select('metadata').eq('id', id).eq('organization_id', orgId).maybeSingle();
  if (!data) return;
  const meta = ((data as { metadata?: Record<string, unknown> }).metadata ?? {}) as Record<string, unknown>;
  await supabase
    .from('templates')
    .update({ metadata: { ...meta, usage_count: Number(meta.usage_count ?? 0) + 1, last_used_at: new Date().toISOString() } })
    .eq('id', id)
    .eq('organization_id', orgId);
}

export interface PreviewInput {
  template_id?: string;
  blocks?: unknown;
  html?: string;
  subject?: string;
  preheader?: string;
}

export async function previewTemplate(orgId: number, input: PreviewInput, ctx: RenderContext, supabase: SupabaseClient) {
  if (input.template_id && input.blocks === undefined && input.html === undefined) {
    const t = await requireTemplate(orgId, input.template_id, supabase);
    return renderEmail({ template: t }, { ctx, subject: input.subject, preheader: input.preheader });
  }
  if (input.blocks !== undefined) return renderEmail({ blocks: input.blocks as Record<string, unknown> }, { ctx, subject: input.subject ?? '', preheader: input.preheader ?? '' });
  if (input.html !== undefined) return renderEmail({ html: input.html }, { ctx, subject: input.subject ?? '', preheader: input.preheader ?? '' });
  throw new EmailError('VALIDATION', 'Se requiere template_id, blocks o html', 400);
}

/** Siembra las 6 plantillas base si faltan (idempotente). */
export async function ensureSeedTemplates(orgId: number, userId: string | null, supabase: SupabaseClient): Promise<number> {
  return seedEmailTemplates(orgId, supabase, userId);
}
