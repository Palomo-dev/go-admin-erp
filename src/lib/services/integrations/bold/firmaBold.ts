/**
 * Firma de los eventos de Bold y conexión que los firmó (2026-11-19).
 *
 * Documentación de Bold (https://developers.bold.co/webhook): `x-bold-signature` es el
 * HMAC-SHA256, en hexadecimal, del cuerpo CODIFICADO EN BASE64, con la LLAVE SECRETA de la
 * integración (Botón de pagos o API Datáfono). Antes se calculaba sobre el cuerpo crudo y con un
 * `webhook_secret` que ninguna conexión guarda: todo evento real se rechazaba.
 *
 * Se acepta también la forma antigua (cuerpo crudo): las dos exigen la llave, no abre nada.
 *
 * La conexión sale de la llave que firma, no de la URL ni del cuerpo: el mismo receptor recibe
 * eventos de cualquier organización y también los que reenvía la tienda (cuerpo y firma intactos).
 * Espejo de `goadmin-websites/lib/payments/pasarelasTienda.ts#firmaBoldValida`.
 */
import crypto from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { valorDeSecreto } from '@/lib/services/integrations/conexiones/secretosConexion';
import { BOLD_CONNECTOR_LINK_ID, BOLD_CONNECTOR_POS_ID } from './boldConfig';

export function firmaBoldValida(cuerpo: Buffer | Uint8Array | string, firma: string | null | undefined, llaveSecreta: string | null | undefined): boolean {
  if (!firma || !llaveSecreta) return false;
  const recibida = firma.trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(recibida)) return false;
  const bytes = typeof cuerpo === 'string' ? Buffer.from(cuerpo, 'utf8') : Buffer.from(cuerpo);
  const esperada = Buffer.from(recibida, 'hex');
  const candidatas = [
    crypto.createHmac('sha256', llaveSecreta).update(bytes.toString('base64')).digest(),
    crypto.createHmac('sha256', llaveSecreta).update(bytes).digest(),
  ];
  return candidatas.some((c) => c.length === esperada.length && crypto.timingSafeEqual(c, esperada));
}

export interface ConexionFirmante {
  connectionId: string;
  organizationId: number;
}

/**
 * Conexión activa de Bold (link o datáfono) cuya llave secreta valida la firma. `pista` (el
 * `?connectionId=` de URLs viejas) solo acota la búsqueda; nunca reemplaza la verificación.
 */
export async function conexionQueFirmaBold(
  db: SupabaseClient,
  cuerpo: Buffer,
  firma: string | null | undefined,
  pista?: string | null,
): Promise<ConexionFirmante | null> {
  if (!firma) return null;
  let consulta = db
    .from('integration_connections')
    .select('id, organization_id')
    .in('connector_id', [BOLD_CONNECTOR_LINK_ID, BOLD_CONNECTOR_POS_ID])
    .in('status', ['active', 'connected']);
  if (pista) consulta = consulta.eq('id', pista);
  const { data: conexiones, error } = await consulta;
  if (error || !conexiones || conexiones.length === 0) return null;

  const ids = conexiones.map((c) => String(c.id));
  const { data: llaves } = await db
    .from('integration_credentials')
    .select('connection_id, purpose, secret_ref')
    .in('connection_id', ids)
    .eq('purpose', 'secret_key')
    .eq('status', 'active');

  for (const conexion of conexiones) {
    const fila = (llaves ?? []).find((l) => String(l.connection_id) === String(conexion.id));
    if (!fila) continue;
    const llave = await valorDeSecreto(db, String(conexion.id), { purpose: 'secret_key', secret_ref: fila.secret_ref as string | null });
    if (firmaBoldValida(cuerpo, firma, llave)) {
      return { connectionId: String(conexion.id), organizationId: Number(conexion.organization_id) };
    }
  }
  return null;
}
