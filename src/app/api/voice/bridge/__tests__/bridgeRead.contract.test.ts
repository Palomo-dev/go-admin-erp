import { GET } from '../[id]/route';
import { getBridge } from '@/lib/services/crm/mobileBridgeService';
import { exigirAccesoALlamadaCargada, exigirAlcanceReferenciasLlamada } from '@/lib/services/crm/callAccessService';
import { OrgContextError } from '@/lib/utils/orgContext';
import type { NextRequest } from 'next/server';
const mockQuery = { select: jest.fn(), eq: jest.fn(), maybeSingle: jest.fn() };
const mockContext = { organizationId: 120, userId: 'user-a', supabase: { from: jest.fn(() => mockQuery) } };
jest.mock('@/lib/utils/orgContext', () => ({ getServerOrgContext: jest.fn(async () => mockContext), OrgContextError: class extends Error { constructor(message: string, public statusCode: number, public code: string) { super(message); } } }));
jest.mock('@/lib/services/crm/mobileBridgeService', () => ({ getBridge: jest.fn() }));
jest.mock('@/lib/services/crm/callAccessService', () => ({ exigirAccesoALlamadaCargada: jest.fn(), exigirAlcanceReferenciasLlamada: jest.fn() }));
const bridge = { id: '30000000-0000-4000-8000-000000000001', user_id: 'user-a', call_id: '10000000-0000-4000-8000-000000000001', organization_id: 120, customer_id: null, opportunity_id: null };
const call = { id: bridge.call_id, status: 'in_progress', answered_at: '2026-10-02T15:00:00Z', ended_at: null, duration_seconds: null, recording_enabled: true, consent_given: true, metadata: { private: 'No publicar' } };
const request = { url: `http://localhost/api/voice/bridge/${bridge.id}` } as NextRequest;
const params = { params: Promise.resolve({ id: bridge.id }) };
beforeEach(() => { jest.clearAllMocks(); mockQuery.select.mockReturnValue(mockQuery); mockQuery.eq.mockReturnValue(mockQuery); mockQuery.maybeSingle.mockResolvedValue({ data: call, error: null }); (getBridge as jest.Mock).mockResolvedValue(bridge); (exigirAccesoALlamadaCargada as jest.Mock).mockResolvedValue(undefined); (exigirAlcanceReferenciasLlamada as jest.Mock).mockResolvedValue(undefined); });
it.each([{ recording_enabled: true, consent_given: true, metadata: {} }, { recording_enabled: true, consent_given: false, metadata: { recording_started_at: '2026-10-02T15:00:00Z' } }, { recording_enabled: false, consent_given: true, metadata: { recording_started_at: '2026-10-02T15:00:00Z' } }, { recording_enabled: true, consent_given: true, metadata: { recording_started_at: 'invalid' } }])('habilitar grabación o autorizarla no prueba que se inició', async fields => {
  mockQuery.maybeSingle.mockResolvedValue({ data: { ...call, ...fields }, error: null });
  const response = await GET(request, params); const data = (await response.json()).data;
  expect(data.call.recording_started).toBe(false); expect(data.call).not.toHaveProperty('metadata');
});
it('expone sólo el booleano confirmado por el writer y conserva el scope de la sesión', async () => {
  mockQuery.maybeSingle.mockResolvedValue({ data: { ...call, metadata: { ...call.metadata, recording_started_at: '2026-10-02T15:00:00Z' } }, error: null });
  const response = await GET(request, params); const data = (await response.json()).data;
  expect(data.call.recording_started).toBe(true); expect(data.call).not.toHaveProperty('metadata');
  expect(getBridge).toHaveBeenCalledWith(bridge.id, 120, mockContext.supabase);
  expect(mockQuery.eq).toHaveBeenCalledWith('organization_id', 120);
  expect(exigirAccesoALlamadaCargada).toHaveBeenCalledWith(mockContext, bridge, 'lectura');
  expect(exigirAlcanceReferenciasLlamada).toHaveBeenCalledWith(mockContext, bridge);
});
it.each(['autor', 'sucursal'])('un rechazo de %s impide publicar los datos del puente', async type => {
  const guard = type === 'autor' ? exigirAccesoALlamadaCargada : exigirAlcanceReferenciasLlamada;
  (guard as jest.Mock).mockRejectedValueOnce(new OrgContextError('Sin acceso', 403, 'CRM_FORBIDDEN'));
  const response = await GET(request, params); expect(response.status).toBe(403); expect(await response.json()).not.toHaveProperty('data'); expect(mockContext.supabase.from).not.toHaveBeenCalled();
});
