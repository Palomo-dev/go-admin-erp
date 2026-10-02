import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, requireOrgAdminOrPermission } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { CrmHttpError, respuestaErrorCrm, sinClavesDeOrganizacion } from '@/lib/services/crm/crmRouteSupport';
import { healthFactorConfigSchema } from '@/lib/services/crm/healthFactorConfig';
import { leerConfiguracionSalud } from '@/lib/services/crm/healthMutationService';
import { z } from 'zod';

const bodySchema = z.object({ config: healthFactorConfigSchema, expected_updated_at: z.string().datetime({ offset: true }).nullable() }).strict();
const headers = { 'Cache-Control': 'private, no-store' };
export async function GET(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext(request);
    readOrgBody(ctx, new URL(request.url).searchParams, { request });
    await requireOrgAdminOrPermission(ctx);
    return NextResponse.json({ success: true, data: await leerConfiguracionSalud(ctx.organizationId, ctx.supabase) }, { headers });
  } catch (e) { return respuestaErrorCrm(e, 'GET /api/crm/health/config'); }
}
export async function PATCH(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext(request);
    const raw = sinClavesDeOrganizacion(await readOrgBody(ctx, request));
    await requireOrgAdminOrPermission(ctx);
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) throw new CrmHttpError(400, 'datos_invalidos', 'Configuración de salud inválida');
    const r = await ctx.supabase.rpc('fn_crm_configurar_salud', { p_org: ctx.organizationId, p_config: parsed.data.config, p_expected_stamp: parsed.data.expected_updated_at });
    if (r.error) throw r.error;
    if (!r.data?.event_id || !r.data?.job_id) throw new Error('Respuesta incompleta al guardar configuración de salud');
    return NextResponse.json({ success: true, data: r.data }, { headers });
  } catch (e) { return respuestaErrorCrm(e, 'PATCH /api/crm/health/config'); }
}
