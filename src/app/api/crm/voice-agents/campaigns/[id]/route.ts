/**
 * GET /api/crm/voice-agents/campaigns/[id] — Detalle de la campaña en marcha
 *   (Figma 1809:144962): cifras, llamadas en vivo y recientes, panel «Hoy».
 *   `?page=` pagina el historial de 25. Permisos y alcance en la base.
 * PATCH /api/crm/voice-agents/campaigns/[id] — Actualiza una campaña.
 * DELETE /api/crm/voice-agents/campaigns/[id] — Elimina una campaña.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import {
  updateCampaign,
  deleteCampaign,
} from '@/lib/services/crm/voiceAgentService';
import { leerDetalleCampanaVoz } from '@/lib/services/crm/voiceCampaignDetailService';
import { respuestaErrorCrm } from '@/lib/services/crm/crmRouteSupport';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getServerOrgContext(request);
    readOrgBody(ctx, {}, { request });
    const { id } = await params;
    const pagina = Number(new URL(request.url).searchParams.get('page'));
    const page = Number.isInteger(pagina) && pagina >= 1 && pagina <= 100000 ? pagina : 1;
    const data = await leerDetalleCampanaVoz(ctx.organizationId, ctx.supabase, id, page);
    return NextResponse.json({ success: true, data }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return respuestaErrorCrm(error, 'GET /api/crm/voice-agents/campaigns/[id]');
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getServerOrgContext();
    const { id } = await params;
    const body = await readOrgBody(ctx, request);

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
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getServerOrgContext();
    await readOrgBody(ctx, request);
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
