/**
 * F10 — propuesta desde la oportunidad, lado servidor (route handlers).
 *
 * Toda lectura y escritura lleva `organization_id`: la oportunidad y la
 * cotización se resuelven por (id, organización) y las tablas hijas sin
 * `organization_id` (`opportunity_products`, `opportunity_custom_lines`) solo
 * se leen después de comprobar que la oportunidad es de la organización.
 *
 * Reusa `quotations` (opportunity_id, sections_json) y `quotation_items`; la
 * narrativa la construye `proposalNarrative` (puro). `issue_date` la pone el
 * trigger `trg_set_quotation_issue_date_tz` en la zona de la organización.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { todayInTz } from '@/lib/utils/dateDisplay';
import {
  buildProposalSections,
  mergeSections,
  coerceSections,
  formatMoney,
  type ProposalSections,
  type PricingLine,
  type ObjectionLite,
  type DiscoveryFieldLite,
} from '@/lib/services/crm/proposalNarrative';

export interface ProposalContextData {
  opportunityId: string;
  opportunityName: string;
  opportunityAmount: number;
  currency: string;
  customerId: string | null;
  customerName: string | null;
  customerEmail: string | null;
  salespersonId: string | null;
  verticalSlug: string | null;
  discoveryFields: DiscoveryFieldLite[];
  discovery: Record<string, unknown>;
  objections: ObjectionLite[];
  pricing: { currency: string; lines: PricingLine[]; total: number; billingCycleMonths: number | null };
}

export interface ProposalRecord {
  id: string;
  number: string;
  status: string;
  opportunity_id: string | null;
  customer_id: string | null;
  total: number;
  currency: string;
  valid_until: string | null;
  issue_date: string | null;
  payment_link_url: string | null;
  signature_id: string | null;
  converted_invoice_id: string | null;
  sections: ProposalSections | null;
  updated_at: string | null;
}

const QUOTATION_SELECT = 'id, number, status, opportunity_id, customer_id, total, currency, valid_until, issue_date, payment_link_url, signature_id, converted_invoice_id, sections_json, updated_at';

function toRecord(row: Record<string, unknown>): ProposalRecord {
  return {
    id: String(row.id),
    number: String(row.number ?? ''),
    status: String(row.status ?? 'draft'),
    opportunity_id: (row.opportunity_id as string | null) ?? null,
    customer_id: (row.customer_id as string | null) ?? null,
    total: Number(row.total ?? 0),
    currency: String(row.currency ?? 'COP'),
    valid_until: (row.valid_until as string | null) ?? null,
    issue_date: (row.issue_date as string | null) ?? null,
    payment_link_url: (row.payment_link_url as string | null) ?? null,
    signature_id: (row.signature_id as string | null) ?? null,
    converted_invoice_id: (row.converted_invoice_id as string | null) ?? null,
    sections: coerceSections(row.sections_json),
    updated_at: (row.updated_at as string | null) ?? null,
  };
}

/** Suma `days` a un día calendario YYYY-MM-DD sin pasar por la zona local. */
export function addDaysPlain(plain: string, days: number): string {
  const [y, m, d] = plain.split('-').map(Number);
  const t = Date.UTC(y, m - 1, d + days);
  const dt = new Date(t);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

/** Carga el contexto de la oportunidad (o null si no es de la organización). */
export async function loadProposalContext(orgId: number, opportunityId: string, supabase: SupabaseClient): Promise<ProposalContextData | null> {
  const { data: opp, error } = await supabase
    .from('opportunities')
    .select('id, name, customer_id, amount, currency, salesperson_id, vertical_id, discovery_data, billing_cycle_months')
    .eq('id', opportunityId)
    .eq('organization_id', orgId)
    .maybeSingle();
  if (error) throw new Error(`No se pudo leer la oportunidad: ${error.message}`);
  if (!opp) return null;
  const o = opp as Record<string, unknown>;

  const [customerRes, verticalRes, objectionsRes, productsRes, customRes] = await Promise.all([
    o.customer_id
      ? supabase.from('customers').select('id, full_name, email, company_name').eq('id', o.customer_id as string).eq('organization_id', orgId).maybeSingle()
      : Promise.resolve({ data: null }),
    o.vertical_id
      ? supabase.from('verticals').select('id, slug').eq('id', o.vertical_id as string).eq('organization_id', orgId).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from('opportunity_objections').select('resolved, notes, objection:objections(title, recommended_response)').eq('opportunity_id', opportunityId).eq('organization_id', orgId),
    supabase.from('opportunity_products').select('product_id, quantity, unit_price, total_price, product:products(name, sku)').eq('opportunity_id', opportunityId),
    supabase.from('opportunity_custom_lines').select('concept, quantity, unit_price, total_price').eq('opportunity_id', opportunityId),
  ]);

  const customer = (customerRes as { data: Record<string, unknown> | null }).data;
  const vertical = (verticalRes as { data: Record<string, unknown> | null }).data;
  const verticalSlug = vertical ? String(vertical.slug ?? '') || null : null;

  let discoveryFields: DiscoveryFieldLite[] = [];
  if (o.vertical_id) {
    const { data: tpl } = await supabase
      .from('discovery_templates')
      .select('sections')
      .eq('organization_id', orgId)
      .eq('vertical_id', o.vertical_id as string)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();
    const sections = (tpl as { sections?: unknown } | null)?.sections;
    if (Array.isArray(sections)) {
      discoveryFields = sections
        .filter((f): f is Record<string, unknown> => !!f && typeof f === 'object' && typeof (f as Record<string, unknown>).id === 'string')
        .map((f) => ({ id: String(f.id), label: typeof f.label === 'string' ? f.label : String(f.id), type: typeof f.type === 'string' ? f.type : 'text' }));
    }
  }
  const discovery = o.discovery_data && typeof o.discovery_data === 'object' && !Array.isArray(o.discovery_data) ? (o.discovery_data as Record<string, unknown>) : {};
  if (!discoveryFields.length) discoveryFields = Object.keys(discovery).map((id) => ({ id, label: id.replace(/_/g, ' '), type: 'text' }));

  const objections: ObjectionLite[] = ((objectionsRes as { data: Record<string, unknown>[] | null }).data ?? []).map((r) => {
    const rel = r.objection as Record<string, unknown> | Record<string, unknown>[] | null;
    const ob = Array.isArray(rel) ? rel[0] : rel;
    return { title: String(ob?.title ?? 'Objeción'), recommended_response: (ob?.recommended_response as string | null) ?? null, resolved: r.resolved === true };
  });

  const currency = String(o.currency ?? 'COP');
  const lines: PricingLine[] = [];
  for (const p of ((productsRes as { data: Record<string, unknown>[] | null }).data ?? [])) {
    const prod = p.product as Record<string, unknown> | Record<string, unknown>[] | null;
    const pr = Array.isArray(prod) ? prod[0] : prod;
    const qty = Number(p.quantity) || 1;
    const unit = Number(p.unit_price) || 0;
    lines.push({ description: String(pr?.name ?? `Producto #${p.product_id}`), qty, unit_price: unit, total: Number(p.total_price) || qty * unit });
  }
  for (const c of ((customRes as { data: Record<string, unknown>[] | null }).data ?? [])) {
    const qty = Number(c.quantity) || 1;
    const unit = Number(c.unit_price) || 0;
    lines.push({ description: String(c.concept ?? 'Concepto'), qty, unit_price: unit, total: Number(c.total_price) || qty * unit });
  }
  const total = lines.reduce((s, l) => s + l.total, 0);

  return {
    opportunityId,
    opportunityName: String(o.name ?? ''),
    opportunityAmount: Number(o.amount ?? 0),
    currency,
    customerId: (o.customer_id as string | null) ?? null,
    customerName: customer ? String(customer.full_name ?? customer.company_name ?? '') || null : null,
    customerEmail: customer ? ((customer.email as string | null) ?? null) : null,
    salespersonId: (o.salesperson_id as string | null) ?? null,
    verticalSlug,
    discoveryFields,
    discovery,
    objections,
    pricing: { currency, lines, total, billingCycleMonths: typeof o.billing_cycle_months === 'number' ? o.billing_cycle_months : null },
  };
}

export async function getLatestProposal(orgId: number, opportunityId: string, supabase: SupabaseClient): Promise<ProposalRecord | null> {
  const { data } = await supabase
    .from('quotations')
    .select(QUOTATION_SELECT)
    .eq('organization_id', orgId)
    .eq('opportunity_id', opportunityId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ? toRecord(data as Record<string, unknown>) : null;
}

export async function getProposal(orgId: number, quotationId: string, supabase: SupabaseClient): Promise<ProposalRecord | null> {
  const { data } = await supabase.from('quotations').select(QUOTATION_SELECT).eq('id', quotationId).eq('organization_id', orgId).maybeSingle();
  return data ? toRecord(data as Record<string, unknown>) : null;
}

async function nextQuotationNumber(orgId: number, supabase: SupabaseClient): Promise<string> {
  // Misma regla que CotizacionesService.generateQuotationNumber (cliente de navegador): COT-0001 correlativo.
  const { data } = await supabase.from('quotations').select('number').eq('organization_id', orgId).like('number', 'COT-%').order('created_at', { ascending: false }).limit(1);
  let next = 1;
  const last = (data as Array<{ number: string }> | null)?.[0]?.number;
  const m = last ? /COT-(\d+)/.exec(last) : null;
  if (m) next = Number.parseInt(m[1], 10) + 1;
  return `COT-${String(next).padStart(4, '0')}`;
}

async function logActivity(orgId: number, opportunityId: string, userId: string | null, notes: string, metadata: Record<string, unknown>, supabase: SupabaseClient): Promise<void> {
  const { error } = await supabase.from('activities').insert({
    organization_id: orgId,
    activity_type: 'system',
    user_id: userId,
    notes,
    related_type: 'opportunity',
    related_id: opportunityId,
    occurred_at: new Date().toISOString(),
    metadata: { source: 'proposal', auto_generated: true, ...metadata },
  });
  if (error) console.warn('[proposalServerService] actividad no registrada:', error.message);
}

export interface GenerateOptions {
  userId: string | null;
  timezone: string;
  roi?: { summary: string; outputs: Record<string, number> } | null;
  /** Regenerar descartando también las secciones editadas a mano (la UI pide confirmación). */
  force?: boolean;
}

/** La oportunidad no tiene cliente: es un error del usuario (400), no del servidor. */
export class ProposalCustomerRequiredError extends Error {
  readonly statusCode = 400;
  readonly code = 'CUSTOMER_REQUIRED';
  constructor() {
    super('La oportunidad no tiene cliente: asigna uno antes de generar la propuesta');
    this.name = 'ProposalCustomerRequiredError';
  }
}

/**
 * r4: la cotización ya se convirtió en factura (`status='converted'` o
 * `converted_invoice_id`): ni se regenera (los totales divergirían de la
 * factura) ni vuelve a `sent` (reabriría `convertToInvoice`, que solo frena
 * `status='converted'`). 409, lo mapea `failResponse` por `statusCode`.
 */
export class ProposalConvertedError extends Error {
  readonly statusCode = 409;
  readonly code = 'PROPOSAL_CONVERTED';
  constructor(number: string) {
    super(`La propuesta ${number} ya está facturada: no se puede regenerar ni marcar como enviada`);
    this.name = 'ProposalConvertedError';
  }
}

export function isConvertedProposal(p: Pick<ProposalRecord, 'status' | 'converted_invoice_id'>): boolean {
  return p.status === 'converted' || Boolean(p.converted_invoice_id);
}

/** Crea la cotización enlazada o, si ya existe, regenera conservando solo lo editado a mano (o nada con `force`). */
export async function generateProposal(orgId: number, opportunityId: string, supabase: SupabaseClient, opts: GenerateOptions): Promise<{ proposal: ProposalRecord; isNew: boolean } | null> {
  const ctx = await loadProposalContext(orgId, opportunityId, supabase);
  if (!ctx) return null;
  const generated = buildProposalSections({
    opportunityName: ctx.opportunityName,
    customerName: ctx.customerName,
    opportunityAmount: ctx.opportunityAmount,
    discoveryFields: ctx.discoveryFields,
    discovery: ctx.discovery,
    objections: ctx.objections,
    roi: opts.roi ?? null,
    pricing: ctx.pricing,
  });
  const existing = await getLatestProposal(orgId, opportunityId, supabase);
  const total = ctx.pricing.lines.length ? ctx.pricing.total : ctx.opportunityAmount;

  if (existing) {
    if (isConvertedProposal(existing)) throw new ProposalConvertedError(existing.number);
    const sections = mergeSections(existing.sections, generated, { force: opts.force === true });
    const { data, error } = await supabase
      .from('quotations')
      .update({ sections_json: sections, total, subtotal: total, updated_at: new Date().toISOString() })
      .eq('id', existing.id)
      .eq('organization_id', orgId)
      .select(QUOTATION_SELECT)
      .maybeSingle();
    if (error) throw new Error(`No se pudo actualizar la propuesta: ${error.message}`);
    return { proposal: data ? toRecord(data as Record<string, unknown>) : { ...existing, sections, total }, isNew: false };
  }

  if (!ctx.customerId) throw new ProposalCustomerRequiredError();
  const number = await nextQuotationNumber(orgId, supabase);
  const validUntil = addDaysPlain(todayInTz(opts.timezone), 30);
  const { data, error } = await supabase
    .from('quotations')
    .insert({
      organization_id: orgId,
      number,
      customer_id: ctx.customerId,
      valid_until: validUntil,
      currency: ctx.currency,
      subtotal: total,
      tax_total: 0,
      discount_total: 0,
      total,
      status: 'draft',
      salesperson_id: ctx.salespersonId,
      opportunity_id: opportunityId,
      sections_json: generated,
      created_by: opts.userId,
    })
    .select(QUOTATION_SELECT)
    .single();
  if (error || !data) throw new Error(`No se pudo crear la propuesta: ${error?.message ?? 'sin datos'}`);
  const record = toRecord(data as Record<string, unknown>);

  if (ctx.pricing.lines.length) {
    const { error: itemsError } = await supabase.from('quotation_items').insert(
      ctx.pricing.lines.map((l) => ({ quotation_id: record.id, description: l.description, qty: l.qty, unit_price: l.unit_price, tax_rate: 0, tax_included: false, total_line: l.total, discount_amount: 0 })),
    );
    if (itemsError) console.warn('[proposalServerService] líneas no insertadas:', itemsError.message);
  }
  await logActivity(orgId, opportunityId, opts.userId, `Propuesta generada: ${number} (${formatMoney(total, ctx.currency)})`, { quotation_id: record.id, quotation_number: number, action: 'generated' }, supabase);
  return { proposal: record, isNew: true };
}

/** Sustituye solo las secciones recibidas (ya validadas) conservando las demás; lo recibido queda marcado `edited: true`. */
export async function updateProposalSections(orgId: number, quotationId: string, partial: Partial<ProposalSections>, supabase: SupabaseClient): Promise<ProposalRecord | null> {
  const current = await getProposal(orgId, quotationId, supabase);
  if (!current) return null;
  const base = current.sections ?? buildProposalSections({ opportunityName: '', customerName: null, discoveryFields: [], discovery: {}, objections: [], roi: null, pricing: { currency: current.currency, lines: [], total: current.total, billingCycleMonths: null }, opportunityAmount: current.total });
  const marked = Object.fromEntries(Object.entries(partial).map(([k, v]) => [k, v ? { ...v, edited: true } : v])) as Partial<ProposalSections>;
  const sections: ProposalSections = { ...base, ...marked } as ProposalSections;
  const { data, error } = await supabase
    .from('quotations')
    .update({ sections_json: sections, updated_at: new Date().toISOString() })
    .eq('id', quotationId)
    .eq('organization_id', orgId)
    .select(QUOTATION_SELECT)
    .maybeSingle();
  if (error) throw new Error(`No se pudo guardar la propuesta: ${error.message}`);
  return data ? toRecord(data as Record<string, unknown>) : { ...current, sections };
}

/** Marca enviada: status 'sent', actividad «propuesta enviada» y next_contact_at = +24 h. */
export async function markProposalSent(orgId: number, quotationId: string, supabase: SupabaseClient, opts: { userId: string | null; emailMessageId?: string | null }): Promise<{ next_contact_at: string } | null> {
  const proposal = await getProposal(orgId, quotationId, supabase);
  if (!proposal) return null;
  if (isConvertedProposal(proposal)) throw new ProposalConvertedError(proposal.number);
  const now = Date.now();
  const nextContact = new Date(now + 24 * 60 * 60 * 1000).toISOString();
  const { error } = await supabase.from('quotations').update({ status: 'sent', updated_at: new Date(now).toISOString() }).eq('id', quotationId).eq('organization_id', orgId);
  if (error) throw new Error(`No se pudo marcar la propuesta como enviada: ${error.message}`);
  if (proposal.opportunity_id) {
    await logActivity(orgId, proposal.opportunity_id, opts.userId, `Propuesta enviada al cliente: ${proposal.number}`, { quotation_id: quotationId, action: 'sent', email_message_id: opts.emailMessageId ?? null }, supabase);
    const { error: oppError } = await supabase.from('opportunities').update({ next_contact_at: nextContact, updated_at: new Date(now).toISOString() }).eq('id', proposal.opportunity_id).eq('organization_id', orgId);
    if (oppError) console.warn('[proposalServerService] next_contact_at no actualizado:', oppError.message);
  }
  return { next_contact_at: nextContact };
}
