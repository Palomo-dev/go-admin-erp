import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import { updateEmailDomain } from '@/lib/services/crm/emailService';

/**
 * PATCH /api/email/domains/[id] — Actualiza un dominio de email.
 * Body: campos parciales del dominio.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await getServerOrgContext();
    const { id } = await params;
    const body = await request.json();

    const domain = await updateEmailDomain(id, ctx.organizationId, body, ctx.supabase);

    if (!domain) {
      return NextResponse.json(
        { success: false, error: 'Dominio no encontrado' },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true, data: domain }, { status: 200 });
  } catch (error: unknown) {
    if (error instanceof OrgContextError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode },
      );
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[Email Domains] PATCH error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
