// ============================================================
// POST /api/integrations/sendgrid/send
// Envía un email a través de SendGrid
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { sendgridService } from '@/lib/services/integrations/sendgrid/sendgridService';
import type { SendGridSimpleEmail } from '@/lib/services/integrations/sendgrid/sendgridTypes';

export async function POST(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const body = await request.json();
    const { connection_id, organization_id, to, subject, html, text, template_id, template_data, categories, reply_to } = body;

    if (!to || !subject) {
      return NextResponse.json(
        { error: 'Se requiere "to" y "subject"' },
        { status: 400 }
      );
    }

    // Obtener credenciales por connection_id o organization_id
    let credentials;
    let connectionId: string | null = connection_id || null;

    if (connection_id) {
      credentials = await sendgridService.getCredentials(connection_id);
    } else if (organization_id) {
      const result = await sendgridService.getCredentialsByOrganization(organization_id);
      credentials = result.credentials;
      connectionId = result.connectionId;
    }

    if (!credentials) {
      return NextResponse.json(
        { error: 'No se encontraron credenciales de SendGrid. Verifica la conexión.' },
        { status: 404 }
      );
    }

    const emailData: SendGridSimpleEmail = {
      to,
      subject,
      html,
      text,
      templateId: template_id,
      templateData: template_data,
      categories,
      replyTo: reply_to,
    };

    const result = await sendgridService.sendSimpleEmail(credentials, emailData);

    // Registrar evento de envío
    if (connectionId) {
      await getSupabaseAdmin().from('integration_events').insert({
        connection_id: connectionId,
        organization_id: organization_id || null,
        source: 'api',
        direction: 'outbound',
        event_type: 'email.send',
        external_event_id: result.messageId || null,
        payload: {
          to,
          subject,
          template_id: template_id || null,
          categories: categories || [],
          status_code: result.statusCode,
        },
        status: result.success ? 'processed' : 'failed',
        error_message: result.error || null,
        event_time: new Date().toISOString(),
      });

      // Actualizar last_activity_at
      await getSupabaseAdmin()
        .from('integration_connections')
        .update({
          last_activity_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', connectionId);
    }

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error, statusCode: result.statusCode },
        { status: result.statusCode || 500 }
      );
    }

    return NextResponse.json({
      success: true,
      messageId: result.messageId,
    });
  } catch (err) {
    console.error('[API SendGrid Send] Error:', err);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
