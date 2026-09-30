-- Rollback de 20260930220000_permisos_codigos_solo_propios: vuelve a la
-- definición anterior de get_user_permission_codes, byte a byte (md5(prosrc)
-- = 1579f8d7b5eed1a8033cd2e528fe211f, sin search_path fijado). OJO: reabre el
-- hueco (cualquier usuario autenticado puede leer los códigos de otra persona).
-- Los permisos de ejecución quedan como estaban antes: postgres, authenticated y
-- service_role; public y anon sin EXECUTE. No toca datos.

CREATE OR REPLACE FUNCTION public.get_user_permission_codes(p_user_id uuid, p_organization_id integer)
 RETURNS text[]
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_role_id INTEGER;
  v_job_position_id UUID;
  v_is_super_admin BOOLEAN;
  v_permissions TEXT[];
BEGIN
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
  'Retorna un array con los códigos de permisos del usuario.
Usa la lógica de precedencia: Cargo > Rol';
