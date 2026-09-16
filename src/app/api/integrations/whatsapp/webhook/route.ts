import { NextRequest, NextResponse } from 'next/server';
import { whatsappCloudService } from '@/lib/services/integrations/whatsapp';
import type { WhatsAppWebhookPayload } from '@/lib/services/integrations/whatsapp';
import { planWebhookAuthorization, type ResolvedChannel, type WebhookChannelResolver } from '@/lib/services/integrations/whatsapp/webhookAuthorization';
import { verifyMetaSignature } from '@/lib/security/webhookSignatures';
import { readRealSecret } from '@/lib/security/secrets';
import { checkRateLimit, getClientIp } from '@/lib/security/rateLimit';

export const runtime = 'nodejs';

// GET: Verificación del webhook (Meta envía challenge)
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;
  if (!verifyToken) {
    console.error('[WhatsApp Webhook] WHATSAPP_VERIFY_TOKEN no configurado');
    return NextResponse.json({ error: 'Verification not configured' }, { status: 403 });
  }

  if (mode === 'subscribe' && token === verifyToken) {
    console.log('[WhatsApp Webhook] Verificación exitosa');
    return new NextResponse(challenge, { status: 200 });
  }

  console.warn('[WhatsApp Webhook] Verificación fallida', { mode });
  return NextResponse.json({ error: 'Verification failed' }, { status: 403 });
}

/**
 * Resolución de canales contra la base para `planWebhookAuthorization`.
 * El `app_secret` del canal se devuelve tal cual: el plan decide si es real
 * (ámbito `channel`) o si el canal cae al secreto global.
 */
const channelResolver: WebhookChannelResolver = {
  async byPhoneNumberId(phoneNumberId: string): Promise<ResolvedChannel | null> {
    const channel = await whatsappCloudService.findChannelByPhoneNumberId(phoneNumberId);
    if (!channel) return null;
    const creds = await whatsappCloudService.getCredentialsByChannelId(channel.channelId);
    return { ...channel, appSecret: creds?.appSecret || null };
  },
  async byBusinessAccountId(wabaId: string): Promise<ResolvedChannel[]> {
    const channels = await whatsappCloudService.findChannelsByBusinessAccountId(wabaId);
    const out: ResolvedChannel[] = [];
    for (const channel of channels) {
      const creds = await whatsappCloudService.getCredentialsByChannelId(channel.channelId);
      out.push({ ...channel, appSecret: creds?.appSecret || null });
    }
    return out;
  },
};

/**
 * `META_APP_SECRET` de la plataforma (alias legacy `WHATSAPP_APP_SECRET`).
 * F0-SEC r2: un valor de relleno (`your-meta-app-secret`) cuenta como ausente.
 */
function globalAppSecret(): string | null {
  return readRealSecret('META_APP_SECRET', { aliases: ['WHATSAPP_APP_SECRET'] });
}

/**
 * F0-SEC r4 (qa r3 §4): límite por IP ANTES de planificar. El plan consulta la
 * base (hasta `MAX_LOOKUPS` identificadores) con el payload aún sin verificar
 * —inevitable: el secreto sale del payload—, así que una IP sin firma válida
 * podía costar consultas sin tope. Meta reintenta con backoff, y 120/min por IP
 * cubre de sobra un WABA activo. Clave separada del resto (`wa_webhook:ip:`).
 * (No se exporta: un route.ts solo puede exportar handlers y config de Next.)
 *
 * Límites conocidos (F0-pulido, qa r4 A+B §3 bajo 3):
 * - El cubo es POR IP DE EGRESO, y Meta envía los webhooks de TODOS los WABA
 *   desde un conjunto pequeño de IPs: varias organizaciones comparten cubo.
 *   El 429 va antes de la firma, así que un tercero solo puede agotar el cubo
 *   de Meta si comparte su IP (`console.warn` de abajo: vigilarlo las primeras
 *   semanas; si salta con tráfico legítimo, subir `limit` o pasar a
 *   `RATE_LIMIT_STORE=db`, no quitar el límite).
 * - Sin cabecera de IP (`x-forwarded-for` / `x-real-ip` / `cf-connecting-ip`)
 *   todas las peticiones caen en el cubo `unknown`, que `rateLimit.ts` acota a
 *   `unknownClientLimit` (aquí 12/min) en vez de 120: fail-closed razonable.
 *   En Vercel la cabecera siempre viene; si el aviso `[rateLimit] petición sin
 *   cabecera de IP` aparece en producción, el proxy está mal configurado.
 */
const WEBHOOK_RATE_LIMIT = { limit: 120, windowMs: 60_000, unknownClientLimit: 12 } as const;

// POST: Recibir mensajes y status updates
// F0 (C3 msg): firma X-Hub-Signature-256 verificada SIEMPRE (fail-closed) sobre el raw body.
// F0-SEC r2/r3: autorización POR CAMBIO. La firma cubre el cuerpo entero y la
// calcula UNA app de Meta, así que todos los `entry[*].changes[*]` tienen que
// pertenecer al mismo secreto (el del canal, o el global de la plataforma). Un payload que
// mezcle canales de secretos distintos se rechaza ENTERO con 403 `mixed_channels`:
// nunca una organización procesa entradas de otra. La decisión y las reglas
// están documentadas en `webhookAuthorization.ts`.
export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  const rl = await checkRateLimit(`wa_webhook:ip:${ip}`, WEBHOOK_RATE_LIMIT);
  if (!rl.allowed) {
    console.warn('[WhatsApp Webhook] Rate limit por IP superado. Rechazado.', { ip, resetAt: rl.resetAt.toISOString() });
    return NextResponse.json(
      { error: 'rate_limited' },
      { status: 429, headers: { 'Retry-After': String(Math.max(1, Math.ceil((rl.resetAt.getTime() - Date.now()) / 1000))) } },
    );
  }

  let rawBody: string;
  let payload: WhatsAppWebhookPayload;
  try {
    rawBody = await request.text();
    payload = JSON.parse(rawBody);
  } catch (error) {
    console.error('[WhatsApp Webhook] Error parseando request:', error);
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const signature = request.headers.get('x-hub-signature-256');
  if (!signature) {
    console.warn('[WhatsApp Webhook] Sin X-Hub-Signature-256. Rechazado.');
    return NextResponse.json({ error: 'invalid_signature' }, { status: 403 });
  }

  // 1. Resolver a qué secreto pertenece CADA cambio y exigir que coincidan.
  const plan = await planWebhookAuthorization(payload, channelResolver, globalAppSecret());
  if (plan.kind === 'reject') {
    console.warn(`[WhatsApp Webhook] Rechazado (${plan.code}): ${plan.detail}`);
    return NextResponse.json({ error: plan.code }, { status: plan.status });
  }

  // 2. Verificar la firma con ese único secreto.
  if (!verifyMetaSignature(rawBody, signature, plan.secret)) {
    console.warn('[WhatsApp Webhook] Firma inválida. Rechazado.', { scope: plan.scope, organizationIds: plan.organizationIds });
    return NextResponse.json({ error: 'invalid_signature' }, { status: 403 });
  }

  // Verificar que es un evento de WhatsApp Business Account
  if (payload.object !== 'whatsapp_business_account') {
    return NextResponse.json({ received: true, ignored: true }, { status: 200 });
  }

  // F0-SEC r3 (H1/H2): el descarte es POR CAMBIO. Un `phone_number_id` o un
  // WABA que no resuelve al secreto que firmó se queda fuera aunque comparta
  // entrada con cambios legítimos; se registra para que un intento de
  // inyección entre organizaciones se vea en el log. F0-SEC r4 (H4): también
  // bajo el ámbito global se descartan (y registran) las anomalías de forma
  // (`phone_number_on_template_change`).
  if (plan.droppedChanges.length > 0) {
    console.warn('[WhatsApp Webhook] Cambios descartados: no resuelven a ningún canal del secreto que firmó o son anómalos.', {
      scope: plan.scope,
      organizationIds: plan.organizationIds,
      droppedChanges: plan.droppedChanges,
      droppedEntryIndexes: plan.droppedEntryIndexes,
    });
  }

  // F16 r2 (tester r1 · fallo 1): el procesamiento se ESPERA y sus fallos se
  // propagan. Antes iba en fire-and-forget con un `.catch(console.error)`, así
  // que un inbound que no se podía guardar (trigger de identidades) se perdía
  // en silencio y Meta nunca lo reintentaba. Son 1-3 INSERT por webhook, muy
  // por debajo del margen de Meta.
  //
  // F0-SEC r4 (H4): el servicio recibe ADEMÁS las organizaciones que el plan
  // autorizó para el secreto que firmó; todo lo que resuelva por su cuenta
  // (WABA de la entrada, `phone_number_id`) se interseca con ellas. Bajo el
  // ámbito global no hay intersección (`undefined`): la app de la plataforma
  // firma para todos sus canales.
  try {
    await whatsappCloudService.processWebhookPayload(
      { ...payload, entry: plan.entries },
      { authorizedOrganizationIds: plan.scope === 'channel' ? plan.organizationIds : undefined },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[WhatsApp Webhook] Error procesando payload:', message);
    return NextResponse.json({ received: false, error: message, code: (error as { code?: string })?.code ?? 'PROCESSING_FAILED' }, { status: 500 });
  }

  return NextResponse.json({ received: true }, { status: 200 });
}
