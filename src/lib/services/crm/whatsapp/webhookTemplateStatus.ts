/**
 * Webhook `message_template_status_update` / `message_template_quality_update`
 * de Meta (FASE-16 §4.3, cierra B15). Actualiza `templates.metadata.status`
 * por `meta_template_id` (fallback name+language dentro del WABA) y pausa las
 * campañas `sending` que usen una plantilla PAUSED/DISABLED.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { HsmStatus } from './types';

export interface TemplateStatusUpdate {
  event: HsmStatus;
  message_template_id: string | null;
  message_template_name: string | null;
  message_template_language: string | null;
  reason: string | null;
  quality_score: string | null;
  field: 'message_template_status_update' | 'message_template_quality_update';
}

const EVENTS: HsmStatus[] = ['APPROVED', 'REJECTED', 'PAUSED', 'DISABLED', 'PENDING', 'IN_APPEAL'];

/** Parseo puro del `value` del change (nunca lanza; null si no aplica). */
export function parseTemplateStatusUpdate(field: string, value: unknown): TemplateStatusUpdate | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  const id = v.message_template_id != null ? String(v.message_template_id) : null;
  const name = typeof v.message_template_name === 'string' ? v.message_template_name : null;
  const lang = typeof v.message_template_language === 'string' ? v.message_template_language : null;
  if (field === 'message_template_quality_update') {
    const q = (v.new_quality_score ?? v.quality_score) as string | undefined;
    if (!id && !name) return null;
    return { event: 'APPROVED', message_template_id: id, message_template_name: name, message_template_language: lang, reason: null, quality_score: q ?? null, field };
  }
  if (field !== 'message_template_status_update') return null;
  const ev = String(v.event ?? '').toUpperCase() as HsmStatus;
  if (!EVENTS.includes(ev)) return null;
  const reasonRaw = v.reason;
  const reason = typeof reasonRaw === 'string' && reasonRaw !== 'NONE' ? reasonRaw : null;
  return { event: ev, message_template_id: id, message_template_name: name, message_template_language: lang, reason, quality_score: null, field };
}

export async function applyTemplateStatusUpdate(update: TemplateStatusUpdate, wabaId: string | null, service: SupabaseClient): Promise<{ updated: number; paused_campaigns: number }> {
  let q = service.from('templates').select('id, organization_id, metadata').eq('channel', 'whatsapp');
  if (update.message_template_id) q = q.eq('metadata->>meta_template_id', update.message_template_id);
  else if (update.message_template_name) {
    q = q.eq('name', update.message_template_name);
    if (update.message_template_language) q = q.eq('metadata->>language', update.message_template_language);
    if (wabaId) q = q.eq('metadata->>waba_id', wabaId);
  } else return { updated: 0, paused_campaigns: 0 };

  const { data: rows } = await q.limit(10);
  let updated = 0;
  let pausedCampaigns = 0;
  for (const r of (rows ?? []) as Array<{ id: string; organization_id: number; metadata: Record<string, unknown> | null }>) {
    const meta = { ...(r.metadata ?? {}) } as Record<string, unknown>;
    if (update.field === 'message_template_quality_update') {
      meta.quality_score = update.quality_score;
    } else {
      meta.status = update.event;
      meta.rejected_reason = update.event === 'REJECTED' ? update.reason : null;
      if (update.event === 'PAUSED' || update.event === 'DISABLED') meta.paused_reason = update.reason;
    }
    meta.last_webhook_at = new Date().toISOString();
    const { error } = await service.from('templates').update({ metadata: meta, updated_at: new Date().toISOString() }).eq('id', r.id);
    if (!error) updated += 1;

    if (update.field === 'message_template_status_update' && (update.event === 'PAUSED' || update.event === 'DISABLED' || update.event === 'REJECTED')) {
      pausedCampaigns += await pauseCampaignsUsingTemplate(r.organization_id, r.id, update.event, service);
    }
  }
  return { updated, paused_campaigns: pausedCampaigns };
}

async function pauseCampaignsUsingTemplate(orgId: number, templateId: string, event: string, service: SupabaseClient): Promise<number> {
  const { data } = await service
    .from('campaigns')
    .select('id, statistics')
    .eq('organization_id', orgId)
    .eq('template_id', templateId)
    .in('status', ['sending', 'scheduled']);
  let n = 0;
  for (const c of (data ?? []) as Array<{ id: string; statistics: Record<string, unknown> | null }>) {
    const stats = c.statistics ?? {};
    if (stats.state === 'canceled') continue;
    const { error } = await service
      .from('campaigns')
      .update({ statistics: { ...stats, state: 'paused', paused_at: new Date().toISOString(), template_paused: true, template_event: event }, updated_at: new Date().toISOString() })
      .eq('id', c.id);
    if (!error) n += 1;
  }
  return n;
}
