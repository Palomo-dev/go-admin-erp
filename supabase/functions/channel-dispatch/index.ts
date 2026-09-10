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
    externalId: data?.message_id,
    error: data?.error?.message,
    errorCode: data?.error?.code != null ? String(data.error.code) : undefined,
    raw: data,
  };
}

/** Resolver el destinatario (teléfono o PSID/IGSID) del customer */
async function resolveRecipient(channelType: string, channelId: string, customerId: string, preferred?: string | null): Promise<string> {
  if (channelType === "whatsapp" && preferred) return preferred.replace(/\D/g, "");
  const identityTypeByChannel: Record<string, string> = { facebook: "facebook_psid", instagram: "instagram_user", whatsapp: "whatsapp_phone" };
  const identityType = identityTypeByChannel[channelType];
  const { data: ident } = await supabase
    .from("customer_channel_identities")
    .select("identity_value")
    .eq("channel_id", channelId)
    .eq("customer_id", customerId)
    .eq("identity_type", identityType)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (ident?.identity_value) return ident.identity_value as string;
  if (channelType === "whatsapp") {
    const { data: customer } = await supabase.from("customers").select("phone").eq("id", customerId).single();
    return ((customer?.phone as string) || "").replace(/\D/g, "");
  }
  return "";
}

async function recordResult(msg: { id: string; organization_id: number; metadata: Record<string, unknown> | null }, result: SendResult, dispatchChannel: string) {
  // `event_time` es GENERATED ALWAYS AS (created_at) en la BD: incluirla hace
  // fallar el INSERT entero con 428C9 y, sin comprobar el error, todos los
  // eventos de despacho se perdían en silencio (tester F16 r2 · F-1).
  const { error: eventError } = await supabase.from("message_events").insert({
    organization_id: msg.organization_id,
    message_id: msg.id,
    event_type: result.ok ? "sent" : "failed",
    provider_payload: result.raw || {},
    error_code: result.ok ? null : (result.errorCode ?? null),
    error_message: result.ok ? null : (result.error || "Error desconocido"),
  });
  if (eventError) {
    console.error("[channel-dispatch] message_events NO PERSISTIDO", {
      organization_id: msg.organization_id,
      message_id: msg.id,
      error: eventError.message,
    });
  }
  await supabase
    .from("messages")
    .update({
      external_message_id: result.externalId || null,
      metadata: {
        ...(msg.metadata || {}),
        dispatched: result.ok,
        dispatch_channel: dispatchChannel,
        external_message_id: result.externalId || null,
        dispatch_error: result.ok ? null : (result.error || "Error desconocido"),
        dispatch_error_code: result.ok ? null : (result.errorCode ?? null),
        dispatched_at: new Date().toISOString(),
      },
    })
    .eq("id", msg.id);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { messageId } = await req.json();
    if (!messageId) return json({ error: "messageId requerido" }, 400);

    // 1. Cargar el mensaje (payload + related_opportunity_id)
    const { data: msg } = await supabase
      .from("messages")
      .select("id, content, content_type, channel_id, conversation_id, organization_id, direction, role, metadata, payload, related_opportunity_id")
      .eq("id", messageId)
      .single();
    if (!msg) return json({ error: "Mensaje no encontrado" }, 404);

    if (msg.direction !== "outbound" || !["agent", "ai"].includes(msg.role)) return json({ skipped: "no es saliente de agente/ia" });
    if (msg.metadata?.dispatched) return json({ skipped: "ya despachado" });

    // 2. Canal + tipo
    const { data: channel } = await supabase.from("channels").select("id, type").eq("id", msg.channel_id).single();
    if (!channel || !DISPATCH_TYPES.includes(channel.type)) return json({ skipped: "canal no despachable" });

    // 3. Credenciales / proveedor.
    // `channel_credentials` es UNIQUE (channel_id, provider), NO (channel_id):
    // un canal con credenciales `meta` y `twilio` haría fallar `maybeSingle()`
    // y todos sus envíos morirían con NO_CREDENTIALS sin aviso (tester r1 · 11).
    const { data: credRows } = await supabase
      .from("channel_credentials")
      .select("credentials, provider")
      .eq("channel_id", msg.channel_id)
      .order("updated_at", { ascending: false })
      .limit(5);
    const rows = (credRows || []) as Array<{ credentials?: Record<string, unknown>; provider?: string }>;
    const withToken = rows.find((r) => {
      const c = (r.credentials || {}) as Record<string, unknown>;
      return !!(c.access_token || c.auth_token || c.api_key);
    });
    const credRow = withToken || rows[0] || null;
    const creds = (credRow?.credentials || {}) as Creds;
    const provider = (credRow?.provider as string | undefined) || "meta";

    // 4. Destinatario (metadata.to del CRM tiene prioridad para WhatsApp)
    const { data: conv } = await supabase.from("conversations").select("customer_id").eq("id", msg.conversation_id).single();
    if (!conv?.customer_id) return json({ error: "Conversación sin customer" }, 400);
    const recipient = await resolveRecipient(channel.type, msg.channel_id, conv.customer_id, (msg.metadata?.to as string | undefined) ?? null);
    if (!recipient) {
      await recordResult(msg, { ok: false, error: "No se encontró destinatario", errorCode: "NO_RECIPIENT" }, channel.type);
      return json({ error: "No se encontró destinatario" }, 400);
    }

    const payload = (msg.payload || {}) as Record<string, unknown>;
    const text = cleanText(msg.content || "");

    // 5a. Canal QR (Baileys) → Evolution API (solo texto)
    if (channel.type === "whatsapp" && provider === "baileys") {
      if (msg.content_type === "template") {
        await recordResult(msg, { ok: false, error: "El canal QR no admite plantillas", errorCode: "CHANNEL_NO_TEMPLATES" }, "baileys");
        return json({ success: false, error: "CHANNEL_NO_TEMPLATES" }, 200);
      }
      const evolutionUrl = Deno.env.get("EVOLUTION_API_URL") || "";
      const evolutionKey = Deno.env.get("EVOLUTION_API_KEY") || "";
      if (!evolutionUrl) {
        await supabase.from("messages").update({ metadata: { ...(msg.metadata || {}), dispatch_pending: true, dispatch_method: "baileys" } }).eq("id", msg.id);
        return json({ skipped: "baileys_pending_dispatch", channel: channel.type });
      }
      const instanceName = `wa-qr-${msg.channel_id}`;
      const number = recipient.replace(/@(s\.whatsapp\.net|lid)$/, "");
      const media = (payload.media ?? null) as { url?: string; mime?: string; filename?: string | null; caption?: string | null } | null;
      const isMedia = ["image", "file"].includes(msg.content_type) && media?.url;
      const sendRes = await fetch(`${evolutionUrl}/message/${isMedia ? "sendMedia" : "sendText"}/${instanceName}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: evolutionKey },
        body: JSON.stringify(isMedia
          ? { number, mediatype: (media!.mime || "").startsWith("image/") ? "image" : "document", media: media!.url, fileName: media!.filename || undefined, caption: media!.caption || undefined }
          : { number, text }),
      });
      const sendData = await sendRes.json().catch(() => ({}));
      const result: SendResult = { ok: sendRes.ok, externalId: sendData?.key?.id || sendData?.messageId, error: sendRes.ok ? undefined : (sendData?.error || sendData?.message || "Error Baileys"), errorCode: sendRes.ok ? undefined : String(sendRes.status), raw: sendData };
      await recordResult(msg, result, "baileys");
      return json({ success: result.ok, channel: "baileys", externalId: result.externalId, error: result.error });
    }

    // 5b. Enviar
    let result: SendResult;
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
    await recordResult(msg, result, channel.type === "whatsapp" ? provider : channel.type);

    if (!result.ok) return json({ success: false, error: result.error, errorCode: result.errorCode }, 200);
    return json({ success: true, externalId: result.externalId, channel: channel.type, provider });
  } catch (error) {
    console.error("[channel-dispatch] Error:", error);
    return json({ error: error instanceof Error ? error.message : "Error interno" }, 500);
  }
});
