-- Reversión de 20260929200000_miembros_y_suscripciones_cierre_rls.
-- ATENCIÓN: reabre las tres fallas de permisos que cerró la migración (insertarse en cualquier
-- organización, cambiarse el rol en la propia fila y que cualquier miembro cambie la suscripción).
-- Úsala solo si un flujo legítimo quedó roto y mientras se corrige ese flujo. No toca datos.

drop policy if exists subscriptions_insert_gestores on public.subscriptions;
drop policy if exists subscriptions_update_gestores on public.subscriptions;

drop policy if exists subscriptions_insert_update_delete_policy on public.subscriptions;
create policy subscriptions_insert_update_delete_policy on public.subscriptions
  for all
  using (organization_id in (select organization_members.organization_id
                               from organization_members
                              where organization_members.user_id = auth.uid()));

drop function if exists public.fn_puede_gestionar_suscripcion(integer);

drop trigger if exists trg_organization_members_proteger_propia_fila on public.organization_members;
drop function if exists public.fn_organization_members_proteger_propia_fila();

drop policy if exists organization_members_insert_request on public.organization_members;
create policy organization_members_insert_request on public.organization_members
  for insert
  with check ((user_id = auth.uid()) and (is_super_admin = false));
