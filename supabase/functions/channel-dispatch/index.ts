// ============================================================
// Edge Function: channel-dispatch
// Despachador unificado de mensajes SALIENTES a proveedores Meta.
//
// Invocada por el trigger `trg_channel_dispatch` (AFTER INSERT en
// messages) cuando se inserta un mensaje outbound de un agente o de
// la IA en un canal de tipo whatsapp / facebook / instagram.
//
// Carga las credenciales del canal, resuelve el destinatario
// (teléfono o PSID/IGSID) y envía el texto vía Graph API.
// Registra el resultado en message_events y en messages.metadata.
// ============================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseKey);

const GRAPH = "https://graph.facebook.com/v21.0";
const DISPATCH_TYPES = ["whatsapp", "facebook", "instagram"];

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
  raw?: unknown;
}

/** Envío vía WhatsApp Cloud API */
async function sendWhatsApp(
  creds: Record<string, string>,
  to: string,
  text: string,
): Promise<SendResult> {
  if (!creds.phone_number_id || !creds.access_token) {
    return { ok: false, error: "Credenciales WhatsApp incompletas" };
  }
  const res = await fetch(`${GRAPH}/${creds.phone_number_id}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${creds.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body: text },
    }),
  });
  const data = await res.json().catch(() => ({}));
  return {
    ok: res.ok,
    externalId: data?.messages?.[0]?.id,
    error: data?.error?.message,
    raw: data,
  };
}

/** Envío vía Messenger / Instagram (Graph API) */
async function sendMeta(
  type: string,
  creds: Record<string, string>,
  recipientId: string,
  text: string,
): Promise<SendResult> {
  const accessToken = creds.page_access_token || creds.access_token;
  const node = type === "instagram"
    ? (creds.instagram_business_account_id || creds.page_id)
    : creds.page_id;

  if (!node || !accessToken) {
    return { ok: false, error: "Credenciales de página incompletas" };
  }

  const res = await fetch(`${GRAPH}/${node}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      recipient: { id: recipientId },
      messaging_type: "RESPONSE",
      message: { text },
    }),
  });
  const data = await res.json().catch(() => ({}));
  return {
    ok: res.ok,
    externalId: data?.message_id,
    error: data?.error?.message,
    raw: data,
  };
}

/** Resolver el destinatario (teléfono o PSID/IGSID) del customer */
async function resolveRecipient(
  channelType: string,
  channelId: string,
  customerId: string,
): Promise<string> {
  const identityTypeByChannel: Record<string, string> = {
    facebook: "facebook_psid",
    instagram: "instagram_user",
    whatsapp: "whatsapp_phone",
  };
  const identityType = identityTypeByChannel[channelType];

  const { data: ident } = await supabase
    .from("customer_channel_identities")
    .select("identity_value")
    .eq("channel_id", channelId)
    .eq("customer_id", customerId)
    .eq("identity_type", identityType)
    .maybeSingle();

  if (ident?.identity_value) return ident.identity_value as string;

  // Fallback para WhatsApp: teléfono del customer
  if (channelType === "whatsapp") {
    const { data: customer } = await supabase
      .from("customers")
      .select("phone")
      .eq("id", customerId)
      .single();
    return (customer?.phone as string) || "";
  }

  return "";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { messageId } = await req.json();
    if (!messageId) return json({ error: "messageId requerido" }, 400);

    // 1. Cargar el mensaje
    const { data: msg } = await supabase
      .from("messages")
      .select("id, content, content_type, channel_id, conversation_id, organization_id, direction, role, metadata")
      .eq("id", messageId)
      .single();

    if (!msg) return json({ error: "Mensaje no encontrado" }, 404);

    // Solo salientes de agente/IA y no ya despachados
    if (msg.direction !== "outbound" || !["agent", "ai"].includes(msg.role)) {
      return json({ skipped: "no es saliente de agente/ia" });
    }
    if (msg.metadata?.dispatched) {
      return json({ skipped: "ya despachado" });
    }

    // 2. Canal + tipo
    const { data: channel } = await supabase
      .from("channels")
      .select("id, type")
      .eq("id", msg.channel_id)
      .single();

    if (!channel || !DISPATCH_TYPES.includes(channel.type)) {
      return json({ skipped: "canal no despachable" });
    }

    // 3. Credenciales
    const { data: credRow } = await supabase
      .from("channel_credentials")
      .select("credentials")
      .eq("channel_id", msg.channel_id)
      .eq("provider", "meta")
      .maybeSingle();

    const creds = (credRow?.credentials || {}) as Record<string, string>;

    // 4. Destinatario
    const { data: conv } = await supabase
      .from("conversations")
      .select("customer_id")
      .eq("id", msg.conversation_id)
      .single();

    if (!conv?.customer_id) return json({ error: "Conversación sin customer" }, 400);

    const recipient = await resolveRecipient(channel.type, msg.channel_id, conv.customer_id);
    if (!recipient) return json({ error: "No se encontró destinatario" }, 400);

    // 5. Enviar
    const text = cleanText(msg.content || "");
    const result = channel.type === "whatsapp"
      ? await sendWhatsApp(creds, recipient, text)
      : await sendMeta(channel.type, creds, recipient, text);

    // 6. Registrar resultado
    await supabase.from("message_events").insert({
      organization_id: msg.organization_id,
      message_id: msg.id,
      event_type: result.ok ? "sent" : "failed",
      provider_payload: result.raw || {},
      error_message: result.ok ? null : (result.error || "Error desconocido"),
    });

    await supabase
      .from("messages")
      .update({
        metadata: {
          ...(msg.metadata || {}),
          dispatched: result.ok,
          dispatch_channel: channel.type,
          external_message_id: result.externalId || null,
          dispatch_error: result.ok ? null : (result.error || "Error desconocido"),
        },
      })
      .eq("id", msg.id);

    if (!result.ok) {
      return json({ success: false, error: result.error }, 200);
    }

    return json({ success: true, externalId: result.externalId, channel: channel.type });
  } catch (error) {
    console.error("[channel-dispatch] Error:", error);
    return json({ error: error instanceof Error ? error.message : "Error interno" }, 500);
  }
});
