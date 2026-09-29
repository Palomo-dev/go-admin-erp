-- Rollback de 20260929000100_membresias_m1_m3_esquema.sql
--
-- ADVERTENCIA: quitar columnas pierde sus datos (service_type de los productos, la configuración
-- de los planes y el vínculo de cada membresía con su línea de venta). Revertir antes
-- 20260929000300 (productos de los planes), 20260929000400 (formulario de producto) y todas las
-- migraciones de la fase 2 (2026092900100x), que dependen de estas columnas.
--
-- Las CHECK de estados solo se restauran si no hay filas en valores nuevos: si las hay, se aborta
-- (una membresía «pending» o «cancelled» no cabe en la CHECK vieja).

do $$
begin
  if exists (select 1 from public.memberships where status not in ('active', 'frozen', 'expired')) then
    raise exception 'Hay membresías en estados nuevos (pending/past_due/cancelled): no se puede restaurar la CHECK vieja';
  end if;
  if exists (select 1 from public.membership_events
              where event_type in ('trimmed', 'grace_started', 'reactivated')) then
    raise exception 'Hay eventos de tipos nuevos: no se puede restaurar la CHECK vieja';
  end if;
  if exists (select 1 from public.membership_freezes where status = 'scheduled') then
    raise exception 'Hay congelamientos programados: no se puede restaurar la CHECK vieja';
  end if;
end $$;

alter table public.membership_freezes drop constraint if exists membership_freezes_status_check;
alter table public.membership_freezes add constraint membership_freezes_status_check
  check (status in ('active', 'ended', 'cancelled'));

drop index if exists public.membership_events_membership_idx;
alter table public.membership_events drop constraint if exists membership_events_event_type_check;
alter table public.membership_events add constraint membership_events_event_type_check check (event_type in (
  'created', 'activated', 'renewed', 'frozen', 'unfrozen', 'cancelled', 'expired', 'payment_received',
  'payment_failed', 'access_granted', 'access_denied', 'plan_changed', 'notes_updated'));

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'fk_memberships_sale') then
    alter table public.memberships add constraint fk_memberships_sale
      foreign key (sale_id) references public.sales(id) on delete cascade;
  end if;
end $$;

drop index if exists public.memberships_customer_idx;
drop index if exists public.memberships_org_status_end_idx;
drop index if exists public.memberships_sale_item_uq;
alter table public.memberships drop constraint if exists memberships_source_check;
alter table public.memberships drop constraint if exists memberships_status_check;
alter table public.memberships add constraint memberships_status_check
  check (status in ('active', 'frozen', 'expired'));
alter table public.memberships
  drop column if exists source,
  drop column if exists cancel_reason,
  drop column if exists cancelled_at,
  drop column if exists grace_until,
  drop column if exists activated_at,
  drop column if exists plan_snapshot,
  drop column if exists branch_id,
  drop column if exists invoice_id,
  drop column if exists sale_item_id,
  drop column if exists product_id;

drop trigger if exists trg_membership_plans_coherencia on public.membership_plans;
drop function if exists public.fn_membership_plans_coherencia();

-- price vuelve a NOT NULL solo si ningún plan quedó sin precio.
update public.membership_plans set price = 0 where price is null;
alter table public.membership_plans alter column price set not null;
comment on column public.membership_plans.price is null;

drop index if exists public.membership_plans_product_uq;
alter table public.membership_plans
  drop constraint if exists membership_plans_numeros_check,
  drop constraint if exists membership_plans_billing_mode_check,
  drop constraint if exists membership_plans_renewal_mode_check,
  drop constraint if exists membership_plans_duration_unit_check;
alter table public.membership_plans
  drop column if exists daily_checkin_limit,
  drop column if exists access_schedule,
  drop column if exists allowed_branch_ids,
  drop column if exists freeze_max_days,
  drop column if exists freeze_max_times,
  drop column if exists freeze_allowed,
  drop column if exists activation_window_days,
  drop column if exists requires_activation,
  drop column if exists grace_days,
  drop column if exists billing_mode,
  drop column if exists renewal_mode,
  drop column if exists duration_value,
  drop column if exists duration_unit,
  drop column if exists product_id;

drop index if exists public.products_org_service_type_idx;
alter table public.products drop constraint if exists products_service_type_check;
alter table public.products drop column if exists service_type;
