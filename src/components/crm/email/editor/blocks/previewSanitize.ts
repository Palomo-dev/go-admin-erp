'use client';

/**
 * Saneado del HTML que el canvas del editor pinta con `dangerouslySetInnerHTML`
 * (bloques `text`, `columns[].html` y `signature`).
 *
 * Tester r2 (fallo nuevo #2, ALTO): `BlockPreview` inyectaba `blocks_json` sin
 * sanear y con `escapeHtml:false`. Es el ÚNICO punto de la fase donde el HTML de
 * la plantilla no acaba dentro del `iframe sandbox=""` (`EmailPreview`), así que
 * un miembro de la org podía guardar `props.html` con un `onerror` y ejecutarlo
 * en el origen de la app con la sesión de quien abriera la plantilla (escalada
 * de privilegios dentro del tenant).
 *
 * Por qué se sanea aquí en vez de meter el canvas en el iframe aislado:
 *  1. el canvas es interactivo (selección, arrastrar y soltar, barra por bloque,
 *     undo/redo); dentro de `sandbox=""` haría falta un puente de mensajes para
 *     cada interacción — mucho más código y más superficie que este filtro;
 *  2. la vista definitiva (`EmailPreview`) YA se sirve en el iframe con sandbox;
 *     el canvas es, por diseño, una aproximación;
 *  3. no se puede reutilizar `sanitizeFragment` (sanitize-html): arrastraría
 *     sanitize-html + postcss + htmlparser2 al bundle del cliente para una vista
 *     aproximada, y `dompurify` solo está como dependencia transitiva de jspdf
 *     (añadirla es tocar `package.json`, que es archivo compartido, y este
 *     entorno no permite `npm install`).
 *
 * El filtro usa el parser del propio navegador (`DOMParser`), que produce un
 * documento INERTE: no ejecuta scripts, no dispara `onerror` y no descarga
 * recursos. Sobre ese árbol se aplica una allow-list cerrada de etiquetas,
 * atributos y propiedades CSS. Fuera del navegador (render en servidor) no hay
 * `DOMParser`: se degrada a texto plano escapado, que es igual de seguro.
 */

const ALLOWED_TAGS = new Set([
  'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'ul', 'ol', 'li', 'span', 'div', 'a', 'blockquote', 'code', 'pre', 'small', 'sup', 'sub',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'hr', 'img', 'center', 'font',
]);

/** Mismas propiedades que la allow-list del servidor (`sanitize.ts`). */
const ALLOWED_STYLE_PROPS = new Set([
  'color', 'background', 'background-color', 'font-family', 'font-size', 'font-weight', 'font-style',
  'line-height', 'text-align', 'text-decoration', 'letter-spacing', 'margin', 'margin-top', 'margin-bottom',
  'margin-left', 'margin-right', 'padding', 'padding-top', 'padding-bottom', 'padding-left', 'padding-right',
  'border', 'border-top', 'border-bottom', 'border-left', 'border-right', 'border-radius', 'border-collapse',
  'border-spacing', 'width', 'max-width', 'min-width', 'height', 'max-height', 'vertical-align',
  'white-space', 'word-break', 'text-transform', 'list-style', 'list-style-type',
]);

const SAFE_SCHEMES = /^(https?:|mailto:|tel:|cid:|#|\/|\.\/|\.\.\/)/i;

export function escapeHtmlText(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function isSafeUrl(raw: string, allowDataImage: boolean): boolean {
  // Se normaliza igual que en el servidor: entidades, espacios y controles.
  const v = raw
    .replace(/&#x([0-9a-f]+);?/gi, (_m, h: string) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);?/g, (_m, d: string) => String.fromCharCode(parseInt(d, 10)))
    .replace(/&colon;?/gi, ':')
    .replace(/[\u0000-\u0020\u00a0]/g, '');
  if (!v) return false;
  if (allowDataImage && /^data:image\/(png|jpe?g|gif|webp);/i.test(v)) return true;
  if (/^[a-z][a-z0-9+.-]*:/i.test(v)) return SAFE_SCHEMES.test(v);
  return true; // relativa / ancla
}

function filterStyle(value: string): string {
  return value
    .split(';')
    .map((decl) => decl.trim())
    .filter(Boolean)
    .filter((decl) => {
      const i = decl.indexOf(':');
      if (i <= 0) return false;
      const prop = decl.slice(0, i).trim().toLowerCase();
      const val = decl.slice(i + 1).trim().toLowerCase();
      if (!ALLOWED_STYLE_PROPS.has(prop)) return false;
      return !/url\s*\(|expression\s*\(|javascript:|[<>{}]/.test(val);
    })
    .join('; ');
}

/** Etiquetas cuyo CONTENIDO tampoco debe verse (no solo la etiqueta). */
const DROP_WITH_CONTENT = new Set([
  'script', 'style', 'noscript', 'iframe', 'object', 'embed', 'template',
  'svg', 'math', 'form', 'input', 'button', 'textarea', 'select', 'option', 'link', 'meta', 'base',
]);

function clean(node: Element, doc: Document): void {
  const tag = node.tagName.toLowerCase();
  if (DROP_WITH_CONTENT.has(tag)) {
    node.remove();
    return;
  }
  for (const child of Array.from(node.children)) clean(child, doc);
  if (!ALLOWED_TAGS.has(tag)) {
    // Etiqueta no permitida → se sustituye por su contenido de texto (sin
    // marcado), nunca por sus hijos crudos.
    node.replaceWith(doc.createTextNode(node.textContent ?? ''));
    return;
  }
  for (const attr of Array.from(node.attributes)) {
    const name = attr.name.toLowerCase();
    const value = attr.value;
    if (name === 'style') {
      const filtered = filterStyle(value);
      if (filtered) node.setAttribute('style', filtered);
      else node.removeAttribute('style');
      continue;
    }
    if (name === 'href' && tag === 'a' && isSafeUrl(value, false)) continue;
    if (name === 'src' && tag === 'img' && isSafeUrl(value, true)) continue;
    if ((name === 'alt' || name === 'title') && !/^on/i.test(name)) continue;
    if (name === 'align' || name === 'valign' || name === 'width' || name === 'height' || name === 'colspan' || name === 'rowspan') continue;
    // Todo lo demás fuera: `on*`, `class`, `id`, `srcset`, `formaction`, `data-*`…
    node.removeAttribute(attr.name);
  }
  if (tag === 'a') {
    node.setAttribute('rel', 'noopener noreferrer');
    node.setAttribute('target', '_blank');
  }
}

/**
 * Degradación sin `DOMParser`: texto escapado, sin nada de marcado.
 *
 * Es lo que se pinta en el render de SERVIDOR, y `BlockPreview` la usa también
 * en su PRIMERA pasada de cliente para que el HTML hidratado coincida byte a
 * byte con el del servidor (tester r3, riesgo #2). Por eso es pública: las dos
 * pasadas tienen que llamar a la MISMA función, no a dos copias parecidas.
 */
export function previewTextFallback(html: string): string {
  if (!html) return '';
  return escapeHtmlText(html.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

/**
 * Devuelve HTML seguro para `dangerouslySetInnerHTML` dentro del origen de la
 * app. Fuera del navegador devuelve el texto escapado (sin marcado).
 */
export function sanitizePreviewHtml(html: string): string {
  if (!html) return '';
  if (typeof window === 'undefined' || typeof window.DOMParser === 'undefined') {
    return previewTextFallback(html);
  }
  const doc = new window.DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  for (const child of Array.from(doc.body.children)) clean(child, doc);
  return doc.body.innerHTML;
}
