/**
 * API Route para enviar notificaciones Web Push a un usuario.
 *
 * POST /api/push/web
 * Body: { userId: string, title: string, body: string, url?: string }
 *
 * Busca todas las suscripciones web push del usuario en Supabase
 * y envía la notificación a cada una usando web-push.
 */

import { NextRequest, NextResponse } from 'next/server';
import webpush from 'web-push';
import { createClient } from '@supabase/supabase-js';

// Configurar VAPID details (solo en el servidor)
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '';
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@goadmin.io';

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

// Service role client para acceder a web_push_subscriptions sin RLS
function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(supabaseUrl, serviceKey);
}

export async function POST(request: NextRequest) {
  try {
    const { userId, title, body, url } = await request.json();

    if (!userId || !title || !body) {
      return NextResponse.json(
        { error: 'Faltan campos requeridos: userId, title, body' },
        { status: 400 },
      );
    }

    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
      return NextResponse.json(
        { error: 'VAPID keys no configuradas' },
        { status: 500 },
      );
    }

    const supabase = getSupabaseAdmin();

    // Obtener todas las suscripciones del usuario
    const { data: subscriptions, error } = await supabase
      .from('web_push_subscriptions')
      .select('*')
      .eq('user_id', userId);

    if (error) {
      return NextResponse.json(
        { error: 'Error consultando suscripciones: ' + error.message },
        { status: 500 },
      );
    }

    if (!subscriptions || subscriptions.length === 0) {
      return NextResponse.json(
        { message: 'El usuario no tiene suscripciones web push activas' },
        { status: 200 },
      );
    }

    // Enviar push a cada suscripción
    const results = await Promise.allSettled(
      subscriptions.map((sub) => {
        const pushSubscription = {
          endpoint: sub.endpoint,
          keys: sub.keys,
        };

        const payload = JSON.stringify({
          title,
          body,
          url: url || '/',
        });

        return webpush.sendNotification(pushSubscription, payload);
      }),
    );

    const succeeded = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.filter((r) => r.status === 'rejected').length;

    // Eliminar suscripciones que ya no son válidas (410 Gone)
    const invalidEndpoints = results
      .map((r, i) => {
        if (r.status === 'rejected') {
          const reason = (r as PromiseRejectedResult).reason;
          if (reason && reason.statusCode === 410) {
            return subscriptions[i].endpoint;
          }
        }
        return null;
      })
      .filter(Boolean);

    if (invalidEndpoints.length > 0) {
      await supabase
        .from('web_push_subscriptions')
        .delete()
        .in('endpoint', invalidEndpoints);
    }

    return NextResponse.json({
      success: true,
      sent: succeeded,
      failed,
      cleaned: invalidEndpoints.length,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Error interno: ' + error.message },
      { status: 500 },
    );
  }
}
