/**
 * Construcción del contexto de render desde la BD (FASE-07 §4.2).
 *
 * Separado de `variables.ts` en la ronda 2 para respetar el límite de 300
 * líneas por módulo (tester r1 #8 de documentación: `variables.ts` tenía 432).
 * `variables.ts` sigue reexportando `buildContext`, `sampleContext`,
 * `emptyContext` y `ContextRefs`, así que ningún import existente cambia.
 *
 * Todas las consultas filtran SIEMPRE por `organization_id`: cualquier entidad
 * que no pertenezca a la org se ignora en silencio.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { EmailError } from './types';
import { getOrganizationTimezone } from '@/lib/services/organizationTimezoneService';
import type { RenderContext } from './variables';
import { resolveOrgCurrency } from '@/lib/services/monedaOrganizacion';

export interface ContextRefs {
  customerId?: string | null;
  opportunityId?: string | null;
  userId?: string | null;
  quoteId?: string | null;
  custom?: Record<string, unknown>;
}

function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || 'https://app.goadmin.io').replace(/\/$/, '');
}

export function emptyContext(): RenderContext {
  return { contact: {}, org: {}, custom: {} };
}

/**
 * Carga contact/opportunity/org/user/quote de la BD (siempre filtrando por
 * `orgId`). Cualquier entidad que no pertenezca a la org se ignora.
 */
export async function buildContext(orgId: number, refs: ContextRefs, supabase: SupabaseClient, options: { strict?: boolean } = {}): Promise<RenderContext> {
  const strict = options.strict === true;
  const assertData = (error: unknown, data: unknown, required = false) => { if (!strict) return; if (error) throw new EmailError('DB', 'No se pudo cargar el contexto', 500); if (required && !data) throw new EmailError('NOT_FOUND', 'Entidad de contexto no encontrada', 404); };
  const assertBranch = async (branch: number | null) => { if (!strict) return; const result = await supabase.rpc('app_branch_access', { p_branch_id: branch }); if (result.error) throw new EmailError('DB', 'No se pudo comprobar la sucursal', 500); if (result.data !== true) throw new EmailError('FORBIDDEN', 'Sucursal no permitida', 403); };
  const ctx = emptyContext();
  ctx.custom = { ...(refs.custom ?? {}) };
  const base = appUrl();
  // Moneda base de la organización: respaldo de oportunidad y cotización (nunca 'COP' cableado).
  const monedaBase = (await resolveOrgCurrency(supabase, orgId)).code;

  const { data: org, error: orgError } = await supabase
    .from('organizations')
    .select('id, name, logo_url, address, city, phone, website, email, primary_color')
    .eq('id', orgId)
    .maybeSingle();
  assertData(orgError, org, true);
  if (org) {
    const o = org as Record<string, string | null>;
    ctx.org = {
      id: orgId,
      name: o.name ?? '',
      logo_url: o.logo_url ?? '',
      address: [o.address, o.city].filter(Boolean).join(', '),
      phone: o.phone ?? '',
      website: o.website ?? '',
      email: o.email ?? '',
      currency: monedaBase,
      timezone: strict ? await getOrganizationTimezone(orgId, supabase) : 'America/Bogota',
      primary_color: o.primary_color ?? '#2563eb',
    };
  }

  let customerId = refs.customerId ?? null;

  if (refs.opportunityId) {
    const { data: opp, error: oppError } = await supabase
      .from('opportunities')
      .select('id, name, amount, currency, expected_close_date, next_action, status, customer_id, branch_id, stages(name), pipelines(name)')
      .eq('id', refs.opportunityId)
      .eq('organization_id', orgId)
      .maybeSingle();
    assertData(oppError, opp, true);
    if (opp) {
      await assertBranch(opp.branch_id);
      if (strict && customerId && opp.customer_id && customerId !== opp.customer_id) throw new EmailError('VALIDATION', 'Cliente y oportunidad no corresponden', 400);
      const o = opp as Record<string, unknown>;
      const stage = o.stages as { name?: string } | { name?: string }[] | null;
      const pipe = o.pipelines as { name?: string } | { name?: string }[] | null;
      ctx.opportunity = {
        id: String(o.id),
        name: (o.name as string) ?? '',
        amount: (o.amount as number) ?? null,
        currency: (o.currency as string) || monedaBase,
        expected_close_date: (o.expected_close_date as string) ?? null,
        next_action: (o.next_action as string) ?? null,
        status: (o.status as string) ?? undefined,
        stage_name: Array.isArray(stage) ? stage[0]?.name : stage?.name,
        pipeline_name: Array.isArray(pipe) ? pipe[0]?.name : pipe?.name,
        url: `${base}/app/crm/oportunidades/${String(o.id)}`,
      };
      if (!customerId && o.customer_id) customerId = String(o.customer_id);
    }
  }

  if (customerId) {
    const { data: c, error: customerError } = await supabase
      .from('customers')
      .select('id, first_name, last_name, full_name, email, phone, company_name, timezone, branch_id')
      .eq('id', customerId)
      .eq('organization_id', orgId)
      .maybeSingle();
    assertData(customerError, c, true);
    if (c) {
      await assertBranch(c.branch_id);
      const r = c as Record<string, string | null>;
      const full = r.full_name || [r.first_name, r.last_name].filter(Boolean).join(' ') || r.company_name || '';
      ctx.contact = {
        id: r.id ?? undefined,
        first_name: r.first_name || full.split(' ')[0] || '',
        last_name: r.last_name ?? '',
        full_name: full,
        email: r.email ?? '',
        phone: r.phone ?? '',
        company_name: r.company_name ?? '',
      };
    }
  }

  if (refs.userId) {
    const { data: p, error: profileError } = await supabase
      .from('profiles')
      .select('id, first_name, last_name, email, phone, metadata')
      .eq('id', refs.userId)
      .maybeSingle();
    assertData(profileError, p);
    if (p) {
      const r = p as Record<string, unknown>;
      const meta = (r.metadata as Record<string, unknown>) ?? {};
      ctx.user = {
        id: String(r.id),
        first_name: (r.first_name as string) ?? '',
        last_name: (r.last_name as string) ?? '',
        full_name: [r.first_name, r.last_name].filter(Boolean).join(' '),
        email: (r.email as string) ?? '',
        phone: (r.phone as string) ?? '',
        job_title: (meta.job_title as string) ?? '',
        signature_html: (meta.email_signature_html as string) ?? '',
      };
    }
  }

  const quoteId = refs.quoteId ?? null;
  if (quoteId || refs.opportunityId) {
    let q = supabase
      .from('quotations')
      .select('id, number, total, currency, valid_until, branch_id, quotation_items(description, qty, unit_price, total_line)')
      .eq('organization_id', orgId);
    q = quoteId ? q.eq('id', quoteId) : q.eq('opportunity_id', refs.opportunityId as string).order('created_at', { ascending: false });
    const { data: quote, error: quoteError } = await q.limit(1).maybeSingle();
    assertData(quoteError, quote, Boolean(quoteId));
    if (quote) {
      await assertBranch(quote.branch_id);
      const r = quote as Record<string, unknown>;
      const items = ((r.quotation_items as Array<Record<string, unknown>>) ?? []).map((it) => ({
        description: String(it.description ?? ''),
        qty: Number(it.qty ?? 1),
        unit_price: Number(it.unit_price ?? 0),
        total_line: Number(it.total_line ?? 0),
      }));
      ctx.quote = {
        id: String(r.id),
        number: (r.number as string) ?? '',
        total: (r.total as number) ?? null,
        currency: (r.currency as string) || ctx.opportunity?.currency || monedaBase,
        valid_until: (r.valid_until as string) ?? null,
        url: `${base}/app/finanzas/cotizaciones/${String(r.id)}`,
        items,
      };
    }
  }

  return ctx;
}

/** Contexto de ejemplo para la vista previa del editor (sin BD). */
export function sampleContext(overrides: Partial<RenderContext> = {}): RenderContext {
  return {
    contact: { first_name: 'Carlos', last_name: 'Pérez', full_name: 'Carlos Pérez', email: 'carlos@empresa.com', phone: '+57 300 123 4567', company_name: 'Empresa S.A.S' },
    opportunity: { name: 'Plan Pro Empresa', amount: 1200000, currency: 'COP', expected_close_date: '2026-10-01', stage_name: 'Propuesta', pipeline_name: 'Ventas', next_action: 'Enviar propuesta', url: 'https://app.goadmin.io/app/crm/oportunidades/demo' },
    org: { name: 'ACME S.A.S', logo_url: '', address: 'Cra 7 # 1-1, Bogotá', phone: '+57 1 234 5678', website: 'https://acme.co', email: 'ventas@acme.co', currency: 'COP', timezone: 'America/Bogota', primary_color: '#2563eb' },
    user: { first_name: 'Ana', last_name: 'Gómez', full_name: 'Ana Gómez', email: 'ana@acme.co', phone: '+57 300 000 0000', job_title: 'Ejecutiva comercial' },
    quote: { number: 'COT-0042', total: 1200000, currency: 'COP', valid_until: '2026-10-15', url: 'https://app.goadmin.io/app/finanzas/cotizaciones/demo', items: [{ description: 'Plan Pro x 12 meses', qty: 1, unit_price: 1200000, total_line: 1200000 }] },
    custom: { summary: 'Resumen de la llamada de hoy.', meeting_url: 'https://meet.google.com/abc-defg-hij', demo_date: 'mañana a las 10:00' },
    ...overrides,
  };
}
