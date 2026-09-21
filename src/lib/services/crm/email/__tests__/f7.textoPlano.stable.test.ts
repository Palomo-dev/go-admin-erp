/// <reference types="jest" />
/**
 * F7 · Consolidación de las rondas (2026-09-21) — la salida en TEXTO PLANO del
 * correo, el PREHEADER, `decodeBasicEntities` y la parte pura de
 * `previewSanitize` (canvas del editor).
 *
 * Origen: builder r4 (`roundFour.test.ts`, fallo r3 #1) y builder r3
 * (`roundThree.test.ts`, r2 #2). El hueco real de la ronda 3 fue que ninguna
 * fixture llevaba `&`, comillas ni `<`, de modo que el escapado era una
 * operación nula; por eso aquí TODAS las props de texto llevan esos caracteres.
 * `render.test.ts` ya cubre el caso del botón con razón social; aquí va el
 * barrido por bloque, el preheader y la rama HTML crudo.
 */

import { Parser } from 'htmlparser2';
import { renderBlockDocument } from '../renderBlocks';
import { renderEmail } from '../render';
import { decodeBasicEntities, htmlToText } from '../sanitize';
import { parseBlockDocument, type BlockDocument } from '../blocks';
import type { RenderContext } from '../variables';
import { escapeHtmlText, previewTextFallback, sanitizePreviewHtml } from '@/components/crm/email/editor/blocks/previewSanitize';

/** Entidades HTML que NUNCA deben aparecer en una salida de texto plano. */
const ENTIDADES = /&(amp|quot|lt|gt|#39|nbsp);/;

function handlers(html: string): string[] {
  const found: string[] = [];
  const p = new Parser({ onopentag(name, a) { for (const k of Object.keys(a)) if (/^on/i.test(k)) found.push(`${name}[${k}]`); } }, { decodeEntities: true });
  p.end(html);
  return found;
}

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

// ─── 1 · la parte text/plain no lleva entidades (B4) ────────────────────────────

describe('B4 · la salida en TEXTO PLANO va sin escapar', () => {
  it('B4.1 · ni una sola entidad HTML en `text` y cada bloque con prop de texto libre sale legible', () => {
    const { text } = renderBlockDocument(docReal(), ctx());
    expect(text).not.toMatch(ENTIDADES);
    expect(text).toContain('Pérez & Asociados');                       // header (alt) y variable
    expect(text).toContain('Ver "oferta" & más: https://ok.example');  // button
    expect(text).toContain('Pérez & Asociados — Café & té');           // image (alt)
    expect(text).toContain('Pérez & Asociados - Café & té $1.000 & pico'); // product_card
    expect(text).toContain('Cotización "Pérez & Asociados": total');   // quote_summary
    expect(text).toContain('Pérez & Asociados Cra 1 #2-3 & 4 Aviso & legal'); // footer_legal
    expect(text).toContain('Pérez & Asociados: Uno & dos');            // columns (título interpolado)
    expect(text).toContain('https://ok.example/?a=1&b=2');             // social
    expect(text).not.toContain('{{org.name}}');                        // antes salía la plantilla cruda
  });

  it('B4.2 · LA OTRA SALIDA del mismo render sigue escapada e inerte (marcado)', () => {
    const r = renderBlockDocument(docReal(), ctx());
    expect(r.html).toContain('Pérez &amp; Asociados');
    expect(r.html).toContain('&quot;oferta&quot;');
    expect(r.html).not.toContain('&amp;amp;');
    expect(handlers(r.html)).toEqual([]);
  });

  it('B4.3 · un vector de inyección: inerte en el marcado, literal (no entidades) en el texto', () => {
    const doc = parseBlockDocument({ version: 1, settings: {}, blocks: [{ id: 'b', type: 'button', props: { label: '<img src=x onerror=alert(1)>', href: 'https://ok.example', style: 'primary', align: 'center' } }] });
    const r = renderBlockDocument(doc, ctx());
    expect(handlers(r.html)).toEqual([]);
    expect(r.html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(r.text).toContain('<img src=x onerror=alert(1)>');
    expect(r.text).not.toMatch(ENTIDADES);
  });

  it('B4.4 · el importe formateado no arrastra entidades al texto', () => {
    const doc = parseBlockDocument({ version: 1, settings: {}, blocks: [{ id: 'q', type: 'quote_summary', props: { title: 'T', show_items: false, cta_label: '', cta_href: 'https://ok.example' } }] });
    const r = renderBlockDocument(doc, ctx());
    expect(r.text).not.toMatch(ENTIDADES);
    expect(r.text).toMatch(/^T: total .*1\.000/);
  });
});

// ─── 2 · el preheader (la línea de la bandeja de entrada) ───────────────────────

describe('B4 · el preheader que se lee SIN abrir el correo', () => {
  it('B4.5 · derivado del texto: sin entidades y empezando por el nombre real', async () => {
    const r = await renderEmail({ blocks: docReal() }, { ctx: ctx(), subject: 'Hola' });
    expect(r.preheader).not.toMatch(ENTIDADES);
    expect(r.preheader.startsWith('Pérez & Asociados')).toBe(true);
    expect(r.text).not.toMatch(ENTIDADES);
  });

  it('B4.6 · explícito con variables: se devuelve en claro y se escapa SOLO al meterlo en el HTML', async () => {
    const r = await renderEmail({ blocks: docReal() }, { ctx: ctx(), subject: 'Asunto {{org.name}}', preheader: 'De {{org.name}} para ti' });
    expect(r.preheader).toBe('De Pérez & Asociados para ti');
    expect(r.subject).toBe('Asunto Pérez & Asociados');
    expect(r.html).toContain('De Pérez &amp; Asociados para ti');
    expect(r.html).not.toContain('&amp;amp;');
  });

  it('T4 · una plantilla (engine html) sin preheader propio lo deriva del texto', async () => {
    const t = { engine: 'html', body_html: '<p>Cuerpo de {{org.name}}</p>', blocks_json: null, subject: 'S {{org.name}}' } as never;
    const r = await renderEmail({ template: t }, { ctx: ctx() });
    expect(r.subject).toBe('S Pérez & Asociados');
    expect(r.preheader).toBe('Cuerpo de Pérez & Asociados');
  });

  it('B4.7 · la rama HTML crudo también deja el texto legible', async () => {
    const r = await renderEmail({ html: '<p>{{org.name}} &amp; socios</p>' }, { ctx: ctx() });
    expect(r.text).toBe('Pérez & Asociados & socios');
    expect(r.preheader).not.toMatch(ENTIDADES);
  });
});

// ─── 3 · decodificación de entidades en UNA pasada ─────────────────────────────

describe('decodeBasicEntities · sin doble decodificación (B4)', () => {
  it('B4.8 · `&amp;lt;` se queda en `&lt;` (encadenar replaces lo convertía en `<`)', () => {
    expect(decodeBasicEntities('&amp;lt;')).toBe('&lt;');
    expect(htmlToText('<p>a &amp;lt;b&amp;gt; c</p>')).toBe('a &lt;b&gt; c');
  });

  it('B4.9 · las seis entidades básicas se decodifican una vez; lo demás se conserva', () => {
    expect(decodeBasicEntities('&amp;&lt;&gt;&quot;&#39;&nbsp;x')).toBe('&<>"\' x');
    expect(decodeBasicEntities('&copy; &#8212;')).toBe('&copy; &#8212;');
  });
});

// ─── 4 · previewSanitize: parte pura (r2 #2 builder r3, riesgo r3 #2 builder r4) ─

describe('previewSanitize · sin DOM (testEnvironment node)', () => {
  it('B3.2 · fuera del navegador degrada a texto plano escapado, nunca a marcado', () => {
    const out = sanitizePreviewHtml('<img src=x onerror="alert(1)"><p>hola</p>');
    expect(out).not.toContain('<');
    expect(out).not.toMatch(/onerror\s*=\s*["']?alert/);
    expect(out).toContain('hola');
    expect(sanitizePreviewHtml('')).toBe('');
    expect(escapeHtmlText(`<>&"'`)).toBe('&lt;&gt;&amp;&quot;&#39;');
  });

  it('B4.10 · `sanitizePreviewHtml` devuelve EXACTAMENTE `previewTextFallback` (misma salida servidor / primera pasada cliente: sin desajuste de hidratación)', () => {
    for (const c of ['<p>hola <strong>mundo</strong></p>', '<img src=x onerror="alert(1)">', 'texto & más', '']) expect(sanitizePreviewHtml(c)).toBe(previewTextFallback(c));
    expect(previewTextFallback('<img src=x onerror="alert(1)"><p>hola</p>')).not.toContain('<');
  });
});
