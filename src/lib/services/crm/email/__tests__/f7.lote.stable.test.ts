/// <reference types="jest" />
/**
 * F7 · Consolidación de las rondas (2026-09-21) — el LOTE de envío
 * (`batchService`): agrupación por remitente y aislamiento de fallos por grupo.
 *
 * Origen: builder r2 (`roundTwo.test.ts` §6), tester r2 (`adversarialR2.test.ts`)
 * y builder r3 (`roundThree.test.ts` #3). Va en archivo aparte porque mockea
 * `domainsService`, `resendClient`, `sendService` y `messageStore` enteros, lo
 * que choca con los demás estables de la fase (usan esos módulos reales).
 *
 * Antes de la ronda 3 `sendOneGroup` iba en un `for…of` SIN try/catch: un grupo
 * que lanzaba dejaba al anterior ya enviado, al siguiente sin intentar y perdía
 * el `BatchResult`; el handler de jobs lo convertía en `JobFatalError` y esos
 * correos se quedaban en `pending` para siempre. La comprobación por regex
 * sobre el fuente que había en r2 se descartó (tester r3 #3): aquí se ejecuta.
 */

const resolveSenderMock = jest.fn();
const batchSendMock = jest.fn();
const markFailedMock = jest.fn(async () => undefined);
const mergeMetaMock = jest.fn(async () => undefined);

jest.mock('../domainsService', () => ({ resolveSender: (...a: unknown[]) => resolveSenderMock(...a) }));
jest.mock('../resendClient', () => ({
  getResendClient: () => ({ batch: { send: (...a: unknown[]) => batchSendMock(...a) } }),
  getResendRateLimiter: () => ({ wait: async () => undefined }),
}));
jest.mock('../sendService', () => ({ buildResendPayload: (m: { id: string }) => ({ to: [`${m.id}@x.co`] }), canContact: async () => true }));
jest.mock('../messageStore', () => ({ markFailed: (...a: unknown[]) => markFailedMock(...(a as [])), mergeMeta: (...a: unknown[]) => mergeMetaMock(...(a as [])) }));

import { groupBySender, senderGroupKey, sendPendingBatch } from '../batchService';
import type { EmailMessage } from '../types';
import { fakeSupabase } from './fakeSupabase';

// ─── Agrupación por remitente (builder r2 #6 · tester r2) ───────────────────────

describe('batchService · agrupación por remitente', () => {
  const m = (id: string, domainId: string | null, kind = 'marketing') => ({ id, organization_id: 9, metadata: { email_domain_id: domainId, kind } }) as unknown as EmailMessage;

  it('B6 · la clave de grupo combina dominio y kind (default:: sin dominio)', () => {
    expect(senderGroupKey(m('a', 'dom-a'))).toBe('dom-a::marketing');
    expect(senderGroupKey(m('b', null))).toBe('default::marketing');
    expect(senderGroupKey(m('c', 'dom-a', 'sequence'))).toBe('dom-a::sequence');
  });

  it('B6 · dos dominios producen DOS grupos con el orden de entrada; dominio+kind distinto es otro grupo', () => {
    const groups = groupBySender([m('1', 'dom-a'), m('2', 'dom-b'), m('3', 'dom-a'), m('4', 'dom-a', 'sequence')]);
    expect(groups.size).toBe(3);
    expect(groups.get('dom-a::marketing')?.map((x) => x.id)).toEqual(['1', '3']);
    expect(groups.get('dom-b::marketing')?.map((x) => x.id)).toEqual(['2']);
  });

  it('B6 · un lote homogéneo sigue siendo un único grupo (una sola llamada a batch.send)', () => {
    expect(groupBySender([m('1', 'dom-a'), m('2', 'dom-a')]).size).toBe(1);
  });
});

// ─── Aislamiento de fallos entre grupos (builder r3 #3) ─────────────────────────

describe('sendPendingBatch · el lote aísla los fallos por grupo de remitente', () => {
  const rows = [
    { id: 'a', organization_id: 9, status: 'pending', provider_message_id: null, metadata: { email_domain_id: 'dom-a', kind: 'marketing' } },
    { id: 'b', organization_id: 9, status: 'pending', provider_message_id: null, metadata: { email_domain_id: 'dom-b', kind: 'marketing' } },
  ] as unknown as EmailMessage[];
  const svc = fakeSupabase((c) => (c.table === 'email_messages' ? { data: rows, error: null } : { data: null, error: null })).client;
  const sender = { from: 'a@crm.acme.co', fromEmail: 'a@crm.acme.co', replyToDomain: 'crm.acme.co', apiKey: 're_x', domainId: 'dom-a', mode: 'own', notice: null };
  const okSend = async () => ({ data: { data: [{ id: 'prov-1' }] }, error: null });

  beforeEach(() => { resolveSenderMock.mockReset(); batchSendMock.mockReset(); markFailedMock.mockClear(); mergeMetaMock.mockClear(); });

  it('B3.3 · los dos grupos bien → 2 batch.send y ambos enviados', async () => {
    resolveSenderMock.mockResolvedValue(sender);
    batchSendMock.mockImplementation(okSend);
    const r = await sendPendingBatch(9, ['a', 'b'], svc);
    expect(batchSendMock).toHaveBeenCalledTimes(2);
    expect(r.sent.sort()).toEqual(['a', 'b']);
    expect(r.failed).toEqual([]);
  });

  it('B3.3 · si el 2.º grupo lanza: NO se propaga, el 1.º se envía y el 2.º queda reintentable (la fila sigue pending)', async () => {
    resolveSenderMock.mockImplementation(async (_org: number, o: { domainId: string | null }) => { if (o.domainId === 'dom-b') throw new Error('boom: fallo de BD en el 2.º grupo'); return sender; });
    batchSendMock.mockImplementation(okSend);
    const r = await sendPendingBatch(9, ['a', 'b'], svc);
    expect(r.sent).toEqual(['a']);
    expect(r.failed).toEqual([{ email_message_id: 'b', error: expect.stringContaining('boom'), retryable: true }]);
    expect(markFailedMock).not.toHaveBeenCalled();
    expect(batchSendMock).toHaveBeenCalledTimes(1);
  });

  it('B3.3 · si el PRIMER grupo lanza, el segundo se intenta igual', async () => {
    resolveSenderMock.mockImplementation(async (_org: number, o: { domainId: string | null }) => { if (o.domainId === 'dom-a') throw new Error('boom A'); return sender; });
    batchSendMock.mockImplementation(async () => ({ data: { data: [{ id: 'prov-2' }] }, error: null }));
    const r = await sendPendingBatch(9, ['a', 'b'], svc);
    expect(r.sent).toEqual(['b']);
    expect(r.failed.map((f) => f.email_message_id)).toEqual(['a']);
  });

  it('B3.3 · un error DEVUELTO por el proveedor sí marca las filas failed (no es reintentable)', async () => {
    resolveSenderMock.mockResolvedValue(sender);
    batchSendMock.mockImplementation(async () => ({ data: null, error: { message: 'rate limited' } }));
    const r = await sendPendingBatch(9, ['a', 'b'], svc);
    expect(r.sent).toEqual([]);
    expect(r.failed).toHaveLength(2);
    expect(r.failed.every((f) => f.retryable !== true)).toBe(true);
    expect(markFailedMock).toHaveBeenCalledTimes(2);
  });
});
