import type { SupabaseClient } from '@supabase/supabase-js';
import { enqueueJob } from '@/lib/jobs/enqueue';

/**
 * Programación del barrido de respaldo de secuencias (kind `time_events`).
 *
 * Vive en su propio módulo —y no en `timeEvents.ts`— porque lo necesitan a la
 * vez el handler del job y `sequenceService` (que resiembra el barrido cuando
 * el encadenamiento no consigue encolar el paso siguiente). Ponerlo en el
 * handler crearía un ciclo de importación con `sequenceService`.
 *
 * Ronda 3 (tester N9): la programación encadenada convirtió este barrido en
 * pieza de carga —es la única red cuando `advanceChain` falla—, así que aquí
 * está la parte delicada: **no puede quedarse sin sucesor**.
 */

/** Cada cuánto se repite el barrido mientras haya inscripciones vivas. */
export const SEQUENCE_SWEEP_INTERVAL_MS = 15 * 60 * 1000;
/** Pasos vencidos procesados por barrido. */
export const SEQUENCE_SWEEP_BATCH = 50;

export function sequenceSweepDedupeKey(orgId: number): string {
  return `time_events:${orgId}`;
}

/** ¿Quedan inscripciones vivas en la organización? */
export async function hasLiveEnrollments(orgId: number, supabase: SupabaseClient): Promise<boolean> {
  const { data, error } = await supabase
    .from('sequence_enrollments')
    .select('id')
    .eq('organization_id', orgId)
    .in('status', ['active', 'paused'])
    .limit(1);
  if (error) throw new Error(`hasLiveEnrollments: ${error.message}`);
  return ((data ?? []) as unknown[]).length > 0;
}

/** ¿Hay ya un barrido en cola (sin contar el que se está ejecutando)? */
async function hasQueuedSweep(
  orgId: number,
  supabase: SupabaseClient,
  excludeJobId?: string | null,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('outbound_jobs')
    .select('id')
    .eq('organization_id', orgId)
    .eq('kind', 'time_events')
    .in('status', ['queued', 'running'])
    .limit(5);
  if (error) throw new Error(`hasQueuedSweep: ${error.message}`);
  return ((data ?? []) as { id: string }[]).some((j) => j.id !== excludeJobId);
}

/**
 * Programa (o reprograma) el barrido de una organización.
 *
 * **El detalle que mataba la cadena (encontrado en la ronda 3, ver informe):**
 * `fn_enqueue_job` deduplica por `(organization_id, dedupe_key)` sobre
 * `status IN ('queued','running')` y, al chocar, DEVUELVE el id del job vivo.
 * Cuando el propio handler del barrido se reprogramaba a sí mismo, el job vivo
 * que chocaba era **él mismo** (está `running` mientras corre el handler): la
 * llamada no creaba nada y devolvía su propio id. Al completarse quedaba cero
 * barridos en cola, así que la cadena de barridos se apagaba tras la PRIMERA
 * vuelta, no solo cuando fallaba.
 *
 * Solución: si el id devuelto es el del job que está corriendo, se comprueba
 * que no haya ya otro barrido en cola y se encola el sucesor **sin clave de
 * deduplicación** (el índice parcial solo aplica a claves no nulas). Ese
 * sucesor, cuando le toque, recuperará la clave estable —para entonces el job
 * anterior ya estará `done`— y la cadena vuelve a ser singleton por sí sola.
 *
 * Devuelve el id del job sucesor, o `null` si ya había otro barrido en cola.
 */
export async function scheduleSequenceSweep(
  orgId: number,
  supabase: SupabaseClient,
  delayMs = SEQUENCE_SWEEP_INTERVAL_MS,
  currentJobId?: string | null,
): Promise<string | null> {
  const runAt = new Date(Date.now() + delayMs);
  const jobId = await enqueueJob({
    organizationId: orgId,
    kind: 'time_events',
    payload: { scope: 'sequences' },
    runAt,
    dedupeKey: sequenceSweepDedupeKey(orgId),
    maxAttempts: 3,
    supabase,
  });

  if (!currentJobId || jobId !== currentJobId) return jobId;

  // Chocó consigo mismo: la clave estable la retiene este job, que está
  // `running`. Sin esto la cadena se apaga aquí.
  if (await hasQueuedSweep(orgId, supabase, currentJobId)) return null;

  return enqueueJob({
    organizationId: orgId,
    kind: 'time_events',
    payload: { scope: 'sequences', chained_from: currentJobId },
    runAt,
    maxAttempts: 3,
    supabase,
  });
}
