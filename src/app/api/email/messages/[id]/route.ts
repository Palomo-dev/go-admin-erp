import { NextRequest } from 'next/server';
import { emailErrorResponse, getServerOrgContext, ok } from '@/lib/services/crm/email/http';
import { parseWith, zUuid } from '@/lib/services/crm/email/schemas';
import { getMessageDetail } from '@/lib/services/crm/email/messagesService';
import { EmailError } from '@/lib/services/crm/email/types';

export const runtime = 'nodejs';

/**
 * GET /api/email/messages/[id] → { data: EmailMessage, events: EmailEvent[], thread: EmailMessage[] }
 * (`?events=true` legacy sigue funcionando: los eventos siempre se incluyen)
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getServerOrgContext(request);
    const { id: rawId } = await params;
    // uuid validado en la ruta: un id basura daba un 500 de Postgres (tester r2 #8).
    const id = parseWith(zUuid, rawId, 'id');
    const d = await getMessageDetail(ctx.organizationId, id, ctx.supabase);
    if (!d) throw new EmailError('NOT_FOUND', 'Email no encontrado', 404);
    return ok(d.message, 200, { events: d.events, thread: d.thread });
  } catch (err) {
    return emailErrorResponse(err, 'email/messages/[id] GET');
  }
}
