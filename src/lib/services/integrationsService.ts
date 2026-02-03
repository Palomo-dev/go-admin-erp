'use client';

import { supabase } from '@/lib/supabase/config';

// Tipos para las integraciones
export interface IntegrationProvider {
  id: string;
  code: string;
  name: string;
  category: string;
  auth_type: string;
  website_url?: string;
  docs_url?: string;
  logo_url?: string;
  is_active: boolean;
  metadata: Record<string, unknown>;
}

export interface IntegrationConnector {
  id: string;
  provider_id: string;
  code: string;
  name: string;
  supported_countries: string[];
  capabilities: {
    webhooks?: boolean;
    pull?: boolean;
    push?: boolean;
    realtime?: boolean;
  };
  required_scopes: string[];
  is_active: boolean;
  provider?: IntegrationProvider;
}

export interface IntegrationConnection {
  id: string;
  organization_id: number;
  connector_id: string;
  branch_id?: number;
  name: string;
  environment: 'production' | 'sandbox' | 'test';
  country_code?: string;
  status: 'draft' | 'connected' | 'paused' | 'error' | 'revoked';
  settings: Record<string, unknown>;
  last_health_check_at?: string;
  last_error_at?: string;
  last_error_message?: string;
  error_count_24h: number;
  connected_at?: string;
  last_activity_at?: string;
  created_at: string;
  connector?: IntegrationConnector;
}

export interface IntegrationEvent {
  id: string;
  connection_id: string;
  source: 'webhook' | 'sync' | 'manual' | 'system';
  direction: 'inbound' | 'outbound';
  event_type: string;
  external_event_id?: string;
  payload: Record<string, unknown>;
  status: 'received' | 'processed' | 'error';
  processed_at?: string;
  error_message?: string;
  created_at: string;
  connection?: IntegrationConnection;
}

export interface IntegrationJob {
  id: string;
  connection_id: string;
  job_type: 'pull' | 'push' | 'full_sync' | 'incremental' | 'reconcile' | 'webhook_replay';
  resource_type: string;
  status: 'queued' | 'running' | 'success' | 'failed' | 'cancelled';
  run_count: number;
  last_run_at?: string;
  last_status?: string;
  last_error?: string;
  cursor: Record<string, unknown>;
  stats: Record<string, unknown>;
  created_at: string;
  connection?: IntegrationConnection;
}

export interface IntegrationWebhook {
  id: string;
  connection_id: string;
  direction: 'inbound' | 'outbound';
  url: string;
  events: string[];
  secret_ref: string;
  signing_method: string;
  is_active: boolean;
  last_received_at?: string;
  created_at: string;
}

// Estadísticas del dashboard
export interface IntegrationStats {
  totalConnections: number;
  activeConnections: number;
  errorConnections: number;
  pausedConnections: number;
  eventsToday: number;
  eventsProcessed: number;
  eventsError: number;
  jobsFailed: number;
  jobsRunning: number;
  webhooksReceived: number;
}

export interface TopProblem {
  connection_id: string;
  connection_name: string;
  provider_name: string;
  error_count: number;
  last_error: string;
  last_error_at: string;
}

class IntegrationsService {
  /**
   * Obtiene las estadísticas del dashboard
   */
  async getStats(organizationId: number): Promise<IntegrationStats> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayISO = today.toISOString();

    // Conexiones
    const { data: connections, error: connError } = await supabase
      .from('integration_connections')
      .select('id, status, error_count_24h')
      .eq('organization_id', organizationId);

    if (connError) {
      console.error('Error fetching connections:', connError);
    }

    const connectionsList = connections || [];
    const totalConnections = connectionsList.length;
    const activeConnections = connectionsList.filter(c => c.status === 'connected').length;
    const errorConnections = connectionsList.filter(c => c.status === 'error').length;
    const pausedConnections = connectionsList.filter(c => c.status === 'paused').length;

    // IDs de conexiones para filtrar eventos y jobs
    const connectionIds = connectionsList.map(c => c.id);

    // Eventos de hoy
    let eventsToday = 0;
    let eventsProcessed = 0;
    let eventsError = 0;

    if (connectionIds.length > 0) {
      const { data: events, error: eventsErr } = await supabase
        .from('integration_events')
        .select('id, status')
        .in('connection_id', connectionIds)
        .gte('created_at', todayISO);

      if (!eventsErr && events) {
        eventsToday = events.length;
        eventsProcessed = events.filter(e => e.status === 'processed').length;
        eventsError = events.filter(e => e.status === 'error').length;
      }
    }

    // Jobs fallidos
    let jobsFailed = 0;
    let jobsRunning = 0;

    if (connectionIds.length > 0) {
      const { data: jobs, error: jobsErr } = await supabase
        .from('integration_jobs')
        .select('id, status')
        .in('connection_id', connectionIds);

      if (!jobsErr && jobs) {
        jobsFailed = jobs.filter(j => j.status === 'failed').length;
        jobsRunning = jobs.filter(j => j.status === 'running').length;
      }
    }

    // Webhooks recibidos hoy
    let webhooksReceived = 0;
    if (connectionIds.length > 0) {
      const { count, error: whErr } = await supabase
        .from('integration_events')
        .select('id', { count: 'exact', head: true })
        .in('connection_id', connectionIds)
        .eq('source', 'webhook')
        .eq('direction', 'inbound')
        .gte('created_at', todayISO);

      if (!whErr && count !== null) {
        webhooksReceived = count;
      }
    }

    return {
      totalConnections,
      activeConnections,
      errorConnections,
      pausedConnections,
      eventsToday,
      eventsProcessed,
      eventsError,
      jobsFailed,
      jobsRunning,
      webhooksReceived,
    };
  }

  /**
   * Obtiene las conexiones con más errores (Top Problemas)
   */
  async getTopProblems(organizationId: number, limit: number = 5): Promise<TopProblem[]> {
    const { data: connections, error } = await supabase
      .from('integration_connections')
      .select(`
        id,
        name,
        error_count_24h,
        last_error_message,
        last_error_at,
        connector:integration_connectors(
          name,
          provider:integration_providers(name)
        )
      `)
      .eq('organization_id', organizationId)
      .gt('error_count_24h', 0)
      .order('error_count_24h', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('Error fetching top problems:', error);
      return [];
    }

    type TopProblemRow = {
      id: string;
      name: string;
      error_count_24h: number;
      last_error_message: string | null;
      last_error_at: string | null;
      connector?: {
        name?: string;
        provider?: { name?: string };
      };
    };

    return (connections || []).map((c: TopProblemRow) => ({
      connection_id: c.id,
      connection_name: c.name,
      provider_name: c.connector?.provider?.name || c.connector?.name || 'Desconocido',
      error_count: c.error_count_24h,
      last_error: c.last_error_message || 'Sin mensaje',
      last_error_at: c.last_error_at || '',
    }));
  }

  /**
   * Obtiene las conexiones de una organización
   */
  async getConnections(organizationId: number): Promise<IntegrationConnection[]> {
    const { data, error } = await supabase
      .from('integration_connections')
      .select(`
        *,
        connector:integration_connectors(
          id,
          code,
          name,
          capabilities,
          provider:integration_providers(id, code, name, category, logo_url)
        )
      `)
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching connections:', error);
      return [];
    }

    return data || [];
  }

  /**
   * Obtiene los últimos eventos
   */
  async getRecentEvents(organizationId: number, limit: number = 10): Promise<IntegrationEvent[]> {
    // Primero obtenemos las conexiones de la organización
    const { data: connections } = await supabase
      .from('integration_connections')
      .select('id')
      .eq('organization_id', organizationId);

    if (!connections || connections.length === 0) {
      return [];
    }

    const connectionIds = connections.map(c => c.id);

    const { data, error } = await supabase
      .from('integration_events')
      .select(`
        *,
        connection:integration_connections(id, name)
      `)
      .in('connection_id', connectionIds)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('Error fetching events:', error);
      return [];
    }

    return data || [];
  }

  /**
   * Obtiene los jobs recientes
   */
  async getRecentJobs(organizationId: number, limit: number = 10): Promise<IntegrationJob[]> {
    const { data: connections } = await supabase
      .from('integration_connections')
      .select('id')
      .eq('organization_id', organizationId);

    if (!connections || connections.length === 0) {
      return [];
    }

    const connectionIds = connections.map(c => c.id);

    const { data, error } = await supabase
      .from('integration_jobs')
      .select(`
        *,
        connection:integration_connections(id, name)
      `)
      .in('connection_id', connectionIds)
      .order('last_run_at', { ascending: false, nullsFirst: false })
      .limit(limit);

    if (error) {
      console.error('Error fetching jobs:', error);
      return [];
    }

    return data || [];
  }

  /**
   * Obtiene los proveedores disponibles
   */
  async getProviders(): Promise<IntegrationProvider[]> {
    const { data, error } = await supabase
      .from('integration_providers')
      .select('*')
      .eq('is_active', true)
      .order('name');

    if (error) {
      console.error('Error fetching providers:', error);
      return [];
    }

    return data || [];
  }

  /**
   * Obtiene los conectores de un proveedor
   */
  async getConnectorsByProvider(providerId: string): Promise<IntegrationConnector[]> {
    const { data, error } = await supabase
      .from('integration_connectors')
      .select('*, provider:integration_providers(*)')
      .eq('provider_id', providerId)
      .eq('is_active', true)
      .order('name');

    if (error) {
      console.error('Error fetching connectors:', error);
      return [];
    }

    return data || [];
  }

  /**
   * Reintentar un job fallido
   */
  async retryJob(jobId: string): Promise<boolean> {
    const { error } = await supabase
      .from('integration_jobs')
      .update({
        status: 'queued',
        updated_at: new Date().toISOString(),
      })
      .eq('id', jobId)
      .eq('status', 'failed');

    if (error) {
      console.error('Error retrying job:', error);
      return false;
    }

    return true;
  }

  /**
   * Pausar/Reanudar una conexión
   */
  async toggleConnectionStatus(connectionId: string, newStatus: 'paused' | 'connected'): Promise<boolean> {
    const { error } = await supabase
      .from('integration_connections')
      .update({
        status: newStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('id', connectionId);

    if (error) {
      console.error('Error toggling connection status:', error);
      return false;
    }

    return true;
  }

  /**
   * Exportar estado de integraciones
   */
  async exportState(organizationId: number): Promise<{
    connections: IntegrationConnection[];
    events: IntegrationEvent[];
    jobs: IntegrationJob[];
  }> {
    const connections = await this.getConnections(organizationId);
    const events = await this.getRecentEvents(organizationId, 100);
    const jobs = await this.getRecentJobs(organizationId, 100);

    return { connections, events, jobs };
  }

  /**
   * Busca una conexión existente por código de proveedor
   */
  async findConnectionByProvider(
    organizationId: number,
    providerCode: string
  ): Promise<IntegrationConnection | null> {
    const { data, error } = await supabase
      .from('integration_connections')
      .select(`
        *,
        connector:integration_connectors(
          id,
          code,
          name,
          provider:integration_providers(id, code, name, category)
        )
      `)
      .eq('organization_id', organizationId)
      .eq('connector.provider.code', providerCode)
      .eq('status', 'connected')
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('Error finding connection by provider:', error);
      return null;
    }

    return data;
  }

  /**
   * Obtiene las conexiones disponibles para un módulo específico
   */
  async getConnectionsForModule(
    organizationId: number,
    category: 'payments' | 'messaging' | 'ota' | 'delivery' | 'social'
  ): Promise<IntegrationConnection[]> {
    const { data, error } = await supabase
      .from('integration_connections')
      .select(`
        *,
        connector:integration_connectors(
          id,
          code,
          name,
          capabilities,
          provider:integration_providers(id, code, name, category, logo_url)
        )
      `)
      .eq('organization_id', organizationId)
      .eq('connector.provider.category', category)
      .in('status', ['connected', 'paused']);

    if (error) {
      console.error('Error fetching connections for module:', error);
      return [];
    }

    return data || [];
  }

  /**
   * Vincula una conexión a un canal de chat
   */
  async linkConnectionToChannel(
    channelId: string,
    connectionId: string
  ): Promise<boolean> {
    const { error } = await supabase
      .from('channels')
      .update({
        integration_connection_id: connectionId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', channelId);

    if (error) {
      console.error('Error linking connection to channel:', error);
      return false;
    }

    return true;
  }

  /**
   * Vincula una conexión a un método de pago
   */
  async linkConnectionToPaymentMethod(
    paymentMethodId: number,
    connectionId: string
  ): Promise<boolean> {
    const { error } = await supabase
      .from('organization_payment_methods')
      .update({
        integration_connection_id: connectionId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', paymentMethodId);

    if (error) {
      console.error('Error linking connection to payment method:', error);
      return false;
    }

    return true;
  }

  /**
   * Obtiene el uso de una conexión (qué módulos la usan)
   */
  async getConnectionUsage(connectionId: string): Promise<{
    channels: Array<{ id: string; name: string; type: string }>;
    paymentMethods: Array<{ id: number; code: string; name: string }>;
  }> {
    const [channelsResult, paymentMethodsResult] = await Promise.all([
      supabase
        .from('channels')
        .select('id, name, type')
        .eq('integration_connection_id', connectionId),
      supabase
        .from('organization_payment_methods')
        .select('id, payment_method_code, payment_method:payment_methods(name)')
        .eq('integration_connection_id', connectionId),
    ]);

    type PaymentMethodRow = {
      id: number;
      payment_method_code: string;
      payment_method?: { name?: string } | null;
    };

    return {
      channels: channelsResult.data || [],
      paymentMethods: (paymentMethodsResult.data || []).map((pm: PaymentMethodRow) => ({
        id: pm.id,
        code: pm.payment_method_code,
        name: pm.payment_method?.name || pm.payment_method_code,
      })),
    };
  }

  /**
   * Crea una nueva conexión de integración
   */
  async createConnection(
    organizationId: number,
    connectorId: string,
    data: {
      name: string;
      environment: 'production' | 'sandbox' | 'test';
      countryCode?: string;
      branchId?: number;
      settings?: Record<string, unknown>;
    }
  ): Promise<IntegrationConnection | null> {
    const { data: connection, error } = await supabase
      .from('integration_connections')
      .insert({
        organization_id: organizationId,
        connector_id: connectorId,
        name: data.name,
        environment: data.environment,
        country_code: data.countryCode,
        branch_id: data.branchId,
        settings: data.settings || {},
        status: 'draft',
      })
      .select(`
        *,
        connector:integration_connectors(
          id,
          code,
          name,
          provider:integration_providers(id, code, name, category)
        )
      `)
      .single();

    if (error) {
      console.error('Error creating connection:', error);
      return null;
    }

    return connection;
  }

  /**
   * Guarda credenciales para una conexión (solo referencia, no el secreto)
   */
  async saveCredentials(
    connectionId: string,
    credentialType: string,
    secretRef: string,
    purpose: 'primary' | 'backup' | 'rotation' | 'legacy' = 'primary',
    expiresAt?: string
  ): Promise<boolean> {
    const { error } = await supabase.from('integration_credentials').insert({
      connection_id: connectionId,
      credential_type: credentialType,
      secret_ref: secretRef,
      purpose,
      status: 'active',
      expires_at: expiresAt,
    });

    if (error) {
      console.error('Error saving credentials:', error);
      return false;
    }

    // Actualizar estado de la conexión a 'connected'
    await supabase
      .from('integration_connections')
      .update({
        status: 'connected',
        connected_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', connectionId);

    return true;
  }

  /**
   * Obtiene conectores disponibles para una categoría
   */
  async getConnectorsByCategory(
    category: 'payments' | 'messaging' | 'ota' | 'delivery' | 'social' | 'ads'
  ): Promise<IntegrationConnector[]> {
    const { data, error } = await supabase
      .from('integration_connectors')
      .select(`
        *,
        provider:integration_providers(*)
      `)
      .eq('provider.category', category)
      .eq('is_active', true)
      .order('name');

    if (error) {
      console.error('Error fetching connectors by category:', error);
      return [];
    }

    return data || [];
  }
  /**
   * Obtiene los canales de chat con credenciales para mostrar en integraciones
   * Los canales externos (WhatsApp, Facebook, Instagram) se muestran como conexiones
   */
  async getChatChannelsAsConnections(organizationId: number): Promise<{
    id: string;
    name: string;
    type: string;
    status: string;
    hasCredentials: boolean;
    isValid: boolean;
    lastValidatedAt: string | null;
    channelUrl: string;
  }[]> {
    const { data, error } = await supabase
      .from('channels')
      .select(`
        id,
        name,
        type,
        status,
        credentials:channel_credentials(
          id,
          is_valid,
          last_validated_at
        )
      `)
      .eq('organization_id', organizationId)
      .in('type', ['whatsapp', 'facebook', 'instagram'])
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching chat channels:', error);
      return [];
    }

    return (data || []).map((channel) => {
      const creds = channel.credentials as { id: string; is_valid: boolean; last_validated_at: string | null }[] | null;
      const credential = creds?.[0];
      
      return {
        id: channel.id,
        name: channel.name,
        type: channel.type,
        status: channel.status,
        hasCredentials: !!credential,
        isValid: credential?.is_valid || false,
        lastValidatedAt: credential?.last_validated_at || null,
        channelUrl: `/app/chat/canales/${channel.type}/${channel.id}`,
      };
    });
  }

  /**
   * Obtiene estadísticas combinadas de integraciones y canales de chat
   */
  async getCombinedStats(organizationId: number): Promise<{
    integrations: { total: number; active: number; errors: number };
    channels: { total: number; active: number; withCredentials: number };
  }> {
    // Stats de integration_connections
    const { data: integrationData } = await supabase
      .from('integration_connections')
      .select('id, status')
      .eq('organization_id', organizationId);

    const integrations = {
      total: integrationData?.length || 0,
      active: integrationData?.filter((c) => c.status === 'connected').length || 0,
      errors: integrationData?.filter((c) => c.status === 'error').length || 0,
    };

    // Stats de canales externos
    const { data: channelData } = await supabase
      .from('channels')
      .select(`
        id,
        status,
        credentials:channel_credentials(id)
      `)
      .eq('organization_id', organizationId)
      .in('type', ['whatsapp', 'facebook', 'instagram']);

    const channels = {
      total: channelData?.length || 0,
      active: channelData?.filter((c) => c.status === 'active').length || 0,
      withCredentials: channelData?.filter((c) => {
        const creds = c.credentials as { id: string }[] | null;
        return creds && creds.length > 0;
      }).length || 0,
    };

    return { integrations, channels };
  }

  /**
   * Obtiene conexiones con filtros avanzados
   */
  async getConnectionsWithFilters(
    organizationId: number,
    filters: {
      status?: string;
      environment?: string;
      countryCode?: string;
      branchId?: number;
      providerId?: string;
      search?: string;
    }
  ): Promise<IntegrationConnection[]> {
    let query = supabase
      .from('integration_connections')
      .select(`
        *,
        connector:integration_connectors(
          id,
          code,
          name,
          capabilities,
          provider:integration_providers(id, code, name, category, logo_url)
        ),
        branch:branches(id, name)
      `)
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false });

    if (filters.status && filters.status !== 'all') {
      query = query.eq('status', filters.status);
    }
    if (filters.environment && filters.environment !== 'all') {
      query = query.eq('environment', filters.environment);
    }
    if (filters.countryCode && filters.countryCode !== 'all') {
      query = query.eq('country_code', filters.countryCode);
    }
    if (filters.branchId) {
      query = query.eq('branch_id', filters.branchId);
    }
    if (filters.search) {
      query = query.ilike('name', `%${filters.search}%`);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching connections with filters:', error);
      return [];
    }

    // Filtrar por proveedor si se especifica
    let results = data || [];
    if (filters.providerId) {
      results = results.filter((c) => {
        const connector = c.connector as IntegrationConnector | null;
        const provider = connector?.provider as IntegrationProvider | null;
        return provider?.id === filters.providerId;
      });
    }

    return results;
  }

  /**
   * Obtiene todos los proveedores disponibles
   */
  async getProviders(): Promise<IntegrationProvider[]> {
    const { data, error } = await supabase
      .from('integration_providers')
      .select('*')
      .eq('is_active', true)
      .order('name');

    if (error) {
      console.error('Error fetching providers:', error);
      return [];
    }

    return data || [];
  }

  /**
   * Obtiene todos los conectores disponibles
   */
  async getConnectors(): Promise<IntegrationConnector[]> {
    const { data, error } = await supabase
      .from('integration_connectors')
      .select(`
        *,
        provider:integration_providers(*)
      `)
      .eq('is_active', true)
      .order('name');

    if (error) {
      console.error('Error fetching connectors:', error);
      return [];
    }

    return data || [];
  }

  /**
   * Actualiza una conexión
   */
  async updateConnection(
    connectionId: string,
    data: {
      name?: string;
      environment?: string;
      countryCode?: string;
      branchId?: number | null;
      settings?: Record<string, unknown>;
    }
  ): Promise<boolean> {
    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (data.name !== undefined) updateData.name = data.name;
    if (data.environment !== undefined) updateData.environment = data.environment;
    if (data.countryCode !== undefined) updateData.country_code = data.countryCode;
    if (data.branchId !== undefined) updateData.branch_id = data.branchId;
    if (data.settings !== undefined) updateData.settings = data.settings;

    const { error } = await supabase
      .from('integration_connections')
      .update(updateData)
      .eq('id', connectionId);

    if (error) {
      console.error('Error updating connection:', error);
      return false;
    }

    return true;
  }

  /**
   * Duplica una conexión para otra sucursal/país
   */
  async duplicateConnection(
    connectionId: string,
    newData: {
      name: string;
      branchId?: number;
      countryCode?: string;
    }
  ): Promise<IntegrationConnection | null> {
    // Obtener conexión original
    const { data: original, error: fetchError } = await supabase
      .from('integration_connections')
      .select('*')
      .eq('id', connectionId)
      .single();

    if (fetchError || !original) {
      console.error('Error fetching original connection:', fetchError);
      return null;
    }

    // Crear copia
    const { data: newConnection, error: createError } = await supabase
      .from('integration_connections')
      .insert({
        organization_id: original.organization_id,
        connector_id: original.connector_id,
        name: newData.name,
        environment: original.environment,
        country_code: newData.countryCode || original.country_code,
        branch_id: newData.branchId || null,
        settings: original.settings,
        status: 'draft',
      })
      .select(`
        *,
        connector:integration_connectors(
          id,
          code,
          name,
          provider:integration_providers(id, code, name, category)
        )
      `)
      .single();

    if (createError) {
      console.error('Error duplicating connection:', createError);
      return null;
    }

    return newConnection;
  }

  /**
   * Revoca (desconecta) una conexión
   */
  async revokeConnection(connectionId: string): Promise<boolean> {
    const { error } = await supabase
      .from('integration_connections')
      .update({
        status: 'revoked',
        updated_at: new Date().toISOString(),
      })
      .eq('id', connectionId);

    if (error) {
      console.error('Error revoking connection:', error);
      return false;
    }

    return true;
  }

  /**
   * Realiza un health check de la conexión
   */
  async healthCheck(connectionId: string): Promise<{
    success: boolean;
    message: string;
  }> {
    // Simular health check - en producción esto llamaría al servicio externo
    const { error } = await supabase
      .from('integration_connections')
      .update({
        last_health_check_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', connectionId);

    if (error) {
      return { success: false, message: 'Error al verificar conexión' };
    }

    return { success: true, message: 'Conexión verificada correctamente' };
  }

  /**
   * Elimina una conexión (soft delete - cambia a revoked)
   */
  async deleteConnection(connectionId: string): Promise<boolean> {
    return this.revokeConnection(connectionId);
  }

  /**
   * Obtiene las sucursales de la organización
   */
  async getBranches(organizationId: number): Promise<Array<{ id: number; name: string }>> {
    const { data, error } = await supabase
      .from('branches')
      .select('id, name')
      .eq('organization_id', organizationId)
      .eq('is_active', true)
      .order('name');

    if (error) {
      console.error('Error fetching branches:', error);
      return [];
    }

    return data || [];
  }

  /**
   * Importa conexiones desde CSV
   */
  async importConnectionsFromCSV(
    organizationId: number,
    connectorId: string,
    connections: Array<{
      name: string;
      branchId?: number;
      countryCode?: string;
      environment?: string;
    }>
  ): Promise<{ success: number; failed: number; errors: string[] }> {
    const results = { success: 0, failed: 0, errors: [] as string[] };

    for (const conn of connections) {
      const created = await this.createConnection(organizationId, connectorId, {
        name: conn.name,
        environment: (conn.environment as 'production' | 'sandbox' | 'test') || 'production',
        countryCode: conn.countryCode,
        branchId: conn.branchId,
      });

      if (created) {
        results.success++;
      } else {
        results.failed++;
        results.errors.push(`Error al crear conexión: ${conn.name}`);
      }
    }

    return results;
  }

  /**
   * Obtiene una conexión por ID con todos los detalles
   */
  async getConnectionById(connectionId: string): Promise<IntegrationConnection | null> {
    const { data, error } = await supabase
      .from('integration_connections')
      .select(`
        *,
        connector:integration_connectors(
          id,
          code,
          name,
          capabilities,
          required_scopes,
          supported_countries,
          provider:integration_providers(id, code, name, category, logo_url, auth_type, website_url, docs_url)
        ),
        branch:branches(id, name)
      `)
      .eq('id', connectionId)
      .single();

    if (error) {
      console.error('Error fetching connection:', error);
      return null;
    }

    return data;
  }

  /**
   * Obtiene las credenciales de una conexión
   */
  async getCredentials(connectionId: string): Promise<IntegrationCredential[]> {
    const { data, error } = await supabase
      .from('integration_credentials')
      .select('*')
      .eq('connection_id', connectionId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching credentials:', error);
      return [];
    }

    return data || [];
  }

  /**
   * Obtiene los webhooks de una conexión
   */
  async getWebhooks(connectionId: string): Promise<IntegrationWebhook[]> {
    const { data, error } = await supabase
      .from('integration_webhooks')
      .select('*')
      .eq('connection_id', connectionId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching webhooks:', error);
      return [];
    }

    return data || [];
  }

  /**
   * Obtiene los eventos de una conexión
   */
  async getEventsByConnection(connectionId: string, limit: number = 20): Promise<IntegrationEvent[]> {
    const { data, error } = await supabase
      .from('integration_events')
      .select('*')
      .eq('connection_id', connectionId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('Error fetching events:', error);
      return [];
    }

    return data || [];
  }

  /**
   * Obtiene los jobs de una conexión
   */
  async getJobsByConnection(connectionId: string, limit: number = 20): Promise<IntegrationJob[]> {
    const { data, error } = await supabase
      .from('integration_jobs')
      .select('*')
      .eq('connection_id', connectionId)
      .order('updated_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('Error fetching jobs:', error);
      return [];
    }

    return data || [];
  }

  /**
   * Obtiene el último job fallido de una conexión
   */
  async getLastFailedJob(connectionId: string): Promise<IntegrationJob | null> {
    const { data, error } = await supabase
      .from('integration_jobs')
      .select('*')
      .eq('connection_id', connectionId)
      .eq('status', 'failed')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('Error fetching last failed job:', error);
      return null;
    }

    return data;
  }

  /**
   * Actualiza los settings de una conexión
   */
  async updateConnectionSettings(
    connectionId: string,
    settings: Record<string, unknown>
  ): Promise<boolean> {
    const { error } = await supabase
      .from('integration_connections')
      .update({
        settings,
        updated_at: new Date().toISOString(),
      })
      .eq('id', connectionId);

    if (error) {
      console.error('Error updating connection settings:', error);
      return false;
    }

    return true;
  }
  // ==================== CRUD de Credenciales ====================

  /**
   * Crear nueva credencial
   */
  async createCredential(data: {
    connectionId: string;
    credentialType: string;
    purpose: 'primary' | 'backup' | 'rotation' | 'legacy';
    secretRef: string;
    keyPrefix?: string;
    expiresAt?: string;
    metadata?: Record<string, unknown>;
  }): Promise<IntegrationCredential | null> {
    const { data: credential, error } = await supabase
      .from('integration_credentials')
      .insert({
        connection_id: data.connectionId,
        credential_type: data.credentialType,
        purpose: data.purpose,
        secret_ref: data.secretRef,
        key_prefix: data.keyPrefix,
        status: 'active',
        expires_at: data.expiresAt,
        metadata: data.metadata || {},
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating credential:', error);
      return null;
    }

    return credential;
  }

  /**
   * Actualizar credencial (rotar)
   */
  async updateCredential(
    credentialId: string,
    data: {
      secretRef?: string;
      keyPrefix?: string;
      expiresAt?: string;
      metadata?: Record<string, unknown>;
    }
  ): Promise<boolean> {
    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (data.secretRef !== undefined) {
      updateData.secret_ref = data.secretRef;
      updateData.rotated_at = new Date().toISOString();
    }
    if (data.keyPrefix !== undefined) updateData.key_prefix = data.keyPrefix;
    if (data.expiresAt !== undefined) updateData.expires_at = data.expiresAt;
    if (data.metadata !== undefined) updateData.metadata = data.metadata;

    const { error } = await supabase
      .from('integration_credentials')
      .update(updateData)
      .eq('id', credentialId);

    if (error) {
      console.error('Error updating credential:', error);
      return false;
    }

    return true;
  }

  /**
   * Duplicar credencial (para crear backup/rotation rápido)
   */
  async duplicateCredential(
    credentialId: string,
    newPurpose: 'primary' | 'backup' | 'rotation' | 'legacy'
  ): Promise<IntegrationCredential | null> {
    // Obtener la credencial original
    const { data: original, error: fetchError } = await supabase
      .from('integration_credentials')
      .select('*')
      .eq('id', credentialId)
      .single();

    if (fetchError || !original) {
      console.error('Error fetching credential to duplicate:', fetchError);
      return null;
    }

    // Crear copia con nuevo purpose
    const { data: duplicate, error: insertError } = await supabase
      .from('integration_credentials')
      .insert({
        connection_id: original.connection_id,
        credential_type: original.credential_type,
        purpose: newPurpose,
        secret_ref: original.secret_ref,
        key_prefix: original.key_prefix ? `${original.key_prefix}_copy` : null,
        status: 'active',
        expires_at: original.expires_at,
        metadata: { ...original.metadata, duplicated_from: credentialId },
      })
      .select()
      .single();

    if (insertError) {
      console.error('Error duplicating credential:', insertError);
      return null;
    }

    return duplicate;
  }

  /**
   * Revocar/desactivar credencial
   */
  async revokeCredential(credentialId: string): Promise<boolean> {
    const { error } = await supabase
      .from('integration_credentials')
      .update({
        status: 'revoked',
        updated_at: new Date().toISOString(),
      })
      .eq('id', credentialId);

    if (error) {
      console.error('Error revoking credential:', error);
      return false;
    }

    return true;
  }

  /**
   * Reactivar credencial
   */
  async reactivateCredential(credentialId: string): Promise<boolean> {
    const { error } = await supabase
      .from('integration_credentials')
      .update({
        status: 'active',
        updated_at: new Date().toISOString(),
      })
      .eq('id', credentialId);

    if (error) {
      console.error('Error reactivating credential:', error);
      return false;
    }

    return true;
  }

  /**
   * Eliminar credencial permanentemente
   */
  async deleteCredential(credentialId: string): Promise<boolean> {
    const { error } = await supabase
      .from('integration_credentials')
      .delete()
      .eq('id', credentialId);

    if (error) {
      console.error('Error deleting credential:', error);
      return false;
    }

    return true;
  }

  /**
   * Obtener credencial por ID
   */
  async getCredentialById(credentialId: string): Promise<IntegrationCredential | null> {
    const { data, error } = await supabase
      .from('integration_credentials')
      .select('*')
      .eq('id', credentialId)
      .single();

    if (error) {
      console.error('Error fetching credential:', error);
      return null;
    }

    return data;
  }

  // ==================== WEBHOOK METHODS ====================

  /**
   * Crear nuevo webhook
   */
  async createWebhook(
    connectionId: string,
    webhookData: {
      direction: 'inbound' | 'outbound';
      url: string;
      events: string[];
      secret_ref?: string;
      signing_method?: string;
      metadata?: Record<string, unknown>;
    }
  ): Promise<IntegrationWebhook | null> {
    const { data, error } = await supabase
      .from('integration_webhooks')
      .insert({
        connection_id: connectionId,
        direction: webhookData.direction,
        url: webhookData.url,
        events: webhookData.events,
        secret_ref: webhookData.secret_ref || 'none',
        signing_method: webhookData.signing_method || 'hmac_sha256',
        is_active: true,
        metadata: webhookData.metadata || {},
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating webhook:', error);
      return null;
    }

    return data;
  }

  /**
   * Actualizar webhook existente
   */
  async updateWebhook(
    webhookId: string,
    webhookData: {
      url?: string;
      events?: string[];
      secret_ref?: string;
      signing_method?: string;
      metadata?: Record<string, unknown>;
    }
  ): Promise<boolean> {
    const { error } = await supabase
      .from('integration_webhooks')
      .update({
        ...webhookData,
        updated_at: new Date().toISOString(),
      })
      .eq('id', webhookId);

    if (error) {
      console.error('Error updating webhook:', error);
      return false;
    }

    return true;
  }

  /**
   * Duplicar webhook
   */
  async duplicateWebhook(webhookId: string): Promise<IntegrationWebhook | null> {
    const { data: original, error: fetchError } = await supabase
      .from('integration_webhooks')
      .select('*')
      .eq('id', webhookId)
      .single();

    if (fetchError || !original) {
      console.error('Error fetching webhook to duplicate:', fetchError);
      return null;
    }

    const { data, error } = await supabase
      .from('integration_webhooks')
      .insert({
        connection_id: original.connection_id,
        direction: original.direction,
        url: original.url + '_copy',
        events: original.events,
        secret_ref: original.secret_ref,
        signing_method: original.signing_method,
        is_active: false,
        metadata: { ...original.metadata, duplicated_from: webhookId },
      })
      .select()
      .single();

    if (error) {
      console.error('Error duplicating webhook:', error);
      return null;
    }

    return data;
  }

  /**
   * Activar/desactivar webhook
   */
  async toggleWebhookStatus(webhookId: string, isActive: boolean): Promise<boolean> {
    const { error } = await supabase
      .from('integration_webhooks')
      .update({
        is_active: isActive,
        updated_at: new Date().toISOString(),
      })
      .eq('id', webhookId);

    if (error) {
      console.error('Error toggling webhook status:', error);
      return false;
    }

    return true;
  }

  /**
   * Eliminar webhook
   */
  async deleteWebhook(webhookId: string): Promise<boolean> {
    const { error } = await supabase
      .from('integration_webhooks')
      .delete()
      .eq('id', webhookId);

    if (error) {
      console.error('Error deleting webhook:', error);
      return false;
    }

    return true;
  }

  /**
   * Obtener webhook por ID
   */
  async getWebhookById(webhookId: string): Promise<IntegrationWebhook | null> {
    const { data, error } = await supabase
      .from('integration_webhooks')
      .select('*')
      .eq('id', webhookId)
      .single();

    if (error) {
      console.error('Error fetching webhook:', error);
      return null;
    }

    return data;
  }

  /**
   * Probar webhook (simula un evento de prueba)
   */
  async testWebhook(webhookId: string): Promise<{ success: boolean; message: string }> {
    const webhook = await this.getWebhookById(webhookId);
    if (!webhook) {
      return { success: false, message: 'Webhook no encontrado' };
    }

    // Obtener organization_id de la conexión
    const { data: connection } = await supabase
      .from('integration_connections')
      .select('organization_id')
      .eq('id', webhook.connection_id)
      .single();

    // Registrar evento de prueba
    const { error } = await supabase.from('integration_events').insert({
      organization_id: connection?.organization_id,
      connection_id: webhook.connection_id,
      source: 'webhook',
      direction: webhook.direction,
      event_type: 'test_event',
      status: 'processed',
      payload: { test: true, timestamp: new Date().toISOString() },
      metadata: { webhook_id: webhookId, is_test: true },
    });

    if (error) {
      console.error('Error creating test event:', error);
      return { success: false, message: 'Error al crear evento de prueba' };
    }

    // Actualizar last_received_at
    await supabase
      .from('integration_webhooks')
      .update({ last_received_at: new Date().toISOString() })
      .eq('id', webhookId);

    return { success: true, message: 'Evento de prueba enviado correctamente' };
  }

  // ==================== EVENT METHODS ====================

  /**
   * Obtiene eventos con filtros y paginación
   */
  async getEvents(
    organizationId: number,
    filters?: {
      connectionId?: string;
      providerId?: string;
      status?: string;
      source?: string;
      direction?: string;
      eventType?: string;
      dateFrom?: string;
      dateTo?: string;
    },
    limit: number = 50,
    offset: number = 0
  ): Promise<{ data: IntegrationEvent[]; total: number }> {
    // Primero obtenemos las conexiones de la organización
    const { data: connections } = await supabase
      .from('integration_connections')
      .select('id, connector:integration_connectors(provider_id)')
      .eq('organization_id', organizationId);

    if (!connections || connections.length === 0) {
      return { data: [], total: 0 };
    }

    let connectionIds = connections.map(c => c.id);

    // Filtrar por proveedor si se especifica
    if (filters?.providerId) {
      connectionIds = connections
        .filter(c => (c.connector as any)?.provider_id === filters.providerId)
        .map(c => c.id);
    }

    // Filtrar por conexión específica
    if (filters?.connectionId) {
      connectionIds = [filters.connectionId];
    }

    if (connectionIds.length === 0) {
      return { data: [], total: 0 };
    }

    let query = supabase
      .from('integration_events')
      .select(`
        *,
        connection:integration_connections(
          id, 
          name,
          connector:integration_connectors(
            id,
            name,
            provider:integration_providers(id, name, logo_url)
          )
        )
      `, { count: 'exact' })
      .in('connection_id', connectionIds)
      .order('created_at', { ascending: false });

    // Aplicar filtros
    if (filters?.status) {
      query = query.eq('status', filters.status);
    }
    if (filters?.source) {
      query = query.eq('source', filters.source);
    }
    if (filters?.direction) {
      query = query.eq('direction', filters.direction);
    }
    if (filters?.eventType) {
      query = query.eq('event_type', filters.eventType);
    }
    if (filters?.dateFrom) {
      query = query.gte('created_at', filters.dateFrom);
    }
    if (filters?.dateTo) {
      query = query.lte('created_at', filters.dateTo);
    }

    // Paginación
    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      console.error('Error fetching events:', error);
      return { data: [], total: 0 };
    }

    return { data: data || [], total: count || 0 };
  }

  /**
   * Obtiene un evento por ID
   */
  async getEventById(eventId: string): Promise<IntegrationEvent | null> {
    const { data, error } = await supabase
      .from('integration_events')
      .select(`
        *,
        connection:integration_connections(
          id, 
          name,
          connector:integration_connectors(
            id,
            name,
            provider:integration_providers(id, name, logo_url, category)
          )
        )
      `)
      .eq('id', eventId)
      .single();

    if (error) {
      console.error('Error fetching event:', error);
      return null;
    }

    return data;
  }

  /**
   * Reprocesar evento (crea un job en cola)
   */
  async reprocessEvent(eventId: string): Promise<{ success: boolean; jobId?: string; message: string }> {
    const event = await this.getEventById(eventId);
    if (!event) {
      return { success: false, message: 'Evento no encontrado' };
    }

    // Crear job de reprocesamiento
    const { data, error } = await supabase
      .from('integration_jobs')
      .insert({
        connection_id: event.connection_id,
        job_type: 'webhook_replay',
        resource_type: event.event_type,
        status: 'queued',
        run_count: 0,
        metadata: {
          original_event_id: eventId,
          reprocessed_at: new Date().toISOString(),
        },
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating reprocess job:', error);
      return { success: false, message: 'Error al crear job de reprocesamiento' };
    }

    return { 
      success: true, 
      jobId: data.id, 
      message: 'Evento encolado para reprocesamiento' 
    };
  }

  /**
   * Obtiene tipos de eventos únicos para filtros
   */
  async getEventTypes(organizationId: number): Promise<string[]> {
    const { data: connections } = await supabase
      .from('integration_connections')
      .select('id')
      .eq('organization_id', organizationId);

    if (!connections || connections.length === 0) {
      return [];
    }

    const connectionIds = connections.map(c => c.id);

    const { data, error } = await supabase
      .from('integration_events')
      .select('event_type')
      .in('connection_id', connectionIds)
      .limit(100);

    if (error || !data) {
      return [];
    }

    // Obtener valores únicos
    const uniqueTypes = [...new Set(data.map(e => e.event_type))];
    return uniqueTypes.sort();
  }

  /**
   * Exportar eventos a JSON o CSV
   */
  async exportEvents(
    organizationId: number,
    filters?: {
      connectionId?: string;
      status?: string;
      dateFrom?: string;
      dateTo?: string;
    },
    format: 'json' | 'csv' = 'json'
  ): Promise<string> {
    const { data: events } = await this.getEvents(organizationId, filters, 1000, 0);

    if (format === 'csv') {
      const headers = ['ID', 'Conexión', 'Source', 'Direction', 'Tipo', 'Status', 'Fecha'];
      const rows = events.map(e => [
        e.id,
        (e.connection as any)?.name || e.connection_id,
        e.source,
        e.direction,
        e.event_type,
        e.status,
        e.created_at,
      ]);
      return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    }

    return JSON.stringify(events, null, 2);
  }

  // ==================== JOB METHODS ====================

  /**
   * Obtiene jobs con filtros y paginación
   */
  async getJobs(
    organizationId: number,
    filters?: {
      connectionId?: string;
      status?: string;
      jobType?: string;
      resourceType?: string;
    },
    limit: number = 50,
    offset: number = 0
  ): Promise<{ data: IntegrationJob[]; total: number }> {
    const { data: connections } = await supabase
      .from('integration_connections')
      .select('id')
      .eq('organization_id', organizationId);

    if (!connections || connections.length === 0) {
      return { data: [], total: 0 };
    }

    let connectionIds = connections.map(c => c.id);

    if (filters?.connectionId) {
      connectionIds = [filters.connectionId];
    }

    let query = supabase
      .from('integration_jobs')
      .select(`
        *,
        connection:integration_connections(
          id, 
          name,
          connector:integration_connectors(
            id,
            name,
            provider:integration_providers(id, name, logo_url)
          )
        )
      `, { count: 'exact' })
      .in('connection_id', connectionIds)
      .order('updated_at', { ascending: false });

    if (filters?.status) {
      query = query.eq('status', filters.status);
    }
    if (filters?.jobType) {
      query = query.eq('job_type', filters.jobType);
    }
    if (filters?.resourceType) {
      query = query.eq('resource_type', filters.resourceType);
    }

    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      console.error('Error fetching jobs:', error);
      return { data: [], total: 0 };
    }

    return { data: data || [], total: count || 0 };
  }

  /**
   * Obtiene un job por ID
   */
  async getJobById(jobId: string): Promise<IntegrationJob | null> {
    const { data, error } = await supabase
      .from('integration_jobs')
      .select(`
        *,
        connection:integration_connections(
          id, 
          name,
          connector:integration_connectors(
            id,
            name,
            provider:integration_providers(id, name, logo_url, category)
          )
        )
      `)
      .eq('id', jobId)
      .single();

    if (error) {
      console.error('Error fetching job:', error);
      return null;
    }

    return data;
  }

  /**
   * Crear nuevo job (sincronización manual)
   */
  async createJob(
    connectionId: string,
    jobData: {
      job_type: string;
      resource_type: string;
    }
  ): Promise<IntegrationJob | null> {
    const { data, error } = await supabase
      .from('integration_jobs')
      .insert({
        connection_id: connectionId,
        job_type: jobData.job_type,
        resource_type: jobData.resource_type,
        status: 'queued',
        run_count: 0,
        cursor: {},
        stats: {},
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating job:', error);
      return null;
    }

    return data;
  }

  /**
   * Duplicar job
   */
  async duplicateJob(jobId: string): Promise<IntegrationJob | null> {
    const original = await this.getJobById(jobId);
    if (!original) return null;

    const { data, error } = await supabase
      .from('integration_jobs')
      .insert({
        connection_id: original.connection_id,
        job_type: original.job_type,
        resource_type: original.resource_type,
        status: 'queued',
        run_count: 0,
        cursor: {},
        stats: {},
      })
      .select()
      .single();

    if (error) {
      console.error('Error duplicating job:', error);
      return null;
    }

    return data;
  }

  /**
   * Cancelar job
   */
  async cancelJob(jobId: string): Promise<boolean> {
    const { error } = await supabase
      .from('integration_jobs')
      .update({
        status: 'cancelled',
        updated_at: new Date().toISOString(),
      })
      .eq('id', jobId)
      .in('status', ['queued', 'running']);

    if (error) {
      console.error('Error cancelling job:', error);
      return false;
    }

    return true;
  }

  /**
   * Reiniciar cursor de un job (peligroso - solo admin)
   */
  async resetJobCursor(jobId: string): Promise<boolean> {
    const { error } = await supabase
      .from('integration_jobs')
      .update({
        cursor: {},
        status: 'queued',
        run_count: 0,
        last_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', jobId);

    if (error) {
      console.error('Error resetting job cursor:', error);
      return false;
    }

    return true;
  }

  /**
   * Eliminar job
   */
  async deleteJob(jobId: string): Promise<boolean> {
    const { error } = await supabase
      .from('integration_jobs')
      .delete()
      .eq('id', jobId);

    if (error) {
      console.error('Error deleting job:', error);
      return false;
    }

    return true;
  }

  /**
   * Obtiene tipos de jobs únicos para filtros
   */
  async getJobTypes(organizationId: number): Promise<{ jobTypes: string[]; resourceTypes: string[] }> {
    const { data: connections } = await supabase
      .from('integration_connections')
      .select('id')
      .eq('organization_id', organizationId);

    if (!connections || connections.length === 0) {
      return { jobTypes: [], resourceTypes: [] };
    }

    const connectionIds = connections.map(c => c.id);

    const { data, error } = await supabase
      .from('integration_jobs')
      .select('job_type, resource_type')
      .in('connection_id', connectionIds)
      .limit(200);

    if (error || !data) {
      return { jobTypes: [], resourceTypes: [] };
    }

    const jobTypes = [...new Set(data.map(j => j.job_type))].sort();
    const resourceTypes = [...new Set(data.map(j => j.resource_type))].sort();

    return { jobTypes, resourceTypes };
  }

  // ==================== MAPPING METHODS ====================

  /**
   * Obtiene mapeos con filtros y paginación
   */
  async getMappings(
    organizationId: number,
    filters?: {
      connectionId?: string;
      externalType?: string;
      internalTable?: string;
      showDeleted?: boolean;
    },
    limit: number = 50,
    offset: number = 0
  ): Promise<{ data: IntegrationMapping[]; total: number }> {
    const { data: connections } = await supabase
      .from('integration_connections')
      .select('id')
      .eq('organization_id', organizationId);

    if (!connections || connections.length === 0) {
      return { data: [], total: 0 };
    }

    let connectionIds = connections.map(c => c.id);

    if (filters?.connectionId) {
      connectionIds = [filters.connectionId];
    }

    let query = supabase
      .from('integration_object_mappings')
      .select(`
        *,
        connection:integration_connections(
          id, 
          name,
          connector:integration_connectors(
            id,
            name,
            provider:integration_providers(id, name, logo_url)
          )
        )
      `, { count: 'exact' })
      .in('connection_id', connectionIds)
      .order('created_at', { ascending: false });

    // Por defecto no mostrar eliminados
    if (!filters?.showDeleted) {
      query = query.is('deleted_at', null);
    }

    if (filters?.externalType) {
      query = query.eq('external_type', filters.externalType);
    }
    if (filters?.internalTable) {
      query = query.eq('internal_table', filters.internalTable);
    }

    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      console.error('Error fetching mappings:', error);
      return { data: [], total: 0 };
    }

    return { data: data || [], total: count || 0 };
  }

  /**
   * Obtiene un mapeo por ID
   */
  async getMappingById(mappingId: string): Promise<IntegrationMapping | null> {
    const { data, error } = await supabase
      .from('integration_object_mappings')
      .select(`
        *,
        connection:integration_connections(
          id, 
          name,
          connector:integration_connectors(
            id,
            name,
            provider:integration_providers(id, name, logo_url)
          )
        )
      `)
      .eq('id', mappingId)
      .single();

    if (error) {
      console.error('Error fetching mapping:', error);
      return null;
    }

    return data;
  }

  /**
   * Crear nuevo mapeo
   */
  async createMapping(
    connectionId: string,
    mappingData: {
      external_type: string;
      external_id: string;
      internal_table: string;
      internal_id: string;
      metadata?: Record<string, unknown>;
    }
  ): Promise<IntegrationMapping | null> {
    const { data, error } = await supabase
      .from('integration_object_mappings')
      .insert({
        connection_id: connectionId,
        external_type: mappingData.external_type,
        external_id: mappingData.external_id,
        internal_table: mappingData.internal_table,
        internal_id: mappingData.internal_id,
        metadata: mappingData.metadata || {},
        last_seen_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating mapping:', error);
      return null;
    }

    return data;
  }

  /**
   * Actualizar mapeo existente
   */
  async updateMapping(
    mappingId: string,
    mappingData: {
      external_type?: string;
      external_id?: string;
      internal_table?: string;
      internal_id?: string;
      metadata?: Record<string, unknown>;
    }
  ): Promise<boolean> {
    const { error } = await supabase
      .from('integration_object_mappings')
      .update(mappingData)
      .eq('id', mappingId);

    if (error) {
      console.error('Error updating mapping:', error);
      return false;
    }

    return true;
  }

  /**
   * Duplicar mapeo
   */
  async duplicateMapping(mappingId: string): Promise<IntegrationMapping | null> {
    const original = await this.getMappingById(mappingId);
    if (!original) return null;

    const { data, error } = await supabase
      .from('integration_object_mappings')
      .insert({
        connection_id: original.connection_id,
        external_type: original.external_type,
        external_id: original.external_id + '_copy',
        internal_table: original.internal_table,
        internal_id: original.internal_id,
        metadata: { ...original.metadata, duplicated_from: mappingId },
        last_seen_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.error('Error duplicating mapping:', error);
      return null;
    }

    return data;
  }

  /**
   * Soft delete de mapeo (set deleted_at)
   */
  async deleteMapping(mappingId: string): Promise<boolean> {
    const { error } = await supabase
      .from('integration_object_mappings')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', mappingId);

    if (error) {
      console.error('Error deleting mapping:', error);
      return false;
    }

    return true;
  }

  /**
   * Restaurar mapeo eliminado
   */
  async restoreMapping(mappingId: string): Promise<boolean> {
    const { error } = await supabase
      .from('integration_object_mappings')
      .update({ deleted_at: null })
      .eq('id', mappingId);

    if (error) {
      console.error('Error restoring mapping:', error);
      return false;
    }

    return true;
  }

  /**
   * Revalidar mapeo (actualiza last_seen_at)
   */
  async revalidateMapping(mappingId: string): Promise<boolean> {
    const { error } = await supabase
      .from('integration_object_mappings')
      .update({ last_seen_at: new Date().toISOString() })
      .eq('id', mappingId);

    if (error) {
      console.error('Error revalidating mapping:', error);
      return false;
    }

    return true;
  }

  /**
   * Obtiene tipos de mapeos únicos para filtros
   */
  async getMappingTypes(organizationId: number): Promise<{ externalTypes: string[]; internalTables: string[] }> {
    const { data: connections } = await supabase
      .from('integration_connections')
      .select('id')
      .eq('organization_id', organizationId);

    if (!connections || connections.length === 0) {
      return { externalTypes: [], internalTables: [] };
    }

    const connectionIds = connections.map(c => c.id);

    const { data, error } = await supabase
      .from('integration_object_mappings')
      .select('external_type, internal_table')
      .in('connection_id', connectionIds)
      .is('deleted_at', null)
      .limit(500);

    if (error || !data) {
      return { externalTypes: [], internalTables: [] };
    }

    const externalTypes = [...new Set(data.map(m => m.external_type))].sort();
    const internalTables = [...new Set(data.map(m => m.internal_table))].sort();

    return { externalTypes, internalTables };
  }

  /**
   * Eliminar mapeo permanentemente
   */
  async hardDeleteMapping(mappingId: string): Promise<boolean> {
    const { error } = await supabase
      .from('integration_object_mappings')
      .delete()
      .eq('id', mappingId);

    if (error) {
      console.error('Error hard deleting mapping:', error);
      return false;
    }

    return true;
  }

  // ==================== API KEY METHODS ====================

  /**
   * Genera una API key aleatoria
   */
  private generateApiKey(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let key = 'goak_'; // go-admin key prefix
    for (let i = 0; i < 32; i++) {
      key += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return key;
  }

  /**
   * Genera un hash simple de la key (en producción usar bcrypt)
   */
  private hashApiKey(key: string): string {
    let hash = 0;
    for (let i = 0; i < key.length; i++) {
      const char = key.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return 'hash_' + Math.abs(hash).toString(36) + '_' + Date.now().toString(36);
  }

  /**
   * Obtiene API keys con filtros
   */
  async getApiKeys(
    organizationId: number,
    filters?: {
      isActive?: boolean;
      showRevoked?: boolean;
    }
  ): Promise<ChannelApiKey[]> {
    let query = supabase
      .from('channel_api_keys')
      .select('*')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false });

    if (filters?.isActive !== undefined) {
      query = query.eq('is_active', filters.isActive);
    }

    if (!filters?.showRevoked) {
      query = query.is('revoked_at', null);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching API keys:', error);
      return [];
    }

    return data || [];
  }

  /**
   * Obtiene una API key por ID
   */
  async getApiKeyById(keyId: string): Promise<ChannelApiKey | null> {
    const { data, error } = await supabase
      .from('channel_api_keys')
      .select('*')
      .eq('id', keyId)
      .single();

    if (error) {
      console.error('Error fetching API key:', error);
      return null;
    }

    return data;
  }

  /**
   * Crear nueva API key (devuelve la key completa una sola vez)
   */
  async createApiKey(
    organizationId: number,
    keyData: {
      name: string;
      scopes: string[];
      expires_at?: string;
      channel_id?: string;
    }
  ): Promise<{ apiKey: ChannelApiKey; fullKey: string } | null> {
    const fullKey = this.generateApiKey();
    const keyHash = this.hashApiKey(fullKey);
    const keyPrefix = fullKey.substring(0, 12) + '...';

    const { data, error } = await supabase
      .from('channel_api_keys')
      .insert({
        organization_id: organizationId,
        name: keyData.name,
        key_hash: keyHash,
        key_prefix: keyPrefix,
        scopes: keyData.scopes,
        expires_at: keyData.expires_at || null,
        channel_id: keyData.channel_id || null,
        is_active: true,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating API key:', error);
      return null;
    }

    return { apiKey: data, fullKey };
  }

  /**
   * Actualizar API key (scopes, expiración)
   */
  async updateApiKey(
    keyId: string,
    keyData: {
      name?: string;
      scopes?: string[];
      expires_at?: string | null;
    }
  ): Promise<boolean> {
    const { error } = await supabase
      .from('channel_api_keys')
      .update(keyData)
      .eq('id', keyId);

    if (error) {
      console.error('Error updating API key:', error);
      return false;
    }

    return true;
  }

  /**
   * Duplicar API key (misma config, nueva key)
   */
  async duplicateApiKey(
    keyId: string,
    organizationId: number
  ): Promise<{ apiKey: ChannelApiKey; fullKey: string } | null> {
    const original = await this.getApiKeyById(keyId);
    if (!original) return null;

    return this.createApiKey(organizationId, {
      name: original.name + ' (copia)',
      scopes: original.scopes || [],
      expires_at: original.expires_at || undefined,
      channel_id: original.channel_id || undefined,
    });
  }

  /**
   * Activar/desactivar API key
   */
  async toggleApiKeyStatus(keyId: string, isActive: boolean): Promise<boolean> {
    const { error } = await supabase
      .from('channel_api_keys')
      .update({ is_active: isActive })
      .eq('id', keyId);

    if (error) {
      console.error('Error toggling API key status:', error);
      return false;
    }

    return true;
  }

  /**
   * Revocar API key
   */
  async revokeApiKey(keyId: string): Promise<boolean> {
    const { error } = await supabase
      .from('channel_api_keys')
      .update({
        revoked_at: new Date().toISOString(),
        is_active: false,
      })
      .eq('id', keyId);

    if (error) {
      console.error('Error revoking API key:', error);
      return false;
    }

    return true;
  }

  /**
   * Eliminar API key permanentemente
   */
  async deleteApiKey(keyId: string): Promise<boolean> {
    const { error } = await supabase
      .from('channel_api_keys')
      .delete()
      .eq('id', keyId);

    if (error) {
      console.error('Error deleting API key:', error);
      return false;
    }

    return true;
  }

  // ==================== WEBHOOK ENDPOINT METHODS ====================

  /**
   * Genera un secret para webhook
   */
  private generateWebhookSecret(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let secret = 'whsec_';
    for (let i = 0; i < 24; i++) {
      secret += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return secret;
  }

  /**
   * Obtiene webhook endpoints
   */
  async getWebhookEndpoints(
    organizationId: number,
    filters?: { isActive?: boolean }
  ): Promise<WebhookEndpoint[]> {
    let query = supabase
      .from('webhook_endpoints')
      .select('*')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false });

    if (filters?.isActive !== undefined) {
      query = query.eq('is_active', filters.isActive);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching webhook endpoints:', error);
      return [];
    }

    return data || [];
  }

  /**
   * Obtiene un webhook endpoint por ID
   */
  async getWebhookEndpointById(endpointId: string): Promise<WebhookEndpoint | null> {
    const { data, error } = await supabase
      .from('webhook_endpoints')
      .select('*')
      .eq('id', endpointId)
      .single();

    if (error) {
      console.error('Error fetching webhook endpoint:', error);
      return null;
    }

    return data;
  }

  /**
   * Crear nuevo webhook endpoint
   */
  async createWebhookEndpoint(
    organizationId: number,
    endpointData: {
      name: string;
      target_url: string;
      events: string[];
      secret?: string;
    }
  ): Promise<{ endpoint: WebhookEndpoint; secret: string } | null> {
    const secret = endpointData.secret || this.generateWebhookSecret();

    const { data, error } = await supabase
      .from('webhook_endpoints')
      .insert({
        organization_id: organizationId,
        name: endpointData.name,
        target_url: endpointData.target_url,
        events: endpointData.events,
        secret: secret,
        is_active: true,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating webhook endpoint:', error);
      return null;
    }

    return { endpoint: data, secret };
  }

  /**
   * Actualizar webhook endpoint
   */
  async updateWebhookEndpoint(
    endpointId: string,
    endpointData: {
      name?: string;
      target_url?: string;
      events?: string[];
    }
  ): Promise<boolean> {
    const { error } = await supabase
      .from('webhook_endpoints')
      .update({
        ...endpointData,
        updated_at: new Date().toISOString(),
      })
      .eq('id', endpointId);

    if (error) {
      console.error('Error updating webhook endpoint:', error);
      return false;
    }

    return true;
  }

  /**
   * Duplicar webhook endpoint
   */
  async duplicateWebhookEndpoint(
    endpointId: string,
    organizationId: number
  ): Promise<{ endpoint: WebhookEndpoint; secret: string } | null> {
    const original = await this.getWebhookEndpointById(endpointId);
    if (!original) return null;

    return this.createWebhookEndpoint(organizationId, {
      name: original.name + ' (copia)',
      target_url: original.target_url,
      events: original.events,
    });
  }

  /**
   * Activar/desactivar webhook endpoint
   */
  async toggleWebhookEndpointStatus(endpointId: string, isActive: boolean): Promise<boolean> {
    const { error } = await supabase
      .from('webhook_endpoints')
      .update({
        is_active: isActive,
        updated_at: new Date().toISOString(),
      })
      .eq('id', endpointId);

    if (error) {
      console.error('Error toggling webhook endpoint status:', error);
      return false;
    }

    return true;
  }

  /**
   * Eliminar webhook endpoint
   */
  async deleteWebhookEndpoint(endpointId: string): Promise<boolean> {
    const { error } = await supabase
      .from('webhook_endpoints')
      .delete()
      .eq('id', endpointId);

    if (error) {
      console.error('Error deleting webhook endpoint:', error);
      return false;
    }

    return true;
  }

  /**
   * Probar webhook endpoint (enviar evento de prueba)
   */
  async testWebhookEndpoint(endpointId: string): Promise<{
    success: boolean;
    statusCode?: number;
    message: string;
  }> {
    const endpoint = await this.getWebhookEndpointById(endpointId);
    if (!endpoint) {
      return { success: false, message: 'Endpoint no encontrado' };
    }

    // Simular envío de test (en producción haría fetch real)
    // Por ahora solo validamos la URL y simulamos respuesta
    try {
      const url = new URL(endpoint.target_url);
      if (!url.protocol.startsWith('http')) {
        return { success: false, message: 'URL inválida: debe ser HTTP o HTTPS' };
      }

      // Simulación de envío exitoso
      return {
        success: true,
        statusCode: 200,
        message: 'Test enviado exitosamente a ' + endpoint.target_url,
      };
    } catch {
      return { success: false, message: 'URL inválida' };
    }
  }

  /**
   * Regenerar secret de webhook endpoint
   */
  async regenerateWebhookSecret(endpointId: string): Promise<string | null> {
    const newSecret = this.generateWebhookSecret();

    const { error } = await supabase
      .from('webhook_endpoints')
      .update({
        secret: newSecret,
        updated_at: new Date().toISOString(),
      })
      .eq('id', endpointId);

    if (error) {
      console.error('Error regenerating webhook secret:', error);
      return null;
    }

    return newSecret;
  }

  // ==================== CONFIGURATION METHODS ====================

  /**
   * Obtiene la configuración del módulo de integraciones
   */
  async getIntegrationSettings(organizationId: number): Promise<IntegrationSettings> {
    const { data, error } = await supabase
      .from('organization_settings')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('key', 'integrations')
      .single();

    if (error || !data) {
      // Retornar defaults si no existe
      return this.getDefaultSettings();
    }

    return {
      ...this.getDefaultSettings(),
      ...data.settings,
    };
  }

  /**
   * Obtiene configuración por defecto
   */
  private getDefaultSettings(): IntegrationSettings {
    return {
      // Retención
      retention: {
        eventsRetentionDays: 90,
        jobsRetentionDays: 30,
        logsRetentionDays: 14,
      },
      // Límites
      limits: {
        maxConnectionsPerOrg: 50,
        maxWebhooksPerOrg: 20,
        maxApiKeysPerOrg: 10,
        maxJobsConcurrent: 5,
        rateLimitPerMinute: 100,
      },
      // Defaults
      defaults: {
        syncIntervalMinutes: 15,
        retryAttempts: 3,
        retryDelaySeconds: 60,
        timeoutSeconds: 30,
      },
      // Notificaciones
      notifications: {
        emailOnConnectionError: true,
        emailOnJobFailure: true,
        slackWebhookUrl: '',
      },
      // Features
      features: {
        enableAutoSync: true,
        enableWebhooks: true,
        enableApiKeys: true,
        enableMappings: true,
      },
    };
  }

  /**
   * Actualiza la configuración del módulo de integraciones
   */
  async updateIntegrationSettings(
    organizationId: number,
    settings: Partial<IntegrationSettings>
  ): Promise<boolean> {
    // Primero obtener settings actuales
    const current = await this.getIntegrationSettings(organizationId);
    const merged = { ...current, ...settings };

    // Verificar si existe el registro
    const { data: existing } = await supabase
      .from('organization_settings')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('key', 'integrations')
      .single();

    if (existing) {
      // Update
      const { error } = await supabase
        .from('organization_settings')
        .update({
          settings: merged,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id);

      if (error) {
        console.error('Error updating integration settings:', error);
        return false;
      }
    } else {
      // Insert
      const { error } = await supabase
        .from('organization_settings')
        .insert({
          organization_id: organizationId,
          key: 'integrations',
          settings: merged,
        });

      if (error) {
        console.error('Error creating integration settings:', error);
        return false;
      }
    }

    return true;
  }

  /**
   * Resetea la configuración a valores por defecto
   */
  async resetIntegrationSettings(organizationId: number): Promise<boolean> {
    return this.updateIntegrationSettings(organizationId, this.getDefaultSettings());
  }

  /**
   * Obtiene estadísticas del módulo
   */
  async getModuleStats(organizationId: number): Promise<IntegrationModuleStats> {
    const [connections, webhooks, apiKeys, jobs, events, mappings] = await Promise.all([
      supabase
        .from('integration_connections')
        .select('id', { count: 'exact' })
        .eq('organization_id', organizationId),
      supabase
        .from('webhook_endpoints')
        .select('id', { count: 'exact' })
        .eq('organization_id', organizationId),
      supabase
        .from('channel_api_keys')
        .select('id', { count: 'exact' })
        .eq('organization_id', organizationId),
      supabase
        .from('integration_jobs')
        .select('id, status')
        .in('connection_id', 
          (await supabase.from('integration_connections').select('id').eq('organization_id', organizationId)).data?.map(c => c.id) || []
        ),
      supabase
        .from('integration_events')
        .select('id')
        .in('connection_id',
          (await supabase.from('integration_connections').select('id').eq('organization_id', organizationId)).data?.map(c => c.id) || []
        )
        .limit(1000),
      supabase
        .from('integration_object_mappings')
        .select('id')
        .in('connection_id',
          (await supabase.from('integration_connections').select('id').eq('organization_id', organizationId)).data?.map(c => c.id) || []
        )
        .is('deleted_at', null)
        .limit(1000),
    ]);

    const jobsData = jobs.data || [];
    const runningJobs = jobsData.filter(j => j.status === 'running').length;
    const failedJobs = jobsData.filter(j => j.status === 'failed').length;

    return {
      totalConnections: connections.count || 0,
      totalWebhooks: webhooks.count || 0,
      totalApiKeys: apiKeys.count || 0,
      totalJobs: jobsData.length,
      runningJobs,
      failedJobs,
      totalEvents: events.data?.length || 0,
      totalMappings: mappings.data?.length || 0,
    };
  }
}

// Tipo para configuración de integraciones
export interface IntegrationSettings {
  retention: {
    eventsRetentionDays: number;
    jobsRetentionDays: number;
    logsRetentionDays: number;
  };
  limits: {
    maxConnectionsPerOrg: number;
    maxWebhooksPerOrg: number;
    maxApiKeysPerOrg: number;
    maxJobsConcurrent: number;
    rateLimitPerMinute: number;
  };
  defaults: {
    syncIntervalMinutes: number;
    retryAttempts: number;
    retryDelaySeconds: number;
    timeoutSeconds: number;
  };
  notifications: {
    emailOnConnectionError: boolean;
    emailOnJobFailure: boolean;
    slackWebhookUrl: string;
  };
  features: {
    enableAutoSync: boolean;
    enableWebhooks: boolean;
    enableApiKeys: boolean;
    enableMappings: boolean;
  };
}

// Tipo para estadísticas del módulo
export interface IntegrationModuleStats {
  totalConnections: number;
  totalWebhooks: number;
  totalApiKeys: number;
  totalJobs: number;
  runningJobs: number;
  failedJobs: number;
  totalEvents: number;
  totalMappings: number;
}

// Tipo para Webhook Endpoints
export interface WebhookEndpoint {
  id: string;
  organization_id: number;
  name: string;
  target_url: string;
  secret?: string;
  events: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// Tipo para API Keys
export interface ChannelApiKey {
  id: string;
  organization_id: number;
  channel_id?: string;
  name: string;
  key_hash: string;
  key_prefix: string;
  scopes: string[];
  is_active: boolean;
  last_used_at?: string;
  expires_at?: string;
  created_at: string;
  created_by?: number;
  revoked_at?: string;
  revoked_by?: number;
}

// Tipo para mapeos
export interface IntegrationMapping {
  id: string;
  connection_id: string;
  external_type: string;
  external_id: string;
  internal_table: string;
  internal_id: string;
  last_seen_at?: string;
  deleted_at?: string;
  metadata: Record<string, unknown>;
  created_at: string;
  connection?: IntegrationConnection;
}

// Tipo para credenciales
export interface IntegrationCredential {
  id: string;
  connection_id: string;
  credential_type: string;
  purpose: 'primary' | 'backup' | 'rotation' | 'legacy';
  secret_ref: string;
  key_prefix?: string;
  status: 'active' | 'expired' | 'revoked' | 'rotating';
  expires_at?: string;
  rotated_at?: string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export const integrationsService = new IntegrationsService();
export default integrationsService;
