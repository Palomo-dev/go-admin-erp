-- Membresías — fase 1, M1 a M3 (docs/design/MEMBRESIAS-FASE-1-2.md §3).
--
-- Modelo: el PRODUCTO (products, product_type='service', service_type='membership') es lo que se
-- vende y su precio vive solo en product_prices; el PLAN (membership_plans, 1:1 con el producto por
-- product_id) es la configuración operativa; la MEMBRESÍA (memberships) es lo que el cliente obtiene
-- al pagar y la crean las funciones de venta y pago (fase 2).
--
-- Todo es aditivo: columnas nuevas NULL-ables o con DEFAULT. Las dos CHECK que se reemplazan
-- (memberships.status, membership_events.event_type, membership_freezes.status) solo AMPLÍAN los
-- valores permitidos; ninguna fila existente queda inválida (1 membresía 'active', 1 evento).
-- La FK duplicada fk_memberships_sale (ON DELETE CASCADE) se quita: borrar una venta no debe borrar
-- membresías en silencio; queda memberships_sale_id_fkey (RESTRICT) sobre la misma columna.

-- ── M1 · service_type en productos ───────────────────────────────────────────
alter table public.products add column if not exists service_type text;

do $$
begin
  if not exists (select 1 from pg_constraint
                  where conname = 'products_service_type_check' and conrelid = 'public.products'::regclass) then
    alter table public.products add constraint products_service_type_check check (
      service_type is null or (product_type = 'service' and service_type in
        ('standard', 'membership', 'session_pack', 'class', 'course', 'appointment'))) not valid;
  end if;
end $$;

-- Los servicios existentes (3 filas medidas el 2026-09-28) pasan a «estándar».
update public.products set service_type = 'standard'
 where product_type = 'service' and service_type is null;

alter table public.products validate constraint products_service_type_check;

create index if not exists products_org_service_type_idx
  on public.products (organization_id, service_type) where service_type is not null;

comment on column public.products.service_type is
  'Tipo de servicio (solo si product_type = service): standard, membership, session_pack, class, course, appointment.';

-- ── M2 · Plan ligado al producto y campos del plan ──────────────────────────
alter table public.membership_plans
  add column if not exists product_id integer references public.products(id) on delete restrict,
  add column if not exists duration_unit text not null default 'day',
  add column if not exists duration_value integer,
  add column if not exists renewal_mode text not null default 'manual',
  add column if not exists billing_mode text not null default 'prepaid',
  add column if not exists grace_days integer not null default 0,
  add column if not exists requires_activation boolean not null default false,
  add column if not exists activation_window_days integer,
  add column if not exists freeze_allowed boolean not null default false,
  add column if not exists freeze_max_times integer,
  add column if not exists freeze_max_days integer,
  add column if not exists allowed_branch_ids integer[],
  add column if not exists access_schedule jsonb,
  add column if not exists daily_checkin_limit integer;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'membership_plans_duration_unit_check') then
    alter table public.membership_plans add constraint membership_plans_duration_unit_check
      check (duration_unit in ('day', 'week', 'month', 'year'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'membership_plans_renewal_mode_check') then
    alter table public.membership_plans add constraint membership_plans_renewal_mode_check
      check (renewal_mode in ('manual', 'automatic'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'membership_plans_billing_mode_check') then
    alter table public.membership_plans add constraint membership_plans_billing_mode_check
      check (billing_mode in ('prepaid', 'on_credit'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'membership_plans_numeros_check') then
    alter table public.membership_plans add constraint membership_plans_numeros_check check (
      grace_days >= 0
      and (duration_value is null or duration_value > 0)
      and (activation_window_days is null or activation_window_days > 0)
      and (freeze_max_times is null or freeze_max_times >= 0)
      and (freeze_max_days is null or freeze_max_days >= 0)
      and (daily_checkin_limit is null or daily_checkin_limit > 0));
  end if;
end $$;

create unique index if not exists membership_plans_product_uq
  on public.membership_plans (product_id) where product_id is not null;

alter table public.membership_plans alter column price drop not null;

comment on column public.membership_plans.price is
  'Obsoleto: el precio es el del producto (product_prices). Se retira en la fase 3.';
comment on column public.membership_plans.product_id is
  'Producto (service_type = membership) que vende este plan. 1:1.';
comment on column public.membership_plans.billing_mode is
  'prepaid: se activa al pagar (por defecto). on_credit: se activa al emitir la factura a crédito.';
comment on column public.membership_plans.access_schedule is
  'Horario de acceso: {"dias":[1..7], "desde":"05:00", "hasta":"10:00"}. NULL = sin restricción.';

-- Guarda de coherencia: producto de la misma organización y de tipo membresía; duración en días
-- calculada desde (unidad, valor) para compatibilidad con quien todavía lee duration_days.
create or replace function public.fn_membership_plans_coherencia()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.product_id is not null and not exists (
       select 1 from public.products p
        where p.id = new.product_id and p.organization_id = new.organization_id
          and p.service_type = 'membership') then
    raise exception 'plan_producto_invalido' using errcode = '23514',
      detail = 'El producto del plan debe ser de la misma organización y de tipo membresía';
  end if;
  if new.duration_value is null then
    new.duration_value := greatest(coalesce(new.duration_days, 30), 1);
    new.duration_unit := 'day';
  end if;
  new.duration_days := case new.duration_unit
    when 'day' then new.duration_value
    when 'week' then new.duration_value * 7
    when 'month' then new.duration_value * 30
    when 'year' then new.duration_value * 365
  end;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_membership_plans_coherencia on public.membership_plans;
create trigger trg_membership_plans_coherencia
  before insert or update on public.membership_plans
  for each row execute function public.fn_membership_plans_coherencia();

-- ── M3 · Estados, vínculo con la línea de venta y reglas copiadas ───────────
alter table public.memberships
  add column if not exists product_id integer references public.products(id),
  add column if not exists sale_item_id uuid references public.sale_items(id) on delete restrict,
  add column if not exists invoice_id uuid references public.invoice_sales(id),
  add column if not exists branch_id integer references public.branches(id),
  add column if not exists plan_snapshot jsonb,
  add column if not exists activated_at timestamptz,
  add column if not exists grace_until timestamptz,
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancel_reason text,
  add column if not exists source text;

alter table public.memberships drop constraint if exists memberships_status_check;
alter table public.memberships add constraint memberships_status_check
  check (status in ('pending', 'active', 'frozen', 'past_due', 'expired', 'cancelled'));

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'memberships_source_check') then
    alter table public.memberships add constraint memberships_source_check
      check (source is null or source in ('pos', 'invoice', 'web', 'manual_legacy'));
  end if;
end $$;

create unique index if not exists memberships_sale_item_uq
  on public.memberships (sale_item_id) where sale_item_id is not null;
create index if not exists memberships_org_status_end_idx
  on public.memberships (organization_id, status, end_date);
create index if not exists memberships_customer_idx
  on public.memberships (organization_id, customer_id);

alter table public.memberships drop constraint if exists fk_memberships_sale;

comment on column public.memberships.plan_snapshot is
  'Reglas del plan al venderse (duración, gracia, congelamiento, sedes, horario). El check-in valida contra esta copia.';
comment on column public.memberships.source is
  'Origen: pos, invoice, web o manual_legacy (alta anterior al modelo con venta).';

alter table public.membership_events drop constraint if exists membership_events_event_type_check;
alter table public.membership_events add constraint membership_events_event_type_check check (event_type in (
  'created', 'activated', 'renewed', 'frozen', 'unfrozen', 'cancelled', 'expired', 'payment_received',
  'payment_failed', 'access_granted', 'access_denied', 'plan_changed', 'notes_updated',
  'trimmed', 'grace_started', 'reactivated'));

create index if not exists membership_events_membership_idx
  on public.membership_events (membership_id, created_at desc);

alter table public.membership_freezes drop constraint if exists membership_freezes_status_check;
alter table public.membership_freezes add constraint membership_freezes_status_check
  check (status in ('scheduled', 'active', 'ended', 'cancelled'));
