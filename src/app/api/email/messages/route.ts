import { NextRequest } from 'next/server';
import { emailErrorResponse, getServerOrgContext, ok } from '@/lib/services/crm/email/http';
import { listMessages } from '@/lib/services/crm/email/messagesService';
import { parseWith, queryObject, zMessagesQuery } from '@/lib/services/crm/email/schemas';

export const runtime = 'nodejs';

/**
 * GET /api/email/messages?status=&to_customer_id=&related_type=&related_id=&template_id=&direction=&thread_id=&limit=&offset=
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext(request);
    const q = parseWith(
      zMessagesQuery,
      queryObject(request.nextUrl.searchParams, ['status', 'to_customer_id', 'related_type', 'related_id', 'template_id', 'direction', 'thread_id', 'limit', 'offset']),
      'query',
    );
    const r = await listMessages(ctx.organizationId, q, ctx.supabase);
    return ok(r.data, 200, { count: r.count });
  } catch (err) {
    return emailErrorResponse(err, 'email/messages GET');
  }
}
