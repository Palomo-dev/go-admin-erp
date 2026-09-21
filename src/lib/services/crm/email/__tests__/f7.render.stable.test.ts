/// <reference types="jest" />
/**
 * F7 · Consolidación de las rondas (2026-09-21) — variables, schema de bloques
 * y render de bloques (escapado del texto LITERAL de las props, acotado de
 * numéricos, fuente por allow-list).
 *
 * Casos únicos rescatados de: tester r1 (`adversarial.test.ts`), tester r2
 * (`adversarialR2.test.ts`), builder r3 (`roundThree.test.ts`). Los manejadores
 * `on*` se cuentan con un PARSER real (htmlparser2), no con una regex:
 * `alt="ACME&quot; onerror=…"` contiene la subcadena `onerror=` pero es UN solo
 * atributo inerte y una regex lo daría por vulnerable (falso positivo).
 * Lo que ya afirmaban `variables.test.ts` y `render.test.ts` se descartó.
 */

import { Parser } from 'htmlparser2';
import { renderVariables, sampleContext, type RenderContext } from '../variables';
import { parseBlockDocument, safeParseBlockDocument, BLOCK_TYPES, createBlock, type BlockDocument } from '../blocks';
import { renderBlockDocument } from '../renderBlocks';

const ctx = (over: Partial<RenderContext> = {}) => sampleContext(over);

/** Atributos `on*` REALES (según el parser), etiquetas y atributos por etiqueta. */
function parseHtml(html: string): { handlers: string[]; tags: string[]; attrs: Record<string, Record<string, string>> } {
  const handlers: string[] = [];
  const tags: string[] = [];
  const attrs: Record<string, Record<string, string>> = {};
  let i = 0;
  const p = new Parser({
    onopentag(name, a) {
      tags.push(name);
      attrs[`${name}#${i++}`] = a;
      for (const k of Object.keys(a)) if (/^on/i.test(k)) handlers.push(`${name}[${k}=${a[k]}]`);
    },
  }, { decodeEntities: true });
  p.end(html);
  return { handlers, tags, attrs };
}

// ─── Variables: casos que variables.test.ts no afirma (tester r1 / r2) ──────────

describe('renderVariables · bordes', () => {
  it('T1 · date:short de una columna DATE no se desplaza un día por la zona horaria', () => {
    expect(renderVariables('{{quote.valid_until|date:short}}', ctx()).out).toBe('15/10/2026');
    expect(renderVariables('{{opportunity.expected_close_date|date:short}}', ctx()).out).toBe('01/10/2026');
  });

  it('T1 · escapa también el fallback literal {{x|<img …>}}', () => {
    expect(renderVariables('{{custom.nope|<img src=x onerror=alert(1)>}}', ctx()).out).not.toContain('<img');
  });

  it('T1 · una expresión con ruta inválida se deja literal y {{{raw}}} se reporta como raw:<path>', () => {
    expect(renderVariables('{{ 1 + 1 }}', ctx()).out).toBe('{{ 1 + 1 }}');
    const r = renderVariables('a{{{custom.summary}}}b', ctx());
    expect(r.out).toBe('ab');
    expect(r.missing).toContain('raw:custom.summary');
  });

  it('T2 · escapeLiteral escapa el texto LITERAL; sin la opción sigue siendo texto plano (asunto)', () => {
    expect(renderVariables('ACME" onerror="alert(1)', ctx(), { escapeHtml: true }).out).toBe('ACME" onerror="alert(1)');
    expect(renderVariables('ACME" onerror="alert(1)', ctx(), { escapeHtml: true, escapeLiteral: true }).out).toBe('ACME&quot; onerror=&quot;alert(1)');
  });
});

// ─── Schema de bloques (tester r1 · CORREGIDO r2) ───────────────────────────────

describe('blocks · schema', () => {
  it('T3 · BLOCK_TYPES tiene exactamente 13 tipos y todos se crean; se rechazan tipo desconocido, >60 bloques y href no permitido', () => {
    expect(BLOCK_TYPES).toHaveLength(13);
    for (const t of BLOCK_TYPES) expect(() => createBlock(t)).not.toThrow();
    expect(safeParseBlockDocument({ blocks: [{ id: 'x', type: 'evil', props: {} }] }).ok).toBe(false);
    expect(safeParseBlockDocument({ blocks: Array.from({ length: 61 }, (_, i) => ({ id: `b${i}`, type: 'divider', props: {} })) }).ok).toBe(false);
    expect(safeParseBlockDocument({ blocks: [{ id: 'b', type: 'button', props: { href: 'javascript:alert(1)' } }] }).ok).toBe(false);
  });

  it('T3 · settings.font fuera de la allow-list se normaliza al stack por defecto y no rompe el atributo style', () => {
    const doc = parseBlockDocument({ version: 1, settings: { font: 'Arial" onmouseover="alert(1)' }, blocks: [{ id: 'b1', type: 'text', props: { html: '<p>x</p>' } }] });
    expect(doc.settings.font).toBe('Inter, Arial, sans-serif');
    const r = renderBlockDocument(doc, ctx());
    expect(r.html).not.toContain('onmouseover');
    expect(r.html).toContain('font-family:Inter, Arial, sans-serif');
  });

  it('T3 · una fuente legítima (comillas simples) sí se conserva', () => {
    expect(parseBlockDocument({ version: 1, settings: { font: "'Helvetica Neue', Arial, sans-serif" }, blocks: [] }).settings.font).toBe("'Helvetica Neue', Arial, sans-serif");
  });

  it('T3 · el render revalida font/bg aunque el documento venga construido a mano', () => {
    const doc = parseBlockDocument({ version: 1, settings: {}, blocks: [{ id: 'b1', type: 'text', props: { html: '<p>x</p>' } }] });
    const forged = { ...doc, settings: { ...doc.settings, font: 'x";onload="y', bg: 'red";onload="y' } };
    const r = renderBlockDocument(forged as typeof doc, ctx());
    expect(r.html).not.toContain('onload');
    expect(r.html).toContain('background:#f4f5f7');
  });

  it('T3 · un javascript: dentro del HTML de un bloque `text` (por variable) se neutraliza', () => {
    const doc = parseBlockDocument({ version: 1, settings: {}, blocks: [{ id: 't', type: 'text', props: { html: '<p><a href="{{custom.link}}">x</a></p>' } }] });
    const r = renderBlockDocument(doc, ctx({ custom: { link: 'javascript:alert(1)' } }));
    expect(r.html).not.toContain('javascript:');
    expect(r.html).toContain('href="#"');
  });

  it('T3 · quote_summary no contamina `used` con la variable interna custom.__amt y formatea con la moneda', () => {
    const r = renderBlockDocument(parseBlockDocument({ version: 1, settings: {}, blocks: [{ id: 'q', type: 'quote_summary', props: {} }] }), ctx());
    expect(r.used).not.toContain('custom.__amt');
    expect(r.used).toContain('quote.number');
    expect(r.html).toMatch(/1\.200\.000/);
  });
});

// ─── Texto LITERAL de las props (builder r3 #1, con los vectores del tester r2) ──

const ctxMin = (): RenderContext => ({ org: { name: 'Org' }, contact: {}, custom: {}, user: null, quote: null }) as unknown as RenderContext;

/** Documento con los vectores EXACTOS que el tester r2 usó para encontrar 7 `on*` reales. */
function docConVectores(): BlockDocument {
  return {
    version: 1,
    settings: { width: 600, bg: '#ffffff', font: 'Inter, Arial, sans-serif', brand: { primary_color: '#2563eb', logo_url: '' } },
    blocks: [
      { id: 'h', type: 'header', props: { logo_url: 'https://x.co/l.png', alt: 'ACME" onerror="alert(document.domain)', height: 40, align: 'left' } },
      { id: 'i', type: 'image', props: { src: 'https://x.co/i.png', alt: 'IMG" onerror="alert(2)', align: 'center' } },
      { id: 'p', type: 'product_card', props: { name: 'PROD" onerror="alert(3)', description: '<img src=x onerror=alert(31)>', price: '$1', image_url: 'https://x.co/p.png', href: 'https://x.co', cta: 'Ver' } },
      { id: 'b', type: 'button', props: { label: '<img src=x onerror=alert(4)>', href: 'https://x.co', style: 'primary', align: 'center' } },
      { id: 'f', type: 'footer_legal', props: { company: '<img src=x onerror=alert(5)>', address: '<svg onload=alert(6)>', text: '', unsubscribe: false, unsubscribe_label: 'Baja' } },
      { id: 'c', type: 'columns', props: { columns: [{ title: '<img src=x onerror=alert(7)>', html: '<p>ok</p>' }] } },
      { id: 'q', type: 'quote_summary', props: { title: '<img src=x onerror=alert(8)>', show_items: false, cta_label: '', cta_href: '' } },
      { id: 't', type: 'text', props: { html: '<p>hola</p>', font_size: 1e21, color: '#111111', align: 'left' } },
    ],
  } as unknown as BlockDocument;
}

describe('renderBlockDocument · el texto literal de las props se escapa (B3.1)', () => {
  it('B3.1 · CERO manejadores on* reales (parser) donde el tester r2 encontró 7', () => {
    expect(parseHtml(renderBlockDocument(docConVectores(), ctxMin()).html).handlers).toEqual([]);
  });

  it('B3.1 · CERO etiquetas inyectadas desde props de texto: solo las 3 <img> legítimas, sin svg ni script', () => {
    const { tags } = parseHtml(renderBlockDocument(docConVectores(), ctxMin()).html);
    expect(tags).not.toContain('svg');
    expect(tags).not.toContain('script');
    expect(tags.filter((t) => t === 'img')).toHaveLength(3);
  });

  it('B3.1 · el atributo alt conserva el texto como VALOR (parser) y el label sale como entidades', () => {
    const html = renderBlockDocument(docConVectores(), ctxMin()).html;
    const alts = Object.values(parseHtml(html).attrs).filter((a) => typeof a.alt === 'string').map((a) => a.alt);
    expect(alts).toContain('ACME" onerror="alert(document.domain)');
    expect(alts).toContain('IMG" onerror="alert(2)');
    expect(html).toContain('&lt;img src=x onerror=alert(4)&gt;');
    expect(html).toContain('&lt;img src=x onerror=alert(5)&gt;');
  });

  it('T2 · footer_legal sin dirección en el contexto: company escapado y sin separador « · » (address vacía)', () => {
    const doc = parseBlockDocument({ version: 1, settings: {}, blocks: [{ id: 'f', type: 'footer_legal', props: { company: '<img src=x onerror=alert(5)>' } }] });
    const r = renderBlockDocument(doc, ctxMin());
    expect(r.html).toContain('&lt;img src=x onerror=alert(5)&gt;');
    expect(r.html).not.toContain(' · ');
    expect(r.missing).toContain('org.address');
  });

  it('B3.1 · CONTRASTE: una variable sigue escapándose UNA sola vez (sin doble escapado)', () => {
    const doc = { ...docConVectores(), blocks: [{ id: 'b', type: 'button', props: { label: '{{org.name}}', href: 'https://x.co', style: 'primary', align: 'center' } }] } as unknown as BlockDocument;
    const html = renderBlockDocument(doc, { ...ctxMin(), org: { name: 'A & B <hola>' } } as RenderContext).html;
    expect(html).toContain('A &amp; B &lt;hola&gt;');
    expect(html).not.toContain('&amp;amp;');
  });
});

// ─── Numéricos acotados en el render (builder r3 #6 · tester r2) ────────────────

describe('renderBlockDocument · numéricos acotados', () => {
  it('B3.6 · text.font_size=1e21 en un documento a mano no mete notación exponencial: clamp a 32px', () => {
    const html = renderBlockDocument(docConVectores(), ctxMin()).html;
    expect(html).not.toMatch(/font-size:\s*1e\+?21/);
    expect(html).toContain('font-size:32px');
  });

  it('T2 · spacer/divider/width también se acotan (Infinity y 1e9)', () => {
    const doc = parseBlockDocument({ version: 1, settings: {}, blocks: [{ id: 's', type: 'spacer', props: {} }, { id: 'd', type: 'divider', props: {} }] });
    const forged = {
      ...doc,
      settings: { ...doc.settings, width: 1e9 },
      blocks: [{ ...doc.blocks[0], props: { height: Infinity } }, { ...doc.blocks[1], props: { color: '#e5e7eb', thickness: 1e9 } }],
    };
    const html = renderBlockDocument(forged as typeof doc, ctx()).html;
    expect(html).toContain('border-top:8px');
    expect(html).toContain('width:800px');
    expect(html).not.toMatch(/height:\s*Infinity/);
  });
});
