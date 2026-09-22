import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { createLeadWithCustomer, type CreateLeadBody } from '@/lib/services/crm/leadCreateService';

/**
 * GET /api/crm/leads — Lista las opportunities con record_type='lead' de la organización.
 * Query params opcionales: salesperson_id, stage_id, status, search
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext();
    const { searchParams } = new URL(request.url);

    let query = ctx.supabase
      .from('opportunities')
      .select(`
        id,
        name,
        customer_id,
        salesperson_id,
        stage_id,
        pipeline_id,
        amount,
        currency,
        expected_close_date,
        status,
        source,
        temperature,
        score_total,
        icp_band,
        next_contact_at,
        last_contact_at,
        created_at,
        updated_at
      `)
      .eq('organization_id', ctx.organizationId)
      .eq('record_type', 'lead');

    // Filtros opcionales
    const salespersonId = searchParams.get('salesperson_id');
    if (salespersonId) {
      query = query.eq('salesperson_id', salespersonId);
    }

    const stageId = searchParams.get('stage_id');
    if (stageId) {
      query = query.eq('stage_id', stageId);
    }

    const status = searchParams.get('status');
    if (status) {
      query = query.eq('status', status);
    }

    const search = searchParams.get('search');
    if (search) {
      query = query.ilike('name', `%${search}%`);
    }

    // Ordenamiento: más recientes primero
    query = query.order('created_at', { ascending: false });

    const { data: leads, error } = await query;

    if (error) {
      throw error;
    }

    return NextResponse.json({ success: true, data: leads }, { status: 200 });
  } catch (error: unknown) {
    if (error instanceof OrgContextError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[CRM Leads] GET error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// ─── POST: alta manual de leads ──────────────────────────────────────────────

/**
 * POST /api/crm/leads — Crea un lead (`opportunities.record_type='lead'`).
 *
 * Un lead SIEMPRE nace con ficha de cliente: `opportunities` no guarda correo ni
 * teléfono, así que sin `customers` no se le puede llamar, escribir ni mandar
 * WhatsApp. Por eso el cuerpo exige `customer_id` (cliente existente) o
 * `new_customer` (ficha nueva, que se crea con `lifecycle_stage='lead'`).
 *
 * Body:
 *   name           (obligatorio) nombre del lead
 *   customer_id    | new_customer{ first_name|full_name, last_name?, email?, phone?,
 *                                   company_name?, customer_type? }   (uno de los dos)
 *   pipeline_id?   por defecto el pipeline `is_default` de la organización
 *   stage_id?      por defecto la primera etapa (`position`) del pipeline
 *   amount?, currency?, expected_close_date?, source?, deal_type?, salesperson_id?,
 *   next_contact_at?, temperature?, branch_id?
 *
 * `record_type` y `status` no se leen del cuerpo: siempre 'lead' y 'open'. Para
 * pasar a 'deal' está POST /api/crm/leads/[id]/convert.
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
    const ctx = await getServerOrgContext();

    let body: CreateLeadBody;
    try {
      body = (await request.json()) as CreateLeadBody;
    } catch {
      return NextResponse.json({ success: false, error: 'Cuerpo JSON inválido' }, { status: 400 });
    }
    readOrgBody(ctx, body, { request });

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
