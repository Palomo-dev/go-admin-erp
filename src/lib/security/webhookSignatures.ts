/**
 * Verificación de firmas de webhooks — SOLO servidor, fail-closed.
 *
 * - Twilio: `X-Twilio-Signature` = HMAC-SHA1(AuthToken de la (sub)cuenta,
 *   URL completa + params POST ordenados). La URL se reconstruye desde
 *   `TWILIO_WEBHOOK_BASE_URL` (origin) + pathname + search de la petición
 *   (nunca desde `request.url`, que Vercel reescribe). El token se resuelve
 *   por `AccountSid` (master o subcuenta en `comm_settings.twilio_subaccount_sid`).
 * - Meta (WhatsApp/FB/IG): `X-Hub-Signature-256: sha256=HMAC-SHA256(raw body, app_secret)`
 *   comparado con `crypto.timingSafeEqual`.
 * - Resend: svix (`svix-id`, `svix-timestamp`, `svix-signature`).
 * - Cron: `Authorization: Bearer ${CRON_SECRET}` con comparación constante.
 *
 * Todas lanzan `WebhookError` (statusCode 401/403) o devuelven false. Nunca
 * "warn & continue": sin secreto configurado => rechazo.
 */

import crypto from 'crypto';
import Twilio from 'twilio';
import { Webhook as SvixWebhook } from 'svix';
import { getServiceClient } from '@/lib/supabase/server-service';

export class WebhookError extends Error {
  statusCode: number;
  code: string;
  constructor(statusCode: number, code: string, message?: string) {
    super(message ?? code);
    this.name = 'WebhookError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

/** Comparación en tiempo constante de dos strings (false si longitudes distintas). */
export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

// ─── Twilio ──────────────────────────────────────────────────────────────────

/**
 * Origin público donde Twilio envía los webhooks (`https://app.goadmin.io`).
 * Acepta un valor con path por compatibilidad (toma solo el origin) pero
 * lanza si la variable no está definida o no es una URL válida.
 */
export function getTwilioWebhookOrigin(): string {
  const raw = process.env.TWILIO_WEBHOOK_BASE_URL;
  if (!raw) throw new WebhookError(403, 'twilio_webhook_base_url_missing', 'TWILIO_WEBHOOK_BASE_URL no configurado');
  try {
    const u = new URL(raw);
    return u.origin;
  } catch {
    throw new WebhookError(403, 'twilio_webhook_base_url_invalid', 'TWILIO_WEBHOOK_BASE_URL inválido');
  }
}

/** Parsea un body `application/x-www-form-urlencoded` a un objeto plano. */
export function parseFormBody(rawBody: string): Record<string, string> {
  const params: Record<string, string> = {};
  for (const [k, v] of new URLSearchParams(rawBody).entries()) params[k] = v;
  return params;
}

/**
 * Resuelve el Auth Token de Twilio para el `AccountSid` del webhook.
 * - master → `TWILIO_MASTER_AUTH_TOKEN` (o `TWILIO_AUTH_TOKEN` legacy si coincide con `TWILIO_ACCOUNT_SID`)
 * - subcuenta → `comm_settings.twilio_subaccount_auth_token` (service client)
 * - desconocido → null (=> 403)
 */
export async function resolveTwilioAuthToken(accountSid: string): Promise<string | null> {
  if (!accountSid) return null;

  const masterSid = process.env.TWILIO_MASTER_ACCOUNT_SID;
  const masterToken = process.env.TWILIO_MASTER_AUTH_TOKEN;
  if (masterSid && accountSid === masterSid) return masterToken || null;

  // Alias legacy (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN)
  const legacySid = process.env.TWILIO_ACCOUNT_SID;
  const legacyToken = process.env.TWILIO_AUTH_TOKEN;
  if (legacySid && accountSid === legacySid) return legacyToken || null;

  try {
    const { data } = await getServiceClient()
      .from('comm_settings')
      .select('twilio_subaccount_auth_token')
      .eq('twilio_subaccount_sid', accountSid)
      .limit(1)
      .maybeSingle();
    const token = (data as { twilio_subaccount_auth_token?: string | null } | null)?.twilio_subaccount_auth_token;
    return token || null;
  } catch (err) {
    console.error('[webhookSignatures] Error resolviendo token de subcuenta:', err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Verifica la firma de una petición de Twilio (form-urlencoded).
 *
 * @param req      Petición (se usan headers, pathname y search; NO el host)
 * @param rawBody  Cuerpo crudo (`await req.text()`)
 * @param opts.authToken Token de la (sub)cuenta ya resuelto
 * @returns params parseados si la firma es válida
 * @throws WebhookError(403)
 */
export function verifyTwilioRequest(
  req: Request,
  rawBody: string,
  opts: { authToken: string }
): Record<string, string> {
  const signature = req.headers.get('x-twilio-signature') || '';
  if (!signature) throw new WebhookError(403, 'twilio_signature_missing');
  if (!opts.authToken) throw new WebhookError(403, 'twilio_auth_token_missing');

  const params = parseFormBody(rawBody);
  const { pathname, search } = new URL(req.url);
  const url = `${getTwilioWebhookOrigin()}${pathname}${search}`;

  const valid = Twilio.validateRequest(opts.authToken, signature, url, params);
  if (!valid) throw new WebhookError(403, 'twilio_signature_invalid');
  return params;
}

/**
 * Atajo para route handlers: lee el body, resuelve el token por `AccountSid`
 * y valida. Devuelve `{ params, accountSid, rawBody }`.
 */
export async function verifyTwilioWebhook(
  req: Request
): Promise<{ params: Record<string, string>; accountSid: string; rawBody: string }> {
  const rawBody = await req.text();
  const accountSid = parseFormBody(rawBody).AccountSid || '';
  const authToken = await resolveTwilioAuthToken(accountSid);
  if (!authToken) throw new WebhookError(403, 'twilio_account_unresolved');
  const params = verifyTwilioRequest(req, rawBody, { authToken });
  return { params, accountSid, rawBody };
}

/**
 * Valida la firma de Twilio sobre una URL arbitraria (p. ej. el handshake WSS
 * de ConversationRelay, sin params POST).
 */
export function verifyTwilioUrlSignature(authToken: string, signature: string, url: string): boolean {
  if (!authToken || !signature || !url) return false;
  return Twilio.validateRequest(authToken, signature, url, {});
}

// ─── Meta (WhatsApp Cloud / Messenger / Instagram) ───────────────────────────

/**
 * Verifica `X-Hub-Signature-256` con `crypto.timingSafeEqual`.
 * Devuelve false si falta cualquiera de las tres piezas.
 */
export function verifyMetaSignature(rawBody: string, header: string | null, appSecret: string): boolean {
  if (!rawBody || !header || !appSecret) return false;
  const expected = `sha256=${crypto.createHmac('sha256', appSecret).update(rawBody, 'utf8').digest('hex')}`;
  return safeEqual(expected, header);
}

// ─── Resend (svix) ───────────────────────────────────────────────────────────

/**
 * Verifica un webhook de Resend con svix. Lanza WebhookError(401) si falta el
 * secreto o la firma no es válida. Devuelve el payload verificado.
 *
 * NOTA (svix >= 2.0): `Webhook.verify()` valida la firma pero devuelve `void`;
 * en svix 1.x devolvía el payload ya parseado. Si confiamos en el valor de
 * retorno, todo webhook con firma VÁLIDA revienta luego con
 * "Cannot read properties of undefined". Por eso parseamos el body nosotros
 * DESPUÉS de que la firma haya sido validada. Bug detectado en producción por
 * F7 (2026-09-08) contra el paquete real; los tests no lo veían porque
 * mockeaban svix devolviendo el payload.
 */
export function verifyResendWebhook<T = unknown>(
  rawBody: string,
  headers: { 'svix-id': string; 'svix-timestamp': string; 'svix-signature': string } | Record<string, string>,
  secret: string | undefined = process.env.RESEND_WEBHOOK_SECRET
): T {
  if (!secret) throw new WebhookError(401, 'resend_webhook_secret_missing');

  let verified: unknown;
  try {
    const wh = new SvixWebhook(secret);
    verified = wh.verify(rawBody, headers);
  } catch (err) {
    throw new WebhookError(401, 'resend_signature_invalid', err instanceof Error ? err.message : undefined);
  }

  // svix 1.x devuelve el payload; svix >= 2.x devuelve void => parseamos aquí.
  if (verified !== undefined && verified !== null) return verified as T;

  try {
    return JSON.parse(rawBody) as T;
  } catch (err) {
    // Mismo código que usa el consumidor (emailService/webhookService) para que
    // la ruta mapee un único error 400 sea cual sea la versión de svix.
    throw new WebhookError(400, 'invalid_json', err instanceof Error ? err.message : undefined);
  }
}

// ─── Cron ────────────────────────────────────────────────────────────────────

/**
 * Valida `Authorization: Bearer ${CRON_SECRET}` (o `x-cron-secret`).
 * Fail-closed: sin `CRON_SECRET` configurado => 401 siempre.
 */
export function verifyCronSecret(req: Request): void {
  const expected = process.env.CRON_SECRET;
  if (!expected) throw new WebhookError(401, 'cron_secret_not_configured');

  const auth = req.headers.get('authorization') || '';
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  const alt = req.headers.get('x-cron-secret') || '';
  const provided = bearer || alt;

  if (!provided || !safeEqual(provided, expected)) {
    throw new WebhookError(401, 'cron_unauthorized');
  }
}

/** Convierte un WebhookError en Response JSON; re-lanza cualquier otro error. */
export function webhookErrorResponse(err: unknown): Response {
  if (err instanceof WebhookError) {
    return new Response(JSON.stringify({ error: err.code }), {
      status: err.statusCode,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  throw err;
}
