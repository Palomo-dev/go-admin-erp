-- Rollback de 20260929050000_invitaciones_cierre_rls_y_rpc.sql
--
-- ADVERTENCIA: revertir REABRE los agujeros que la migración cerró (lectura
-- anónima de los códigos de invitación y escalada a admin de cualquier
-- organización). Solo tiene sentido como paso intermedio y seguido de otra
-- corrección.
--
-- NO restaura datos: los códigos de las invitaciones pendientes se rotaron y
-- los anteriores no se guardaron (estaban expuestos; recuperarlos no es deseable).

-- 1. Políticas tal como estaban el 2026-09-28
drop policy if exists invitations_all_for_admins on public.invitations;
create policy invitations_all_for_admins on public.invitations
  for all to public
  using (exists (
    select 1 from organization_members
    where organization_members.user_id = auth.uid()
      and organization_members.organization_id = invitations.organization_id
      and organization_members.role_id = 2
      and organization_members.is_active = true
  ));

drop policy if exists invitations_all_for_creator on public.invitations;
create policy invitations_all_for_creator on public.invitations
  for all to public
  using (created_by = auth.uid());

drop policy if exists invitations_select_for_validation on public.invitations;
create policy invitations_select_for_validation on public.invitations
  for select to public
  using ((status = 'pending'::text) and (expires_at > now()));

drop policy if exists invitations_update_for_invitee on public.invitations;
create policy invitations_update_for_invitee on public.invitations
  for update to public
  using (lower(email) = lower((auth.jwt() ->> 'email'::text)))
  with check (lower(email) = lower((auth.jwt() ->> 'email'::text)));

-- 2. Privilegios de tabla
grant all on table public.invitations to anon;
grant truncate, references, trigger on table public.invitations to authenticated;

-- 3. Índice único
drop index if exists public.invitations_code_key;

-- 4. Funciones: privilegios anteriores
grant execute on function public.validate_invitation_by_code(text) to authenticated;
grant execute on function public.complete_invitation_registration(text, uuid, text, text, text, text, text) to authenticated;
grant execute on function public.prepare_invitation_email(text, integer, integer, text) to authenticated;
grant execute on function public.send_invitation_email(text, integer, integer, text) to authenticated;
grant execute on function public.handle_email_confirmation() to anon, authenticated;

-- accept_invitation_atomic sin la guarda de p_user_id ni search_path fijo
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
as $function$
DECLARE
  v_invite RECORD;
  v_user_id UUID;
  v_user_email TEXT;
  v_membership_id INTEGER;
  v_branch_id INTEGER;
BEGIN
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
