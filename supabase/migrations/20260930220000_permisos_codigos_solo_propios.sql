-- get_user_permission_codes: endurecimiento (tanda 3, 2026-09-30).
--
-- Antes: SECURITY DEFINER y aceptaba cualquier p_user_id, así que cualquier
-- usuario autenticado podía leer los códigos de permiso de otra persona, de su
-- organización o de otra.
--
-- Ahora, con sesión (auth.uid() no nulo):
--   - p_user_id = auth.uid()  -> igual que antes (todos los llamadores del ERP:
--     /api/me/permisos, /api/crm/permisos, asistente, búsqueda global,
--     membresías, permissionService/usePermissionContext y fn_tiene_permiso).
--   - p_user_id de otra persona -> exige pertenencia a p_organization_id
--     (fn_assert_acceso_org) Y ser administrador de ella (super admin o rol 1/2
--     por id, el mismo criterio de isOrgAdminLike / fn_crm_tiene_permiso) o
--     tener `users.view` (check_user_permission, rol + cargo). Si no: 42501.
-- Sin sesión: anon/authenticated sin usuario -> 42501; service_role y trabajo
-- interno (sin claims) siguen funcionando.
--
-- Se fija search_path (antes no tenía) y se revoca EXECUTE a public y anon
-- (anon ya no lo tenía; el revoke es explícito e idempotente).
-- El cuerpo de cálculo (rol + cargo con precedencia del cargo) no cambia.

create or replace function public.get_user_permission_codes(p_user_id uuid, p_organization_id integer)
returns text[]
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
DECLARE
  v_uid UUID := auth.uid();
  v_role_id INTEGER;
  v_job_position_id UUID;
  v_is_super_admin BOOLEAN;
  v_permissions TEXT[];
BEGIN
  -- Quién puede preguntar por quién (resuelto en la base, nunca por nombre de rol).
  IF v_uid IS NULL THEN
    IF coalesce(auth.role(), '') IN ('anon', 'authenticated') THEN
      RAISE EXCEPTION 'Acceso denegado a los permisos' USING errcode = '42501';
    END IF;
    -- service_role o trabajo interno: sin restricción.
  ELSIF p_user_id IS DISTINCT FROM v_uid THEN
    PERFORM public.fn_assert_acceso_org(p_organization_id);
    IF NOT EXISTS (
         SELECT 1 FROM public.organization_members om
         WHERE om.user_id = v_uid
           AND om.organization_id = p_organization_id
           AND om.is_active = true
           AND (coalesce(om.is_super_admin, false) OR om.role_id IN (1, 2))
       )
       AND NOT coalesce(public.check_user_permission(v_uid, p_organization_id, 'users.view'), false)
    THEN
      RAISE EXCEPTION 'Acceso denegado a los permisos de otro usuario' USING errcode = '42501';
    END IF;
  END IF;

  -- Obtener datos del miembro
  SELECT om.role_id, om.job_position_id, om.is_super_admin
  INTO v_role_id, v_job_position_id, v_is_super_admin
  FROM organization_members om
  WHERE om.user_id = p_user_id
    AND om.organization_id = p_organization_id
    AND om.is_active = true
  LIMIT 1;

  -- Super admin tiene todos los permisos
  IF v_is_super_admin = true THEN
    SELECT ARRAY_AGG(p.code)
    INTO v_permissions
    FROM permissions p;
    RETURN v_permissions;
  END IF;

  -- Combinar ROL + CARGO con precedencia
  WITH role_perms AS (
    SELECT p.id, p.code, rp.allowed
    FROM role_permissions rp
    JOIN permissions p ON p.id = rp.permission_id
    WHERE rp.role_id = v_role_id
  ),
  job_perms AS (
    SELECT p.id, p.code, jpp.allowed
    FROM job_position_permissions jpp
    JOIN permissions p ON p.id = jpp.permission_id
    WHERE jpp.job_position_id = v_job_position_id
      AND v_job_position_id IS NOT NULL
  ),
  combined AS (
    SELECT DISTINCT
      COALESCE(jp.id, rp.id) AS permission_id,
      COALESCE(jp.code, rp.code) AS code,
      CASE
        WHEN jp.id IS NOT NULL THEN jp.allowed  -- Cargo tiene precedencia
        ELSE rp.allowed
      END AS final_allowed
    FROM role_perms rp
    FULL OUTER JOIN job_perms jp ON jp.id = rp.id
  )
  SELECT ARRAY_AGG(c.code)
  INTO v_permissions
  FROM combined c
  WHERE c.final_allowed = true;

  RETURN COALESCE(v_permissions, ARRAY[]::TEXT[]);
END;
$function$;

revoke execute on function public.get_user_permission_codes(uuid, integer) from public, anon;
grant execute on function public.get_user_permission_codes(uuid, integer) to authenticated, service_role;

comment on function public.get_user_permission_codes(uuid, integer) is
  'Códigos de permiso efectivos (rol + cargo, precedencia del cargo). Con sesión: solo los propios, o los de otro miembro si quien llama es admin de la organización (super admin / rol 1-2 por id) o tiene users.view. service_role sin restricción.';
