/**
 * Smoke test manual de la cola CRM (FASE-00 §9.3).
 *
 *   npx tsx scripts/crm-jobs-smoke.ts [--kind noop|maintenance|crm_event] [--org 105] [--url http://localhost:3000] [--keep]
 *
 * 1. Encola un job con service_role:
 *      - `noop` (default; en el CHECK desde DB-r2): `fn_enqueue_job` (dedupe `smoke:noop:{ts}`).
 *      - `maintenance`: igual, y la respuesta incluye además `scheduled.maintenance`
 *        (el productor F-1 ejecuta `runMaintenance` inline antes de drenar).
 *      - `crm_event`: `fn_emit_crm_event(org,'smoke.ping','smoke',uuid)` → la RPC
 *        encola el job `crm_event:{id}`; sin listeners el evento acaba `skipped`.
 * 2. Llama a `{url}/api/crm/jobs/run?kind=bogus` (espera 400), sin header
 *    (espera 401) y con `Authorization: Bearer $CRON_SECRET` (espera 200 + resumen).
 * 3. Relee el job (y el evento) y muestra su estado final.
 * 4. BORRA sus propias filas (`outbound_jobs` por id y `crm_events` por id) para
 *    no dejar basura en la org (tester r1 #44). `--keep` las conserva.
 *
 * Requiere `.env.local` con NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * y CRON_SECRET, y `npm run dev` corriendo. No imprime secretos.
 */
import * as fs from 'fs';
import * as path from 'path';

const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
  }
}

require('tsconfig-paths/register');

function arg(name: string, fallback: string): string {
  const idx = process.argv.indexOf(`--${name}`);
  return idx >= 0 && process.argv[idx + 1] ? process.argv[idx + 1] : fallback;
}

async function main() {
  const { createClient } = await import('@supabase/supabase-js');
  const { randomUUID } = await import('crypto');
  const { enqueueJob, emitCrmEvent } = await import('../src/lib/jobs/enqueue');

  const kind = arg('kind', 'noop') as 'noop' | 'maintenance' | 'crm_event';
  if (!['noop', 'maintenance', 'crm_event'].includes(kind)) throw new Error(`--kind inválido "${kind}" (noop|maintenance|crm_event)`);
  const orgId = Number(arg('org', '105'));
  if (!Number.isInteger(orgId) || orgId <= 0) throw new Error('--org debe ser un entero positivo');
  const baseUrl = arg('url', 'http://localhost:3000').replace(/\/$/, '');
  const keep = process.argv.includes('--keep');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) throw new Error('CRON_SECRET no está en .env.local');

  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let jobId: string | null = null;
  let eventId: string | null = null;
  const cleanup = async () => {
    if (keep) return;
    if (jobId) {
      const { error } = await sb.from('outbound_jobs').delete().eq('id', jobId).eq('organization_id', orgId);
      console.log(`[smoke] limpieza: job ${jobId} ${error ? `NO borrado (${error.message})` : 'borrado'}`);
    }
    if (eventId) {
      const { error } = await sb.from('crm_events').delete().eq('id', eventId).eq('organization_id', orgId);
      console.log(`[smoke] limpieza: evento ${eventId} ${error ? `NO borrado (${error.message})` : 'borrado'}`);
    }
  };

  try {
    await run();
  } finally {
    await cleanup();
  }

  async function run() {
  if (kind === 'crm_event') {
    eventId = await emitCrmEvent({ organizationId: orgId, type: 'smoke.ping', entityType: 'smoke', entityId: randomUUID(), payload: { smoke: true }, supabase: sb });
    const { data: job } = await sb.from('outbound_jobs').select('id').eq('organization_id', orgId).eq('dedupe_key', `crm_event:${eventId}`).maybeSingle();
    if (!job) throw new Error('fn_emit_crm_event no encoló el job crm_event (tester #2)');
    jobId = job.id;
    console.log(`[smoke] evento ${eventId} emitido; job crm_event ${jobId} encolado por la RPC (org=${orgId})`);
  } else {
    const dedupeKey = `smoke:${kind}:${Date.now()}`;
    jobId = await enqueueJob({ organizationId: orgId, kind, payload: { smoke: true }, dedupeKey, maxAttempts: 1, supabase: sb });
    console.log(`[smoke] job encolado ${jobId} (kind=${kind}, org=${orgId})`);
  }

  const bogus = await fetch(`${baseUrl}/api/crm/jobs/run?kind=bogus`, { headers: { Authorization: `Bearer ${cronSecret}` } });
  console.log(`[smoke] ?kind=bogus con header → HTTP ${bogus.status} (esperado 400, F-3)`);
  if (bogus.status !== 400) throw new Error('Un kind inválido no devolvió 400 (drenaría toda la cola)');

  const unauth = await fetch(`${baseUrl}/api/crm/jobs/run`, { method: 'POST' });
  console.log(`[smoke] sin header → HTTP ${unauth.status} (esperado 401)`);
  if (unauth.status !== 401) throw new Error('El endpoint NO es fail-closed');

  const res = await fetch(`${baseUrl}/api/crm/jobs/run`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cronSecret}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ kinds: [kind], worker: 'smoke-script' }),
  });
  const body = await res.json();
  console.log(`[smoke] con header → HTTP ${res.status}`, JSON.stringify(body));
  if (res.status !== 200) throw new Error('El runner no devolvió 200');

  const { data: job } = await sb.from('outbound_jobs').select('id, status, attempts, last_error, result').eq('id', jobId).maybeSingle();
  console.log('[smoke] estado final del job:', JSON.stringify(job));
  if (job?.status !== 'done') throw new Error(`El job no terminó en done (status=${job?.status})`);
  if (eventId) {
    const { data: ev } = await sb.from('crm_events').select('id, status, processed_at, attempts, last_error').eq('id', eventId).maybeSingle();
    console.log('[smoke] estado final del evento:', JSON.stringify(ev));
    if (ev?.status !== 'skipped') throw new Error(`El evento no quedó skipped (status=${ev?.status})`);
  }
  console.log('[smoke] OK');
  }
}

main().catch((err) => {
  console.error('[smoke] FALLO:', err instanceof Error ? err.message : err);
  process.exit(1);
});
