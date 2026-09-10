/**
 * Render de plantillas HSM (parámetros nombrados) con el motor de variables de
 * F7 (`renderVariables`, `escapeHtml:false`): FASE-16 §4.2 `buildTemplatePayload`
 * / `buildTemplateBody`.
 *
 * Cada `{{param}}` del BODY/HEADER se resuelve con `variable_map[param]`
 * (dot-path del contexto CRM, admite `|default` y filtros `|date`, `|money`),
 * con prioridad para `overrides[param]` (valores escritos por el usuario o
 * `campaign.default_variables`). Se admite además `{{1}}` posicional (Twilio).
 */

import { renderVariables, type RenderContext } from '@/lib/services/crm/email/variables';
import { WhatsAppError, type HsmButton, type HsmComponent, type HsmMeta, type RenderedTemplate, type WhatsAppTemplate } from './types';

const PARAM_RE = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;
/** Nombres de parámetro admitidos al CREAR/EDITAR una plantilla propia (Meta 'named'). */
export const PARAM_NAME_RE = /^[a-z_][a-z0-9_]*$/;

export function extractParams(text: string | null | undefined): string[] {
  const out: string[] = [];
  for (const m of (text ?? '').matchAll(PARAM_RE)) if (!out.includes(m[1])) out.push(m[1]);
  return out;
}

export function componentOf(components: HsmComponent[], type: HsmComponent['type']): HsmComponent | undefined {
  return components.find((c) => c.type === type);
}

/**
 * Un valor resuelto NUNCA puede seguir conteniendo `{{`: eso significa que el
 * motor de variables no lo resolvió (o que el dato de origen trae llaves), y
 * enviarlo pondría `{{...}}` delante del cliente. Se trata como no resuelto
 * (tester F16 r2, defecto (a)-(b)).
 */
function valorUsable(v: string | null | undefined): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v);
  if (s.trim() === '') return null;
  if (s.includes('{{')) return null;
  return s;
}

/** Resuelve UN parámetro: override → variable_map → contexto directo por nombre. */
export function resolveParam(param: string, meta: Pick<HsmMeta, 'variable_map'>, ctx: RenderContext, overrides: Record<string, unknown>): string | null {
  const ov = overrides[param];
  if (ov !== undefined && ov !== null && String(ov).trim() !== '') return valorUsable(String(ov));
  const expr = meta.variable_map?.[param];
  if (expr) {
    const r = renderVariables(`{{${expr}}}`, ctx, { escapeHtml: false, strictPaths: true });
    if (r.missing.length) return null;
    return valorUsable(r.out);
  }
  // Nombre de parámetro usado directamente como ruta (p. ej. {{contact_first_name}} no aplica; probamos custom.<param>)
  const direct = renderVariables(`{{custom.${param}}}`, ctx, { escapeHtml: false, strictPaths: true });
  if (direct.missing.length) return null;
  return valorUsable(direct.out);
}

function substitute(text: string, values: Record<string, string>): string {
  return text.replace(PARAM_RE, (m, p: string) => (values[p] !== undefined ? values[p] : m));
}

/**
 * Renderiza header/body/footer/botones y construye el payload `template` de
 * Graph API con `parameter_name` (parameter_format 'named'). Nunca lanza por
 * variables faltantes: las devuelve en `missing` (el caller decide).
 */
export function renderTemplateComponents(
  template: Pick<WhatsAppTemplate, 'name' | 'body' | 'meta'>,
  ctx: RenderContext,
  overrides: Record<string, unknown> = {},
): RenderedTemplate {
  const meta = template.meta;
  const components = Array.isArray(meta.components) && meta.components.length ? meta.components : [{ type: 'BODY', text: template.body } as HsmComponent];
  const header = componentOf(components, 'HEADER');
  const body = componentOf(components, 'BODY');
  const footer = componentOf(components, 'FOOTER');
  const buttons = componentOf(components, 'BUTTONS')?.buttons ?? [];
  const bodyText = body?.text ?? template.body ?? '';

  const params = new Set<string>([...extractParams(header?.format === 'TEXT' || !header?.format ? header?.text : ''), ...extractParams(bodyText)]);
  for (const b of buttons) if (b.type === 'URL') for (const p of extractParams(b.url)) params.add(p);

  const values: Record<string, string> = {};
  const missing: string[] = [];
  for (const p of params) {
    const v = resolveParam(p, meta, ctx, overrides);
    if (v === null) missing.push(p);
    else values[p] = v;
  }

  const positional = meta.parameter_format === 'positional' || (meta.twilio?.positional_map?.length ?? 0) > 0;
  const paramObj = (p: string) => (positional ? { type: 'text', text: values[p] ?? '' } : { type: 'text', parameter_name: p, text: values[p] ?? '' });

  const payloadComponents: unknown[] = [];
  const headerParams = header && (header.format === 'TEXT' || !header.format) ? extractParams(header.text) : [];
  if (headerParams.length) payloadComponents.push({ type: 'header', parameters: headerParams.map(paramObj) });
  const bodyParams = extractParams(bodyText);
  if (bodyParams.length) payloadComponents.push({ type: 'body', parameters: bodyParams.map(paramObj) });
  buttons.forEach((b, index) => {
    if (b.type !== 'URL') return;
    const ps = extractParams(b.url);
    if (ps.length) payloadComponents.push({ type: 'button', sub_type: 'url', index, parameters: ps.map((p) => ({ type: 'text', text: values[p] ?? '' })) });
  });

  return {
    header: header?.format === 'TEXT' || (header && !header.format) ? substitute(header?.text ?? '', values) || null : header ? `[${header.format}]` : null,
    body: substitute(bodyText, values),
    footer: footer?.text ?? null,
    buttons: buttons.map((b) => ({ ...b, url: b.url ? substitute(b.url, values) : b.url })) as HsmButton[],
    values,
    missing,
    payload: { name: template.name, language: { code: meta.language || 'es' }, components: payloadComponents },
  };
}

/** Texto plano legible para `messages.content` (header + body + footer). */
export function renderedToText(r: RenderedTemplate): string {
  return [r.header, r.body, r.footer].filter((s) => s && s.trim()).join('\n').trim();
}

/** Variables posicionales para Twilio Content API a partir de `positional_map`. */
export function toTwilioContentVariables(r: RenderedTemplate, positionalMap: string[] | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  const map = positionalMap && positionalMap.length ? positionalMap : Object.keys(r.values);
  map.forEach((p, i) => {
    out[String(i + 1)] = r.values[p] ?? '';
  });
  return out;
}

/** Nombre de plantilla admitido por Meta. */
export function validateHsmName(name: string): void {
  if (!/^[a-z0-9_]{1,512}$/.test(name)) {
    throw new WhatsAppError('VALIDATION', 'El nombre debe ser minúsculas, dígitos y guion bajo (máx 512)', 422);
  }
}

/**
 * Validaciones de Meta sobre los COMPONENTES (longitudes, parámetros, botones).
 *
 * ⚠️ Solo puede correr cuando los componentes CAMBIAN. Una plantilla traída de
 * Meta por `syncFromMeta` puede llevar parámetros posicionales `{{1}}`, que
 * estas reglas rechazan; si la validación corriera también al tocar
 * `category`, `description` o `variable_map`, esa plantilla quedaría
 * inutilizable por API y —lo que es peor— IMPOSIBLE de arreglar, porque
 * `variable_map` es justamente el único campo que hace resoluble un parámetro
 * posicional (`resolveParam` lo consulta antes de `custom.<param>`)
 * (tester F16 r3 · N-6).
 */
export function validateHsmComponents(components: HsmComponent[]): void {
  const input = { components };
  // Solo parámetros NOMBRADOS en minúsculas: `parameter_format` de las
  // plantillas que creamos es 'named' y `variable_map` los indexa por nombre.
  // Un `{{1}}` posicional, un `{{Nombre}}` o un `{{año}}` no se resuelven
  // (`PATH_RE` de `variables.ts` no los admite) y antes acababan en el mensaje
  // como literal (tester F16 r2, defecto (a)-(c)).
  const textos = [
    ...input.components.map((c) => c.text ?? ''),
    ...input.components.flatMap((c) => (c.buttons ?? []).map((b) => b.url ?? '')),
  ];
  for (const t of textos) {
    // `extractParams` solo ve `[a-zA-Z0-9_]+`; aquí hay que mirar TODAS las
    // llaves, incluidas `{{año}}` o `{{nombre cliente}}`, que son justamente
    // las que el motor de variables no sabe resolver.
    for (const m of (t ?? '').matchAll(/\{\{([^{}]*)\}\}/g)) {
      const p = m[1].trim();
      if (!PARAM_NAME_RE.test(p)) {
        throw new WhatsAppError('INVALID_COMPONENTS', `Parámetro «{{${p}}}» inválido: usa minúsculas, dígitos y guion bajo empezando por letra (p. ej. {{nombre}})`, 422);
      }
    }
  }
  const body = componentOf(input.components, 'BODY');
  if (!body?.text?.trim()) throw new WhatsAppError('INVALID_COMPONENTS', 'La plantilla necesita un componente BODY con texto', 422);
  if (body.text.length > 1024) throw new WhatsAppError('INVALID_COMPONENTS', 'BODY supera 1024 caracteres', 422);
  const t = body.text.trim();
  if (/^\{\{[^}]+\}\}/.test(t) || /\{\{[^}]+\}\}$/.test(t)) {
    throw new WhatsAppError('INVALID_COMPONENTS', 'El BODY no puede empezar ni terminar con una variable', 422);
  }
  if (/\}\}\s*\{\{/.test(t)) throw new WhatsAppError('INVALID_COMPONENTS', 'No puede haber variables adyacentes en el BODY', 422);
  const header = componentOf(input.components, 'HEADER');
  if (header?.format === 'TEXT' && header.text && header.text.length > 60) throw new WhatsAppError('INVALID_COMPONENTS', 'HEADER supera 60 caracteres', 422);
  const footer = componentOf(input.components, 'FOOTER');
  if (footer?.text && footer.text.length > 60) throw new WhatsAppError('INVALID_COMPONENTS', 'FOOTER supera 60 caracteres', 422);
  const buttons = componentOf(input.components, 'BUTTONS')?.buttons ?? [];
  if (buttons.length > 3) throw new WhatsAppError('INVALID_COMPONENTS', 'Máximo 3 botones', 422);
  for (const b of buttons) {
    if (!b.text || b.text.length > 25) throw new WhatsAppError('INVALID_COMPONENTS', 'Texto de botón obligatorio (máx 25)', 422);
    if (b.type === 'URL' && !b.url) throw new WhatsAppError('INVALID_COMPONENTS', 'Botón URL sin url', 422);
    if (b.type === 'PHONE_NUMBER' && !b.phone_number) throw new WhatsAppError('INVALID_COMPONENTS', 'Botón de teléfono sin número', 422);
  }
}

/** Validación completa (alta de plantilla propia): nombre + componentes. */
export function validateHsm(input: { name: string; components: HsmComponent[] }): void {
  validateHsmName(input.name);
  validateHsmComponents(input.components);
}

/** Componentes en el formato exacto de `POST /{WABA_ID}/message_templates` (con examples para named params). */
export function toMetaComponents(components: HsmComponent[], variableMap: Record<string, string>, examples: Record<string, string> = {}): unknown[] {
  const exampleFor = (p: string) => examples[p] ?? sampleFor(variableMap[p]);
  return components.map((c) => {
    if (c.type === 'BODY') {
      const ps = extractParams(c.text);
      return { type: 'BODY', text: c.text, ...(ps.length ? { example: { body_text_named_params: ps.map((p) => ({ param_name: p, example: exampleFor(p) })) } } : {}) };
    }
    if (c.type === 'HEADER') {
      if (c.format && c.format !== 'TEXT') return { type: 'HEADER', format: c.format };
      const ps = extractParams(c.text);
      return { type: 'HEADER', format: 'TEXT', text: c.text, ...(ps.length ? { example: { header_text_named_params: ps.map((p) => ({ param_name: p, example: exampleFor(p) })) } } : {}) };
    }
    if (c.type === 'FOOTER') return { type: 'FOOTER', text: c.text };
    if (c.type === 'BUTTONS') {
      return {
        type: 'BUTTONS',
        buttons: (c.buttons ?? []).map((b) => {
          if (b.type === 'URL') {
            const ps = extractParams(b.url);
            return { type: 'URL', text: b.text, url: b.url, ...(ps.length ? { example: ps.map((p) => exampleFor(p)) } : {}) };
          }
          if (b.type === 'PHONE_NUMBER') return { type: 'PHONE_NUMBER', text: b.text, phone_number: b.phone_number };
          return { type: 'QUICK_REPLY', text: b.text };
        }),
      };
    }
    return c;
  });
}

function sampleFor(expr: string | undefined): string {
  if (!expr) return 'ejemplo';
  const path = expr.split('|')[0].trim();
  const samples: Record<string, string> = {
    'contact.first_name': 'Laura', 'contact.full_name': 'Laura Gómez', 'contact.company_name': 'ACME', 'opportunity.name': 'Plan Pro',
    'opportunity.amount': '$1.200.000', 'org.name': 'Mi Empresa', 'user.first_name': 'Ana', 'user.full_name': 'Ana Pérez', 'quote.total': '$1.200.000',
  };
  return samples[path] ?? 'ejemplo';
}
