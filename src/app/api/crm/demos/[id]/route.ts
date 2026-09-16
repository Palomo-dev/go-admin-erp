import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext } from '@/lib/utils/orgContext';
import { updateDemo } from '@/lib/services/crm/demoService';
import { validateUpdateDemo } from '@/lib/services/crm/demoInput';
import { failResponse, foreignOrgResponse, isSafeId, readJson } from '@/lib/services/crm/f10RouteHelpers';

export const runtime = 'nodejs';

/**
 * PATCH /api/crm/demos/[id] — Actualiza una demo (lista blanca de campos,
 * validada por `demoInput`; status dentro del CHECK de la tabla). F10.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getServerOrgContext();
    const { id } = await params;
    if (!isSafeId(id)) return NextResponse.json({ success: false, error: 'Id inválido' }, { status: 400 });
    const body = await readJson(request);
    const forbidden = foreignOrgResponse('CRM Demos PATCH', body, ctx.organizationId);
    if (forbidden) return forbidden;
    const v = validateUpdateDemo(body);
    if (!v.ok) return NextResponse.json({ success: false, error: v.error }, { status: 400 });
    const demo = await updateDemo(id, ctx.organizationId, v.value, ctx.supabase);
    if (!demo) return NextResponse.json({ success: false, error: 'Demo no encontrada' }, { status: 404 });
    return NextResponse.json({ success: true, data: demo }, { status: 200 });
  } catch (error) {
    return failResponse('CRM Demos PATCH', error);
  }
}
