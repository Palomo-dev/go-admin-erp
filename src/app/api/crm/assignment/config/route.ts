/**
 * GET/PUT /api/crm/assignment/config — configuración de la asignación
 * automática de leads (Figma CRM 1412:837868): `organization_settings`,
 * key `crm_lead_assignment` (`leadAssignmentConfig.ts`), que aplica
 * `leadAutoAssign.ts` al crear el lead.
 *
 * GET: permiso `crm.leads.view`. PUT: solo admin u owner (`isOrgAdmin`,
 * resuelto en el servidor); el equipo debe ser de la organización y estar
 * activo, y «Por territorio» exige al menos un territorio activo. La
 * organización sale de la sesión: una ajena en el body → 403.
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerOrgContext } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { isOrgAdmin } from '@/lib/utils/rbac';
import { CRM_PERMISOS, CrmHttpError, exigirPermisoCrm, respuestaErrorCrm, sinClavesDeOrganizacion } from '@/lib/services/crm/crmRouteSupport';
import { getLeadAssignmentConfig, LEAD_ASSIGNMENT_STRATEGIES, saveLeadAssignmentConfig } from '@/lib/services/crm/leadAssignmentConfig';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const configSchema = z
  .object({
    enabled: z.boolean(),
    strategy: z.enum(LEAD_ASSIGNMENT_STRATEGIES),
    team_id: z.string().uuid().nullable(),
  })
  .strict();

async function hayTerritoriosActivos(ctx: Awaited<ReturnType<typeof getServerOrgContext>>): Promise<boolean> {
  const { count, error } = await ctx.supabase
    .from('territories')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', ctx.organizationId)
    .eq('is_active', true);
  if (error) throw error;
  return (count ?? 0) > 0;
}

export async function GET(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext(request);
    readOrgBody(ctx, {}, { request });
    await exigirPermisoCrm(ctx, [CRM_PERMISOS.leadsVer, CRM_PERMISOS.leadsAsignar], 'leer asignación automática');
    const [config, hayTerritorios] = await Promise.all([getLeadAssignmentConfig(ctx.organizationId, ctx.supabase), hayTerritoriosActivos(ctx)]);
    return NextResponse.json({ success: true, data: { config, puedeEditar: isOrgAdmin(ctx), hayTerritorios } }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return respuestaErrorCrm(error, 'GET /api/crm/assignment/config');
  }
}

export async function PUT(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext(request);
    const body = sinClavesDeOrganizacion((await readOrgBody(ctx, request)) as Record<string, unknown>);
    if (!isOrgAdmin(ctx)) {
      console.warn('[crm] PUT asignación automática sin permiso (org %s, rol %s)', ctx.organizationId, ctx.roleId);
      throw new CrmHttpError(403, 'CRM_FORBIDDEN', 'Solo un administrador cambia la asignación automática');
    }
    const p = configSchema.safeParse(body);
    if (!p.success) throw new CrmHttpError(400, 'datos_invalidos', 'Configuración inválida');
    const v = p.data;
    if (v.team_id) {
      const { data, error } = await ctx.supabase
        .from('sales_teams')
        .select('id')
        .eq('id', v.team_id)
        .eq('organization_id', ctx.organizationId)
        .eq('is_active', true)
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new CrmHttpError(400, 'equipo_invalido', 'El equipo no existe o no está activo');
    }
    if (v.strategy === 'territory' && !(await hayTerritoriosActivos(ctx))) {
      throw new CrmHttpError(409, 'sin_territorios', 'No hay territorios activos');
    }
    const config = await saveLeadAssignmentConfig(ctx.organizationId, v, ctx.supabase);
    return NextResponse.json({ success: true, data: { config } });
  } catch (error) {
    return respuestaErrorCrm(error, 'PUT /api/crm/assignment/config');
  }
}
