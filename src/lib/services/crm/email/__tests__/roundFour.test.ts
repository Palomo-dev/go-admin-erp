/// <reference types="jest" />
/**
 * F7 · Ronda 4 — la salida en TEXTO PLANO del correo y el PREHEADER.
 *
 * Fallo r3 #1 (MEDIO, visible para el destinatario): el arreglo del escapado de
 * la ronda 3 se propagó a donde no debía. `renderBlock` reutilizaba la salida ya
 * escapada de `textProp` también como `text`, así que la parte `text/plain` del
 * correo y —peor— la línea de vista previa de la bandeja de entrada salían con
 * `&amp;` y `&quot;` en crudo para cualquier empresa llamada «X & Y».
 *
 * Sobre el hueco que lo permitió, con la causa raíz REAL (rectificado tras el
 * tester r4: la ronda 4 afirmó aquí dos cosas falsas y conviene no heredarlas).
 *   - NO es cierto que ninguna prueba mirase `text`: `render.test.ts`, de la
 *     ronda 1, ya asertaba sobre `r.text` —incluido el del bloque `button`, uno
 *     de los afectados— y sobre la derivación del preheader.
 *   - El hueco real era otro: NINGUNA fixture llevaba `&`, comillas ni `<`, así
 *     que el escapado era una operación nula y no había nada que observar. Lo
 *     que protege esta fase no es mirar `text`, es que las fixtures lleven
 *     caracteres que el escapado altere. Por eso `render.test.ts` tiene ahora un
 *     caso con la razón social `Pérez & "Asociados"` entrando por variable.
 *   - NO es cierto que los catorce casos crucen las dos salidas: lo hace UNO (el
 *     vector de inyección). Cuatro miran solo `text`, uno solo `html`, tres el
 *     preheader y cinco no renderizan un correo. El par marcado/texto del vector
 *     de inyección es el que fija la disciplina.
 *
 * `testEnvironment: node`, sin red, sin BD, sin correos.
 */

import { Parser } from 'htmlparser2';
import { renderBlockDocument } from '../renderBlocks';
import { renderEmail } from '../render';
import { decodeBasicEntities, htmlToText } from '../sanitize';
import { parseBlockDocument, type BlockDocument } from '../blocks';
import type { RenderContext } from '../variables';
import { previewTextFallback, sanitizePreviewHtml } from '@/components/crm/email/editor/blocks/previewSanitize';

// ─── utilidades ──────────────────────────────────────────────────────────────

/** Entidades HTML que NUNCA deben aparecer en una salida de texto plano. */
const ENTIDADES = /&(amp|quot|lt|gt|#39|nbsp);/;

function handlers(html: string): string[] {
  const found: string[] = [];
  const p = new Parser(
    { onopentag(name, a) { for (const k of Object.keys(a)) if (/^on/i.test(k)) found.push(`${name}[${k}]`); } },
    { decodeEntities: true },
  );
  p.end(html);
  return found;
}

/** Razón social con `&` y comillas: el caso más común del mundo real. */
const EMPRESA = 'Pérez & Asociados';

const ctx = (): RenderContext =>
  ({
    org: { name: EMPRESA, address: 'Cra 1 #2-3 & 4', currency: 'COP', timezone: 'America/Bogota' },
    contact: { first_name: 'Ana & Co' },
    custom: {},
    user: undefined,
    quote: { number: 'COT-1', total: 1000, currency: 'COP', items: [] },
  }) as unknown as RenderContext;

/** Documento válido (pasa por zod) con `&` y comillas en TODAS las props de texto. */
function docReal(): BlockDocument {
  return parseBlockDocument({
    version: 1,
    settings: { width: 600, bg: '#ffffff', font: 'Inter, Arial, sans-serif', brand: { logo_url: '', primary_color: '#2563eb' } },
    blocks: [
      { id: 'h', type: 'header', props: { logo_url: '', alt: '{{org.name}}', align: 'left', height: 40 } },
      { id: 'b', type: 'button', props: { label: 'Ver "oferta" & más', href: 'https://ok.example', style: 'primary', align: 'center' } },
      { id: 'i', type: 'image', props: { src: 'https://ok.example/i.png', alt: '{{org.name}} — Café & té', align: 'center' } },
      { id: 'c', type: 'columns', props: { columns: [{ title: '{{org.name}}', html: '<p>Uno &amp; dos</p>' }, { title: 'B & C', html: '<p>tres</p>' }] } },
      { id: 'p', type: 'product_card', props: { name: '{{org.name}}', description: 'Café & té', price: '$1.000 & pico', image_url: '', cta: 'Ver' } },
      { id: 'q', type: 'quote_summary', props: { title: 'Cotización "{{org.name}}"', show_items: false, cta_label: '', cta_href: 'https://ok.example' } },
      { id: 'f', type: 'footer_legal', props: { company: '{{org.name}}', address: '{{org.address}}', text: 'Aviso & legal', unsubscribe: false, unsubscribe_label: 'Baja' } },
      { id: 'v', type: 'variable', props: { path: 'org.name', fallback: '', filter: '' } },
      { id: 's', type: 'social', props: { links: [{ network: 'website', href: 'https://ok.example/?a=1&b=2' }], align: 'center' } },
    ],
  });
}

// ─── 1 · la parte text/plain no lleva entidades ──────────────────────────────

describe('r3 #1 · la salida en TEXTO PLANO va sin escapar', () => {
  it('ni una sola entidad HTML en `text`, con `&`, comillas y tildes', () => {
    const { text } = renderBlockDocument(docReal(), ctx());
    expect(text).not.toMatch(ENTIDADES);
  });

  it('cada bloque con prop de texto libre sale legible', () => {
    const { text } = renderBlockDocument(docReal(), ctx());
    expect(text).toContain('Pérez & Asociados');            // header (alt) y variable
    expect(text).toContain('Ver "oferta" & más: https://ok.example'); // button
    expect(text).toContain('Pérez & Asociados — Café & té'); // image (alt)
    expect(text).toContain('Pérez & Asociados - Café & té $1.000 & pico'); // product_card
    expect(text).toContain('Cotización "Pérez & Asociados": total'); // quote_summary
    expect(text).toContain('Pérez & Asociados Cra 1 #2-3 & 4 Aviso & legal'); // footer_legal
    expect(text).toContain('Pérez & Asociados: Uno & dos');   // columns (título interpolado)
    expect(text).toContain('https://ok.example/?a=1&b=2');    // social
  });

  it('el título de `columns` se INTERPOLA en texto (antes salía la plantilla cruda)', () => {
    const { text } = renderBlockDocument(docReal(), ctx());
    expect(text).not.toContain('{{org.name}}');
  });

  it('LA OTRA SALIDA del mismo render sigue escapada e inerte (marcado)', () => {
    const r = renderBlockDocument(docReal(), ctx());
    expect(r.html).toContain('Pérez &amp; Asociados');
    expect(r.html).toContain('&quot;oferta&quot;');
    expect(r.html).not.toContain('&amp;amp;'); // ni una sola vez de más
    expect(handlers(r.html)).toEqual([]);
  });

  it('un vector de inyección: inerte en el marcado, literal (no entidades) en el texto', () => {
    const doc = parseBlockDocument({
      version: 1,
      settings: {},
      blocks: [{ id: 'b', type: 'button', props: { label: '<img src=x onerror=alert(1)>', href: 'https://ok.example', style: 'primary', align: 'center' } }],
    });
    const r = renderBlockDocument(doc, ctx());
    // marcado: escapado, sin <img> ni manejadores
    expect(handlers(r.html)).toEqual([]);
    expect(r.html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    // texto plano: el literal tal cual (text/plain no interpreta marcado)
    expect(r.text).toContain('<img src=x onerror=alert(1)>');
    expect(r.text).not.toMatch(ENTIDADES);
  });

  it('el importe formateado no arrastra entidades al texto', () => {
    const doc = parseBlockDocument({
      version: 1,
      settings: {},
      blocks: [{ id: 'q', type: 'quote_summary', props: { title: 'T', show_items: false, cta_label: '', cta_href: 'https://ok.example' } }],
    });
    const r = renderBlockDocument(doc, ctx());
    expect(r.text).not.toMatch(ENTIDADES);
    expect(r.text).toMatch(/^T: total .*1\.000/);
  });
});

// ─── 2 · el preheader (la línea de la bandeja de entrada) ────────────────────

describe('r3 #1 · el preheader que se lee SIN abrir el correo', () => {
  it('derivado del texto: sin entidades y empezando por el nombre real', async () => {
    const r = await renderEmail({ blocks: docReal() }, { ctx: ctx(), subject: 'Hola' });
    expect(r.preheader).not.toMatch(ENTIDADES);
    expect(r.preheader.startsWith('Pérez & Asociados')).toBe(true);
    expect(r.text).not.toMatch(ENTIDADES);
  });

  it('explícito con variables: se devuelve en claro y se escapa SOLO al meterlo en el HTML', async () => {
    const r = await renderEmail(
      { blocks: docReal() },
      { ctx: ctx(), subject: 'Asunto {{org.name}}', preheader: 'De {{org.name}} para ti' },
    );
    expect(r.preheader).toBe('De Pérez & Asociados para ti');
    expect(r.subject).toBe('Asunto Pérez & Asociados');
    // En el marcado del correo sí va escapado (va dentro de un <div> oculto).
    expect(r.html).toContain('De Pérez &amp; Asociados para ti');
    expect(r.html).not.toContain('&amp;amp;');
  });

  it('la rama HTML crudo también deja el texto legible', async () => {
    const r = await renderEmail({ html: '<p>{{org.name}} &amp; socios</p>' }, { ctx: ctx() });
    expect(r.text).toBe('Pérez & Asociados & socios');
    expect(r.preheader).not.toMatch(ENTIDADES);
  });
});

// ─── 3 · decodificación de entidades en UNA pasada ───────────────────────────

describe('decodeBasicEntities · sin doble decodificación', () => {
  it('`&amp;lt;` se queda en `&lt;` (encadenar replaces lo convertía en `<`)', () => {
    expect(decodeBasicEntities('&amp;lt;')).toBe('&lt;');
    expect(htmlToText('<p>a &amp;lt;b&amp;gt; c</p>')).toBe('a &lt;b&gt; c');
  });

  it('las seis entidades básicas se decodifican una vez', () => {
    expect(decodeBasicEntities('&amp;&lt;&gt;&quot;&#39;&nbsp;x')).toBe('&<>"\' x');
  });

  it('lo que no está en la lista se conserva tal cual', () => {
    expect(decodeBasicEntities('&copy; &#8212;')).toBe('&copy; &#8212;');
  });
});

// ─── 4 · riesgo r3 #2: misma salida en servidor y en la primera pasada cliente ─

describe('r3 #2 · previewSanitize no puede desajustar la hidratación', () => {
  it('fuera del navegador `sanitizePreviewHtml` devuelve EXACTAMENTE `previewTextFallback`', () => {
    const casos = ['<p>hola <strong>mundo</strong></p>', '<img src=x onerror="alert(1)">', 'texto & más', ''];
    for (const c of casos) expect(sanitizePreviewHtml(c)).toBe(previewTextFallback(c));
  });

  it('la degradación nunca deja marcado', () => {
    expect(previewTextFallback('<img src=x onerror="alert(1)"><p>hola</p>')).not.toContain('<');
  });
});
