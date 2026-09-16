import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext } from '@/lib/utils/orgContext';
import { getOrganizationTimezone } from '@/lib/services/organizationTimezoneService';
import { loadProposalContext, getLatestProposal, generateProposal, ProposalCustomerRequiredError } from '@/lib/services/crm/proposalServerService';
import { failResponse, foreignOrgResponse, isSafeId, readJson } from '@/lib/services/crm/f10RouteHelpers';

export const runtime = 'nodejs';

/**
 * GET /api/crm/proposals?opportunity_id=… — contexto de la oportunidad
 * (cliente, discovery plano con etiquetas, objeciones, pricing) y la última
 * propuesta enlazada (o null). F10.
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext();
    const opportunityId = new URL(request.url).searchParams.get('opportunity_id');
    if (!isSafeId(opportunityId)) {
      return NextResponse.json({ success: false, error: 'Falta opportunity_id' }, { status: 400 });
    }
    const context = await loadProposalContext(ctx.organizationId, opportunityId, ctx.supabase);
    if (!context) return NextResponse.json({ success: false, error: 'Oportunidad no encontrada' }, { status: 404 });
    const proposal = await getLatestProposal(ctx.organizationId, opportunityId, ctx.supabase);
    return NextResponse.json({ success: true, data: { context, proposal } });
  } catch (error) {
    return failResponse('CRM Proposals GET', error);
  }
}

/**
 * POST /api/crm/proposals — genera (o regenera fusionando lo editado) la
 * propuesta de una oportunidad. Body: { opportunity_id, roi?, force? }
 * (`force:true` descarta también las secciones editadas a mano).
 * 201 si se creó la cotización, 200 si se reutilizó, 400 sin cliente.
 */
export async function POST(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext();
    const body = await readJson(request);
    const forbidden = foreignOrgResponse('CRM Proposals POST', body, ctx, request);
    if (forbidden) return forbidden;
    const opportunityId = body?.opportunity_id;
    if (!isSafeId(opportunityId)) {
      return NextResponse.json({ success: false, error: 'Falta opportunity_id' }, { status: 400 });
    }
    const roiRaw = body?.roi;
    const roi = roiRaw && typeof roiRaw === 'object' && typeof (roiRaw as { summary?: unknown }).summary === 'string'
      ? { summary: String((roiRaw as { summary: string }).summary).slice(0, 5000), outputs: ((roiRaw as { outputs?: Record<string, number> }).outputs ?? {}) }
      : null;
    const timezone = await getOrganizationTimezone(ctx.organizationId);
    const result = await generateProposal(ctx.organizationId, opportunityId, ctx.supabase, { userId: ctx.userId, timezone, roi, force: body?.force === true });
    if (!result) return NextResponse.json({ success: false, error: 'Oportunidad no encontrada' }, { status: 404 });
    return NextResponse.json({ success: true, data: { ...result.proposal, isNew: result.isNew } }, { status: result.isNew ? 201 : 200 });
  } catch (error) {
    if (error instanceof ProposalCustomerRequiredError) {
      return NextResponse.json({ success: false, error: error.message, code: 'CUSTOMER_REQUIRED' }, { status: 400 });
    }
    return failResponse('CRM Proposals POST', error);
  }
}
