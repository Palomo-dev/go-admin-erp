import { NextRequest } from 'next/server';
import { GET } from '@/app/api/crm/calls/[id]/transcript/route';
import { exigirAccesoLlamada, puedeGestionarLlamada } from '../callAccessService';
import { getTranscript, expireStuckTranscript } from '../transcriptionService';
import { getServiceClient } from '@/lib/supabase/server-service';
import { CrmHttpError } from '../crmErrors';
import { CALL_ID } from './fixtures/phonePack';
const service = { elevated: true };
const query = { data: [], error: null, select: jest.fn(), eq: jest.fn(), in: jest.fn(), order: jest.fn(), limit: jest.fn(), maybeSingle: jest.fn() };
for (const key of ['select', 'eq', 'in', 'order', 'limit'] as const) query[key].mockReturnValue(query);
query.maybeSingle.mockResolvedValue({ data: null, error: null });
const auth = { from: jest.fn(() => query) };
jest.mock('@/lib/utils/orgContext', () => ({ OrgContextError: jest.requireActual('@/lib/utils/orgContextError').OrgContextError, getServerOrgContext: async () => ({ organizationId: 7, userId: 'actor', supabase: auth }) }));
jest.mock('@/lib/supabase/server-service', () => ({ getServiceClient: jest.fn(() => service) }));
jest.mock('../callAccessService', () => ({ exigirAccesoLlamada: jest.fn(), puedeGestionarLlamada: jest.fn() }));
jest.mock('../transcriptionService', () => ({ getTranscript: jest.fn(), expireStuckTranscript: jest.fn() }));
beforeEach(() => { jest.clearAllMocks(); jest.mocked(exigirAccesoLlamada).mockResolvedValue({ id: CALL_ID } as never); jest.mocked(getTranscript).mockResolvedValue({ id: 'transcript', status: 'processing' } as never); });
const request = () => new NextRequest(`https://app.example/api/crm/calls/${CALL_ID}/transcript`);
it('lector view_all no ejecuta expiration con privilegios', async () => {
  jest.mocked(puedeGestionarLlamada).mockResolvedValue(false);
  expect((await GET(request(), { params: Promise.resolve({ id: CALL_ID }) })).status).toBe(200);
  expect(expireStuckTranscript).not.toHaveBeenCalled(); expect(getServiceClient).not.toHaveBeenCalled();
  expect(getTranscript).toHaveBeenCalledWith(CALL_ID, 7, auth, true);
});
it('gestor autorizado usa servicio únicamente para la mutación, lecturas conservan sesión', async () => {
  jest.mocked(puedeGestionarLlamada).mockResolvedValue(true);
  expect((await GET(request(), { params: Promise.resolve({ id: CALL_ID }) })).status).toBe(200);
  expect(expireStuckTranscript).toHaveBeenCalledWith(7, CALL_ID, service);
  expect(getTranscript).toHaveBeenCalledWith(CALL_ID, 7, auth, true);
});
it('llamada ajena denegada antes de acceder al servicio o a derivados', async () => {
  jest.mocked(exigirAccesoLlamada).mockRejectedValue(new CrmHttpError(403, 'sin_permiso', 'Sin permiso'));
  expect((await GET(request(), { params: Promise.resolve({ id: CALL_ID }) })).status).toBe(403);
  expect(getServiceClient).not.toHaveBeenCalled(); expect(getTranscript).not.toHaveBeenCalled();
});

it('caducidad confirmada relee respuesta con sesión en lugar de exponer una fila privilegiada', async () => {
  jest.mocked(puedeGestionarLlamada).mockResolvedValue(true);
  jest.mocked(expireStuckTranscript).mockResolvedValueOnce({ id: 'transcript', status: 'failed' } as never);
  jest.mocked(getTranscript).mockResolvedValueOnce({ id: 'transcript', status: 'processing' } as never).mockResolvedValueOnce({ id: 'transcript', status: 'failed' } as never);
  const response = await GET(request(), { params: Promise.resolve({ id: CALL_ID }) });
  expect((await response.json()).data.status).toBe('failed');
  expect(getTranscript).toHaveBeenCalledTimes(2);
  for (const args of jest.mocked(getTranscript).mock.calls) expect(args[2]).toBe(auth);
});
