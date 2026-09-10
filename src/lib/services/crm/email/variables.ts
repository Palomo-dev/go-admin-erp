/**
 * Variables de plantilla (FASE-07 §4.2, C23).
 *
 * ⚠️ ARCHIVO COMPARTIDO POR DOS FASES: **F7 (email)** y **F16 (WhatsApp)**.
 * `crm/whatsapp/templateRender.ts` y `crm/whatsapp/outboundService.ts` usan
 * este mismo motor. Antes de tocarlo, ejecuta las dos suites:
 *   npx jest src/lib/services/crm/email
 *   npx jest src/lib/services/crm/whatsapp
 *
 * Sintaxis propia (sin Handlebars): `{{path}}`, `{{path|default}}`,
 * `{{path|money}}`, `{{path|date}}`, `{{path|date:short}}`, `{{path|upper}}`,
 * `{{path|lower}}`. Escape HTML SIEMPRE (opción `escapeHtml:false` solo para
 * texto plano). `{{{raw}}}` está prohibido: se elimina y se reporta en `missing`.
 *
 * Contexto: { contact, opportunity, org, user, quote, custom }.
 * `buildContext` carga los datos con el cliente recibido (RLS de sesión o
 * service role) filtrando SIEMPRE por organization_id.
 */

export interface ContactCtx {
  id?: string;
  first_name?: string;
  last_name?: string;
  full_name?: string;
  email?: string;
  phone?: string;
  company_name?: string;
}
export interface OpportunityCtx {
  id?: string;
  name?: string;
  amount?: number | null;
  currency?: string;
  expected_close_date?: string | null;
  stage_name?: string;
  pipeline_name?: string;
  next_action?: string | null;
  url?: string;
  status?: string;
}
export interface OrgCtx {
  id?: number;
  name?: string;
  logo_url?: string;
  address?: string;
  phone?: string;
  website?: string;
  email?: string;
  currency?: string;
  timezone?: string;
  primary_color?: string;
}
export interface UserCtx {
  id?: string;
  first_name?: string;
  last_name?: string;
  full_name?: string;
  email?: string;
  phone?: string;
  job_title?: string;
  signature_html?: string;
}
export interface QuoteCtx {
  id?: string;
  number?: string;
  total?: number | null;
  currency?: string;
  valid_until?: string | null;
  url?: string;
  items?: Array<{ description: string; qty: number; unit_price: number; total_line: number }>;
}

export interface RenderContext {
  contact: ContactCtx;
  opportunity?: OpportunityCtx;
  org: OrgCtx;
  user?: UserCtx;
  quote?: QuoteCtx;
  custom: Record<string, unknown>;
  unsubscribe_url?: string;
  sender_notice?: string | null;
}

export interface VariableDef {
  path: string;
  label: string;
  group: 'contact' | 'opportunity' | 'org' | 'user' | 'quote' | 'custom';
  example: string;
  format?: 'money' | 'date';
}

export const VARIABLE_CATALOG: VariableDef[] = [
  { path: 'contact.first_name', label: 'Nombre del contacto', group: 'contact', example: 'Carlos' },
  { path: 'contact.last_name', label: 'Apellido del contacto', group: 'contact', example: 'Pérez' },
  { path: 'contact.full_name', label: 'Nombre completo', group: 'contact', example: 'Carlos Pérez' },
  { path: 'contact.email', label: 'Email del contacto', group: 'contact', example: 'carlos@empresa.com' },
  { path: 'contact.phone', label: 'Teléfono del contacto', group: 'contact', example: '+57 300 123 4567' },
  { path: 'contact.company_name', label: 'Empresa del contacto', group: 'contact', example: 'Empresa S.A.S' },
  { path: 'opportunity.name', label: 'Nombre de la oportunidad', group: 'opportunity', example: 'Plan Pro Empresa' },
  { path: 'opportunity.amount', label: 'Monto', group: 'opportunity', example: '1200000', format: 'money' },
  { path: 'opportunity.currency', label: 'Moneda', group: 'opportunity', example: 'COP' },
  { path: 'opportunity.expected_close_date', label: 'Fecha de cierre estimada', group: 'opportunity', example: '2026-10-01', format: 'date' },
  { path: 'opportunity.stage_name', label: 'Etapa', group: 'opportunity', example: 'Propuesta' },
  { path: 'opportunity.pipeline_name', label: 'Pipeline', group: 'opportunity', example: 'Ventas' },
  { path: 'opportunity.next_action', label: 'Próxima acción', group: 'opportunity', example: 'Enviar propuesta' },
  { path: 'opportunity.url', label: 'Enlace a la oportunidad', group: 'opportunity', example: 'https://app.goadmin.io/app/crm/oportunidades/…' },
  { path: 'org.name', label: 'Nombre de la organización', group: 'org', example: 'ACME S.A.S' },
  { path: 'org.logo_url', label: 'Logo', group: 'org', example: 'https://…/logo.png' },
  { path: 'org.address', label: 'Dirección', group: 'org', example: 'Cra 7 # 1-1, Bogotá' },
  { path: 'org.phone', label: 'Teléfono', group: 'org', example: '+57 1 234 5678' },
  { path: 'org.website', label: 'Sitio web', group: 'org', example: 'https://acme.co' },
  { path: 'org.email', label: 'Email de la organización', group: 'org', example: 'ventas@acme.co' },
  { path: 'org.currency', label: 'Moneda por defecto', group: 'org', example: 'COP' },
  { path: 'user.first_name', label: 'Nombre del vendedor', group: 'user', example: 'Ana' },
  { path: 'user.last_name', label: 'Apellido del vendedor', group: 'user', example: 'Gómez' },
  { path: 'user.full_name', label: 'Nombre completo del vendedor', group: 'user', example: 'Ana Gómez' },
  { path: 'user.email', label: 'Email del vendedor', group: 'user', example: 'ana@acme.co' },
  { path: 'user.phone', label: 'Teléfono del vendedor', group: 'user', example: '+57 300 000 0000' },
  { path: 'user.job_title', label: 'Cargo del vendedor', group: 'user', example: 'Ejecutiva comercial' },
  { path: 'quote.number', label: 'Número de cotización', group: 'quote', example: 'COT-0042' },
  { path: 'quote.total', label: 'Total cotización', group: 'quote', example: '1200000', format: 'money' },
  { path: 'quote.currency', label: 'Moneda cotización', group: 'quote', example: 'COP' },
  { path: 'quote.valid_until', label: 'Válida hasta', group: 'quote', example: '2026-10-15', format: 'date' },
  { path: 'quote.url', label: 'Enlace a la cotización', group: 'quote', example: 'https://app.goadmin.io/…' },
  { path: 'custom.summary', label: 'Resumen (personalizado)', group: 'custom', example: 'Resumen de la llamada…' },
  { path: 'custom.meeting_url', label: 'Enlace de reunión (personalizado)', group: 'custom', example: 'https://meet…' },
];

// ─── Escape / formato ────────────────────────────────────────────────────────

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatMoney(value: unknown, currency: string): string {
  const n = typeof value === 'number' ? value : Number(String(value).replace(/[^0-9.-]/g, ''));
  if (!Number.isFinite(n)) return String(value ?? '');
  try {
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n);
  } catch {
    return `${currency} ${n.toLocaleString('es-CO')}`;
  }
}

function formatDate(value: unknown, style: 'long' | 'short', timeZone: string): string {
  if (value === null || value === undefined || value === '') return '';
  const d = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(d.getTime())) return String(value);
  // Fechas sin hora (columnas `date`, p. ej. 2026-10-01) se interpretan como
  // UTC medianoche; mostrarlas en la zona de la org las movería un día atrás.
  const dateOnly = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
  try {
    return new Intl.DateTimeFormat('es-CO', {
      timeZone: dateOnly ? 'UTC' : timeZone,
      ...(style === 'short' ? { day: '2-digit', month: '2-digit', year: 'numeric' } : { day: 'numeric', month: 'long', year: 'numeric' }),
    }).format(d);
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

// ─── Resolución de rutas ─────────────────────────────────────────────────────

const PATH_RE = /^[a-zA-Z_][a-zA-Z0-9_]*(\.[a-zA-Z_][a-zA-Z0-9_]*)*$/;

export function getPath(ctx: RenderContext, path: string): unknown {
  if (!PATH_RE.test(path)) return undefined;
  const parts = path.split('.');
  if (parts.some((p) => p === '__proto__' || p === 'constructor' || p === 'prototype')) return undefined;
  let cur: unknown = ctx;
  for (const p of parts) {
    if (cur === null || cur === undefined || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

function isEmpty(v: unknown): boolean {
  return v === undefined || v === null || (typeof v === 'string' && v.trim() === '');
}

const FILTERS = new Set(['money', 'date', 'upper', 'lower', 'raw']);

function currencyFor(ctx: RenderContext, path: string): string {
  if (path.startsWith('quote.')) return ctx.quote?.currency || ctx.opportunity?.currency || ctx.org.currency || 'COP';
  return ctx.opportunity?.currency || ctx.org.currency || 'COP';
}

export interface InterpolateResult {
  out: string;
  missing: string[];
  used: string[];
}

/**
 * Sustituye `{{...}}` en `input`. `{{{...}}}` (triple) se elimina siempre
 * (prohibido) y se registra en missing como `raw:<path>`.
 *
 * `escapeHtml` (por defecto true) escapa el VALOR sustituido de cada `{{…}}`.
 * `escapeLiteral` escapa además el texto LITERAL que rodea a las variables:
 * necesario cuando `input` es una propiedad de texto libre que acaba dentro de
 * un atributo HTML o como contenido de una etiqueta (`header.alt`,
 * `button.label`, `footer_legal.company`…). Sin él, el literal
 * `ACME" onerror="alert(1)` rompía el atributo (tester r2, fallo nuevo #1).
 * Se escapan solo los tramos literales: el valor de la variable (y su
 * `fallback`) se sigue escapando UNA sola vez, dentro de la sustitución.
 *
 * `strictPaths` (por defecto false, el contrato de F7): cuando está activo, un
 * `{{...}}` cuyo contenido NO es una ruta válida (`{{1}}`, `{{año}}`,
 * `{{nombre cliente}}`) se reporta en `missing` y se sustituye por vacío en vez
 * de devolverse literal. Lo usa F16 (WhatsApp), donde ese literal llegaría al
 * cliente. Ver la nota extensa en la rama correspondiente.
 */
export function renderVariables(
  input: string,
  ctx: RenderContext,
  opts: { escapeHtml?: boolean; escapeLiteral?: boolean; strictPaths?: boolean } = {},
): InterpolateResult {
  const escape = opts.escapeHtml !== false;
  const lit = opts.escapeLiteral === true ? escapeHtml : (s: string) => s;
  const missing = new Set<string>();
  const used = new Set<string>();
  if (!input) return { out: '', missing: [], used: [] };

  // 1) triple llaves → prohibido
  const stripped = input.replace(/\{\{\{\s*([^}]*?)\s*\}\}\}/g, (_m, inner: string) => {
    missing.add(`raw:${inner.trim().split('|')[0]}`);
    return '';
  });

  // 2) dobles llaves. Se recorre a mano (en vez de String.replace) para poder
  // distinguir los tramos LITERALES de las sustituciones y escapar solo los
  // primeros cuando `escapeLiteral` está activo.
  const substitute = (match: string, inner: string): string => {
    const segments = inner.split('|').map((s) => s.trim());
    const path = segments[0];
    if (!path || !PATH_RE.test(path)) {
      // ARCHIVO COMPARTIDO POR F7 (email) Y F16 (WhatsApp).
      //
      // Comportamiento HISTÓRICO (el de F7, aprobada con 9,5): devolver el
      // LITERAL y NO registrar nada en `missing` — «caso borde 4», con dos
      // tests que lo fijan (`variables.test.ts` «deja literal las llaves que
      // no son una ruta válida» y `adversarial.test.ts` «{{ 1 + 1 }}»). Sirve
      // para que un `{{ }}` de CSS dentro de una plantilla no se coma.
      //
      // El problema (tester F16 r2, defecto (a)): en WhatsApp ese literal SALE
      // al cliente. `resolveParam` construye `{{custom.1}}` para los HSM
      // posicionales de Meta/Twilio, `custom.1` no pasa `PATH_RE`, y como el
      // literal no está vacío se aceptaba como valor resuelto: `missing`
      // quedaba vacío y el cliente recibía «{{custom.1}}» por WhatsApp.
      //
      // `strictPaths` deja que cada emisor elija. F16 lo activa (fail-closed:
      // se reporta como faltante y `sendWhatsApp` para con 422
      // MISSING_VARIABLES). F7 conserva su contrato mientras su responsable no
      // decida lo contrario; si lo decide, basta con invertir el default aquí.
      if (opts.strictPaths) {
        missing.add(path || match.trim());
        return '';
      }
      return lit(match);
    }
    let fallback: string | null = null;
    let filter: string | null = null;
    let filterArg: string | null = null;
    for (const seg of segments.slice(1)) {
      const [name, arg] = seg.split(':');
      if (FILTERS.has(name) && filter === null) {
        filter = name;
        filterArg = arg ?? null;
      } else if (fallback === null) {
        fallback = seg;
      }
    }
    if (filter === 'raw') {
      missing.add(`raw:${path}`);
      return '';
    }
    used.add(path);
    let value = getPath(ctx, path);
    if (isEmpty(value)) {
      if (fallback !== null) value = fallback;
      else {
        missing.add(path);
        return '';
      }
    }
    let text: string;
    if (filter === 'money') text = formatMoney(value, currencyFor(ctx, path));
    else if (filter === 'date') text = formatDate(value, filterArg === 'short' ? 'short' : 'long', ctx.org.timezone || 'America/Bogota');
    else if (filter === 'upper') text = String(value).toUpperCase();
    else if (filter === 'lower') text = String(value).toLowerCase();
    else text = typeof value === 'object' ? JSON.stringify(value) : String(value);
    return escape ? escapeHtml(text) : text;
  };

  const re = /\{\{\s*([^{}]*?)\s*\}\}/g;
  let out = '';
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(stripped)) !== null) {
    out += lit(stripped.slice(last, m.index));
    out += substitute(m[0], m[1]);
    last = m.index + m[0].length;
  }
  out += lit(stripped.slice(last));

  return { out, missing: Array.from(missing), used: Array.from(used) };
}

export function listMissingVariables(input: string, ctx: RenderContext): string[] {
  return renderVariables(input, ctx).missing;
}

/** Extrae las rutas usadas en un texto (para `templates.variables[]`). */
export function extractVariablePaths(input: string): string[] {
  const set = new Set<string>();
  for (const m of input.matchAll(/\{\{\s*([a-zA-Z_][a-zA-Z0-9_.]*)/g)) set.add(m[1]);
  return Array.from(set);
}

// ─── Contexto desde BD ───────────────────────────────────────────────

// `buildContext`/`sampleContext`/`emptyContext` viven en `variablesContext.ts`
// desde la ronda 2 (límite de 300 líneas por módulo). Se reexportan aquí para
// no romper ningún import existente.
export { buildContext, emptyContext, sampleContext, type ContextRefs } from './variablesContext';
