// ============================================================
// POST /api/integrations/sendgrid/send
// Envía un email a través de SendGrid
//
// F0 (C5 msg): sesión + org activa; `organization_id` del body se ignora y
// `connection_id` debe pertenecer a la org (integration_connections.organization_id).
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import { getServiceClient } from '@/lib/supabase/server-service';
import { sendgridService } from '@/lib/services/integrations/sendgrid/sendgridService';
import type { SendGridSimpleEmail } from '@/lib/services/integrations/sendgrid/sendgridTypes';

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
    const body = await request.json();
    const { connection_id, to, subject, html, text, template_id, template_data, categories, reply_to } = body;
    const organizationId = ctx.organizationId;

    if (body.organization_id !== undefined && Number(body.organization_id) !== organizationId) {
      return NextResponse.json({ error: 'organization_id no coincide con la organización activa' }, { status: 403 });
    }

    if (!to || !subject) {
      return NextResponse.json(
        { error: 'Se requiere "to" y "subject"' },
        { status: 400 }
      );
    }

    const admin = getServiceClient();

    // Obtener credenciales por connection_id (verificando ownership) o por organización
    let credentials;
    let connectionId: string | null = null;

    if (connection_id) {
      const { data: conn } = await admin
        .from('integration_connections')
        .select('id')
        .eq('id', connection_id)
        .eq('organization_id', organizationId)
        .maybeSingle();
      if (!conn) {
        return NextResponse.json({ error: 'Conexión no encontrada en la organización' }, { status: 404 });
      }
      connectionId = conn.id;
      credentials = await sendgridService.getCredentials(connection_id);
    } else {
      const result = await sendgridService.getCredentialsByOrganization(organizationId);
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
      await admin.from('integration_events').insert({
        connection_id: connectionId,
        organization_id: organizationId,
        source: 'system',
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
        // event_time es GENERATED ALWAYS AS (created_at) en integration_events,
        // no se puede insertar manualmente.
      });

      // Actualizar last_activity_at
      await admin
        .from('integration_connections')
        .update({
          last_activity_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', connectionId)
        .eq('organization_id', organizationId);
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
