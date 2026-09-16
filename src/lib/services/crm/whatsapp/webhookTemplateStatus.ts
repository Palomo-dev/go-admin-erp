/**
 * Webhook `message_template_status_update` / `message_template_quality_update`
 * de Meta (FASE-16 §4.3, cierra B15). Actualiza `templates.metadata.status`
 * por `meta_template_id` (fallback name+language dentro del WABA) y pausa las
 * campañas `sending` que usen una plantilla PAUSED/DISABLED.
 *
 * F0-SEC r3 (tester r2, H2): la búsqueda se restringe SIEMPRE a las
 * organizaciones autorizadas (`organizationIds`: las dueñas del canal cuyo
 * WABA firmó el webhook). Antes, con `meta_template_id`, buscaba en todas las
 * organizaciones y una plantilla de B se podía pausar con la firma de A. Sin
 * organizaciones no se consulta nada: fail-closed.
 *
 * F0-SEC r4 (qa r3 §5, replay): si el webhook trae `entry.time`, el evento se
 * identifica con `templateEventKey` (`<field>:<event>:<time>`) y se guarda en
 * `metadata.last_webhook_event`; una fila que ya lleva esa misma clave se
 * salta (un cuerpo firmado capturado y reenviado no vuelve a pausar campañas).
 * Sin `entry.time` no hay clave y se aplica como siempre.
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

/**
 * Clave de idempotencia de un evento de plantilla: `<field>:<event>:<entry.time>`.
 * `null` si la entrada no trae un `time` utilizable (entero no negativo, o su
 * representación decimal en string). Puro, sin efectos.
 */
export function templateEventKey(update: Pick<TemplateStatusUpdate, 'field' | 'event'>, entryTime: unknown): string | null {
  let time: string | null = null;
  if (typeof entryTime === 'number' && Number.isSafeInteger(entryTime) && entryTime >= 0) time = String(entryTime);
  else if (typeof entryTime === 'string' && /^\d{1,16}$/.test(entryTime.trim())) time = entryTime.trim();
  if (time === null) return null;
  return `${update.field}:${update.event}:${time}`;
}

export async function applyTemplateStatusUpdate(
  update: TemplateStatusUpdate,
  wabaId: string | null,
  service: SupabaseClient,
  organizationIds: readonly number[],
  eventKey: string | null = null,
): Promise<{ updated: number; paused_campaigns: number }> {
  const orgIds = Array.from(new Set(organizationIds.filter((id) => Number.isInteger(id) && id > 0)));
  if (orgIds.length === 0) return { updated: 0, paused_campaigns: 0 };

  let q = service.from('templates').select('id, organization_id, metadata').eq('channel', 'whatsapp').in('organization_id', orgIds);
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
    // Replay del mismo evento (misma clave ya aplicada): se salta la fila.
    if (eventKey !== null && meta.last_webhook_event === eventKey) continue;
    if (eventKey !== null) meta.last_webhook_event = eventKey;
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
