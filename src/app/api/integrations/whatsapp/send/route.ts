import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import { getServiceClient } from '@/lib/supabase/server-service';
import { sendWhatsApp } from '@/lib/services/crm/whatsapp/outboundService';
import { defaultCountryOf, findCustomerIdByPhone, getOrgSettings, normalizePhoneDigits } from '@/lib/services/crm/whatsapp/channelService';
import { whatsappErrorResponse } from '@/lib/services/crm/whatsapp/http';
import { parseWith, zPlatformSendBody } from '@/lib/services/crm/whatsapp/schemas';

/**
 * POST /api/integrations/whatsapp/send — compatibilidad (F0/F9).
 *
 * F16: delega en `whatsappOutboundService.sendWhatsApp` (ventana 24 h,
 * consentimiento, plantillas, créditos, activity). Contrato de entrada
 * conservado: { channel_id, to, type?: 'text'|'template'|'image'|'document',
 *   text?: {body}, template?: {name, language:{code}, components?},
 *   image?: {link, caption?}, document?: {link, filename?, caption?},
 *   conversation_id?, customer_id?, opportunity_id? }
 * Respuesta: { success, message_id, conversation_id, activity_id, customer_id, dispatched_by }.
 * Nuevo código: usa POST /api/crm/whatsapp/send.
 */
export async function POST(request: NextRequest) {
  let ctx;
  try {
    ctx = await getServerOrgContext(request);
  } catch (err) {
    if (err instanceof OrgContextError) return NextResponse.json({ error: err.message, code: err.code }, { status: err.statusCode });
    throw err;
  }
  try {
    const body = parseWith(zPlatformSendBody, await request.json().catch(() => ({})));
    const { channel_id, to, type = 'text', text, template, image, document, conversation_id, customer_id, opportunity_id } = body;
    const organizationId = ctx.organizationId;
    if (body.organization_id !== undefined && Number(body.organization_id) !== organizationId) {
      return NextResponse.json({ error: 'organization_id no coincide con la organización activa' }, { status: 403 });
    }
    if (!channel_id) return NextResponse.json({ error: 'channel_id es requerido' }, { status: 400 });

    // Cliente: por id, por conversación o por teléfono.
    //
    // El `to` del CUERPO llega ya cualificado (quien llama sabe a qué número
    // manda), así que NO se le completa el indicativo por defecto: reescribirlo
    // sería inventarse un destinatario (tester F16 r3 · F-4). La búsqueda usa
    // `findCustomerIdByPhone`, la misma del webhook, en vez de una comparación
    // por sufijo propia que podía enganchar a otro cliente.
    let customerId: string | null = customer_id ?? null;
    if (!customerId && !conversation_id) {
      const digits = to ? normalizePhoneDigits(String(to)) : null;
      if (!digits) return NextResponse.json({ error: 'to (teléfono) o customer_id es requerido' }, { status: 400 });
      const service = getServiceClient();
      const defaultCountry = defaultCountryOf(await getOrgSettings(organizationId, service));
      customerId = await findCustomerIdByPhone(organizationId, digits, service, { defaultCountry });
      if (!customerId) return NextResponse.json({ error: 'No existe un cliente con ese teléfono en la organización; crea el cliente antes de enviar' }, { status: 400 });
    }

    const media = type === 'image' && image?.link
      ? { url: String(image.link), mime: 'image/jpeg', caption: image.caption ? String(image.caption) : undefined }
      : type === 'document' && document?.link
        ? { url: String(document.link), mime: 'application/pdf', filename: document.filename ? String(document.filename) : undefined, caption: document.caption ? String(document.caption) : undefined }
        : null;
    if (type === 'text' && !text?.body) return NextResponse.json({ error: 'text.body es requerido' }, { status: 400 });
    if (type === 'template' && (!template?.name || !template?.language?.code)) return NextResponse.json({ error: 'template.name y template.language.code son requeridos' }, { status: 400 });
    if ((type === 'image' || type === 'document') && !media) return NextResponse.json({ error: `${type}.link es requerido` }, { status: 400 });

    const r = await sendWhatsApp({
      orgId: organizationId,
      channelId: channel_id,
      customerId,
      conversationId: conversation_id ?? null,
      opportunityId: opportunity_id ?? null,
      text: type === 'text' ? String(text?.body ?? '') : null,
      rawTemplate: type === 'template' ? template : null,
      media,
      senderMemberId: ctx.memberId,
      senderUserId: ctx.userId,
      source: 'platform_send',
    }, ctx.supabase);

    return NextResponse.json({ success: true, message_id: r.message_id, conversation_id: r.conversation_id, activity_id: r.activity_id, customer_id: r.customer_id, dispatched_by: 'trg_channel_dispatch' });
  } catch (error) {
    return whatsappErrorResponse(error);
  }
}
