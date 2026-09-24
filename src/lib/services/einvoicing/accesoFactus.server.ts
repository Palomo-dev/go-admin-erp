/**
 * Acceso a Factus por organización — SOLO SERVIDOR.
 *
 * GO Admin presta la facturación electrónica con el plan SaaS de Factus: cada
 * organización tiene su propia cuenta de Factus (una cuenta = una empresa
 * emisora = un NIT). Las credenciales las carga el equipo de la plataforma en
 * go-admin-super y viven cifradas en Vault; entran y salen solo por
 * `fn_factus_credenciales_guardar` / `fn_factus_credenciales_leer`
 * (SECURITY DEFINER, EXECUTE solo para service_role). Este módulo es el único
 * lector del ERP.
 *
 * Sin credenciales activas no hay acceso (`FacturacionNoActivadaError`): la
 * cola no envía nada y la UI muestra «pendiente de activación». La cuenta demo
 * del entorno solo se ofrece a quien la pida explícitamente y nunca en
 * producción (`getCredentials()` devuelve null allí).
 */

import { getServiceClient, assertServerOnly } from '@/lib/supabase/server-service';
import { OrgContextError } from '@/lib/utils/orgContextError';
import factusService, { FactusApiError, type FactusCredentials } from '@/lib/services/factusService';
import { getCredentials, obtenerTokenPara, invalidarTokenPara } from '@/lib/services/factusTokenManager';
import type { SupabaseClient } from '@supabase/supabase-js';

export type AmbienteFactus = 'sandbox' | 'production';

/**
 * Es un `OrgContextError` (409): `withOrg` y `routeErrorResponse` lo devuelven
 * tal cual a la ruta que lo deje subir.
 */
export class FacturacionNoActivadaError extends OrgContextError {
  constructor(message = 'El servicio de facturación electrónica de GO Admin no está activo para esta organización') {
    super(message, 409, 'EINVOICING_NOT_ACTIVATED');
    this.name = 'FacturacionNoActivadaError';
  }
}

export interface AccesoFactus {
  organizationId: number;
  environment: AmbienteFactus;
  accessToken: string;
  credenciales: FactusCredentials;
  origen: 'organizacion' | 'demo_desarrollo';
}

interface FilaCredenciales {
  environment: string;
  client_id: string | null;
  client_secret: string | null;
  username: string | null;
  password: string | null;
  service_status: string;
  factus_company_nit: string | null;
}

/** Credenciales de la organización desde Vault, o null si no tiene (o no están activas). */
export async function leerCredencialesOrganizacion(
  organizationId: number,
  opciones: { incluirPendiente?: boolean } = {},
  cliente?: SupabaseClient,
): Promise<(FactusCredentials & { serviceStatus: string; companyNit: string | null }) | null> {
  assertServerOnly();
  const db = cliente ?? getServiceClient();
  const { data, error } = await db.rpc('fn_factus_credenciales_leer', {
    p_organization_id: organizationId,
    p_incluir_pendiente: opciones.incluirPendiente ?? false,
  });
  if (error) {
    console.error('[accesoFactus] no se pudieron leer las credenciales', { organizationId, code: error.code });
    return null;
  }
  const fila = (Array.isArray(data) ? data[0] : data) as FilaCredenciales | undefined;
  if (!fila?.client_id || !fila.client_secret || !fila.username || !fila.password) return null;
  const environment: AmbienteFactus = fila.environment === 'production' ? 'production' : 'sandbox';
  return {
    clientId: fila.client_id,
    clientSecret: fila.client_secret,
    username: fila.username,
    password: fila.password,
    environment,
    serviceStatus: fila.service_status,
    companyNit: fila.factus_company_nit,
  };
}

/**
 * Token de Factus para emitir o consultar a nombre de la organización.
 * Lanza `FacturacionNoActivadaError` si no tiene el servicio activo.
 */
export async function obtenerAccesoFactus(
  organizationId: number,
  opciones: { permitirDemoDesarrollo?: boolean; incluirPendiente?: boolean } = {},
): Promise<AccesoFactus> {
  const propias = await leerCredencialesOrganizacion(organizationId, { incluirPendiente: opciones.incluirPendiente });
  if (propias) {
    const credenciales: FactusCredentials = {
      clientId: propias.clientId,
      clientSecret: propias.clientSecret,
      username: propias.username,
      password: propias.password,
      environment: propias.environment,
    };
    const accessToken = await obtenerTokenPara(credenciales);
    return { organizationId, environment: credenciales.environment, accessToken, credenciales, origen: 'organizacion' };
  }

  if (opciones.permitirDemoDesarrollo) {
    const demo = getCredentials(); // null en producción (fail-closed)
    if (demo) {
      const accessToken = await obtenerTokenPara(demo);
      return { organizationId, environment: 'sandbox', accessToken, credenciales: demo, origen: 'demo_desarrollo' };
    }
  }

  throw new FacturacionNoActivadaError();
}

/** Tras un 401 de Factus: olvida el token para que el próximo intento se autentique de nuevo. */
export function invalidarAcceso(acceso: AccesoFactus): void {
  invalidarTokenPara(acceso.credenciales);
}

/** Solo los dígitos de un NIT. */
export function soloDigitos(valor: string | null | undefined): string {
  return String(valor ?? '').replace(/\D/g, '');
}

/**
 * ¿El NIT que devuelve Factus es el de la organización? La organización puede
 * guardarlo con o sin dígito de verificación. La misma regla la aplica
 * `fn_factus_servicio_estado` en la base al activar.
 */
export function nitCoincide(nitOrganizacion: string | null | undefined, nitFactus: string | null | undefined): boolean {
  const org = soloDigitos(nitOrganizacion);
  const factus = soloDigitos(nitFactus);
  if (!org || !factus) return false;
  if (org === factus) return true;
  return org.length === factus.length + 1 && org.startsWith(factus);
}

export interface ResultadoVerificacion {
  ok: boolean;
  activado: boolean;
  mensaje: string;
  nitFactus: string | null;
  empresaFactus: string | null;
}

/**
 * Verifica las credenciales de la organización contra Factus (login +
 * `GET /v2/companies`) y comprueba que el NIT de la cuenta sea el de la
 * organización. Si coincide y el servicio estaba pendiente, lo activa.
 * Registra el resultado (`last_check_*`) en la configuración.
 */
export async function verificarYActivar(organizationId: number, actor: string | null = null): Promise<ResultadoVerificacion> {
  assertServerOnly();
  const db = getServiceClient();
  const creds = await leerCredencialesOrganizacion(organizationId, { incluirPendiente: true }, db);
  if (!creds) {
    return { ok: false, activado: false, mensaje: 'La organización no tiene credenciales de Factus cargadas por la plataforma.', nitFactus: null, empresaFactus: null };
  }

  const registrar = async (ok: boolean, mensaje: string, nit: string | null, activar: boolean) => {
    const { error } = await db.rpc('fn_factus_servicio_estado', {
      p_organization_id: organizationId,
      p_status: activar ? 'active' : creds.serviceStatus,
      p_actor: actor,
      p_company_nit: activar ? nit : null,
      p_check_ok: ok,
      p_check_message: mensaje,
    });
    return error;
  };

  let empresa: { nit: string; name: string };
  try {
    const credenciales: FactusCredentials = {
      clientId: creds.clientId,
      clientSecret: creds.clientSecret,
      username: creds.username,
      password: creds.password,
      environment: creds.environment,
    };
    const token = await obtenerTokenPara(credenciales);
    empresa = await factusService.getCompany(credenciales.environment, token);
  } catch (err) {
    const status = err instanceof FactusApiError ? err.status : null;
    const rechazo = status === 400 || status === 401 || /autenticaci/i.test(err instanceof Error ? err.message : '');
    if (!rechazo) {
      // Falla pasajera (red, 5xx): no se registra; el cron lo vuelve a intentar.
      return { ok: false, activado: false, mensaje: 'No se pudo consultar Factus en este momento. Se volverá a intentar.', nitFactus: null, empresaFactus: null };
    }
    const mensaje = 'Factus rechazó las credenciales (usuario, contraseña o cliente OAuth).';
    await registrar(false, mensaje, null, false);
    return { ok: false, activado: false, mensaje, nitFactus: null, empresaFactus: null };
  }

  const { data: org } = await db.from('organizations').select('nit, tax_id').eq('id', organizationId).maybeSingle();
  const nitOrg = (org as { nit?: string | null; tax_id?: string | null } | null)?.nit ?? (org as { tax_id?: string | null } | null)?.tax_id ?? null;
  if (!nitCoincide(nitOrg, empresa.nit)) {
    const mensaje = `La cuenta de Factus es de otro NIT (${soloDigitos(empresa.nit)}); no coincide con el de la organización.`;
    await registrar(false, mensaje, null, false);
    return { ok: false, activado: false, mensaje, nitFactus: soloDigitos(empresa.nit), empresaFactus: empresa.name || null };
  }

  const activar = creds.serviceStatus !== 'suspended';
  const mensaje = activar
    ? `Credenciales verificadas: la cuenta de Factus emite con el NIT ${soloDigitos(empresa.nit)}.`
    : 'Credenciales verificadas. El servicio sigue suspendido por la plataforma.';
  const error = await registrar(true, mensaje, soloDigitos(empresa.nit), activar);
  if (error) {
    return { ok: false, activado: false, mensaje: 'La verificación fue correcta, pero no se pudo guardar el resultado.', nitFactus: soloDigitos(empresa.nit), empresaFactus: empresa.name || null };
  }
  return { ok: true, activado: activar, mensaje, nitFactus: soloDigitos(empresa.nit), empresaFactus: empresa.name || null };
}

/**
 * Verifica las organizaciones cuyas credenciales se cargaron o cambiaron y aún
 * no se han comprobado (las deja activas si el NIT coincide). La llama el cron.
 */
export async function verificarPendientesDeActivacion(limite = 5): Promise<Array<{ organizationId: number; ok: boolean; activado: boolean }>> {
  assertServerOnly();
  const db = getServiceClient();
  const { data, error } = await db
    .from('electronic_invoicing_config')
    .select('organization_id')
    .eq('provider', 'factus')
    .eq('is_active', true)
    .eq('service_status', 'pending_activation')
    .not('credentials_secret_id', 'is', null)
    // Sin verificar desde que la plataforma guardó las credenciales (guardarlas deja last_check_at en NULL).
    .is('last_check_at', null)
    .order('updated_at', { ascending: true })
    .limit(limite);
  if (error || !data) return [];

  const resultados: Array<{ organizationId: number; ok: boolean; activado: boolean }> = [];
  for (const fila of data as Array<{ organization_id: number }>) {
    const r = await verificarYActivar(fila.organization_id);
    resultados.push({ organizationId: fila.organization_id, ok: r.ok, activado: r.activado });
  }
  return resultados;
}
