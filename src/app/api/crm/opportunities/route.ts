import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { CRM_PERMISOS, exigirPermisoCrm, respuestaErrorCrm, sinClavesDeOrganizacion, UUID_RE } from '@/lib/services/crm/crmRouteSupport';
import { crearOportunidad, oportunidadAltaSchema } from '@/lib/services/crm/opportunityWriteService';

/**
 * /api/crm/opportunities — CRM ola 1 (plan §4.4 y §4.7).
 *
 * GET  lista paginada en el servidor (`crm.opportunities.view`).
 *      Query: status, record_type (lead|deal), pipeline_id, stage_id,
 *      salesperson_id, customer_id, q, page (1…), limit (≤ 100).
 *      Las 42 oportunidades `record_type='lead'` heredadas salen con
 *      `es_lead: true` para que la interfaz las etiquete «Lead» (D2).
 * POST alta con la RPC `crm_create_opportunity` (`crm.opportunities.create`):
 *      pipeline de ventas por defecto, primera etapa no terminal, moneda base,
 *      líneas y actividad en la misma transacción; siempre `record_type='deal'`.
 *      201 { data } · 400 cuerpo · 403 permiso · 404 cliente/pipeline/etapa
 *      ajenos · 409 sin embudo de ventas.
 */

const COLUMNAS =
  'id, name, customer_id, pipeline_id, stage_id, amount, currency, status, record_type, source, temperature, salesperson_id, created_by, expected_close_date, next_contact_at, last_contact_at, closed_at, created_at, updated_at';

const escaparLike = (q: string) => q.replace(/[\\%_]/g, (c) => `\\${c}`);

export async function GET(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext(request);
    await exigirPermisoCrm(ctx, [CRM_PERMISOS.oportunidadesVer], 'GET /api/crm/opportunities');
    const sp = new URL(request.url).searchParams;
    const limit = Math.min(Math.max(Number.parseInt(sp.get('limit') ?? '25', 10) || 25, 1), 100);
    const page = Math.max(Number.parseInt(sp.get('page') ?? '1', 10) || 1, 1);

    let q = ctx.supabase.from('opportunities').select(COLUMNAS, { count: 'exact' }).eq('organization_id', ctx.organizationId);
    const status = sp.get('status');
    if (status && ['open', 'won', 'lost'].includes(status)) q = q.eq('status', status);
    const recordType = sp.get('record_type');
    if (recordType && ['lead', 'deal'].includes(recordType)) q = q.eq('record_type', recordType);
    for (const campo of ['pipeline_id', 'stage_id', 'salesperson_id', 'customer_id'] as const) {
      const v = sp.get(campo);
      if (v && UUID_RE.test(v)) q = q.eq(campo, v);
    }
    const texto = sp.get('q')?.trim();
    if (texto) q = q.ilike('name', `%${escaparLike(texto.slice(0, 100))}%`);

    const desde = (page - 1) * limit;
    const { data, error, count } = await q.order('created_at', { ascending: false }).order('id', { ascending: true }).range(desde, desde + limit - 1);
    if (error) throw error;
    const filas = (data ?? []).map((o) => ({ ...(o as Record<string, unknown>), es_lead: (o as { record_type?: string }).record_type === 'lead' }));
    return NextResponse.json({ success: true, data: filas, page, limit, total: count ?? filas.length });
  } catch (error) {
    return respuestaErrorCrm(error, 'GET /api/crm/opportunities');
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext(request);
    const body: Record<string, unknown> = await readOrgBody(ctx, request);
    await exigirPermisoCrm(ctx, [CRM_PERMISOS.oportunidadesCrear], 'POST /api/crm/opportunities');
    const parsed = oportunidadAltaSchema.safeParse(sinClavesDeOrganizacion(body));
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: 'Datos inválidos', details: parsed.error.flatten() }, { status: 400 });
    }
    const data = await crearOportunidad(ctx, parsed.data);
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    return respuestaErrorCrm(error, 'POST /api/crm/opportunities');
  }
}
