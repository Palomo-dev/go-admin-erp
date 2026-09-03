'use client';

/**
 * Servicio de dashboard para el módulo Integraciones.
 *
 * Consulta las tablas de integraciones en Supabase para alimentar la sección
 * `IntegracionesSection` del dashboard unificado de /app/inicio.
 *
 * Tablas involucradas:
 *  - integration_connections  → conexiones configuradas por organización
 *  - integration_webhooks     → webhooks asociados a cada conexión
 *  - event_catalog            → catálogo de eventos disponibles
 *
 * KPIs expuestos:
 *  - totalIntegraciones       → total de conexiones
 *  - integracionesActivas     → conexiones con status = 'connected'
 *  - integracionesInactivas   → conexiones no activas (paused/error/draft/revoked)
 *  - webhooksConfigurados     → total de webhooks de la organización
 *  - eventosDisponibles       → eventos en el catálogo
 */

import { supabase } from '@/lib/supabase/config';
import {
  integrationsService,
  type IntegrationConnection,
  type IntegrationWebhook,
} from '@/lib/services/integrationsService';

// ─── Tipos ───────────────────────────────────────────────────────────────────

export interface IntegracionesKPI {
  totalIntegraciones: number;
  integracionesActivas: number;
  integracionesInactivas: number;
  webhooksConfigurados: number;
  eventosDisponibles: number;
}

export interface WebhookResumen {
  id: string;
  connectionName: string;
  direction: 'inbound' | 'outbound';
  url: string;
  events: string[];
  isActive: boolean;
  lastReceivedAt?: string;
}

// ─── Servicio ────────────────────────────────────────────────────────────────

class IntegracionesDashboardService {
  /**
   * Obtiene los KPIs consolidados del módulo Integraciones.
   */
  async getKPIs(organizationId: number): Promise<IntegracionesKPI> {
    const [connections, webhooks, eventosCount] = await Promise.all([
      this.getConnections(organizationId),
      this.getWebhooks(organizationId),
      this.getEventosDisponibles(),
    ]);

    const totalIntegraciones = connections.length;
    const integracionesActivas = connections.filter(
      (c) => c.status === 'connected',
    ).length;
    const integracionesInactivas = totalIntegraciones - integracionesActivas;
    const webhooksConfigurados = webhooks.length;

    return {
      totalIntegraciones,
      integracionesActivas,
      integracionesInactivas,
      webhooksConfigurados,
      eventosDisponibles: eventosCount,
    };
  }

  /**
   * Obtiene las conexiones de la organización (delega en integrationsService).
   */
  async getConnections(organizationId: number): Promise<IntegrationConnection[]> {
    return integrationsService.getConnections(organizationId);
  }

  /**
   * Obtiene todos los webhooks de la organización, resolviendo el nombre de
   * la conexión asociada.
   */
  async getWebhooks(organizationId: number): Promise<WebhookResumen[]> {
    const { data: connections } = await supabase
      .from('integration_connections')
      .select('id, name')
      .eq('organization_id', organizationId);

    if (!connections || connections.length === 0) {
      return [];
    }

    const connectionIds = connections.map((c) => c.id);
    const connectionNameById = new Map(connections.map((c) => [c.id, c.name]));

    const { data: webhooks, error } = await supabase
      .from('integration_webhooks')
      .select('*')
      .in('connection_id', connectionIds)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching webhooks:', error);
      return [];
    }

    return (webhooks || []).map((w: IntegrationWebhook) => ({
      id: w.id,
      connectionName: connectionNameById.get(w.connection_id) || '—',
      direction: w.direction,
      url: w.url,
      events: w.events || [],
      isActive: w.is_active,
      lastReceivedAt: w.last_received_at,
    }));
  }

  /**
   * Cuenta los eventos disponibles en el catálogo (event_catalog).
   */
  async getEventosDisponibles(): Promise<number> {
    const { count, error } = await supabase
      .from('event_catalog')
      .select('code', { count: 'exact', head: true });

    if (error) {
      // Tabla event_catalog puede no existir o no tener acceso RLS.
      // No loguear como error, simplemente devolver 0 silenciosamente.
      return 0;
    }

    return count ?? 0;
  }
}

export const integracionesDashboardService = new IntegracionesDashboardService();
export default integracionesDashboardService;
