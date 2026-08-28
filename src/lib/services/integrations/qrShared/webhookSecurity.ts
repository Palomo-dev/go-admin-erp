/**
 * Utilidades de seguridad para webhooks de proveedores QR.
 * Verificacion de firma HMAC-SHA256, prevencion de replay attacks,
 * obtencion de secretos de webhook y registro de eventos entrantes.
 */

import crypto from 'crypto';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

/** Mapeo de codigo de proveedor (URL) a codigo de connector en BD. */
const PROVIDER_TO_CONNECTOR: Record<string, string> = {
  wompi: 'wompi_co',
  bancolombia: 'bancolombia_qr',
  breb: 'breb_mono',
  redeban: 'redeban_qr',
};

/** Proposito de la credencial que almacena el secreto de webhook. */
const WEBHOOK_SECRET_PURPOSE = 'events_secret';

/**
 * Verifica la firma HMAC-SHA256 de un payload de webhook.
 * Compara el digest calculado con la firma recibida usando comparacion
 * constante en tiempo para evitar timing attacks.
 *
 * @param provider Codigo del proveedor (wompi, bancolombia, breb, redeban).
 * @param payload Cuerpo crudo del webhook (string).
 * @param signature Firma recibida en el header (hex o base64).
 * @param secret Secreto compartido con el proveedor.
 * @returns true si la firma es valida, false en caso contrario.
 */
export function verifyWebhookSignature(
  provider: string,
  payload: string,
  signature: string,
  secret: string,
): boolean {
  try {
    if (!payload || !signature || !secret) {
      return false;
    }

    // Calcular HMAC-SHA256 del payload con el secreto
    const computed = crypto
      .createHmac('sha256', secret)
      .update(payload, 'utf8')
      .digest('hex');

    // Algunos proveedores envian la firma en base64; normalizar a hex
    let received = signature;
    if (provider === 'breb' || provider === 'redeban') {
      // Mono y Redeban pueden enviar base64; convertir a hex para comparar
      try {
        const buf = Buffer.from(signature, 'base64');
        received = buf.toString('hex');
      } catch {
        // Si falla la conversion, usar el valor original
        received = signature;
      }
    }

    // Comparacion constante en tiempo para evitar timing attacks
    const computedBuf = Buffer.from(computed, 'hex');
    const receivedBuf = Buffer.from(received, 'hex');

    if (computedBuf.length !== receivedBuf.length) {
      return false;
    }

    return crypto.timingSafeEqual(computedBuf, receivedBuf);
  } catch (err) {
    console.error('[webhookSecurity] Error verificando firma:', err);
    return false;
  }
}

/**
 * Verifica que el timestamp de un webhook sea reciente para prevenir
 * replay attacks. Acepta timestamps en formato ISO 8601 o epoch (segundos).
 *
 * @param timestamp Timestamp del webhook (ISO 8601 o epoch segundos).
 * @param maxAgeMinutes Antiguedad maxima permitida en minutos (default 5).
 * @returns true si el timestamp es reciente, false si es muy antiguo o invalido.
 */
export function verifyWebhookTimestamp(
  timestamp: string,
  maxAgeMinutes: number = 5,
): boolean {
  try {
    if (!timestamp) {
      return false;
    }

    // Intentar parsear como ISO 8601; si falla, intentar como epoch segundos
    let tsDate: Date;
    const asNumber = Number(timestamp);
    if (!Number.isNaN(asNumber) && timestamp.length <= 12) {
      // Epoch en segundos
      tsDate = new Date(asNumber * 1000);
    } else {
      tsDate = new Date(timestamp);
    }

    if (Number.isNaN(tsDate.getTime())) {
      return false;
    }

    const now = Date.now();
    const diffMs = now - tsDate.getTime();

    // Permitir timestamps ligeramente en el futuro (tolerancia de 1 minuto)
    // para compensar desviaciones de reloj entre servidores
    const maxAgeMs = maxAgeMinutes * 60 * 1000;
    const futureToleranceMs = 60 * 1000;

    return diffMs <= maxAgeMs && diffMs >= -futureToleranceMs;
  } catch (err) {
    console.error('[webhookSecurity] Error verificando timestamp:', err);
    return false;
  }
}

/**
 * Obtiene el secreto de webhook configurado para una conexion desde
 * la tabla integration_credentials (purpose = 'events_secret').
 *
 * @param provider Codigo del proveedor (no usado directamente, reservado).
 * @param connectionId ID de la conexion de integracion.
 * @returns El secreto (secret_ref) o null si no existe o esta inactivo.
 */
export async function getWebhookSecret(
  provider: string,
  connectionId: string,
): Promise<string | null> {
  try {
    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
      .from('integration_credentials')
      .select('secret_ref')
      .eq('connection_id', connectionId)
      .eq('purpose', WEBHOOK_SECRET_PURPOSE)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error || !data) {
      return null;
    }

    return data.secret_ref as string;
  } catch (err) {
    console.error('[webhookSecurity] Error obteniendo secreto de webhook:', err);
    return null;
  }
}

/**
 * Registra un evento de webhook entrante en la tabla integration_events.
 * Resuelve la conexion activa del proveedor si no se provee connectionId.
 *
 * @param provider Codigo del proveedor (wompi, bancolombia, breb, redeban).
 * @param event Tipo de evento recibido.
 * @param payload Payload del webhook.
 * @param status Estado del procesamiento: success, failed, invalid.
 * @param connectionIdOverride ID de conexion explicito (opcional).
 * @param organizationIdOverride ID de organizacion explicito (opcional).
 */
export async function logWebhookEvent(
  provider: string,
  event: string,
  payload: Record<string, unknown>,
  status: 'success' | 'failed' | 'invalid',
  connectionIdOverride?: string,
  organizationIdOverride?: number,
): Promise<void> {
  try {
    const supabase = getSupabaseAdmin();

    let connectionId = connectionIdOverride;
    let organizationId = organizationIdOverride;

    // Si no se provee connectionId, resolver la conexion activa mas reciente
    if (!connectionId) {
      const connectorCode = PROVIDER_TO_CONNECTOR[provider];
      if (!connectorCode) {
        console.warn(
          `[webhookSecurity] Proveedor desconocido: ${provider}. No se pudo registrar evento.`,
        );
        return;
      }

      const { data: connector } = await supabase
        .from('integration_connectors')
        .select('id')
        .eq('code', connectorCode)
        .single();

      if (!connector) {
        console.warn(
          `[webhookSecurity] Connector no encontrado para proveedor: ${provider}`,
        );
        return;
      }

      const { data: connection } = await supabase
        .from('integration_connections')
        .select('id, organization_id')
        .eq('connector_id', connector.id)
        .eq('status', 'connected')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (!connection) {
        console.warn(
          `[webhookSecurity] No hay conexion activa para proveedor: ${provider}`,
        );
        return;
      }

      connectionId = connection.id as string;
      organizationId = (connection.organization_id as number) ?? undefined;
    }

    const statusMap: Record<string, string> = {
      success: 'processed',
      failed: 'error',
      invalid: 'invalid',
    };

    await supabase.from('integration_events').insert({
      connection_id: connectionId,
      organization_id: organizationId ?? null,
      source: 'webhook',
      direction: 'inbound',
      event_type: event,
      payload,
      status: statusMap[status] ?? 'received',
      event_time: new Date().toISOString(),
      error_message: status === 'failed' || status === 'invalid'
        ? `Webhook marcado como ${status}`
        : null,
    });
  } catch (err) {
    // No lanzar error: el registro de evento no debe romper el flujo del webhook
    console.error('[webhookSecurity] Error registrando evento de webhook:', err);
  }
}
