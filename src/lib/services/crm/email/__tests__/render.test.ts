/// <reference types="jest" />
/**
 * Render de bloques (13 tipos) y HTML crudo → HTML de email + texto.
 */
import { BLOCK_TYPES, createBlock, parseBlockDocument, type BlockDocumentInput } from '../blocks';
import { renderEmail } from '../render';
import { EmailError } from '../types';
import { sampleContext } from '../variables';
import { EMAIL_TEMPLATE_SEEDS } from '../seeds/emailTemplates';

const ctx = sampleContext();
const doc = (blocks: BlockDocumentInput['blocks']): BlockDocumentInput => ({ version: 1, settings: {}, blocks });

describe('renderEmail (bloques)', () => {
  it('renderiza cada tipo de bloque con props por defecto sin lanzar', async () => {
    for (const type of BLOCK_TYPES) {
      const block = createBlock(type);
      const r = await renderEmail({ blocks: doc([block]) }, { ctx: { ...ctx, unsubscribe_url: 'https://app/u/t' }, subject: 'Asunto {{contact.first_name}}', preheader: 'pre' });
      expect(r.subject).toBe('Asunto Carlos');
      expect(r.html).toMatch(/^<!DOCTYPE html>/);
      expect(r.html).toContain('<table role="presentation" width="600"');
      expect(r.html).not.toMatch(/<script/i);
    }
  });

  it('interpola y escapa dentro de text/button/header y produce texto plano', async () => {
    const evil = sampleContext({ contact: { first_name: '<b>X</b>', company_name: 'ACME' } });
    const r = await renderEmail({ blocks: doc([
      { id: 'h', type: 'header', props: { logo_url: '', alt: '{{org.name}}' } },
      { id: 't', type: 'text', props: { html: '<p>Hola <strong>{{contact.first_name}}</strong><script>x</script></p>' } },
      { id: 'b', type: 'button', props: { label: 'Ver {{contact.company_name}}', href: '{{opportunity.url}}' } },
    ]) }, { ctx: evil, subject: 'S' });
    expect(r.html).toContain('Hola <strong>&lt;b&gt;X&lt;/b&gt;</strong>');
    expect(r.html).not.toContain('<script');
    expect(r.html).toContain('href="https://app.goadmin.io/app/crm/oportunidades/demo"');
    expect(r.html).toContain('ACME S.A.S');
    expect(r.text).toContain('Hola <b>X</b>');
    expect(r.text).toContain('Ver ACME: https://app.goadmin.io/app/crm/oportunidades/demo');
  });

  // Blindaje pedido por el tester en la ronda 4. La regresión del texto plano
  // (entidades HTML visibles en el cuerpo y en la línea de vista previa de la
  // bandeja) pasó desapercibida no porque nadie mirase `text` —esta suite ya lo
  // hacía desde la ronda 1— sino porque **ninguna fixture llevaba un `&`, unas
  // comillas ni un `<`**, de modo que el escapado no cambiaba nada y no había
  // qué observar. Una razón social con ampersand y comillas convierte el
  // escapado en una operación con efecto, que es lo que de verdad protege.
  it('una razón social con & y comillas sale escapada en el marcado y limpia en el texto', async () => {
    const ctxAmp = sampleContext({ contact: { first_name: 'Ana', company_name: 'Pérez & "Asociados"' } });
    const r = await renderEmail({ blocks: doc([
      { id: 'b', type: 'button', props: { label: 'Ver {{contact.company_name}}', href: '{{opportunity.url}}' } },
    ]) }, { ctx: ctxAmp, subject: 'S' });
    // Marcado: escapado, y sin doble escapado.
    expect(r.html).toContain('Pérez &amp; &quot;Asociados&quot;');
    expect(r.html).not.toContain('&amp;amp;');
    // Texto plano y preheader: lo que el destinatario lee, sin entidades.
    expect(r.text).toContain('Ver Pérez & "Asociados"');
    expect(r.text).not.toMatch(/&(amp|quot|lt|gt|#\d+);/);
    expect(r.preheader).not.toMatch(/&(amp|quot|lt|gt|#\d+);/);
  });

  it('botón con href no permitido cae a # y product_card usa money', async () => {
    const r = await renderEmail({ blocks: doc([
      { id: 'b', type: 'button', props: { label: 'x', href: '{{custom.evil}}' } },
      { id: 'p', type: 'product_card', props: {} },
    ]) }, { ctx: sampleContext({ custom: { evil: 'javascript:alert(1)' } }), subject: 'S' });
    expect(r.html).toContain('href="#"');
    expect(r.html).not.toContain('javascript:');
    expect(r.html).toMatch(/1\.200\.000/);
    expect(r.html).toContain('Plan Pro Empresa');
  });

  it('quote_summary lista ítems y total; sin cotización reporta missing "quote"', async () => {
    const withQuote = await renderEmail({ blocks: doc([{ id: 'q', type: 'quote_summary', props: {} }]) }, { ctx, subject: 'S' });
    expect(withQuote.html).toContain('Cotización COT-0042');
    expect(withQuote.html).toContain('Plan Pro x 12 meses × 1');
    expect(withQuote.html).toContain('Total (COP)');
    const noQuote = await renderEmail({ blocks: doc([{ id: 'q', type: 'quote_summary', props: {} }]) }, { ctx: sampleContext({ quote: undefined }), subject: 'S' });
    expect(noQuote.missing).toContain('quote');
  });

  it('signature usa la firma del usuario, custom o automática', async () => {
    const auto = await renderEmail({ blocks: doc([{ id: 's', type: 'signature', props: {} }]) }, { ctx, subject: 'S' });
    expect(auto.html).toContain('<strong>Ana Gómez</strong>');
    expect(auto.html).toContain('Ejecutiva comercial');
    const custom = await renderEmail({ blocks: doc([{ id: 's', type: 'signature', props: { source: 'custom', html: '<p>Firma {{user.first_name}}</p>' } }]) }, { ctx, subject: 'S' });
    expect(custom.html).toContain('Firma Ana');
    const userSig = await renderEmail({ blocks: doc([{ id: 's', type: 'signature', props: {} }]) }, { ctx: sampleContext({ user: { ...ctx.user, signature_html: '<p>Mi firma</p>' } }), subject: 'S' });
    expect(userSig.html).toContain('Mi firma');
    const noUser = await renderEmail({ blocks: doc([{ id: 's', type: 'signature', props: {} }]) }, { ctx: sampleContext({ user: undefined }), subject: 'S' });
    expect(noUser.missing).toContain('user');
  });

  it('footer_legal con baja exige unsubscribe_url y añade el aviso de remitente', async () => {
    const missing = await renderEmail({ blocks: doc([{ id: 'f', type: 'footer_legal', props: { unsubscribe: true } }]) }, { ctx, subject: 'S' });
    expect(missing.missing).toContain('unsubscribe_url');
    const ok = await renderEmail({ blocks: doc([{ id: 'f', type: 'footer_legal', props: { unsubscribe: true, unsubscribe_label: 'Baja' } }]) }, { ctx: { ...ctx, unsubscribe_url: 'https://app/u/tok', sender_notice: 'Enviado vía GoAdmin' }, subject: 'S' });
    expect(ok.html).toContain('href="https://app/u/tok"');
    expect(ok.html).toContain('>Baja</a>');
    expect(ok.html).toContain('Enviado vía GoAdmin');
    expect(ok.missing).toEqual([]);
  });

  it('columns, social, variable, image (vacía → nada), divider, spacer', async () => {
    const r = await renderEmail({ blocks: doc([
      { id: 'c', type: 'columns', props: { columns: [{ title: 'A', html: '<p>{{user.email}}</p>' }, { title: 'B', html: '<p>b</p>' }, { title: 'C', html: '<p>c</p>' }] } },
      { id: 'so', type: 'social', props: { links: [{ network: 'linkedin', href: 'https://li.com/x' }] } },
      { id: 'v', type: 'variable', props: { path: 'opportunity.amount', filter: 'money' } },
      { id: 'i', type: 'image', props: { src: '' } },
      { id: 'd', type: 'divider', props: { color: '#ff0000', thickness: 2 } },
      { id: 'sp', type: 'spacer', props: { height: 40 } },
    ]) }, { ctx, subject: 'S' });
    expect(r.html).toContain('width="33%"');
    expect(r.html).toContain('ana@acme.co');
    expect(r.html).toContain('href="https://li.com/x"');
    expect(r.html).toMatch(/1\.200\.000/);
    expect(r.html).not.toContain('<img');
    expect(r.html).toContain('border-top:2px solid #ff0000');
    expect(r.html).toContain('height:40px');
  });

  it('preheader oculto; si no hay, usa los primeros 80 caracteres del texto', async () => {
    const withPre = await renderEmail({ blocks: doc([{ id: 't', type: 'text', props: { html: '<p>Cuerpo</p>' } }]) }, { ctx, subject: 'S', preheader: 'Hola {{contact.first_name}}' });
    expect(withPre.preheader).toBe('Hola Carlos');
    expect(withPre.html).toContain('display:none;max-height:0');
    const noPre = await renderEmail({ blocks: doc([{ id: 't', type: 'text', props: { html: '<p>Cuerpo del correo</p>' } }]) }, { ctx, subject: 'S' });
    expect(noPre.preheader).toBe('Cuerpo del correo');
  });

  it('documento inválido → EmailError INVALID_BLOCKS 422', async () => {
    await expect(renderEmail({ blocks: { version: 1, blocks: [{ id: 'x', type: 'nope', props: {} }] } }, { ctx, subject: 'S' })).rejects.toMatchObject({ code: 'INVALID_BLOCKS', status: 422 });
    await expect(renderEmail({ blocks: doc([{ id: 'b', type: 'button', props: { href: 'ftp://x' } }]) }, { ctx, subject: 'S' })).rejects.toBeInstanceOf(EmailError);
  });

  it('las 6 plantillas semilla renderizan con el contexto de ejemplo', async () => {
    expect(EMAIL_TEMPLATE_SEEDS).toHaveLength(6);
    for (const s of EMAIL_TEMPLATE_SEEDS) {
      const parsed = parseBlockDocument(s.blocks);
      const r = await renderEmail({ blocks: parsed }, { ctx: { ...ctx, unsubscribe_url: 'https://app/u/t' }, subject: s.subject, preheader: s.preheader });
      expect(r.subject.length).toBeGreaterThan(3);
      expect(r.html).toContain('ACME S.A.S');
      expect(r.missing.filter((m) => !m.startsWith('custom.'))).toEqual([]);
    }
  });
});

describe('renderEmail (html crudo y plantilla)', () => {
  it('sanitiza, interpola con escape y añade shell si falta <html>', async () => {
    const r = await renderEmail({ html: '<p onclick="x">Hola {{contact.first_name}}</p><script>1</script>' }, { ctx: sampleContext({ contact: { first_name: '<i>' } }), subject: 'Asunto' });
    expect(r.html).toMatch(/^<!DOCTYPE html>/);
    expect(r.html).toContain('<p>Hola &lt;i&gt;</p>');
    expect(r.html).not.toContain('<script');
    expect(r.text).toContain('Hola <i>');
  });

  it('respeta un documento HTML completo y usa `text` si se pasa', async () => {
    const r = await renderEmail({ html: '<html><body><p>{{org.name}}</p></body></html>', text: 'Texto {{org.name}}' }, { ctx, subject: 'S' });
    expect(r.html.match(/<html/g)).toHaveLength(1);
    expect(r.text).toBe('Texto ACME S.A.S');
  });

  it('plantilla engine html usa subject/preheader propios y engine react se rechaza', async () => {
    const base = { id: 't1', organization_id: 1, name: 'T', channel: 'email' as const, kind: 'transactional' as const, subject: 'Hola {{contact.first_name}}', preheader: 'P', description: null, body_html: '<p>{{org.name}}</p>', blocks_json: null, variables: [], is_active: true, version: 1, created_by: null, metadata: {}, created_at: '', updated_at: '' };
    const r = await renderEmail({ template: { ...base, engine: 'html' } }, { ctx });
    expect(r.subject).toBe('Hola Carlos');
    expect(r.html).toContain('ACME S.A.S');
    await expect(renderEmail({ template: { ...base, engine: 'react' } }, { ctx })).rejects.toMatchObject({ code: 'UNSUPPORTED_ENGINE' });
    await expect(renderEmail({ template: { ...base, engine: 'blocks', blocks_json: null } }, { ctx })).rejects.toMatchObject({ code: 'INVALID_BLOCKS' });
  });
});
