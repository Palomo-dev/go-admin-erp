import { JobRetryableError, type JobHandler } from '../types';
import { deleteRecording } from '@/lib/services/crm/recordingStorageService';
import { getTwilioClientForOrg, VoiceNotConfiguredError } from '@/lib/services/crm/voiceContextService';

/**
 * Job `recording_cleanup` (FASE-03 §4.4; reemplaza el placeholder de F0).
 * Lo encola el scheduler una vez al día por org (`recording_cleanup:{yyyy-mm-dd}`).
 *
 * Borra grabaciones `ready` con `retention_until < hoy` (lotes de 200):
 * objeto en Storage + `DELETE /Recordings/{Sid}.json` en Twilio (si hay
 * credenciales REST) + `status='deleted'`. Cada borrado es idempotente; un
 * fallo individual no detiene el lote (se cuenta en `failed`). Si quedan más
 * de 200 pendientes el job devuelve `remaining > 0` y el siguiente día continúa.
 */
export const CLEANUP_BATCH = 200;

export const recordingCleanupHandler: JobHandler = async ({ supabase, orgId, log, signal }) => {
  const today = new Date().toISOString().slice(0, 10);
  const { data, error, count } = await supabase
    .from('call_recordings')
    .select('id, provider_recording_sid', { count: 'exact' })
    .eq('organization_id', orgId)
    .eq('status', 'ready')
    .lt('retention_until', today)
    .order('retention_until', { ascending: true })
    .limit(CLEANUP_BATCH);
  if (error) throw new JobRetryableError(`select call_recordings: ${error.message}`);

  const rows = (data ?? []) as { id: string; provider_recording_sid: string | null }[];
  if (rows.length === 0) return { deleted: 0, failed: 0, remaining: 0, cutoff: today };

  let twilio: { recordings: (sid: string) => { remove: () => Promise<unknown> } } | null = null;
  try {
    twilio = (await getTwilioClientForOrg(orgId)).client;
  } catch (err) {
    if (!(err instanceof VoiceNotConfiguredError)) throw err;
    log.warn('cleanup_without_twilio', { org_id: orgId });
  }

  let deleted = 0;
  let failed = 0;
  for (const r of rows) {
    if (signal.aborted) break;
    try {
      await deleteRecording(r.id, orgId, supabase, twilio);
      deleted += 1;
    } catch (err) {
      failed += 1;
      log.warn('cleanup_delete_failed', { recording_id: r.id, error: err instanceof Error ? err.message : String(err) });
    }
  }
  const remaining = Math.max(0, (count ?? rows.length) - deleted);
  log.info('recording_cleanup_done', { deleted, failed, remaining, cutoff: today });
  if (signal.aborted && remaining > 0) throw new JobRetryableError(`aborted con ${remaining} pendientes`);
  return { deleted, failed, remaining, cutoff: today };
};
