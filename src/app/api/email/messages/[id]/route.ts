import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import { getEmail, getEmailEvents } from '@/lib/services/crm/emailService';

/**
 * GET /api/email/messages/[id] — Obtiene el detalle de un email + sus eventos.
 * Query: ?events=true para incluir eventos.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await getServerOrgContext();
    const { id } = await params;
    const includeEvents = request.nextUrl.searchParams.get('events') === 'true';

    const message = await getEmail(id, ctx.organizationId, ctx.supabase);

    if (!message) {
      return NextResponse.json(
        { success: false, error: 'Email no encontrado' },
        { status: 404 },
      );
    }

    let events = null;
    if (includeEvents) {
      events = await getEmailEvents(id, ctx.organizationId, ctx.supabase);
    }

    return NextResponse.json(
      { success: true, data: message, events },
      { status: 200 },
    );
  } catch (error: unknown) {
    if (error instanceof OrgContextError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode },
      );
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[Email Message] GET error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
