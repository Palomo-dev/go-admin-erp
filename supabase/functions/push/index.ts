// @ts-nocheck — Edge Function de Deno (no Node.js). El IDE no entiende jsr: imports.
// Este código se ejecuta en Supabase Edge Runtime (Deno). No se compila con tsc del proyecto.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Firebase service account para FCM HTTP v1
const fcmProjectId = Deno.env.get("FCM_PROJECT_ID")!;
const fcmClientEmail = Deno.env.get("FCM_CLIENT_EMAIL")!;
const fcmPrivateKey = Deno.env.get("FCM_PRIVATE_KEY")!.replace(/\\n/g, "\n");

// ERP base URL para despachar Web Push (PWA) sin repetir lógica:
// la Edge Function orquesta FCM/APNs + Web Push en un solo flujo.
const erpBaseUrl = Deno.env.get("ERP_BASE_URL") || "https://app.goadmin.io";
const pushWebhookSecret = Deno.env.get("PUSH_WEBHOOK_SECRET") || "";

interface WebhookPayload {
  type: "INSERT";
  table: string;
  record: {
    id: string;
    recipient_user_id: string | null;
    organization_id: number | null;
    channel: string;
    payload: {
      title?: string;
      body?: string;
      data?: Record<string, string>;
      type?: string;
    };
    status: string;
  };
  old_record: null;
}

/**
 * Obtiene un access token de Firebase usando JWT + service account.
 * El token dura 1 hora; se recomienda cachearlo.
 */
async function getFcmAccessToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: fcmClientEmail,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  };

  // Crear JWT firmado con RS256
  const encoder = new TextEncoder();
  const header = btoa(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const body = btoa(JSON.stringify(payload));
  const unsigned = `${header}.${body}`;

  const keyData = await crypto.subtle.importKey(
    "pkcs8",
    strToUint8Array(fcmPrivateKey),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    keyData,
    encoder.encode(unsigned)
  );
  const jwt = `${unsigned}.${btoa(String.fromCharCode(...new Uint8Array(signature)))}`;

  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });
  const data = await resp.json();
  return data.access_token;
}

function strToUint8Array(str: string): Uint8Array {
  // Convertir PEM private key a ArrayBuffer para importKey
  const pem = str
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s/g, "");
  const binary = atob(pem);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Envía push notification vía FCM HTTP v1 API.
 * FCM enruta automáticamente a Android (FCM) o iOS (APNs).
 */
async function sendPush(
  token: string,
  title: string,
  body: string,
  data?: Record<string, string>
): Promise<boolean> {
  const accessToken = await getFcmAccessToken();
  const url = `https://fcm.googleapis.com/v1/projects/${fcmProjectId}/messages:send`;

  const message: Record<string, unknown> = {
    token,
    notification: { title, body },
    android: {
      priority: "high",
      notification: { channelId: "goadmin_default", sound: "default" },
    },
    apns: {
      payload: {
        aps: { sound: "default", badge: 1 },
      },
    },
  };

  if (data) {
    message.data = data;
  }

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ message }),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    console.error("[push] FCM error:", resp.status, errText);
    return false;
  }
  return true;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const payload: WebhookPayload = await req.json();

  if (payload.record.channel !== "push" && payload.record.channel !== "app") {
    return new Response(JSON.stringify({ skipped: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const title = payload.record.payload.title || "GoAdmin ERP";
  const body = payload.record.payload.body || "";
  const data = payload.record.payload.data;
  const url = data?.url || "/";

  // Determinar los destinatarios:
  // - Si recipient_user_id existe → solo ese usuario
  // - Si es null y hay organization_id → todos los miembros activos de la org
  let targetUserIds: string[] = [];

  if (payload.record.recipient_user_id) {
    targetUserIds = [payload.record.recipient_user_id];
  } else if (payload.record.organization_id) {
    const { data: members, error: memberErr } = await supabase
      .from("organization_members")
      .select("user_id")
      .eq("organization_id", payload.record.organization_id)
      .eq("is_active", true);

    if (memberErr) {
      console.warn("[push] Error querying org members:", memberErr.message);
    } else if (members) {
      targetUserIds = members.map((m) => m.user_id).filter(Boolean);
    }
  }

  if (targetUserIds.length === 0) {
    return new Response(JSON.stringify({ skipped: "no recipients" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  // ── Canal 1: FCM/APNs (APK nativo) ──
  // Consultar tokens de TODOS los usuarios destinatarios
  const { data: tokens, error } = await supabase
    .from("device_push_tokens")
    .select("token, platform, user_id")
    .in("user_id", targetUserIds);

  let fcmSent = 0;
  const expiredTokens: string[] = [];

  if (error) {
    console.warn("[push] Error querying device_push_tokens:", error.message);
  } else if (tokens && tokens.length > 0) {
    for (const { token } of tokens) {
      const ok = await sendPush(token, title, body, data);
      if (ok) {
        fcmSent++;
      } else {
        expiredTokens.push(token);
      }
    }

    // Limpiar tokens inválidos
    if (expiredTokens.length > 0) {
      await supabase
        .from("device_push_tokens")
        .delete()
        .in("token", expiredTokens);
    }
  }

  // ── Canal 2: Web Push (PWA) ──
  // Despacha al endpoint del ERP que ya tiene la lógica de web-push + VAPID.
  // Se envía un request por cada usuario destinatario.
  let webPushSent = 0;
  const wpHeaders: Record<string, string> = { "Content-Type": "application/json" };
  if (pushWebhookSecret) {
    wpHeaders["x-internal-secret"] = pushWebhookSecret;
  }

  for (const uid of targetUserIds) {
    try {
      const wpResp = await fetch(`${erpBaseUrl}/api/push/web`, {
        method: "POST",
        headers: wpHeaders,
        body: JSON.stringify({ userId: uid, title, body, url }),
      });

      if (wpResp.ok) {
        const wpData = await wpResp.json();
        webPushSent += wpData.sent || 0;
      } else {
        console.warn("[push] Web Push endpoint responded:", wpResp.status);
      }
    } catch (err) {
      console.warn("[push] Error despachando Web Push:", err);
    }
  }

  // Marcar notificación como enviada (si al menos un canal tuvo éxito)
  if (fcmSent > 0 || webPushSent > 0) {
    await supabase
      .from("notifications")
      .update({ status: "sent", sent_at: new Date().toISOString() })
      .eq("id", payload.record.id);
  }

  return new Response(
    JSON.stringify({
      recipients: targetUserIds.length,
      fcm_sent: fcmSent,
      web_push_sent: webPushSent,
      expired: expiredTokens.length,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
});

/* eslint-disable */
function btoa(s: string): string {
  return globalThis.btoa(s);
}
function atob(s: string): string {
  return globalThis.atob(s);
}
