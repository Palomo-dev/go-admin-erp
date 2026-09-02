/**
 * PATCH /api/crm/voice-agents/campaigns/[id] — Actualiza una campaña.
 * DELETE /api/crm/voice-agents/campaigns/[id] — Elimina una campaña.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import {
  updateCampaign,
  deleteCampaign,
} from '@/lib/services/crm/voiceAgentService';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getServerOrgContext();
    const { id } = await params;
    const body = await request.json();

    const campaign = await updateCampaign(id, ctx.organizationId, body, ctx.supabase);

    if (!campaign) {
      return NextResponse.json(
        { success: false, error: 'Campaña no encontrada' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: campaign }, { status: 200 });
  } catch (error: unknown) {
    if (error instanceof OrgContextError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[Voice Agent Campaigns] PATCH [id] error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getServerOrgContext();
    const { id } = await params;

    await deleteCampaign(id, ctx.organizationId, ctx.supabase);

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error: unknown) {
    if (error instanceof OrgContextError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[Voice Agent Campaigns] DELETE [id] error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
