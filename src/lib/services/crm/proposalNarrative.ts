/**
 * F10 — narrativa de la propuesta (puro, sin Supabase ni React).
 *
 * `quotations.sections_json` guarda cinco secciones en orden canónico:
 *   situacion | problemas | solucion | roi | pricing
 * Cada una `{ title, content }`; `pricing` lleva además `lines[]` y `total`.
 * Se construye desde la oportunidad (cliente, `discovery_data` plano —FASE-02
 * §2.3—, objeciones, ROI calculado y productos) y el vendedor la edita.
 */

export const SECTION_KEYS = ['situacion', 'problemas', 'solucion', 'roi', 'pricing'] as const;
export type SectionKey = (typeof SECTION_KEYS)[number];

export interface ProposalSection {
  title: string;
  content: string;
  /**
   * true = el vendedor editó el texto a mano (lo fija `updateProposalSections`);
   * false = tal como lo generó el sistema; ausente = fila anterior a la bandera
   * (se conserva al regenerar, como antes, para no perder texto).
   */
  edited?: boolean;
}

export interface PricingLine {
  description: string;
  qty: number;
  unit_price: number;
  total: number;
}

export interface PricingSection extends ProposalSection {
  lines: PricingLine[];
  total: number;
  currency?: string;
  billing_cycle_months?: number | null;
}

export interface ProposalSections {
  situacion: ProposalSection;
  problemas: ProposalSection;
  solucion: ProposalSection;
  roi: ProposalSection & { outputs?: Record<string, number> | null };
  pricing: PricingSection;
}

export interface DiscoveryFieldLite {
  id: string;
  label: string;
  type?: string;
}

export interface ObjectionLite {
  title: string;
  recommended_response: string | null;
  resolved: boolean;
}

export interface RoiSummary {
  summary: string;
  outputs: Record<string, number>;
}

export interface ProposalContext {
  opportunityName: string;
  customerName: string | null;
  opportunityAmount?: number | null;
  discoveryFields: DiscoveryFieldLite[];
  discovery: Record<string, unknown>;
  objections: ObjectionLite[];
  roi: RoiSummary | null;
  pricing: { currency: string; lines: PricingLine[]; total: number; billingCycleMonths: number | null };
}

export const SECTION_TITLES: Record<SectionKey, string> = {
  situacion: 'Situación actual',
  problemas: 'Problemas identificados',
  solucion: 'Nuestra solución',
  roi: 'Retorno estimado (ROI)',
  pricing: 'Inversión',
};

const MAX_TEXT = 20_000;
const MAX_TITLE = 200;

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : typeof value === 'number' ? String(value) : '';
}

export function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: currency || 'COP', maximumFractionDigits: 0 }).format(amount);
  } catch {
    return `${currency} ${Math.round(amount).toLocaleString('es-CO')}`;
  }
}

/** Construye las cinco secciones desde el contexto de la oportunidad. */
export function buildProposalSections(ctx: ProposalContext): ProposalSections {
  const customer = ctx.customerName?.trim() || 'el cliente';
  const answered = ctx.discoveryFields
    .map((f) => ({ label: f.label, value: text(ctx.discovery?.[f.id]) }))
    .filter((f) => f.value.length > 0);

  const situacionLines = [`${customer} evalúa «${ctx.opportunityName}».`];
  if (answered.length) {
    situacionLines.push('', 'Lo que conocemos de la conversación de descubrimiento:');
    for (const a of answered) situacionLines.push(`• ${a.label}: ${a.value}`);
  } else {
    situacionLines.push('', 'Aún no hay respuestas de descubrimiento registradas: completa la sección de discovery de la oportunidad para enriquecer esta propuesta.');
  }

  const problemField = answered.find((a) => /problema|dolor|reto/i.test(a.label));
  const problemas: string[] = [];
  if (problemField) problemas.push(`• ${problemField.value}`);
  for (const o of ctx.objections.filter((x) => !x.resolved)) problemas.push(`• Inquietud pendiente: ${o.title}`);
  if (!problemas.length) problemas.push('• Sin problemas registrados todavía. Describe aquí el costo de no actuar.');

  const solucion: string[] = [`Proponemos ${ctx.opportunityName} para ${customer}, con implementación acompañada y capacitación del equipo.`];
  const resolved = ctx.objections.filter((x) => x.resolved && x.recommended_response?.trim());
  if (resolved.length) {
    solucion.push('', 'Cómo abordamos las inquietudes planteadas:');
    for (const o of resolved) solucion.push(`• ${o.title}: ${o.recommended_response!.trim()}`);
  }

  const roiContent = ctx.roi?.summary?.trim()
    ? ctx.roi.summary.trim()
    : 'ROI pendiente de calcular: usa la calculadora de ROI para estimar ahorro, retorno y periodo de recuperación con datos del cliente.';

  const lines = ctx.pricing.lines ?? [];
  const total = lines.length ? ctx.pricing.total : Number(ctx.opportunityAmount ?? ctx.pricing.total ?? 0);
  const cycle = ctx.pricing.billingCycleMonths;
  const pricingText: string[] = lines.length
    ? lines.map((l) => `• ${l.description} × ${l.qty}: ${formatMoney(l.total, ctx.pricing.currency)}`)
    : [`• Inversión total: ${formatMoney(total, ctx.pricing.currency)}`];
  pricingText.push('', `Total: ${formatMoney(total, ctx.pricing.currency)}${cycle ? ` · ciclo de facturación de ${cycle} meses` : ''}`);

  return {
    situacion: { title: SECTION_TITLES.situacion, content: situacionLines.join('\n'), edited: false },
    problemas: { title: SECTION_TITLES.problemas, content: problemas.join('\n'), edited: false },
    solucion: { title: SECTION_TITLES.solucion, content: solucion.join('\n'), edited: false },
    roi: { title: SECTION_TITLES.roi, content: roiContent, outputs: ctx.roi?.outputs ?? null, edited: false },
    pricing: {
      title: SECTION_TITLES.pricing,
      content: pricingText.join('\n'),
      edited: false,
      lines,
      total,
      currency: ctx.pricing.currency,
      billing_cycle_months: cycle ?? null,
    },
  };
}

/** ¿Alguna sección narrativa lleva texto editado a mano? (para pedir confirmación antes de regenerar). */
export function hasEditedSections(sections: Partial<ProposalSections> | null | undefined): boolean {
  if (!sections) return false;
  return SECTION_KEYS.some((k) => sections[k]?.edited === true);
}

/**
 * Fusiona lo ya guardado con lo regenerado. Regenerar regenera de verdad: una
 * sección solo se conserva si el vendedor la editó a mano (`edited: true`) o
 * si es una fila anterior a la bandera (`edited` ausente, texto no vacío).
 * `force` descarta también lo editado. `pricing` se regenera siempre (viene de
 * los productos).
 */
export function mergeSections(existing: Partial<ProposalSections> | null | undefined, generated: ProposalSections, opts: { force?: boolean } = {}): ProposalSections {
  if (!existing || opts.force) return generated;
  const pick = (key: Exclude<SectionKey, 'pricing'>): ProposalSection => {
    const cur = existing[key];
    const gen = generated[key];
    const keep = cur && typeof cur.content === 'string' && cur.content.trim().length > 0 && cur.edited !== false;
    if (keep) {
      return { ...gen, title: text(cur.title) || gen.title, content: cur.content, edited: cur.edited === true };
    }
    return gen;
  };
  const roi = pick('roi') as ProposalSections['roi'];
  const existingRoi = existing.roi as ProposalSections['roi'] | undefined;
  return {
    situacion: pick('situacion'),
    problemas: pick('problemas'),
    solucion: pick('solucion'),
    roi: { ...roi, outputs: generated.roi.outputs ?? existingRoi?.outputs ?? null },
    pricing: generated.pricing,
  };
}

function isFiniteNonNegative(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n) && n >= 0;
}

export type SectionsValidation = { ok: true; sections: Partial<ProposalSections> } | { ok: false; error: string };

/** Valida el body del PATCH: solo claves conocidas, strings acotados, pricing numérico. */
export function validateSectionsInput(input: unknown): SectionsValidation {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { ok: false, error: 'sections debe ser un objeto' };
  const src = input as Record<string, unknown>;
  const out: Partial<ProposalSections> = {};
  for (const key of SECTION_KEYS) {
    if (!(key in src)) continue;
    const sec = src[key];
    if (!sec || typeof sec !== 'object') return { ok: false, error: `${key} debe ser un objeto` };
    const s = sec as Record<string, unknown>;
    if (typeof s.title !== 'string' || typeof s.content !== 'string') return { ok: false, error: `${key}: title y content deben ser texto` };
    const title = s.title.trim();
    const content = s.content.trim();
    // `edited` se conserva si viene como booleano (lectura de la BD); el PATCH lo fija a true en el servidor.
    const edited = typeof s.edited === 'boolean' ? { edited: s.edited } : {};
    if (!title || title.length > MAX_TITLE) return { ok: false, error: `${key}: título vacío o demasiado largo` };
    if (content.length > MAX_TEXT) return { ok: false, error: `${key}: contenido de más de ${MAX_TEXT} caracteres` };
    if (key === 'pricing') {
      const rawLines = Array.isArray(s.lines) ? s.lines : [];
      const lines: PricingLine[] = [];
      for (const l of rawLines as unknown[]) {
        const r = (l ?? {}) as Record<string, unknown>;
        if (typeof r.description !== 'string' || !isFiniteNonNegative(r.qty) || !isFiniteNonNegative(r.unit_price) || !isFiniteNonNegative(r.total)) {
          return { ok: false, error: 'pricing.lines: descripción y números finitos no negativos' };
        }
        lines.push({ description: r.description.trim().slice(0, 500), qty: r.qty, unit_price: r.unit_price, total: r.total });
      }
      if (!isFiniteNonNegative(s.total)) return { ok: false, error: 'pricing.total debe ser un número no negativo' };
      out.pricing = { title, content, lines, total: s.total, currency: typeof s.currency === 'string' ? s.currency.slice(0, 3).toUpperCase() : undefined, billing_cycle_months: typeof s.billing_cycle_months === 'number' ? s.billing_cycle_months : null, ...edited };
    } else if (key === 'roi') {
      const outputs = s.outputs && typeof s.outputs === 'object' && !Array.isArray(s.outputs) ? (s.outputs as Record<string, number>) : null;
      out.roi = { title, content, outputs, ...edited };
    } else {
      out[key] = { title, content, ...edited };
    }
  }
  return { ok: true, sections: out };
}

export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function paragraph(content: string): string {
  return escapeHtml(content).replace(/\r?\n/g, '<br />');
}

export interface ProposalRenderMeta {
  number: string;
  customerName: string | null;
  organizationName: string;
  validUntil: string | null;
  currency: string;
}

/**
 * HTML de la propuesta (cuerpo del email y vista imprimible). Todo el contenido
 * pasa por `escapeHtml`; el estilo es inline para que sobreviva al correo.
 */
export function renderProposalHtml(sections: ProposalSections, meta: ProposalRenderMeta): string {
  const currency = sections.pricing.currency || meta.currency || 'COP';
  const rows = sections.pricing.lines
    .map((l) => `<tr><td style="padding:6px 8px;border-bottom:1px solid #e5e7eb">${escapeHtml(l.description)}</td><td style="padding:6px 8px;text-align:right;border-bottom:1px solid #e5e7eb">${l.qty}</td><td style="padding:6px 8px;text-align:right;border-bottom:1px solid #e5e7eb">${escapeHtml(formatMoney(l.unit_price, currency))}</td><td style="padding:6px 8px;text-align:right;border-bottom:1px solid #e5e7eb">${escapeHtml(formatMoney(l.total, currency))}</td></tr>`)
    .join('');
  const table = `<table style="width:100%;border-collapse:collapse;margin-top:8px;font-size:14px"><thead><tr><th style="text-align:left;padding:6px 8px;border-bottom:2px solid #2563eb">Concepto</th><th style="text-align:right;padding:6px 8px;border-bottom:2px solid #2563eb">Cant.</th><th style="text-align:right;padding:6px 8px;border-bottom:2px solid #2563eb">Unitario</th><th style="text-align:right;padding:6px 8px;border-bottom:2px solid #2563eb">Total</th></tr></thead><tbody>${rows}</tbody><tfoot><tr><td colspan="3" style="padding:8px;text-align:right;font-weight:600">Total</td><td style="padding:8px;text-align:right;font-weight:600">${escapeHtml(formatMoney(sections.pricing.total, currency))}</td></tr></tfoot></table>`;
  const block = (key: SectionKey) => {
    const s = sections[key];
    return `<section style="margin:0 0 20px"><h2 style="font-size:16px;color:#1f2937;margin:0 0 6px">${escapeHtml(s.title)}</h2><p style="margin:0;line-height:1.55;color:#374151">${paragraph(s.content)}</p>${key === 'pricing' && sections.pricing.lines.length ? table : ''}</section>`;
  };
  return [
    `<div style="font-family:Segoe UI,Tahoma,Arial,sans-serif;font-size:14px;color:#111827;max-width:720px;margin:0 auto">`,
    `<header style="border-bottom:3px solid #2563eb;padding-bottom:12px;margin-bottom:20px"><p style="margin:0;font-size:12px;color:#6b7280">${escapeHtml(meta.organizationName)}</p><h1 style="font-size:22px;margin:4px 0">Propuesta ${escapeHtml(meta.number)}</h1><p style="margin:0;color:#374151">Para: ${escapeHtml(meta.customerName ?? '—')}${meta.validUntil ? ` · Válida hasta ${escapeHtml(meta.validUntil)}` : ''}</p></header>`,
    ...SECTION_KEYS.map(block),
    `</div>`,
  ].join('');
}

/** Sanea `sections_json` leído de la BD (puede venir de la versión anterior con claves distintas). */
export function coerceSections(raw: unknown): ProposalSections | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const v = validateSectionsInput(raw);
  if (!v.ok) return null;
  const s = v.sections;
  if (!s.situacion || !s.problemas || !s.solucion || !s.roi || !s.pricing) return null;
  return s as ProposalSections;
}
