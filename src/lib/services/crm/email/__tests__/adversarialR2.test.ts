/// <reference types="jest" />
/**
 * F7 · TESTER ronda 2 — hallazgos NUEVOS (no estaban en `TEST-F7-r1.md`).
 *
 * Convención heredada de `adversarial.test.ts`: los 8 tests que el tester dejó
 * marcados `[BUG r2]` documentaban el comportamiento DEFECTUOSO. En la ronda 3
 * se han INVERTIDO a `[CORREGIDO r3]` conservando exactamente el mismo
 * escenario (mismo documento de bloques, mismos payloads, mismos secretos):
 * solo cambia la aserción, que ahora exige el comportamiento correcto.
 *
 * Contexto: la ronda 2 declaró en `F7-r2.md` §2 un "barrido completo de campos
 * que acaban en atributos HTML … Textos (alt, label, company, network,
 * moneda…) ya pasaban por `escapeHtml`; se verificó uno por uno". No era
 * cierto: `renderVariables(..., {escapeHtml:true})` escapaba el VALOR de las
 * variables, nunca el texto LITERAL de la prop. La ronda 3 añade la opción
 * `escapeLiteral` y `renderBlocks.textProp` para cerrarlo.
 */

import { parseBlockDocument } from '../blocks';
import { renderBlockDocument } from '../renderBlocks';
import { renderVariables, type RenderContext } from '../variables';
import { groupBySender } from '../batchService';
import { encryptSecret, decryptSecret, decryptSecretDetailed } from '../domainStore';
import { registrableDomain } from '../domainRules';

const ctx = (over: Partial<RenderContext> = {}): RenderContext => ({
  contact: { first_name: 'Ana', email: 'ana@cliente.co' },
  org: { id: 9, name: 'ACME', currency: 'COP', timezone: 'America/Bogota' },
  custom: {},
  ...over,
});

describe('[CORREGIDO r3] el texto LITERAL de las props de bloque se escapa', () => {
  it('renderVariables escapa el literal con escapeLiteral (sin la opcion sigue siendo texto plano)', () => {
    const sinOpcion = renderVariables('ACME" onerror="alert(1)', ctx(), { escapeHtml: true });
    expect(sinOpcion.out).toBe('ACME" onerror="alert(1)'); // texto plano / asunto
    const r = renderVariables('ACME" onerror="alert(1)', ctx(), { escapeHtml: true, escapeLiteral: true });
    expect(r.out).toBe('ACME&quot; onerror=&quot;alert(1)');
  });

  it('header.alt ya no rompe el atributo alt="" ni inyecta un manejador onerror', () => {
    const doc = parseBlockDocument({
      version: 1,
      settings: {},
      blocks: [{ id: 'h', type: 'header', props: { logo_url: 'https://x.co/l.png', alt: 'ACME" onerror="alert(document.domain)' } }],
    });
    const html = renderBlockDocument(doc, ctx()).html;
    expect(html).not.toContain('onerror="alert(document.domain)"');
    expect(html).toContain('alt="ACME&quot; onerror=&quot;alert(document.domain)"');
  });

  it('image.alt y product_card.name ya no rompen el atributo', () => {
    const doc = parseBlockDocument({
      version: 1,
      settings: {},
      blocks: [
        { id: 'i', type: 'image', props: { src: 'https://x.co/i.png', alt: 'IMG" onerror="alert(2)' } },
        { id: 'p', type: 'product_card', props: { name: 'PROD" onerror="alert(3)', image_url: 'https://x.co/p.png' } },
      ],
    });
    const html = renderBlockDocument(doc, ctx()).html;
    expect(html).not.toContain('onerror="alert(2)"');
    expect(html).not.toContain('onerror="alert(3)"');
    expect(html).toContain('alt="IMG&quot; onerror=&quot;alert(2)"');
    expect(html).toContain('alt="PROD&quot; onerror=&quot;alert(3)"');
  });

  it('button.label y footer_legal.company ya no inyectan etiquetas completas', () => {
    const doc = parseBlockDocument({
      version: 1,
      settings: {},
      blocks: [
        { id: 'b', type: 'button', props: { label: '<img src=x onerror=alert(4)>', href: 'https://x.co' } },
        { id: 'f', type: 'footer_legal', props: { company: '<img src=x onerror=alert(5)>' } },
      ],
    });
    const html = renderBlockDocument(doc, ctx()).html;
    expect(html).not.toContain('<img src=x onerror=alert(4)>');
    expect(html).not.toContain('<img src=x onerror=alert(5)>');
    expect(html).toContain('&lt;img src=x onerror=alert(4)&gt;');
    expect(html).toContain('&lt;img src=x onerror=alert(5)&gt;');
  });

  it('CONTRASTE: por variable se sigue escapando UNA sola vez (sin doble escapado)', () => {
    const doc = parseBlockDocument({ version: 1, settings: {}, blocks: [{ id: 'b', type: 'button', props: { label: '{{custom.x}}', href: 'https://x.co' } }] });
    const html = renderBlockDocument(doc, ctx({ custom: { x: '<img src=x onerror=alert(6)>' } })).html;
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img src=x onerror=alert(6)&gt;');
  });
});

describe('[CORREGIDO r3] text.font_size se acota en el render', () => {
  it('un documento construido a mano ya no mete notación exponencial en font-size', () => {
    const doc = parseBlockDocument({ version: 1, settings: {}, blocks: [{ id: 't', type: 'text', props: { html: '<p>x</p>' } }] });
    const forged = { ...doc, blocks: [{ ...doc.blocks[0], props: { ...(doc.blocks[0] as { props: Record<string, unknown> }).props, font_size: 1e21 } }] };
    const html = renderBlockDocument(forged as typeof doc, ctx()).html;
    expect(html).not.toContain('font-size:1e+21px');
    expect(html).toContain('font-size:32px'); // clamp al máximo del schema
  });

  it('CONTRASTE: los demás numéricos sí se acotan (spacer, divider, width)', () => {
    const doc = parseBlockDocument({ version: 1, settings: {}, blocks: [{ id: 's', type: 'spacer', props: {} }, { id: 'd', type: 'divider', props: {} }] });
    const forged = {
      ...doc,
      settings: { ...doc.settings, width: 1e9 },
      blocks: [
        { ...doc.blocks[0], props: { height: Infinity } },
        { ...doc.blocks[1], props: { color: '#e5e7eb', thickness: 1e9 } },
      ],
    };
    const html = renderBlockDocument(forged as typeof doc, ctx()).html;
    expect(html).toContain('border-top:8px');
    expect(html).toContain('width:800px');
    expect(html).not.toMatch(/height:\s*Infinity/);
  });
});

describe('groupBySender (arreglo r1 #6) — lo que arregla y lo que introduce', () => {
  const mk = (id: string, dom: string | null, kind = 'marketing') =>
    ({ id, organization_id: 9, metadata: { email_domain_id: dom, kind } }) as never;

  it('agrupa correctamente por dominio y por kind', () => {
    const g = groupBySender([mk('a', 'dom-a'), mk('b', 'dom-b'), mk('c', 'dom-a'), mk('d', 'dom-a', 'sequence')]);
    expect(g.size).toBe(3);
    expect(g.get('dom-a::marketing')).toHaveLength(2);
  });

  /**
   * Ronda 2: `sendOneGroup` se llamaba en un `for…of` SIN try/catch, así que un
   * grupo que lanzaba dejaba al anterior ya enviado, al siguiente sin intentar
   * y perdía el `BatchResult` con la excepción; el handler de jobs convertía el
   * `EmailError` en `JobFatalError` (sin reintento) y esos correos se quedaban
   * en `pending` para siempre.
   *
   * Ronda 3: cada grupo va en su try/catch, el resultado parcial SIEMPRE se
   * devuelve y lo no enviado se marca `retryable` (la fila sigue `pending`); el
   * handler lanza `JobRetryableError` para que el job lo reintente.
   *
   * Ronda 4: aquí había además una comprobación por EXPRESIÓN REGULAR sobre el
   * código fuente de `batchService.ts`. Se ha BORRADO (tester r3, fallo #3): se
   * ponía roja con un simple renombrado de variable y no medía comportamiento.
   * El escenario se ejerce de verdad, ejecutando `sendPendingBatch`, en
   * `roundThree.test.ts` («r2 #3 · el lote aísla los fallos por grupo»).
   */
});

describe('[CORREGIDO r3] cifrado de credenciales: añadir el secreto ya no destruye lo guardado', () => {
  const saved = { c: process.env.EMAIL_CREDENTIALS_SECRET, u: process.env.EMAIL_UNSUBSCRIBE_SECRET };
  afterAll(() => {
    if (saved.c === undefined) delete process.env.EMAIL_CREDENTIALS_SECRET; else process.env.EMAIL_CREDENTIALS_SECRET = saved.c;
    if (saved.u === undefined) delete process.env.EMAIL_UNSUBSCRIBE_SECRET; else process.env.EMAIL_UNSUBSCRIBE_SECRET = saved.u;
  });

  it('el IV es distinto en cada cifrado y el round-trip funciona', () => {
    process.env.EMAIL_CREDENTIALS_SECRET = 'clave-de-test-de-32-bytes-abcdef';
    const a = encryptSecret('re_token_1');
    const b = encryptSecret('re_token_1');
    expect(a).not.toBe(b);
    // El formato pasó a `encv2:<kid>.<iv>.<tag>.<ct>` (ronda 3): el `kid` es
    // estable (identifica la clave) y el IV, que es el campo siguiente, no.
    expect(a.split(':')[1].split('.')[0]).toBe(b.split(':')[1].split('.')[0]); // kid
    expect(a.split(':')[1].split('.')[1]).not.toBe(b.split(':')[1].split('.')[1]); // iv
    expect(decryptSecret(a)).toBe('re_token_1');
  });

  it('añadir EMAIL_CREDENTIALS_SECRET DESPUÉS (el flujo que recomienda .env.example) NO invalida lo ya guardado', () => {
    delete process.env.EMAIL_CREDENTIALS_SECRET;
    process.env.EMAIL_UNSUBSCRIBE_SECRET = 'secreto-de-bajas-de-16-o-mas';
    const guardado = encryptSecret('re_token_2'); // cifrado con la clave DERIVADA
    process.env.EMAIL_CREDENTIALS_SECRET = 'clave-nueva-de-32-bytes-abcdefgh';
    // El fallback sigue en el entorno: se prueba también y la credencial se lee.
    expect(decryptSecret(guardado)).toBe('re_token_2');
    // Y queda marcada para re-cifrarla con la clave principal en la 1.ª lectura.
    expect(decryptSecretDetailed(guardado).needsRewrite).toBe(true);
  });

  it('un valor antiguo en claro se sigue leyendo (compatibilidad hacia atrás, correcto)', () => {
    expect(decryptSecret('re_en_claro_antiguo')).toBe('re_en_claro_antiguo');
  });
});

describe('registrableDomain (arreglo r1 #12)', () => {
  it('resuelve los sufijos de la lista', () => {
    expect(registrableDomain('crm.acme.com.co')).toBe('acme.com.co');
    expect(registrableDomain('mail.crm.acme.co.uk')).toBe('acme.co.uk');
    expect(registrableDomain('a.b.c.acme.com')).toBe('acme.com');
  });

  it('[CORREGIDO r3] resuelve también los sufijos que faltaban (com.pl, co.in, com.tr)', () => {
    expect(registrableDomain('crm.acme.com.pl')).toBe('acme.com.pl');
    expect(registrableDomain('crm.acme.co.in')).toBe('acme.co.in');
    expect(registrableDomain('crm.acme.com.tr')).toBe('acme.com.tr');
  });
});
