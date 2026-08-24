/**
 * Servicio de rotacion de credenciales para integraciones QR.
 * Verifica la antiguedad de las credenciales y genera alertas
 * cuando se aproxima o supera la fecha de rotacion.
 *
 * Reglas:
 *  - Bancolombia: rotacion cada 6 meses (180 dias).
 *  - Demas proveedores: rotacion cada 12 meses (365 dias).
 *  - Se alerta 30 dias antes del vencimiento (severity medium).
 *  - Se alerta al superar el vencimiento (severity high).
 */

import { getSupabaseAdmin } from '@/lib/supabase/admin';

/** Rotacion de Bancolombia: 6 meses. */
const BANCOLOMBIA_ROTATION_DAYS = 180;
/** Rotacion de otros proveedores: 12 meses. */
const DEFAULT_ROTATION_DAYS = 365;
/** Dias de anticipacion para alertar antes del vencimiento. */
const ALERT_THRESHOLD_DAYS = 30;

/** Mapeo de codigo de proveedor a dias de rotacion. */
const ROTATION_DAYS: Record<string, number> = {
  bancolombia: BANCOLOMBIA_ROTATION_DAYS,
  bancolombia_qr: BANCOLOMBIA_ROTATION_DAYS,
  wompi: DEFAULT_ROTATION_DAYS,
  wompi_co: DEFAULT_ROTATION_DAYS,
  breb: DEFAULT_ROTATION_DAYS,
  breb_mono: DEFAULT_ROTATION_DAYS,
  redeban: DEFAULT_ROTATION_DAYS,
  redeban_qr: DEFAULT_ROTATION_DAYS,
};

/** Resultado de verificacion de antiguedad de una credencial. */
export interface CredentialExpiry {
  /** ID de la conexion. */
  connectionId: string;
  /** Codigo del proveedor. */
  provider: string;
  /** Nombre de la conexion. */
  connectionName: string;
  /** Ambiente (sandbox/production). */
  environment: string;
  /** Fecha de creacion de la credencial (ISO). */
  createdAt: string;
  /** Antiguedad en dias. */
  ageDays: number;
  /** Dias restantes para la rotacion (negativo si ya vencio). */
  daysUntilRotation: number;
  /** Indica si requiere rotacion inmediata. */
  needsRotation: boolean;
  /** Fecha limite de rotacion (ISO). */
  rotationDueDate: string;
  /** Severidad de la alerta. */
  severity: 'high' | 'medium' | 'none';
}

/** Alerta de rotacion generada. */
export interface RotationAlert {
  /** Codigo del proveedor. */
  provider: string;
  /** Severidad de la alerta. */
  severity: 'high' | 'medium';
  /** Mensaje descriptivo de la alerta. */
  message: string;
}

/**
 * Obtiene los dias de rotacion configurados para un proveedor.
 * Bancolombia requiere 6 meses; el resto 12 meses.
 */
function getRotationDays(provider: string): number {
  return ROTATION_DAYS[provider] ?? DEFAULT_ROTATION_DAYS;
}

/**
 * Verifica la antiguedad de las credenciales de una conexion especifica.
 * Usa la fecha created_at de la credencial mas reciente activa.
 *
 * @param provider Codigo del proveedor.
 * @param connectionId ID de la conexion.
 * @returns Estado de expiracion de la credencial.
 */
export async function getCredentialExpiry(
  provider: string,
  connectionId: string,
): Promise<{
  createdAt: string;
  ageDays: number;
  needsRotation: boolean;
  rotationDueDate: string;
} | null> {
  try {
    const supabase = getSupabaseAdmin();

    // Obtener la credencial mas reciente activa de la conexion
    const { data, error } = await supabase
      .from('integration_credentials')
      .select('created_at')
      .eq('connection_id', connectionId)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error || !data) {
      return null;
    }

    const createdAt = data.created_at as string;
    const createdDate = new Date(createdAt);
    const now = new Date();

    const ageMs = now.getTime() - createdDate.getTime();
    const ageDays = Math.floor(ageMs / (1000 * 60 * 60 * 24));

    const rotationDays = getRotationDays(provider);
    const rotationDueDate = new Date(
      createdDate.getTime() + rotationDays * 24 * 60 * 60 * 1000,
    ).toISOString();

    const daysUntilRotation = rotationDays - ageDays;
    const needsRotation = daysUntilRotation <= 0;

    return {
      createdAt,
      ageDays,
      needsRotation,
      rotationDueDate,
    };
  } catch (err) {
    console.error('[credentialRotation] Error verificando expiracion:', err);
    return null;
  }
}

/**
 * Verifica la expiracion de todas las credenciales de una organizacion
 * para los proveedores QR (Wompi, Bancolombia, Bre-B, Redeban).
 *
 * @param organizationId ID de la organizacion.
 * @returns Lista de estados de expiracion por conexion.
 */
export async function checkAllCredentialsExpiry(
  organizationId: number,
): Promise<CredentialExpiry[]> {
  try {
    const supabase = getSupabaseAdmin();

    // Obtener todas las conexiones activas de la organizacion con su connector
    const { data: connections, error } = await supabase
      .from('integration_connections')
      .select(`
        id,
        name,
        environment,
        status,
        connector:integration_connectors(code)
      `)
      .eq('organization_id', organizationId)
      .in('status', ['connected', 'paused']);

    if (error || !connections) {
      console.error('[credentialRotation] Error obteniendo conexiones:', error);
      return [];
    }

    const results: CredentialExpiry[] = [];

    for (const conn of connections) {
      // Extraer el codigo del connector (puede venir como objeto o array)
      const connectorData = conn.connector as
        | { code?: string }
        | { code?: string }[]
        | null;
      const connectorCode = Array.isArray(connectorData)
        ? connectorData[0]?.code
        : connectorData?.code;

      if (!connectorCode) {
        continue;
      }

      // Solo procesar proveedores QR conocidos
      if (!ROTATION_DAYS[connectorCode]) {
        continue;
      }

      const expiry = await getCredentialExpiry(connectorCode, conn.id as string);
      if (!expiry) {
        continue;
      }

      const rotationDays = getRotationDays(connectorCode);
      const daysUntilRotation = rotationDays - expiry.ageDays;

      let severity: 'high' | 'medium' | 'none' = 'none';
      if (daysUntilRotation <= 0) {
        severity = 'high';
      } else if (daysUntilRotation <= ALERT_THRESHOLD_DAYS) {
        severity = 'medium';
      }

      results.push({
        connectionId: conn.id as string,
        provider: connectorCode,
        connectionName: conn.name as string,
        environment: conn.environment as string,
        createdAt: expiry.createdAt,
        ageDays: expiry.ageDays,
        daysUntilRotation,
        needsRotation: expiry.needsRotation,
        rotationDueDate: expiry.rotationDueDate,
        severity,
      });
    }

    return results;
  } catch (err) {
    console.error('[credentialRotation] Error en checkAllCredentialsExpiry:', err);
    return [];
  }
}

/**
 * Genera una alerta de rotacion para una credencial.
 *
 * @param provider Codigo del proveedor.
 * @param connectionId ID de la conexion (incluido en el mensaje).
 * @param daysOverdue Dias de retraso respecto a la fecha de rotacion.
 * @returns Objeto de alerta con severidad y mensaje.
 */
export function generateRotationAlert(
  provider: string,
  connectionId: string,
  daysOverdue: number,
): RotationAlert {
  const providerLabel = provider === 'bancolombia_qr' || provider === 'bancolombia'
    ? 'Bancolombia'
    : provider === 'wompi_co' || provider === 'wompi'
      ? 'Wompi'
      : provider === 'breb_mono' || provider === 'breb'
        ? 'Bre-B (Mono)'
        : provider === 'redeban_qr' || provider === 'redeban'
          ? 'Redeban'
          : provider;

  if (daysOverdue > 0) {
    // Ya vencio
    return {
      provider,
      severity: 'high',
      message: `Las credenciales de ${providerLabel} (conexion ${connectionId}) han superado la fecha de rotacion por ${daysOverdue} dias. Rote las credenciales inmediatamente.`,
    };
  }

  // Proxima a vencer (daysOverdue es negativo o cero)
  const daysRemaining = Math.abs(daysOverdue);
  return {
    provider,
    severity: 'medium',
    message: `Las credenciales de ${providerLabel} (conexion ${connectionId}) deben rotarse en ${daysRemaining} dias. Planifique la rotacion.`,
  };
}
