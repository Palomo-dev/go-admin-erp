/**
 * Datos sensibles del empleado (identificación, banco, salario y pago, salud,
 * disciplinario, SST). ADR-001 §2 y §7.
 *
 * Las RPC `fn_hr_datos_sensibles_*` y `fn_hr_persona_crear` solo las ejecuta la
 * service role: el permiso se resuelve en la base con el actor de la sesión
 * (`ctx.userId`) y cada lectura o edición deja su fila en `hr_access_log` con
 * la IP y el agente de la petición ORIGINAL. Por eso este servicio usa
 * `getServiceClient()`: la organización ya salió de `getServerOrgContext()` y
 * la base vuelve a comprobar que el actor es miembro activo de ella.
 */
import { getServiceClient } from '@/lib/supabase/server-service';
import type { ServerOrgContext } from '@/lib/utils/orgContext';
import {
  HrmError,
  errorDeRpc,
  esGrupoDatos,
  esGrupoEditable,
  esUuid,
  type ContextoPeticion,
  type GrupoDatos,
} from './tipos';

export type ContextoHrm = Pick<ServerOrgContext, 'userId' | 'organizationId'>;

function cliente() {
  return getServiceClient();
}

export async function leerDatosSensibles(
  ctx: ContextoHrm,
  personaId: string,
  grupo: GrupoDatos,
  peticion: ContextoPeticion
): Promise<Record<string, unknown>> {
  if (!esUuid(personaId)) throw new HrmError(400, 'persona_invalida');
  if (!esGrupoDatos(grupo)) throw new HrmError(400, 'grupo_invalido');
  const { data, error } = await cliente().rpc('fn_hr_datos_sensibles_leer', {
    p_actor: ctx.userId,
    p_org: ctx.organizationId,
    p_person: personaId,
    p_grupo: grupo,
    p_ip: peticion.ip,
    p_ua: peticion.userAgent,
    p_ruta: peticion.ruta,
  });
  if (error) throw errorDeRpc(error);
  return (data ?? {}) as Record<string, unknown>;
}

export async function guardarDatosSensibles(
  ctx: ContextoHrm,
  personaId: string,
  grupo: GrupoDatos,
  datos: unknown,
  peticion: ContextoPeticion
): Promise<{ ok: boolean; campos: string[] }> {
  if (!esUuid(personaId)) throw new HrmError(400, 'persona_invalida');
  if (!esGrupoEditable(grupo)) throw new HrmError(422, 'grupo_sin_edicion_directa');
  if (!datos || typeof datos !== 'object' || Array.isArray(datos)) throw new HrmError(400, 'datos_invalidos');
  const { data, error } = await cliente().rpc('fn_hr_datos_sensibles_guardar', {
    p_actor: ctx.userId,
    p_org: ctx.organizationId,
    p_person: personaId,
    p_grupo: grupo,
    p_datos: datos,
    p_ip: peticion.ip,
    p_ua: peticion.userAgent,
    p_ruta: peticion.ruta,
  });
  if (error) throw errorDeRpc(error);
  const r = (data ?? {}) as { ok?: boolean; campos?: string[] };
  return { ok: Boolean(r.ok), campos: Array.isArray(r.campos) ? r.campos : [] };
}

export interface DatosPersonaNueva {
  first_name: string;
  second_name?: string | null;
  last_name?: string | null;
  second_last_name?: string | null;
  preferred_name?: string | null;
  work_email?: string | null;
  work_phone?: string | null;
  identificacion?: Record<string, unknown>;
}

export async function crearPersona(
  ctx: ContextoHrm,
  datos: DatosPersonaNueva,
  peticion: ContextoPeticion
): Promise<{ id: string }> {
  if (!datos || typeof datos.first_name !== 'string' || datos.first_name.trim() === '') {
    throw new HrmError(422, 'nombre_obligatorio');
  }
  const { data, error } = await cliente().rpc('fn_hr_persona_crear', {
    p_actor: ctx.userId,
    p_org: ctx.organizationId,
    p_datos: datos,
    p_ip: peticion.ip,
    p_ua: peticion.userAgent,
    p_ruta: peticion.ruta,
  });
  if (error) throw errorDeRpc(error);
  const id = (data as { id?: string } | null)?.id;
  if (!id) throw new HrmError(500, 'error_hrm');
  return { id };
}

/** Deja la fila «exportar» antes de generar un archivo con datos sensibles. */
export async function registrarExportacion(
  ctx: ContextoHrm,
  personaId: string,
  grupo: GrupoDatos,
  peticion: ContextoPeticion,
  detalle: Record<string, unknown> = {}
): Promise<void> {
  if (!esUuid(personaId)) throw new HrmError(400, 'persona_invalida');
  if (!esGrupoDatos(grupo)) throw new HrmError(400, 'grupo_invalido');
  const { error } = await cliente().rpc('fn_hr_registrar_exportacion', {
    p_actor: ctx.userId,
    p_org: ctx.organizationId,
    p_person: personaId,
    p_grupo: grupo,
    p_ip: peticion.ip,
    p_ua: peticion.userAgent,
    p_ruta: peticion.ruta,
    p_detalle: detalle,
  });
  if (error) throw errorDeRpc(error);
}
