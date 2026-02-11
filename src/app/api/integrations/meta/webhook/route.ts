import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { metaMarketingService } from '@/lib/services/integrations/meta';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET: Verificación del webhook (Facebook envía challenge)
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  // El verify_token se almacena como variable de entorno o en la conexión
  const verifyToken = process.env.META_WEBHOOK_VERIFY_TOKEN || 'go_admin_meta_verify';

  if (mode === 'subscribe' && token === verifyToken) {
    return new NextResponse(challenge, { status: 200 });
  }

  return NextResponse.json({ error: 'Verification failed' }, { status: 403 });
}

// POST: Recibir eventos del webhook
export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();
    const signature = request.headers.get('x-hub-signature-256') || '';

    const body = JSON.parse(rawBody);

    // Buscar conexiones activas de Meta Marketing
    const { data: connections } = await supabaseAdmin
      .from('integration_connections')
      .select(`
        id,
        integration_connectors!inner (
          code,
          provider_id,
          integration_providers!inner ( code )
        )
      `)
      .eq('status', 'active');

    const metaConnections = (connections || []).filter((c: Record<string, unknown>) => {
      const connectors = c.integration_connectors as Record<string, unknown> | undefined;
      return connectors?.code === 'meta_marketing';
    });

    let verified = false;

    for (const conn of metaConnections) {
      const creds = await metaMarketingService.getCredentials(conn.id as string);
      if (!creds?.appSecret) continue;

      const isValid = metaMarketingService.verifyWebhookSignature(
        rawBody,
        signature,
        creds.appSecret
      );

      if (isValid) {
        verified = true;

        // Registrar eventos en integration_events
        const entries = body.entry || [];
        for (const entry of entries) {
          const changes = entry.changes || [];
          for (const change of changes) {
            await supabaseAdmin.from('integration_events').insert({
              connection_id: conn.id,
              event_type: `meta.${body.object}.${change.field}`,
              payload: {
                object: body.object,
                entry_id: entry.id,
                entry_time: entry.time,
                field: change.field,
                value: change.value,
                verified: true,
              },
              status: 'processed',
            });
          }
        }

        break;
      }
    }

    // Facebook espera HTTP 200 siempre
    return NextResponse.json({ received: true, verified });
  } catch (error) {
    console.error('Error processing Meta webhook:', error);
    return NextResponse.json({ received: true, error: 'Internal error' }, { status: 200 });
  }
}
