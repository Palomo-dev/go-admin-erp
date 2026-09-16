/// <reference types="jest" />
/**
 * F10 r3 — `f10RouteHelpers.isSafeId` (M50 del tester: «ids sin saneamiento»).
 * El id viaja a `.eq('id', …)` de PostgREST: solo uuid o ids cortos de prueba
 * con [A-Za-z0-9_-]; nada de espacios, rutas, operadores ni Unicode.
 */
// orgContext arrastra svix (ESM) por webhookSignatures: se dobla como en el resto de suites F10.
jest.mock('@/lib/utils/orgContext', () => ({ OrgContextError: class extends Error { statusCode = 401; }, getServerOrgContext: jest.fn() }));

import { isSafeId, UUID_RE, failResponse } from '@/lib/services/crm/f10RouteHelpers';
import { ProposalConvertedError, ProposalCustomerRequiredError } from '@/lib/services/crm/proposalServerService';

describe('failResponse (r4): los errores tipados del servicio llevan su propio statusCode', () => {
  it('ProposalConvertedError → 409, ProposalCustomerRequiredError → 400, Error suelto → 500', async () => {
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      expect(failResponse('t', new ProposalConvertedError('COT-1')).status).toBe(409);
      expect(await failResponse('t', new ProposalConvertedError('COT-1')).json()).toMatchObject({ success: false, code: 'PROPOSAL_CONVERTED', error: expect.stringMatching(/COT-1/) });
      expect(failResponse('t', new ProposalCustomerRequiredError()).status).toBe(400);
      expect(failResponse('t', new Error('x')).status).toBe(500);
    } finally {
      errSpy.mockRestore();
    }
  });
});

describe('isSafeId', () => {
  it('acepta uuid v4 y ids cortos de prueba', () => {
    expect(isSafeId('8f3a2c1e-4b7d-4e9a-9c2b-1a2b3c4d5e6f')).toBe(true);
    expect(UUID_RE.test('8f3a2c1e-4b7d-4e9a-9c2b-1a2b3c4d5e6f')).toBe(true);
    expect(isSafeId('op-1')).toBe(true);
    expect(isSafeId('q_9')).toBe(true);
    expect(isSafeId('a'.repeat(64))).toBe(true);
  });

  it.each([
    ['vacío', ''],
    ['65 caracteres', 'a'.repeat(65)],
    ['espacio', 'op 1'],
    ['ruta', '../op-1'],
    ['operador PostgREST', 'op-1,or(id.eq.op-9)'],
    ['punto', 'op.1'],
    ['comilla', "op-1'"],
    ['dos puntos', 'op:1'],
    ['unicode de ancho completo', 'ｏｐ－１'],
    ['carácter de control', 'op-1' + String.fromCharCode(0)],
    ['salto de línea', 'op-1\n'],
    ['asterisco', '*'],
  ])('rechaza %s', (_label, value) => {
    expect(isSafeId(value)).toBe(false);
  });

  it('rechaza lo que no es texto', () => {
    for (const v of [null, undefined, 1, 0, true, {}, [], ['op-1']]) expect(isSafeId(v)).toBe(false);
  });
});
