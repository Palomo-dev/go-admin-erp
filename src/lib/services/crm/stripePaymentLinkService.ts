/**
 * F10 — Payment Link de Stripe para una propuesta y su webhook. SOLO servidor.
 *
 * Credenciales, en orden: las de la organización (`integration_connections`
 * + `integration_credentials`, purpose secret_key/webhook_secret, como ya hace
 * `stripeClientService`) → las de plataforma (STRIPE_SECRET_KEY, con
 * `metadata.organization_id`). Placeholders no cuentan. Sin clave real →
 * «Pago en línea no configurado», sin llamar a Stripe.
 *
 * El enlace exige factura (`quotations.converted_invoice_id`): el pago se
 * registra por `paymentService.registerCrmPayment` con `source='invoice_sales'`
 * y ese es el único punto que toca `payments`/`invoice_sales`/`accounts_receivable`
 * (regla 7). Idempotencia por `reference = stripe:<event.id>` (comprobación
 * previa + índice único parcial `uq_payments_org_stripe_reference` para el
 * replay concurrente). El enlace es de un solo uso (`completed_sessions` 1) y
 * se desactiva cuando la factura queda pagada. Un rechazo de negocio
 * (`applied:false`) deja actividad `system` en la oportunidad, no solo log.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import Stripe from 'stripe';
import { resolveStripeReadiness, type StripeOrgCredentials, type StripeReadiness } from '@/lib/services/crm/providerReadiness';
import { majorToMinor, parseStripeCheckoutEvent, toRegisterPaymentInput } from '@/lib/services/crm/paymentEvents';
import { registerCrmPayment, type RegisterPaymentResult } from '@/lib/services/crm/paymentService';

export interface PaymentLinkRequest {
  amountMinor: number;
  currency: string;
  name: string;
  metadata: Record<string, string>;
}

export interface StripeAdapter {
  createPaymentLink(secretKey: string, input: PaymentLinkRequest): Promise<{ id: string; url: string }>;
  constructEvent(secretKey: string, rawBody: string, signature: string, webhookSecret: string): unknown;
  /** `active:false` sobre el Payment Link (opcional en dobles de prueba). */
  deactivatePaymentLink?(secretKey: string, paymentLinkId: string): Promise<void>;
}

function stripeClient(secretKey: string): Stripe {
  return new Stripe(secretKey, { apiVersion: '2025-09-30.clover', typescript: true, appInfo: { name: 'GO Admin ERP - CRM Payment Link', version: '1.0.0' } });
}

/** Implementación real (nunca se ejecuta en pruebas). */
export const stripeAdapter: StripeAdapter = {
  async createPaymentLink(secretKey, input) {
    const stripe = stripeClient(secretKey);
    const price = await stripe.prices.create({
      currency: input.currency.toLowerCase(),
      unit_amount: input.amountMinor,
      product_data: { name: input.name.slice(0, 250) },
    });
    const link = await stripe.paymentLinks.create({
      line_items: [{ price: price.id, quantity: 1 }],
      metadata: input.metadata,
      payment_intent_data: { metadata: input.metadata },
      // Un solo uso: el importe es el saldo de la factura; una segunda sesión cobraría de más.
      restrictions: { completed_sessions: { limit: 1 } },
    });
    return { id: link.id, url: link.url };
  },
  constructEvent(secretKey, rawBody, signature, webhookSecret) {
    return stripeClient(secretKey).webhooks.constructEvent(rawBody, signature, webhookSecret);
  },
  async deactivatePaymentLink(secretKey, paymentLinkId) {
    await stripeClient(secretKey).paymentLinks.update(paymentLinkId, { active: false });
  },
};

// ─── Credenciales ────────────────────────────────────────────────────────────

/** Único valor de `integration_connections.status` (CHECK real: draft|connected|paused|error|revoked) con credenciales utilizables. */
export const STRIPE_CONNECTION_USABLE_STATUS = 'connected';

/** Credenciales de Stripe de la organización (service role: tabla de secretos; filtro explícito por organización). */
export async function loadOrgStripeCredentials(orgId: number, serviceClient: SupabaseClient): Promise<StripeOrgCredentials | null> {
  const { data: connections, error } = await serviceClient
    .from('integration_connections')
    .select('id, organization_id, status, integration_connectors!inner(integration_providers!inner(code))')
    .eq('organization_id', orgId)
    .eq('status', STRIPE_CONNECTION_USABLE_STATUS);
  if (error || !connections?.length) return null;
  const stripeConn = (connections as Array<Record<string, unknown>>).find((c) => {
    const connector = c.integration_connectors as Record<string, unknown> | Record<string, unknown>[] | null;
    const cn = Array.isArray(connector) ? connector[0] : connector;
    const provider = cn?.integration_providers as Record<string, unknown> | Record<string, unknown>[] | null;
    const pv = Array.isArray(provider) ? provider[0] : provider;
    return pv?.code === 'stripe';
  });
  if (!stripeConn) return null;
  const { data: creds } = await serviceClient.from('integration_credentials').select('purpose, secret_ref').eq('connection_id', stripeConn.id as string);
  const out: StripeOrgCredentials = {};
  for (const row of (creds ?? []) as Array<{ purpose: string; secret_ref: string | null }>) {
    if (row.purpose === 'secret_key') out.secretKey = row.secret_ref;
    if (row.purpose === 'webhook_secret') out.webhookSecret = row.secret_ref;
    if (row.purpose === 'publishable_key') out.publishableKey = row.secret_ref;
  }
  return out;
}

export async function getStripeReadiness(orgId: number, serviceClient: SupabaseClient, env: Record<string, string | undefined> = process.env): Promise<StripeReadiness> {
  const orgCredentials = await loadOrgStripeCredentials(orgId, serviceClient).catch(() => null);
  return resolveStripeReadiness({ orgCredentials, env });
}

export function publicStripeReadiness(r: StripeReadiness): { configured: boolean; source: string | null; missing: string[] } {
  return { configured: r.configured, source: r.source, missing: r.missing };
}

// ─── Enlace de pago ──────────────────────────────────────────────────────────

export class PaymentNotConfiguredError extends Error {
  constructor(readonly missing: string[]) {
    super('Pago en línea no configurado');
    this.name = 'PaymentNotConfiguredError';
  }
}

export class InvoiceRequiredError extends Error {
  constructor() {
    super('La propuesta aún no tiene factura: genera la factura (al ganar la oportunidad se crea automáticamente) antes del enlace de pago');
    this.name = 'InvoiceRequiredError';
  }
}

export interface CreateLinkDeps {
  adapter?: StripeAdapter;
  readiness?: StripeReadiness;
  serviceClient: SupabaseClient;
}

export interface CreateLinkResult {
  url: string;
  reused: boolean;
  invoice_id: string;
  amount: number;
  currency: string;
}

/**
 * Crea (o reutiliza) el Payment Link de una cotización de la organización.
 * Requiere `converted_invoice_id` con saldo > 0; el importe es el SALDO de la
 * factura (no el total de la cotización). Guarda `quotations.payment_link_url`.
 */
export async function createPaymentLinkForQuotation(orgId: number, quotationId: string, userSupabase: SupabaseClient, deps: CreateLinkDeps): Promise<CreateLinkResult | null> {
  const { data: quot } = await userSupabase
    .from('quotations')
    .select('id, number, opportunity_id, converted_invoice_id, payment_link_url, currency, total')
    .eq('id', quotationId)
    .eq('organization_id', orgId)
    .maybeSingle();
  if (!quot) return null;
  const q = quot as { id: string; number: string; opportunity_id: string | null; converted_invoice_id: string | null; payment_link_url: string | null; currency: string; total: number };
  if (!q.converted_invoice_id) throw new InvoiceRequiredError();

  const { data: inv } = await userSupabase
    .from('invoice_sales')
    .select('id, number, balance, currency, status')
    .eq('id', q.converted_invoice_id)
    .eq('organization_id', orgId)
    .maybeSingle();
  if (!inv) throw new InvoiceRequiredError();
  const invoice = inv as { id: string; number: string; balance: number; currency: string; status: string };
  const balance = Number(invoice.balance);
  if (!(balance > 0) || ['void', 'voided', 'paid'].includes(invoice.status)) {
    throw new Error('La factura no tiene saldo pendiente');
  }
  const currency = (invoice.currency || q.currency || 'COP').toUpperCase();
  if (q.payment_link_url) return { url: q.payment_link_url, reused: true, invoice_id: invoice.id, amount: balance, currency };

  const readiness = deps.readiness ?? (await getStripeReadiness(orgId, deps.serviceClient));
  if (!readiness.configured || !readiness.secretKey) throw new PaymentNotConfiguredError(readiness.missing);

  const adapter = deps.adapter ?? stripeAdapter;
  const link = await adapter.createPaymentLink(readiness.secretKey, {
    amountMinor: majorToMinor(balance, currency),
    currency,
    name: `Factura ${invoice.number} · Propuesta ${q.number}`,
    metadata: { organization_id: String(orgId), quotation_id: q.id, invoice_id: invoice.id, opportunity_id: q.opportunity_id ?? '' },
  });
  const { error } = await userSupabase.from('quotations').update({ payment_link_url: link.url, updated_at: new Date().toISOString() }).eq('id', q.id).eq('organization_id', orgId);
  if (error) throw new Error(`Enlace creado en Stripe pero no se pudo guardar: ${error.message}`);
  return { url: link.url, reused: false, invoice_id: invoice.id, amount: balance, currency };
}

// ─── Webhook ─────────────────────────────────────────────────────────────────

export interface StripeWebhookDeps {
  serviceClient: SupabaseClient;
  adapter?: StripeAdapter;
  env?: Record<string, string | undefined>;
  now?: () => string;
}

export interface StripeWebhookOutcome {
  status: number;
  body: Record<string, unknown>;
}

/** Motivos de `applied:false` que un reintento de Stripe no arregla (200 + actividad). */
export type StripeRejectReason = 'quotation_not_found' | 'invoice_mismatch' | 'currency_mismatch' | 'not_applied';

function unsafeOrgHint(rawBody: string): number | null {
  try {
    const parsed = JSON.parse(rawBody) as { data?: { object?: { metadata?: { organization_id?: unknown } } } };
    const v = parsed?.data?.object?.metadata?.organization_id;
    const n = typeof v === 'string' && /^\d+$/.test(v) ? Number.parseInt(v, 10) : typeof v === 'number' ? v : NaN;
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

/**
 * Rechazo de negocio visible: `console.error` + actividad `system` sobre la
 * oportunidad (si la cotización la tiene). El dinero puede estar cobrado en
 * Stripe sin registrar: alguien de la organización tiene que verlo en el CRM.
 */
async function recordRejection(
  serviceClient: SupabaseClient,
  ctx: { orgId: number; opportunityId: string | null; eventId: string; amount: number; currency: string; quotationId: string },
  reason: StripeRejectReason,
  notes: string,
): Promise<void> {
  console.error('[stripe webhook] pago no aplicado', { event: ctx.eventId, organization: ctx.orgId, quotation: ctx.quotationId, reason, notes });
  if (!ctx.opportunityId) return;
  const { error } = await serviceClient.from('activities').insert({
    organization_id: ctx.orgId,
    activity_type: 'system',
    user_id: null,
    notes: `Pago de Stripe NO aplicado: ${notes}`,
    related_type: 'opportunity',
    related_id: ctx.opportunityId,
    occurred_at: new Date().toISOString(),
    metadata: { source: 'stripe_webhook', auto_generated: true, event_id: ctx.eventId, quotation_id: ctx.quotationId, amount: ctx.amount, currency: ctx.currency, reason },
  });
  if (error) console.error('[stripe webhook] actividad de rechazo no registrada:', error.message);
}

function rejected(eventId: string, reason: StripeRejectReason, error: string): StripeWebhookOutcome {
  return { status: 200, body: { success: false, applied: false, reason, error, event_id: eventId } };
}

/**
 * 1. Verifica la firma con `constructEvent`: primero el secreto de plataforma;
 *    si no, el de la organización que la metadata (NO verificada aún) insinúa —
 *    la firma es la que decide, y la organización que se usa es la que verificó.
 * 2. Interpreta el evento (`paymentEvents`); exige que la metadata coincida con
 *    la organización verificada y que la moneda sea la de la factura.
 * 3. Registra el pago por `registerCrmPayment` (idempotente por reference; el
 *    23505 del índice único parcial → `applied:false, reason:'duplicate'`).
 * 4. Factura pagada → desactiva el Payment Link de la sesión (mejor esfuerzo).
 * Fallos de verificación → 400/401 (Stripe reintenta). Eventos que aún no
 * cobran (`unpaid`, tipos no soportados) → 200 `ignored`. Rechazos de negocio
 * → 200 `applied:false` + actividad en la oportunidad.
 */
export async function processStripeWebhook(rawBody: string, signature: string | null, deps: StripeWebhookDeps): Promise<StripeWebhookOutcome> {
  if (!signature) return { status: 400, body: { success: false, error: 'Falta stripe-signature' } };
  const env = deps.env ?? process.env;
  const adapter = deps.adapter ?? stripeAdapter;

  let event: unknown = null;
  let verifiedOrg: number | null = null; // null = plataforma
  let verifyingKey: string | null = null;
  const platform = resolveStripeReadiness({ orgCredentials: null, env });
  if (platform.configured && platform.secretKey && platform.webhookSecret) {
    try {
      event = adapter.constructEvent(platform.secretKey, rawBody, signature, platform.webhookSecret);
      verifyingKey = platform.secretKey;
    } catch {
      event = null;
    }
  }
  if (!event) {
    const hint = unsafeOrgHint(rawBody);
    if (hint) {
      const orgCreds = await loadOrgStripeCredentials(hint, deps.serviceClient).catch(() => null);
      const org = resolveStripeReadiness({ orgCredentials: orgCreds, env: {} });
      if (org.configured && org.secretKey && org.webhookSecret) {
        try {
          event = adapter.constructEvent(org.secretKey, rawBody, signature, org.webhookSecret);
          verifiedOrg = hint;
          verifyingKey = org.secretKey;
        } catch {
          event = null;
        }
      }
    }
  }
  if (!event || !verifyingKey) {
    console.warn('[stripe webhook] firma no verificada o secreto no configurado');
    return { status: 401, body: { success: false, error: 'Firma inválida o pago en línea no configurado' } };
  }

  const type = String((event as { type?: unknown }).type);
  const parsed = parseStripeCheckoutEvent(event);
  if (!parsed.ok) {
    if (parsed.ignored) return { status: 200, body: { success: true, applied: false, ignored: true, type, reason: parsed.reason } };
    return { status: 400, body: { success: false, error: parsed.reason } };
  }
  const p = parsed.payment;
  if (verifiedOrg !== null && verifiedOrg !== p.organizationId) {
    return { status: 401, body: { success: false, error: 'La organización del evento no coincide con la que verificó la firma' } };
  }

  const { data: quot } = await deps.serviceClient.from('quotations').select('id, converted_invoice_id, opportunity_id').eq('id', p.quotationId).eq('organization_id', p.organizationId).maybeSingle();
  const q = quot as { converted_invoice_id?: string | null; opportunity_id?: string | null } | null;
  const invoiceId = q?.converted_invoice_id ?? p.invoiceId;
  const ctx = { orgId: p.organizationId, opportunityId: q?.opportunity_id ?? null, eventId: p.eventId, amount: p.amount, currency: p.currency, quotationId: p.quotationId };
  if (!quot || !invoiceId) {
    await recordRejection(deps.serviceClient, ctx, 'quotation_not_found', `cotización ${p.quotationId} o su factura no existen en la organización (${p.amount} ${p.currency}, evento ${p.eventId})`);
    return rejected(p.eventId, 'quotation_not_found', 'Cotización o factura no encontrada en la organización');
  }
  if (p.invoiceId && p.invoiceId !== invoiceId) {
    await recordRejection(deps.serviceClient, ctx, 'invoice_mismatch', `la factura del evento (${p.invoiceId}) no corresponde a la cotización (${p.amount} ${p.currency}, evento ${p.eventId})`);
    return rejected(p.eventId, 'invoice_mismatch', 'La factura del evento no corresponde a la cotización');
  }

  const { data: inv } = await deps.serviceClient.from('invoice_sales').select('id, currency').eq('id', invoiceId).eq('organization_id', p.organizationId).maybeSingle();
  const invoiceCurrency = String((inv as { currency?: string | null } | null)?.currency ?? '').toUpperCase();
  if (!inv) {
    await recordRejection(deps.serviceClient, ctx, 'quotation_not_found', `la factura ${invoiceId} no existe en la organización (${p.amount} ${p.currency}, evento ${p.eventId})`);
    return rejected(p.eventId, 'quotation_not_found', 'Factura no encontrada en la organización');
  }
  if (invoiceCurrency && invoiceCurrency !== p.currency) {
    await recordRejection(deps.serviceClient, ctx, 'currency_mismatch', `el evento viene en ${p.currency} y la factura está en ${invoiceCurrency} (${p.amount} ${p.currency}, evento ${p.eventId})`);
    return rejected(p.eventId, 'currency_mismatch', `Moneda del evento (${p.currency}) distinta de la factura (${invoiceCurrency})`);
  }

  const nowIso = deps.now ? deps.now() : new Date().toISOString();
  const result: RegisterPaymentResult = await registerCrmPayment(p.organizationId, toRegisterPaymentInput(p, invoiceId, nowIso), deps.serviceClient);
  if (!result.success) {
    await recordRejection(deps.serviceClient, ctx, 'not_applied', `${result.message} (${p.amount} ${p.currency}, evento ${p.eventId}; el cobro queda en Stripe: regístralo a mano desde Finanzas o devuélvelo)`);
    return rejected(p.eventId, 'not_applied', result.message);
  }
  if (result.duplicate) {
    return { status: 200, body: { success: true, applied: false, reason: 'duplicate', idempotent: true, event_id: p.eventId } };
  }

  let linkDeactivated: boolean | null = null;
  if (result.invoice_status === 'paid' && p.paymentLinkId && adapter.deactivatePaymentLink) {
    try {
      await adapter.deactivatePaymentLink(verifyingKey, p.paymentLinkId);
      linkDeactivated = true;
    } catch (err) {
      linkDeactivated = false;
      console.error('[stripe webhook] no se pudo desactivar el Payment Link', { event: p.eventId, link: p.paymentLinkId, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return {
    status: 200,
    body: { success: true, applied: true, idempotent: result.idempotent, payment_id: result.payment_id, invoice_status: result.invoice_status, event_id: p.eventId, ...(linkDeactivated === null ? {} : { payment_link_deactivated: linkDeactivated }) },
  };
}
