// ============================================================
// POST /api/integrations/wompi/webhook
// Eventos de Wompi (transaction.updated, etc.).
//
// Credencial del proveedor: el «secreto de eventos» de la cuenta de Wompi
// (`integration_credentials.purpose = 'events_secret'` de la conexión
// `wompi_co`). Wompi manda `signature.checksum` = SHA-256 de los valores de
// `signature.properties` + `timestamp` + ese secreto (`wompiFirma.ts`).
//
// SEGURIDAD (GO-sec):
//  - 2026-09-23: fail-closed. Sin secreto activo → 401 sin procesar; checksum
//    en tiempo constante.
//  - 2026-09-24: la conexión que firmó se identifica POR LA FIRMA: se prueba
//    el `events_secret` de cada conexión Wompi `connected` y solo las que
//    validan el checksum cuentan. Antes la organización salía de la
//    referencia asumiendo `GO-<org>-…`; las del POS (`POS-<timestamp>-<org>`)
//    daban NaN y el QR Bancolombia vía Wompi nunca se confirmaba.
//  - La sesión QR se busca con `getQrSessionForWebhook(conexión que firmó,
//    referencia)` —la organización de esa conexión y esa conexión, igual que
//    Bre-B, Redeban, Bancolombia y Bold— y se confirma con `confirmQrPayment`
//    (sesión `paid` + `payments`), verificando antes que el importe y la
//    moneda del evento sean los de la sesión. Antes se escribía
//    `payment_qr_sessions.external_payment_id`, columna que no existe, así que
//    el update fallaba entero.
//  - Si no es una sesión QR, se actualiza el pago PENDIENTE con esa referencia
//    en la organización que firmó, con columnas reales (`status`,
//    `processor_response`); antes escribía `payments.external_id` y
//    `payments.metadata`, que no existen.
//  - El evento se registra en la conexión que firmó y se marca procesado por
//    su id (antes se marcaban todos los eventos con ese id externo, de
//    cualquier organización).
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { verificarChecksumWompi } from '@/lib/services/integrations/wompi/wompiFirma';
import { getQrSessionForWebhook, type QrSession } from '@/lib/services/integrations/qrShared/qrSessionService';
import { confirmQrPayment } from '@/lib/services/integrations/qrShared/paymentConfirmation';
import type { WompiWebhookEvent } from '@/lib/services/integrations/wompi/wompiTypes';

type Fila = Record<string, unknown>;

interface Firmante {
  id: string;
  organizationId: number;
}

/** Estado de Wompi → estado de `payments`. */
const ESTADO_PAGO: Record<string, string> = {
  APPROVED: 'completed',
  DECLINED: 'failed',
  VOIDED: 'refunded',
  ERROR: 'failed',
  PENDING: 'pending',
};
/** Estados finales que rechazan una sesión QR pendiente. */
const RECHAZOS_QR = new Set(['DECLINED', 'ERROR', 'VOIDED']);

function noAutorizado(motivo: string) {
  console.warn(`[Wompi Webhook] rechazado (fail-closed): ${motivo}`);
  return NextResponse.json({ error: 'webhook_unauthorized' }, { status: 401 });
}

/**
 * Conexiones Wompi `connected` cuyo `events_secret` activo valida el checksum
 * del evento. Normalmente una; varias solo si la misma cuenta de Wompi está
 * conectada en más de una organización (entonces decide la referencia).
 */
async function conexionesQueFirmaron(admin: SupabaseClient, event: WompiWebhookEvent): Promise<Firmante[]> {
  const { data: conector } = await admin.from('integration_connectors').select('id').eq('code', 'wompi_co').maybeSingle();
  const conectorId = (conector as Fila | null)?.id;
  if (!conectorId) return [];

  const { data: conexiones, error } = await admin
    .from('integration_connections')
    .select('id, organization_id, status')
    .eq('connector_id', String(conectorId))
    .eq('status', 'connected');
  if (error) throw new Error(`integration_connections: ${error.message}`);
  const filas = (conexiones as Fila[] | null) ?? [];
  if (filas.length === 0) return [];

  const { data: secretos, error: errSecretos } = await admin
    .from('integration_credentials')
    .select('connection_id, secret_ref')
    .in('connection_id', filas.map((c) => String(c.id)))
    .eq('purpose', 'events_secret')
    .eq('status', 'active');
  if (errSecretos) throw new Error(`integration_credentials: ${errSecretos.message}`);
  const secretoPorConexion = new Map<string, string>();
  for (const s of (secretos as Fila[] | null) ?? []) {
    if (typeof s.secret_ref === 'string' && s.secret_ref) secretoPorConexion.set(String(s.connection_id), s.secret_ref);
  }

  return filas
    .filter((c) => verificarChecksumWompi(event, secretoPorConexion.get(String(c.id)) ?? ''))
    .map((c) => ({ id: String(c.id), organizationId: Number(c.organization_id) }));
}

/** Pago PENDIENTE con esa referencia en la organización que firmó. */
async function pagoPendiente(admin: SupabaseClient, organizationId: number, reference: string): Promise<Fila | null> {
  const { data } = await admin
    .from('payments')
    .select('id, status')
    .eq('organization_id', organizationId)
    .eq('reference', reference)
    .eq('status', 'pending')
    .limit(1);
  return ((data as Fila[] | null) ?? [])[0] ?? null;
}

function importeCoincide(sesion: QrSession, tx: WompiWebhookEvent['data']['transaction']): boolean {
  const centavos = Math.round(Number(sesion.amount) * 100);
  const moneda = String(sesion.currency ?? '').trim().toUpperCase();
  return moneda !== '' && Number(tx.amount_in_cents) === centavos && String(tx.currency ?? '').toUpperCase() === moneda;
}

export async function POST(request: NextRequest) {
  let event: WompiWebhookEvent;
  try {
    event = JSON.parse(await request.text()) as WompiWebhookEvent;
  } catch {
    return NextResponse.json({ error: 'Evento inválido' }, { status: 400 });
  }
  if (!event?.event || !event.data?.transaction) {
    return NextResponse.json({ error: 'Evento inválido' }, { status: 400 });
  }
  // Sin firma no hay forma de saber qué conexión lo envía: no autorizado.
  if (!event.signature?.checksum) {
    return noAutorizado('evento sin checksum');
  }

  try {
    const admin = getSupabaseAdmin();
    const firmantes = await conexionesQueFirmaron(admin, event);
    if (firmantes.length === 0) {
      return noAutorizado('ninguna conexión Wompi con events_secret activo valida el checksum');
    }

    const tx = event.data.transaction;
    const reference = String(tx.reference ?? '');
    const esActualizacion = event.event === 'transaction.updated';

    // La conexión que firmó y, si la hay, la sesión QR o el pago de su organización.
    let elegida: Firmante = firmantes[0];
    let sesionQr: QrSession | null = null;
    let pago: Fila | null = null;
    if (esActualizacion && reference) {
      for (const f of firmantes) {
        sesionQr = await getQrSessionForWebhook(f.id, reference);
        if (sesionQr) {
          elegida = f;
          break;
        }
      }
      if (!sesionQr) {
        for (const f of firmantes) {
          pago = await pagoPendiente(admin, f.organizationId, reference);
          if (pago) {
            elegida = f;
            break;
          }
        }
      }
    }
    if (firmantes.length > 1 && !sesionQr && !pago) {
      console.warn('[Wompi Webhook] varias conexiones comparten events_secret y la referencia no decide', {
        conexiones: firmantes.map((f) => f.id),
      });
    }

    // Registrar el evento en la conexión que firmó.
    const { data: registrado } = await admin
      .from('integration_events')
      .insert({
        connection_id: elegida.id,
        organization_id: elegida.organizationId,
        source: 'webhook',
        direction: 'inbound',
        event_type: event.event,
        external_event_id: tx.id,
        payload: event as unknown as Fila,
        status: 'received',
        // event_time es GENERATED ALWAYS AS (created_at): no se inserta.
      })
      .select('id')
      .single();
    const eventoId = (registrado as Fila | null)?.id as string | undefined;

    const marcarEvento = async (estado: 'processed' | 'error', mensaje?: string) => {
      if (!eventoId) return;
      await admin
        .from('integration_events')
        .update({ status: estado, processed_at: new Date().toISOString(), error_message: mensaje ?? null })
        .eq('id', eventoId);
    };

    const respuestaProveedor: Fila = {
      wompi_transaction_id: tx.id,
      wompi_status: tx.status,
      wompi_payment_method: tx.payment_method_type,
      amount_in_cents: tx.amount_in_cents,
      currency: tx.currency,
      reference,
      webhook_received_at: new Date().toISOString(),
    };

    let fallo: string | null = null;
    // Un fallo de escritura se reintenta (500); un evento que no cuadra, no.
    let reintentable = true;
    if (esActualizacion && sesionQr) {
      // QR (Bancolombia vía Wompi): la sesión de ESTA conexión y su organización.
      if (tx.status === 'APPROVED') {
        if (!importeCoincide(sesionQr, tx)) {
          fallo = 'El importe o la moneda del evento no coinciden con la sesión QR';
          reintentable = false;
          console.warn('[Wompi Webhook] importe distinto al de la sesión QR; no se confirma', {
            sesion: sesionQr.id,
            organizationId: sesionQr.organization_id,
          });
        } else {
          const r = await confirmQrPayment({
            qrSessionId: sesionQr.id,
            organizationId: sesionQr.organization_id,
            status: 'paid',
            providerResponse: respuestaProveedor,
          });
          if (!r.success) fallo = r.error ?? 'No se pudo confirmar la sesión QR';
        }
      } else if (RECHAZOS_QR.has(tx.status) && sesionQr.status === 'pending') {
        const r = await confirmQrPayment({
          qrSessionId: sesionQr.id,
          organizationId: sesionQr.organization_id,
          status: 'rejected',
          providerResponse: respuestaProveedor,
        });
        if (!r.success) fallo = r.error ?? 'No se pudo rechazar la sesión QR';
      }
    } else if (esActualizacion && pago) {
      const { error: errPago } = await admin
        .from('payments')
        .update({
          status: ESTADO_PAGO[tx.status] ?? 'pending',
          processor_response: { ...respuestaProveedor, updated_by_webhook: true },
          updated_at: new Date().toISOString(),
        })
        .eq('id', String(pago.id))
        .eq('organization_id', elegida.organizationId);
      if (errPago) fallo = `payments: ${errPago.message}`;
    }

    await marcarEvento(fallo ? 'error' : 'processed', fallo ?? undefined);

    await admin
      .from('integration_connections')
      .update({ last_activity_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', elegida.id);

    if (fallo && reintentable) {
      // Wompi reintenta; `confirmQrPayment` es idempotente.
      console.error('[Wompi Webhook] no se pudo aplicar el evento:', fallo);
      return NextResponse.json({ received: true, processed: false }, { status: 500 });
    }
    return NextResponse.json({ received: true }, { status: 200 });
  } catch (err) {
    console.error('[Wompi Webhook] Error procesando:', err instanceof Error ? err.message : String(err));
    return NextResponse.json({ received: true }, { status: 200 });
  }
}
