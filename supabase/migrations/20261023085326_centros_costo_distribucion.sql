-- Distribución de un movimiento entre centros y resultados por centro.
-- El reparto ocurre al insertar la línea. Un reverso ya trae el centro y no se vuelve a partir.

create table if not exists public.cost_center_distributions (
  id uuid primary key default gen_random_uuid(),
  organization_id integer not null references public.organizations(id),
  nombre text not null,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  constraint cost_center_distributions_nombre_key unique (organization_id, nombre)
);

create table if not exists public.cost_center_distribution_lines (
  id uuid primary key default gen_random_uuid(),
  distribution_id uuid not null references public.cost_center_distributions(id) on delete cascade,
  cost_center_id uuid not null references public.cost_centers(id) on delete restrict,
  porcentaje numeric(8, 4) not null,
  constraint cost_center_distribution_lines_pct_chk check (porcentaje > 0 and porcentaje <= 100),
  constraint cost_center_distribution_lines_centro_key unique (distribution_id, cost_center_id)
);

create index if not exists idx_cost_center_distributions_org
  on public.cost_center_distributions (organization_id);
create index if not exists idx_cost_center_distribution_lines_dist
  on public.cost_center_distribution_lines (distribution_id);

alter table public.cost_center_distributions enable row level security;
alter table public.cost_center_distribution_lines enable row level security;

drop policy if exists cost_center_distributions_org on public.cost_center_distributions;
create policy cost_center_distributions_org on public.cost_center_distributions
  for all
  using (organization_id in (select om.organization_id from public.organization_members om where om.user_id = auth.uid()))
  with check (organization_id in (select om.organization_id from public.organization_members om where om.user_id = auth.uid()));

drop policy if exists cost_center_distribution_lines_org on public.cost_center_distribution_lines;
create policy cost_center_distribution_lines_org on public.cost_center_distribution_lines
  for all
  using (exists (
    select 1 from public.cost_center_distributions d
     where d.id = distribution_id
       and d.organization_id in (select om.organization_id from public.organization_members om where om.user_id = auth.uid())
  ))
  with check (exists (
    select 1 from public.cost_center_distributions d
     where d.id = distribution_id
       and d.organization_id in (select om.organization_id from public.organization_members om where om.user_id = auth.uid())
  ));

revoke all on public.cost_center_distributions from public, anon;
revoke all on public.cost_center_distribution_lines from public, anon;
grant select, insert, update, delete on public.cost_center_distributions to authenticated, service_role;
grant select, insert, update, delete on public.cost_center_distribution_lines to authenticated, service_role;

do $fk$
begin
  if not exists (select 1 from pg_constraint where conname = 'invoice_purchase_distribucion_id_fkey') then
    alter table public.invoice_purchase
      add constraint invoice_purchase_distribucion_id_fkey
      foreign key (distribucion_id) references public.cost_center_distributions(id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'cash_movements_distribucion_id_fkey') then
    alter table public.cash_movements
      add constraint cash_movements_distribucion_id_fkey
      foreign key (distribucion_id) references public.cost_center_distributions(id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'bank_transactions_distribucion_id_fkey') then
    alter table public.bank_transactions
      add constraint bank_transactions_distribucion_id_fkey
      foreign key (distribucion_id) references public.cost_center_distributions(id) on delete set null;
  end if;
end
$fk$;

create or replace function public.fn_distribucion_linea_org()
returns trigger
language plpgsql
set search_path = public
as $fn$
declare
  v_org integer;
begin
  select d.organization_id into v_org
    from public.cost_center_distributions d
   where d.id = new.distribution_id;
  if v_org is null then
    raise exception 'DISTRIBUCION_INVALIDA' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.cost_centers c
     where c.id = new.cost_center_id
       and c.organization_id = v_org
  ) then
    raise exception 'CENTRO_INVALIDO' using errcode = '22023';
  end if;
  return new;
end;
$fn$;

drop trigger if exists trg_distribucion_linea_org on public.cost_center_distribution_lines;
create trigger trg_distribucion_linea_org
  before insert or update of distribution_id, cost_center_id on public.cost_center_distribution_lines
  for each row execute function public.fn_distribucion_linea_org();

create or replace function public.fn_distribucion_suma_100()
returns trigger
language plpgsql
set search_path = public
as $fn$
declare
  v_id uuid;
  v_suma numeric;
begin
  v_id := coalesce(new.distribution_id, old.distribution_id);
  if not exists (select 1 from public.cost_center_distributions d where d.id = v_id) then
    return null;
  end if;
  select coalesce(sum(l.porcentaje), 0) into v_suma
    from public.cost_center_distribution_lines l
   where l.distribution_id = v_id;
  if abs(v_suma - 100) > 0.001 then
    raise exception 'DISTRIBUCION_SUMA' using errcode = '22023';
  end if;
  return null;
end;
$fn$;

drop trigger if exists trg_distribucion_suma_100 on public.cost_center_distribution_lines;
create constraint trigger trg_distribucion_suma_100
  after insert or update or delete on public.cost_center_distribution_lines
  deferrable initially deferred
  for each row execute function public.fn_distribucion_suma_100();

-- Parte el importe. La última línea se lleva el residuo del redondeo a 2 decimales.
create or replace function public.fn_repartir_monto(
  p_org integer,
  p_branch integer,
  p_cuenta text,
  p_centro uuid,
  p_distrib uuid,
  p_debito numeric,
  p_credito numeric,
  p_debito_base numeric,
  p_credito_base numeric
) returns table (
  debito numeric,
  credito numeric,
  debito_base numeric,
  credito_base numeric,
  cost_center_id uuid
)
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  v_modo text;
  v_n integer;
  v_i integer := 0;
  v_acc_d numeric := 0;
  v_acc_c numeric := 0;
  v_acc_db numeric := 0;
  v_acc_cb numeric := 0;
  v_fila record;
  v_d numeric;
  v_c numeric;
  v_db numeric;
  v_cb numeric;
  v_centro uuid;
begin
  v_modo := public.fn_modo_centro(p_org, p_cuenta);
  if v_modo = 'no_aplica' or p_distrib is null then
    v_centro := case when v_modo = 'no_aplica' then null else coalesce(p_centro, public.fn_centro_defecto(p_org, p_branch)) end;
    debito := coalesce(p_debito, 0);
    credito := coalesce(p_credito, 0);
    debito_base := coalesce(p_debito_base, 0);
    credito_base := coalesce(p_credito_base, 0);
    cost_center_id := v_centro;
    return next;
    return;
  end if;

  select count(*) into v_n
    from public.cost_center_distribution_lines l
    join public.cost_center_distributions d on d.id = l.distribution_id
   where l.distribution_id = p_distrib
     and d.organization_id = p_org
     and d.activo;

  if coalesce(v_n, 0) < 2 or (
    select abs(coalesce(sum(l.porcentaje), 0) - 100) > 0.001
      from public.cost_center_distribution_lines l
      join public.cost_center_distributions d on d.id = l.distribution_id
     where l.distribution_id = p_distrib
       and d.organization_id = p_org
  ) then
    debito := coalesce(p_debito, 0);
    credito := coalesce(p_credito, 0);
    debito_base := coalesce(p_debito_base, 0);
    credito_base := coalesce(p_credito_base, 0);
    cost_center_id := coalesce(p_centro, public.fn_centro_defecto(p_org, p_branch));
    return next;
    return;
  end if;

  for v_fila in
    select l.cost_center_id as centro, l.porcentaje
      from public.cost_center_distribution_lines l
     where l.distribution_id = p_distrib
     order by l.id
  loop
    v_i := v_i + 1;
    if v_i < v_n then
      v_d := round(coalesce(p_debito, 0) * v_fila.porcentaje / 100, 2);
      v_c := round(coalesce(p_credito, 0) * v_fila.porcentaje / 100, 2);
      v_db := round(coalesce(p_debito_base, 0) * v_fila.porcentaje / 100, 2);
      v_cb := round(coalesce(p_credito_base, 0) * v_fila.porcentaje / 100, 2);
      v_acc_d := v_acc_d + v_d;
      v_acc_c := v_acc_c + v_c;
      v_acc_db := v_acc_db + v_db;
      v_acc_cb := v_acc_cb + v_cb;
    else
      v_d := coalesce(p_debito, 0) - v_acc_d;
      v_c := coalesce(p_credito, 0) - v_acc_c;
      v_db := coalesce(p_debito_base, 0) - v_acc_db;
      v_cb := coalesce(p_credito_base, 0) - v_acc_cb;
    end if;
    debito := v_d;
    credito := v_c;
    debito_base := v_db;
    credito_base := v_cb;
    cost_center_id := v_fila.centro;
    return next;
  end loop;
end;
$fn$;
