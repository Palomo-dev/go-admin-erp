import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Alta de un lead con ficha de cliente (`customers` + `opportunities` con
 * `record_type='lead'`). Vivía dentro de `POST /api/crm/leads`; F12 lo
 * extrajo aquí SIN cambiar el contrato para que la conversión de un referido
 * (`POST /api/crm/referrals/[id]/convert`) reutilice exactamente el mismo alta
 * (regla dura 7: nada de lógica duplicada). La ruta de leads mapea el
 * resultado a `NextResponse`; este módulo no conoce `next/server`.
 *
 * Añadido en F12 (aditivo): `deal_type` opcional, validado contra el CHECK
 * `opportunities_deal_type_check` (`new|renewal|expansion|referral|partner`).
 */

/** Origen por defecto de un lead creado a mano desde el ERP. */
export const MANUAL_LEAD_SOURCE = 'manual_erp';

export const OPPORTUNITY_DEAL_TYPES = ['new', 'renewal', 'expansion', 'referral', 'partner'] as const;
export type OpportunityDealType = (typeof OPPORTUNITY_DEAL_TYPES)[number];

export interface NewCustomerInput {
  /** Conveniencia: se parte en first_name / last_name si no vienen sueltos. */
  full_name?: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  company_name?: string;
  customer_type?: string;
}

export interface CreateLeadBody {
  name?: string;
  pipeline_id?: string;
  stage_id?: string;
  customer_id?: string;
  new_customer?: NewCustomerInput;
  amount?: number;
  currency?: string;
  expected_close_date?: string;
  source?: string;
  deal_type?: string;
  salesperson_id?: string;
  next_contact_at?: string;
  temperature?: string;
  branch_id?: number;
}

export interface LeadCreateContext {
  organizationId: number;
  userId: string;
  supabase: SupabaseClient;
}

export type LeadCreateResult =
  | { status: 201; data: Record<string, unknown>; created_customer_id: string | null; customer_id: string }
  | { status: 400 | 409; error: string; extra?: Record<string, unknown> };

/**
 * Violación de unicidad de Postgres. La base tiene dos índices que este alta
 * puede tocar: `unique_customer_email_per_org` sobre `(organization_id, email)`
 * y `unique_customer_id_per_org` sobre `(organization_id, identification_number)`.
 * Dar de alta a alguien que ya está en la ficha es un caso NORMAL de uso, no un
 * fallo del servidor.
 */
export function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === '23505';
}

function violatesEmailIndex(error: unknown): boolean {
  const message = typeof error === 'object' && error !== null ? String((error as { message?: unknown }).message ?? '') : '';
  return message.includes('unique_customer_email_per_org');
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
export function splitPersonName(input: NewCustomerInput): { first: string | null; last: string | null } {
  const first = clean(input.first_name);
  const last = clean(input.last_name);
  if (first || last) return { first, last };

  const full = clean(input.full_name);
  if (!full) return { first: null, last: null };

  const parts = full.split(/\s+/);
  if (parts.length === 1) return { first: parts[0], last: null };
  return { first: parts[0], last: parts.slice(1).join(' ') };
}

const bad = (error: string): LeadCreateResult => ({ status: 400, error });
const conflict = (error: string, extra: Record<string, unknown> = {}): LeadCreateResult => ({ status: 409, error, extra });

/**
 * Crea el lead. Un lead SIEMPRE nace con ficha de cliente: `opportunities` no
 * guarda correo ni teléfono, así que sin `customers` no se le puede llamar,
 * escribir ni mandar WhatsApp. Por eso exige `customer_id` (cliente existente)
 * o `new_customer` (ficha nueva, con `lifecycle_stage='lead'`).
 *
 * `record_type` y `status` no se leen del cuerpo: siempre 'lead' y 'open'.
 * Errores de BD inesperados se lanzan (la ruta los convierte en 500).
 */
export async function createLeadWithCustomer(ctx: LeadCreateContext, body: CreateLeadBody): Promise<LeadCreateResult> {
  const { supabase, organizationId } = ctx;

  const name = clean(body.name);
  if (!name) return bad('El nombre del lead es obligatorio');

  const dealType = clean(body.deal_type);
  if (dealType && !(OPPORTUNITY_DEAL_TYPES as readonly string[]).includes(dealType)) {
    return bad(`deal_type inválido. Valores: ${OPPORTUNITY_DEAL_TYPES.join(', ')}`);
  }

  // ── 1. Pipeline y etapa ──────────────────────────────────────────────────
  let pipelineId = clean(body.pipeline_id);
  if (pipelineId) {
    const { data: pipeline, error } = await supabase
      .from('pipelines')
      .select('id')
      .eq('id', pipelineId)
      .eq('organization_id', organizationId)
      .maybeSingle();
    if (error) throw error;
    if (!pipeline) return bad('El pipeline no pertenece a la organización');
  } else {
    const { data: pipeline, error } = await supabase
      .from('pipelines')
      .select('id')
      .eq('organization_id', organizationId)
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (!pipeline) return bad('La organización no tiene ningún pipeline configurado');
    pipelineId = pipeline.id as string;
  }

  let stageId = clean(body.stage_id);
  if (stageId) {
    const { data: stage, error } = await supabase.from('stages').select('id').eq('id', stageId).eq('pipeline_id', pipelineId).maybeSingle();
    if (error) throw error;
    if (!stage) return bad('La etapa no pertenece al pipeline indicado');
  } else {
    const { data: stage, error } = await supabase
      .from('stages')
      .select('id')
      .eq('pipeline_id', pipelineId)
      .order('position', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (!stage) return bad('El pipeline no tiene etapas configuradas');
    stageId = stage.id as string;
  }

  // ── 2. Sucursal (opcional, siempre validada contra la organización) ──────
  let branchId: number | null = null;
  if (body.branch_id != null) {
    const { data: branch, error } = await supabase
      .from('branches')
      .select('id')
      .eq('id', body.branch_id)
      .eq('organization_id', organizationId)
      .maybeSingle();
    if (error) throw error;
    if (!branch) return bad('La sucursal no pertenece a la organización');
    branchId = Number(branch.id);
  }

  // ── 3. Cliente: existente o nuevo. Sin ficha no hay lead contactable ─────
  let customerId = clean(body.customer_id);
  let createdCustomerId: string | null = null;

  if (customerId) {
    const { data: customer, error } = await supabase
      .from('customers')
      .select('id')
      .eq('id', customerId)
      .eq('organization_id', organizationId)
      .maybeSingle();
    if (error) throw error;
    if (!customer) return bad('El cliente no pertenece a la organización');
  } else if (body.new_customer) {
    const email = clean(body.new_customer.email);
    const phone = clean(body.new_customer.phone);
    const companyName = clean(body.new_customer.company_name);
    const customerType = clean(body.new_customer.customer_type) || 'person';
    const { first, last } = splitPersonName(body.new_customer);

    if (customerType === 'company') {
      if (!companyName) return bad('Un cliente de tipo empresa necesita razón social');
    } else if (!first) {
      return bad('El nombre del cliente nuevo es obligatorio');
    }
    // Un lead sin forma de contacto es exactamente el registro inútil que este
    // alta viene a evitar.
    if (!email && !phone) return bad('El cliente nuevo necesita al menos correo o teléfono');

    // `full_name` NO se envía: es columna generada (ver splitPersonName).
    const { data: customer, error } = await supabase
      .from('customers')
      .insert({
        organization_id: organizationId,
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
    if (error) {
      // Correo ya usado en esta organización: se devuelve el cliente que ya
      // existe para que la interfaz pueda ofrecer «usar el existente».
      if (isUniqueViolation(error) && violatesEmailIndex(error) && email) {
        const { data: existente } = await supabase
          .from('customers')
          .select('id, full_name')
          .eq('organization_id', organizationId)
          .eq('email', email)
          .maybeSingle();
        return conflict(
          `Ya existe un cliente con el correo ${email} en esta organización. ` +
            'Usa ese cliente para crear el lead en vez de crear una ficha repetida.',
          { existing_customer: existente ?? null },
        );
      }
      if (isUniqueViolation(error)) {
        return conflict('Ya existe un cliente con esos datos en esta organización. Busca la ficha existente en vez de crear una repetida.');
      }
      throw error;
    }

    customerId = customer.id as string;
    createdCustomerId = customerId;
  } else {
    return bad('Un lead necesita ficha de cliente: envía customer_id o new_customer');
  }

  // ── 4. Vendedor asignado (opcional, validado contra la organización) ─────
  const salespersonId = clean(body.salesperson_id);
  if (salespersonId) {
    const { data: member, error } = await supabase
      .from('organization_members')
      .select('user_id')
      .eq('user_id', salespersonId)
      .eq('organization_id', organizationId)
      .maybeSingle();
    if (error) throw error;
    if (!member) return bad('El vendedor asignado no es miembro de la organización');
  }

  // ── 5. Alta del lead ────────────────────────────────────────────────────
  const amount = Number.isFinite(Number(body.amount)) ? Number(body.amount) : 0;

  const { data: lead, error: insertError } = await supabase
    .from('opportunities')
    .insert({
      organization_id: organizationId,
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
      ...(dealType ? { deal_type: dealType } : {}),
      next_contact_at: clean(body.next_contact_at),
      temperature: clean(body.temperature),
      salesperson_id: salespersonId,
      created_by: ctx.userId,
    })
    .select('id, name, customer_id, pipeline_id, stage_id, amount, currency, status, record_type, source, temperature, next_contact_at, created_at')
    .single();

  if (insertError) {
    // Si acabamos de crear la ficha para este lead y el lead no cuajó, no se
    // deja un cliente huérfano en la base.
    if (createdCustomerId) await rollbackCustomer(ctx, createdCustomerId);
    throw insertError;
  }

  return { status: 201, data: lead as Record<string, unknown>, created_customer_id: createdCustomerId, customer_id: customerId };
}

/** Borra una ficha recién creada cuya alta de lead no cuajó (mejor esfuerzo, se registra si falla). */
export async function rollbackCustomer(ctx: LeadCreateContext, customerId: string): Promise<void> {
  const { error } = await ctx.supabase.from('customers').delete().eq('id', customerId).eq('organization_id', ctx.organizationId);
  if (error) {
    console.error('[leadCreateService] no se pudo revertir el cliente %s tras fallar el alta del lead: %s', customerId, error.message);
  }
}
