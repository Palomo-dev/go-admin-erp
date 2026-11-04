-- Grupo 2 de 4: las usa el ERP o el SQL con sesión; authenticated LAS CONSERVA.
--   · check_user_permission: permissionService (navegador con sesión), orgContext (servidor con sesión)
--     y políticas RLS de tablas a las que anon no tiene ningún privilegio.
--   · fn_cuenta_auxiliar_de_titulo, fn_uvt: solo funciones SQL (algunas SECURITY INVOKER de authenticated).
--   check_user_permission era un oráculo para anon (¿tiene el usuario X el permiso P en la org N?).
-- Aplicada por MCP el 2026-11-04, después de 20261104031500 (las 12 críticas), en orden 1 → 4,
-- con una sonda como anon después de cada grupo (395 tablas/vistas + 14 rutas de una tienda real).
-- service_role y postgres conservan EXECUTE. Se quedan para anon, a propósito, las 6 que evalúan
-- las políticas RLS de las tiendas: app_branch_access, can_access_account_receivable, fn_mis_orgs,
-- get_public_menu, is_user_member_of_org, user_belongs_to_organization.
--
-- Rollback: supabase/rollbacks/20261104033100_revocar_anon_g2_solo_sesion_rollback.sql

revoke execute on function
  public.check_user_permission(uuid,integer,text),
  public.fn_cuenta_auxiliar_de_titulo(integer,integer,text,numeric,text),
  public.fn_uvt(integer,text)
from public, anon;

do $verificar$
declare v_f text;
begin
  foreach v_f in array array['public.check_user_permission(uuid,integer,text)', 'public.fn_cuenta_auxiliar_de_titulo(integer,integer,text,numeric,text)', 'public.fn_uvt(integer,text)'] loop
    if has_function_privilege('anon', v_f::regprocedure, 'execute') then
      raise exception '% sigue ejecutable por anon', v_f;
    end if;
    if not has_function_privilege('service_role', v_f::regprocedure, 'execute') then
      raise exception '% perdió service_role', v_f;
    end if;
    if has_function_privilege('authenticated', v_f::regprocedure, 'execute') <> true then
      raise exception '% authenticated quedó distinto de lo esperado', v_f;
    end if;
  end loop;
end
$verificar$;
