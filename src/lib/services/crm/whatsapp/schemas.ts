/**
 * Validación zod de los bodies/queries de `/api/crm/whatsapp/**` y
 * `/api/crm/campaigns/**` (FASE-16 ronda 2, tester r1 · fallo 9: no había ni un
 * `z.` en las rutas de la fase y todo llegaba a PostgREST por casts —
 * `b.channelId as string`—, de modo que un `name` no-string reventaba en
 * `(input.name ?? '').trim()` con un 500 genérico).
 *
 * Criterio: estricto en lo que decide comportamiento o llega a la BD (uuid,
 * enums, longitudes, audiencias, plantillas) y permisivo en lo decorativo.
 * `organization_id` NUNCA se acepta del body (viene de la sesión); si llega, se
 * rechaza en vez de ignorarse.
 */

import { z } from 'zod';
import { WhatsAppError } from './types';

/** Valida y convierte cualquier ZodError en `WhatsAppError('VALIDATION', …, 400)`. */
export function parseWith<T extends z.ZodTypeAny>(schema: T, input: unknown, label = 'body'): z.infer<T> {
  const r = schema.safeParse(input);
  if (r.success) return r.data;
  const detail = r.error.issues.map((i) => `${i.path.join('.') || '(raíz)'}: ${i.message}`).join('; ');
  throw new WhatsAppError('VALIDATION', `${label} inválido — ${detail}`, 400, { issues: r.error.issues });
}

// ─── Primitivas ──────────────────────────────────────────────────────────────

export const zUuid = z.string().uuid('Identificador inválido');
export const zUuidNullable = zUuid.nullable().optional();
export const zVariables = z.record(z.string(), z.unknown());
export const zPurpose = z.enum(['utility', 'marketing']);
export const zIsoDate = z
  .string()
  .max(40)
  .refine((v) => !Number.isNaN(new Date(v).getTime()), 'no es una fecha ISO válida');

const CLAVES_DE_ORG = ['organization_id', 'orgId', 'organizationId', 'org_id'];

/**
 * El body no puede fijar la organización: siempre sale de la sesión (regla 3).
 *
 * Va en `preprocess` y NO en `refine` porque zod ELIMINA las claves
 * desconocidas ANTES de ejecutar los refinamientos: el `.refine` anterior
 * nunca llegaba a ver `organization_id` y el body pasaba la validación, con lo
 * que el control que documenta §1.1 del doc de fase no existía (tester F16 r2).
 * `preprocess` sí ve el objeto crudo.
 */
const noOrgInBody = <T extends z.ZodTypeAny>(o: T) =>
  z.preprocess((raw, ctx) => {
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      const r = raw as Record<string, unknown>;
      const encontrada = CLAVES_DE_ORG.find((k) => k in r);
      if (encontrada) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [encontrada],
          message: `${encontrada} no se acepta en el body (se toma de la sesión)`,
        });
      }
    }
    return raw;
  }, o);

// ─── Envío individual ────────────────────────────────────────────────────────

export const zSendBody = noOrgInBody(
  z.object({
    channelId: zUuidNullable,
    channel_id: zUuidNullable,
    customerId: zUuidNullable,
    customer_id: zUuidNullable,
    opportunityId: zUuidNullable,
    opportunity_id: zUuidNullable,
    conversationId: zUuidNullable,
    conversation_id: zUuidNullable,
    text: z.union([z.string().max(4096), z.object({ body: z.string().max(4096) }).passthrough(), z.null()]).optional(),
    template: z
      .object({ templateId: zUuid, variables: zVariables.optional() })
      .nullable()
      .optional(),
    media: z
      .object({
        url: z.string().url('media.url debe ser una URL').max(2048),
        mime: z.string().min(3).max(120),
        filename: z.string().max(200).optional(),
        caption: z.string().max(1024).optional(),
      })
      .nullable()
      .optional(),
    scheduledAt: zIsoDate.nullable().optional(),
    force: z.boolean().optional(),
    clientRequestId: z.string().max(200).nullable().optional(),
    purpose: zPurpose.optional(),
    source: z.enum(['crm', 'campaign', 'sequence', 'agent', 'bulk', 'platform_send']).optional(),
  }),
).refine(
  (b) => {
    const text = typeof b.text === 'string' ? b.text : b.text?.body;
    return !!text?.trim() || !!b.template || !!b.media;
  },
  { message: 'Se requiere text, template o media' },
);

export const zReplyBody = noOrgInBody(
  z.object({
    conversationId: zUuid,
    text: z.string().trim().min(1, 'text es requerido').max(4096),
    opportunityId: zUuidNullable,
  }),
);

// ─── Ajustes por organización ────────────────────────────────────────────────

const zHhMm = z.string().regex(/^\d{2}:\d{2}$/, 'debe ser HH:MM');

export const zSettingsBody = noOrgInBody(
  z.object({
    default_channel_id: zUuid.nullable().or(z.literal('')).optional(),
    optout_keywords: z.array(z.string().max(60)).max(30).optional(),
    optin_keywords: z.array(z.string().max(60)).max(30).optional(),
    allowed_hours: z
      .object({
        tz: z.string().max(60).optional(),
        days: z.array(z.number().int().min(0).max(6)).max(7).optional(),
        from: zHhMm,
        to: zHhMm,
      })
      .nullable()
      .optional(),
    daily_limit: z.number().int().min(0).max(1_000_000).nullable().optional(),
    /**
     * Indicativo del país (sin «+») con el que se completan los teléfonos
     * guardados en formato nacional. Antes estaba cableado a '57'
     * (tester F16 r3 · F-4). `null` = usar la cascada de entorno.
     */
    default_country_code: z.string().regex(/^\d{1,4}$/, 'solo dígitos (1 a 4)').nullable().optional(),
  }),
);

// ─── Campañas ────────────────────────────────────────────────────────────────

export const zAudience = z.object({
  source: z.enum(['segment', 'stage', 'manual'], { message: 'audience.source debe ser segment | stage | manual' }),
  segment_id: zUuidNullable,
  pipeline_id: zUuidNullable,
  stage_ids: z.array(zUuid).max(200).optional(),
  opportunity_ids: z.array(zUuid).max(20_000).optional(),
  customer_ids: z.array(zUuid).max(20_000).optional(),
});

const campaignFields = {
  name: z.string().trim().min(1, 'El nombre es requerido').max(200),
  channel: z.enum(['whatsapp', 'email'], { message: 'channel debe ser whatsapp | email' }),
  channel_id: zUuidNullable,
  template_id: zUuidNullable,
  content: z.string().max(4096).nullable().optional(),
  audience: zAudience,
  scheduled_at: zIsoDate.nullable().optional(),
  throttle_mps: z.number().min(0).max(10_000).optional(),
  respect_allowed_hours: z.boolean().optional(),
  default_variables: zVariables.optional(),
  purpose: zPurpose.optional(),
  description: z.string().max(2000).nullable().optional(),
};

export const zCreateCampaignBody = noOrgInBody(z.object(campaignFields));
export const zUpdateCampaignBody = noOrgInBody(z.object(campaignFields).partial());

export const zLaunchBody = z.object({
  scheduled_at: zIsoDate.nullable().optional(),
  scheduledAt: zIsoDate.nullable().optional(),
  force: z.boolean().optional(),
});

export const zCampaignListQuery = z.object({
  status: z.enum(['draft', 'scheduled', 'sending', 'sent', 'paused', 'canceled', 'materializing']).optional(),
  channel: z.enum(['whatsapp', 'email']).optional(),
  q: z.string().max(200).optional(),
});

export const zContactsQuery = z.object({
  state: z.enum(['pending', 'queued', 'sent', 'delivered', 'read', 'opened', 'clicked', 'replied', 'bounced', 'failed', 'skipped']).optional(),
  q: z.string().max(200).optional(),
  page: z.coerce.number().int().min(1).max(100_000).optional(),
  pageSize: z.coerce.number().int().min(1).max(500).optional(),
  export: z.literal('csv').optional(),
});

// ─── Plantillas HSM ──────────────────────────────────────────────────────────

export const zHsmButton = z.object({
  type: z.enum(['QUICK_REPLY', 'URL', 'PHONE_NUMBER']),
  text: z.string().min(1).max(25),
  url: z.string().max(2048).optional(),
  phone_number: z.string().max(30).optional(),
  example: z.array(z.string().max(2048)).max(5).optional(),
});

export const zHsmComponent = z.object({
  type: z.enum(['HEADER', 'BODY', 'FOOTER', 'BUTTONS']),
  format: z.enum(['TEXT', 'IMAGE', 'DOCUMENT', 'VIDEO']).optional(),
  text: z.string().max(2048).optional(),
  buttons: z.array(zHsmButton).max(10).optional(),
  example: z.record(z.string(), z.unknown()).optional(),
});

const hsmFields = {
  name: z.string().trim().min(1).max(512),
  category: z.enum(['utility', 'marketing', 'authentication']),
  language: z.string().min(2).max(10).optional(),
  description: z.string().max(2000).optional(),
  components: z.array(zHsmComponent).min(1, 'components es requerido').max(10),
  variable_map: z.record(z.string(), z.string().max(200)).optional(),
  examples: z.record(z.string(), z.string().max(500)).optional(),
  channel_id: zUuidNullable,
};

export const zCreateHsmBody = noOrgInBody(z.object(hsmFields));
export const zUpdateHsmBody = noOrgInBody(z.object(hsmFields).partial());
export const zChannelIdBody = z.object({ channelId: zUuid.nullable().optional() });

export const zHsmPreviewBody = z.object({
  context: z
    .object({ customerId: zUuidNullable, opportunityId: zUuidNullable, custom: zVariables.optional() })
    .optional(),
  variables: zVariables.optional(),
  channelId: zUuid.nullable().optional(),
});

export const zHsmListQuery = z.object({
  status: z.enum(['DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'PAUSED', 'DISABLED', 'IN_APPEAL', 'ALL']).optional(),
  category: z.enum(['utility', 'marketing', 'authentication']).optional(),
  q: z.string().max(200).optional(),
  channelId: zUuid.optional(),
  includeInactive: z.enum(['0', '1']).optional(),
});

// ─── Compatibilidad /api/integrations/whatsapp/send ─────────────────────────

export const zPlatformSendBody = z
  .object({
    channel_id: zUuid,
    to: z.union([z.string().max(40), z.number()]).optional(),
    type: z.enum(['text', 'template', 'image', 'document']).optional(),
    text: z.object({ body: z.string().min(1).max(4096) }).optional(),
    template: z
      .object({
        name: z.string().min(1).max(512),
        language: z.object({ code: z.string().min(2).max(10) }),
        components: z.array(z.unknown()).max(20).optional(),
      })
      .optional(),
    image: z.object({ link: z.string().url().max(2048), caption: z.string().max(1024).optional() }).optional(),
    document: z.object({ link: z.string().url().max(2048), filename: z.string().max(200).optional(), caption: z.string().max(1024).optional() }).optional(),
    conversation_id: zUuidNullable,
    customer_id: zUuidNullable,
    opportunity_id: zUuidNullable,
    /** Solo se admite si coincide con la org de la sesión (la ruta responde 403). */
    organization_id: z.union([z.number(), z.string()]).optional(),
  })
  .passthrough();

/** `URLSearchParams` → objeto plano (solo las claves presentes). */
export function searchParamsToObject(p: URLSearchParams): Record<string, string> {
  const out: Record<string, string> = {};
  p.forEach((v, k) => { if (v !== '') out[k] = v; });
  return out;
}
