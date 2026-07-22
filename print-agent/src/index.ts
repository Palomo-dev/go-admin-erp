import { config } from './config';
import { supabase, signInAgent } from './supabaseClient';
import { printToDevice } from './printerDrivers';
import { startDiscoveryServer } from './discoveryServer';
import { resolveAgentConfig, type AgentRuntimeConfig } from './agentSetup';
import type { PrinterRow, PrintJobRow } from './types';

let processing = false;
const processedIds = new Set<string>();
let runtimeConfig: AgentRuntimeConfig | null = null;

// Máximo de reintentos antes de marcar un job como 'error' definitivo.
// Permite que, si este equipo no tiene acceso de red a la impresora
// (ej. otra sucursal/WiFi), otro Print Agent con acceso pueda tomarlo.
const MAX_PRINT_RETRIES = 5;

const NETWORK_ERROR_CODES = ['ETIMEDOUT', 'ECONNREFUSED', 'EHOSTUNREACH', 'ENETUNREACH', 'ECONNRESET'];

function isNetworkUnreachableError(message: string): boolean {
  return NETWORK_ERROR_CODES.some((code) => message.includes(code));
}

async function heartbeat(): Promise<void> {
  if (!runtimeConfig) return;
  for (const branchId of runtimeConfig.branchIds) {
    const { error } = await supabase
      .from('print_agents')
      .upsert(
        {
          organization_id: runtimeConfig.organizationId,
          branch_id: branchId,
          agent_name: config.agentName,
          status: 'online',
          last_seen_at: new Date().toISOString(),
        },
        { onConflict: 'organization_id,branch_id,agent_name' }
      );

    if (error) console.error(`[heartbeat] error (branch ${branchId}):`, error.message);
  }
}

async function markOffline(): Promise<void> {
  if (!runtimeConfig) return;
  for (const branchId of runtimeConfig.branchIds) {
    await supabase
      .from('print_agents')
      .update({ status: 'offline' })
      .eq('organization_id', runtimeConfig.organizationId)
      .eq('branch_id', branchId)
      .eq('agent_name', config.agentName);
  }
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

  if (job.status !== 'pending') return;

  // Claim atómico: si hay más de un Print Agent corriendo (ej. 2 equipos en la
  // misma sucursal), solo uno debe procesar cada job. Se marca 'sent' como
  // reclamado; si 0 filas se actualizan, otro agente ya lo tomó.
  const { data: claimed, error: claimError } = await supabase
    .from('print_jobs')
    .update({ status: 'sent' })
    .eq('id', job.id)
    .eq('status', 'pending')
    .select('id');

  if (claimError) {
    console.error(`[print_jobs] error reclamando job ${job.id}:`, claimError.message);
    return;
  }
  if (!claimed || claimed.length === 0) {
    console.log(`[print_jobs] job ${job.id} ya fue reclamado por otro agente, omitiendo`);
    return;
  }

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
    const message = String(err.message || err);
    console.error(`[print_jobs] error imprimiendo job ${job.id}:`, message);

    const retryCount = (job.retry_count || 0) + 1;
    if (isNetworkUnreachableError(message) && retryCount <= MAX_PRINT_RETRIES) {
      // No fue un error de impresión en sí, sino de conectividad de red de
      // ESTE equipo hacia la impresora. Se libera el job para que otro
      // Print Agent (con acceso a esa red) pueda reclamarlo y reintentar.
      console.log(`[print_jobs] job ${job.id} liberado para reintento (${retryCount}/${MAX_PRINT_RETRIES}) — posible problema de red local`);
      await supabase
        .from('print_jobs')
        .update({ status: 'pending', retry_count: retryCount, error_message: message })
        .eq('id', job.id);
      // Permitir que este mismo agente también pueda reintentarlo más adelante
      // (ej. si recupera la red) sin quedar bloqueado por el Set local.
      processedIds.delete(job.id);
      return;
    }

    await supabase
      .from('print_jobs')
      .update({ status: 'error', error_message: message, retry_count: retryCount })
      .eq('id', job.id);
  }
}

/**
 * Polling de respaldo: cubre jobs creados mientras el agente estaba offline
 * o si la conexión Realtime se cae temporalmente.
 */
async function pollPendingJobs(): Promise<void> {
  if (processing || !runtimeConfig) return;
  processing = true;
  try {
    const { data, error } = await supabase
      .from('print_jobs')
      .select('*')
      .eq('organization_id', runtimeConfig.organizationId)
      .in('branch_id', runtimeConfig.branchIds)
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
  if (!runtimeConfig) return;
  for (const branchId of runtimeConfig.branchIds) {
    supabase
      .channel(`print_jobs-branch-${branchId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'print_jobs',
          filter: `branch_id=eq.${branchId}`,
        },
        (payload) => {
          processJob(payload.new as PrintJobRow).catch((err) =>
            console.error('[realtime] error procesando job:', err)
          );
        }
      )
      .subscribe((status) => {
        console.log(`[realtime] branch ${branchId} - estado: ${status}`);
      });
  }
}

async function main(): Promise<void> {
  console.log(`Iniciando GO Admin Print Agent — "${config.agentName}"`);

  await signInAgent();
  console.log('Autenticado correctamente.');

  // Detectar organización y sucursal dinámicamente
  runtimeConfig = await resolveAgentConfig();
  console.log(`[setup] Organización: ${runtimeConfig.organizationName} (ID: ${runtimeConfig.organizationId})`);
  console.log(`[setup] Sucursales: ${runtimeConfig.branchNames.join(', ')} (IDs: ${runtimeConfig.branchIds.join(', ')})`);

  // Iniciar servidor de descubrimiento (detección de impresoras)
  startDiscoveryServer();

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
