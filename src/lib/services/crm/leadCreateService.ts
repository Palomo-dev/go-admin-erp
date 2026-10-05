import type { SupabaseClient } from '@supabase/supabase-js';
import { prepararDatosLead } from './leadPreparation';
export { MANUAL_LEAD_SOURCE, normalizarOrigenLead } from './leadPreparation';
import { autoAssignLead, type LeadAssignmentOutcome } from './leadAutoAssign';
import { clean, resolveLeadCustomer, rollbackCustomer, type LeadCreateFailure, type LeadCustomerExtras, type NewCustomerInput } from './leadCustomer';
import { guardarLeadScore } from './leadScoreService';

// Reexportados para los llamadores previos a la extracción (F12, referidos).
export { isUniqueViolation, rollbackCustomer, splitPersonName } from './leadCustomer';
export type { LeadCustomerExtras, NewCustomerInput } from './leadCustomer';

/**
 * Alta de un lead (CRM ola 1, decisión D2 del dueño, 2026-09-29).
 *
 * **Un lead ES un cliente con `lifecycle_stage='lead'`.** Esta función crea o
 * actualiza la FICHA (`customers`) con los datos del lead —origen
 * (`lead_source`), responsable (`owner_id`), score e ICP (`lead_score`,
 * `icp_band`, D3) y `metadata.lead` (valor estimado, tipo de negocio, próximo
 * contacto…)— y **no crea ninguna oportunidad**. Antes creaba una
 * `opportunities.record_type='lead'`; las 42 que existen se siguen mostrando en
 * Oportunidades con la etiqueta «Lead», pero no nacen más (guardarraíl en
 * `src/__tests__/guardrails.test.ts`). La oportunidad la crea «Calificar»
 * (`POST /api/crm/leads/[id]/qualify` → `crm_create_opportunity`).
 *
 * La usan `POST /api/crm/leads`, la conversión de referidos y el importador de
 * leads (regla dura 7: una sola alta).
 *
 * - Ficha nueva: `lifecycle_stage='lead'` y al menos correo o teléfono
 *   (`resolveLeadCustomer`). Si algo falla después de crearla, se revierte.
 * - Ficha existente: nunca se degrada su ciclo de vida (un `customer` sigue
 *   siendo `customer`); se completa lo que falte (origen, responsable), se
 *   fusiona `metadata.lead` y se reactiva si estaba descartada. No se tocan
 *   etiquetas, `do_not_call` ni el resto de `metadata`.
 * - Responsable: el `salesperson_id` explícito (miembro de la organización) o
 *   la asignación automática (F1, `leadAutoAssign`), que nunca hace fallar el
 *   alta. Un responsable ya puesto en la ficha no se pisa.
 * - `pipeline_id` y `stage_id` ya no aplican (el lead no está en un embudo): se
 *   ignoran.
 */

/**
 * Permiso de crear leads (`permissions.code`). Lo exigen POST /api/crm/leads y la
 * importación, resuelto en el servidor con `hasOrgAdminOrPermission` (super admin
 * y roles 1/2 pasan; el resto, por rol o cargo con `check_user_permission`).
 */
export const LEADS_CREATE_PERMISSION = 'crm.leads.create';

export { OPPORTUNITY_DEAL_TYPES } from './opportunityDealTypes';
export type { OpportunityDealType } from './opportunityDealTypes';
import { OPPORTUNITY_DEAL_TYPES } from './opportunityDealTypes';

export interface CreateLeadBody {
  /** Título del lead («Distribuidora · Cali»); queda en `metadata.lead.titulo`. */
  name?: string;
  /** @deprecated D2: el lead ya no vive en un pipeline; se ignora. */
  pipeline_id?: string;
  /** @deprecated D2: se ignora. */
  stage_id?: string;
  customer_id?: string;
  new_customer?: NewCustomerInput;
  /** Valor estimado del lead → `metadata.lead.valor_estimado`. */
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

/** Datos del lead que solo pone el servidor (importador de leads). */
export interface LeadExtras {
  /** Se fusiona dentro de `customers.metadata.lead`. */
  metadata?: Record<string, unknown> | null;
  /** Banda de respaldo (A/B/C) si el ICP de la organización no da una. */
  icp_band?: 'A' | 'B' | 'C' | null;
}

/** Extras de servidor para la ficha nueva y el lead. */
export interface LeadCreateExtras {
  customer?: LeadCustomerExtras;
  lead?: LeadExtras;
}

export interface LeadCreateContext {
  organizationId: number;
  userId: string;
  supabase: SupabaseClient;
}

export type LeadCreateResult =
  | {
      status: 201;
      /** La ficha del lead (cliente), no una oportunidad. */
      data: Record<string, unknown>;
      created_customer_id: string | null;
      customer_id: string;
      /** Cómo se resolvió el responsable (F1): explícito, automático, apagado o sin asignar. */
      assignment: LeadAssignmentOutcome;
    }
  | LeadCreateFailure;

/** Columnas que devuelve el alta. */
const LEAD_COLUMNS =
  'id, full_name, email, phone, lifecycle_stage, lead_source, owner_id, lead_score, icp_band, last_contact_at, lead_discarded_at, metadata, created_at, updated_at';

const bad = (error: string): LeadCreateResult => ({ status: 400, error });

interface FichaLead {
  id: string;
  lifecycle_stage: string | null;
  lead_source: string | null;
  owner_id: string | null;
  lead_discarded_at: string | null;
  metadata: Record<string, unknown> | null;
}

/**
 * Crea (o marca como lead) la ficha del cliente. Errores de BD inesperados se
 * lanzan (la ruta los convierte en 500); validación → 400; ficha repetida → 409.
 */
export async function createLeadWithCustomer(
  ctx: LeadCreateContext,
  body: CreateLeadBody,
  /** Solo servidor (importador de leads). Las rutas HTTP de alta manual no lo pasan. */
  extras?: LeadCreateExtras,
): Promise<LeadCreateResult> {
  const { supabase, organizationId } = ctx;

  const dealType = clean(body.deal_type);
  if (dealType && !(OPPORTUNITY_DEAL_TYPES as readonly string[]).includes(dealType)) {
    return bad(`deal_type inválido. Valores: ${OPPORTUNITY_DEAL_TYPES.join(', ')}`);
  }
  const temperature = clean(body.temperature);
  if (temperature && !['cold', 'warm', 'hot'].includes(temperature)) return bad('temperature inválida. Valores: cold, warm, hot');
  const amount = body.amount === undefined || body.amount === null ? null : Number(body.amount);
  if (amount !== null && (!Number.isFinite(amount) || amount < 0)) return bad('amount inválido');
  const currency = clean(body.currency)?.toUpperCase() ?? null;
  if (currency && !/^[A-Z]{3}$/.test(currency)) return bad('currency inválida');

  // ── 1. Sucursal (opcional, siempre validada contra la organización) ──────
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

  // ── 2. Responsable explícito: validado ANTES de crear nada ───────────────
  const explicitOwner = clean(body.salesperson_id);
  if (explicitOwner) {
    const { data: member, error } = await supabase
      .from('organization_members')
      .select('user_id')
      .eq('user_id', explicitOwner)
      .eq('organization_id', organizationId)
      .maybeSingle();
    if (error) throw error;
    if (!member) return bad('El vendedor asignado no es miembro de la organización');
  }

  // ── 3. Ficha: existente o nueva ─────────────────────────────────────────
  const ficha = await resolveLeadCustomer(ctx, body, branchId, extras?.customer);
  if (!ficha.ok) return ficha.result;
  const { customerId, createdCustomerId } = ficha;

  try {
    const { data: actual, error: readError } = await supabase
      .from('customers')
      .select('id, lifecycle_stage, lead_source, owner_id, lead_discarded_at, metadata')
      .eq('id', customerId)
      .eq('organization_id', organizationId)
      .maybeSingle();
    if (readError) throw readError;
    if (!actual) throw new Error('La ficha del lead no se pudo leer tras crearla');
    const f = actual as FichaLead;

    // ── 4. Responsable: el de la ficha, el explícito o el automático ───────
    let assignment: LeadAssignmentOutcome;
    if (explicitOwner) {
      assignment = { status: 'explicit', user_id: explicitOwner };
    } else if (f.owner_id) {
      assignment = { status: 'skipped', reason: 'La ficha ya tiene responsable' };
    } else {
      // Nunca lanza: sin equipo/miembros o con error, el lead sigue sin asignar.
      assignment = await autoAssignLead({ organizationId, customerId, opportunityData: { amount: amount ?? 0, currency, deal_type: dealType } }, supabase);
      if (assignment.status !== 'assigned') {
        console.info('[leadCreateService] lead sin asignar (org %s, %s): %s', organizationId, assignment.status, assignment.reason);
      }
    }
    const nuevoOwner = assignment.status === 'assigned' || assignment.status === 'explicit' ? assignment.user_id : null;

    // ── 5. Datos del lead en la ficha (una sola escritura) ─────────────────
    const cambios = prepararDatosLead(f, body, ctx.userId, nuevoOwner, extras);
    const { data: guardado, error: updError } = await supabase
      .from('customers')
      .update(cambios)
      .eq('id', customerId)
      .eq('organization_id', organizationId)
      .select(LEAD_COLUMNS)
      .single();
    if (updError) throw updError;

    // ── 6. Score desde el ICP (D3). Nunca hace fallar el alta ──────────────
    const score = await guardarLeadScore(ctx, customerId, { amount, currency, deal_type: dealType }, extras?.lead?.icp_band ?? null);
    const data = { ...(guardado as Record<string, unknown>), ...(score ?? {}) };

    return { status: 201, data, created_customer_id: createdCustomerId, customer_id: customerId, assignment };
  } catch (e) {
    // Si acabamos de crear la ficha para este lead y el resto no cuajó, no se
    // deja un cliente a medias en la base.
    if (createdCustomerId) await rollbackCustomer(ctx, createdCustomerId);
    throw e;
  }
}
