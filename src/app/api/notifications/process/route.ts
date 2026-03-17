// ============================================================
// POST /api/notifications/process
// Procesa y envía notificaciones email pendientes vía SendGrid
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NotificationService } from '@/lib/services/notificationService';

export async function POST(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const organizationId = body.organization_id;

    if (!organizationId) {
      return NextResponse.json(
        { error: 'Se requiere organization_id' },
        { status: 400 }
      );
    }

    const result = await NotificationService.processEmailNotifications(organizationId);

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (err) {
    console.error('[API Notifications Process] Error:', err);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
