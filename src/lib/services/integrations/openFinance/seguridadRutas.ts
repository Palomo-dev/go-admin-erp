/**
 * Piezas comunes de seguridad de las rutas `/api/integrations/open-finance/**`
 * (GO-sec, 2026-09-23; auditoría de integraciones §1.4).
 *
 * Los servicios de Open Finance trabajan con service role y con la llave de
 * Prometeo de la PLATAFORMA. Antes, 27 de 36 rutas les pasaban ids de recurso u
 * organizaciones tomados de la petición: cualquiera con sesión leía o escribía
 * datos bancarios de otra organización. Ahora cada ruta:
 *   1. resuelve la organización con `withOrg` (sesión),
 *   2. rechaza una organización ajena en body o query con `readOrgBody` (403),
 *   3. exige un permiso `finance.*` resuelto en el servidor,
 *   4. comprueba que el recurso (link, consentimiento, cuenta, conciliación,
 *      proveedor) es de la organización ANTES de llamar al servicio (404),
 *   5. nunca devuelve `open_finance_links.session_key` (sesión bancaria).
 */

import type { ServerOrgContext } from '@/lib/utils/orgContext';
import { assertRecordOfOrg } from '@/lib/security/orgGuards';

type CtxRecurso = Pick<ServerOrgContext, 'organizationId' | 'supabase'>;

export function linkDeLaOrganizacion(ctx: CtxRecurso, linkId: string | null | undefined): Promise<void> {
  return assertRecordOfOrg(ctx, 'open_finance_links', linkId, 'Link no encontrado');
}

export function consentimientoDeLaOrganizacion(ctx: CtxRecurso, consentId: string | null | undefined): Promise<void> {
  return assertRecordOfOrg(ctx, 'open_finance_consents', consentId, 'Consentimiento no encontrado');
}

export function cuentaBancariaDeLaOrganizacion(ctx: CtxRecurso, bankAccountId: number): Promise<void> {
  return assertRecordOfOrg(ctx, 'bank_accounts', bankAccountId, 'Cuenta bancaria no encontrada');
}

export function conciliacionDeLaOrganizacion(ctx: CtxRecurso, reconciliationId: string | number): Promise<void> {
  return assertRecordOfOrg(ctx, 'bank_reconciliations', String(reconciliationId), 'Conciliación no encontrada');
}

export function proveedorDeLaOrganizacion(ctx: CtxRecurso, supplierId: number): Promise<void> {
  return assertRecordOfOrg(ctx, 'suppliers', supplierId, 'Proveedor no encontrado');
}

/** Copia sin la clave de sesión bancaria (y sin nada que se le parezca). */
export function sinSecretosDeLink<T>(link: T): T {
  if (!link || typeof link !== 'object') return link;
  const copia = { ...(link as Record<string, unknown>) };
  delete copia.session_key;
  delete copia.sessionKey;
  delete copia.key;
  return copia as T;
}

/**
 * Respuesta de los crons de Open Finance mientras no exista el rediseño de la
 * sesión bancaria (la sesión de Prometeo dura minutos y no se guardan
 * credenciales: los crons no pueden sincronizar, y `scheduled-payments` movería
 * dinero con la llave de la plataforma). 200 para no ensuciar los logs de
 * Vercel con errores; la autenticación (`withCron`, Bearer CRON_SECRET) va
 * ANTES, así que sin secreto sigue siendo 401.
 */
export function respuestaCronDeshabilitado(tarea: string): Response {
  return new Response(
    JSON.stringify({
      success: true,
      disabled: true,
      job: tarea,
      message: 'Cron de Open Finance deshabilitado hasta el rediseño de la sesión bancaria',
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}

/** Motivos de los flujos que responden 501 hasta el rediseño (sin decidir negocio). */
export const MOTIVO_PAGOS_DESHABILITADOS =
  'Los pagos por Open Finance están deshabilitados: la iniciación de pagos usaba la llave de la plataforma sin cuenta de origen ni idempotencia. Se habilitarán con el rediseño del producto de pagos.';
export const MOTIVO_VALIDACION_DESHABILITADA =
  'La validación de cuentas por Open Finance está deshabilitada hasta el rediseño (consumía la cuota de la plataforma y servía de consulta de titulares).';
