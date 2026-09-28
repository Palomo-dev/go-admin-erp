-- Rollback de 20260928173749_gosec_metodos_pago_catalogo_solo_plataforma.
-- Devuelve las políticas de escritura de payment_methods tal como estaban el
-- 2026-09-28 (pg_policies antes de aplicar) y borra la RPC de alta. OJO: reabre
-- que cualquier miembro renombre o borre filas globales is_system = false
-- (p. ej. «wompi», vinculado a 61 organizaciones, con CASCADE a sus vínculos).
-- No restaura datos: los métodos creados por la RPC y sus vínculos se quedan.

drop policy if exists payment_methods_escritura_plataforma on public.payment_methods;

create policy payment_methods_insert_policy on public.payment_methods
  for insert to public
  with check ((is_system = false) and (exists (select 1 from organization_members
                                                where organization_members.user_id = auth.uid())));
create policy payment_methods_update_policy on public.payment_methods
  for update to public
  using ((is_system = false) and (code in (select organization_payment_methods.payment_method_code
                                             from organization_payment_methods
                                            where organization_payment_methods.organization_id in (
                                                  select organization_members.organization_id from organization_members
                                                   where organization_members.user_id = auth.uid()))));
create policy payment_methods_delete_policy on public.payment_methods
  for delete to public
  using ((is_system = false) and (code in (select organization_payment_methods.payment_method_code
                                             from organization_payment_methods
                                            where organization_payment_methods.organization_id in (
                                                  select organization_members.organization_id from organization_members
                                                   where organization_members.user_id = auth.uid()))));

grant insert, update, delete, truncate on table public.payment_methods to anon;

drop function if exists public.fn_metodo_pago_personalizado_crear(integer, text, text, boolean);
