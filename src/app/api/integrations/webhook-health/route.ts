// ============================================================
// GET /api/integrations/webhook-health
// Estado de configuración de los webhooks QR de la organización de la sesión.
// Para cada proveedor QR: conexiones activas, secreto de webhook configurado,
// último evento recibido y URL del webhook.
//
// SEGURIDAD (GO-sec, 2026-09-24): antes bastaba `auth.getSession()` y el
// resumen se calculaba sobre las conexiones y eventos de TODAS las
// organizaciones (conteos y último evento ajenos). Ahora sesión validada +
// administración (`withOrg({ admin: true })`) y todo se filtra por la
// organización de la sesión; una organización ajena en la query → 403.
// ============================================================

import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { OrgContextError } from '@/lib/utils/orgContextError';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

const RUTA = '/api/integrations/webhook-health';

/** Proveedores QR soportados y sus codigos de connector. */
const QR_PROVIDERS: Array<{ code: string; connectorCode: string; label: string }> = [
  { code: 'wompi', connectorCode: 'wompi_co', label: 'Wompi' },
  { code: 'bancolombia', connectorCode: 'bancolombia_qr', label: 'Bancolombia' },
  { code: 'breb', connectorCode: 'breb_mono', label: 'Bre-B (Mono)' },
  { code: 'redeban', connectorCode: 'redeban_qr', label: 'Redeban' },
];

/** Estado de webhook de un proveedor. */
interface WebhookHealthStatus {
  provider: string;
  label: string;
  hasActiveConnections: boolean;
  activeConnectionsCount: number;
  hasWebhookSecret: boolean;
  lastEventAt: string | null;
  lastEventType: string | null;
  webhookUrl: string;
}

/** URL pública del webhook: la de la app configurada o, si falta, el origen de la petición. */
function buildWebhookUrl(request: Request, providerCode: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
  return `${base.replace(/\/$/, '')}/api/integrations/${providerCode}/webhook`;
}

export const GET = withOrg(async (ctx, request) => {
  try {
    await readOrgBody(ctx, request, { route: RUTA });
    const admin = getSupabaseAdmin();
    const results: WebhookHealthStatus[] = [];

    for (const provider of QR_PROVIDERS) {
      const vacio: WebhookHealthStatus = {
        provider: provider.code,
        label: provider.label,
        hasActiveConnections: false,
        activeConnectionsCount: 0,
        hasWebhookSecret: false,
        lastEventAt: null,
        lastEventType: null,
        webhookUrl: buildWebhookUrl(request, provider.code),
      };

      const { data: connector } = await admin
        .from('integration_connectors')
        .select('id')
        .eq('code', provider.connectorCode)
        .maybeSingle();
      if (!connector) {
        results.push(vacio);
        continue;
      }

      // Conexiones activas de ESTA organización
      const { data: connections } = await admin
        .from('integration_connections')
        .select('id')
        .eq('organization_id', ctx.organizationId)
        .eq('connector_id', connector.id)
        .in('status', ['connected', 'paused']);

      const connectionIds = (connections ?? []).map((c) => c.id as string);
      if (connectionIds.length === 0) {
        results.push(vacio);
        continue;
      }

      const { data: creds } = await admin
        .from('integration_credentials')
        .select('id')
        .in('connection_id', connectionIds)
        .eq('purpose', 'events_secret')
        .eq('status', 'active')
        .limit(1);

      const { data: lastEvent } = await admin
        .from('integration_events')
        .select('event_type, created_at')
        .in('connection_id', connectionIds)
        .eq('direction', 'inbound')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      results.push({
        ...vacio,
        hasActiveConnections: true,
        activeConnectionsCount: connectionIds.length,
        hasWebhookSecret: (creds ?? []).length > 0,
        lastEventAt: (lastEvent?.created_at as string | undefined) ?? null,
        lastEventType: (lastEvent?.event_type as string | undefined) ?? null,
      });
    }

    return NextResponse.json({ providers: results });
  } catch (err) {
    if (err instanceof OrgContextError) throw err;
    console.error('[API Webhook Health] Error:', err instanceof Error ? err.message : String(err));
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}, { admin: true });
