import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import { sendEmail } from '@/lib/services/crm/emailService';

/**
 * POST /api/email/send — Envía un email vía Resend.
 * Body: { to, subject, html?, text?, template_id?, template_variables?,
 *         to_customer_id?, cc?, bcc?, related_type?, related_id?,
 *         sequence_step_run_id?, scheduled_at?, idempotency_key?, metadata? }
 */
export async function POST(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext();
    const body = await request.json();

    if (!body?.to || !body?.subject) {
      return NextResponse.json(
        { success: false, error: 'Faltan campos obligatorios: to, subject' },
        { status: 400 },
      );
    }

    if (!body.html && !body.text && !body.template_id) {
      return NextResponse.json(
        { success: false, error: 'Se requiere html, text o template_id' },
        { status: 400 },
      );
    }

    const message = await sendEmail(ctx.organizationId, {
      to: body.to,
      to_customer_id: body.to_customer_id,
      cc: body.cc,
      bcc: body.bcc,
      subject: body.subject,
      html: body.html,
      text: body.text,
      template_id: body.template_id,
      template_variables: body.template_variables,
      related_type: body.related_type,
      related_id: body.related_id,
      sequence_step_run_id: body.sequence_step_run_id,
      scheduled_at: body.scheduled_at,
      idempotency_key: body.idempotency_key,
      metadata: body.metadata,
    }, ctx.supabase);

    return NextResponse.json({ success: true, data: message }, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof OrgContextError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode },
      );
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[Email Send] POST error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
