/**
 * Validación zod de los bodies/queries de `/api/email/**` y `draft-email`
 * (FASE-07 ronda 2, tester r1 #10: antes NO había ni un `z.` en las rutas y
 * todo se casteaba con `readJson<T>() as T`).
 *
 * Criterio: estricto en lo que decide comportamiento o llega a la BD
 * (correos, uuid, enums, fechas, adjuntos, paginación) y permisivo en lo
 * puramente decorativo. `metadata` se acepta como objeto pero NUNCA puede
 * traer las claves que el servidor calcula (`direction`, `kind`, `reply_to`,
 * `list_unsubscribe_token`, `is_system`…): se rechaza explícitamente en vez de
 * confiar en que el servicio las pise después.
 */

import { z } from 'zod';
import { EmailError, MAX_RECIPIENTS, MAX_SCHEDULE_DAYS } from './types';

/** Valida y convierte cualquier ZodError en `EmailError('VALIDATION', …, 400)`. */
export function parseWith<T extends z.ZodTypeAny>(schema: T, input: unknown, label = 'body'): z.infer<T> {
  const r = schema.safeParse(input);
  if (r.success) return r.data;
  const detail = r.error.issues.map((i) => `${i.path.join('.') || '(raíz)'}: ${i.message}`).join('; ');
  throw new EmailError('VALIDATION', `${label} inválido — ${detail}`, 400, { issues: r.error.issues });
}

// ─── Primitivas ──────────────────────────────────────────────────────────────

export const zEmail = z.string().trim().toLowerCase().max(320).email('Dirección de correo inválida');
export const zUuid = z.string().uuid('Identificador inválido');
export const zEmailList = z.union([zEmail, z.array(zEmail).max(MAX_RECIPIENTS)]).optional();
const zText = (max: number) => z.string().max(max);

/** ISO 8601 parseable y a lo sumo `MAX_SCHEDULE_DAYS` en el futuro. */
export const zScheduledAt = z
  .string()
  .max(40)
  .refine((v) => !Number.isNaN(new Date(v).getTime()), 'scheduled_at no es una fecha válida')
  .refine((v) => new Date(v).getTime() - Date.now() <= MAX_SCHEDULE_DAYS * 86400000, `scheduled_at no puede superar ${MAX_SCHEDULE_DAYS} días`);

/** Claves de `metadata` que calcula el servidor y el cliente no puede fijar. */
export const RESERVED_META_KEYS = [
  'direction', 'kind', 'reply_to', 'list_unsubscribe_token', 'is_system', 'thread_id',
  'idempotency_key', 'sender_mode', 'email_domain_id', 'body_text_snapshot', 'test',
] as const;

export const zClientMetadata = z
  .record(z.string(), z.unknown())
  .refine((m) => !RESERVED_META_KEYS.some((k) => k in m), {
    message: `metadata no puede incluir claves reservadas del servidor (${RESERVED_META_KEYS.join(', ')})`,
  });

export const zVariables = z.record(z.string(), z.unknown());

export const zAttachment = z.union([
  z.object({ document_id: zUuid }).strict(),
  z.object({
    filename: z.string().min(1).max(200),
    content_base64: z
      .string()
      .min(1)
      .max(60_000_000)
      // Tester r1 #14: antes se aceptaba cualquier cadena y Resend devolvía 4xx.
      .refine((v) => /^[A-Za-z0-9+/\r\n]+={0,2}$/.test(v) && v.replace(/[\r\n]/g, '').length % 4 === 0, 'content_base64 no es base64 válido'),
    content_type: z.string().max(200).optional(),
  }).strict(),
]);

export const zBlocksDoc = z.record(z.string(), z.unknown());

export const zContent = z.union([
  z.object({ template_id: zUuid, variables: zVariables.optional() }),
  z.object({ blocks: zBlocksDoc, variables: zVariables.optional() }),
  z.object({ html: zText(500_000), text: zText(200_000).optional(), variables: zVariables.optional() }),
]);

export const zEmailKind = z.enum(['transactional', 'marketing', 'sequence', 'system']);
export const zTemplateKind = z.enum(['transactional', 'marketing', 'sequence', 'signature', 'hsm', 'onboarding']);
/** `react` se acepta en el tipo de la BD pero NO se puede crear/editar desde la API. */
export const zTemplateEngine = z.enum(['blocks', 'html']);

// ─── POST /api/email/send ────────────────────────────────────────────────────

export const zSendBody = z.object({
  to: z.union([zEmail, z.array(zEmail).min(1).max(MAX_RECIPIENTS)]),
  cc: zEmailList,
  bcc: zEmailList,
  to_customer_id: zUuid.nullish(),
  from_domain_id: zUuid.nullish(),
  from_user_id: zUuid.nullish(),
  subject: zText(500).optional(),
  preheader: zText(500).optional(),
  content: zContent.optional(),
  // Atajos legacy (ComposeEmailDialog v1 de F9)
  template_id: zUuid.optional(),
  blocks: zBlocksDoc.optional(),
  html: zText(500_000).optional(),
  text: zText(200_000).optional(),
  variables: zVariables.optional(),
  template_variables: zVariables.optional(),
  attachments: z.array(zAttachment).max(20).optional(),
  related_type: zText(40).optional(),
  related_id: zText(64).optional(),
  kind: zEmailKind.optional(),
  scheduled_at: zScheduledAt.nullish(),
  sequence_step_run_id: zUuid.nullish(),
  campaign_id: zUuid.nullish(),
  client_request_id: zText(120).nullish(),
  strict_variables: z.boolean().optional(),
  metadata: zClientMetadata.optional(),
  in_reply_to: zUuid.nullish(),
}).strict();
export type SendBody = z.infer<typeof zSendBody>;

export const zReplyBody = zSendBody.partial().extend({ to: z.union([zEmail, z.array(zEmail).min(1).max(MAX_RECIPIENTS)]).optional() }).strict();

// ─── Plantillas ──────────────────────────────────────────────────────────────

const templateContent = {
  subject: zText(500).optional(),
  preheader: zText(500).optional(),
  description: zText(1000).nullish(),
  blocks_json: zBlocksDoc.nullish(),
  body_html: zText(500_000).nullish(),
  body_text: zText(200_000).nullish(),
  is_active: z.boolean().optional(),
  metadata: zClientMetadata.optional(),
};

export const zTemplateCreate = z.object({
  name: z.string().trim().min(1, 'El nombre es obligatorio').max(120),
  kind: zTemplateKind.optional(),
  engine: zTemplateEngine.optional(),
  ...templateContent,
}).strict();

export const zTemplateUpdate = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  kind: zTemplateKind.optional(),
  engine: zTemplateEngine.optional(),
  ...templateContent,
}).strict();

export const zTemplatePreview = z.object({
  template_id: zUuid.optional(),
  blocks: zBlocksDoc.optional(),
  html: zText(500_000).optional(),
  subject: zText(500).optional(),
  preheader: zText(500).optional(),
  context_ids: z.object({ customer_id: zUuid.optional(), opportunity_id: zUuid.optional(), quote_id: zUuid.optional() }).strict().optional(),
  custom: zVariables.optional(),
}).strict();

export const zTemplateDuplicate = z.object({ name: z.string().trim().min(1).max(120).optional() }).strict();

export const zTestSend = z.object({
  to: zEmail.optional(),
  context_ids: z.object({ opportunity_id: zUuid.optional(), customer_id: zUuid.optional() }).strict().optional(),
  variables: zVariables.optional(),
}).strict();

// ─── Dominios y ajustes ──────────────────────────────────────────────────────

export const zDomainCreate = z.object({
  domain: z.string().trim().toLowerCase().min(4).max(253),
  region: z.enum(['us-east-1', 'eu-west-1', 'sa-east-1', 'ap-northeast-1']).optional(),
  from_name: z.string().trim().min(1, 'Indica el nombre del remitente').max(120),
  from_email_local: z.string().trim().max(64).optional(),
  from_email: zEmail.optional(),
  reply_to: zEmail.optional(),
  open_tracking: z.boolean().optional(),
  click_tracking: z.boolean().optional(),
  receiving_enabled: z.boolean().optional(),
  is_default: z.boolean().optional(),
}).strict();

export const zDomainUpdate = z.object({
  from_name: z.string().trim().min(1).max(120).optional(),
  from_email: zEmail.optional(),
  reply_to: zEmail.nullish(),
  open_tracking: z.boolean().optional(),
  click_tracking: z.boolean().optional(),
  receiving_enabled: z.boolean().optional(),
  is_default: z.boolean().optional(),
  dmarc_configured: z.boolean().optional(),
}).strict();

export const zSettingsPatch = z.object({
  email_fallback_policy: z.enum(['global_with_notice', 'global_silent', 'block']).optional(),
  email_tracking_transactional: z.boolean().optional(),
  signature_html: zText(20_000).optional(),
}).strict();

// ─── IA ──────────────────────────────────────────────────────────────────────

export const zDraftEmail = z.object({
  opportunityId: zUuid.optional(),
  customerId: zUuid.optional(),
  templateId: zUuid.nullish(),
  template_id: zUuid.nullish(),
  tone: zText(40).optional(),
  goal: zText(60).optional(),
  customGoal: zText(500).optional(),
  language: zText(20).optional(),
  extraInstructions: zText(2000).optional(),
}).strict().refine((b) => !!(b.opportunityId || b.customerId), { message: 'Indica opportunityId o customerId' });

// ─── Query strings ───────────────────────────────────────────────────────────

const zIntFrom = (min: number, max: number, dflt: number) =>
  z.preprocess((v) => (v === null || v === undefined || v === '' ? dflt : Number(v)), z.number().int().min(min).max(max).catch(dflt));

export const zTemplatesQuery = z.object({
  channel: z.enum(['email', 'whatsapp', 'sms']).catch('email'),
  kind: zTemplateKind.optional(),
  q: zText(120).optional(),
  active: z.enum(['true', 'false']).optional(),
  page: zIntFrom(1, 10_000, 1),
  pageSize: zIntFrom(1, 100, 20),
});

export const zMessagesQuery = z.object({
  status: z.enum(['pending', 'sent', 'delivered', 'opened', 'clicked', 'bounced', 'complained', 'unsubscribed', 'failed']).optional(),
  to_customer_id: zUuid.optional(),
  related_type: zText(40).optional(),
  related_id: zText(64).optional(),
  template_id: zUuid.optional(),
  direction: z.enum(['inbound', 'outbound']).optional(),
  thread_id: zUuid.optional(),
  limit: zIntFrom(1, 200, 50),
  offset: zIntFrom(0, 100_000, 0),
});

export const zVariablesQuery = z.object({
  opportunity_id: zUuid.optional(),
  customer_id: zUuid.optional(),
  quote_id: zUuid.optional(),
});

/** `URLSearchParams` → objeto plano sin claves vacías (para los schemas de query). */
export function queryObject(params: URLSearchParams, keys: readonly string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of keys) {
    const v = params.get(k);
    if (v !== null && v !== '') out[k] = v;
  }
  return out;
}
