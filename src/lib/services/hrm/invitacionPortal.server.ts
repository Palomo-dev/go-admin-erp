/**
 * Invitar al portal del empleado (decisión 4 del plan: la misma app con perfil
 * «empleado»). Un empleado no necesita usuario; si se le invita, al aceptar el
 * miembro nuevo se enlaza a su persona y a su vínculo (trigger
 * `create_employment_for_new_member`, por `invitations.hr_person_id`).
 *
 * - Permiso: `hr.employees.edit` (lo resuelve la base con el actor de la sesión).
 * - Rol de la invitación: Empleado (rol 4, el mismo de toda persona de la
 *   organización sin cargo de gestión). El cargo que tenga en RR. HH. viaja
 *   como `job_position_id` y la sede como `branch_id`.
 * - El correo: el laboral de la ficha o, si no tiene, el personal (leerlo deja
 *   fila en el registro de accesos).
 * - El correo lo manda el mismo camino de `/api/auth/invite`.
 */
import { getServiceClient } from '@/lib/supabase/server-service';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { checkRateLimits } from '@/lib/security/rateLimit';
import { DIAS_VIGENCIA_INVITACION, generarCodigoInvitacion, normalizarCorreo } from '@/lib/auth/invitaciones';
import { enviarCorreoInvitacion } from '@/lib/auth/invitacionesEnvio.server';
import { errorDeCupo } from '@/lib/services/cupoPlanService';
import { HrmError, errorDeRpc, esUuid, type ContextoPeticion } from './tipos';
import type { ContextoPersonas } from './personasService.server';

/** Rol «Empleado» de la tabla `roles` (dato del sistema, no un nombre). */
const ROL_EMPLEADO = 4;
const MAX_POR_LOTE = 100;
const LIMITE_CORREO = { limit: 3, windowMs: 15 * 60 * 1000 };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type ResultadoInvitacion = 'enviada' | 'sin_correo' | 'ya_tiene_usuario' | 'ya_invitado' | 'sin_cupo' | 'error';

export interface ResumenInvitaciones {
  enviadas: number;
  resultados: { persona_id: string; resultado: ResultadoInvitacion }[];
}

export async function invitarAlPortal(
  ctx: ContextoPersonas,
  personaIds: unknown,
  origin: string,
  peticion: ContextoPeticion
): Promise<ResumenInvitaciones> {
  if (!Array.isArray(personaIds) || personaIds.length === 0 || personaIds.length > MAX_POR_LOTE) {
    throw new HrmError(422, 'personas_invalidas');
  }
  const ids = [...new Set(personaIds)].filter(esUuid) as string[];
  if (ids.length === 0) throw new HrmError(422, 'personas_invalidas');

  const db = getServiceClient();
  const { data: puede, error: errPuede } = await db.rpc('fn_hr_puede_actor', {
    p_actor: ctx.userId,
    p_org: ctx.organizationId,
    p_code: 'hr.employees.edit',
  });
  if (errPuede) throw errorDeRpc(errPuede);
  if (puede !== true) throw new HrmError(403, 'sin_permiso');

  const { data: personas, error } = await db
    .from('hr_people')
    .select('id, user_id, work_email, organization_member_id')
    .eq('organization_id', ctx.organizationId)
    .in('id', ids);
  if (error) throw new HrmError(500, 'error_hrm');
  const { data: idents } = await db
    .from('hr_people_identification')
    .select('person_id, personal_email')
    .eq('organization_id', ctx.organizationId)
    .in('person_id', ids);
  const correoPersonal = new Map((idents ?? []).map((i) => [i.person_id as string, (i.personal_email as string | null) ?? null]));
  const { data: org } = await db.from('organizations').select('name').eq('id', ctx.organizationId).maybeSingle();
  const admin = getSupabaseAdmin();

  const resultados: ResumenInvitaciones['resultados'] = [];
  for (const id of ids) {
    const p = (personas ?? []).find((x) => x.id === id);
    if (!p) continue;
    if (p.user_id || p.organization_member_id) {
      resultados.push({ persona_id: id, resultado: 'ya_tiene_usuario' });
      continue;
    }
    const personal = correoPersonal.get(id) ?? null;
    const email = normalizarCorreo(String(p.work_email || personal || ''));
    if (!EMAIL_RE.test(email)) {
      resultados.push({ persona_id: id, resultado: 'sin_correo' });
      continue;
    }
    if (!p.work_email && personal) {
      await db.rpc('fn_hr_registrar_acceso_interno', {
        p_actor: ctx.userId,
        p_org: ctx.organizationId,
        p_person: id,
        p_employment: null,
        p_grupo: 'identificacion',
        p_accion: 'ver',
        p_ip: peticion.ip,
        p_ua: peticion.userAgent,
        p_ruta: peticion.ruta,
        p_detalle: { campos: ['personal_email'], proposito: 'invitacion_portal' },
      });
    }
    const rl = await checkRateLimits([{ key: `invite:send:email:${email}`, opts: LIMITE_CORREO }]);
    if (!rl.allowed) {
      resultados.push({ persona_id: id, resultado: 'ya_invitado' });
      continue;
    }
    const { data: pendiente } = await db
      .from('invitations')
      .select('id')
      .eq('organization_id', ctx.organizationId)
      .eq('email', email)
      .eq('status', 'pending')
      .gt('expires_at', new Date().toISOString())
      .limit(1)
      .maybeSingle();
    if (pendiente) {
      resultados.push({ persona_id: id, resultado: 'ya_invitado' });
      continue;
    }
    const { data: vinculo } = await db
      .from('employments')
      .select('branch_id, position_id')
      .eq('person_id', id)
      .order('hire_date', { ascending: false })
      .limit(1)
      .maybeSingle();
    const { data: creada, error: errIns } = await db
      .from('invitations')
      .insert({
        email,
        code: generarCodigoInvitacion(),
        role_id: ROL_EMPLEADO,
        organization_id: ctx.organizationId,
        branch_id: vinculo?.branch_id ?? null,
        job_position_id: vinculo?.position_id ?? null,
        created_by: ctx.userId,
        expires_at: new Date(Date.now() + DIAS_VIGENCIA_INVITACION * 24 * 3600_000).toISOString(),
        status: 'pending',
        hr_person_id: id,
      })
      .select('id, code')
      .single();
    if (errIns || !creada) {
      resultados.push({ persona_id: id, resultado: errorDeCupo(errIns) ? 'sin_cupo' : 'error' });
      continue;
    }
    const enviado = await enviarCorreoInvitacion(
      admin,
      {
        id: creada.id as number,
        code: creada.code as string,
        email,
        organization_id: ctx.organizationId,
        role_id: ROL_EMPLEADO,
        organizationName: (org?.name as string | undefined) || 'la organización',
      },
      origin,
      ctx.userId
    );
    resultados.push({ persona_id: id, resultado: enviado ? 'enviada' : 'error' });
  }
  return { enviadas: resultados.filter((r) => r.resultado === 'enviada').length, resultados };
}
