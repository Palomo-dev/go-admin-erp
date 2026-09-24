/**
 * Puerta de SERVIDOR de las rutas `/api/integrations/**` que usan las
 * credenciales de una conexión de la ORGANIZACIÓN (MercadoPago, PayU, PayPal,
 * Stripe, Wompi, SendGrid, Meta Marketing, TikTok Marketing, Google Ads) —
 * GO-sec, 2026-09-24.
 *
 * Antes, esas rutas comprobaban solo `auth.getSession()` (lee la cookie sin
 * validar el JWT) o nada, tomaban el `connection_id` (o la organización) del
 * body o de la query y leían las credenciales de esa conexión: cualquier
 * sesión cobraba, consultaba o enviaba eventos con la conexión de otra
 * organización con solo conocer su id.
 *
 * Con la organización YA resuelta por la sesión (`withOrg` + `readOrgBody` en
 * la ruta):
 *  - `exigirPermiso(ctx, permiso, ruta)`: el permiso se resuelve en el
 *    servidor (`hasOrgAdminOrPermission`: super admin, rol 1/2 o el permiso
 *    por rol/cargo; nunca por nombre de rol). Sin él → 403 y registro.
 *  - `conexionDelProveedor(ctx, id, conectores, ruta)`: la conexión existe, es
 *    de la organización de la sesión y es de uno de los conectores esperados;
 *    si no → 404 sin distinguir «no existe» de «es de otra organización», y
 *    registro. Delega en `conexionDeLaOrganizacion` (un solo criterio para
 *    cobros QR y para estas rutas).
 *
 * Qué permiso pide cada familia de rutas:
 *  - Configurar o probar credenciales (health-check, webhook-health,
 *    credential-rotation, OAuth de WhatsApp): administración
 *    (`withOrg({ admin: true })`).
 *  - Crear un cobro o leer los catálogos que solo sirven para cobrar (métodos
 *    de pago, bancos PSE): `PERMISO_COBRO` (`pos.create`, el mismo de los
 *    cobros QR del POS).
 *  - Enviar eventos de conversión o audiencias a una plataforma de anuncios:
 *    `integrations.edit`.
 *  - Leer métricas o plantillas del proveedor: `integrations.view`.
 *
 * Las credenciales se leen con service role (`getServiceClient`) SOLO después
 * de esta comprobación: los servicios usaban el cliente de navegador, que en
 * el servidor es anónimo y no ve `integration_credentials` (RLS), así que esas
 * rutas respondían 404 «sin credenciales» siempre.
 *
 * Nunca importar desde código de cliente.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { getServiceClient } from '@/lib/supabase/server-service';
import { hasOrgAdminOrPermission, type ServerOrgContext } from '@/lib/utils/orgContext';
import { OrgContextError } from '@/lib/utils/orgContextError';
import { ORG_BODY_KEYS } from '@/lib/security/organizationBody';
import { conexionDeLaOrganizacion, PERMISO_POR_FUENTE, type ConexionCobro } from './qrShared/cobroQrServidor';

/** Permiso para cobrar (el del POS, igual que los cobros QR). */
export const PERMISO_COBRO = PERMISO_POR_FUENTE.pos;
/** Permiso para enviar eventos o audiencias con una conexión de marketing. */
export const PERMISO_INTEGRACIONES_EDITAR = 'integrations.edit';
/** Permiso para leer métricas, rebotes o plantillas del proveedor. */
export const PERMISO_INTEGRACIONES_VER = 'integrations.view';

/** `integration_connectors.code` de cada proveedor (verificados por MCP el 2026-09-24). */
export const CONECTORES = {
  mercadopago: ['mp_checkout'],
  payu: ['payu_co'],
  paypal: ['paypal_checkout'],
  stripe: ['stripe_payments'],
  wompi: ['wompi_co'],
  sendgrid: ['sendgrid_email'],
  meta: ['meta_marketing'],
  tiktok: ['tiktok_marketing'],
  googleAds: ['google_ads'],
} as const satisfies Record<string, readonly string[]>;

type Sujeto = Pick<ServerOrgContext, 'userId' | 'organizationId' | 'roleId' | 'isSuperAdmin' | 'supabase'>;

/** 403 `PERMISO_REQUERIDO` con registro si la sesión no tiene `permiso` en su organización. */
export async function exigirPermiso(ctx: Sujeto, permiso: string, ruta: string): Promise<void> {
  if (await hasOrgAdminOrPermission(ctx, permiso)) return;
  console.warn('[integraciones] acción sin permiso → 403', {
    ruta,
    permiso,
    organizationId: ctx.organizationId,
    userId: ctx.userId,
  });
  throw new OrgContextError(`No tiene permiso para esta acción (${permiso}).`, 403, 'PERMISO_REQUERIDO');
}

/** Texto recortado de un valor del body o de la query (`''` si no es texto). */
export function textoDe(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

/**
 * Conexión `connectionId` de la organización de la sesión y de uno de
 * `conectores`. 400 si no viene; 404 (con registro) si no existe, es de otra
 * organización o de otro proveedor.
 */
export async function conexionDelProveedor(
  ctx: Pick<ServerOrgContext, 'organizationId' | 'userId'>,
  connectionId: unknown,
  conectores: readonly string[],
  ruta: string,
  db: SupabaseClient = getServiceClient(),
): Promise<ConexionCobro> {
  const id = textoDe(connectionId);
  if (!id) throw new OrgContextError('connection_id es requerido', 400, 'CONEXION_REQUERIDA');
  try {
    return await conexionDeLaOrganizacion(db, ctx.organizationId, id, conectores);
  } catch (err) {
    if (err instanceof OrgContextError && err.statusCode === 404) {
      console.warn('[integraciones] conexión inexistente, de otra organización o de otro proveedor → 404', {
        ruta,
        connectionId: id.slice(0, 64),
        organizationId: ctx.organizationId,
        userId: ctx.userId,
      });
    }
    throw err;
  }
}

const CLAVES_DE_RUTA = new Set<string>(['connection_id', 'connectionId', ...ORG_BODY_KEYS]);

/**
 * Copia del body sin lo que decide el SERVIDOR (conexión y organización): lo
 * que queda son los parámetros del proveedor (importe, líneas, URLs…).
 */
export function parametrosDelProveedor(body: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(body).filter(([k]) => !CLAVES_DE_RUTA.has(k)));
}

/** Error interno sin filtrar el mensaje del proveedor al cliente (se registra). */
export function registrarError(ruta: string, err: unknown): void {
  console.error(`[${ruta}] Error:`, err instanceof Error ? err.message : String(err));
}
