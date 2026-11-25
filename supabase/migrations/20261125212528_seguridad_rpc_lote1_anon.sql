-- GO-seguridad 2026-11-25 · Lote 1 de la auditoría de SECURITY DEFINER por módulos: las 6 que
-- ejecuta anon (método y formato de 20261125210126_seguridad_rpc_pedidos_web).
--
-- Cinco de las seis NO son RPC: son las funciones que llaman las políticas RLS escritas «TO public»
-- (products, product_prices, sales, sale_items, organizations, branches, customers,
-- organization_members, accounts_receivable/payable, cash_movements, ar_installments…). Postgres
-- exige EXECUTE al rol que consulta la tabla aunque la función sea SECURITY DEFINER. Probado en
-- seco con SET ROLE anon: con EXECUTE revocado, anon pasa de «0 filas» a 42501 en 18 tablas
-- (sales, organizations, branches, customers, accounts_receivable, cash_movements…). Las páginas
-- públicas del ERP leen organizations y branches con la clave pública, y el navegador cae a anon
-- cuando la sesión vence: revocar convertiría un vacío silencioso en errores. Para anon las cinco
-- devuelven falso o vacío (miran auth.uid(), que es nulo): no filtran nada. Se quedan con anon
-- (clase C: ayudante de RLS) y se endurecen:
--
--   1. user_belongs_to_organization(uuid, integer): era un ORÁCULO DE PERTENENCIA. Recibía
--      cualquier usuario: con la clave pública, sin sesión, se podía preguntar si el usuario X es
--      miembro activo de la organización Y. Todas las políticas que la usan (9, en customers,
--      customer_company_links, branches, crm_*) le pasan auth.uid(). Ninguna función ni consumidor
--      la llama con otro usuario. → solo responde por el propio usuario; STABLE (era VOLATILE y la
--      política de customers la evalúa fila a fila); search_path fijo.
--   2. is_user_member_of_org, can_access_account_receivable: VOLATILE y sin search_path fijo
--      (o solo 'public'). → STABLE + search_path. Mismo cuerpo.
--   3. app_branch_access: sin search_path fijo. → search_path. Mismo cuerpo.
--   4. Las cinco: fuera PUBLIC (seguían concedidas a PUBLIC además de a anon/authenticated); los
--      permisos explícitos de anon, authenticated y service_role se mantienen.
--
-- La sexta sí es RPC:
--   5. get_public_menu: la carta pública. Solo la llaman la tienda (servidor, service_role: logs de
--      24 h, 37 llamadas, todas con la clave secreta; scripts/verify-sitio-publico.mjs también con
--      service_role) y el ERP con sesión (src/lib/website/carta.server.ts). Ningún consumidor la
--      llama con la clave pública. → fuera anon y PUBLIC (clase C: devuelve solo la carta
--      publicada: cartas activas, platos activos y no ocultos, precio de venta).
--
-- Ojo: CREATE OR REPLACE de cualquiera de estas sin cláusula SET borra el search_path que fija esta
-- migración. Quien las redefina, que lleve SET search_path TO 'public', 'pg_temp'.
-- Pendiente (otro lote, con cuidado): pasar a «TO authenticated» las políticas «TO public» que
-- llaman a estos ayudantes; solo entonces se podrá quitar anon sin convertir vacíos en errores.

-- 1 · Oráculo de pertenencia: solo responde por el propio usuario
create or replace function public.user_belongs_to_organization(user_uuid uuid, org_id integer)
 returns boolean
 language sql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
  -- GO-seguridad 2026-11-25: antes respondía por cualquier usuario (oráculo con la clave pública).
  select coalesce(user_uuid = (select auth.uid()), false)
     and exists (select 1 from public.organization_members om
                  where om.user_id = user_uuid and om.organization_id = org_id and om.is_active = true);
$function$;

-- 2 · Ayudantes de RLS: STABLE + search_path
alter function public.is_user_member_of_org(integer) stable;
alter function public.is_user_member_of_org(integer) set search_path to 'public', 'pg_temp';
alter function public.can_access_account_receivable(uuid) stable;
alter function public.can_access_account_receivable(uuid) set search_path to 'public', 'pg_temp';

-- 3 · app_branch_access: search_path
alter function public.app_branch_access(integer) set search_path to 'public', 'pg_temp';

-- 4 · Fuera PUBLIC; se mantienen anon (políticas TO public), authenticated y service_role
revoke all on function public.user_belongs_to_organization(uuid, integer) from public;
revoke all on function public.is_user_member_of_org(integer) from public;
revoke all on function public.can_access_account_receivable(uuid) from public;
revoke all on function public.app_branch_access(integer) from public;
revoke all on function public.fn_mis_orgs(boolean) from public;
grant execute on function public.user_belongs_to_organization(uuid, integer) to anon, authenticated, service_role;
grant execute on function public.is_user_member_of_org(integer) to anon, authenticated, service_role;
grant execute on function public.can_access_account_receivable(uuid) to anon, authenticated, service_role;
grant execute on function public.app_branch_access(integer) to anon, authenticated, service_role;
grant execute on function public.fn_mis_orgs(boolean) to anon, authenticated, service_role;

-- 5 · Carta pública: fuera anon y PUBLIC (la tienda la llama con service_role, el ERP con sesión)
revoke all on function public.get_public_menu(integer, integer, timestamptz, uuid, boolean) from public, anon;
grant execute on function public.get_public_menu(integer, integer, timestamptz, uuid, boolean) to authenticated, service_role;
