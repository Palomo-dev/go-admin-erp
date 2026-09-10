import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';

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

/** Origen por defecto de un lead creado a mano desde el ERP. */
const MANUAL_LEAD_SOURCE = 'manual_erp';

interface NewCustomerInput {
  /** Conveniencia: se parte en first_name / last_name si no vienen sueltos. */
  full_name?: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  company_name?: string;
  customer_type?: string;
}

interface CreateLeadBody {
  name?: string;
  pipeline_id?: string;
  stage_id?: string;
  customer_id?: string;
  new_customer?: NewCustomerInput;
  amount?: number;
  currency?: string;
  expected_close_date?: string;
  source?: string;
  salesperson_id?: string;
  next_contact_at?: string;
  temperature?: string;
  branch_id?: number;
}

function badRequest(message: string) {
  return NextResponse.json({ success: false, error: message }, { status: 400 });
}

function clean(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * `customers.full_name` es una columna GENERADA (verificado en `pg_attribute`
 * el 2026-09-09): se calcula desde `first_name`/`last_name` para personas y
 * desde `company_name`/`trade_name` para empresas. Escribirla directamente
 * hace fallar el INSERT, así que el nombre se parte aquí.
 */
function splitPersonName(input: NewCustomerInput): { first: string | null; last: string | null } {
  const first = clean(input.first_name);
  const last = clean(input.last_name);
  if (first || last) return { first, last };

  const full = clean(input.full_name);
  if (!full) return { first: null, last: null };

  const parts = full.split(/\s+/);
  if (parts.length === 1) return { first: parts[0], last: null };
  return { first: parts[0], last: parts.slice(1).join(' ') };
}

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
 *   amount?, currency?, expected_close_date?, source?, salesperson_id?,
 *   next_contact_at?, temperature?, branch_id?
 *
 * `record_type` y `status` no se leen del cuerpo: siempre 'lead' y 'open'. Para
 * pasar a 'deal' está POST /api/crm/leads/[id]/convert.
 */
export async function POST(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext();

    let body: CreateLeadBody;
    try {
      body = (await request.json()) as CreateLeadBody;
    } catch {
      return badRequest('Cuerpo JSON inválido');
    }

    const name = clean(body.name);
    if (!name) {
      return badRequest('El nombre del lead es obligatorio');
    }

    // ── 1. Pipeline y etapa ──────────────────────────────────────────────────
    let pipelineId = clean(body.pipeline_id);
    if (pipelineId) {
      const { data: pipeline, error } = await ctx.supabase
        .from('pipelines')
        .select('id')
        .eq('id', pipelineId)
        .eq('organization_id', ctx.organizationId)
        .maybeSingle();
      if (error) throw error;
      if (!pipeline) return badRequest('El pipeline no pertenece a la organización');
    } else {
      const { data: pipeline, error } = await ctx.supabase
        .from('pipelines')
        .select('id')
        .eq('organization_id', ctx.organizationId)
        .order('is_default', { ascending: false })
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (!pipeline) {
        return badRequest('La organización no tiene ningún pipeline configurado');
      }
      pipelineId = pipeline.id as string;
    }

    let stageId = clean(body.stage_id);
    if (stageId) {
      const { data: stage, error } = await ctx.supabase
        .from('stages')
        .select('id')
        .eq('id', stageId)
        .eq('pipeline_id', pipelineId)
        .maybeSingle();
      if (error) throw error;
      if (!stage) return badRequest('La etapa no pertenece al pipeline indicado');
    } else {
      const { data: stage, error } = await ctx.supabase
        .from('stages')
        .select('id')
        .eq('pipeline_id', pipelineId)
        .order('position', { ascending: true })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (!stage) return badRequest('El pipeline no tiene etapas configuradas');
      stageId = stage.id as string;
    }

    // ── 2. Sucursal (opcional, siempre validada contra la organización) ──────
    let branchId: number | null = null;
    if (body.branch_id != null) {
      const { data: branch, error } = await ctx.supabase
        .from('branches')
        .select('id')
        .eq('id', body.branch_id)
        .eq('organization_id', ctx.organizationId)
        .maybeSingle();
      if (error) throw error;
      if (!branch) return badRequest('La sucursal no pertenece a la organización');
      branchId = Number(branch.id);
    }

    // ── 3. Cliente: existente o nuevo. Sin ficha no hay lead contactable ─────
    let customerId = clean(body.customer_id);
    let createdCustomerId: string | null = null;

    if (customerId) {
      const { data: customer, error } = await ctx.supabase
        .from('customers')
        .select('id')
        .eq('id', customerId)
        .eq('organization_id', ctx.organizationId)
        .maybeSingle();
      if (error) throw error;
      if (!customer) return badRequest('El cliente no pertenece a la organización');
    } else if (body.new_customer) {
      const email = clean(body.new_customer.email);
      const phone = clean(body.new_customer.phone);
      const companyName = clean(body.new_customer.company_name);
      const customerType = clean(body.new_customer.customer_type) || 'person';
      const { first, last } = splitPersonName(body.new_customer);

      if (customerType === 'company') {
        if (!companyName) {
          return badRequest('Un cliente de tipo empresa necesita razón social');
        }
      } else if (!first) {
        return badRequest('El nombre del cliente nuevo es obligatorio');
      }
      // Un lead sin forma de contacto es exactamente el registro inútil que este
      // alta viene a evitar.
      if (!email && !phone) {
        return badRequest('El cliente nuevo necesita al menos correo o teléfono');
      }

      // `full_name` NO se envía: es columna generada (ver splitPersonName).
      const { data: customer, error } = await ctx.supabase
        .from('customers')
        .insert({
          organization_id: ctx.organizationId,
          branch_id: branchId,
          first_name: first,
          last_name: last,
          email,
          phone,
          company_name: companyName,
          customer_type: customerType,
          lifecycle_stage: 'lead',
        })
        .select('id, full_name')
        .single();
      if (error) throw error;

      customerId = customer.id as string;
      createdCustomerId = customerId;
    } else {
      return badRequest(
        'Un lead necesita ficha de cliente: envía customer_id o new_customer'
      );
    }

    // ── 4. Vendedor asignado (opcional, validado contra la organización) ─────
    const salespersonId = clean(body.salesperson_id);
    if (salespersonId) {
      const { data: member, error } = await ctx.supabase
        .from('organization_members')
        .select('user_id')
        .eq('user_id', salespersonId)
        .eq('organization_id', ctx.organizationId)
        .maybeSingle();
      if (error) throw error;
      if (!member) {
        return badRequest('El vendedor asignado no es miembro de la organización');
      }
    }

    // ── 5. Alta del lead ────────────────────────────────────────────────────
    const amount = Number.isFinite(Number(body.amount)) ? Number(body.amount) : 0;

    const { data: lead, error: insertError } = await ctx.supabase
      .from('opportunities')
      .insert({
        organization_id: ctx.organizationId,
        branch_id: branchId,
        pipeline_id: pipelineId,
        stage_id: stageId,
        customer_id: customerId,
        name,
        amount,
        currency: clean(body.currency) || 'COP',
        expected_close_date: clean(body.expected_close_date),
        status: 'open',
        record_type: 'lead',
        source: clean(body.source) || MANUAL_LEAD_SOURCE,
        next_contact_at: clean(body.next_contact_at),
        temperature: clean(body.temperature),
        salesperson_id: salespersonId,
        created_by: ctx.userId,
      })
      .select(
        'id, name, customer_id, pipeline_id, stage_id, amount, currency, status, record_type, source, temperature, next_contact_at, created_at'
      )
      .single();

    if (insertError) {
      // Si acabamos de crear la ficha para este lead y el lead no cuajó, no se
      // deja un cliente huérfano en la base.
      if (createdCustomerId) {
        const { error: rollbackError } = await ctx.supabase
          .from('customers')
          .delete()
          .eq('id', createdCustomerId)
          .eq('organization_id', ctx.organizationId);
        if (rollbackError) {
          console.error(
            '[CRM Leads] POST: no se pudo revertir el cliente %s tras fallar el alta del lead: %s',
            createdCustomerId,
            rollbackError.message
          );
        }
      }
      throw insertError;
    }

    return NextResponse.json(
      { success: true, data: lead, created_customer_id: createdCustomerId },
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
