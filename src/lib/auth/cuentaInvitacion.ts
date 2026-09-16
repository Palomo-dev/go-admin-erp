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
 *   así que se le puede fijar la contraseña desde el asistente.
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

  if (perfil || (membresias ?? 0) > 0) return { estado: 'existente', usuario };
  return { estado: 'huerfana', usuario };
}
