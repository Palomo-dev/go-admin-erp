// ============================================================
// Edge Function: channel-dispatch
// Despachador unificado de mensajes SALIENTES (FASE-16 §2.1 / §4.5).
//
// Invocada por el trigger `trg_channel_dispatch` (AFTER INSERT en
// messages) cuando se inserta un mensaje outbound de un agente o de
// la IA en un canal de tipo whatsapp / facebook / instagram.
//
// WhatsApp:
//   - content_type 'text'            → Graph type:'text'
//   - content_type 'template'        → Graph type:'template' (payload.template,
//                                      parámetros nombrados v26.0) o Twilio
//                                      ContentSid + ContentVariables
//   - content_type 'image' | 'file'  → Graph type:'image'|'document' (link)
//   - provider 'twilio'              → Messages API (whatsapp:+…)
//   - provider 'baileys' (QR)        → Evolution API (solo texto; template → failed)
// Escribe message_events (sent|failed, error_code; `event_time` la genera la
// BD a partir de created_at, NO se envía) y
// messages.external_message_id (columna real) + metadata.dispatched.
// ============================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { secretosCoinciden } from "../_shared/ai-chat/politicaRespuesta.ts";
import { cargarSecretoInterno, evaluarContactoPersistido } from "../_shared/contacto/puerta.ts";
import { normalizePhoneDigits, resolverIndicativo } from "../_shared/contacto/telefono.ts";
import { reservarContactoLegal } from "../_shared/contacto/despachoLegal.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseKey);

const GRAPH_VERSION = Deno.env.get("WHATSAPP_GRAPH_VERSION") || "v26.0";
const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;
const DISPATCH_TYPES = ["whatsapp", "facebook", "instagram"];
const TWILIO_STATUS_CALLBACK = (Deno.env.get("TWILIO_WEBHOOK_BASE_URL") || Deno.env.get("APP_URL") || "").replace(/\/$/, "");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Limpia marcadores internos que no aplican a canales externos */
function cleanText(text: string): string {
  return text.replace(/\[IMG:[^\]]+\]/g, "").replace(/\n{3,}/g, "\n\n").trim() || "…";
}

interface SendResult {
  ok: boolean;
  uncertain?: boolean;
  externalId?: string;
  error?: string;
  errorCode?: string;
  raw?: unknown;
}

type Creds = Record<string, string>;

async function graphPost(creds: Creds, body: Record<string, unknown>): Promise<SendResult> {
  if (!creds.phone_number_id || !creds.access_token) {
    return { ok: false, error: "Credenciales WhatsApp incompletas", errorCode: "NO_CREDENTIALS" };
  }
  const res = await fetch(`${GRAPH}/${creds.phone_number_id}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${creds.access_token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", ...body }),
  });
  const data = await res.json().catch(() => ({}));
  const msg = data?.messages?.[0];
  return {
    ok: res.ok,
    uncertain: res.status >= 500,
    externalId: msg?.id,
    error: data?.error?.error_user_msg || data?.error?.message,
    errorCode: data?.error?.code != null ? String(data.error.code) : undefined,
    raw: { ...data, message_status: msg?.message_status },
  };
}

/** Texto vía WhatsApp Cloud API */
function sendWhatsAppText(creds: Creds, to: string, text: string): Promise<SendResult> {
  return graphPost(creds, { to, type: "text", text: { body: text, preview_url: false } });
}

/** Plantilla HSM (payload.template = {name, language:{code}, components[]}) */
function sendWhatsAppTemplate(creds: Creds, to: string, template: unknown): Promise<SendResult> {
  if (!template || typeof template !== "object" || !(template as { name?: string }).name) {
    return Promise.resolve({ ok: false, error: "payload.template inválido", errorCode: "INVALID_TEMPLATE" });
  }
  return graphPost(creds, { to, type: "template", template });
}

/** Imagen / documento por enlace público (payload.media = {url, mime, filename, caption}) */
function sendWhatsAppMedia(creds: Creds, to: string, media: { url?: string; mime?: string; filename?: string | null; caption?: string | null } | null, contentType: string): Promise<SendResult> {
  if (!media?.url) return Promise.resolve({ ok: false, error: "payload.media.url requerido", errorCode: "INVALID_MEDIA" });
  const isImage = contentType === "image" || (media.mime || "").startsWith("image/");
  const node = isImage
    ? { link: media.url, ...(media.caption ? { caption: media.caption } : {}) }
    : { link: media.url, ...(media.caption ? { caption: media.caption } : {}), ...(media.filename ? { filename: media.filename } : {}) };
  return graphPost(creds, { to, type: isImage ? "image" : "document", [isImage ? "image" : "document"]: node });
}

/** Twilio WhatsApp (texto, media o ContentSid + ContentVariables) */
async function sendTwilioWhatsApp(creds: Creds, to: string, msg: { content: string; content_type: string; payload: Record<string, unknown> | null }): Promise<SendResult> {
  const sid = creds.account_sid || Deno.env.get("TWILIO_MASTER_ACCOUNT_SID") || Deno.env.get("TWILIO_ACCOUNT_SID") || "";
  const token = creds.auth_token || Deno.env.get("TWILIO_MASTER_AUTH_TOKEN") || Deno.env.get("TWILIO_AUTH_TOKEN") || "";
  const from = creds.from || creds.whatsapp_number || creds.phone_number || "";
  if (!sid || !token || (!from && !creds.messaging_service_sid)) {
    return { ok: false, error: "Credenciales Twilio incompletas", errorCode: "NO_CREDENTIALS" };
  }
  const form = new URLSearchParams();
  form.set("To", `whatsapp:+${to.replace(/^\+/, "")}`);
  if (creds.messaging_service_sid) form.set("MessagingServiceSid", creds.messaging_service_sid);
  else form.set("From", from.startsWith("whatsapp:") ? from : `whatsapp:${from.startsWith("+") ? from : `+${from}`}`);
  if (TWILIO_STATUS_CALLBACK) form.set("StatusCallback", `${TWILIO_STATUS_CALLBACK}/api/integrations/twilio/status-callback`);
  const twilio = (msg.payload?.twilio ?? null) as { content_sid?: string; variables?: Record<string, string> } | null;
  const media = (msg.payload?.media ?? null) as { url?: string } | null;
  if (msg.content_type === "template" && twilio?.content_sid) {
    form.set("ContentSid", twilio.content_sid);
    form.set("ContentVariables", JSON.stringify(twilio.variables ?? {}));
  } else if (msg.content_type === "template") {
    return { ok: false, error: "La plantilla no tiene content_sid de Twilio", errorCode: "NO_CONTENT_SID" };
  } else {
    if (media?.url) form.set("MediaUrl", media.url);
    form.set("Body", cleanText(msg.content || ""));
  }
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: { Authorization: `Basic ${btoa(`${sid}:${token}`)}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  const data = await res.json().catch(() => ({}));
  return {
    ok: res.ok,
    uncertain: res.status >= 500,
    externalId: data?.sid,
    error: data?.message,
    errorCode: data?.code != null ? String(data.code) : undefined,
    raw: data,
  };
}

/** Envío vía Messenger / Instagram (Graph API) */
async function sendMeta(type: string, creds: Creds, recipientId: string, text: string): Promise<SendResult> {
  const accessToken = creds.page_access_token || creds.access_token;
  const node = type === "instagram" ? (creds.instagram_business_account_id || creds.page_id) : creds.page_id;
  if (!node || !accessToken) return { ok: false, error: "Credenciales de página incompletas", errorCode: "NO_CREDENTIALS" };
  const res = await fetch(`${GRAPH}/${node}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ recipient: { id: recipientId }, messaging_type: "RESPONSE", message: { text } }),
  });
  const data = await res.json().catch(() => ({}));
  return {
    ok: res.ok,
    uncertain: res.status >= 500,
    externalId: data?.message_id,
    error: data?.error?.message,
    errorCode: data?.error?.code != null ? String(data.error.code) : undefined,
    raw: data,
  };
}

/** Resolver el destinatario (teléfono o PSID/IGSID) del customer */
async function resolveRecipient(orgId: number, channelType: string, channelId: string, customerId: string): Promise<string> {
  const identityTypeByChannel: Record<string, string> = { facebook: "facebook_psid", instagram: "instagram_user", whatsapp: "whatsapp_phone" };
  const { data: ident, error: identityError } = await supabase.from("customer_channel_identities")
    .select("identity_value").eq("organization_id", orgId).eq("channel_id", channelId).eq("customer_id", customerId)
    .eq("identity_type", identityTypeByChannel[channelType]).order("created_at", { ascending: false }).order("id").limit(1).maybeSingle();
  if (identityError) throw new Error("No se pudo resolver la identidad propia");
  if (ident?.identity_value) return channelType === "whatsapp" ? normalizePhoneDigits(ident.identity_value) || "" : ident.identity_value;
  if (channelType !== "whatsapp") return "";
  const { data: customer, error: customerError } = await supabase.from("customers").select("phone")
    .eq("organization_id", orgId).eq("id", customerId).single();
  if (customerError) throw new Error("No se pudo resolver el cliente propio");
  const { data: config, error: configError } = await supabase.from("provider_configs").select("settings")
    .eq("organization_id", orgId).eq("category", "whatsapp").order("priority").order("id").limit(1).maybeSingle();
  if (configError) throw new Error("No se pudo resolver el indicativo propio");
  const cc = resolverIndicativo(config?.settings?.default_country_code, Deno.env.get("WHATSAPP_DEFAULT_COUNTRY_CODE"));
  return customer?.phone ? normalizePhoneDigits(customer.phone, cc) || "" : "";
}

interface MensajeReservado { id: string; organization_id: number; dispatchToken: string }
async function recordResult(msg: MensajeReservado, result: SendResult, dispatchChannel: string, status?: string) {
  // Sin ID del proveedor una respuesta 2xx no demuestra entrega: requiere conciliación.
  const finalStatus = status || (result.uncertain ? "uncertain" : result.ok && result.externalId ? "sent" : result.ok ? "uncertain" : "failed");
  const { error } = await supabase.rpc("crm_finish_message_dispatch", {
    p_org: msg.organization_id, p_message: msg.id, p_token: msg.dispatchToken, p_status: finalStatus,
    p_channel: dispatchChannel, p_external_id: result.externalId || null, p_error_code: result.errorCode || null,
    p_error: result.error || null, p_payload: result.raw && typeof result.raw === "object" ? result.raw : {},
  });
  if (error) throw new Error("No se pudo persistir el resultado de despacho");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);
  const secret = await cargarSecretoInterno(supabase, Deno.env.get("AI_INTERNAL_SECRET"));
  if (!secret || !secretosCoinciden(req.headers.get("x-internal-secret") || "", secret)) return json({ error: "No autorizado" }, 401);
  let reserved: MensajeReservado | null = null;
  let providerStarted = false;
  try {
    const { messageId, organizationId, conversationId } = await req.json();
    if (typeof messageId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(messageId)) return json({ error: "messageId inválido" }, 400);

    // 1. Cargar el mensaje (payload + related_opportunity_id)
    const { data: msg } = await supabase
      .from("messages")
      .select("id, content, content_type, channel_id, conversation_id, organization_id, direction, role, metadata, payload, related_opportunity_id")
      .eq("id", messageId)
      .single();
    if (!msg) return json({ error: "Mensaje no encontrado" }, 404);
    if ((organizationId !== undefined && organizationId !== msg.organization_id)
      || (conversationId !== undefined && conversationId !== msg.conversation_id)) {
      console.warn("[channel-dispatch] Contexto de despacho no coincide", { messageId });
      return json({ error: "Contexto de despacho no coincide" }, 403);
    }

    if (msg.direction !== "outbound" || !["agent", "ai"].includes(msg.role)) return json({ skipped: "no es saliente de agente/ia" });
    if (msg.metadata?.dispatched) return json({ skipped: "ya despachado" });

    // 2. Canal + tipo
    const { data: channel } = await supabase.from("channels").select("id, type").eq("organization_id", msg.organization_id).eq("id", msg.channel_id).single();
    if (!channel || !DISPATCH_TYPES.includes(channel.type)) return json({ skipped: "canal no despachable" });

    const { data: claim, error: claimError } = await supabase.rpc("crm_claim_message_dispatch", { p_org: msg.organization_id, p_message: msg.id });
    if (claimError) throw new Error("No se pudo reservar el mensaje");
    if (claim?.claimed !== true) return json({ skipped: claim?.reason || "contact_blocked" });
    if (typeof claim.token !== "string") throw new Error("Reserva sin token");
    reserved = { id: msg.id, organization_id: msg.organization_id, dispatchToken: claim.token };

    // 3. Credenciales / proveedor.
    // `channel_credentials` es UNIQUE (channel_id, provider), NO (channel_id):
    // un canal con credenciales `meta` y `twilio` haría fallar `maybeSingle()`
    // y todos sus envíos morirían con NO_CREDENTIALS sin aviso (tester r1 · 11).
    const { data: credRows, error: credError } = await supabase
      .from("channel_credentials")
      .select("credentials, provider, channels!inner(organization_id)")
      .eq("channels.organization_id", msg.organization_id)
      .eq("is_valid", true)
      .eq("channel_id", msg.channel_id)
      .order("updated_at", { ascending: false })
      .limit(5);
    if (credError) throw new Error("No se pudieron resolver las credenciales propias");
    const rows = (credRows || []) as Array<{ credentials?: Record<string, unknown>; provider?: string }>;
    const withToken = rows.find((r) => {
      const c = (r.credentials || {}) as Record<string, unknown>;
      return !!(c.access_token || c.auth_token || c.api_key);
    });
    const credRow = withToken || rows[0] || null;
    const creds = (credRow?.credentials || {}) as Creds;
    const provider = (credRow?.provider as string | undefined) || "meta";

    // 4. Destinatario de la identidad/cliente propios; metadata.to no puede sustituirlo.
    const { data: conv } = await supabase.from("conversations").select("customer_id").eq("organization_id", msg.organization_id).eq("channel_id", msg.channel_id).eq("id", msg.conversation_id).single();
    if (!conv?.customer_id) throw new Error("Conversación propia no disponible");
    const recipient = await resolveRecipient(msg.organization_id, channel.type, msg.channel_id, conv.customer_id);
    if (!recipient) {
      await recordResult(reserved, { ok: false, error: "No se encontró destinatario", errorCode: "NO_RECIPIENT" }, channel.type);
      return json({ error: "No se encontró destinatario" }, 400);
    }

    // Revalidar tras consultas: una baja posterior al claim también impide llamar al proveedor.
    const gate = await evaluarContactoPersistido(supabase, msg.organization_id, msg.id);
    if (!gate.allowed) {
      await recordResult(reserved, { ok: false, error: "Contacto bloqueado antes del envío", errorCode: gate.reason }, channel.type);
      return json({ skipped: gate.reason });
    }
    const legal = await reservarContactoLegal(supabase, msg.organization_id, msg.id, reserved.dispatchToken, recipient, Deno.env.get("WHATSAPP_DEFAULT_COUNTRY_CODE"));
    if (!legal.allowed) {
      if (legal.retryAt) {
        const { data, error } = await supabase.rpc("crm_defer_message_legal", {
          p_org: msg.organization_id, p_message: msg.id, p_token: reserved.dispatchToken,
          p_at: legal.retryAt, p_reason: legal.reason,
        });
        if (error || !data?.job_id) throw new Error("No se pudo reprogramar el contacto");
        return json({ deferred: true, run_at: legal.retryAt, reason: legal.reason });
      }
      await recordResult(reserved, { ok: false, error: "Compuerta legal bloqueó el envío", errorCode: legal.reason }, channel.type, legal.uncertain ? "uncertain" : "failed");
      return json({ skipped: legal.reason, ...(legal.uncertain ? { pendingReconciliation: true } : {}) });
    }
    const payload = (msg.payload || {}) as Record<string, unknown>;
    const text = cleanText(msg.content || "");

    // 5a. Canal QR (Baileys) → Evolution API (solo texto)
    if (channel.type === "whatsapp" && provider === "baileys") {
      if (msg.content_type === "template") {
        await recordResult(reserved, { ok: false, error: "El canal QR no admite plantillas", errorCode: "CHANNEL_NO_TEMPLATES" }, "baileys");
        return json({ success: false, error: "CHANNEL_NO_TEMPLATES" }, 200);
      }
      const evolutionUrl = Deno.env.get("EVOLUTION_API_URL") || "";
      const evolutionKey = Deno.env.get("EVOLUTION_API_KEY") || "";
      if (!evolutionUrl) {
        await recordResult(reserved, { ok: false }, "baileys", "deferred");
        return json({ skipped: "baileys_pending_dispatch", channel: channel.type });
      }
      const instanceName = `wa-qr-${msg.channel_id}`;
      const number = recipient.replace(/@(s\.whatsapp\.net|lid)$/, "");
      const media = (payload.media ?? null) as { url?: string; mime?: string; filename?: string | null; caption?: string | null } | null;
      const isMedia = ["image", "file"].includes(msg.content_type) && media?.url;
      providerStarted = true;
      const sendRes = await fetch(`${evolutionUrl}/message/${isMedia ? "sendMedia" : "sendText"}/${instanceName}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: evolutionKey },
        body: JSON.stringify(isMedia
          ? { number, mediatype: (media!.mime || "").startsWith("image/") ? "image" : "document", media: media!.url, fileName: media!.filename || undefined, caption: media!.caption || undefined }
          : { number, text }),
      });
      const sendData = await sendRes.json().catch(() => ({}));
      const result: SendResult = { ok: sendRes.ok, uncertain: sendRes.status >= 500, externalId: sendData?.key?.id || sendData?.messageId, error: sendRes.ok ? undefined : (sendData?.error || sendData?.message || "Error Baileys"), errorCode: sendRes.ok ? undefined : String(sendRes.status), raw: sendData };
      await recordResult(reserved, result, "baileys");
      return json({ success: result.ok && !!result.externalId, pendingReconciliation: result.uncertain || (result.ok && !result.externalId), channel: "baileys", externalId: result.externalId, error: result.error });
    }

    // 5b. Enviar
    let result: SendResult;
    providerStarted = true;
    if (channel.type !== "whatsapp") {
      result = await sendMeta(channel.type, creds, recipient, text);
    } else if (provider === "twilio") {
      result = await sendTwilioWhatsApp(creds, recipient, { content: msg.content || "", content_type: msg.content_type, payload });
    } else if (msg.content_type === "template") {
      result = await sendWhatsAppTemplate(creds, recipient, payload.template);
    } else if (["image", "file"].includes(msg.content_type)) {
      result = await sendWhatsAppMedia(creds, recipient, (payload.media ?? null) as { url?: string; mime?: string; filename?: string | null; caption?: string | null } | null, msg.content_type);
    } else {
      result = await sendWhatsAppText(creds, recipient, text);
    }

    // 6. Registrar resultado
    await recordResult(reserved, result, channel.type === "whatsapp" ? provider : channel.type);

    if (result.uncertain || (result.ok && !result.externalId)) return json({ success: false, pendingReconciliation: true }, 202);
    if (!result.ok) return json({ success: false, error: result.error, errorCode: result.errorCode }, 200);
    return json({ success: true, externalId: result.externalId, channel: channel.type, provider });
  } catch (error) {
    if (reserved) {
      try {
        await recordResult(reserved, { ok: false, error: providerStarted ? "Entrega no confirmada; conciliar antes de reenviar" : "No se inició el envío", errorCode: providerStarted ? "PROVIDER_UNCERTAIN" : "DISPATCH_PREPARATION_FAILED" }, "dispatcher", providerStarted ? "uncertain" : "failed");
      } catch { console.error("[channel-dispatch] Resultado pendiente de conciliación", { messageId: reserved.id }); }
    }
    console.error("[channel-dispatch] Falló el despacho", { messageId: reserved?.id, detail: error instanceof Error ? error.message : "Error interno" });
    return json({ error: "No se pudo completar el despacho" }, 500);
  }
});
