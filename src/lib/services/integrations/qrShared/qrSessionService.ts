/**
 * CRUD de payment_qr_sessions en Supabase.
 * Operaciones server-side usando el cliente admin (service role).
 */

import { getSupabaseAdmin } from '@/lib/supabase/admin';

/** Datos para crear una sesion QR. */
export interface QrSessionData {
  organizationId: number;
  branchId?: number;
  paymentId?: string;
  providerCode: string;
  connectorCode: string;
  integrationConnectionId?: string;
  reference: string;
  externalQrId?: string;
  qrData?: string;
  qrImageUrl?: string;
  amount: number;
  currency?: string;
  source?: string;
  sourceId?: string;
  customerLabel?: string;
  expiresAt?: string;
  createdBy?: string;
}

/** Respuesta de BD para una sesion QR. */
export interface QrSession {
  id: string;
  organization_id: number;
  branch_id: number | null;
  payment_id: string | null;
  provider_code: string;
  connector_code: string;
  integration_connection_id: string | null;
  reference: string;
  external_qr_id: string | null;
  qr_data: string | null;
  qr_image_url: string | null;
  amount: number;
  currency: string | null;
  source: string | null;
  source_id: string | null;
  customer_label: string | null;
  status: 'pending' | 'paid' | 'expired' | 'rejected' | 'cancelled';
  expires_at: string | null;
  paid_at: string | null;
  provider_response: Record<string, unknown> | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/** Estados validos de una sesion QR. */
export type QrSessionStatus = 'pending' | 'paid' | 'expired' | 'rejected' | 'cancelled';

/** Mapea QrSessionData (camelCase) al formato snake_case de la BD. */
function toRow(data: QrSessionData): Record<string, unknown> {
  return {
    organization_id: data.organizationId,
    branch_id: data.branchId ?? null,
    payment_id: data.paymentId ?? null,
    provider_code: data.providerCode,
    connector_code: data.connectorCode,
    integration_connection_id: data.integrationConnectionId ?? null,
    reference: data.reference,
    external_qr_id: data.externalQrId ?? null,
    qr_data: data.qrData ?? null,
    qr_image_url: data.qrImageUrl ?? null,
    amount: data.amount,
    currency: data.currency ?? null,
    source: data.source ?? null,
    source_id: data.sourceId ?? null,
    customer_label: data.customerLabel ?? null,
    status: 'pending',
    expires_at: data.expiresAt ?? null,
    created_by: data.createdBy ?? null,
  };
}

/**
 * Crea una nueva sesion QR.
 * @returns La sesion creada o null si falla.
 */
export async function createQrSession(data: QrSessionData): Promise<QrSession | null> {
  try {
    const supabase = getSupabaseAdmin();
    const { data: row, error } = await supabase
      .from('payment_qr_sessions')
      .insert(toRow(data))
      .select()
      .single();

    if (error || !row) {
      console.error('[qrSessionService] Error al crear sesion QR:', error);
      return null;
    }

    return row as QrSession;
  } catch (err) {
    console.error('[qrSessionService] Excepcion al crear sesion QR:', err);
    return null;
  }
}

/**
 * Busca una sesion QR por organizationId + reference.
 * @returns La sesion o null si no existe/falla.
 */
export async function getQrSessionByReference(
  organizationId: number,
  reference: string,
): Promise<QrSession | null> {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('payment_qr_sessions')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('reference', reference)
      .single();

    if (error || !data) {
      return null;
    }

    return data as QrSession;
  } catch (err) {
    console.error('[qrSessionService] Excepcion al buscar sesion QR:', err);
    return null;
  }
}

/**
 * Actualiza el estado de una sesion QR.
 * @param id ID de la sesion
 * @param status Nuevo estado
 * @param extra Campos adicionales a actualizar
 * @returns true si se actualizo correctamente
 */
export async function updateQrSessionStatus(
  id: string,
  status: QrSessionStatus,
  extra?: Record<string, unknown>,
): Promise<boolean> {
  try {
    const supabase = getSupabaseAdmin();
    const payload: Record<string, unknown> = { status, updated_at: new Date().toISOString() };

    if (extra) {
      Object.assign(payload, extra);
    }

    const { error } = await supabase
      .from('payment_qr_sessions')
      .update(payload)
      .eq('id', id);

    if (error) {
      console.error('[qrSessionService] Error al actualizar estado:', error);
      return false;
    }

    return true;
  } catch (err) {
    console.error('[qrSessionService] Excepcion al actualizar estado:', err);
    return false;
  }
}

/**
 * Marca una sesion QR como pagada.
 * @param id ID de la sesion
 * @param externalQrId ID externo del QR (opcional)
 * @param providerResponse Respuesta del proveedor (opcional)
 * @returns true si se actualizo correctamente
 */
export async function markQrSessionPaid(
  id: string,
  externalQrId?: string,
  providerResponse?: Record<string, unknown>,
): Promise<boolean> {
  const extra: Record<string, unknown> = {
    paid_at: new Date().toISOString(),
  };

  if (externalQrId) {
    extra.external_qr_id = externalQrId;
  }

  if (providerResponse) {
    extra.provider_response = providerResponse;
  }

  return updateQrSessionStatus(id, 'paid', extra);
}

/**
 * Marca una sesion QR como expirada.
 * @param id ID de la sesion
 * @returns true si se actualizo correctamente
 */
export async function markQrSessionExpired(id: string): Promise<boolean> {
  return updateQrSessionStatus(id, 'expired');
}

/**
 * Obtiene sesiones QR pendientes cuya fecha de expiracion ya paso.
 * Usado por el job de expiracion automatica.
 * @returns Lista de sesiones expiradas
 */
export async function getExpiredQrSessions(): Promise<QrSession[]> {
  try {
    const supabase = getSupabaseAdmin();
    const now = new Date().toISOString();

    const { data, error } = await supabase
      .from('payment_qr_sessions')
      .select('*')
      .eq('status', 'pending')
      .lt('expires_at', now)
      .not('expires_at', 'is', null);

    if (error || !data) {
      console.error('[qrSessionService] Error al obtener sesiones expiradas:', error);
      return [];
    }

    return data as QrSession[];
  } catch (err) {
    console.error('[qrSessionService] Excepcion al obtener sesiones expiradas:', err);
    return [];
  }
}
