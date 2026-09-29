-- GO-sec (auditoría de acceso 2026-09-28, docs/design/AUTH-ACCESO-V2.md §4.1).
--
-- La tabla `invitations` guarda en `code` el secreto que convierte a quien lo
-- tenga en miembro de una organización. Verificado por MCP antes de aplicar:
--
--   1. `invitations_select_for_validation` (rol public, qual: pending y sin
--      vencer) dejaba a la clave anónima —pública en el bundle— leer TODAS las
--      invitaciones vigentes con su correo y su código (3 filas visibles como
--      anon el 2026-09-28).
--   2. `invitations_all_for_creator` (ALL, qual `created_by = auth.uid()` y sin
--      WITH CHECK) permitía a CUALQUIER usuario autenticado insertar una
--      invitación con rol 2 en CUALQUIER organización y canjearla después con
--      `accept_invitation_atomic`: administrador de un tenant ajeno. Probado con
--      begin/rollback: el INSERT pasaba.
--   3. `invitations_update_for_invitee` (WITH CHECK solo sobre el correo)
--      dejaba al invitado cambiarse `role_id` u `organization_id` antes de canjear.
--   4. `accept_invitation_atomic(..., p_user_id)` aceptaba un `p_user_id` ajeno
--      desde una sesión cualquiera; `complete_invitation_registration` y
--      `validate_invitation_by_code` (que devuelve el código) estaban abiertas a
--      authenticated.
--
-- Esta migración es compatible con el código ya desplegado: el listado de
-- invitaciones del admin y el canje con sesión siguen funcionando. Lo que
-- necesita el despliegue nuevo (retirar la columna `code` de authenticated y la
-- política del invitado) va en una segunda migración.
--
-- Los códigos pendientes se ROTAN: estuvieron legibles con la clave anónima.
-- El enlace del correo de Supabase sigue sirviendo (tras verifyOtp la ruta
-- busca la invitación vigente por el correo verificado); un enlace
-- `/auth/invite?invite_code=` copiado a mano deja de servir y el admin reenvía.

-- 1. Políticas ------------------------------------------------------------------
drop policy if exists invitations_select_for_validation on public.invitations;
drop policy if exists invitations_update_for_invitee on public.invitations;
drop policy if exists invitations_all_for_creator on public.invitations;

-- Admins de la organización: mismo criterio que isOrgAdminLike (roles 1 y 2 o
-- super admin), con WITH CHECK explícito y en forma IN (SELECT ...) con
-- (select auth.uid()), que es la que no dispara el coste de RLS anidada.
drop policy if exists invitations_all_for_admins on public.invitations;
create policy invitations_all_for_admins on public.invitations
  for all to authenticated
  using (
    organization_id in (
      select om.organization_id
      from public.organization_members om
      where om.user_id = (select auth.uid())
        and om.is_active = true
        and (om.role_id in (1, 2) or om.is_super_admin = true)
    )
  )
  with check (
    organization_id in (
      select om.organization_id
      from public.organization_members om
      where om.user_id = (select auth.uid())
        and om.is_active = true
        and (om.role_id in (1, 2) or om.is_super_admin = true)
    )
  );

-- 2. Privilegios de tabla ---------------------------------------------------------
revoke all on table public.invitations from anon;
revoke truncate, references, trigger on table public.invitations from authenticated;

-- 3. Unicidad del código (125 filas, 125 códigos distintos al aplicar) ----------
create unique index if not exists invitations_code_key on public.invitations (code);

-- 4. Rotación de los códigos expuestos ---------------------------------------------
update public.invitations
set code = encode(extensions.gen_random_bytes(32), 'hex')
where status = 'pending';

-- 5. Funciones ----------------------------------------------------------------------
-- Devuelve el código: solo el servidor (service role) la usa.
revoke execute on function public.validate_invitation_by_code(text) from public, anon, authenticated;
grant execute on function public.validate_invitation_by_code(text) to service_role;

-- Sin uso en el código: aceptaba un user_id arbitrario.
revoke execute on function public.complete_invitation_registration(text, uuid, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.complete_invitation_registration(text, uuid, text, text, text, text, text)
  to service_role;

-- Sin uso en el código (URL de invitación antigua).
revoke execute on function public.prepare_invitation_email(text, integer, integer, text) from public, anon, authenticated;
revoke execute on function public.send_invitation_email(text, integer, integer, text) from public, anon, authenticated;
grant execute on function public.prepare_invitation_email(text, integer, integer, text) to service_role;
grant execute on function public.send_invitation_email(text, integer, integer, text) to service_role;

-- Función de trigger sin trigger enganchado: nadie debe poder invocarla.
revoke execute on function public.handle_email_confirmation() from public, anon, authenticated;

-- Canje: `p_user_id` solo lo puede fijar el servidor (service role). Con
-- sesión, el usuario es SIEMPRE auth.uid().
create or replace function public.accept_invitation_atomic(
  p_invite_code text,
  p_first_name text,
  p_last_name text,
  p_phone text,
  p_user_id uuid default null::uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $function$
DECLARE
  v_invite RECORD;
  v_user_id UUID;
  v_user_email TEXT;
  v_membership_id INTEGER;
  v_branch_id INTEGER;
BEGIN
  -- GO-sec 2026-09-28: con la clave de servicio el servidor indica el usuario
  -- (acaba de crear la cuenta); desde una sesión, un p_user_id ajeno es un
  -- intento de meter a otra persona en la organización.
  IF p_user_id IS NOT NULL
     AND p_user_id IS DISTINCT FROM auth.uid()
     AND coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'No autorizado.' USING ERRCODE = '42501';
  END IF;

  -- Si se pasa p_user_id (flujo admin/server-side), usarlo.
  -- Si no, usar auth.uid() (flujo con sesion del cliente).
  v_user_id := COALESCE(p_user_id, auth.uid());
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'No hay sesion activa. Debes abrir el enlace de invitacion desde tu correo.';
  END IF;

  SELECT email INTO v_user_email FROM auth.users WHERE id = v_user_id;

  SELECT * INTO v_invite
  FROM invitations
  WHERE code = p_invite_code
    AND status = 'pending'
    AND expires_at > NOW()
  FOR UPDATE;

  IF v_invite IS NULL THEN
    RAISE EXCEPTION 'La invitacion no existe, ya fue utilizada o expiro.';
  END IF;

  IF v_user_email IS NULL OR lower(v_user_email) <> lower(v_invite.email) THEN
    RAISE EXCEPTION 'La invitacion fue enviada a otro correo electronico.';
  END IF;

  -- Resolver branch_id: invitacion > sucursal principal de la organizacion
  v_branch_id := v_invite.branch_id;
  IF v_branch_id IS NULL THEN
    SELECT b.id INTO v_branch_id
    FROM branches b
    WHERE b.organization_id = v_invite.organization_id
      AND b.is_main = true
      AND b.is_active = true
    LIMIT 1;
  END IF;

  -- 1. Perfil (profiles no tiene branch_id/organization_id/role_id; se guardan en last_org_id)
  INSERT INTO profiles (id, email, first_name, last_name, phone, last_org_id, status)
  VALUES (v_user_id, v_user_email, p_first_name, p_last_name, p_phone, v_invite.organization_id, 'active')
  ON CONFLICT (id) DO UPDATE SET
    first_name = EXCLUDED.first_name,
    last_name = EXCLUDED.last_name,
    phone = EXCLUDED.phone,
    last_org_id = EXCLUDED.last_org_id,
    status = 'active';

  -- 2. Membresia en la organizacion (con job_position_id)
  SELECT id INTO v_membership_id
  FROM organization_members
  WHERE user_id = v_user_id AND organization_id = v_invite.organization_id;

  IF v_membership_id IS NULL THEN
    INSERT INTO organization_members (user_id, organization_id, role_id, job_position_id, is_active)
    VALUES (v_user_id, v_invite.organization_id, v_invite.role_id, v_invite.job_position_id, true)
    RETURNING id INTO v_membership_id;
  ELSE
    UPDATE organization_members
    SET role_id = v_invite.role_id,
        job_position_id = COALESCE(v_invite.job_position_id, organization_members.job_position_id),
        is_active = true
    WHERE id = v_membership_id;
  END IF;

  -- 3. Asignar sucursal en member_branches (usa branch resuelto, no solo el de la invitacion)
  IF v_branch_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM member_branches
      WHERE organization_member_id = v_membership_id
        AND branch_id = v_branch_id
    ) THEN
      INSERT INTO member_branches (organization_member_id, branch_id)
      VALUES (v_membership_id, v_branch_id);
    END IF;

    -- 4. Asegurar que el employment creado por el trigger tenga el branch_id correcto
    UPDATE employments
    SET branch_id = v_branch_id, updated_at = NOW()
    WHERE organization_member_id = v_membership_id
      AND branch_id IS NULL;
  END IF;

  -- 5. Marcar invitacion como utilizada
  UPDATE invitations
  SET status = 'used', used_at = NOW()
  WHERE id = v_invite.id;

  RETURN jsonb_build_object(
    'user_id', v_user_id,
    'organization_id', v_invite.organization_id,
    'membership_id', v_membership_id,
    'branch_id', v_branch_id,
    'job_position_id', v_invite.job_position_id
  );
END;
$function$;

revoke execute on function public.accept_invitation_atomic(text, text, text, text, uuid) from public, anon;
grant execute on function public.accept_invitation_atomic(text, text, text, text, uuid) to authenticated, service_role;
