-- Plantilla «Café de especialidad» · M1 (fase F3): elementos fijos del plano de mesas.
--
-- Columnas, jardineras, barras fijas, paredes, puertas, ventanas y textos que el
-- editor de POS › Mesas › plano dibuja junto a las mesas y que el sitio pinta en
-- la reserva con plano (solo los que tienen `show_on_web`).
--
-- Seguridad:
-- - RLS por pertenencia activa a la organización, igual que restaurant_zone_layouts.
-- - Sin lectura anónima: el sitio lee por la RPC get_restaurant_floor_plan_public.
-- - Un trigger exige que la organización de la fila sea la de la sede.
--
-- Aditiva: tabla nueva, sin datos de clientes.

create table if not exists public.restaurant_floor_elements (
  id uuid primary key default gen_random_uuid(),
  organization_id integer not null references public.organizations(id) on delete cascade,
  branch_id integer not null references public.branches(id) on delete cascade,
  zone_name text,
  kind text not null,
  label text,
  position_x integer not null default 0,
  position_y integer not null default 0,
  width integer not null default 60,
  height integer not null default 60,
  rotation integer not null default 0,
  show_on_web boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint restaurant_floor_elements_kind_check
    check (kind in ('column', 'planter', 'bar', 'wall', 'door', 'window', 'label')),
  constraint restaurant_floor_elements_label_check
    check (label is null or char_length(label) <= 60),
  constraint restaurant_floor_elements_width_check check (width between 4 and 4000),
  constraint restaurant_floor_elements_height_check check (height between 4 and 4000),
  constraint restaurant_floor_elements_rotation_check check (rotation between 0 and 359)
);

comment on table public.restaurant_floor_elements is
  'Elementos fijos del plano de mesas de una sede (columna, jardinera, barra, pared, puerta, ventana, texto). Los edita POS › Mesas › plano; el sitio los lee por get_restaurant_floor_plan_public.';
comment on column public.restaurant_floor_elements.zone_name is
  'Misma clave que restaurant_tables.zone y restaurant_zone_layouts.zone_name. NULL: fuera de las zonas.';
comment on column public.restaurant_floor_elements.show_on_web is
  'Se dibuja en el plano público de «Reservas».';

create index if not exists idx_restaurant_floor_elements_org_branch
  on public.restaurant_floor_elements (organization_id, branch_id);
create index if not exists idx_restaurant_floor_elements_branch
  on public.restaurant_floor_elements (branch_id);

-- La organización de la fila tiene que ser la de la sede (y updated_at al día).
create or replace function public.fn_restaurant_floor_elements_valida_sede()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (
    select 1 from public.branches b
     where b.id = new.branch_id and b.organization_id = new.organization_id
  ) then
    raise exception 'SEDE: La sede no pertenece a la organizacion' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' then
    new.updated_at := now();
  end if;
  return new;
end;
$$;

revoke all on function public.fn_restaurant_floor_elements_valida_sede() from public, anon, authenticated;

create or replace trigger trg_restaurant_floor_elements_valida_sede
  before insert or update on public.restaurant_floor_elements
  for each row execute function public.fn_restaurant_floor_elements_valida_sede();

alter table public.restaurant_floor_elements enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'restaurant_floor_elements'
       and policyname = 'restaurant_floor_elements_org_isolation'
  ) then
    create policy restaurant_floor_elements_org_isolation
      on public.restaurant_floor_elements
      for all
      to authenticated
      using (organization_id in (
        select om.organization_id from public.organization_members om
         where om.user_id = (select auth.uid()) and om.is_active = true))
      with check (organization_id in (
        select om.organization_id from public.organization_members om
         where om.user_id = (select auth.uid()) and om.is_active = true));
  end if;
end $$;

revoke all on table public.restaurant_floor_elements from public, anon;
grant select, insert, update, delete on table public.restaurant_floor_elements to authenticated;
grant all on table public.restaurant_floor_elements to service_role;
