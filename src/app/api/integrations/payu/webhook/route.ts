import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { payuService } from '@/lib/services/integrations/payu';
import { PAYU_CREDENTIAL_PURPOSES } from '@/lib/services/integrations/payu/payuConfig';

export async function POST(request: NextRequest) {
  try {
    // PayU puede enviar como form-urlencoded o JSON
    const contentType = request.headers.get('content-type') || '';
    let body: Record<string, string>;

    if (contentType.includes('application/x-www-form-urlencoded')) {
      const formData = await request.formData();
      body = Object.fromEntries(formData.entries()) as Record<string, string>;
    } else {
      body = await request.json();
    }

    // Parsear payload
    const payload = payuService.parseWebhookPayload(body);
    if (!payload) {
      return NextResponse.json({ error: 'Payload inválido' }, { status: 400 });
    }

    // Buscar conexión activa de PayU
    const { data: connections } = await getSupabaseAdmin()
      .from('integration_connections')
      .select(`
        id,
        integration_connectors!inner (
          provider_id,
          integration_providers!inner ( code )
        )
      `)
      .eq('status', 'active');

    const payuConnections = (connections || []).filter((c: Record<string, unknown>) => {
      const connectors = c.integration_connectors as Record<string, unknown> | undefined;
      const providers = connectors?.integration_providers as Record<string, unknown> | undefined;
      return providers?.code === 'payu';
    });

    let verified = false;

    for (const conn of payuConnections) {
      const creds = await payuService.getCredentials(conn.id as string);
      if (!creds?.apiKey || !creds?.merchantId) continue;

      // Verificar que el merchant_id coincide
      if (payload.merchant_id !== creds.merchantId) continue;

      // Verificar firma MD5
      const isValid = payuService.verifyWebhookSignature(
        creds.apiKey,
        creds.merchantId,
        payload
      );

      if (isValid) {
        verified = true;

        // Registrar evento en integration_events
        await getSupabaseAdmin().from('integration_events').insert({
          connection_id: conn.id,
          event_type: `payment.${payload.state_pol === '4' ? 'approved' : payload.state_pol === '6' ? 'declined' : 'pending'}`,
          payload: {
            reference_sale: payload.reference_sale,
            reference_pol: payload.reference_pol,
            state_pol: payload.state_pol,
            response_code_pol: payload.response_code_pol,
            value: payload.value,
            currency: payload.currency,
            payment_method: payload.payment_method,
            transaction_id: payload.transaction_id,
            verified,
          },
          status: 'processed',
        });

        break;
      }
    }

    if (!verified && payuConnections.length > 0) {
      console.warn('PayU webhook: firma no verificada para reference_sale:', payload.reference_sale);
    }

    // PayU espera HTTP 200 para confirmar recepción
    return NextResponse.json({ received: true, verified });
  } catch (error) {
    console.error('Error processing PayU webhook:', error);
    return NextResponse.json({ received: true, error: 'Internal error' }, { status: 200 });
  }
}
