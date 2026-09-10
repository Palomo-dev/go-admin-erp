/**
 * Render de bloques → HTML compatible con clientes de correo (tablas + estilos
 * inline). Determinista (snapshot-friendly) y sin dependencias de React en el
 * route handler. El shell (Html/Head/Preview/Body) lo pone `render.ts`.
 *
 * Cada bloque devuelve una fila `<tr><td>` dentro de la tabla contenedora.
 */

import type { Block, BlockDocument, BlockSettings } from './blocks';
import { escapeHtml, renderVariables, type RenderContext } from './variables';
import {
  htmlFragmentToText,
  plainProp,
  safeAlign,
  safeColor,
  safeFont,
  safeUrl,
  textProp,
  vars,
  varsInHtml,
  type Acc,
} from './renderPrimitives';

// Reexportadas para no romper importaciones existentes (`render.ts`, tests).
export { safeUrl, safeFont, safeColor, safeAlign } from './renderPrimitives';

export interface BlockRenderResult {
  html: string;
  text: string;
  missing: string[];
  used: string[];
}

const cell = (inner: string, style = '') => `<tr><td style="padding:0 32px;${style}">${inner}</td></tr>`;

export function renderBlock(block: Block, ctx: RenderContext, settings: BlockSettings, acc: Acc): { html: string; text: string } {
  const brand = safeColor(settings.brand.primary_color, '#2563eb');
  const font = safeFont(settings.font);
  switch (block.type) {
    case 'header': {
      const p = block.props;
      // El logo es opcional: sin URL se muestra el nombre; no cuenta como variable faltante.
      // `escapeHtml:false`: `safeUrl` escapa la URL completa justo debajo; con
      // `true` salía escapada dos veces y un logo con `&` en la query no cargaba.
      const logo = renderVariables(p.logo_url || settings.brand.logo_url, ctx, { escapeHtml: false }).out;
      const alt = textProp(p.alt, ctx, acc);
      const altText = plainProp(p.alt, ctx, acc);
      const bg = p.bg ? `background:${safeColor(p.bg, '#ffffff')};` : '';
      const h = Math.max(20, Math.min(160, Math.trunc(Number(p.height)) || 40));
      const content = logo
        ? `<img src="${safeUrl(logo)}" alt="${alt}" height="${h}" style="height:${h}px;max-width:100%;border:0;display:inline-block" />`
        : `<span style="font-family:${font};font-size:20px;font-weight:700;color:${brand}">${alt}</span>`;
      return { html: cell(content, `padding-top:24px;padding-bottom:16px;text-align:${safeAlign(p.align)};${bg}`), text: altText };
    }
    case 'text': {
      const p = block.props;
      const html = varsInHtml(p.html, ctx, acc);
      return {
        html: cell(`<div style="font-family:${font};font-size:${Math.max(10, Math.min(32, Math.trunc(Number(p.font_size)) || 15))}px;line-height:1.5;color:${safeColor(p.color, '#1f2937')};text-align:${safeAlign(p.align)}">${html}</div>`, 'padding-top:8px;padding-bottom:8px'),
        text: htmlFragmentToText(html),
      };
    }
    case 'button': {
      const p = block.props;
      const label = textProp(p.label, ctx, acc);
      const labelText = plainProp(p.label, ctx, acc);
      const hrefRaw = vars(p.href, ctx, acc, false);
      const url = safeUrl(hrefRaw);
      const color = safeColor(p.color, brand);
      const styles: Record<string, string> = {
        primary: `background:${color};color:#ffffff;border:1px solid ${color};`,
        outline: `background:#ffffff;color:${color};border:1px solid ${color};`,
        link: `background:transparent;color:${color};border:0;text-decoration:underline;`,
      };
      const a = `<a href="${url}" target="_blank" rel="noopener" style="display:inline-block;padding:12px 24px;border-radius:6px;font-family:${font};font-size:15px;font-weight:600;text-decoration:none;${styles[p.style]}">${label}</a>`;
      return { html: cell(a, `padding-top:12px;padding-bottom:12px;text-align:${safeAlign(p.align)}`), text: `${labelText}: ${hrefRaw}` };
    }
    case 'image': {
      const p = block.props;
      const src = vars(p.src, ctx, acc, false);
      if (!src.trim()) return { html: '', text: '' };
      const alt = textProp(p.alt, ctx, acc);
      const altText = plainProp(p.alt, ctx, acc);
      const pw = p.width ? Math.max(40, Math.min(800, Math.trunc(Number(p.width)) || 0)) : 0;
      const w = pw ? `width="${pw}" style="width:${pw}px;max-width:100%;border:0"` : 'style="max-width:100%;border:0"';
      let img = `<img src="${safeUrl(src)}" alt="${alt}" ${w} />`;
      if (p.href) img = `<a href="${safeUrl(vars(p.href, ctx, acc, false))}" target="_blank" rel="noopener">${img}</a>`;
      return { html: cell(img, `padding-top:8px;padding-bottom:8px;text-align:${safeAlign(p.align)}`), text: altText };
    }
    case 'divider': {
      const p = block.props;
      const thickness = Math.max(1, Math.min(8, Math.trunc(Number(p.thickness)) || 1));
      return { html: cell(`<hr style="border:0;border-top:${thickness}px solid ${safeColor(p.color, '#e5e7eb')};margin:0" />`, 'padding-top:12px;padding-bottom:12px'), text: '----' };
    }
    case 'spacer': {
      const h = Math.max(4, Math.min(120, Math.trunc(Number(block.props.height)) || 16));
      return { html: `<tr><td style="height:${h}px;line-height:${h}px;font-size:0">&nbsp;</td></tr>`, text: '' };
    }
    case 'columns': {
      const cols = block.props.columns;
      const width = Math.floor(100 / cols.length);
      // Se renderiza UNA sola vez y se derivan las dos salidas de ahí. Antes el
      // `text` volvía a llamar a `varsInHtml` (doble saneado) y usaba `c.title`
      // CRUDO, así que las variables del título no se sustituían en texto plano.
      const rendered = cols.map((c) => ({
        title: textProp(c.title, ctx, acc),
        titleText: plainProp(c.title, ctx, acc),
        html: varsInHtml(c.html, ctx, acc),
      }));
      const tds = rendered
        .map((c) => `<td valign="top" width="${width}%" style="width:${width}%;padding:8px;font-family:${font};font-size:14px;line-height:1.5;color:#1f2937">${c.title ? `<p style="margin:0 0 6px;font-weight:700">${c.title}</p>` : ''}${c.html}</td>`)
        .join('');
      return {
        html: cell(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>${tds}</tr></table>`, 'padding-top:8px;padding-bottom:8px'),
        text: rendered.map((c) => `${c.titleText ? c.titleText + ': ' : ''}${htmlFragmentToText(c.html)}`).join('\n'),
      };
    }
    case 'product_card': {
      const p = block.props;
      const name = textProp(p.name, ctx, acc);
      const desc = textProp(p.description, ctx, acc);
      const price = textProp(p.price, ctx, acc);
      const nameText = plainProp(p.name, ctx, acc);
      const descText = plainProp(p.description, ctx, acc);
      const priceText = plainProp(p.price, ctx, acc);
      const img = p.image_url ? vars(p.image_url, ctx, acc, false) : '';
      const cta = p.href ? `<a href="${safeUrl(vars(p.href, ctx, acc, false))}" style="color:${brand};font-weight:600;text-decoration:none">${textProp(p.cta, ctx, acc)} →</a>` : '';
      const html = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #e5e7eb;border-radius:8px"><tr>${
        img ? `<td width="120" style="padding:12px"><img src="${safeUrl(img)}" alt="${name}" width="100" style="width:100px;border-radius:6px;border:0" /></td>` : ''
      }<td style="padding:12px;font-family:${font};font-size:14px;color:#1f2937"><p style="margin:0 0 4px;font-size:16px;font-weight:700">${name}</p>${desc ? `<p style="margin:0 0 8px;color:#4b5563">${desc}</p>` : ''}<p style="margin:0 0 8px;font-size:18px;font-weight:700;color:${brand}">${price}</p>${cta}</td></tr></table>`;
      return { html: cell(html, 'padding-top:8px;padding-bottom:8px'), text: `${nameText}${descText ? ' - ' + descText : ''} ${priceText}` };
    }
    case 'quote_summary': {
      const p = block.props;
      const title = textProp(p.title, ctx, acc);
      const titleText = plainProp(p.title, ctx, acc);
      if (!ctx.quote) {
        acc.missing.add('quote');
        return { html: cell(`<p style="font-family:${font};font-size:14px;color:#6b7280">Sin cotización asociada</p>`), text: 'Sin cotización' };
      }
      const cur = ctx.quote.currency || 'COP';
      // `custom.__amt` es una variable interna del formateador: NO debe entrar
      // en `used` (alimenta `templates.variables[]` y la UI). Tester r1 #15.
      // `escape` distingue el importe del HTML (`&nbsp;`/`&` de `Intl` escapados)
      // del importe del texto plano, que va tal cual.
      const fmt = (n: number, escape = true) => renderVariables('{{custom.__amt|money}}', { ...ctx, custom: { ...ctx.custom, __amt: n } }, { escapeHtml: escape }).out;
      const rows = p.show_items
        ? (ctx.quote.items ?? []).map((it) => `<tr><td style="padding:6px 8px;border-bottom:1px solid #f3f4f6">${escapeHtml(it.description)} × ${it.qty}</td><td align="right" style="padding:6px 8px;border-bottom:1px solid #f3f4f6;white-space:nowrap">${fmt(it.total_line)}</td></tr>`).join('')
        : '';
      const total = fmt(ctx.quote.total ?? 0);
      const html = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="font-family:${font};font-size:14px;color:#1f2937;border:1px solid #e5e7eb;border-radius:8px"><tr><td colspan="2" style="padding:10px 8px;font-weight:700;background:#f9fafb;border-radius:8px 8px 0 0">${title}</td></tr>${rows}<tr><td style="padding:10px 8px;font-weight:700">Total (${escapeHtml(cur)})</td><td align="right" style="padding:10px 8px;font-weight:700;color:${brand}">${total}</td></tr></table>${
        p.cta_label ? `<p style="margin:12px 0 0;text-align:center"><a href="${safeUrl(vars(p.cta_href, ctx, acc, false))}" target="_blank" rel="noopener" style="display:inline-block;padding:10px 20px;border-radius:6px;background:${brand};color:#fff;font-family:${font};font-size:14px;font-weight:600;text-decoration:none">${textProp(p.cta_label, ctx, acc)}</a></p>` : ''
      }`;
      return { html: cell(html, 'padding-top:8px;padding-bottom:8px'), text: `${titleText}: total ${fmt(ctx.quote.total ?? 0, false)}` };
    }
    case 'signature': {
      const p = block.props;
      let html: string;
      if (p.source === 'custom' && p.html.trim()) html = varsInHtml(p.html, ctx, acc);
      else if (ctx.user?.signature_html) html = varsInHtml(ctx.user.signature_html, ctx, acc);
      else {
        const u = ctx.user;
        if (!u) {
          acc.missing.add('user');
          return { html: '', text: '' };
        }
        const lines = [u.full_name, u.job_title, ctx.org.name, u.phone, u.email].filter(Boolean).map((l) => escapeHtml(String(l)));
        html = `<p style="margin:0;font-family:${font};font-size:14px;line-height:1.5;color:#374151"><strong>${lines[0] ?? ''}</strong>${lines.slice(1).map((l) => `<br/>${l}`).join('')}</p>`;
      }
      return { html: cell(html, 'padding-top:16px;padding-bottom:8px'), text: htmlFragmentToText(html) };
    }
    case 'social': {
      const p = block.props;
      // Los `href` se interpolan UNA vez y sirven a las dos salidas: el texto
      // plano usaba `l.href` crudo, sin sustituir las variables.
      const hrefs = p.links.map((l) => vars(l.href, ctx, acc, false));
      const links = p.links.map((l, i) => `<a href="${safeUrl(hrefs[i])}" target="_blank" rel="noopener" style="display:inline-block;margin:0 6px;font-family:${font};font-size:13px;color:${brand};text-decoration:none">${escapeHtml(l.network)}</a>`).join('');
      return { html: links ? cell(links, `padding-top:12px;padding-bottom:12px;text-align:${safeAlign(p.align)}`) : '', text: hrefs.join(' ') };
    }
    case 'footer_legal': {
      const p = block.props;
      const company = textProp(p.company, ctx, acc);
      const address = textProp(p.address, ctx, acc);
      const text = textProp(p.text, ctx, acc);
      const companyText = plainProp(p.company, ctx, acc);
      const addressText = plainProp(p.address, ctx, acc);
      const textText = plainProp(p.text, ctx, acc);
      const notice = ctx.sender_notice ? `<br/>${escapeHtml(ctx.sender_notice)}` : '';
      let unsub = '';
      if (p.unsubscribe) {
        if (ctx.unsubscribe_url) unsub = `<br/><a href="${safeUrl(ctx.unsubscribe_url)}" style="color:#6b7280">${textProp(p.unsubscribe_label, ctx, acc)}</a>`;
        else acc.missing.add('unsubscribe_url');
      }
      const html = `<p style="margin:0;font-family:${font};font-size:12px;line-height:1.5;color:#6b7280;text-align:center">${company}${address ? ` · ${address}` : ''}${text ? `<br/>${text}` : ''}${notice}${unsub}</p>`;
      return { html: cell(html, 'padding-top:24px;padding-bottom:24px;border-top:1px solid #e5e7eb'), text: `${companyText} ${addressText} ${textText}`.trim() };
    }
    case 'variable': {
      const p = block.props;
      const expr = `{{${p.path}${p.filter ? '|' + p.filter : ''}${p.fallback ? '|' + p.fallback : ''}}}`;
      const v = textProp(expr, ctx, acc);
      return { html: cell(`<span style="font-family:${font};font-size:15px;color:#1f2937">${v}</span>`), text: plainProp(expr, ctx, acc) };
    }
    default:
      return { html: '', text: '' };
  }
}

/** Renderiza el documento completo (sin shell). */
export function renderBlockDocument(doc: BlockDocument, ctx: RenderContext): BlockRenderResult {
  const acc: Acc = { missing: new Set(), used: new Set() };
  const parts = doc.blocks.map((b) => renderBlock(b, ctx, doc.settings, acc));
  const inner = parts.map((p) => p.html).join('\n');
  const bg = safeColor(doc.settings.bg, '#f4f5f7');
  const width = Math.max(320, Math.min(800, Math.trunc(Number(doc.settings.width)) || 600));
  const html = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${bg};padding:24px 0"><tr><td align="center"><table role="presentation" width="${width}" cellpadding="0" cellspacing="0" border="0" style="width:${width}px;max-width:100%;background:#ffffff;border-radius:8px">${inner}</table></td></tr></table>`;
  return {
    html,
    text: parts.map((p) => p.text).filter(Boolean).join('\n\n'),
    missing: Array.from(acc.missing),
    used: Array.from(acc.used),
  };
}
