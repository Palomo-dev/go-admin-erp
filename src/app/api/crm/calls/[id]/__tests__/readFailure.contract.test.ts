import { NextRequest } from 'next/server';
import { FakeDb } from '@/lib/services/crm/__tests__/fixtures/fakeSupabase';

const CALL_ID = '11111111-1111-4111-8111-111111111111';
let db: FakeDb;
jest.mock('@/lib/utils/orgContext', () => ({
  OrgContextError: jest.requireActual('@/lib/utils/orgContextError').OrgContextError,
  getServerOrgContext: jest.fn(async () => ({ organizationId: 7, userId: 'usuario', roleId: 3, isSuperAdmin: false, supabase: db.client() })),
  hasOrgAdminOrPermission: jest.fn(async () => false),
}));
jest.mock('@/lib/supabase/server-service', () => ({ getServiceClient: jest.fn(() => db.client()), assertServerOnly: jest.fn() }));
jest.mock('@/lib/services/crm/aiCostService', () => ({ chargeAiCredits: jest.fn(), refundAiCredits: jest.fn(), InsufficientCreditsError: class extends Error {} }));
jest.mock('@/lib/services/crm/pricingService', () => ({ getUnitCost: jest.fn(), round6: (value: number) => value }));
jest.mock('@/lib/services/crm/callAiPolicy', () => ({ getCallAiPolicy: jest.fn() }));
jest.mock('@/lib/services/providerCredentials.server', () => ({ getProviderCredentials: jest.fn(), getProviderSettings: jest.fn() }));
jest.mock('@/lib/services/crm/recordingStorageService', () => ({ downloadFromTwilio: jest.fn() }));
jest.mock('@/lib/services/crm/stt', () => ({ normalizeSttProvider: () => null, transcribeWithFallback: jest.fn() }));
jest.mock('@/lib/services/crm/callIntelligenceService', () => ({
  enqueueAnalyze: jest.fn(), runAnalysisPipeline: jest.fn(), findLiveCallJob: jest.fn(), forceRetryBucket: jest.fn(),
  enqueueTranscribe: jest.fn(), runTranscribePipeline: jest.fn(),
}));

import { getAnalysis } from '@/lib/services/crm/callAnalysisService';
import { getTranscript } from '@/lib/services/crm/transcriptionService';
import { chargeAiCredits } from '@/lib/services/crm/aiCostService';
import { getServiceClient } from '@/lib/supabase/server-service';
import { getProviderCredentials } from '@/lib/services/providerCredentials.server';
import { enqueueAnalyze, enqueueTranscribe, runAnalysisPipeline, runTranscribePipeline } from '@/lib/services/crm/callIntelligenceService';
import { POST as analyzePost, GET as analyzeGet } from '../analyze/route';
import { POST as transcribePost } from '../transcribe/route';
import { GET as transcriptGet } from '../transcript/route';

const params = { params: Promise.resolve({ id: CALL_ID }) };
function request(method: 'GET' | 'POST', endpoint: string) {
  return new NextRequest(`https://crm.test/api/crm/calls/${CALL_ID}/${endpoint}?sync=1`, {
    method,
    ...(method === 'POST' ? { headers: { 'content-type': 'application/json' }, body: '{}' } : {}),
  });
}
function expectNoProcessing() {
  for (const action of [chargeAiCredits, enqueueAnalyze, enqueueTranscribe, runAnalysisPipeline, runTranscribePipeline, getProviderCredentials, getServiceClient]) {
    expect(action).not.toHaveBeenCalled();
  }
  expect(db.calls.some((call) => call.op !== 'select')).toBe(false);
}

beforeEach(() => {
  jest.clearAllMocks();
  db = new FakeDb({ tables: { calls: [{ id: CALL_ID, organization_id: 7, user_id: 'usuario' }] } });
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

it('getAnalysis distingue error de lectura, ausencia y datos de otro tenant', async () => {
  db.failOn['call_analyses:select'] = 'fallo de lectura';
  await expect(getAnalysis(CALL_ID, 7, db.client())).rejects.toMatchObject({ message: 'fallo de lectura' });
  delete db.failOn['call_analyses:select'];
  expect(await getAnalysis(CALL_ID, 7, db.client())).toBeNull();
  db.rows('call_analyses').push({ id: 'analisis', call_id: CALL_ID, organization_id: 8 });
  expect(await getAnalysis(CALL_ID, 7, db.client())).toBeNull();
});

it('getTranscript no confunde fallo de lectura con ausencia ni devuelve segmentos falsamente vacíos', async () => {
  db.failOn['call_transcripts:select'] = 'fallo de lectura';
  await expect(getTranscript(CALL_ID, 7, db.client())).rejects.toMatchObject({ message: 'fallo de lectura' });
  delete db.failOn['call_transcripts:select'];
  expect(await getTranscript(CALL_ID, 7, db.client())).toBeNull();
  db.rows('call_transcripts').push({ id: 'transcripcion', call_id: CALL_ID, organization_id: 7, status: 'completed' });
  db.failOn['call_transcript_segments:select'] = 'fallo de segmentos';
  await expect(getTranscript(CALL_ID, 7, db.client())).rejects.toMatchObject({ message: 'fallo de segmentos' });
  expect(await getTranscript(CALL_ID, 7, db.client(), false)).toMatchObject({ id: 'transcripcion' });
});

it.each([
  { name: 'analyze: análisis', handler: analyzePost, endpoint: 'analyze', table: 'call_analyses' },
  { name: 'analyze: transcripción', handler: analyzePost, endpoint: 'analyze', table: 'call_transcripts' },
  { name: 'transcribe: transcripción', handler: transcribePost, endpoint: 'transcribe', table: 'call_transcripts' },
])('POST $name con lectura caída devuelve500 sin encolar, procesar ni cobrar', async ({ handler, endpoint, table }) => {
  db.failOn[`${table}:select`] = 'detalle interno de infraestructura';
  const response = await handler(request('POST', endpoint), params);
  expect(response.status).toBe(500);
  expect(await response.json()).toEqual({ success: false, error: 'Error interno' });
  expectNoProcessing();
});

it.each([
  { endpoint: 'analyze', handler: analyzeGet, table: 'call_analyses' },
  { endpoint: 'transcript', handler: transcriptGet, table: 'call_transcripts' },
])('GET $endpoint con lectura caída devuelve500 y conserva el error en vez de404', async ({ handler, endpoint, table }) => {
  db.failOn[`${table}:select`] = 'detalle interno de infraestructura';
  const response = await handler(request('GET', endpoint), params);
  expect(response.status).toBe(500);
  expect(await response.json()).toEqual({ success: false, error: 'Error interno' });
  expectNoProcessing();
});
