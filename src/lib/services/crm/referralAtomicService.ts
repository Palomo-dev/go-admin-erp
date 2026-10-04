import type { SupabaseClient } from '@supabase/supabase-js';
import { clean, prepareLeadCustomerInsert } from './leadCustomer';
import { prepararDatosLead } from './leadPreparation';
import { autoAssignLead, type LeadAssignmentOutcome } from './leadAutoAssign';
import { evaluateICPProfiles, type ICPProfile } from './icpService';
import { scoreDesdeEvaluaciones } from './leadScoreService';
import { F12Error } from './f12Errors';
import type { LeadCreateContext, LeadCreateResult, CreateLeadBody } from './leadCreateService';
import type { ConvertReferralBody, ConvertReferralResult, ReferralView, Referral } from './referralsService';

const LEAD_FIELDS = 'id full_name email phone lifecycle_stage lead_source owner_id lead_score icp_band last_contact_at lead_discarded_at metadata created_at updated_at'.split(' ');
interface ReferralBase { referral: Referral; customer: Record<string, unknown> | null; profiles: ICPProfile[] }

/** Prepara con los mismos motores del alta; la RPC guarda la ficha y el enlace en una transacción. */
export async function convertReferralAtomic(
  ctx: LeadCreateContext, current: ReferralView, body: ConvertReferralBody, writer?: SupabaseClient,
): Promise<ConvertReferralResult | Exclude<LeadCreateResult, { status: 201 }>> {
  const amount = body.amount == null ? null : Number(body.amount), currency = clean(body.currency)?.toUpperCase() ?? null;
  if (amount !== null && (!Number.isFinite(amount) || amount < 0)) return { status: 400, error: 'amount inválido' };
  if (currency && !/^[A-Z]{3}$/.test(currency)) return { status: 400, error: 'currency inválida' };
  const explicit = clean(body.salesperson_id);
  if (explicit) {
    const member = await ctx.supabase.from('organization_members').select('user_id').eq('organization_id', ctx.organizationId).eq('user_id', explicit).eq('is_active', true).maybeSingle();
    if (member.error) throw member.error;
    if (!member.data) return { status: 400, error: 'El vendedor asignado no es miembro activo de la organización' };
  }
  // Route and session checks precede the service client. SQL checks the actor again at commit time.
  const referrer = await ctx.supabase.from('customers').select('id,branch_id').eq('id', current.referrer_customer_id).eq('organization_id', ctx.organizationId).maybeSingle();
  if (referrer.error) throw referrer.error;
  if (!referrer.data) throw new F12Error(404, 'NOT_FOUND', 'No se encontró la ficha del referidor');
  const branch = await ctx.supabase.rpc('app_branch_access', { p_branch_id: referrer.data.branch_id ?? null });
  if (branch.error) throw branch.error;
  if (branch.data !== true) throw new F12Error(403, 'BRANCH_FORBIDDEN', 'No tienes acceso a la sucursal del referidor');
  const service = writer ?? (await import('@/lib/supabase/server-service')).getServiceClient();
  const read = await service.rpc('fn_crm_referido_base', { p_org: ctx.organizationId, p_actor: ctx.userId, p_referral: current.id, p_customer: body.customer_id ?? null });
  if (read.error) throw read.error;
  const base = read.data as ReferralBase;
  if (!base?.referral || !Array.isArray(base.profiles)) throw new Error('Contexto incompleto al convertir el referido');
  if (base.referral.status !== 'qualified' || base.referral.referred_customer_id || base.referral.opportunity_id) throw new F12Error(409, 'ALREADY_LINKED', 'El referido cambió o ya está enlazado');
  const leadBody: CreateLeadBody = {
    name: body.name?.trim() || `Referido: ${base.referral.referred_name}`, amount: amount ?? undefined, currency: currency ?? undefined,
    source: 'referral', deal_type: 'referral', salesperson_id: explicit ?? undefined,
  };
  let prepared: Record<string, unknown> | null = null;
  if (!body.customer_id) {
    const result = prepareLeadCustomerInsert({ full_name: base.referral.referred_name,
      email: (body.referred_email === undefined ? base.referral.referred_email : body.referred_email) ?? undefined,
      phone: (body.referred_phone === undefined ? base.referral.referred_phone : body.referred_phone) ?? undefined }, null);
    if (!result.ok) return result.result;
    prepared = result.payload;
  }
  const ficha = base.customer ?? prepared!;
  let assignment: LeadAssignmentOutcome;
  if (explicit) assignment = { status: 'explicit', user_id: explicit };
  else if (ficha.owner_id) assignment = { status: 'skipped', reason: 'La ficha ya tiene responsable' };
  else assignment = await autoAssignLead({ organizationId: ctx.organizationId, customerId: body.customer_id ?? current.id,
    customerData: ficha, opportunityData: { amount: amount ?? 0, currency, deal_type: 'referral' } }, ctx.supabase);
  const owner = assignment.status === 'assigned' || assignment.status === 'explicit' ? assignment.user_id : null;
  const changes = prepararDatosLead(ficha, leadBody, ctx.userId, owner);
  const score = scoreDesdeEvaluaciones(evaluateICPProfiles(base.profiles, ficha, { amount, currency, deal_type: 'referral' }));
  if (score.lead_score !== null) Object.assign(changes, score);
  const write = await service.rpc('fn_crm_convertir_referido', {
    p_org: ctx.organizationId, p_actor: ctx.userId, p_referral: current.id, p_customer: body.customer_id ?? null,
    p_expected: base, p_new_customer: prepared, p_changes: changes,
  });
  if (write.error) throw write.error;
  if (!write.data?.referral?.id || !write.data?.customer?.id) throw new Error('Respuesta incompleta al convertir el referido');
  const customer = write.data.customer as Record<string, unknown>;
  return { referral: { ...current, ...write.data.referral, referred: { id: String(customer.id), full_name: customer.full_name as string | null } },
    lead: Object.fromEntries(LEAD_FIELDS.map(k => [k, customer[k]])), created_customer_id: write.data.created_customer_id ?? null };
}
