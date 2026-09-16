/**
 * F10 — pasos del cierre «al ganar» (`WonCloseModal`), sin React ni cliente
 * global de Supabase: reciben el cliente y las dependencias, así se prueban
 * con el doble de F10. Cada paso devuelve un texto honesto de lo que hizo.
 *
 * Ronda 2: el paso «stock» se retiró (leía la tabla `inventory`, que no
 * existe: regla dura 3) y la comisión se salta con mensaje honesto cuando el
 * trigger de BD `fn_create_commission_on_opportunity_won` ya la devengó
 * (`useStageFlow` cambia la etapa ANTES de abrir el modal).
 *
 * Deuda D1/D2: «onboarding» y «renovación» delegan en F11
 * (`startOnboardingForWonOpportunity`, `scheduleRenewal`): idempotentes por los
 * índices únicos parciales de la BD (un 23505 = «ya existía»), con instancia y
 * pasos de onboarding, y sin hitos de renovación en el pasado. Aquí no se
 * inserta ninguna oportunidad ni tarea de renovación (regla dura 7).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { CommissionAccrualResult } from '@/lib/services/crm/commissionService';
import { findOnboardingPipelineId, OnboardingPipelineError, startOnboardingForWonOpportunity } from '@/lib/services/crm/onboardingService';
import { scheduleRenewal, SEQUENCE_ENROLL_DEFERRED } from '@/lib/services/crm/renewalService';
import { formatPlainDate } from '@/lib/utils/dateDisplay';
import { toPlainDate } from '@/lib/utils/timezone';

export type StepStatus = 'pending' | 'running' | 'done' | 'skipped' | 'error';

export interface CloseStep {
  id: WonStepId;
  label: string;
  description: string;
  autoExecute: boolean;
  status: StepStatus;
  result?: string;
  optional?: boolean;
}

export type WonStepId = 'invoice' | 'pos_sale' | 'reservations' | 'onboarding' | 'renewal' | 'referral' | 'commission';

export interface OpportunityData {
  id: string;
  name: string;
  customer_id: string | null;
  amount: number;
  currency: string;
  salesperson_id: string | null;
  pipeline_id: string;
  stage_id: string;
  billing_cycle_months: number | null;
  metadata: Record<string, unknown> | null;
  created_by: string | null;
}

/** Lo que los pasos necesitan del exterior (el modal lo arma; las pruebas lo doblan). */
export interface WonCloseDeps {
  supabase: SupabaseClient;
  orgId: number;
  /** Sucursal del contexto global; null en modo «Todas». */
  contextBranchId: number | null;
  timezone: string;
  now?: () => Date;
  getLatestProposal: (opportunityId: string) => Promise<{ id: string; branch_id: number | null } | null>;
  convertToInvoice: (quotationId: string, orgId: number, branchId: number, opportunityId: string) => Promise<string>;
  accrueCommission: (opportunityId: string, salespersonId: string, baseAmount: number) => Promise<CommissionAccrualResult | null>;
  /** F11 (deuda D1). Opcional: por defecto el servicio real; las pruebas lo doblan. */
  startOnboarding?: typeof startOnboardingForWonOpportunity;
  /** F11 (deuda D2). Opcional: por defecto el servicio real; las pruebas lo doblan. */
  scheduleRenewal?: typeof scheduleRenewal;
}

export function buildInitialSteps(): CloseStep[] {
  return [
    { id: 'invoice', label: 'Generar factura', description: 'Convierte la última cotización en factura (invoice_sales.opportunity_id)', autoExecute: true, status: 'pending' },
    { id: 'pos_sale', label: 'Generar venta POS', description: 'Crea venta en POS vinculada a la oportunidad (sales.opportunity_id)', autoExecute: false, status: 'pending', optional: true },
    { id: 'reservations', label: 'Crear reservas', description: 'Crea reservas desde opportunity_spaces con opportunity_id', autoExecute: true, status: 'pending' },
    { id: 'onboarding', label: 'Crear oportunidad de Onboarding', description: 'Crea oportunidad hija en pipeline type=onboarding', autoExecute: true, status: 'pending' },
    { id: 'renewal', label: 'Programar renovación', description: 'Hitos de renovación 120/90/60/30/15/7 días antes del vencimiento', autoExecute: true, status: 'pending' },
    { id: 'referral', label: 'Pedir referido', description: 'Crea tarea de referido activada post-30-días + plantilla de mensaje', autoExecute: true, status: 'pending' },
    { id: 'commission', label: 'Devengar comisión', description: 'Registra la comisión del vendedor si el sistema no la devengó ya al ganar', autoExecute: true, status: 'pending' },
  ];
}

function requireOrg(deps: WonCloseDeps): number {
  if (!deps.orgId || deps.orgId <= 0) throw new Error('Organización no válida');
  return deps.orgId;
}

export async function executeInvoice(opp: OpportunityData, deps: WonCloseDeps): Promise<string> {
  const orgId = requireOrg(deps);
  const latestProposal = await deps.getLatestProposal(opp.id);
  if (!latestProposal) return 'Sin cotización vinculada — se omitió la factura';
  const branchId = deps.contextBranchId ?? latestProposal.branch_id;
  if (!branchId) return 'Sin sucursal definida (selecciona una sucursal concreta, no "Todas") — se omitió la factura';

  // opportunity_id viaja en el INSERT; la cartera la crea el trigger tr_create_account_receivable (status <> 'draft'),
  // verificado por MCP el 2026-09-15: aquí solo se comprueba y se informa.
  const invoiceId = await deps.convertToInvoice(latestProposal.id, orgId, branchId, opp.id);
  const { data: ar } = await deps.supabase.from('accounts_receivable').select('id, balance').eq('invoice_id', invoiceId).eq('organization_id', orgId).maybeSingle();
  const arNote = ar ? 'cartera creada' : 'sin cartera: revisa la factura en Finanzas';
  return `Factura generada: ${invoiceId.substring(0, 8)}… (${arNote})`;
}

export async function executePosSale(opp: OpportunityData, deps: WonCloseDeps): Promise<string> {
  if (!opp.customer_id) return 'Sin cliente — se omitió venta POS';
  const orgId = requireOrg(deps);
  const { data: userData } = await deps.supabase.auth.getUser();
  const branchIdForSale = deps.contextBranchId;
  if (!branchIdForSale) return 'Sin sucursal seleccionada (selecciona una sucursal concreta, no "Todas") — se omitió venta POS';
  const { data: sale, error } = await deps.supabase
    .from('sales')
    .insert({
      organization_id: orgId, branch_id: branchIdForSale, customer_id: opp.customer_id, user_id: userData.user?.id || opp.created_by || '',
      total: opp.amount, subtotal: opp.amount, tax_total: 0, balance: opp.amount, status: 'completed', payment_status: 'pending', tax_included: false,
      sale_date: (deps.now?.() ?? new Date()).toISOString(), opportunity_id: opp.id, salesperson_id: opp.salesperson_id, source: 'crm', include_in_cash_register: false,
    })
    .select('id')
    .single();
  if (error) throw error;
  return `Venta CRM creada: ${(sale as { id: string }).id.substring(0, 8)}...`;
}

export async function executeReservations(opp: OpportunityData, deps: WonCloseDeps): Promise<string> {
  const orgId = requireOrg(deps);
  const { data: spaces } = await deps.supabase.from('opportunity_spaces').select('space_id, nights, unit_price, checkin_date, checkout_date').eq('opportunity_id', opp.id);
  if (!spaces || spaces.length === 0) return 'Sin espacios — se omitieron reservas';
  const latestProposal = await deps.getLatestProposal(opp.id);
  const reservationBranchId = deps.contextBranchId ?? latestProposal?.branch_id ?? null;
  if (!reservationBranchId) throw new Error('No se puede crear la reserva: selecciona una sucursal concreta o asegúrate de que la oportunidad tenga una propuesta con sucursal asignada.');
  const nowMs = (deps.now?.() ?? new Date()).getTime();
  let created = 0;
  for (const s of spaces as Array<Record<string, unknown>>) {
    const checkinDate = s.checkin_date as string | null;
    const checkoutDate = s.checkout_date as string | null;
    const nights = Number(s.nights) || 1;
    const startDate = checkinDate ? new Date(checkinDate).toISOString() : new Date(nowMs).toISOString();
    const endDate = checkoutDate ? new Date(checkoutDate).toISOString() : new Date(nowMs + nights * 24 * 60 * 60 * 1000).toISOString();
    const { error } = await deps.supabase.from('reservations').insert({
      organization_id: orgId, branch_id: reservationBranchId, customer_id: opp.customer_id, space_id: s.space_id as string, start_date: startDate, end_date: endDate,
      checkin: checkinDate || null, checkout: checkoutDate || null, opportunity_id: opp.id, status: 'confirmed', total_estimated: Number(s.unit_price) * nights,
    });
    if (error) throw error;
    created++;
  }
  return `Reservas creadas: ${created}`;
}

/**
 * Onboarding (D1): delega en F11. Política de F10 que se conserva: sin pipeline
 * de onboarding NO se crea (F11 lo crearía); sin cliente o sin etapas se omite;
 * sin sucursal se lanza. El resto —hija idempotente por
 * `uq_opportunities_one_onboarding_child_per_parent`, instancia y pasos— es F11.
 */
export async function executeOnboarding(opp: OpportunityData, deps: WonCloseDeps): Promise<string> {
  const orgId = requireOrg(deps);
  if (!(await findOnboardingPipelineId(orgId, deps.supabase))) return 'Sin pipeline de onboarding — se omitió oportunidad hija';
  if (!opp.customer_id) return 'Sin cliente — se omitió onboarding';
  const latestProposal = await deps.getLatestProposal(opp.id);
  const onboardingBranchId = deps.contextBranchId ?? latestProposal?.branch_id ?? null;
  if (!onboardingBranchId) throw new Error('No se puede crear el onboarding: selecciona una sucursal concreta o asegúrate de que la oportunidad tenga una propuesta con sucursal asignada.');
  const start = deps.startOnboarding ?? startOnboardingForWonOpportunity;
  try {
    const r = await start(orgId, opp.id, deps.supabase, { now: deps.now?.() ?? new Date(), branchId: onboardingBranchId, createdBy: opp.created_by });
    const id = r.onboarding_opportunity_id.substring(0, 8);
    if (r.already_existed) return `Onboarding ya existía: ${id} — no se duplicó`;
    return `Onboarding creado: ${id} (${r.steps_created} pasos)`;
  } catch (err) {
    if (err instanceof OnboardingPipelineError) return 'Sin etapas en pipeline de onboarding — se omitió';
    throw err;
  }
}

/**
 * Renovación (D2): delega en F11 (`scheduleRenewal`): una oportunidad
 * `deal_type='renewal'` por contrato (`uq_opportunities_one_renewal_per_parent`)
 * y solo los hitos futuros como tareas `renewal_milestone`. El vencimiento sale
 * de `closed_at` (trigger); si aún no está escrito, del instante del cierre.
 * `metadata.renewal_date` del padre se conserva para el detalle de la oportunidad.
 * La renovación lleva la sucursal del contexto y el `created_by` de la oportunidad,
 * como la hija de onboarding. Aquí NO se pasa `enroll` (esto corre en el navegador):
 * la secuencia de renovación la inscribe `renewals_sync` en el servidor (H1, r2).
 */
export async function executeRenewal(opp: OpportunityData, deps: WonCloseDeps): Promise<string> {
  const orgId = requireOrg(deps);
  if (!opp.billing_cycle_months || opp.billing_cycle_months <= 0) return 'Sin billing_cycle_months — se omitió renovación';
  if (!opp.customer_id) return 'Sin cliente — se omitió renovación';
  const now = deps.now?.() ?? new Date();
  const schedule = deps.scheduleRenewal ?? scheduleRenewal;
  const r = await schedule(orgId, opp.id, opp.billing_cycle_months, deps.supabase, {
    now, timezone: deps.timezone, closedAtFallback: now, branchId: deps.contextBranchId, createdBy: opp.created_by,
  });
  const { error } = await deps.supabase
    .from('opportunities')
    .update({ metadata: { ...(opp.metadata || {}), renewal_date: r.renewal_date, billing_cycle_months: opp.billing_cycle_months } })
    .eq('id', opp.id)
    .eq('organization_id', orgId);
  if (error) throw error;
  const renewalLabel = formatPlainDate(toPlainDate(new Date(r.renewal_date), deps.timezone));
  if (r.already_existed) return `Renovación ya programada (${renewalLabel}) — no se duplicó`;
  // Tester D1/D2: F11 no lanza si la secuencia de renovación no se inscribe; el paso lo dice en vez de tragárselo.
  // Desde el navegador la inscripción queda diferida al sync del servidor (no es un fallo).
  const seqNote = r.sequence_error === SEQUENCE_ENROLL_DEFERRED
    ? ` · secuencia de renovación: ${r.sequence_error}`
    : r.sequence_error ? ` · secuencia de renovación no inscrita: ${r.sequence_error}` : '';
  return `Hitos creados: ${r.tasks_created} (renovación: ${renewalLabel})${seqNote}`;
}

export async function executeReferral(opp: OpportunityData, deps: WonCloseDeps): Promise<string> {
  const orgId = requireOrg(deps);
  const referralDate = new Date((deps.now?.() ?? new Date()).getTime() + 30 * 24 * 60 * 60 * 1000);
  const { error: taskError } = await deps.supabase.from('tasks').insert({
    organization_id: orgId, title: `Pedir referido — ${opp.name}`,
    description: 'Plantilla: "Hola, nos alegra que hayas elegido nuestros servicios. ¿Conoces a alguien que pueda beneficiarse de lo que ofrecemos? Por cada referido exitoso, te otorgamos un beneficio especial."',
    due_date: referralDate.toISOString(), assigned_to: opp.salesperson_id || opp.created_by, priority: 'med', type: 'referido', status: 'open',
    related_to_id: opp.id, related_to_type: 'opportunity', customer_id: opp.customer_id, created_by: opp.created_by,
  });
  if (taskError) throw taskError;
  return `Tarea de referido programada para ${formatPlainDate(toPlainDate(referralDate, deps.timezone))}`;
}

export async function executeCommission(opp: OpportunityData, deps: WonCloseDeps): Promise<string> {
  if (!opp.salesperson_id) return 'Sin vendedor — se omitió comisión';
  const result = await deps.accrueCommission(opp.id, opp.salesperson_id, Number(opp.amount) || 0);
  if (!result) return 'Comisión no devengada (tasa = 0)';
  if (result.already_accrued && result.existing_status === 'cancelled') {
    return 'Comisión existente cancelada por un gestor (rechazo o clawback): no se devenga otra automáticamente; si procede, hazlo desde Comisiones';
  }
  if (result.already_accrued) return `Comisión ya devengada por el sistema al ganar: ${result.commission_amount} (tasa ${result.commission_rate}%) — no se duplicó`;
  return `Comisión devengada: ${result.commission_amount} (tasa ${result.commission_rate}%)`;
}

export const WON_STEP_EXECUTORS: Record<WonStepId, (opp: OpportunityData, deps: WonCloseDeps) => Promise<string>> = {
  invoice: executeInvoice,
  pos_sale: executePosSale,
  reservations: executeReservations,
  onboarding: executeOnboarding,
  renewal: executeRenewal,
  referral: executeReferral,
  commission: executeCommission,
};
