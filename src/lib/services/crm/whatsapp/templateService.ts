/**
 * Plantillas HSM de WhatsApp sobre `templates` (channel='whatsapp', kind='hsm')
 * — FASE-16 §4.2 `whatsappTemplateService`.
 *
 * `body_html` = texto del BODY (con `{{param}}`); todo lo demás en `metadata`
 * (`HsmMeta`). Sin tabla nueva (D4).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { getServiceClient } from '@/lib/supabase/server-service';
import { getChannelCredentials, getChannelProvider, resolveChannel } from './channelService';
import { componentOf, extractParams, renderTemplateComponents, toMetaComponents, validateHsm } from './templateRender';
import { metaCreateTemplate, metaListTemplates, toPositionalBody, twilioApprovalStatus, twilioCreateContent, twilioStatusToHsm, type MetaTemplateRow } from './templateProvider';
import { WhatsAppError, type HsmButton, type HsmCategory, type HsmComponent, type HsmMeta, type HsmStatus, type WhatsAppTemplate } from './types';
import type { RenderContext } from '@/lib/services/crm/email/variables';

const COLS = 'id, organization_id, name, description, body_html, is_active, metadata, created_at, updated_at';

export interface HsmFilters {
  status?: HsmStatus | 'ALL';
  category?: HsmCategory;
  q?: string;
  channelId?: string;
  includeInactive?: boolean;
}

export interface CreateHsmInput {
  name: string;
  category: HsmCategory;
  language?: string;
  description?: string;
  components: HsmComponent[];
  variable_map?: Record<string, string>;
  examples?: Record<string, string>;
  channel_id?: string | null;
}
export type UpdateHsmInput = Partial<CreateHsmInput>;

function rowToTemplate(r: Record<string, unknown>): WhatsAppTemplate {
  const meta = ((r.metadata as HsmMeta | null) ?? {}) as HsmMeta;
  return {
    id: String(r.id),
    organization_id: Number(r.organization_id),
    name: String(r.name),
    description: (r.description as string) ?? null,
    body: String(r.body_html ?? ''),
    is_active: r.is_active !== false,
    created_at: String(r.created_at),
    updated_at: String(r.updated_at),
    meta: {
      ...meta,
      provider: meta.provider ?? 'meta',
      status: meta.status ?? 'DRAFT',
      category: meta.category ?? 'utility',
      language: meta.language ?? 'es',
      components: Array.isArray(meta.components) && meta.components.length ? meta.components : [{ type: 'BODY', text: String(r.body_html ?? '') }],
      parameter_format: meta.parameter_format ?? 'named',
      variable_map: meta.variable_map ?? {},
    },
  };
}

export async function listHsm(orgId: number, filters: HsmFilters, supabase: SupabaseClient): Promise<WhatsAppTemplate[]> {
  let q = supabase.from('templates').select(COLS).eq('organization_id', orgId).eq('channel', 'whatsapp').order('updated_at', { ascending: false }).limit(200);
  if (!filters.includeInactive) q = q.eq('is_active', true);
  if (filters.status && filters.status !== 'ALL') q = q.eq('metadata->>status', filters.status);
  if (filters.category) q = q.eq('metadata->>category', filters.category);
  if (filters.channelId) q = q.or(`metadata->>channel_id.eq.${filters.channelId},metadata->>channel_id.is.null`);
  if (filters.q) q = q.ilike('name', `%${filters.q.replace(/[%_]/g, '')}%`);
  const { data, error } = await q;
  if (error) throw new WhatsAppError('INTERNAL', error.message, 500);
  return ((data ?? []) as Record<string, unknown>[]).map(rowToTemplate);
}

export async function getHsm(orgId: number, id: string, supabase: SupabaseClient): Promise<WhatsAppTemplate | null> {
  const { data } = await supabase.from('templates').select(COLS).eq('organization_id', orgId).eq('channel', 'whatsapp').eq('id', id).maybeSingle();
  return data ? rowToTemplate(data as Record<string, unknown>) : null;
}

export async function requireHsm(orgId: number, id: string, supabase: SupabaseClient): Promise<WhatsAppTemplate> {
  const t = await getHsm(orgId, id, supabase);
  if (!t) throw new WhatsAppError('NOT_FOUND', 'Plantilla no encontrada', 404);
  return t;
}

async function assertNameFree(orgId: number, name: string, language: string, supabase: SupabaseClient, excludeId?: string): Promise<void> {
  let q = supabase.from('templates').select('id').eq('organization_id', orgId).eq('channel', 'whatsapp').eq('name', name).eq('metadata->>language', language);
  if (excludeId) q = q.neq('id', excludeId);
  const { data } = await q.limit(1);
  if (data && data.length) throw new WhatsAppError('NAME_EXISTS', `Ya existe la plantilla "${name}" (${language})`, 409);
}

function defaultVariableMap(components: HsmComponent[], provided: Record<string, string> = {}): Record<string, string> {
  const known: Record<string, string> = {
    nombre: 'contact.first_name|cliente', name: 'contact.first_name|cliente', cliente: 'contact.full_name|cliente', empresa: 'org.name',
    oportunidad: 'opportunity.name', monto: 'opportunity.amount|money', vendedor: 'user.first_name', fecha: 'custom.date|date', hora: 'custom.time',
    enlace: 'custom.url', resumen: 'custom.summary', producto: 'custom.product',
  };
  const out: Record<string, string> = {};
  const params = new Set<string>();
  for (const c of components) {
    for (const p of extractParams(c.text)) params.add(p);
    for (const b of c.buttons ?? []) for (const p of extractParams(b.url)) params.add(p);
  }
  for (const p of params) out[p] = provided[p] ?? known[p] ?? `custom.${p}`;
  return out;
}

export async function createHsm(orgId: number, userId: string | null, input: CreateHsmInput, supabase: SupabaseClient, service: SupabaseClient = getServiceClient()): Promise<WhatsAppTemplate> {
  const name = (input.name ?? '').trim().toLowerCase();
  const language = (input.language ?? 'es').trim();
  const components = input.components ?? [];
  validateHsm({ name, components });
  await assertNameFree(orgId, name, language, supabase);
  const provider = input.channel_id ? await getChannelProvider(input.channel_id, service) : 'meta';
  const meta: HsmMeta = {
    provider,
    status: 'DRAFT',
    category: input.category,
    language,
    components,
    parameter_format: 'named',
    variable_map: defaultVariableMap(components, input.variable_map),
    examples: input.examples ?? {},
    channel_id: input.channel_id ?? null,
    meta_template_id: null,
    waba_id: null,
  };
  const body = componentOf(components, 'BODY')?.text ?? '';
  const { data, error } = await supabase
    .from('templates')
    .insert({
      organization_id: orgId,
      name,
      channel: 'whatsapp',
      kind: 'hsm',
      engine: 'html',
      body_html: body,
      description: input.description ?? null,
      variables: Object.values(meta.variable_map).map((v) => v.split('|')[0]),
      is_active: true,
      created_by: userId,
      metadata: meta,
    })
    .select(COLS)
    .single();
  if (error) throw new WhatsAppError('INTERNAL', error.message, 500);
  return rowToTemplate(data as Record<string, unknown>);
}

export async function updateHsm(orgId: number, id: string, input: UpdateHsmInput, supabase: SupabaseClient): Promise<WhatsAppTemplate> {
  const current = await requireHsm(orgId, id, supabase);
  const components = input.components ?? current.meta.components;
  const name = (input.name ?? current.name).trim().toLowerCase();
  const language = input.language ?? current.meta.language;
  const bodyChanged = input.components !== undefined && JSON.stringify(components) !== JSON.stringify(current.meta.components);
  if (current.meta.status !== 'DRAFT' && (bodyChanged || name !== current.name || language !== current.meta.language)) {
    throw new WhatsAppError('NOT_EDITABLE', 'Una plantilla enviada a Meta no se puede editar: crea una nueva versión', 409);
  }
  validateHsm({ name, components });
  if (name !== current.name || language !== current.meta.language) await assertNameFree(orgId, name, language, supabase, id);
  const meta: HsmMeta = {
    ...current.meta,
    category: input.category ?? current.meta.category,
    language,
    components,
    variable_map: defaultVariableMap(components, { ...current.meta.variable_map, ...(input.variable_map ?? {}) }),
    examples: { ...((current.meta.examples as Record<string, string>) ?? {}), ...(input.examples ?? {}) },
    channel_id: input.channel_id === undefined ? current.meta.channel_id : input.channel_id,
  };
  const { data, error } = await supabase
    .from('templates')
    .update({
      name,
      body_html: componentOf(components, 'BODY')?.text ?? current.body,
      description: input.description === undefined ? current.description : input.description,
      variables: Object.values(meta.variable_map).map((v) => v.split('|')[0]),
      metadata: meta,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('organization_id', orgId)
    .select(COLS)
    .single();
  if (error) throw new WhatsAppError('INTERNAL', error.message, 500);
  return rowToTemplate(data as Record<string, unknown>);
}

/** Borra si es DRAFT; si ya está en Meta, la desactiva (sigue existiendo en el WABA). */
export async function deleteHsm(orgId: number, id: string, supabase: SupabaseClient): Promise<{ deleted: boolean; deactivated: boolean }> {
  const t = await requireHsm(orgId, id, supabase);
  if (t.meta.status === 'DRAFT' || !t.meta.meta_template_id) {
    const { error } = await supabase.from('templates').delete().eq('id', id).eq('organization_id', orgId);
    if (error) throw new WhatsAppError('INTERNAL', error.message, 500);
    return { deleted: true, deactivated: false };
  }
  await supabase.from('templates').update({ is_active: false, updated_at: new Date().toISOString() }).eq('id', id).eq('organization_id', orgId);
  return { deleted: false, deactivated: true };
}

/** Envía a aprobación (Meta o Twilio según el canal). Idempotente: si ya tiene id externo no reenvía. */
export async function submitHsm(orgId: number, id: string, channelId: string | null, supabase: SupabaseClient, service: SupabaseClient = getServiceClient(), fetchImpl: typeof fetch = fetch): Promise<WhatsAppTemplate> {
  const t = await requireHsm(orgId, id, supabase);
  const channel = await resolveChannel(orgId, channelId ?? t.meta.channel_id ?? null, supabase, service);
  if (!channel.capabilities.templates) throw new WhatsAppError('CHANNEL_NO_TEMPLATES', 'El canal QR no admite plantillas HSM', 422);
  if (t.meta.meta_template_id || t.meta.twilio?.content_sid) return t;
  const creds = await getChannelCredentials(orgId, channel.id, service);
  const meta: HsmMeta = { ...t.meta, channel_id: channel.id, provider: channel.provider };
  if (channel.provider === 'twilio') {
    const { body, positional_map } = toPositionalBody(t.body);
    const variables: Record<string, string> = {};
    positional_map.forEach((p, i) => {
      variables[String(i + 1)] = ((t.meta.examples as Record<string, string>) ?? {})[p] ?? 'ejemplo';
    });
    const r = await twilioCreateContent(creds, { name: t.name, language: t.meta.language, category: t.meta.category, bodyText: body, variables }, fetchImpl);
    meta.twilio = { content_sid: r.content_sid, approval_status: r.approval_status, positional_map };
    meta.parameter_format = 'positional';
    meta.status = twilioStatusToHsm(r.approval_status);
  } else {
    const components = toMetaComponents(t.meta.components, t.meta.variable_map, (t.meta.examples as Record<string, string>) ?? {});
    const r = await metaCreateTemplate(creds, { name: t.name, category: t.meta.category, language: t.meta.language, components }, fetchImpl);
    meta.meta_template_id = r.id;
    meta.waba_id = String(creds.business_account_id ?? '');
    meta.status = (r.status.toUpperCase() as HsmStatus) || 'PENDING';
    meta.category = (r.category as HsmCategory) || t.meta.category;
  }
  meta.submitted_at = new Date().toISOString();
  const { data, error } = await supabase.from('templates').update({ metadata: meta, updated_at: new Date().toISOString() }).eq('id', id).eq('organization_id', orgId).select(COLS).single();
  if (error) throw new WhatsAppError('INTERNAL', error.message, 500);
  return rowToTemplate(data as Record<string, unknown>);
}

/** GET /{WABA_ID}/message_templates → upsert en `templates` (por meta_template_id, luego name+language). */
export async function syncFromMeta(orgId: number, channelId: string | null, userId: string | null, supabase: SupabaseClient, service: SupabaseClient = getServiceClient(), fetchImpl: typeof fetch = fetch): Promise<{ created: number; updated: number; total: number }> {
  const channel = await resolveChannel(orgId, channelId, supabase, service);
  const creds = await getChannelCredentials(orgId, channel.id, service);
  let created = 0;
  let updated = 0;
  if (channel.provider === 'twilio') {
    const list = await listHsm(orgId, { includeInactive: true, channelId: channel.id }, supabase);
    for (const t of list) {
      if (!t.meta.twilio?.content_sid) continue;
      const st = await twilioApprovalStatus(creds, t.meta.twilio.content_sid, fetchImpl);
      await supabase.from('templates').update({ metadata: { ...t.meta, status: twilioStatusToHsm(st), twilio: { ...t.meta.twilio, approval_status: st }, last_synced_at: new Date().toISOString() } }).eq('id', t.id);
      updated += 1;
    }
    return { created, updated, total: list.length };
  }
  const remote = await metaListTemplates(creds, fetchImpl);
  const local = await listHsm(orgId, { includeInactive: true }, supabase);
  const wabaId = String(creds.business_account_id ?? '');
  for (const r of remote) {
    const match = local.find((t) => t.meta.meta_template_id === r.id) ?? local.find((t) => t.name === r.name && t.meta.language === r.language && !t.meta.meta_template_id);
    const components = normalizeMetaComponents(r.components as HsmComponent[]);
    const quality = typeof r.quality_score === 'object' && r.quality_score ? (r.quality_score as { score?: string }).score ?? null : (r.quality_score as string | null) ?? null;
    if (match) {
      const meta: HsmMeta = {
        ...match.meta,
        provider: 'meta',
        meta_template_id: r.id,
        waba_id: wabaId,
        channel_id: match.meta.channel_id ?? channel.id,
        status: (r.status.toUpperCase() as HsmStatus) || match.meta.status,
        category: (String(r.category).toLowerCase() as HsmCategory) || match.meta.category,
        language: r.language,
        components,
        parameter_format: (r.parameter_format?.toLowerCase() as 'named' | 'positional') ?? match.meta.parameter_format,
        variable_map: defaultVariableMap(components, match.meta.variable_map),
        quality_score: quality,
        rejected_reason: r.rejected_reason ?? match.meta.rejected_reason ?? null,
        last_synced_at: new Date().toISOString(),
      };
      await supabase.from('templates').update({ metadata: meta, body_html: componentOf(components, 'BODY')?.text ?? match.body, updated_at: new Date().toISOString() }).eq('id', match.id);
      updated += 1;
    } else {
      const meta: HsmMeta = {
        provider: 'meta', meta_template_id: r.id, waba_id: wabaId, channel_id: channel.id, status: (r.status.toUpperCase() as HsmStatus) || 'PENDING',
        category: (String(r.category).toLowerCase() as HsmCategory) || 'utility', language: r.language, components,
        parameter_format: (r.parameter_format?.toLowerCase() as 'named' | 'positional') ?? 'named', variable_map: defaultVariableMap(components), quality_score: quality,
        rejected_reason: r.rejected_reason ?? null, last_synced_at: new Date().toISOString(),
      };
      const { error } = await supabase.from('templates').insert({
        organization_id: orgId, name: r.name, channel: 'whatsapp', kind: 'hsm', engine: 'html', body_html: componentOf(components, 'BODY')?.text ?? '',
        description: 'Importada desde Meta', variables: Object.values(meta.variable_map).map((v) => v.split('|')[0]), is_active: true, created_by: userId, metadata: meta,
      });
      if (!error) created += 1;
    }
  }
  return { created, updated, total: remote.length };
}

function normalizeMetaComponents(components: HsmComponent[] | undefined): HsmComponent[] {
  return (components ?? []).map((c) => ({
    type: String(c.type).toUpperCase() as HsmComponent['type'],
    ...(c.format ? { format: String(c.format).toUpperCase() as HsmComponent['format'] } : {}),
    ...(c.text !== undefined ? { text: c.text } : {}),
    ...(c.buttons ? { buttons: c.buttons.map((b) => ({ ...b, type: String(b.type).toUpperCase() as HsmButton['type'] })) } : {}),
    ...(c.example ? { example: c.example } : {}),
  }));
}

export interface HsmPreview {
  header: string | null;
  body: string;
  footer: string | null;
  buttons: unknown[];
  values: Record<string, string>;
  missing: string[];
  category: HsmCategory;
  status: HsmStatus;
  variable_map: Record<string, string>;
}

export function previewHsm(t: WhatsAppTemplate, ctx: RenderContext, overrides: Record<string, unknown> = {}): HsmPreview {
  const r = renderTemplateComponents(t, ctx, overrides);
  return { header: r.header, body: r.body, footer: r.footer, buttons: r.buttons, values: r.values, missing: r.missing, category: t.meta.category, status: t.meta.status, variable_map: t.meta.variable_map };
}

export { renderTemplateComponents };
export type { MetaTemplateRow };
