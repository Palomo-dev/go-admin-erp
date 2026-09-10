/// <reference types="jest" />
/**
 * F7 · Ronda 3 — tests EJECUTABLES de los fallos nuevos del informe TEST-F7-r2.
 *
 *  #1 (ALTO)  el texto LITERAL de las props de bloque no se escapaba → 7 `on*`
 *             reales en el HTML del correo. Aquí se cuentan con un PARSER real
 *             (htmlparser2), no con una regex: `alt="ACME&quot; onerror=…"`
 *             contiene la subcadena `onerror=` pero es UN solo atributo inerte,
 *             y una regex lo daría por vulnerable (falso positivo).
 *  #2 (ALTO)  `BlockPreview` inyectaba `blocks_json` crudo en el DOM de la app.
 *             La parte pura de `previewSanitize` se prueba aquí; el camino
 *             completo con `DOMParser` se verificó en un navegador real
 *             (ver F7-r3.md: 16/16 vectores, 0 `alert()`), porque este proyecto
 *             no tiene `jsdom` y `testEnvironment` es `node`.
 *  #3 (MEDIO) el lote no aislaba fallos entre grupos de remitente.
 *  #4 (MEDIO) activar el cifrado destruía en silencio las credenciales.
 *  #8 (BAJO)  los `id` de ruta no se validaban como uuid.
 *
 * Ninguno toca la BD real ni la red.
 */

import { Parser } from 'htmlparser2';
import { renderBlockDocument } from '../renderBlocks';
import type { BlockDocument } from '../blocks';
import type { RenderContext } from '../variables';
import { sendPendingBatch } from '../batchService';
import { decryptSecretDetailed, encryptSecret, listDomainKeyStates, __setDomainStoreClient } from '../domainStore';
import { parseWith, zUuid } from '../schemas';
import { escapeHtmlText, sanitizePreviewHtml } from '@/components/crm/email/editor/blocks/previewSanitize';
import type { EmailMessage } from '../types';
import { fakeSupabase } from './fakeSupabase';

// ─── utilidades ──────────────────────────────────────────────────────────────

/** Atributos `on*` REALES (según el parser) y etiquetas presentes en el HTML. */
function parseHtml(html: string): { handlers: string[]; tags: string[]; attrs: Record<string, Record<string, string>> } {
  const handlers: string[] = [];
  const tags: string[] = [];
  const attrs: Record<string, Record<string, string>> = {};
  let i = 0;
  const p = new Parser(
    {
      onopentag(name, a) {
        tags.push(name);
        attrs[`${name}#${i++}`] = a;
        for (const k of Object.keys(a)) if (/^on/i.test(k)) handlers.push(`${name}[${k}=${a[k]}]`);
      },
    },
    { decodeEntities: true },
  );
  p.end(html);
  return { handlers, tags, attrs };
}

const ctx = (): RenderContext =>
  ({ org: { name: 'Org' }, contact: {}, custom: {}, user: null, quote: null }) as unknown as RenderContext;

/** El documento con los vectores EXACTOS de `f7r2-tester-attrs.mts`. */
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

// ─── #1 · texto LITERAL de las props ─────────────────────────────────────────

describe('r2 #1 · el texto literal de las props de bloque se escapa', () => {
  it('CERO manejadores on* reales (parser) donde el tester encontró 7', () => {
    const { handlers } = parseHtml(renderBlockDocument(docConVectores(), ctx()).html);
    expect(handlers).toEqual([]);
  });

  it('CERO etiquetas inyectadas desde props de texto (img/svg/script de más)', () => {
    const { tags } = parseHtml(renderBlockDocument(docConVectores(), ctx()).html);
    expect(tags).not.toContain('svg');
    expect(tags).not.toContain('script');
    // Solo quedan las 3 <img> legítimas del documento (header, image, product_card).
    expect(tags.filter((t) => t === 'img')).toHaveLength(3);
  });

  it('el atributo alt conserva el texto como VALOR, no como marcado', () => {
    const { attrs } = parseHtml(renderBlockDocument(docConVectores(), ctx()).html);
    const alts = Object.values(attrs).filter((a) => typeof a.alt === 'string').map((a) => a.alt);
    expect(alts).toContain('ACME" onerror="alert(document.domain)');
    expect(alts).toContain('IMG" onerror="alert(2)');
  });

  it('CONTRASTE: una variable sigue escapándose UNA sola vez (sin doble escapado)', () => {
    const doc = {
      ...docConVectores(),
      blocks: [{ id: 'b', type: 'button', props: { label: '{{org.name}}', href: 'https://x.co', style: 'primary', align: 'center' } }],
    } as unknown as BlockDocument;
    const c = { ...ctx(), org: { name: 'A & B <hola>' } } as RenderContext;
    const html = renderBlockDocument(doc, c).html;
    expect(html).toContain('A &amp; B &lt;hola&gt;');
    expect(html).not.toContain('&amp;amp;');
  });
});

// ─── #6 · font_size acotado ──────────────────────────────────────────────────

describe('r2 #6 · text.font_size se acota como los demás numéricos', () => {
  it('un documento a mano ya no mete notación exponencial en font-size', () => {
    const html = renderBlockDocument(docConVectores(), ctx()).html;
    expect(html).not.toMatch(/font-size:\s*1e\+?21/);
    expect(html).toContain('font-size:32px'); // tope
  });
});

// ─── #2 · saneado del canvas del editor (parte pura) ─────────────────────────

describe('r2 #2 · sanitizePreviewHtml (parte comprobable sin DOM)', () => {
  it('fuera del navegador degrada a texto plano escapado, nunca a marcado', () => {
    // `testEnvironment: node` → no hay window.DOMParser: es la rama de degradación.
    const out = sanitizePreviewHtml('<img src=x onerror="alert(1)"><p>hola</p>');
    expect(out).not.toContain('<');
    expect(out).not.toMatch(/onerror\s*=\s*["']?alert/);
    expect(out).toContain('hola');
  });

  it('escapa las cinco entidades peligrosas', () => {
    expect(escapeHtmlText(`<>&"'`)).toBe('&lt;&gt;&amp;&quot;&#39;');
  });

  it('una cadena vacía no produce ruido', () => {
    expect(sanitizePreviewHtml('')).toBe('');
  });
});

// ─── #3 · aislamiento de fallos entre grupos del lote ────────────────────────

const resolveSenderMock = jest.fn();
const batchSendMock = jest.fn();
const markFailedMock = jest.fn(async () => undefined);
const mergeMetaMock = jest.fn(async () => undefined);

jest.mock('../domainsService', () => ({ resolveSender: (...a: unknown[]) => resolveSenderMock(...a) }));
jest.mock('../resendClient', () => ({
  getResendClient: () => ({ batch: { send: (...a: unknown[]) => batchSendMock(...a) } }),
  getResendRateLimiter: () => ({ wait: async () => undefined }),
}));
jest.mock('../sendService', () => ({
  buildResendPayload: (m: { id: string }) => ({ to: [`${m.id}@x.co`] }),
  canContact: async () => true,
}));
jest.mock('../messageStore', () => ({
  markFailed: (...a: unknown[]) => markFailedMock(...(a as [])),
  mergeMeta: (...a: unknown[]) => mergeMetaMock(...(a as [])),
}));

describe('r2 #3 · el lote aísla los fallos por grupo de remitente', () => {
  const rows = [
    { id: 'a', organization_id: 9, status: 'pending', provider_message_id: null, metadata: { email_domain_id: 'dom-a', kind: 'marketing' } },
    { id: 'b', organization_id: 9, status: 'pending', provider_message_id: null, metadata: { email_domain_id: 'dom-b', kind: 'marketing' } },
  ] as unknown as EmailMessage[];
  const svc = fakeSupabase((c) => (c.table === 'email_messages' ? { data: rows, error: null } : { data: null, error: null })).client;
  const sender = { from: 'a@crm.acme.co', fromEmail: 'a@crm.acme.co', replyToDomain: 'crm.acme.co', apiKey: 're_x', domainId: 'dom-a', mode: 'own', notice: null };

  beforeEach(() => {
    resolveSenderMock.mockReset();
    batchSendMock.mockReset();
    markFailedMock.mockClear();
    mergeMetaMock.mockClear();
  });

  it('los dos grupos bien → 2 batch.send y ambos enviados', async () => {
    resolveSenderMock.mockResolvedValue(sender);
    batchSendMock.mockImplementation(async () => ({ data: { data: [{ id: 'prov-1' }] }, error: null }));
    const r = await sendPendingBatch(9, ['a', 'b'], svc);
    expect(batchSendMock).toHaveBeenCalledTimes(2);
    expect(r.sent.sort()).toEqual(['a', 'b']);
    expect(r.failed).toEqual([]);
  });

  /**
   * Antes de la ronda 3 esto propagaba la excepción: el grupo A quedaba `sent`,
   * el grupo B no se intentaba y el `BatchResult` se perdía; el handler de jobs
   * lo convertía en `JobFatalError` y esos correos se quedaban en `pending`
   * para siempre.
   */
  it('si el 2.º grupo lanza: NO se propaga, el 1.º se envía y el 2.º queda reintentable', async () => {
    resolveSenderMock.mockImplementation(async (_org: number, o: { domainId: string | null }) => {
      if (o.domainId === 'dom-b') throw new Error('boom: fallo de BD en el 2.º grupo');
      return sender;
    });
    batchSendMock.mockImplementation(async () => ({ data: { data: [{ id: 'prov-1' }] }, error: null }));

    const r = await sendPendingBatch(9, ['a', 'b'], svc);

    expect(r.sent).toEqual(['a']);
    expect(r.failed).toEqual([{ email_message_id: 'b', error: expect.stringContaining('boom'), retryable: true }]);
    // La fila del grupo que falló NO se marca `failed`: sigue `pending` para el reintento.
    expect(markFailedMock).not.toHaveBeenCalled();
    expect(batchSendMock).toHaveBeenCalledTimes(1);
  });

  it('si el PRIMER grupo lanza, el segundo se intenta igual', async () => {
    resolveSenderMock.mockImplementation(async (_org: number, o: { domainId: string | null }) => {
      if (o.domainId === 'dom-a') throw new Error('boom A');
      return sender;
    });
    batchSendMock.mockImplementation(async () => ({ data: { data: [{ id: 'prov-2' }] }, error: null }));
    const r = await sendPendingBatch(9, ['a', 'b'], svc);
    expect(r.sent).toEqual(['b']);
    expect(r.failed.map((f) => f.email_message_id)).toEqual(['a']);
  });

  it('un error DEVUELTO por el proveedor sí marca las filas failed (no es reintentable solo)', async () => {
    resolveSenderMock.mockResolvedValue(sender);
    batchSendMock.mockImplementation(async () => ({ data: null, error: { message: 'rate limited' } }));
    const r = await sendPendingBatch(9, ['a', 'b'], svc);
    expect(r.sent).toEqual([]);
    expect(r.failed).toHaveLength(2);
    expect(r.failed.every((f) => f.retryable !== true)).toBe(true);
    expect(markFailedMock).toHaveBeenCalledTimes(2);
  });
});

// ─── #4 · el cifrado ya no destruye lo guardado y la UI no miente ────────────

describe('r2 #4 · llavero de credenciales', () => {
  const saved = { c: process.env.EMAIL_CREDENTIALS_SECRET, u: process.env.EMAIL_UNSUBSCRIBE_SECRET, s: process.env.SUPABASE_SERVICE_ROLE_KEY };
  const restore = (k: 'EMAIL_CREDENTIALS_SECRET' | 'EMAIL_UNSUBSCRIBE_SECRET' | 'SUPABASE_SERVICE_ROLE_KEY', v: string | undefined) => {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  };
  afterAll(() => {
    restore('EMAIL_CREDENTIALS_SECRET', saved.c);
    restore('EMAIL_UNSUBSCRIBE_SECRET', saved.u);
    restore('SUPABASE_SERVICE_ROLE_KEY', saved.s);
    __setDomainStoreClient(null);
  });

  it('rotar la service-role key (hoy el fallback activo) NO invalida lo cifrado con el secreto propio', () => {
    delete process.env.EMAIL_UNSUBSCRIBE_SECRET;
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-vieja';
    process.env.EMAIL_CREDENTIALS_SECRET = 'clave-principal-de-32-bytes-abcd';
    const guardado = encryptSecret('re_token_rot');
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-NUEVA-tras-rotar';
    expect(decryptSecretDetailed(guardado).plain).toBe('re_token_rot');
    expect(decryptSecretDetailed(guardado).needsRewrite).toBe(false);
  });

  it('perder TODAS las claves devuelve null (no un token falso) y marca el formato', () => {
    process.env.EMAIL_CREDENTIALS_SECRET = 'clave-que-luego-se-pierde-12345';
    delete process.env.EMAIL_UNSUBSCRIBE_SECRET;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const guardado = encryptSecret('re_token_perdido');
    process.env.EMAIL_CREDENTIALS_SECRET = 'una-clave-completamente-distinta';
    const err = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const r = decryptSecretDetailed(guardado);
    err.mockRestore();
    expect(r.plain).toBeNull();
    expect(r.format).toBe('encv2');
  });

  /** La UI decía `has_api_key: true` sobre una credencial inservible (C11). */
  it('listDomainKeyStates marca `unreadable` lo que ninguna clave descifra', async () => {
    process.env.EMAIL_CREDENTIALS_SECRET = 'clave-A-para-el-estado-de-la-ui';
    delete process.env.EMAIL_UNSUBSCRIBE_SECRET;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const legible = encryptSecret('re_legible');
    process.env.EMAIL_CREDENTIALS_SECRET = 'clave-B-distinta-de-la-anterior';
    const ilegible = encryptSecret('re_ilegible');
    process.env.EMAIL_CREDENTIALS_SECRET = 'clave-A-para-el-estado-de-la-ui';

    __setDomainStoreClient(
      fakeSupabase(() => ({
        data: { id: 'row-1', credentials: { RESEND_API_KEY_dom_ok: legible, RESEND_API_KEY_dom_ko: ilegible }, settings: {} },
        error: null,
      })).client,
    );
    const err = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const states = await listDomainKeyStates(9);
    err.mockRestore();
    __setDomainStoreClient(null);

    expect(states.get('dom_ok')).toBe('ok');
    expect(states.get('dom_ko')).toBe('unreadable');
  });
});

// ─── #8 · uuid en los `id` de ruta ───────────────────────────────────────────

describe('r2 #8 · los id de ruta se validan como uuid', () => {
  it('un id basura da 400 VALIDATION en vez de un 500 de Postgres', () => {
    expect(() => parseWith(zUuid, 'no-es-uuid', 'id')).toThrow(/VALIDATION|inválido|uuid/i);
    try {
      parseWith(zUuid, '../../etc/passwd', 'id');
      throw new Error('no lanzó');
    } catch (e) {
      expect((e as { status?: number }).status).toBe(400);
    }
  });

  it('un uuid válido pasa', () => {
    expect(parseWith(zUuid, '3f1c8c1e-0000-4000-8000-000000000001', 'id')).toBe('3f1c8c1e-0000-4000-8000-000000000001');
  });
});
