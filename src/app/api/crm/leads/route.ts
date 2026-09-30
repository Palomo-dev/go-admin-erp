import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, hasOrgAdminOrPermission, OrgContextError } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { createLeadWithCustomer, LEADS_CREATE_PERMISSION, type CreateLeadBody } from '@/lib/services/crm/leadCreateService';
import { CRM_PERMISOS, exigirPermisoCrm, respuestaErrorCrm, UUID_RE } from '@/lib/services/crm/crmRouteSupport';
import { LEAD_SOURCES } from '@/lib/crm/enums';

/**
 * GET /api/crm/leads — leads = clientes con `lifecycle_stage='lead'` (CRM ola 1,
 * D2, plan §4.1). Paginado y con conteo exacto en el servidor (hay ~35 000
 * clientes en etapa lead: nunca se carga todo). `crm.leads.view`.
 *
 * Query:
 *   q            busca en `customers.search_text` (nombre, documento, correo, teléfono)
 *   origen       un valor de `LEAD_SOURCES`, o `todos` para incluir clientes sin
 *                origen. Por defecto solo los que tienen origen (`lead_source`
 *                no nulo): `lifecycle_stage` vale 'lead' por DEFAULT en toda
 *                ficha nueva, así que sin este filtro la vista mezclaría a
 *                cualquier contacto con los prospectos reales.
 *   owner_id     uuid del responsable, o `ninguno` (sin responsable)
 *   descartados  `1` para verlos (por defecto se ocultan)
 *   creado_desde / creado_hasta  instantes ISO 8601 (la interfaz los calcula
 *                en la zona de la organización)
 *   page (1…), limit (≤ 100, por defecto 25)
 *
 * Las oportunidades 'lead' heredadas están en `GET /api/crm/leads/heredados`.
 */
const COLUMNAS_LEAD =
  'id, full_name, email, phone, doc_type, doc_number, company_name, customer_type, lifecycle_stage, lead_source, owner_id, lead_score, icp_band, last_contact_at, lead_discarded_at, lead_discard_reason, tags, branch_id, created_at, updated_at, do_not_call, avatar_url, city';

const escaparLike = (q: string) => q.replace(/[\\%_,()]/g, (c) => `\\${c}`);

export async function GET(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext(request);
    await exigirPermisoCrm(ctx, [CRM_PERMISOS.leadsVer], 'GET /api/crm/leads');
    const sp = new URL(request.url).searchParams;
    const limit = Math.min(Math.max(Number.parseInt(sp.get('limit') ?? '25', 10) || 25, 1), 100);
    const page = Math.max(Number.parseInt(sp.get('page') ?? '1', 10) || 1, 1);

    let q = ctx.supabase
      .from('customers')
      .select(COLUMNAS_LEAD, { count: 'exact' })
      .eq('organization_id', ctx.organizationId)
      .eq('lifecycle_stage', 'lead')
      .neq('status', 'merged');

    const origen = sp.get('origen');
    if (origen && (LEAD_SOURCES as readonly string[]).includes(origen)) q = q.eq('lead_source', origen);
    else if (origen !== 'todos') q = q.not('lead_source', 'is', null);

    const owner = sp.get('owner_id');
    if (owner === 'ninguno') q = q.is('owner_id', null);
    else if (owner && UUID_RE.test(owner)) q = q.eq('owner_id', owner);

    if (sp.get('descartados') !== '1') q = q.is('lead_discarded_at', null);

    for (const [param, op] of [['creado_desde', 'gte'], ['creado_hasta', 'lt']] as const) {
      const v = sp.get(param);
      if (v && !Number.isNaN(Date.parse(v))) q = op === 'gte' ? q.gte('created_at', v) : q.lt('created_at', v);
    }

    const texto = sp.get('q')?.trim();
    // `search_text` es GENERATED con `normalizar_busqueda` (minúsculas y sin
    // tildes): el término se normaliza igual antes de comparar.
    if (texto) q = q.ilike('search_text', `%${escaparLike(texto.slice(0, 100).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase())}%`);

    const desde = (page - 1) * limit;
    const { data, error, count } = await q.order('created_at', { ascending: false }).order('id', { ascending: true }).range(desde, desde + limit - 1);
    if (error) throw error;
    return NextResponse.json({ success: true, data: data ?? [], page, limit, total: count ?? 0 });
  } catch (error) {
    return respuestaErrorCrm(error, 'GET /api/crm/leads');
  }
}

// ─── POST: alta manual de leads ──────────────────────────────────────────────

/**
 * POST /api/crm/leads — Crea un lead. CRM ola 1 (D2): **un lead es un cliente**
 * con `lifecycle_stage='lead'`; esta ruta crea o actualiza la FICHA y no crea
 * ninguna oportunidad (antes, `opportunities.record_type='lead'`).
 *
 * El cuerpo exige `customer_id` (cliente existente, que se marca como lead sin
 * degradar su ciclo de vida) o `new_customer` (ficha nueva con al menos correo o
 * teléfono).
 *
 * Body:
 *   customer_id    | new_customer{ first_name|full_name, last_name?, email?, phone?,
 *                                   company_name?, customer_type? }   (uno de los dos)
 *   name?          título del lead (`metadata.lead.titulo`)
 *   source?        origen → `customers.lead_source` (catálogo; alias normalizados)
 *   salesperson_id? responsable → `customers.owner_id`
 *   amount?, currency?, deal_type?, temperature?, next_contact_at?,
 *   expected_close_date?  → `metadata.lead` (prellenan «Calificar»)
 *   branch_id?     sucursal de la ficha nueva
 *   pipeline_id / stage_id: ya no aplican (se ignoran).
 *
 * El score (`lead_score`, `icp_band`) lo calcula el servidor desde el ICP (D3).
 * La oportunidad nace al calificar: `POST /api/crm/leads/[id]/qualify`.
 *
 * Sin `salesperson_id` el vendedor se asigna automáticamente (F1) según la
 * configuración de la organización; la respuesta lo cuenta en `assignment`
 * (`assigned` | `explicit` | `skipped` | `unassigned` + motivo). Sin equipo o
 * sin miembros el lead se crea igual, sin asignar.
 *
 * La lógica vive en `leadCreateService.createLeadWithCustomer` (F12 la extrajo
 * sin cambiar el contrato para que la conversión de referidos la reutilice).
 */
export async function POST(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext(request);

    let body: CreateLeadBody;
    try {
      body = (await request.json()) as CreateLeadBody;
    } catch {
      return NextResponse.json({ success: false, error: 'Cuerpo JSON inválido' }, { status: 400 });
    }
    readOrgBody(ctx, body, { request });

    // Mismo permiso que la importación, resuelto en el servidor con la sesión.
    if (!(await hasOrgAdminOrPermission(ctx, LEADS_CREATE_PERMISSION))) {
      console.warn('[CRM Leads] POST sin permiso %s (org %s, usuario %s)', LEADS_CREATE_PERMISSION, ctx.organizationId, ctx.userId);
      return NextResponse.json({ success: false, error: 'No tienes permiso para crear leads', code: 'FORBIDDEN' }, { status: 403 });
    }

    const result = await createLeadWithCustomer(
      { organizationId: ctx.organizationId, userId: ctx.userId, supabase: ctx.supabase },
      body
    );

    if (result.status !== 201) {
      return NextResponse.json({ success: false, error: result.error, ...(result.extra ?? {}) }, { status: result.status });
    }

    return NextResponse.json(
      {
        success: true,
        data: result.data,
        created_customer_id: result.created_customer_id,
        assignment: result.assignment,
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    if (error instanceof OrgContextError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[CRM Leads] POST error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
