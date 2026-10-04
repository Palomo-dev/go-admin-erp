import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { respuestaErrorCrm, sinClavesDeOrganizacion } from '@/lib/services/crm/crmRouteSupport';
import { crearTareaRapida, tareaRapidaSchema } from '@/lib/services/crm/tareaRapidaService';

/** Tarea rápida: autor, entidad y responsable validados dentro de la RPC. */
export async function POST(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext(request);
    const json = readOrgBody(ctx, await request.json().catch(() => null), { request });
    const parsed = tareaRapidaSchema.safeParse(sinClavesDeOrganizacion(json));
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: 'Datos inválidos', details: parsed.error.flatten() }, { status: 400 });
    }
    const data = await crearTareaRapida(ctx.organizationId, parsed.data, ctx.supabase);
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error: unknown) {
    return respuestaErrorCrm(error, 'POST /api/crm/tasks');
  }
}
