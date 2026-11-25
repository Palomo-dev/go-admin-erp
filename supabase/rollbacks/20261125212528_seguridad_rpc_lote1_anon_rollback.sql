-- Reversión de 20261125212528_seguridad_rpc_lote1_anon.
-- Devuelve cuerpos, volatilidad, search_path y permisos a como estaban antes. No toca datos (la
-- migración tampoco los tocaba). OJO: reabre el oráculo de pertenencia de
-- user_belongs_to_organization (cualquiera, incluso sin sesión, pregunta si el usuario X es miembro
-- de la organización Y) y devuelve get_public_menu a anon.

-- 1 · Oráculo de pertenencia (cuerpo anterior)
create or replace function public.user_belongs_to_organization(user_uuid uuid, org_id integer)
 returns boolean
 language plpgsql
 volatile security definer
as $function$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM organization_members
    WHERE user_id = user_uuid
    AND organization_id = org_id
    AND is_active = true
  );
END;
$function$;
alter function public.user_belongs_to_organization(uuid, integer) reset search_path;

-- 2 · Ayudantes de RLS
alter function public.is_user_member_of_org(integer) volatile;
alter function public.is_user_member_of_org(integer) reset search_path;
alter function public.can_access_account_receivable(uuid) volatile;
alter function public.can_access_account_receivable(uuid) set search_path to 'public';

-- 3 · app_branch_access
alter function public.app_branch_access(integer) reset search_path;

-- 4 · PUBLIC (antes lo tenían user_belongs_to_organization, is_user_member_of_org y
-- can_access_account_receivable; app_branch_access y fn_mis_orgs no)
grant execute on function public.user_belongs_to_organization(uuid, integer) to public;
grant execute on function public.is_user_member_of_org(integer) to public;
grant execute on function public.can_access_account_receivable(uuid) to public;

-- 5 · Carta pública
grant execute on function public.get_public_menu(integer, integer, timestamptz, uuid, boolean) to anon;
