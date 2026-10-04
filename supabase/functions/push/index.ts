// Este código se ejecuta en Supabase Edge Runtime (Deno). No se compila con tsc del proyecto.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { sendNativePush } from './nativePush.ts';

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Firebase service account para FCM HTTP v1
const fcmProjectId = Deno.env.get("FCM_PROJECT_ID")!;
const fcmClientEmail = Deno.env.get("FCM_CLIENT_EMAIL")!;
const fcmPrivateKey = Deno.env.get("FCM_PRIVATE_KEY") || '';

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


Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  // El trigger usa la clave de servicio; un JWT de usuario no puede enviar pushes ajenos.
  if (!serviceRoleKey || req.headers.get('authorization') !== `Bearer ${serviceRoleKey}`) {
    return new Response('Forbidden', { status: 403 });
  }

  const payload: WebhookPayload = await req.json();

  if (payload.record.channel !== "push" && payload.record.channel !== "app") {
    return new Response(JSON.stringify({ skipped: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const title = payload.record.payload.title || "GO Admin ERP";
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
    for (const { token, platform } of tokens) {
      let result = { ok: false, invalid: false };
      try {
        result = await sendNativePush(platform, token, title, body, data, {
          fcmProjectId, fcmClientEmail, fcmPrivateKey,
          apnsTeamId: Deno.env.get('APNS_TEAM_ID'), apnsKeyId: Deno.env.get('APNS_KEY_ID'),
          apnsTopic: Deno.env.get('APNS_TOPIC'), apnsPrivateKey: Deno.env.get('APNS_PRIVATE_KEY'),
          apnsSandbox: Deno.env.get('APNS_SANDBOX') === 'true',
        });
      } catch { console.warn('[push] Transporte nativo no disponible'); }
      if (result.ok) {
        fcmSent++;
      } else if (result.invalid) {
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
