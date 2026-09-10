/**
 * Carga del contexto contra el que se evalúan condiciones y se renderizan
 * variables (FASE-08 §4.2 `loadRuleContext`).
 *
 * TODAS las lecturas filtran por `organization_id`: el motor corre con el
 * cliente service_role del runner (RLS desactivada), así que el filtro por org
 * es la única barrera entre inquilinos (D7).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { RuleContext } from './conditionsDsl';

export type { RuleContext };

const OPPORTUNITY_FIELDS =
  'id, organization_id, name, amount, currency, status, temperature, stage_id, pipeline_id, customer_id, ' +
  'expected_close_date, last_contact_at, contact_channel, contact_result, deal_type, source, record_type, ' +
  'icp_band, icp_fit_score, score_total, salesperson_id, created_by';

const CUSTOMER_FIELDS =
  'id, organization_id, first_name, last_name, full_name, company_name, email, phone, customer_type, ' +
  'lifecycle_stage, health_score, tags, company_size';

export interface LoadContextInput {
  orgId: number;
  opportunityId?: string | null;
  customerId?: string | null;
  event?: { event_type: string; payload: Record<string, unknown> } | null;
  now?: Date;
}

/** Contexto vacío (evento sin oportunidad asociada). */
export function emptyRuleContext(orgId: number, event?: LoadContextInput['event'], now = new Date()): RuleContext {
  return { orgId, now, opportunity: null, customer: null, stage: null, pipeline: null, consent: {}, event: event ?? null };
}

export async function loadRuleContext(
  input: LoadContextInput,
  supabase: SupabaseClient,
): Promise<RuleContext> {
  const now = input.now ?? new Date();
  const ctx = emptyRuleContext(input.orgId, input.event ?? null, now);

  if (input.opportunityId) {
    const { data, error } = await supabase
      .from('opportunities')
      .select(OPPORTUNITY_FIELDS)
      .eq('id', input.opportunityId)
      .eq('organization_id', input.orgId)
      .maybeSingle();
    if (error) throw new Error(`loadRuleContext(opportunities): ${error.message}`);
    ctx.opportunity = (data as Record<string, unknown> | null) ?? null;
  }

  const customerId = (ctx.opportunity?.customer_id as string | undefined) ?? input.customerId ?? null;
  if (customerId) {
    const { data, error } = await supabase
      .from('customers')
      .select(CUSTOMER_FIELDS)
      .eq('id', customerId)
      .eq('organization_id', input.orgId)
      .maybeSingle();
    if (error) throw new Error(`loadRuleContext(customers): ${error.message}`);
    ctx.customer = (data as Record<string, unknown> | null) ?? null;
  }

  const stageId = (ctx.opportunity?.stage_id as string | undefined) ?? null;
  if (stageId) {
    const { data, error } = await supabase
      .from('stages')
      .select('id, name, position, probability, is_won, is_lost, sla_days, pipeline_id')
      .eq('id', stageId)
      .maybeSingle();
    if (error) throw new Error(`loadRuleContext(stages): ${error.message}`);
    ctx.stage = (data as Record<string, unknown> | null) ?? null;
  }

  const pipelineId = (ctx.opportunity?.pipeline_id as string | undefined) ?? null;
  if (pipelineId) {
    const { data, error } = await supabase
      .from('pipelines')
      .select('id, name, pipeline_type')
      .eq('id', pipelineId)
      .eq('organization_id', input.orgId)
      .maybeSingle();
    if (error) throw new Error(`loadRuleContext(pipelines): ${error.message}`);
    ctx.pipeline = (data as Record<string, unknown> | null) ?? null;
  }

  if (ctx.customer?.id) {
    const { data, error } = await supabase
      .from('contact_consents')
      .select('channel, status')
      .eq('organization_id', input.orgId)
      .eq('customer_id', ctx.customer.id as string);
    if (error) throw new Error(`loadRuleContext(contact_consents): ${error.message}`);
    for (const row of (data ?? []) as { channel: string; status: string }[]) {
      ctx.consent[row.channel] = row.status;
    }
  }

  return ctx;
}

/** Variables básicas para plantillas y textos de acción. */
export function contextVariables(ctx: RuleContext): Record<string, string> {
  const c = ctx.customer ?? {};
  const o = ctx.opportunity ?? {};
  const first = (c.first_name as string) || String((c.full_name as string) || '').split(' ')[0] || '';
  return {
    customer_name: (c.full_name as string) || (c.company_name as string) || first || '',
    first_name: first,
    opportunity_name: (o.name as string) || '',
    stage_name: (ctx.stage?.name as string) || '',
    amount: o.amount != null ? String(o.amount) : '',
  };
}

/**
 * Raíces del contexto de render de F7 (`buildContext`): si una variable ya
 * empieza por una de ellas, no se toca.
 */
const EMAIL_CONTEXT_ROOTS = new Set([
  'contact', 'org', 'opportunity', 'user', 'quote', 'custom', 'unsubscribe_url', 'sender_notice',
]);

/**
 * Reescribe `{{clave}}` -> `{{custom.clave}}` para las variables planas de F8,
 * SIN sustituir el valor (tester r2 N8).
 *
 * Hasta la ronda 1, F8 hacía `renderVars(action.html, vars)` ANTES de entregar
 * el HTML a `sendEmail`, así que los valores (nombre del cliente, nombre de la
 * oportunidad) llegaban a F7 como marcado y su `sanitizeEmailHtml` los limpiaba
 * como HTML en vez de escaparlos: sin XSS, pero perdiendo el control de escape
 * por variable. Ahora el HTML viaja intacto y quien sustituye y escapa es
 * `renderVariables(..., {escapeHtml:true})` de F7, que es quien renderiza.
 */
export function qualifyVarsForEmail(text: string, vars: Record<string, string>): string {
  if (!text) return text;
  return text.replace(
    /\{\{\s*([a-zA-Z0-9_.]+)\s*((?:\|[^}]*)?)\}\}/g,
    (match: string, key: string, tail: string) => {
      const root = key.split('.')[0];
      if (EMAIL_CONTEXT_ROOTS.has(root)) return match;
      if (!Object.prototype.hasOwnProperty.call(vars, key)) return match;
      return `{{custom.${key}${tail}}}`;
    },
  );
}

/** Reemplaza `{{clave}}` y `{{clave|defecto}}` con las variables del contexto. */
export function renderVars(text: string, vars: Record<string, string>): string {
  if (!text) return text;
  return text.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*(?:\|\s*([^}]*?)\s*)?\}\}/g, (_m, key: string, fallback?: string) => {
    const value = vars[key] ?? vars[key.replace(/^(contact|customer|opportunity)\./, '')];
    if (value !== undefined && value !== '') return value;
    return fallback ?? '';
  });
}
