import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import { getEmailDomains, createEmailDomain } from '@/lib/services/crm/emailService';

/**
 * GET /api/email/domains — Lista los dominios de email de la organización.
 */
export async function GET() {
  try {
    const ctx = await getServerOrgContext();
    const domains = await getEmailDomains(ctx.organizationId, ctx.supabase);

    return NextResponse.json({ success: true, data: domains }, { status: 200 });
  } catch (error: unknown) {
    if (error instanceof OrgContextError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode },
      );
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[Email Domains] GET error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

/**
 * POST /api/email/domains — Registra un nuevo dominio de email.
 * Body: { domain, from_email, from_name?, reply_to?, provider?, is_default?, ... }
 */
export async function POST(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext();
    const body = await request.json();

    if (!body?.domain || !body?.from_email) {
      return NextResponse.json(
        { success: false, error: 'Faltan campos obligatorios: domain, from_email' },
        { status: 400 },
      );
    }

    const domain = await createEmailDomain(
      ctx.organizationId,
      {
        domain: body.domain,
        from_email: body.from_email,
        from_name: body.from_name,
        reply_to: body.reply_to,
        provider: body.provider,
        provider_domain_id: body.provider_domain_id,
        credential_id: body.credential_id,
        is_default: body.is_default,
      },
      ctx.supabase,
    );

    return NextResponse.json({ success: true, data: domain }, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof OrgContextError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode },
      );
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[Email Domains] POST error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
