import { app, Notification } from 'electron';
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
      showNotification('Go Admin Desktop', 'Agente reconectado correctamente');
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

  const { data, error } = await getClient().auth.refreshSession({ refresh_token: refreshToken });
  if (error || !data.session) {
    throw new Error('No se pudo restaurar la sesión con el refresh token');
  }
  saveRefreshToken(data.session.refresh_token);

  const { startDiscoveryServer } = await import('../agent/discoveryServer');
  const { printToDevice } = await import('../agent/printerDrivers');

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
      showNotification('Error de impresión', `${String(err.message || err).slice(0, 100)}`);
      await client
        .from('print_jobs')
        .update({ status: 'error', error_message: String(err.message || err) })
        .eq('id', job.id);
    }
  };

  const pollPendingJobs = async () => {
    if (processing) return;
    processing = true;
    try {
      const { data } = await client
        .from('print_jobs')
        .select('*')
        .eq('organization_id', organizationId)
        .in('branch_id', branchIds)
        .eq('status', 'pending')
        .order('created_at', { ascending: true })
        .limit(20);

      for (const job of data || []) {
        await processJob(job);
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
        showNotification('Go Admin Desktop', 'Conexión perdida, reconectando...');
        scheduleReconnect();
      })
      .subscribe();
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
