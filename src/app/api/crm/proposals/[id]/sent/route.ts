import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext } from '@/lib/utils/orgContext';
import { markProposalSent } from '@/lib/services/crm/proposalServerService';
import { failResponse, foreignOrgResponse, isSafeId, readJson } from '@/lib/services/crm/f10RouteHelpers';

export const runtime = 'nodejs';

/**
 * POST /api/crm/proposals/[id]/sent — la propuesta se envió (el email lo envía
 * `POST /api/email/send`, que crea su propia actividad `email`): aquí la
 * cotización pasa a `sent`, se registra «propuesta enviada» en el timeline y
 * `next_contact_at` queda a +24 h. Body opcional: { email_message_id }.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getServerOrgContext();
    const { id } = await params;
    if (!isSafeId(id)) return NextResponse.json({ success: false, error: 'Id inválido' }, { status: 400 });
    const body = await readJson(request);
    const forbidden = foreignOrgResponse('CRM Proposals sent', body, ctx, request);
    if (forbidden) return forbidden;
    const emailMessageId = isSafeId(body?.email_message_id) ? (body!.email_message_id as string) : null;
    const result = await markProposalSent(ctx.organizationId, id, ctx.supabase, { userId: ctx.userId, emailMessageId });
    if (!result) return NextResponse.json({ success: false, error: 'Propuesta no encontrada' }, { status: 404 });
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    return failResponse('CRM Proposals sent', error);
  }
}
