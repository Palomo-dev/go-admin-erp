jest.mock('@/lib/services/crm/recordingStorageService', () => {
  class TwilioDownloadError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  }
  return { storeRecording: jest.fn(), TwilioDownloadError };
});
jest.mock('@/lib/services/crm/voiceContextService', () => ({ getTelephonySettings: jest.fn(async () => ({ voice_recording_retention_days: 90 })) }));
jest.mock('@/lib/services/crm/callIntelligenceService', () => ({ enqueueTranscribe: jest.fn(async () => 'job-transcribe-1') }));
jest.mock('@/lib/services/crm/callAiPolicy', () => ({ getCallAiPolicy: jest.fn(async () => ({ autoTranscribe: true, minDurationSeconds: 5 })) }));

import type { SupabaseClient } from '@supabase/supabase-js';
import { recordingFetchHandler } from '@/lib/jobs/handlers/recordingFetch';
import { storeRecording, TwilioDownloadError } from '@/lib/services/crm/recordingStorageService';
import { enqueueTranscribe } from '@/lib/services/crm/callIntelligenceService';
import { getCallAiPolicy } from '@/lib/services/crm/callAiPolicy';
import { JobFatalError, JobRetryableError, type OutboundJob } from '@/lib/jobs/types';

const mockStore = storeRecording as jest.MockedFunction<typeof storeRecording>;
const mockEnqueue = enqueueTranscribe as jest.MockedFunction<typeof enqueueTranscribe>;
const mockPolicy = getCallAiPolicy as jest.MockedFunction<typeof getCallAiPolicy>;

function fakeSupabase(rows: { recording?: Record<string, unknown> | null; call?: Record<string, unknown> | null }) {
  const updates: Record<string, unknown>[] = [];
  const chain = (table: string) => {
    const result = table === 'call_recordings' ? rows.recording : table === 'calls' ? rows.call : null;
    const q: Record<string, unknown> = {};
    q.select = () => q;
    q.eq = () => q;
    q.maybeSingle = async () => ({ data: result ?? null, error: null });
    q.update = (row: Record<string, unknown>) => {
      updates.push({ table, ...row });
      return q;
    };
    return q;
  };
  return { client: { from: chain } as unknown as SupabaseClient, updates };
}

const log = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
const job = (payload: Record<string, unknown>, attempts = 1): OutboundJob => ({
  id: 'j1', organization_id: 120, kind: 'recording_fetch', payload, status: 'running', run_at: '', attempts, max_attempts: 6, last_error: null, result: null, locked_at: null, locked_by: 'w', dedupe_key: null, created_at: '', updated_at: '',
});
const recording = { id: 'r1', call_id: 'c1', status: 'processing', channels: '2', duration_seconds: 120, storage_path: 'org_120/2026/09/c1.mp3', storage_provider: 'twilio' };
const call = { id: 'c1', started_at: '2026-09-08T10:00:00.000Z', duration_seconds: 120 };

describe('job recording_fetch (FASE-03 §4.4)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockStore.mockResolvedValue({ storagePath: 'org_120/2026/09/c1.mp3', sizeBytes: 1234, retentionUntil: '2026-12-07' });
  });

  test('descarga, marca ready y encola transcribe {call_id, recording_id}', async () => {
    const { client } = fakeSupabase({ recording, call });
    const out = await recordingFetchHandler({ job: job({ recording_id: 'r1', recording_url: 'https://api.twilio.com/2010-04-01/Accounts/AC/Recordings/RE1', channels: '2' }), supabase: client, orgId: 120, log, signal: new AbortController().signal });
    expect(mockStore).toHaveBeenCalledWith(
      expect.objectContaining({ recordingId: 'r1', organizationId: 120, callId: 'c1', recordingUrl: expect.stringContaining('/Recordings/RE1'), channels: '2', retentionDays: 90, startedAt: call.started_at }),
      client
    );
    expect(mockEnqueue).toHaveBeenCalledWith(120, 'c1', { recording_id: 'r1' }, client);
    expect(out).toMatchObject({ recording_id: 'r1', call_id: 'c1', storage_path: 'org_120/2026/09/c1.mp3', size_bytes: 1234, transcribe_job_id: 'job-transcribe-1' });
  });

  test('ya ready → skipped; grabación de otra org → fatal; sin recording_id → fatal', async () => {
    const { client } = fakeSupabase({ recording: { ...recording, status: 'ready' }, call });
    expect(await recordingFetchHandler({ job: job({ recording_id: 'r1' }), supabase: client, orgId: 120, log, signal: new AbortController().signal })).toMatchObject({ skipped: true, reason: 'already_ready' });
    const none = fakeSupabase({ recording: null, call });
    await expect(recordingFetchHandler({ job: job({ recording_id: 'r1' }), supabase: none.client, orgId: 120, log, signal: new AbortController().signal })).rejects.toBeInstanceOf(JobFatalError);
    await expect(recordingFetchHandler({ job: job({}), supabase: client, orgId: 120, log, signal: new AbortController().signal })).rejects.toBeInstanceOf(JobFatalError);
    expect(mockStore).not.toHaveBeenCalled();
  });

  test('Twilio 404 → reintentable con retry_after; 401 → fatal y status failed', async () => {
    mockStore.mockRejectedValueOnce(new TwilioDownloadError(404, 'not yet'));
    const a = fakeSupabase({ recording, call });
    await expect(recordingFetchHandler({ job: job({ recording_id: 'r1', recording_url: 'https://x/RE1' }), supabase: a.client, orgId: 120, log, signal: new AbortController().signal })).rejects.toMatchObject({ name: 'JobRetryableError', retryAfterSeconds: 120 });
    expect(a.updates).toHaveLength(0);

    mockStore.mockRejectedValueOnce(new TwilioDownloadError(401, 'auth'));
    const b = fakeSupabase({ recording, call });
    await expect(recordingFetchHandler({ job: job({ recording_id: 'r1', recording_url: 'https://x/RE1' }), supabase: b.client, orgId: 120, log, signal: new AbortController().signal })).rejects.toBeInstanceOf(JobFatalError);
    expect(b.updates).toEqual([{ table: 'call_recordings', status: 'failed' }]);
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  test('error de red genérico → reintentable', async () => {
    mockStore.mockRejectedValueOnce(new Error('ECONNRESET'));
    const { client } = fakeSupabase({ recording, call });
    await expect(recordingFetchHandler({ job: job({ recording_id: 'r1', recording_url: 'https://x/RE1' }), supabase: client, orgId: 120, log, signal: new AbortController().signal })).rejects.toBeInstanceOf(JobRetryableError);
  });

  test('política auto_transcribe=false o duración < mínimo → no encola transcribe pero queda ready', async () => {
    mockPolicy.mockResolvedValueOnce({ autoTranscribe: false, minDurationSeconds: 5 } as never);
    const { client } = fakeSupabase({ recording, call });
    const out = await recordingFetchHandler({ job: job({ recording_id: 'r1', recording_url: 'https://x/RE1' }), supabase: client, orgId: 120, log, signal: new AbortController().signal });
    expect(mockEnqueue).not.toHaveBeenCalled();
    expect(out).toMatchObject({ transcribe_job_id: null, storage_path: 'org_120/2026/09/c1.mp3' });
  });
});
