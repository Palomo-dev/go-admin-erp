/**
 * F4 — guarda de «trabajo vivo» contra el doble cobro: `forceRetryBucket` y
 * `findLiveCallJob` (callIntelligenceService) más los CONTRATOS sobre el fuente
 * de las rutas `POST /api/crm/calls/[id]/{transcribe,analyze}` y de los dos
 * paneles (`CallTranscriptPanel`, `CallAnalysisPanel`). Consolidado el
 * 2026-09-21 a partir de `f4Round4Builder` (B9-B11), `f4Round4Tester` (U12),
 * `f4Round5Builder` (C4, C5), `f4Round5Tester` (V7, V7b), `f4Round6Builder`
 * (D4, D4b, D5), `f4Round6Tester` (W5-W7) y `f4Round7Builder` (E3, E4).
 *
 * Los contratos leen el fuente (`readFileSync`): la cobertura no aplica; son la
 * red que impide que la guarda desaparezca de UNA de las dos rutas (el «gemelo»
 * que las rondas 5-7 fueron encontrando). Sin red ni BD.
 */
import fs from 'fs';
import path from 'path';
import type { SupabaseClient } from '@supabase/supabase-js';

jest.mock('@/lib/supabase/server-service', () => ({ getServiceClient: jest.fn(() => ({})), assertServerOnly: jest.fn() }));
jest.mock('@/lib/services/crm/aiCostService', () => ({ chargeAiCredits: jest.fn(), refundAiCredits: jest.fn(async () => true), InsufficientCreditsError: class extends Error {} }));
jest.mock('@/lib/services/crm/pricingService', () => ({ getUnitCost: jest.fn(async () => 0.75), round6: (n: number) => n }));
jest.mock('@/lib/services/crm/callAiPolicy', () => ({ getCallAiPolicy: jest.fn() }));
jest.mock('@/lib/services/crm/recordingStorageService', () => ({ downloadFromTwilio: jest.fn() }));
jest.mock('@/lib/services/providerCredentials.server', () => ({ getProviderCredentials: jest.fn(), getProviderSettings: jest.fn() }));

import { forceRetryBucket, FORCE_RETRY_WINDOW_MS, findLiveCallJob, ANALYZE_DEDUPE } from '@/lib/services/crm/callIntelligenceService';

const SRC = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');
const ROUTE_T = 'src/app/api/crm/calls/[id]/transcribe/route.ts';
const ROUTE_A = 'src/app/api/crm/calls/[id]/analyze/route.ts';
const PANEL_T = 'src/components/crm/calls/CallTranscriptPanel.tsx';
const PANEL_A = 'src/components/crm/calls/CallAnalysisPanel.tsx';

/** Cliente mínimo para `findLiveCallJob`: select/eq/in/like/limit sobre outbound_jobs (de builder r4). */
function stubJobsClient(rows: Array<Record<string, unknown>>, failWith?: string): SupabaseClient {
  return {
    from: (_t: string) => {
      let out = [...rows];
      const b: any = {
        select: () => b,
        eq: (col: string, val: unknown) => { out = out.filter((r) => String(r[col]) === String(val)); return b; },
        in: (col: string, vals: unknown[]) => { out = out.filter((r) => vals.map(String).includes(String(r[col]))); return b; },
        like: (col: string, pattern: string) => {
          const re = new RegExp(`^${pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*')}$`);
          out = out.filter((r) => re.test(String(r[col])));
          return b;
        },
        limit: (n: number) => { out = out.slice(0, n); return b; },
        then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
          Promise.resolve(failWith ? { data: null, error: { message: failWith } } : { data: out, error: null }).then(res, rej),
      };
      return b;
    },
  } as unknown as SupabaseClient;
}

let errors: string[] = [];
beforeEach(() => {
  errors = [];
  jest.spyOn(console, 'error').mockImplementation((...a: unknown[]) => { errors.push(a.map(String).join(' ')); });
});
afterEach(() => jest.restoreAllMocks());

describe('dedupe del reintento forzado y job vivo (builder r4 B9-B11, tester r5 V7b)', () => {
  it('B9 · dos clics en la misma ventana comparten dedupe_key; una ventana después, no', () => {
    const t0 = 1_770_000_000_000;
    expect(forceRetryBucket(t0)).toBe(forceRetryBucket(t0 + 900));
    expect(forceRetryBucket(t0)).toBe(forceRetryBucket(t0 + FORCE_RETRY_WINDOW_MS - 1));
    expect(forceRetryBucket(t0)).not.toBe(forceRetryBucket(t0 + FORCE_RETRY_WINDOW_MS));
    const key = (n: number) => `${ANALYZE_DEDUPE('call-r4')}:retry:${n}`;
    expect(key(forceRetryBucket(t0))).toBe(key(forceRetryBucket(t0 + 900)));
  });

  it('V7b · con `retry` la clave cambia de ventana en ventana: el índice único parcial NO puede frenarla (por eso hace falta la guarda)', () => {
    const svc = SRC('src/lib/services/crm/callIntelligenceService.ts');
    expect(svc).toContain('`transcribe:${callId}`');
    expect(svc).toContain('FORCE_RETRY_WINDOW_MS = 60_000');
    expect(svc).toContain('dedupeKey: extra.retry ? `${TRANSCRIBE_DEDUPE(callId)}:retry:${extra.retry}` : TRANSCRIBE_DEDUPE(callId)');
    expect(forceRetryBucket(1_000_000_000)).not.toBe(forceRetryBucket(1_000_000_000 + 61_000));
  });

  it('B10 · findLiveCallJob encuentra el job vivo de la llamada (sólo de su organización y sólo queued/running)', async () => {
    const rows = [
      { id: 'job-1', organization_id: 7, kind: 'analyze', status: 'queued', dedupe_key: 'analyze:call-r4' },
      { id: 'job-2', organization_id: 9, kind: 'analyze', status: 'queued', dedupe_key: 'analyze:call-r4' },
      { id: 'job-3', organization_id: 7, kind: 'analyze', status: 'done', dedupe_key: 'analyze:call-r4' },
    ];
    expect(await findLiveCallJob(7, 'call-r4', 'analyze', stubJobsClient(rows))).toEqual({ jobId: 'job-1', checked: true, error: null });
    expect(await findLiveCallJob(7, 'otra-llamada', 'analyze', stubJobsClient(rows))).toEqual({ jobId: null, checked: true, error: null });
  });

  it('B11 · si la comprobación falla NO se finge que no hay job: checked=false, error y console.error', async () => {
    const live = await findLiveCallJob(7, 'call-r4', 'analyze', stubJobsClient([], 'outbound_jobs caído'));
    expect(live).toEqual({ jobId: null, checked: false, error: 'outbound_jobs caído' });
    expect(errors.some((e) => /no se pudo comprobar si hay un job analyze vivo/.test(e))).toBe(true);
  });
});

describe('CONTRATOS sobre las rutas: la guarda va en los DOS caminos (sync y cola) de las DOS rutas', () => {
  it('C4/W6/U12 · `transcribe?sync=1` consulta los DOS kinds ANTES del pipeline, publica *_IN_PROGRESS y dedupe_checked', () => {
    const t = SRC(ROUTE_T);
    const tSync = t.slice(t.indexOf('if (sync)'), t.indexOf('// Sufijo de reintento'));
    expect(tSync).toContain("findLiveCallJob(ctx.organizationId, id, 'transcribe'");
    expect(tSync).toContain("findLiveCallJob(ctx.organizationId, id, 'analyze'");
    expect(t.indexOf('findLiveCallJob(')).toBeLessThan(t.indexOf('runTranscribePipeline('));
    expect(t).toContain('TRANSCRIPTION_IN_PROGRESS');
    expect(t).toContain('ANALYSIS_IN_PROGRESS');
    expect(t).toContain('dedupe_checked');
  });

  it('E4/C5/D4b · `analyze?sync=1` comprueba los DOS kinds (también el `transcribe` que encadenará análisis) y el force de cola no encola a ciegas', () => {
    const a = SRC(ROUTE_A);
    const aSync = a.slice(a.indexOf('if (sync)'), a.indexOf('enqueueAnalyze('));
    expect(aSync).toContain("findLiveCallJob(ctx.organizationId, id, 'analyze', sb)");
    expect(aSync).toContain("findLiveCallJob(ctx.organizationId, id, 'transcribe', sb)");
    expect(aSync).toContain('TRANSCRIPTION_IN_PROGRESS');
    expect(aSync).toContain('ANALYSIS_IN_PROGRESS');
    expect(a.indexOf('findLiveCallJob(')).toBeLessThan(a.indexOf('runAnalysisPipeline('));
    expect(a.slice(0, a.indexOf('enqueueAnalyze('))).toContain('if (force) live = await findLiveCallJob(');
    expect(a).toMatch(/deduped: true/);
    expect(a).toContain('dedupe_checked');
  });

  it('D4/V7 · el camino de COLA de `transcribe` calcula el sufijo y consulta el job `transcribe` vivo ANTES de encolar; devuelve deduped y dedupe_checked', () => {
    const t = SRC(ROUTE_T);
    const enqueue = t.indexOf('enqueueTranscribe(');
    const colaBlock = t.slice(t.indexOf('// Sufijo de reintento'), enqueue);
    expect(colaBlock).toContain('forceRetryBucket()');
    expect(colaBlock).toContain('findLiveCallJob(');
    expect(colaBlock).toContain("'transcribe'");
    expect(t).toMatch(/deduped: true/);
    expect(t.slice(enqueue)).toContain('dedupe_checked');
  });

  it('W7 · de los seis puntos de encolado del repo, sólo las dos rutas de `calls/[id]` calculan sufijo, y las dos están guardadas con `sb`', () => {
    const manual = SRC('src/app/api/crm/calls/manual/route.ts');
    const inline = SRC('src/app/api/crm/transcribe/route.ts');
    const webhook = SRC('src/app/api/crm/webhooks/elevenlabs/route.ts');
    const fetchH = SRC('src/lib/jobs/handlers/recordingFetch.ts');
    for (const s of [manual, inline, webhook, fetchH]) expect(s).not.toContain('forceRetryBucket');
    expect(manual).toContain('created.callId');
    expect(inline).toContain('created.callId');
    const t = SRC(ROUTE_T);
    const a = SRC(ROUTE_A);
    expect(t.slice(0, t.indexOf('enqueueTranscribe('))).toContain("findLiveCallJob(ctx.organizationId, id, 'transcribe', sb)");
    expect(a.slice(0, a.indexOf('enqueueAnalyze('))).toContain("findLiveCallJob(ctx.organizationId, id, 'analyze', sb)");
  });

  it('E3/D5/W5 · los DOS paneles leen `deduped` y `dedupe_checked`, y el texto degradado no promete lo que no se pudo comprobar', () => {
    for (const p of [SRC(PANEL_T), SRC(PANEL_A)]) {
      expect(p).toContain('json.data?.deduped');
      expect(p).toContain('json.data?.dedupe_checked');
      expect(p).toMatch(/ya (hab[íi]a|hay)/i);
      expect(p).toContain('No se pudo comprobar');
    }
  });
});
