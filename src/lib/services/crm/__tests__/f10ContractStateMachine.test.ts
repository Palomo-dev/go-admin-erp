/// <reference types="jest" />
/**
 * F10 — máquina de estados de `contract_signatures` y verificación de la firma
 * del webhook de Documenso (fallo cerrado: sin secreto o sin cabecera → rechazo).
 */
import { createHmac } from 'crypto';
import {
  canTransition,
  mapProviderEvent,
  applyWebhookEvent,
  mergeSigners,
  verifyDocumensoSignature,
  parseDocumensoPayload,
} from '@/lib/services/crm/contractStateMachine';

describe('F10 contractStateMachine — transiciones', () => {
  it.each([
    ['pending', 'sent', true],
    ['sent', 'viewed', true],
    ['sent', 'signed', true],
    ['viewed', 'signed', true],
    ['viewed', 'declined', true],
    ['sent', 'expired', true],
    ['signed', 'viewed', false], // firmado es terminal
    ['signed', 'declined', false],
    ['declined', 'signed', false],
    ['expired', 'signed', false],
    ['pending', 'signed', false], // no se firma lo que nunca se envió
    ['sent', 'sent', false],
  ])('%s → %s = %s', (from, to, expected) => {
    expect(canTransition(from as never, to as never)).toBe(expected);
  });

  it('estados desconocidos nunca transicionan', () => {
    expect(canTransition('sent' as never, 'hacked' as never)).toBe(false);
    expect(canTransition('nada' as never, 'signed' as never)).toBe(false);
  });
});

describe('F10 contractStateMachine — mapProviderEvent', () => {
  it.each([
    ['document.sent', 'sent'],
    ['document.opened', 'viewed'],
    ['document.viewed', 'viewed'],
    ['document.signed', 'signed'],
    ['document.completed', 'signed'],
    ['document.rejected', 'declined'],
    ['document.declined', 'declined'],
    ['document.expired', 'expired'],
    ['document.cancelled', 'declined'],
  ])('%s → %s', (event, status) => {
    expect(mapProviderEvent(event)).toBe(status);
  });

  it('eventos desconocidos → null (no se acepta `status` libre del payload)', () => {
    expect(mapProviderEvent('document.whatever')).toBeNull();
    expect(mapProviderEvent('')).toBeNull();
  });
});

describe('F10 contractStateMachine — applyWebhookEvent', () => {
  const row = { id: 'c1', status: 'sent' as const, signers: [{ name: 'Ana', email: 'ana@x.co' }], quotation_id: 'q1' };
  const now = '2026-09-15T10:00:00.000Z';

  it('firmado: cambia estado, fija signed_at, guarda el PDF y pide vincular la cotización', () => {
    const r = applyWebhookEvent(row, { event: 'document.completed', document_id: 'd1', signed_pdf_url: 'https://cdn/x.pdf' }, now);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.update).toMatchObject({ status: 'signed', signed_at: now, signed_pdf_path: 'https://cdn/x.pdf' });
      expect(r.linkQuotation).toBe(true);
    }
  });

  it('transición inválida (signed → viewed) → ok:false y ninguna escritura', () => {
    const r = applyWebhookEvent({ ...row, status: 'signed' }, { event: 'document.viewed', document_id: 'd1' }, now);
    expect(r).toEqual({ ok: false, reason: expect.stringMatching(/signed.*viewed|transici/i) });
  });

  it('evento desconocido → ok:false (no se toma `status` del payload)', () => {
    const r = applyWebhookEvent(row, { event: 'document.other', document_id: 'd1', status: 'signed' }, now);
    expect(r.ok).toBe(false);
  });

  it('un PDF que no sea https se ignora', () => {
    const r = applyWebhookEvent(row, { event: 'document.completed', document_id: 'd1', signed_pdf_url: 'javascript:alert(1)' }, now);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.update.signed_pdf_path).toBeUndefined();
  });

  it('mergeSigners actualiza por email (case-insensitive) sin inventar firmantes', () => {
    const merged = mergeSigners(
      [{ name: 'Ana', email: 'ana@x.co' }, { name: 'Beto', email: 'beto@x.co' }],
      [{ email: 'ANA@x.co', status: 'signed', signed_at: now }, { email: 'intruso@x.co', status: 'signed' }],
    );
    expect(merged).toHaveLength(2);
    expect(merged[0]).toMatchObject({ email: 'ana@x.co', status: 'signed', signed_at: now });
    expect(merged[1]).toMatchObject({ email: 'beto@x.co' });
  });
});

describe('F10 contractStateMachine — verifyDocumensoSignature (fallo cerrado)', () => {
  const secret = 'whsec_test_secret_0123456789';
  const body = JSON.stringify({ event: 'document.completed', payload: { id: 42 } });
  const hmac = createHmac('sha256', secret).update(body).digest('hex');

  it('acepta la firma HMAC-SHA256 hex del cuerpo crudo', () => {
    expect(verifyDocumensoSignature({ rawBody: body, headers: { 'x-documenso-signature': hmac }, secret })).toBe(true);
  });

  it('acepta el secreto compartido en X-Documenso-Secret (mecanismo nativo del proveedor)', () => {
    expect(verifyDocumensoSignature({ rawBody: body, headers: { 'x-documenso-secret': secret }, secret })).toBe(true);
  });

  it('rechaza sin secreto configurado, sin cabecera, firma alterada o cuerpo alterado', () => {
    expect(verifyDocumensoSignature({ rawBody: body, headers: { 'x-documenso-signature': hmac }, secret: '' })).toBe(false);
    expect(verifyDocumensoSignature({ rawBody: body, headers: { 'x-documenso-signature': hmac }, secret: null })).toBe(false);
    expect(verifyDocumensoSignature({ rawBody: body, headers: {}, secret })).toBe(false);
    expect(verifyDocumensoSignature({ rawBody: body, headers: { 'x-documenso-signature': hmac.slice(0, -1) + '0' }, secret })).toBe(false);
    expect(verifyDocumensoSignature({ rawBody: body + ' ', headers: { 'x-documenso-signature': hmac }, secret })).toBe(false);
    expect(verifyDocumensoSignature({ rawBody: body, headers: { 'x-documenso-secret': secret + 'x' }, secret })).toBe(false);
  });

  it('un placeholder como secreto nunca verifica (fallo cerrado)', () => {
    const ph = 'your-documenso-webhook-secret';
    const h = createHmac('sha256', ph).update(body).digest('hex');
    expect(verifyDocumensoSignature({ rawBody: body, headers: { 'x-documenso-signature': h }, secret: ph })).toBe(false);
  });

  // de tester r1 (C1-C3): longitudes distintas (timingSafeEqual lanzaría), la firma manda sobre el secreto compartido, secreto corto
  it('C1-C3 longitudes distintas → false sin lanzar; HMAC errónea + secreto compartido correcto → false (no se cae al secreto); secreto < 16 caracteres nunca verifica', () => {
    const headersFor = (s: string) => ({ 'x-documenso-signature': null, 'x-documenso-secret': s });
    expect(() => verifyDocumensoSignature({ rawBody: '{}', headers: headersFor('corto'), secret })).not.toThrow();
    expect(verifyDocumensoSignature({ rawBody: '{}', headers: headersFor('corto'), secret })).toBe(false);
    expect(verifyDocumensoSignature({ rawBody: '{}', headers: { 'x-documenso-signature': 'abc', 'x-documenso-secret': null }, secret })).toBe(false);
    expect(verifyDocumensoSignature({ rawBody: '{}', headers: { 'x-documenso-signature': 'deadbeef', 'x-documenso-secret': secret }, secret })).toBe(false);
    expect(verifyDocumensoSignature({ rawBody: '{}', headers: headersFor('corto12345'), secret: 'corto12345' })).toBe(false);
    expect(verifyDocumensoSignature({ rawBody: '{}', headers: headersFor('your-webhook-secret-here-xxxx'), secret: 'your-webhook-secret-here-xxxx' })).toBe(false);
  });
});

describe('F10 contractStateMachine — parseDocumensoPayload', () => {
  it('normaliza el formato nativo {event, payload:{id, documentData?, recipients}} y el plano {event, document_id}', () => {
    const native = parseDocumensoPayload({ event: 'DOCUMENT_COMPLETED', payload: { id: 42, recipients: [{ email: 'ana@x.co', signingStatus: 'SIGNED', signedAt: '2026-09-15T10:00:00Z' }] } });
    expect(native).toMatchObject({ event: 'document.completed', document_id: '42' });
    expect(native?.signers?.[0]).toMatchObject({ email: 'ana@x.co', status: 'signed' });
    const flat = parseDocumensoPayload({ event: 'document.viewed', document_id: 'abc' });
    expect(flat).toMatchObject({ event: 'document.viewed', document_id: 'abc' });
  });

  it('sin evento o sin identificador de documento → null', () => {
    expect(parseDocumensoPayload({ event: 'x' })).toBeNull();
    expect(parseDocumensoPayload({ document_id: 'x' })).toBeNull();
    expect(parseDocumensoPayload(null)).toBeNull();
    expect(parseDocumensoPayload('str')).toBeNull();
  });
});
