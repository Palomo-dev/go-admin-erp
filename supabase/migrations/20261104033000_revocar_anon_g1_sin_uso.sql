-- Grupo 1 de 4: sin llamadores de anon ni de sesión.
--   · update_stage_safe: sin ningún llamador (código, Edge Functions, SQL, cron).
--   · fn_cuenta_ingresos_diversos: solo la llaman funciones SQL SECURITY DEFINER (corren como owner).
--   anon le llegaba por PUBLIC: el «revoke from anon» de 20261025134030 no tuvo efecto.
-- Aplicada por MCP el 2026-11-04, después de 20261104031500 (las 12 críticas), en orden 1 → 4,
-- con una sonda como anon después de cada grupo (395 tablas/vistas + 14 rutas de una tienda real).
-- service_role y postgres conservan EXECUTE. Se quedan para anon, a propósito, las 6 que evalúan
-- las políticas RLS de las tiendas: app_branch_access, can_access_account_receivable, fn_mis_orgs,
-- get_public_menu, is_user_member_of_org, user_belongs_to_organization.
--
-- Rollback: supabase/rollbacks/20261104033000_revocar_anon_g1_sin_uso_rollback.sql

revoke execute on function
  public.update_stage_safe(uuid,text,numeric,text,text),
  public.fn_cuenta_ingresos_diversos(integer,integer)
from public, anon, authenticated;

do $verificar$
declare v_f text;
begin
  foreach v_f in array array['public.update_stage_safe(uuid,text,numeric,text,text)', 'public.fn_cuenta_ingresos_diversos(integer,integer)'] loop
    if has_function_privilege('anon', v_f::regprocedure, 'execute') then
      raise exception '% sigue ejecutable por anon', v_f;
    end if;
    if not has_function_privilege('service_role', v_f::regprocedure, 'execute') then
      raise exception '% perdió service_role', v_f;
    end if;
    if has_function_privilege('authenticated', v_f::regprocedure, 'execute') <> false then
      raise exception '% authenticated quedó distinto de lo esperado', v_f;
    end if;
  end loop;
end
$verificar$;
