// ============================================================
// POST /api/notifications/process
// Procesa y envía notificaciones email pendientes vía SendGrid
//
// F0 (C5 msg): sesión + org activa; se ignora organization_id del body.
// El servicio recibe el cliente service-role (antes usaba el cliente browser).
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import { getServiceClient } from '@/lib/supabase/server-service';
import { NotificationService } from '@/lib/services/notificationService';

export async function POST(request: NextRequest) {
  let ctx;
  try {
    ctx = await getServerOrgContext(request);
  } catch (err) {
    if (err instanceof OrgContextError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.statusCode });
    }
    throw err;
  }

  try {
    const body = await request.json().catch(() => ({}));
    if (body.organization_id !== undefined && Number(body.organization_id) !== ctx.organizationId) {
      return NextResponse.json({ error: 'organization_id no coincide con la organización activa' }, { status: 403 });
    }

    const result = await NotificationService.processEmailNotifications(ctx.organizationId, getServiceClient());

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
