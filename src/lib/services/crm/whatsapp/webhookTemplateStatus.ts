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
 *
 * F0-pulido (qa r4 §3 bajo 1, replay FUERA DE ORDEN): la clave por evento no
 * bastaba: `PAUSED@t1 → APPROVED@t2 → PAUSED@t1` (el mismo cuerpo de t1
 * capturado y reenviado) volvía a pausar. Ahora se guarda además el último
 * `entry.time` aplicado POR CAMPO (`metadata.last_webhook_time` para
 * `message_template_status_update`, `metadata.last_quality_webhook_time` para
 * `message_template_quality_update`) y un evento con `time` MENOR que el
 * aplicado se ignora y se registra con `console.warn`. Un `time` igual con
 * otra clave se aplica (dos cambios del mismo lote de Meta comparten `time`);
 * la misma clave sigue saltándose (idempotencia de r4 intacta). Los dos campos
 * conviven: un `quality_update@t1` tardío no bloquea un `status_update@t2`.
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

/**
 * `entry.time` (segundos, entero no negativo) contenido en una clave de
 * `templateEventKey`; `null` si la clave es `null` o no termina en dígitos.
 * Puro. Es el único sitio que sabe leer la clave: el llamador no cambia.
 */
export function templateEventTime(eventKey: string | null): number | null {
  if (eventKey === null) return null;
  const m = /:(\d{1,16})$/.exec(eventKey);
  if (!m) return null;
  const t = Number(m[1]);
  return Number.isSafeInteger(t) ? t : null;
}

/** Columna de `metadata` con el último `entry.time` aplicado, por campo. */
export function lastWebhookTimeKey(field: TemplateStatusUpdate['field']): 'last_webhook_time' | 'last_quality_webhook_time' {
  return field === 'message_template_quality_update' ? 'last_quality_webhook_time' : 'last_webhook_time';
}

/** `metadata.<lastWebhookTimeKey>` como entero no negativo, o `null` si no hay o es basura. */
function readLastWebhookTime(meta: Record<string, unknown>, field: TemplateStatusUpdate['field']): number | null {
  const raw = meta[lastWebhookTimeKey(field)];
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' && /^\d{1,16}$/.test(raw) ? Number(raw) : NaN;
  return Number.isSafeInteger(n) && n >= 0 ? n : null;
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
  const eventTime = templateEventTime(eventKey);
  let updated = 0;
  let pausedCampaigns = 0;
  for (const r of (rows ?? []) as Array<{ id: string; organization_id: number; metadata: Record<string, unknown> | null }>) {
    const meta = { ...(r.metadata ?? {}) } as Record<string, unknown>;
    // Replay del mismo evento (misma clave ya aplicada): se salta la fila.
    if (eventKey !== null && meta.last_webhook_event === eventKey) continue;
    // Replay FUERA DE ORDEN: `entry.time` anterior al último aplicado para este
    // campo → se ignora y se registra (qa r4 §3 bajo 1). Monotónico por campo.
    if (eventTime !== null) {
      const lastApplied = readLastWebhookTime(meta, update.field);
      if (lastApplied !== null && eventTime < lastApplied) {
        console.warn('[WhatsApp Webhook] template update ignorado: entry.time anterior al último aplicado (replay fuera de orden)', {
          templateId: r.id,
          organizationId: r.organization_id,
          field: update.field,
          event: update.event,
          eventTime,
          lastApplied,
        });
        continue;
      }
      meta[lastWebhookTimeKey(update.field)] = eventTime;
    }
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
