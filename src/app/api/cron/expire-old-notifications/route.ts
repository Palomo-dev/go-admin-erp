import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * GET /api/cron/expire-old-notifications
 *
 * Auto-limpieza de notificaciones viejas (TTL por etapas):
 *   - Etapa 1: marca como leídas (read_at = now()) las no leídas con > unread_ttl_days (default 30).
 *   - Etapa 2: elimina (status = 'deleted') las notificaciones con > delete_ttl_days (default 90).
 *   TTL configurable por organización en organization_settings (key='notifications').
 *
 * Debe ser llamado por Vercel Cron diario a las 3 AM UTC.
 *
 * Seguridad: Requiere el header `Authorization: Bearer CRON_SECRET`.
 */

export async function GET(request: NextRequest) {
  try {
    // 1. Verificar autorización
    const authHeader = request.headers.get('authorization');
    const expectedToken = process.env.CRON_SECRET;

    if (!expectedToken) {
      console.error('[Expire Old Notifications] CRON_SECRET no configurado');
      return NextResponse.json(
        { success: false, error: 'Servicio no configurado correctamente' },
        { status: 500 }
      );
    }

    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
    if (token !== expectedToken) {
      return NextResponse.json(
        { success: false, error: 'No autorizado' },
        { status: 401 }
      );
    }

    // 2. Crear cliente service_role
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceKey) {
      return NextResponse.json(
        { success: false, error: 'Variables de entorno no configuradas' },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // 3. Llamar a la RPC de auto-limpieza (atómica, por organización)
    const { data, error } = await supabase.rpc('expire_old_notifications');

    if (error) {
      console.error('[Expire Old Notifications] Error RPC:', error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    const markedRead = data?.marked_read || 0;
    const deleted = data?.deleted || 0;
    const processedOrgs = data?.processed_orgs || 0;

    console.log(
      `[Expire Old Notifications] ${markedRead} marcadas como leídas, ${deleted} eliminadas, ${processedOrgs} organizaciones procesadas`
    );

    return NextResponse.json({
      success: true,
      markedRead,
      deleted,
      processedOrgs,
      timestamp: new Date().toISOString(),
    });
  } catch (error: unknown) {
    console.error('[Expire Old Notifications] Error inesperado:', error);
    const message = error instanceof Error ? error.message : 'Error interno del servidor';
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
