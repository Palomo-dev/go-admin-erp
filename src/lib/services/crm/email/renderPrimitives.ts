/**
 * Primitivas del render de bloques: interpolación de propiedades y saneado de
 * los valores que acaban dentro de `style="…"` o de una URL.
 *
 * Vive aparte de `renderBlocks.ts` por el tope de 300 líneas por módulo (regla 6
 * de `rules-implementacion.md`). `renderBlocks.ts` reexporta `safeUrl`,
 * `safeFont`, `safeColor` y `safeAlign` para no romper importaciones existentes.
 *
 * REGLA CENTRAL DE ESTE MÓDULO: cada propiedad de texto libre tiene DOS salidas
 * y nunca se reutiliza una en el sitio de la otra.
 *   · `textProp`  → marcado (`text/html`): escapa literal y valor.
 *   · `plainProp` → texto (`text/plain` y preheader): no escapa nada.
 */

import { DEFAULT_FONT, FONT_STACK_RE } from './blocks';
import { renderVariables, escapeHtml, type RenderContext } from './variables';
import { sanitizeFragment, enforceSafeUrlAttributes, decodeBasicEntities } from './sanitize';

/** Acumulador de variables usadas/faltantes de todo el documento. */
export interface Acc {
  missing: Set<string>;
  used: Set<string>;
}

function collect(acc: Acc, r: { missing: string[]; used: string[] }): void {
  r.missing.forEach((m) => acc.missing.add(m));
  r.used.forEach((u) => acc.used.add(u));
}

export function vars(input: string, ctx: RenderContext, acc: Acc, escape = true): string {
  const r = renderVariables(input, ctx, { escapeHtml: escape });
  collect(acc, r);
  return r.out;
}

/**
 * Propiedad de TEXTO libre que acaba dentro de un atributo (`alt="…"`) o como
 * contenido de una etiqueta (`label`, `company`, `title`…). Se escapa tanto el
 * valor de las variables como el texto literal de la propiedad.
 *
 * Tester r2 (fallo nuevo #1, ALTO): la ronda 2 solo escapaba el valor
 * sustituido, así que `alt: 'ACME" onerror="alert(1)'` cerraba el atributo y
 * `label: '<img src=x onerror=alert(1)>'` inyectaba una etiqueta entera en el
 * HTML que se envía y se guarda en `templates.body_html`.
 *
 * NO se usa para:
 *   - props `html` (`text`, `columns[].html`, `signature`) → `varsInHtml`
 *     (sanitize-html + allow-list de esquemas): ahí el marcado es intencional;
 *   - props de URL (`href`, `src`, `logo_url`, `image_url`) → `safeUrl`, que ya
 *     escapa el valor completo una sola vez (escapar antes lo haría dos veces);
 *   - la parte de texto plano del correo → `plainProp`.
 */
export function textProp(input: string, ctx: RenderContext, acc: Acc): string {
  const r = renderVariables(input, ctx, { escapeHtml: true, escapeLiteral: true });
  collect(acc, r);
  return r.out;
}

/**
 * La MISMA propiedad de texto libre, pero para la parte `text/plain` del correo
 * (y para el preheader, que se deriva de ella en `render.ts`). Ahí el HTML no se
 * interpreta: reutilizar la salida de `textProp` mostraba `&amp;` y `&quot;`
 * literales en el cliente de correo y, peor, en la línea de vista previa de la
 * bandeja de entrada (tester r3, fallo nuevo #1: una empresa llamada
 * `Pérez & Asociados` salía como `Pérez &amp; Asociados`).
 */
export function plainProp(input: string, ctx: RenderContext, acc: Acc): string {
  const r = renderVariables(input, ctx, { escapeHtml: false });
  collect(acc, r);
  return r.out;
}

/**
 * Interpola dentro de HTML ya sanitizado: los valores se escapan, el HTML se
 * conserva. `enforceSafeUrlAttributes` se aplica DESPUÉS de interpolar porque
 * un `javascript:` que entra por variable no lo ve el sanitizador (r1 #3).
 */
export function varsInHtml(html: string, ctx: RenderContext, acc: Acc): string {
  return enforceSafeUrlAttributes(vars(sanitizeFragment(html), ctx, acc, true));
}

/** Fragmento de HTML ya renderizado → su equivalente en texto plano. */
export function htmlFragmentToText(html: string): string {
  return decodeBasicEntities(
    html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
      .replace(/<[^>]+>/g, ''),
  )
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Allow-list de esquemas para cualquier URL que acabe en `href`/`src`.
 * `cid:` es necesario para imágenes en línea de correo; `data:` solo imagen.
 * Todo lo demás (`javascript:`, `vbscript:`, `file:`…) → `#`.
 */
export function safeUrl(u: string): string {
  const t = (u || '').trim();
  if (/^(https?:|mailto:|tel:|cid:)/i.test(t)) return escapeHtml(t);
  if (/^data:image\/(png|jpe?g|gif|webp|svg\+xml);/i.test(t)) return escapeHtml(t);
  return '#';
}

/**
 * Valores que se interpolan dentro de `style="…"`. Aunque el schema zod ya los
 * valida, aquí se vuelven a comprobar (defensa en profundidad: documentos
 * guardados antes del arreglo, o construidos a mano en un test/servicio).
 */
export function safeFont(font: string | undefined): string {
  return font && FONT_STACK_RE.test(font) ? font : DEFAULT_FONT;
}

const HEX_RE = /^#[0-9a-fA-F]{3,8}$/;
export function safeColor(color: string | undefined | null, fallback: string): string {
  return color && HEX_RE.test(color) ? color : fallback;
}

const ALIGNS = new Set(['left', 'center', 'right']);
export function safeAlign(align: string | undefined): string {
  return align && ALIGNS.has(align) ? align : 'left';
}
