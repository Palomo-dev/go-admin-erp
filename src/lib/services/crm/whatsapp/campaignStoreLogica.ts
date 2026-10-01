import { WhatsAppError, type AudienceSource, type Campaign, type CampaignAudience, type CampaignChannel, type CampaignConfig } from './types';

export interface CreateCampaignInput {
  name: string;
  channel: CampaignChannel;
  channel_id?: string | null;
  template_id?: string | null;
  content?: string | null;
  audience: CampaignAudience;
  scheduled_at?: string | null;
  throttle_mps?: number;
  respect_allowed_hours?: boolean;
  default_variables?: Record<string, unknown>;
  purpose?: 'utility' | 'marketing';
  description?: string | null;
}
export type UpdateCampaignInput = Partial<CreateCampaignInput> & { expected_updated_at?: string };

const AUDIENCE_SOURCES: AudienceSource[] = ['segment', 'stage', 'manual'];

export function validateAudience(a: CampaignAudience | undefined): CampaignAudience {
  if (!a || !a.source) throw new WhatsAppError('VALIDATION', 'audience.source es requerido (segment | stage | manual)', 400);
  // Sin esta comprobación un `source` desconocido pasaba la validación y la
  // campaña se materializaba con 0 contactos en silencio.
  if (!AUDIENCE_SOURCES.includes(a.source)) {
    throw new WhatsAppError('VALIDATION', `audience.source inválido: "${a.source}" (segment | stage | manual)`, 400);
  }
  if (a.source === 'segment' && !a.segment_id) throw new WhatsAppError('VALIDATION', 'audience.segment_id es requerido', 400);
  if (a.source === 'stage' && !(a.stage_ids?.length)) throw new WhatsAppError('VALIDATION', 'audience.stage_ids es requerido', 400);
  if (a.source === 'manual' && !(a.opportunity_ids?.length || a.customer_ids?.length)) {
    throw new WhatsAppError('VALIDATION', 'audience.opportunity_ids o customer_ids es requerido', 400);
  }
  return {
    source: a.source,
    segment_id: a.segment_id ?? null,
    pipeline_id: a.pipeline_id ?? null,
    stage_ids: a.stage_ids ?? [],
    opportunity_ids: a.opportunity_ids ?? [],
    customer_ids: a.customer_ids ?? [],
  };
}

/**
 * Igualdad de audiencias (orden de los ids irrelevante). Se usa para NO
 * invalidar la materialización cuando el PATCH reenvía la misma audiencia.
 */
export function sameAudience(a: CampaignAudience | undefined | null, b: CampaignAudience | undefined | null): boolean {
  if (!a || !b) return !a && !b;
  const list = (x?: string[] | null) => [...(x ?? [])].map(String).sort().join('|');
  return (
    a.source === b.source &&
    (a.segment_id ?? null) === (b.segment_id ?? null) &&
    (a.pipeline_id ?? null) === (b.pipeline_id ?? null) &&
    list(a.stage_ids) === list(b.stage_ids) &&
    list(a.opportunity_ids) === list(b.opportunity_ids) &&
    list(a.customer_ids) === list(b.customer_ids)
  );
}

export function clampThrottle(v: unknown, fallback = 10): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(80, Math.max(1, Math.round(n)));
}

/** Las variables de la plantilla no cambian por reordenar las claves del JSON. */
function sameJson(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => sameJson(v, b[i]));
  }
  const left = a as Record<string, unknown>, right = b as Record<string, unknown>;
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length && keys.every(k => Object.hasOwn(right, k) && sameJson(left[k], right[k]));
}

/** Datos de un borrador; estado, actor y versión los decide la RPC. */
export function campaignCreateValues(input: CreateCampaignInput): Record<string, unknown> {
  const name = (input.name ?? '').trim();
  if (!name) throw new WhatsAppError('VALIDATION', 'El nombre es requerido', 400);
  if (input.channel !== 'whatsapp' && input.channel !== 'email') throw new WhatsAppError('VALIDATION', 'channel debe ser whatsapp | email', 400);
  const audience = validateAudience(input.audience);
  if (!input.template_id && !input.content?.trim()) throw new WhatsAppError('VALIDATION', 'Se requiere template_id o content', 400);
  const stats: CampaignConfig = {
    audience,
    channel_id: input.channel_id ?? null,
    throttle_mps: clampThrottle(input.throttle_mps),
    respect_allowed_hours: true,
    default_variables: input.default_variables ?? {},
    purpose: input.purpose ?? 'utility',
    description: input.description ?? null,
    state: null,
    next_batch_no: 1,
    total_contacts: 0,
    pending: 0,
    skipped: 0,
    exclusions: {},
    estimated_cost: null,
    actual_cost: 0,
    error_summary: {},
  };
  return {
    name,
    channel: input.channel,
    scheduled_at: input.scheduled_at ?? null,
    template_id: input.template_id ?? null,
    segment_id: audience.source === 'segment' ? audience.segment_id : null,
    content: input.content ?? null,
    statistics: stats,
  };
}

/** Invalida el cálculo solo si cambian datos relevantes para el envío. */
export function campaignUpdateValues(c: Campaign, input: UpdateCampaignInput): Record<string, unknown> {
  const audience = input.audience ? validateAudience(input.audience) : c.statistics.audience;
  const stats: CampaignConfig = {
    ...c.statistics,
    audience,
    channel_id: input.channel_id === undefined ? c.statistics.channel_id : input.channel_id,
    throttle_mps: input.throttle_mps === undefined ? c.statistics.throttle_mps : clampThrottle(input.throttle_mps),
    respect_allowed_hours: true,
    default_variables: input.default_variables ?? c.statistics.default_variables,
    purpose: input.purpose ?? c.statistics.purpose,
    description: input.description === undefined ? c.statistics.description : input.description,
  };
  // Cambiar audiencia/plantilla invalida la materialización previa.
  // Solo si CAMBIA de verdad (tester r1 · fallo 3): el compositor masivo del
  // Kanban reenvía siempre el mismo `audience`+`template_id` al pulsar
  // "Enviar", así que invalidar por la mera presencia del campo borraba el
  // cálculo hecho con "Calcular" y `launch` respondía 409 NOT_MATERIALIZED en
  // bucle.
  const audienceChanged = !!input.audience && !sameAudience(c.statistics.audience, audience);
  const templateChanged = input.template_id !== undefined && (input.template_id ?? null) !== (c.template_id ?? null);
  // `purpose` cambia las exclusiones (marketing exige consentimiento).
  const purposeChanged = input.purpose !== undefined && input.purpose !== c.statistics.purpose;
  // El CANAL también invalida: `materializeCampaign` calcula la ventana de 24 h
  // POR CANAL (`openWindowSet(orgId, channelId, …)`) y el proveedor (QR o no)
  // sale del canal. Al corregir el fallo 3 del tester r1 la invalidación se
  // quedó comparando solo audiencia/plantilla/propósito, así que cambiar de
  // canal conservaba `materialized_at` y la campaña se lanzaba con contactos
  // calculados contra OTRO canal — verificado en vivo por el tester: 3 pending
  // → 3 `skipped:window_required` con los créditos ya reservados
  // (tester F16 r2 · F-13).
  const channelChanged = input.channel_id !== undefined && (input.channel_id ?? null) !== (c.statistics.channel_id ?? null);
  // Cambiar de canal WhatsApp ↔ email cambia el destinatario entero.
  const channelKindChanged = input.channel !== undefined && input.channel !== c.channel;
  const contentChanged = input.content !== undefined && input.content !== c.content;
  const variablesChanged = input.default_variables !== undefined && !sameJson(input.default_variables, c.statistics.default_variables ?? {});
  if (audienceChanged || templateChanged || purposeChanged || channelChanged || channelKindChanged || contentChanged || variablesChanged) stats.materialized_at = null;
  const patch: Record<string, unknown> = { statistics: stats };
  if (input.name !== undefined) patch.name = input.name.trim();
  if (input.channel !== undefined) patch.channel = input.channel;
  if (input.template_id !== undefined) patch.template_id = input.template_id;
  if (input.content !== undefined) patch.content = input.content;
  if (input.scheduled_at !== undefined) patch.scheduled_at = input.scheduled_at;
  if (input.audience) patch.segment_id = audience?.source === 'segment' ? audience.segment_id : null;
  return patch;
}
