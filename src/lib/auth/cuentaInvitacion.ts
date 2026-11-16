import type { SupabaseClient, User } from '@supabase/supabase-js';

/**
 * Estado de la cuenta asociada al correo de una invitación. Lo decide el
 * SERVIDOR con la clave de servicio; el cliente nunca lo manda.
 *
 * - `nueva`: no hay usuario en `auth.users` con ese correo. El invitado
 *   define nombre y contraseña en el asistente.
 * - `huerfana`: existe un usuario creado por `inviteUserByEmail` para ESTA
 *   invitación (o esta organización) que nunca terminó: sin perfil ni
 *   membresía en ninguna organización. Nadie es dueño de esa cuenta todavía,
 *   así que se le puede fijar la contraseña desde el asistente. También la
 *   cuenta que preparó el alta de RR. HH. (`esCuentaPreparadaPorRrhh`): perfil
 *   y miembro inactivo de esta organización, pero nunca entró.
 * - `existente`: hay una cuenta real (miembro de otra organización, o un
 *   cliente de una tienda web). Solo puede aceptar la invitación con SESIÓN
 *   PROPIA: enlace mágico o inicio de sesión con su contraseña. Nunca se le
 *   cambia la contraseña ni los datos desde el código de invitación —
 *   cualquiera con el enlace (que el admin puede copiar desde la tabla de
 *   invitaciones) podría apropiarse de la cuenta.
 */
export type EstadoCuentaInvitacion = 'nueva' | 'huerfana' | 'existente';

/**
 * Busca un usuario de `auth.users` por correo. La API de administración no
 * filtra por correo y pagina de 50 en 50 por defecto, así que se recorre
 * con páginas grandes hasta encontrarlo o agotar el listado.
 */
export async function buscarUsuarioAuthPorEmail(
  admin: SupabaseClient,
  email: string,
): Promise<User | null> {
  const buscado = email.toLowerCase().trim();
  const porPagina = 1000;
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: porPagina });
    if (error) throw error;
    const usuarios = data?.users ?? [];
    const hallado = usuarios.find((u) => u.email?.toLowerCase() === buscado);
    if (hallado) return hallado;
    if (usuarios.length < porPagina) break;
  }
  return null;
}

/**
 * ¿La cuenta la preparó el alta de RR. HH. de esta organización y nadie la ha
 * usado? (revisión 2026-11-15: cada empleado nace con su usuario). El alta crea
 * el usuario sin contraseña, su perfil y su miembro INACTIVO, y le manda la
 * invitación; mientras no la acepte, nadie es dueño de esa cuenta.
 *
 * Solo cuenta si: la creó una invitación de esta organización marcada
 * `hr_alta`, nunca inició sesión y no confirmó el correo. Las membresías se
 * revisan aparte (`estadoCuentaInvitacion`): todas inactivas y de esta
 * organización.
 */
export function esCuentaPreparadaPorRrhh(usuario: User, organizationId: number): boolean {
  const meta = (usuario.user_metadata ?? {}) as Record<string, unknown>;
  return (
    meta.is_invitation === true &&
    meta.hr_alta === true &&
    String(meta.organization_id ?? '') === String(organizationId) &&
    !usuario.last_sign_in_at &&
    !usuario.email_confirmed_at
  );
}

/**
 * Clasifica la cuenta del correo invitado. Ver `EstadoCuentaInvitacion`.
 */
export async function estadoCuentaInvitacion(
  admin: SupabaseClient,
  email: string,
  invitacion: { code: string; organization_id: number },
): Promise<{ estado: EstadoCuentaInvitacion; usuario: User | null }> {
  const usuario = await buscarUsuarioAuthPorEmail(admin, email);
  if (!usuario) return { estado: 'nueva', usuario: null };

  const meta = (usuario.user_metadata ?? {}) as Record<string, unknown>;
  const creadaPorInvitacion =
    !!usuario.invited_at || meta.is_invitation === true;
  const deEstaInvitacion =
    String(meta.invitation_code ?? '') === invitacion.code ||
    String(meta.organization_id ?? '') === String(invitacion.organization_id);

  if (!creadaPorInvitacion || !deEstaInvitacion) {
    return { estado: 'existente', usuario };
  }

  // Huérfana solo si nadie la ha reclamado: sin perfil y sin membresías.
  const [{ data: perfil }, { count: membresias }] = await Promise.all([
    admin.from('profiles').select('id').eq('id', usuario.id).maybeSingle(),
    admin
      .from('organization_members')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', usuario.id),
  ]);

  if (!perfil && (membresias ?? 0) === 0) return { estado: 'huerfana', usuario };

  // Preparada por el alta de RR. HH.: tiene perfil y un miembro inactivo de esta
  // organización, pero nunca entró. Se trata como huérfana para que fije su
  // contraseña al aceptar (accept_invitation_atomic activa el miembro).
  if (esCuentaPreparadaPorRrhh(usuario, invitacion.organization_id)) {
    const { data: filas } = await admin
      .from('organization_members')
      .select('organization_id, is_active')
      .eq('user_id', usuario.id);
    const lista = (filas ?? []) as { organization_id: number; is_active: boolean | null }[];
    const soloInactivaDeEstaOrg =
      lista.length > 0 &&
      lista.every((m) => Number(m.organization_id) === Number(invitacion.organization_id) && !m.is_active);
    if (soloInactivaDeEstaOrg) return { estado: 'huerfana', usuario };
  }
  return { estado: 'existente', usuario };
}
