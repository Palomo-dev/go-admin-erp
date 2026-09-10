/**
 * API Route: Enviar WhatsApp via Twilio
 * POST /api/integrations/twilio/send-whatsapp
 *
 * Seguridad (F0, C4 msg): sesión + org activa (`getServerOrgContext`);
 * el `orgId` del body se ignora (si viene y no coincide → 403).
 */

import { NextRequest, NextResponse } from 'next/server';
import { twilioService } from '@/lib/services/integrations/twilio';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import { getServiceClient } from '@/lib/supabase/server-service';
import { canContact } from '@/lib/services/crm/whatsapp/consent';
import { defaultCountryOf, findCustomerIdByPhone, getOrgSettings, normalizePhoneDigits } from '@/lib/services/crm/whatsapp/channelService';

/**
 * ¿El número corresponde a un cliente de la organización que pidió la baja de
 * WhatsApp?
 *
 * El número que se ENVÍA no se toca: aquí solo se busca a quién pertenece. Por
 * eso la búsqueda sí puede probar además con el indicativo por defecto de la
 * organización — pasarse de ancho al BUSCAR una baja es el lado seguro; no
 * encontrarla sería seguir escribiendo a quien no quiere.
 */
async function destinatarioDioDeBaja(orgId: number, to: string): Promise<boolean> {
  try {
    const service = getServiceClient();
    const cualificado = normalizePhoneDigits(to);
    const settings = await getOrgSettings(orgId, service);
    const conIndicativo = normalizePhoneDigits(to, defaultCountryOf(settings));
    for (const digits of [cualificado, conIndicativo]) {
      if (!digits) continue;
      const customerId = await findCustomerIdByPhone(orgId, digits, service, { defaultCountry: defaultCountryOf(settings) });
      if (customerId) return !(await canContact(orgId, customerId, 'whatsapp', 'utility', service));
    }
  } catch (err) {
    // `canContact` ya es fail-closed; un fallo al RESOLVER el cliente no puede
    // bloquear un envío legítimo a un número que ni siquiera es cliente.
    console.warn('[twilio/send-whatsapp] no se pudo comprobar el consentimiento:', err instanceof Error ? err.message : err);
  }
  return false;
}

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
    const { to, message, module, mediaUrl } = body;
    const orgId = ctx.organizationId;

    if (body.orgId !== undefined && Number(body.orgId) !== orgId) {
      return NextResponse.json({ error: 'orgId no coincide con la organización activa' }, { status: 403 });
    }

    if (!to || !message) {
      return NextResponse.json(
        { error: 'Faltan campos requeridos: to, message' },
        { status: 400 }
      );
    }

    // CONSENTIMIENTO ANTES DEL PROVEEDOR (Ley 1581 de 2012).
    //
    // Esta ruta llama a Twilio DIRECTAMENTE: no inserta en `messages`, así que
    // no la cubren ni `whatsappOutboundService` ni el disparador
    // `trigger_channel_dispatch` (que es donde vive hoy el punto único de
    // opt-out). Sin esta comprobación se le podía escribir por WhatsApp a
    // quien había pedido la baja. Encontrado en la pasada de gemelos de F16 r4.
    const optedOut = await destinatarioDioDeBaja(orgId, String(to));
    if (optedOut) {
      return NextResponse.json({ error: 'El contacto pidió no recibir WhatsApp (opt-out)', code: 'OPTED_OUT' }, { status: 422 });
    }

    const result = await twilioService.sendWhatsApp(orgId, to, message, module, mediaUrl);

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      messageSid: result.messageSid,
      status: result.status,
      creditsUsed: result.creditsUsed,
    });
  } catch (error) {
    console.error('[API] Error enviando WhatsApp:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
