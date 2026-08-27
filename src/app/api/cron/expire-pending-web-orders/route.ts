import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * GET /api/cron/expire-pending-web-orders
 *
 * Expira órdenes web pendientes que superaron el tiempo límite de pago.
 * Libera el stock reservado (qty_reserved) y marca las órdenes como 'expired'.
 *
 * Debe ser llamado por Vercel Cron cada 15 minutos.
 *
 * Seguridad: Requiere el header `Authorization: Bearer CRON_SECRET`.
 *
 * Query params:
 *   - minutes: tiempo de expiración global en minutos (default: 30).
 *     Se usa como fallback para organizaciones sin configuración propia.
 *
 * Configuración por organización (F11.4 — Ronda 2):
 *   La RPC `expire_pending_web_orders` lee `organization_settings` (clave
 *   'web_commerce', campo `order_expiration_minutes`) por organización.
 *   Si no está configurado, usa este `minutes` como fallback (o 24h para
 *   métodos de pago manuales: transfer, cash, pse, bancolombia_*).
 */

export async function GET(request: NextRequest) {
  try {
    // 1. Verificar autorización
    const authHeader = request.headers.get('authorization');
    const expectedToken = process.env.CRON_SECRET;

    if (!expectedToken) {
      console.error('[Expire Web Orders] CRON_SECRET no configurado');
      return NextResponse.json(
        { success: false, error: 'Servicio no configurado correctamente' },
        { status: 500 }
      );
    }

    const token = authHeader?.replace('Bearer ', '');
    if (token !== expectedToken) {
      return NextResponse.json(
        { success: false, error: 'No autorizado' },
        { status: 401 }
      );
    }

    // 2. Tiempo de expiración configurable (default 30 min)
    const { searchParams } = new URL(request.url);
    const minutes = parseInt(searchParams.get('minutes') || '30', 10);

    // 3. Crear cliente service_role
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

    // 4. Llamar a la RPC de expiración (atómica, con SKIP LOCKED)
    const { data, error } = await supabase.rpc('expire_pending_web_orders', {
      p_expiration_minutes: minutes,
    });

    if (error) {
      console.error('[Expire Web Orders] Error RPC:', error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    const expiredCount = data?.expired_count || 0;
    console.log(`[Expire Web Orders] ${expiredCount} órdenes expiradas (limite: ${minutes} min)`);

    return NextResponse.json({
      success: true,
      expiredCount,
      expirationMinutes: minutes,
      timestamp: new Date().toISOString(),
    });
  } catch (error: unknown) {
    console.error('[Expire Web Orders] Error inesperado:', error);
    const message = error instanceof Error ? error.message : 'Error interno del servidor';
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
