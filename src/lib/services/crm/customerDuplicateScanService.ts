import type { SupabaseClient } from '@supabase/supabase-js';
import {
  confirmarDuplicados,
  type GrupoDuplicado,
} from './customerDuplicatesLogica';
import { defaultCountryOf, getOrgSettings } from './whatsapp/channelService';
import type { JobContext } from '@/lib/jobs/types';
import { JobRetryableError } from '@/lib/jobs/types';

export async function buscarDuplicados(org: number, supabase: SupabaseClient) {
  const [{ data, error }, settings] = await Promise.all([
    supabase.rpc('crm_find_duplicates', { p_org: org }),
    getOrgSettings(org, supabase),
  ]);
  if (error) throw error;
  return confirmarDuplicados(
    (data ?? []) as GrupoDuplicado[],
    defaultCountryOf(settings),
  );
}

export async function ejecutarBusquedaDuplicados({
  job,
  orgId,
  supabase,
  signal,
}: JobContext) {
  const id = job.payload.scan_id;
  if (typeof id !== 'string') throw new Error('scan_id requerido');
  const { data: scan, error: missing } = await supabase
    .from('customer_duplicate_scans')
    .select('id,status')
    .eq('id', id)
    .eq('organization_id', orgId)
    .eq('job_id', job.id)
    .maybeSingle();
  if (missing) throw new JobRetryableError('No se pudo leer la búsqueda');
  if (!scan) throw new Error('Búsqueda no encontrada en la organización');
  if (scan.status === 'done') return { scan_id: id, already_done: true };
  const { error: started } = await supabase
    .from('customer_duplicate_scans')
    .update({ status: 'running' })
    .eq('id', id)
    .eq('organization_id', orgId);
  if (started) throw new JobRetryableError('No se pudo iniciar la búsqueda');
  try {
    if (signal.aborted) throw new Error('aborted');
    const groups = await buscarDuplicados(orgId, supabase);
    const total = groups.reduce((n, g) => n + g.customers.length, 0);
    if (signal.aborted) throw new Error('aborted');
    const { error } = await supabase
      .from('customer_duplicate_scans')
      .update({
        status: 'done',
        groups,
        total,
        processed: total,
        completed_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('organization_id', orgId);
    if (error) throw error;
    return { scan_id: id, groups: groups.length, processed: total };
  } catch {
    const { error } = await supabase
      .from('customer_duplicate_scans')
      .update({ status: 'failed' })
      .eq('id', id)
      .eq('organization_id', orgId);
    if (error)
      throw new JobRetryableError(
        'No se pudo registrar el fallo de la búsqueda',
      );
    throw new JobRetryableError(
      'No se pudo completar la búsqueda de duplicados',
    );
  }
}
