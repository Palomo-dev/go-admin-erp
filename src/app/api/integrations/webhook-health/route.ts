// ============================================================
// GET /api/integrations/webhook-health
// Retorna el estado de configuracion de webhooks por proveedor.
// Para cada proveedor QR verifica: conexiones activas, credenciales
// de webhook configuradas, ultimo evento recibido y URL del webhook.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

/** Proveedores QR soportados y sus codigos de connector. */
const QR_PROVIDERS: Array<{ code: string; connectorCode: string; label: string }> = [
  { code: 'wompi', connectorCode: 'wompi_co', label: 'Wompi' },
  { code: 'bancolombia', connectorCode: 'bancolombia_qr', label: 'Bancolombia' },
  { code: 'breb', connectorCode: 'breb_mono', label: 'Bre-B (Mono)' },
  { code: 'redeban', connectorCode: 'redeban_qr', label: 'Redeban' },
];

/** Estado de webhook de un proveedor. */
interface WebhookHealthStatus {
  /** Codigo del proveedor. */
  provider: string;
  /** Etiqueta legible del proveedor. */
  label: string;
  /** Indica si hay conexiones activas. */
  hasActiveConnections: boolean;
  /** Numero de conexiones activas. */
  activeConnectionsCount: number;
  /** Indica si hay credenciales de webhook configuradas. */
  hasWebhookSecret: boolean;
  /** Fecha del ultimo evento recibido (ISO) o null. */
  lastEventAt: string | null;
  /** Tipo del ultimo evento recibido o null. */
  lastEventType: string | null;
  /** URL publica del webhook. */
  webhookUrl: string;
}

/**
 * Construye la URL publica del webhook a partir del host del request.
 */
function buildWebhookUrl(request: NextRequest, providerCode: string): string {
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}/api/integrations/${providerCode}/webhook`;
}

export async function GET(request: NextRequest) {
  try {
    // Verificar autenticacion
    const supabase = createRouteHandlerClient({ cookies });
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const admin = getSupabaseAdmin();
    const results: WebhookHealthStatus[] = [];

    for (const provider of QR_PROVIDERS) {
      // 1. Buscar el connector por codigo
      const { data: connector } = await admin
        .from('integration_connectors')
        .select('id')
        .eq('code', provider.connectorCode)
        .single();

      if (!connector) {
        results.push({
          provider: provider.code,
          label: provider.label,
          hasActiveConnections: false,
          activeConnectionsCount: 0,
          hasWebhookSecret: false,
          lastEventAt: null,
          lastEventType: null,
          webhookUrl: buildWebhookUrl(request, provider.code),
        });
        continue;
      }

      // 2. Buscar conexiones activas del connector
      const { data: connections } = await admin
        .from('integration_connections')
        .select('id')
        .eq('connector_id', connector.id)
        .in('status', ['connected', 'paused']);

      const connectionIds = (connections ?? []).map((c) => c.id as string);
      const hasActiveConnections = connectionIds.length > 0;

      // 3. Verificar si hay credenciales de webhook configuradas
      let hasWebhookSecret = false;
      if (connectionIds.length > 0) {
        const { data: creds } = await admin
          .from('integration_credentials')
          .select('id')
          .in('connection_id', connectionIds)
          .eq('purpose', 'events_secret')
          .eq('status', 'active')
          .limit(1);

        hasWebhookSecret = (creds ?? []).length > 0;
      }

      // 4. Obtener el ultimo evento recibido de estas conexiones
      let lastEventAt: string | null = null;
      let lastEventType: string | null = null;
      if (connectionIds.length > 0) {
        const { data: lastEvent } = await admin
          .from('integration_events')
          .select('event_type, created_at')
          .in('connection_id', connectionIds)
          .eq('direction', 'inbound')
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        if (lastEvent) {
          lastEventAt = lastEvent.created_at as string;
          lastEventType = lastEvent.event_type as string;
        }
      }

      results.push({
        provider: provider.code,
        label: provider.label,
        hasActiveConnections,
        activeConnectionsCount: connectionIds.length,
        hasWebhookSecret,
        lastEventAt,
        lastEventType,
        webhookUrl: buildWebhookUrl(request, provider.code),
      });
    }

    return NextResponse.json({ providers: results });
  } catch (err) {
    console.error('[API Webhook Health] Error:', err);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 },
    );
  }
}
