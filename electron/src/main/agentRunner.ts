import { app, Notification, powerSaveBlocker } from 'electron';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import WebSocket from 'ws';
import os from 'os';
import {
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  POLL_INTERVAL_MS,
  HEARTBEAT_INTERVAL_MS,
  DISCOVERY_PORT,
} from './constants';
import {
  loadConfig,
  saveConfig,
  saveRefreshToken,
  loadRefreshToken,
  clearRefreshToken,
  clearConfig,
} from './store';

export interface AgentStatus {
  running: boolean;
  email: string | null;
  organizationName: string | null;
  branchNames: string[];
  lastHeartbeatAt: string | null;
  jobsPrinted: number;
  jobsFailed: number;
}

let supabase: SupabaseClient | null = null;
let running = false;
let lastHeartbeatAt: string | null = null;
let jobsPrinted = 0;
let jobsFailed = 0;
let processing = false;
const processedIds = new Set<string>();
const timers: NodeJS.Timeout[] = [];
let reconnectTimer: NodeJS.Timeout | null = null;
let reconnectAttempts = 0;

/**
 * Reintentos para errores transitorios de impresión (red o impresora USB
 * offline/sin conexión). Los errores de configuración no son retryable.
 */
const MAX_PRINT_RETRIES = 5;
const NETWORK_ERROR_CODES = ['ETIMEDOUT', 'ECONNREFUSED', 'EHOSTUNREACH', 'ENETUNREACH', 'ECONNRESET'];
const RETRYABLE_USB_PATTERNS = [
  /usar sin conexión/i,
  /workoffline/i,
  /estado ["']?offline["']?/i,
  /estado ["']?error["']?/i,
  /estado ["']?notavailable["']?/i,
  /openprinter failed/i,
  /trabajo en spooler quedó en estado/i,
];

function isRetryablePrintError(message: string): boolean {
  if (NETWORK_ERROR_CODES.some((c) => message.includes(c))) return true;
  return RETRYABLE_USB_PATTERNS.some((re) => re.test(message));
}
let powerSaveBlockerId: number | null = null;
let consecutivePollFailures = 0;
let agentConfig: { refreshToken: string; organizationId: number; organizationName: string; branchIds: number[]; branchNames: string[] } | null = null;

function showNotification(title: string, body: string): void {
  if (Notification.isSupported()) {
    new Notification({ title, body, silent: false }).show();
  }
}

function scheduleReconnect(): void {
  if (reconnectTimer) return;
  reconnectAttempts++;
  const delay = Math.min(30000, 5000 * reconnectAttempts);
  console.log(`[agent] Reintentando conexión en ${delay / 1000}s (intento ${reconnectAttempts})...`);
  reconnectTimer = setTimeout(async () => {
    reconnectTimer = null;
    if (!agentConfig) return;
    try {
      console.log('[agent] Reconectando...');
      stopAgent();
      await startAgent(
        agentConfig.refreshToken,
        agentConfig.organizationId,
        agentConfig.organizationName,
        agentConfig.branchIds,
        agentConfig.branchNames,
      );
      reconnectAttempts = 0;
    } catch (err) {
      console.error('[agent] Reconexión falló:', err);
      scheduleReconnect();
    }
  }, delay);
}

function getClient(): SupabaseClient {
  if (!supabase) {
    supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: true },
      realtime: { transport: WebSocket as any },
    });
  }
  return supabase;
}

function primeAgentEnv(): void {
  const cfg = loadConfig();
  process.env.SUPABASE_URL = SUPABASE_URL;
  process.env.SUPABASE_ANON_KEY = SUPABASE_ANON_KEY;
  process.env.AGENT_EMAIL = cfg.email || 'desktop@local';
  process.env.AGENT_PASSWORD = 'unused-in-desktop';
  process.env.AGENT_NAME = cfg.agentName || `Desktop - ${os.hostname()}`;
  process.env.DISCOVERY_PORT = String(DISCOVERY_PORT);
}

export async function startAgent(
  refreshToken: string,
  organizationId: number,
  organizationName: string,
  branchIds: number[],
  branchNames: string[],
): Promise<void> {
  stopAgent();

  saveConfig({ organizationId, organizationName, branchIds, branchNames });
  saveRefreshToken(refreshToken);
  primeAgentEnv();

  // Guardar config para reconexión automática
  agentConfig = { refreshToken, organizationId, organizationName, branchIds, branchNames };

  const { data, error } = await Promise.race([
    getClient().auth.refreshSession({ refresh_token: refreshToken }),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Timeout restaurando sesión')), 10000)),
  ]);
  if (error || !data.session) {
    throw new Error('No se pudo restaurar la sesión con el refresh token');
  }
  saveRefreshToken(data.session.refresh_token);

  const { startDiscoveryServer } = await import('../agent/discoveryServer.js');
  const { printToDevice } = await import('../agent/printerDrivers.js');

  const cfg = loadConfig();
  const agentName = cfg.agentName || `Desktop - ${os.hostname()}`;
  const client = getClient();

  const heartbeat = async () => {
    for (const branchId of branchIds) {
      const { error: hbError } = await client.from('print_agents').upsert(
        {
          organization_id: organizationId,
          branch_id: branchId,
          agent_name: agentName,
          status: 'online',
          last_seen_at: new Date().toISOString(),
          app_version: app.getVersion(),
          platform: 'desktop',
        },
        { onConflict: 'organization_id,branch_id,agent_name' },
      );
      if (!hbError) lastHeartbeatAt = new Date().toISOString();
      else console.error(`[heartbeat] error (branch ${branchId}):`, hbError.message);
    }
  };

  const processJob = async (job: any) => {
    if (processedIds.has(job.id)) return;
    processedIds.add(job.id);

    const { data: printer } = await client
      .from('printers')
      .select('*')
      .eq('id', job.printer_id)
      .maybeSingle();

    if (!printer || !printer.is_active) {
      jobsFailed++;
      showNotification('Error de impresión', `Impresora no encontrada o inactiva (job ${job.id.slice(0, 8)})`);
      await client
        .from('print_jobs')
        .update({ status: 'error', error_message: 'Impresora no encontrada o inactiva' })
        .eq('id', job.id);
      return;
    }

    try {
      await printToDevice(printer, job.job_type, job.payload);
      jobsPrinted++;
      await client
        .from('print_jobs')
        .update({ status: 'printed', printed_at: new Date().toISOString() })
        .eq('id', job.id);
    } catch (err: any) {
      jobsFailed++;
      const message = String(err.message || err);
      showNotification('Error de impresión', `${message.slice(0, 100)}`);

      const retryCount = (job.retry_count || 0) + 1;
      if (isRetryablePrintError(message) && retryCount <= MAX_PRINT_RETRIES) {
        // Error transitorio (impresora offline, sin conexión, red): liberar el
        // job para que se reintente automáticamente (este u otro agente).
        console.log(`[print_jobs] job ${job.id} liberado para reintento (${retryCount}/${MAX_PRINT_RETRIES}) — ${message.slice(0, 80)}`);
        await client
          .from('print_jobs')
          .update({ status: 'pending', retry_count: retryCount, error_message: message })
          .eq('id', job.id);
        processedIds.delete(job.id);
        return;
      }

      await client
        .from('print_jobs')
        .update({ status: 'error', error_message: message, retry_count: retryCount })
        .eq('id', job.id);
    }
  };

  const pollPendingJobs = async () => {
    if (processing) return;
    processing = true;
    try {
      const { data, error } = await client
        .from('print_jobs')
        .select('*')
        .eq('organization_id', organizationId)
        .in('branch_id', branchIds)
        .eq('status', 'pending')
        .order('created_at', { ascending: true })
        .limit(20);

      if (error) throw error;
      consecutivePollFailures = 0;

      for (const job of data || []) {
        await processJob(job);
      }
    } catch (err) {
      consecutivePollFailures++;
      console.error(`[agent] Error en polling (${consecutivePollFailures}):`, err);
      if (consecutivePollFailures >= 3) {
        consecutivePollFailures = 0;
        scheduleReconnect();
      }
    } finally {
      processing = false;
    }
  };

  for (const branchId of branchIds) {
    client
      .channel(`print_jobs-branch-${branchId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'print_jobs', filter: `branch_id=eq.${branchId}` },
        (payload) => {
          processJob(payload.new).catch((err) => console.error('[realtime] error:', err));
        },
      )
      .on('system', { event: 'disconnected' }, () => {
        console.warn('[agent] Realtime desconectado, iniciando reconexión...');
        scheduleReconnect();
      })
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn(`[agent] Canal realtime branch ${branchId}: ${status}, reconectando...`);
          scheduleReconnect();
        }
      });
  }

  // Evita que Windows suspenda el proceso cuando la ventana está en la bandeja.
  // Sin esto, el OS congela timers y WebSocket y los jobs quedan en pending.
  if (powerSaveBlockerId === null) {
    powerSaveBlockerId = powerSaveBlocker.start('prevent-app-suspension');
  }

  startDiscoveryServer();

  await heartbeat();
  timers.push(setInterval(heartbeat, HEARTBEAT_INTERVAL_MS));

  await pollPendingJobs();
  timers.push(setInterval(pollPendingJobs, POLL_INTERVAL_MS));

  running = true;
  console.log(`[agent] Corriendo: ${organizationName} → ${branchNames.join(', ')}`);
}

export function stopAgent(): void {
  timers.forEach(clearInterval);
  timers.length = 0;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  reconnectAttempts = 0;
  consecutivePollFailures = 0;
  if (powerSaveBlockerId !== null) {
    if (powerSaveBlocker.isStarted(powerSaveBlockerId)) {
      powerSaveBlocker.stop(powerSaveBlockerId);
    }
    powerSaveBlockerId = null;
  }
  if (supabase) {
    supabase.removeAllChannels();
    supabase = null;
  }
  running = false;
}

export async function markOffline(): Promise<void> {
  const cfg = loadConfig();
  if (!supabase || !cfg.organizationId || !cfg.branchIds) return;
  const agentName = cfg.agentName || `Desktop - ${os.hostname()}`;
  for (const branchId of cfg.branchIds) {
    await supabase
      .from('print_agents')
      .update({ status: 'offline' })
      .eq('organization_id', cfg.organizationId)
      .eq('branch_id', branchId)
      .eq('agent_name', agentName);
  }
}

export async function tryAutoStart(): Promise<boolean> {
  const cfg = loadConfig();
  try {
    const refreshToken = loadRefreshToken();
    if (!refreshToken) return false;

    if (cfg.organizationId && cfg.branchIds?.length) {
      await startAgent(
        refreshToken,
        cfg.organizationId,
        cfg.organizationName || `Org ${cfg.organizationId}`,
        cfg.branchIds,
        cfg.branchNames || [],
      );
      return true;
    }
  } catch (err) {
    console.error('[agent] Auto-start falló:', err);
    clearRefreshToken();
  }
  return false;
}

export function getStatus(): AgentStatus {
  const cfg = loadConfig();
  return {
    running,
    email: cfg.email || null,
    organizationName: cfg.organizationName || null,
    branchNames: cfg.branchNames || [],
    lastHeartbeatAt,
    jobsPrinted,
    jobsFailed,
  };
}

export function logout(): void {
  stopAgent();
  clearConfig();
  clearRefreshToken();
}
