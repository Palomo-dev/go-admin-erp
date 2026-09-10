import { NextRequest } from 'next/server';
import { emailErrorResponse, getServerOrgContext, ok } from '@/lib/services/crm/email/http';
import { parseWith, zUuid } from '@/lib/services/crm/email/schemas';
import { cancelScheduledEmail } from '@/lib/services/crm/email/sendService';
import { getServiceClient } from '@/lib/supabase/server-service';

export const runtime = 'nodejs';

/** POST /api/email/messages/[id]/cancel — cancela un correo programado (409 NOT_SCHEDULED) */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getServerOrgContext(request);
    const { id: rawId } = await params;
    // uuid validado en la ruta: un id basura daba un 500 de Postgres (tester r2 #8).
    const id = parseWith(zUuid, rawId, 'id');
    return ok(await cancelScheduledEmail(ctx.organizationId, id, ctx.supabase, getServiceClient()));
  } catch (err) {
    return emailErrorResponse(err, 'email/messages/[id]/cancel');
  }
}
