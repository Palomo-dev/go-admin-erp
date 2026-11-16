/**
 * Acceso a la app de un empleado (revisión 2026-11-15, ADR-001): **cada empleado
 * es un usuario**. Decisión del dueño: «Quiero que esté enlazado el usuario y el
 * empleado siempre, siempre, y que se pierda un cupo de usuario del plan».
 *
 * - `altaConUsuario`: el alta de empleado crea (o enlaza) el usuario y lo invita.
 *   1. Exige el correo de la invitación y comprueba el cupo de usuarios con la
 *      misma fuente y la misma regla de Organización › Equipo (`fn_cupo_plan` vía
 *      `leerCupoPlan`, `cupoUsuarios`). La base lo vuelve a comprobar al insertar
 *      la invitación (`trg_cupo_plan_invitacion`), dentro de la transacción.
 *   2. Si el correo ya es usuario de la plataforma, se enlaza ese usuario (como en
 *      Equipo: acepta con su sesión). Si no, se crea sin contraseña y sin correo
 *      (`auth.admin.createUser`); la contraseña la pone él al aceptar.
 *   3. `fn_hr_alta_empleado` crea en una transacción el perfil, el miembro
 *      INACTIVO, la persona, el vínculo y la invitación pendiente. Si falla, el
 *      usuario recién creado se borra.
 *   4. El correo sale por el mismo camino de `/api/auth/invite`
 *      (`enviarCorreoInvitacion`). Al aceptar, `accept_invitation_atomic` activa
 *      el miembro.
 * - `reenviarInvitaciones`: «Reenviar invitación» de la ficha y de la lista, solo
 *   para invitaciones pendientes o vencidas. Rota el código (`renovarInvitacion`).
 *
 * Permisos: los resuelve la base con el actor de la sesión (`hr.employees.create`
 * para el alta, `hr.employees.edit` para reenviar). El código de la invitación
 * nunca vuelve al navegador.
 */
import { getServiceClient } from '@/lib/supabase/server-service';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { checkRateLimits } from '@/lib/security/rateLimit';
import { DIAS_VIGENCIA_INVITACION, generarCodigoInvitacion, normalizarCorreo } from '@/lib/auth/invitaciones';
import { enviarCorreoInvitacion, renovarInvitacion } from '@/lib/auth/invitacionesEnvio.server';
import { buscarUsuarioAuthPorEmail } from '@/lib/auth/cuentaInvitacion';
import { errorDeCupo, leerCupoPlan } from '@/lib/services/cupoPlanService';
import { cupoUsuarios } from '@/lib/organizacion/cupo';
import { HrmError, errorDeRpc, esUuid, type ContextoPeticion } from './tipos';
import { limpiarAlta, type ContextoPersonas, type ResultadoAlta } from './personasService.server';

/** Rol «Empleado» de la tabla `roles` (dato del sistema, no un nombre). */
export const ROL_EMPLEADO = 4;
const MAX_POR_LOTE = 100;
const LIMITE_CORREO = { limit: 3, windowMs: 15 * 60 * 1000 };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type ResultadoInvitacion = 'enviada' | 'error';

export interface ResultadoAltaConUsuario extends ResultadoAlta {
  invitacion: ResultadoInvitacion | null;
  correo: string | null;
}

async function nombreOrganizacion(organizationId: number): Promise<string> {
  const { data } = await getServiceClient().from('organizations').select('name').eq('id', organizationId).maybeSingle();
  return (data?.name as string | undefined) || 'la organización';
}

async function puede(ctx: ContextoPersonas, codigo: string): Promise<boolean> {
  const { data, error } = await getServiceClient().rpc('fn_hr_puede_actor', {
    p_actor: ctx.userId,
    p_org: ctx.organizationId,
    p_code: codigo,
  });
  if (error) throw errorDeRpc(error);
  return data === true;
}

/** Correo de la invitación: el que se escribió en el alta (personal o laboral). */
export function correoDeAlta(datos: Record<string, unknown>): string {
  return normalizarCorreo(String(datos.personal_email ?? datos.work_email ?? ''));
}

export async function altaConUsuario(
  ctx: ContextoPersonas,
  body: Record<string, unknown>,
  origin: string,
  peticion: ContextoPeticion
): Promise<ResultadoAltaConUsuario> {
  const datos = limpiarAlta(body);
  const db = getServiceClient();
  const base = { p_actor: ctx.userId, p_org: ctx.organizationId, p_ip: peticion.ip, p_ua: peticion.userAgent, p_ruta: peticion.ruta };

  // Reingreso: la persona ya tiene su usuario; no se crea otro ni se invita.
  if (datos.persona_id) {
    const { data, error } = await db.rpc('fn_hr_alta_empleado', { ...base, p_datos: datos, p_acceso: {} });
    if (error) throw errorDeRpc(error);
    return { ...(data as ResultadoAlta), invitacion: null, correo: null };
  }

  const email = correoDeAlta(datos);
  if (!EMAIL_RE.test(email)) throw new HrmError(422, 'correo_obligatorio');
  if (!(await puede(ctx, 'hr.employees.create'))) throw new HrmError(403, 'sin_permiso');

  // Cupo del plan: la misma fuente y la misma regla de Organización › Equipo.
  const uso = await leerCupoPlan(db, ctx.organizationId);
  if (uso && cupoUsuarios(uso.usuarios.actual, uso.usuarios.invitacionesVigentes, uso.usuarios.maximo).lleno) {
    throw new HrmError(409, 'sin_cupo');
  }

  const rl = await checkRateLimits([{ key: `invite:send:email:${email}`, opts: LIMITE_CORREO }]);
  if (!rl.allowed) throw new HrmError(429, 'demasiadas_invitaciones');

  const { data: pendiente } = await db
    .from('invitations')
    .select('id')
    .eq('organization_id', ctx.organizationId)
    .eq('email', email)
    .eq('status', 'pending')
    .gt('expires_at', new Date().toISOString())
    .limit(1)
    .maybeSingle();
  if (pendiente) throw new HrmError(409, 'ya_invitado');

  const admin = getSupabaseAdmin();
  const organizationName = await nombreOrganizacion(ctx.organizationId);
  let userId: string;
  let creado = false;
  const existente = await buscarUsuarioAuthPorEmail(admin, email);
  if (existente) {
    // Ya es usuario de la plataforma: se enlaza ese usuario, como en Equipo.
    userId = existente.id;
  } else {
    const { data: nuevo, error } = await admin.auth.admin.createUser({
      email,
      email_confirm: false,
      user_metadata: {
        is_invitation: true,
        hr_alta: true,
        organization_id: ctx.organizationId,
        organization_name: organizationName,
        first_name: datos.first_name ?? null,
        last_name: datos.last_name ?? null,
      },
    });
    if (error || !nuevo.user) {
      console.error('[hrm:alta] no se pudo crear el usuario de la app:', error?.message);
      throw new HrmError(500, 'error_usuario');
    }
    userId = nuevo.user.id;
    creado = true;
  }

  const codigo = generarCodigoInvitacion();
  const { data, error } = await db.rpc('fn_hr_alta_empleado', {
    ...base,
    p_datos: datos,
    p_acceso: {
      user_id: userId,
      email,
      codigo,
      vence: new Date(Date.now() + DIAS_VIGENCIA_INVITACION * 24 * 3600_000).toISOString(),
      rol_id: ROL_EMPLEADO,
    },
  });
  if (error) {
    // La transacción se deshizo: el usuario recién creado no tiene perfil ni miembro.
    if (creado) {
      const { error: errBorrar } = await admin.auth.admin.deleteUser(userId);
      if (errBorrar) console.error('[hrm:alta] no se pudo borrar el usuario sin alta:', errBorrar.message);
    }
    if (errorDeCupo(error)) throw new HrmError(409, 'sin_cupo');
    throw errorDeRpc(error);
  }
  const r = data as ResultadoAlta & { invitacion_id: number | null; correo: string | null };

  let invitacion: ResultadoInvitacion = 'error';
  if (r.invitacion_id) {
    try {
      const enviado = await enviarCorreoInvitacion(
        admin,
        { id: r.invitacion_id, code: codigo, email, organization_id: ctx.organizationId, role_id: ROL_EMPLEADO, organizationName },
        origin,
        ctx.userId
      );
      invitacion = enviado ? 'enviada' : 'error';
    } catch (e) {
      console.error('[hrm:alta] no se pudo enviar la invitación:', e instanceof Error ? e.message : e);
    }
  }
  return { ...r, invitacion, correo: email };
}

export type ResultadoReenvio = 'enviada' | 'ya_entro' | 'sin_invitacion' | 'sin_cupo' | 'demasiadas' | 'error';

export interface ResumenReenvio {
  enviadas: number;
  resultados: { persona_id: string; resultado: ResultadoReenvio }[];
}

/** «Reenviar invitación»: solo para quien tiene la invitación del alta pendiente o vencida. */
export async function reenviarInvitaciones(
  ctx: ContextoPersonas,
  personaIds: unknown,
  origin: string
): Promise<ResumenReenvio> {
  if (!Array.isArray(personaIds) || personaIds.length === 0 || personaIds.length > MAX_POR_LOTE) {
    throw new HrmError(422, 'personas_invalidas');
  }
  const ids = [...new Set(personaIds)].filter(esUuid) as string[];
  if (ids.length === 0) throw new HrmError(422, 'personas_invalidas');
  if (!(await puede(ctx, 'hr.employees.edit'))) throw new HrmError(403, 'sin_permiso');

  const db = getServiceClient();
  const { data: personas, error } = await db
    .from('hr_people')
    .select('id, organization_member_id')
    .eq('organization_id', ctx.organizationId)
    .in('id', ids);
  if (error) throw new HrmError(500, 'error_hrm');
  const miembros = (personas ?? []).map((p) => p.organization_member_id as number);
  const { data: activos } = await db
    .from('organization_members')
    .select('id, is_active')
    .eq('organization_id', ctx.organizationId)
    .in('id', miembros.length > 0 ? miembros : [-1]);
  const activo = new Map((activos ?? []).map((m) => [m.id as number, !!m.is_active]));
  const { data: invitaciones } = await db
    .from('invitations')
    .select('id, email, hr_person_id, status, created_at')
    .eq('organization_id', ctx.organizationId)
    .in('hr_person_id', ids)
    .in('status', ['pending', 'expired'])
    .order('created_at', { ascending: false });

  const admin = getSupabaseAdmin();
  const organizationName = await nombreOrganizacion(ctx.organizationId);
  const resultados: ResumenReenvio['resultados'] = [];
  for (const id of ids) {
    const p = (personas ?? []).find((x) => x.id === id);
    if (!p) continue;
    if (activo.get(p.organization_member_id as number)) {
      resultados.push({ persona_id: id, resultado: 'ya_entro' });
      continue;
    }
    const inv = (invitaciones ?? []).find((i) => i.hr_person_id === id);
    if (!inv) {
      resultados.push({ persona_id: id, resultado: 'sin_invitacion' });
      continue;
    }
    const email = normalizarCorreo(String(inv.email));
    const rl = await checkRateLimits([{ key: `invite:send:email:${email}`, opts: LIMITE_CORREO }]);
    if (!rl.allowed) {
      resultados.push({ persona_id: id, resultado: 'demasiadas' });
      continue;
    }
    const renovada = await renovarInvitacion(admin, inv.id as number);
    if (!renovada.ok) {
      resultados.push({ persona_id: id, resultado: renovada.cupo ? 'sin_cupo' : 'error' });
      continue;
    }
    const enviado = await enviarCorreoInvitacion(
      admin,
      { id: inv.id as number, code: renovada.code, email, organization_id: ctx.organizationId, role_id: ROL_EMPLEADO, organizationName },
      origin,
      ctx.userId
    );
    resultados.push({ persona_id: id, resultado: enviado ? 'enviada' : 'error' });
  }
  return { enviadas: resultados.filter((r) => r.resultado === 'enviada').length, resultados };
}
