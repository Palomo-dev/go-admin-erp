-- Cierre de tres políticas abiertas en organization_members y subscriptions (HANDOFF 2026-09-29 §8.2).
--
-- Hallazgos (confirmados con pg_policy el 2026-09-29):
--   1. organization_members_insert_request: WITH CHECK (user_id = auth.uid() AND is_super_admin = false).
--      Cualquier sesión podía insertarse como miembro activo de CUALQUIER organización con el role_id
--      que quisiera (incluido el 2, admin de organización).
--   2. organization_members_self_update: USING/WITH CHECK (user_id = auth.uid()). Un miembro podía
--      cambiar en su propia fila role_id, organization_id, is_super_admin, job_position_id o
--      reactivarse después de que un admin lo desactivara.
--   3. subscriptions_insert_update_delete_policy (ALL, USING pertenencia): cualquier miembro, con
--      cualquier rol, podía cambiar plan y estado de la suscripción de su organización o borrarla.
--
-- Flujos legítimos revisados antes de cerrar:
--   - Alta de organización: fn_alta_organizacion (INVOKER) inserta al dueño por
--     organization_members_insert_owner y actualiza la suscripción como dueño. Sigue pasando.
--   - Registro antiguo (auth/callback, joinType 'create') y organizationService.createOrganization:
--     insertan al dueño (insert_owner) y actualizan la suscripción como dueño. Siguen pasando.
--   - Invitaciones: accept_invitation_atomic / complete_invitation_registration /
--     handle_email_confirmation son SECURITY DEFINER (dueño postgres): no las afecta ni RLS ni el
--     disparador (current_user = postgres).
--   - No existe flujo de «unirse a una organización» sin invitación: joinType distinto de 'create'
--     no escribe nada. Por eso insert_request se elimina sin reemplazo.
--   - Rutas de suscripción con sesión de usuario (change-plan, cancel) ya exigen en el servidor admin o
--     billing_management (contextoDeFacturacion); la nueva política pide lo mismo en la base.
--   - Stripe webhook, create-subscription, change-billing, enterprise y /api/modules/audit usan
--     service role: no les aplica RLS.
--   - «Salir de la organización» (ManageOrganizationsTab) pone is_active = false en la propia fila:
--     sigue permitido.

-- 1 · Nadie se inserta solo en una organización ajena ---------------------------------------------
drop policy if exists organization_members_insert_request on public.organization_members;

-- 2 · La propia fila solo admite «salir» (is_active true → false) desde la API -----------------------
create or replace function public.fn_organization_members_proteger_propia_fila()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
begin
  -- Solo se limita la escritura directa por la API (roles anon / authenticated). Las funciones
  -- SECURITY DEFINER (invitaciones, altas) corren como su dueño y no pasan por aquí; service role
  -- tampoco.
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;

  if new.user_id is distinct from old.user_id
     or new.organization_id is distinct from old.organization_id
     or new.role_id is distinct from old.role_id
     or new.is_super_admin is distinct from old.is_super_admin
     or new.job_position_id is distinct from old.job_position_id
     or new.is_temporary is distinct from old.is_temporary
     or new.created_at is distinct from old.created_at
     or new.id is distinct from old.id then
    raise exception 'organization_members: rol, organización y permisos solo se cambian desde el servidor'
      using errcode = '42501';
  end if;

  if coalesce(new.is_active, false) and not coalesce(old.is_active, false) then
    raise exception 'organization_members: un miembro desactivado no puede reactivarse a sí mismo'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.fn_organization_members_proteger_propia_fila() from public, anon, authenticated;

drop trigger if exists trg_organization_members_proteger_propia_fila on public.organization_members;
create trigger trg_organization_members_proteger_propia_fila
  before update on public.organization_members
  for each row execute function public.fn_organization_members_proteger_propia_fila();

-- 3 · Suscripción: solo dueño, admin de la organización o permiso de facturación ---------------------
create or replace function public.fn_puede_gestionar_suscripcion(p_organization_id integer)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select auth.uid() is not null
     and (
       exists (select 1 from public.organizations o
                where o.id = p_organization_id and o.owner_user_id = auth.uid())
       or exists (select 1 from public.organization_members om
                   where om.user_id = auth.uid()
                     and om.organization_id = p_organization_id
                     and om.is_active
                     and (om.is_super_admin or om.role_id in (1, 2)))
       or (
         exists (select 1 from public.organization_members om
                  where om.user_id = auth.uid()
                    and om.organization_id = p_organization_id
                    and om.is_active)
         and public.check_user_permission(auth.uid(), p_organization_id, 'billing_management')
       )
     );
$$;

revoke all on function public.fn_puede_gestionar_suscripcion(integer) from public, anon;
grant execute on function public.fn_puede_gestionar_suscripcion(integer) to authenticated;

comment on function public.fn_puede_gestionar_suscripcion(integer) is
  'true si el usuario de la sesión es dueño de la organización, admin activo (super admin o rol 1/2) o tiene billing_management. Solo responde por auth.uid().';

drop policy if exists subscriptions_insert_update_delete_policy on public.subscriptions;

drop policy if exists subscriptions_update_gestores on public.subscriptions;
create policy subscriptions_update_gestores on public.subscriptions
  for update to authenticated
  using (public.fn_puede_gestionar_suscripcion(organization_id))
  with check (public.fn_puede_gestionar_suscripcion(organization_id));

drop policy if exists subscriptions_insert_gestores on public.subscriptions;
create policy subscriptions_insert_gestores on public.subscriptions
  for insert to authenticated
  with check (public.fn_puede_gestionar_suscripcion(organization_id));

-- DELETE: sin política para usuarios. Solo service role (que no pasa por RLS).
