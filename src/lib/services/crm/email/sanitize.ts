/**
 * Sanitización de HTML para email (modo HTML crudo, bloques `text`, inbound).
 *
 * Allow-list segura para clientes de correo: tablas, estilos inline (solo
 * propiedades de layout/tipografía), `img` con `src` http(s)/cid/data:image,
 * enlaces http(s)/mailto/tel. Sin script/iframe/form/on*.
 * Las variables `{{...}}` se conservan (se interpolan después).
 */

import sanitizeHtml from 'sanitize-html';
import type { Block, BlockDocument } from './blocks';

const SAFE_STYLE_PROPS = [
  'color', 'background', 'background-color', 'font-family', 'font-size', 'font-weight', 'font-style',
  'line-height', 'text-align', 'text-decoration', 'letter-spacing', 'margin', 'margin-top', 'margin-bottom',
  'margin-left', 'margin-right', 'padding', 'padding-top', 'padding-bottom', 'padding-left', 'padding-right',
  'border', 'border-top', 'border-bottom', 'border-left', 'border-right', 'border-radius', 'border-collapse',
  'border-spacing', 'width', 'max-width', 'min-width', 'height', 'max-height', 'display', 'vertical-align',
  'white-space', 'word-break', 'text-transform', 'list-style', 'list-style-type', 'box-sizing', 'mso-hide',
];

const ALLOWED_STYLES: Record<string, Record<string, RegExp[]>> = {
  '*': Object.fromEntries(SAFE_STYLE_PROPS.map((p) => [p, [/^[^;{}<>]*$/]])),
};

const EMAIL_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    'p', 'br', 'a', 'strong', 'b', 'em', 'i', 'u', 's', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li',
    'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'img', 'div', 'span', 'hr', 'blockquote', 'center',
    'pre', 'code', 'sup', 'sub', 'small', 'font', 'html', 'head', 'body', 'title', 'meta', 'style',
  ],
  allowedAttributes: {
    '*': ['style', 'align', 'valign', 'width', 'height', 'bgcolor', 'border', 'cellpadding', 'cellspacing', 'role', 'dir', 'lang', 'class', 'id', 'title'],
    a: ['href', 'target', 'rel', 'name'],
    img: ['src', 'alt', 'width', 'height', 'border'],
    font: ['color', 'face', 'size'],
    meta: ['charset', 'name', 'content', 'http-equiv'],
    td: ['colspan', 'rowspan'],
    th: ['colspan', 'rowspan'],
  },
  allowedSchemes: ['http', 'https', 'mailto', 'tel', 'cid', 'data'],
  allowedSchemesByTag: { img: ['http', 'https', 'cid', 'data'], a: ['http', 'https', 'mailto', 'tel'] },
  allowedSchemesAppliedToAttributes: ['href', 'src'],
  allowProtocolRelative: false,
  allowedStyles: ALLOWED_STYLES,
  disallowedTagsMode: 'discard',
  // Conservar <style> (juice-like) pero sin comentarios condicionales peligrosos
  allowVulnerableTags: true,
  exclusiveFilter: (frame) => {
    if (frame.tag === 'img') {
      const src = String(frame.attribs?.src ?? '');
      if (src.startsWith('data:') && !/^data:image\//i.test(src)) return true;
    }
    return false;
  },
  transformTags: {
    a: (tagName, attribs) => {
      const hrefv = String(attribs.href ?? '');
      // Variables en href se conservan; `javascript:` ya lo elimina allowedSchemes
      if (hrefv.startsWith('{{')) return { tagName, attribs: { ...attribs, href: hrefv } };
      return { tagName, attribs: { ...attribs, target: attribs.target ?? '_blank', rel: 'noopener' } };
    },
  },
  nonTextTags: ['script', 'textarea', 'option', 'noscript', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'svg', 'math', 'template'],
  parser: { lowerCaseAttributeNames: true },
};

/** HTML crudo / inbound. Conserva tablas, estilos inline y variables. */
export function sanitizeEmailHtml(html: string): string {
  if (!html) return '';
  // Proteger variables con llaves de la codificación de entidades de sanitize-html
  const protectedHtml = html.replace(/\{\{([^{}]*)\}\}/g, (_m, inner: string) => `__VAR_OPEN__${inner}__VAR_CLOSE__`);
  const clean = sanitizeHtml(protectedHtml, EMAIL_OPTIONS);
  return clean.replace(/__VAR_OPEN__([^]*?)__VAR_CLOSE__/g, (_m, inner: string) => `{{${inner}}}`);
}

/**
 * Correo ENTRANTE (remitente externo, no confiable).
 *
 * Decisión de la ronda 2 sobre el hallazgo #13 del tester: se CONSERVA `<style>`
 * en el camino saliente — `allowVulnerableTags: true` es deliberado, los
 * clientes de correo necesitan CSS en `<head>` y ese HTML lo escribe un usuario
 * autenticado de la propia org — pero se DESCARTA en el entrante, donde el autor
 * es cualquiera de internet y el HTML acaba en la BD y en la vista previa.
 * Además se vuelve a imponer la allow-list de esquemas por si el remitente cuela
 * un `{{…}}` que el protector de variables devuelve intacto.
 */
export function sanitizeInboundHtml(html: string): string {
  if (!html) return '';
  const protectedHtml = html.replace(/\{\{([^{}]*)\}\}/g, (_m, inner: string) => `__VAR_OPEN__${inner}__VAR_CLOSE__`);
  const clean = sanitizeHtml(protectedHtml, {
    ...EMAIL_OPTIONS,
    allowedTags: (EMAIL_OPTIONS.allowedTags as string[]).filter((t) => t !== 'style'),
    allowVulnerableTags: false,
  });
  return enforceSafeUrlAttributes(clean.replace(/__VAR_OPEN__([^]*?)__VAR_CLOSE__/g, (_m, inner: string) => `{{${inner}}}`));
}

/** Fragmento de un bloque `text` (sin html/head/body/style). */
export function sanitizeFragment(html: string): string {
  if (!html) return '';
  const protectedHtml = html.replace(/\{\{([^{}]*)\}\}/g, (_m, inner: string) => `__VAR_OPEN__${inner}__VAR_CLOSE__`);
  const clean = sanitizeHtml(protectedHtml, {
    ...EMAIL_OPTIONS,
    allowedTags: (EMAIL_OPTIONS.allowedTags as string[]).filter((t) => !['html', 'head', 'body', 'title', 'meta', 'style'].includes(t)),
    allowVulnerableTags: false,
  });
  return clean.replace(/__VAR_OPEN__([^]*?)__VAR_CLOSE__/g, (_m, inner: string) => `{{${inner}}}`);
}

/**
 * Sanea las props `html` de un documento de bloques ANTES de guardarlo.
 *
 * El render ya pasa esas props por `sanitizeFragment`, así que el correo que
 * sale nunca llevó marcado peligroso; lo que quedaba sucio era el `blocks_json`
 * GUARDADO, que es lo que lee el canvas del editor (tester r2, fallo nuevo #2).
 * Saneando en la escritura, el dato en reposo también está limpio y el filtro
 * del cliente pasa a ser la segunda capa, no la única.
 */
export function sanitizeBlockDocument(doc: BlockDocument): BlockDocument {
  return {
    ...doc,
    // El tipo de retorno explícito es necesario: sin él TS infiere la unión de
    // los literales del `map` y no la reconoce como `Block[]` (la unión
    // discriminada pierde el orden de los miembros).
    blocks: doc.blocks.map((b): Block => {
      // `text` y `signature` se tratan por separado a propósito: con la guarda
      // combinada (`||`) el spread produce el producto cruzado de las dos
      // formas de `props` y deja de encajar en la unión discriminada.
      if (b.type === 'text') {
        return { ...b, props: { ...b.props, html: sanitizeFragment(b.props.html) } };
      }
      if (b.type === 'signature') {
        return { ...b, props: { ...b.props, html: sanitizeFragment(b.props.html) } };
      }
      if (b.type === 'columns') {
        return { ...b, props: { ...b.props, columns: b.props.columns.map((c) => ({ ...c, html: sanitizeFragment(c.html) })) } };
      }
      return b;
    }),
  };
}

// ─── Allow-list de esquemas aplicada DESPUÉS de interpolar variables ─────────

/**
 * `sanitize.ts` corre ANTES de interpolar `{{…}}` (y protege las llaves a
 * propósito, línea ~71), así que sanitize-html ve `href="__VAR_OPEN__…"`, un
 * valor sin esquema que pasa el filtro. Si la variable trae
 * `javascript:alert(1)`, el esquema sobrevive al render (tester r1 #3, ALTO).
 *
 * `enforceSafeUrlAttributes` se aplica al HTML YA interpolado y vuelve a
 * imponer la misma allow-list que usa el motor de bloques (`safeUrl`):
 * http, https, mailto, tel, cid (+ `data:image/…` solo en `src`).
 * Las URL sin esquema (relativas, `#ancla`, vacías) se dejan pasar.
 */
const SAFE_SCHEMES = new Set(['http', 'https', 'mailto', 'tel', 'cid']);

/** Decodifica entidades numéricas y `&colon;`/`&tab;`/`&newline;` y quita espacios/control. */
function normalizeUrlForCheck(raw: string): string {
  const decoded = raw
    .replace(/&#x([0-9a-f]+);?/gi, (_m, h: string) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);?/g, (_m, d: string) => String.fromCharCode(parseInt(d, 10)))
    .replace(/&colon;?/gi, ':')
    .replace(/&(tab|newline|NewLine);?/gi, ' ');
  // Espacios y caracteres de control se ignoran (evitan "java" + tab + "script:").
  return decoded.replace(/[\u0000-\u0020\u00a0]/g, '');
}

export function isSafeUrlValue(raw: string, attr: 'href' | 'src'): boolean {
  const v = normalizeUrlForCheck(raw);
  const m = /^([a-z][a-z0-9+.-]*):/i.exec(v);
  if (!m) return true; // relativa / ancla / vacía
  const scheme = m[1].toLowerCase();
  if (SAFE_SCHEMES.has(scheme)) return true;
  return attr === 'src' && /^data:image\/(png|jpe?g|gif|webp|svg\+xml);/i.test(v);
}

/** Neutraliza `href`/`src` con esquema prohibido: `href` → `#`, `src` → vacío. */
export function enforceSafeUrlAttributes(html: string): string {
  if (!html) return '';
  return html.replace(
    /\b(href|src)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'`=<>]+))/gi,
    (match, rawAttr: string, dq?: string, sq?: string, uq?: string) => {
      const attr = rawAttr.toLowerCase() as 'href' | 'src';
      const value = dq ?? sq ?? uq ?? '';
      if (isSafeUrlValue(value, attr)) return match;
      return attr === 'href' ? `${rawAttr}="#"` : `${rawAttr}=""`;
    },
  );
}

const BASIC_ENTITIES: Record<string, string> = {
  '&nbsp;': ' ',
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
};

/**
 * Decodifica las entidades básicas en UNA sola pasada. Encadenar `.replace()`
 * las decodificaba dos veces (`&amp;lt;` acababa en `<` en vez de en `&lt;`)
 * porque cada reemplazo veía el resultado del anterior.
 */
export function decodeBasicEntities(s: string): string {
  return s.replace(/&(?:nbsp|amp|lt|gt|quot|#39);/g, (m) => BASIC_ENTITIES[m] ?? m);
}

/** HTML → texto plano razonable (para `text` del correo y snippets). */
export function htmlToText(html: string): string {
  if (!html) return '';
  return decodeBasicEntities(
    html
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<head[\s\S]*?<\/head>/gi, '')
      .replace(/<a\s+[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (_m, h: string, t: string) => {
        const label = t.replace(/<[^>]+>/g, '').trim();
        return label && label !== h ? `${label} (${h})` : h;
      })
      .replace(/<img[^>]*alt="([^"]*)"[^>]*>/gi, '$1')
      .replace(/<\/(p|div|tr|h[1-6]|li|blockquote|table)>/gi, '\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/td>/gi, '\t')
      .replace(/<[^>]+>/g, ''),
  )
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
