import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext } from '@/lib/utils/orgContext';
import { getProposal, updateProposalSections } from '@/lib/services/crm/proposalServerService';
import { validateSectionsInput } from '@/lib/services/crm/proposalNarrative';
import { failResponse, foreignOrgResponse, isSafeId, readJson } from '@/lib/services/crm/f10RouteHelpers';

export const runtime = 'nodejs';

type Params = { params: Promise<{ id: string }> };

/** GET /api/crm/proposals/[id] — propuesta con secciones y datos para imprimir. */
export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const ctx = await getServerOrgContext();
    const { id } = await params;
    if (!isSafeId(id)) return NextResponse.json({ success: false, error: 'Id inválido' }, { status: 400 });
    const proposal = await getProposal(ctx.organizationId, id, ctx.supabase);
    if (!proposal) return NextResponse.json({ success: false, error: 'Propuesta no encontrada' }, { status: 404 });
    let customerName: string | null = null;
    let customerEmail: string | null = null;
    if (proposal.customer_id) {
      const { data } = await ctx.supabase.from('customers').select('full_name, company_name, email').eq('id', proposal.customer_id).eq('organization_id', ctx.organizationId).maybeSingle();
      const c = data as { full_name?: string | null; company_name?: string | null; email?: string | null } | null;
      customerName = c ? c.full_name || c.company_name || null : null;
      customerEmail = c?.email ?? null;
    }
    return NextResponse.json({ success: true, data: { ...proposal, customerName, customerEmail, organizationName: ctx.organizationName } });
  } catch (error) {
    return failResponse('CRM Proposals GET [id]', error);
  }
}

/** PATCH /api/crm/proposals/[id] — edita secciones. Body: { sections: Partial<ProposalSections> }. */
export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const ctx = await getServerOrgContext();
    const { id } = await params;
    if (!isSafeId(id)) return NextResponse.json({ success: false, error: 'Id inválido' }, { status: 400 });
    const body = await readJson(request);
    const forbidden = foreignOrgResponse('CRM Proposals PATCH', body, ctx.organizationId);
    if (forbidden) return forbidden;
    const validation = validateSectionsInput(body?.sections);
    if (!validation.ok) return NextResponse.json({ success: false, error: validation.error }, { status: 400 });
    if (Object.keys(validation.sections).length === 0) {
      return NextResponse.json({ success: false, error: 'No hay secciones que guardar' }, { status: 400 });
    }
    const updated = await updateProposalSections(ctx.organizationId, id, validation.sections, ctx.supabase);
    if (!updated) return NextResponse.json({ success: false, error: 'Propuesta no encontrada' }, { status: 404 });
    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    return failResponse('CRM Proposals PATCH', error);
  }
}
