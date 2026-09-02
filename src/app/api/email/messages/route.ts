import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import { getEmails, type EmailMessageStatus } from '@/lib/services/crm/emailService';

/**
 * GET /api/email/messages — Lista emails enviados con filtros opcionales.
 * Query: ?status=&to_customer_id=&related_type=&related_id=&limit=&offset=
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext();
    const params = request.nextUrl.searchParams;

    const result = await getEmails(ctx.organizationId, ctx.supabase, {
      status: (params.get('status') as EmailMessageStatus | null) || undefined,
      to_customer_id: params.get('to_customer_id') || undefined,
      related_type: params.get('related_type') || undefined,
      related_id: params.get('related_id') || undefined,
      limit: params.get('limit') ? parseInt(params.get('limit')!, 10) : undefined,
      offset: params.get('offset') ? parseInt(params.get('offset')!, 10) : undefined,
    });

    return NextResponse.json(
      { success: true, data: result.data, count: result.count },
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
    console.error('[Email Messages] GET error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
