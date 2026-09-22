import type { SupabaseClient } from '@supabase/supabase-js';
import { autoAssignLead, type LeadAssignmentOutcome } from './leadAutoAssign';
import { clean, resolveLeadCustomer, rollbackCustomer, type LeadCreateFailure, type NewCustomerInput } from './leadCustomer';

// Reexportados para los llamadores previos a la extracción (F12, referidos).
export { isUniqueViolation, rollbackCustomer, splitPersonName } from './leadCustomer';
export type { NewCustomerInput } from './leadCustomer';

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
 *
 * Añadido en F1 (cierre, aditivo): si el cuerpo NO trae `salesperson_id`, el
 * vendedor se resuelve con `assignmentService` según la configuración de la
 * organización (`leadAutoAssign`). El resultado viaja en `assignment`; la
 * asignación nunca hace fallar el alta (sin equipo → lead sin asignar).
 */

/** Origen por defecto de un lead creado a mano desde el ERP. */
export const MANUAL_LEAD_SOURCE = 'manual_erp';

export const OPPORTUNITY_DEAL_TYPES = ['new', 'renewal', 'expansion', 'referral', 'partner'] as const;
export type OpportunityDealType = (typeof OPPORTUNITY_DEAL_TYPES)[number];


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
  | {
      status: 201;
      data: Record<string, unknown>;
      created_customer_id: string | null;
      customer_id: string;
      /** Cómo se resolvió el vendedor (F1): explícito, automático, apagado o sin asignar. */
      assignment: LeadAssignmentOutcome;
    }
  | LeadCreateFailure;


/** Columnas que devuelve el alta (literal: el tipado de Supabase las analiza). `salesperson_id` desde F1. */
const LEAD_COLUMNS =
  'id, name, customer_id, pipeline_id, stage_id, amount, currency, status, record_type, source, temperature, next_contact_at, salesperson_id, created_at';

const bad = (error: string): LeadCreateResult => ({ status: 400, error });

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
  const ficha = await resolveLeadCustomer(ctx, body, branchId);
  if (!ficha.ok) return ficha.result;
  const { customerId, createdCustomerId } = ficha;

  const amount = Number.isFinite(Number(body.amount)) ? Number(body.amount) : 0;
  const currency = clean(body.currency) || 'COP';

  // ── 4. Vendedor: explícito (validado contra la organización) o automático ─
  // El explícito manda: la asignación automática solo entra cuando el cuerpo
  // no trae vendedor. Un vendedor ajeno a la organización es 400, nunca se
  // «corrige» en silencio con la asignación automática.
  const explicitSalespersonId = clean(body.salesperson_id);
  let assignment: LeadAssignmentOutcome;
  if (explicitSalespersonId) {
    const { data: member, error } = await supabase
      .from('organization_members')
      .select('user_id')
      .eq('user_id', explicitSalespersonId)
      .eq('organization_id', organizationId)
      .maybeSingle();
    if (error) throw error;
    if (!member) return bad('El vendedor asignado no es miembro de la organización');
    assignment = { status: 'explicit', user_id: explicitSalespersonId };
  } else {
    // Nunca lanza: sin equipo/miembros o con error, el lead sigue adelante sin asignar.
    const auto = await autoAssignLead(
      { organizationId, customerId, opportunityData: { amount, currency, deal_type: dealType } },
      supabase,
    );
    if (auto.status !== 'assigned') {
      console.info('[leadCreateService] lead sin asignar (org %s, %s): %s', organizationId, auto.status, auto.reason);
    }
    assignment = auto;
  }
  const salespersonId = assignment.status === 'assigned' || assignment.status === 'explicit' ? assignment.user_id : null;

  // ── 5. Alta del lead ────────────────────────────────────────────────────

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
      currency,
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
    .select(LEAD_COLUMNS)
    .single();

  if (insertError) {
    // Si acabamos de crear la ficha para este lead y el lead no cuajó, no se
    // deja un cliente huérfano en la base.
    if (createdCustomerId) await rollbackCustomer(ctx, createdCustomerId);
    throw insertError;
  }

  return {
    status: 201,
    data: lead as Record<string, unknown>,
    created_customer_id: createdCustomerId,
    customer_id: customerId,
    assignment,
  };
}
