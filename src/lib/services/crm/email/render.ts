/**
 * renderEmail({ template? | blocks? | html?, subject, preheader, ctx })
 *   → { html, text, subject, preheader, missing, used }
 *
 * - blocks  → renderBlocks (tablas + estilos inline) + shell HTML.
 * - html    → sanitizeEmailHtml + variables (+ shell si no trae <html>).
 * - template→ según `engine` (`blocks_json` o `body_html`).
 *
 * Nota: React Email (@react-email/components 1.0.12) está instalado, pero el
 * render de bloques es HTML puro determinista (snapshots, sin react-dom/server
 * en route handlers). Ver FASE-07 §13.
 */

import type { BlockDocument } from './blocks';
import { parseBlockDocument } from './blocks';
import type { Template } from './types';
import { EmailError } from './types';
import { renderBlockDocument, safeColor, safeFont } from './renderBlocks';
import { sanitizeEmailHtml, enforceSafeUrlAttributes, htmlToText } from './sanitize';
import { renderVariables, escapeHtml, type RenderContext } from './variables';

export type RenderSource =
  | { template: Template }
  | { blocks: BlockDocument | Record<string, unknown> }
  | { html: string; text?: string };

export interface RenderOptions {
  subject?: string;
  preheader?: string;
  ctx: RenderContext;
}

export interface RenderOutput {
  html: string;
  text: string;
  subject: string;
  preheader: string;
  missing: string[];
  used: string[];
}

function shell(bodyInner: string, subject: string, preheader: string, bgRaw: string, fontRaw: string): string {
  // `bg`/`font` acaban dentro de `style="…"`: se revalidan aquí (tester r1 #2).
  const bg = safeColor(bgRaw, '#f4f5f7');
  const font = safeFont(fontRaw);
  const pre = preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;font-size:1px;line-height:1px;color:transparent;opacity:0">${escapeHtml(preheader)}${'&#847;&zwnj;&nbsp;'.repeat(20)}</div>`
    : '';
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><meta name="x-apple-disable-message-reformatting"/><title>${escapeHtml(subject)}</title></head><body style="margin:0;padding:0;background:${bg};font-family:${font};-webkit-font-smoothing:antialiased">${pre}${bodyInner}</body></html>`;
}

export async function renderEmail(source: RenderSource, opts: RenderOptions): Promise<RenderOutput> {
  const ctx = opts.ctx;
  const missing = new Set<string>();
  const used = new Set<string>();
  const collect = (r: { missing: string[]; used: string[] }) => {
    r.missing.forEach((m) => missing.add(m));
    r.used.forEach((u) => used.add(u));
  };

  let subjectRaw = opts.subject ?? '';
  let preheaderRaw = opts.preheader ?? '';
  let html = '';
  let text = '';

  if ('template' in source) {
    const t = source.template;
    if (!subjectRaw) subjectRaw = t.subject ?? '';
    if (!preheaderRaw) preheaderRaw = t.preheader ?? '';
    if (t.engine === 'blocks') {
      if (!t.blocks_json) throw new EmailError('INVALID_BLOCKS', 'La plantilla de bloques no tiene blocks_json', 422);
      return renderEmail({ blocks: t.blocks_json }, { ...opts, subject: subjectRaw, preheader: preheaderRaw });
    }
    if (t.engine === 'react') throw new EmailError('UNSUPPORTED_ENGINE', 'Plantillas react no se renderizan desde el editor', 422);
    return renderEmail({ html: t.body_html ?? '' }, { ...opts, subject: subjectRaw, preheader: preheaderRaw });
  }

  const subjectR = renderVariables(subjectRaw, ctx, { escapeHtml: false });
  const preheaderR = renderVariables(preheaderRaw, ctx, { escapeHtml: false });
  collect(subjectR);
  collect(preheaderR);
  const subject = subjectR.out.trim();
  const preheader = preheaderR.out.trim();

  if ('blocks' in source) {
    let doc: BlockDocument;
    try {
      doc = parseBlockDocument(source.blocks);
    } catch (err) {
      throw new EmailError('INVALID_BLOCKS', err instanceof Error ? err.message : 'Documento de bloques inválido', 422);
    }
    const r = renderBlockDocument(doc, ctx);
    collect(r);
    html = shell(r.html, subject, preheader, doc.settings.bg, doc.settings.font);
    text = r.text;
  } else {
    const clean = sanitizeEmailHtml(source.html ?? '');
    const r = renderVariables(clean, ctx, { escapeHtml: true });
    collect(r);
    // La sanitización corre ANTES de interpolar, así que un `javascript:` que
    // llega POR VARIABLE no lo ve sanitize-html. Se vuelve a imponer la
    // allow-list de esquemas sobre el HTML ya interpolado (tester r1 #3).
    const safe = enforceSafeUrlAttributes(r.out);
    const hasShell = /<html[\s>]/i.test(safe);
    html = hasShell ? safe : shell(`<div style="max-width:600px;margin:0 auto;padding:24px;background:#ffffff">${safe}</div>`, subject, preheader, '#f4f5f7', 'Inter, Arial, sans-serif');
    text = source.text ? renderVariables(source.text, ctx, { escapeHtml: false }).out : htmlToText(safe);
  }

  const finalPreheader = preheader || text.replace(/\s+/g, ' ').slice(0, 80);
  return { html, text, subject, preheader: finalPreheader, missing: Array.from(missing), used: Array.from(used) };
}
