// ============================================================
// POST /api/integrations/bold/webhook
// Eventos de Bold para el ERP: cobros QR del POS y links de pago. Llegan directo de Bold (URL del
// ERP, organizaciones sin dominio verificado) o reenviados por la tienda (cabecera
// `x-goadmin-reenviado`), con el cuerpo y la firma intactos.
//
// Sin sesión: lo invoca Bold. La conexión —y con ella la organización— sale de la llave secreta
// que valida `x-bold-signature` (firmaBold.ts). Sin firma válida: 401.
// Bold exige 200 en menos de 2 s: el procesamiento corre con `after()`.
// ============================================================

import { NextRequest, NextResponse, after } from 'next/server';
import { boldService, type BoldWebhookEvent } from '@/lib/services/integrations/bold';
import { conexionQueFirmaBold } from '@/lib/services/integrations/bold/firmaBold';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

/** Bold puede enviar campos fuera del contrato tipado; leerlos sin romper el tipo. */
function asRecord(value: unknown): Record<string, unknown> {
  return (value ?? {}) as Record<string, unknown>;
}

export async function POST(request: NextRequest) {
  try {
    // Bytes exactos: la firma se calcula sobre ellos.
    const cuerpo = Buffer.from(await request.arrayBuffer());

    // GO-sec (2026-09-28): el body crudo no va a los logs (datos del pagador); solo su tamaño.
    console.info('[Bold Webhook] evento recibido', { bytes: cuerpo.length });

    let event: BoldWebhookEvent;
    try {
      event = JSON.parse(cuerpo.toString('utf8')) as BoldWebhookEvent;
    } catch {
      return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 });
    }

    const signature = request.headers.get('x-bold-signature');
    if (!signature) {
      console.warn('[Bold Webhook] Evento sin firma x-bold-signature');
      return NextResponse.json({ error: 'Firma requerida' }, { status: 401 });
    }

    const supabaseAdmin = getSupabaseAdmin();
    const pista = new URL(request.url).searchParams.get('connectionId');
    const firmante = await conexionQueFirmaBold(supabaseAdmin, cuerpo, signature, pista);
    if (!firmante) {
      console.error('[Bold Webhook] Ninguna conexión de Bold valida la firma');
      return NextResponse.json({ error: 'Firma invalida' }, { status: 401 });
    }

    await supabaseAdmin.from('integration_events').insert({
      connection_id: firmante.connectionId,
      organization_id: firmante.organizationId,
      source: 'webhook',
      direction: 'inbound',
      event_type: event.type ?? ((asRecord(event).event_type as string | undefined) ?? 'webhook'),
      external_event_id: (asRecord(event.data).payment_id as string | undefined) ?? (asRecord(event).subject as string | undefined) ?? null,
      payload: event as unknown as Record<string, unknown>,
      status: 'received',
    });

    // Responder ya y procesar después (sesión QR por referencia, de ESTA conexión).
    after(async () => {
      const r = await boldService.processWebhook(event, firmante.connectionId).catch((procErr: unknown) => ({
        success: false,
        error: procErr instanceof Error ? procErr.message : String(procErr),
      }));
      if (!r.success) console.warn('[Bold Webhook] Evento sin procesar:', r.error);
    });

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (err) {
    // Fallo interno ya registrado: 200 para que Bold no reintente en bucle.
    console.error('[Bold Webhook] Error:', err instanceof Error ? err.message : String(err));
    return NextResponse.json({ received: true }, { status: 200 });
  }
}
