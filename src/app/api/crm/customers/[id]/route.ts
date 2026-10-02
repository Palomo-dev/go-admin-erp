import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { exigirUuid, respuestaErrorCrm, sinClavesDeOrganizacion } from '@/lib/services/crm/crmRouteSupport';
import { clienteEdicionSchema, editarClienteCrm } from '@/lib/services/crm/customerEditService';

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getServerOrgContext(request);
    const body = await readOrgBody(ctx, request);
    const id = exigirUuid((await params).id);
    const parsed = clienteEdicionSchema.safeParse(sinClavesDeOrganizacion(body));
    if (!parsed.success) return NextResponse.json({ success: false, error: 'Datos inválidos' }, { status: 400 });
    const data = await editarClienteCrm(ctx, id, parsed.data);
    return NextResponse.json({ success: true, data }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return respuestaErrorCrm(error, 'PATCH /api/crm/customers/[id]');
  }
}
