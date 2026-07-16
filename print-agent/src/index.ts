import { config } from './config';
import { supabase, signInAgent } from './supabaseClient';
import { printToDevice } from './printerDrivers';
import type { PrinterRow, PrintJobRow } from './types';

let processing = false;
const processedIds = new Set<string>();

async function heartbeat(): Promise<void> {
  const { error } = await supabase
    .from('print_agents')
    .upsert(
      {
        organization_id: config.organizationId,
        branch_id: config.branchId,
        agent_name: config.agentName,
        status: 'online',
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: 'organization_id,branch_id,agent_name' }
    );

  if (error) console.error('[heartbeat] error:', error.message);
}

async function markOffline(): Promise<void> {
  await supabase
    .from('print_agents')
    .update({ status: 'offline' })
    .eq('organization_id', config.organizationId)
    .eq('branch_id', config.branchId)
    .eq('agent_name', config.agentName);
}

async function fetchPrinter(printerId: string): Promise<PrinterRow | null> {
  const { data, error } = await supabase.from('printers').select('*').eq('id', printerId).maybeSingle();
  if (error) {
    console.error(`[printers] error obteniendo impresora ${printerId}:`, error.message);
    return null;
  }
  return data as PrinterRow | null;
}

async function processJob(job: PrintJobRow): Promise<void> {
  if (processedIds.has(job.id)) return;
  processedIds.add(job.id);

  console.log(`[print_jobs] procesando job ${job.id} (${job.job_type}, estación: ${job.station})`);

  const printer = await fetchPrinter(job.printer_id);
  if (!printer || !printer.is_active) {
    await supabase
      .from('print_jobs')
      .update({ status: 'error', error_message: 'Impresora no encontrada o inactiva' })
      .eq('id', job.id);
    return;
  }

  try {
    await printToDevice(printer, job.job_type, job.payload);
    await supabase
      .from('print_jobs')
      .update({ status: 'printed', printed_at: new Date().toISOString() })
      .eq('id', job.id);
    console.log(`[print_jobs] job ${job.id} impreso correctamente en "${printer.name}"`);
  } catch (err: any) {
    console.error(`[print_jobs] error imprimiendo job ${job.id}:`, err.message || err);
    await supabase
      .from('print_jobs')
      .update({ status: 'error', error_message: String(err.message || err) })
      .eq('id', job.id);
  }
}

/**
 * Polling de respaldo: cubre jobs creados mientras el agente estaba offline
 * o si la conexión Realtime se cae temporalmente.
 */
async function pollPendingJobs(): Promise<void> {
  if (processing) return;
  processing = true;
  try {
    const { data, error } = await supabase
      .from('print_jobs')
      .select('*')
      .eq('organization_id', config.organizationId)
      .eq('branch_id', config.branchId)
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(20);

    if (error) {
      console.error('[poll] error consultando print_jobs:', error.message);
      return;
    }

    for (const job of data || []) {
      await processJob(job as PrintJobRow);
    }
  } finally {
    processing = false;
  }
}

function subscribeRealtime(): void {
  supabase
    .channel(`print_jobs-branch-${config.branchId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'print_jobs',
        filter: `branch_id=eq.${config.branchId}`,
      },
      (payload) => {
        processJob(payload.new as PrintJobRow).catch((err) =>
          console.error('[realtime] error procesando job:', err)
        );
      }
    )
    .subscribe((status) => {
      console.log(`[realtime] estado de suscripción: ${status}`);
    });
}

async function main(): Promise<void> {
  console.log(`Iniciando GO Admin Print Agent — "${config.agentName}" (org ${config.organizationId}, sucursal ${config.branchId})`);

  await signInAgent();
  console.log('Autenticado correctamente.');

  await heartbeat();
  setInterval(heartbeat, config.heartbeatIntervalMs);

  subscribeRealtime();

  await pollPendingJobs();
  setInterval(pollPendingJobs, config.pollIntervalMs);

  console.log('Agente en ejecución. Esperando trabajos de impresión...');
}

process.on('SIGINT', async () => {
  console.log('\nDeteniendo agente...');
  await markOffline();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await markOffline();
  process.exit(0);
});

main().catch((err) => {
  console.error('Error fatal iniciando el agente:', err);
  process.exit(1);
});
