create or replace function public.fn_sembrar_centros_costo(
  p_organization_id integer,
  p_alcance text default 'completo',
  p_aplicar boolean default true
) returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
begin
  perform public.fn_assert_acceso_org(p_organization_id);
  return public.fn_sembrar_centros_costo_interno(p_organization_id, p_alcance, p_aplicar);
end;
$fn$;

create or replace function public.trg_fn_sembrar_centros_org()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  perform public.fn_sembrar_centros_costo_interno(new.id, 'completo', true);
  return new;
end;
$fn$;

create or replace function public.trg_fn_sembrar_centros_sucursal()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  perform public.fn_sembrar_centros_costo_interno(new.organization_id, 'completo', true);
  return new;
end;
$fn$;

drop trigger if exists trg_zzzz_sembrar_centros_org on public.organizations;
create trigger trg_zzzz_sembrar_centros_org
  after insert on public.organizations
  for each row execute function public.trg_fn_sembrar_centros_org();

drop trigger if exists trg_zz_sembrar_centros_sucursal on public.branches;
create trigger trg_zz_sembrar_centros_sucursal
  after insert on public.branches
  for each row execute function public.trg_fn_sembrar_centros_sucursal();

-- ---------------------------------------------------------------------------
-- Jerarquía sin ciclos, y sin borrado físico si ya hay movimientos.
-- ---------------------------------------------------------------------------

create or replace function public.fn_cost_centers_sin_ciclo()
returns trigger
language plpgsql
set search_path = public
as $fn$
declare
  v_id uuid;
  v_pasos integer := 0;
begin
  if new.parent_id is null then
    return new;
  end if;
  if new.parent_id = new.id then
    raise exception 'CENTRO_CICLO' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.cost_centers p
     where p.id = new.parent_id
       and p.organization_id = new.organization_id
  ) then
    raise exception 'CENTRO_PADRE_INVALIDO' using errcode = '22023';
  end if;
  v_id := new.parent_id;
  while v_id is not null loop
    if v_id = new.id then
      raise exception 'CENTRO_CICLO' using errcode = '22023';
    end if;
    v_pasos := v_pasos + 1;
    if v_pasos > 50 then
      raise exception 'CENTRO_CICLO' using errcode = '22023';
    end if;
    select c.parent_id into v_id from public.cost_centers c where c.id = v_id;
  end loop;
  return new;
end;
$fn$;

drop trigger if exists trg_cost_centers_sin_ciclo on public.cost_centers;
create trigger trg_cost_centers_sin_ciclo
  before insert or update of parent_id, organization_id on public.cost_centers
  for each row execute function public.fn_cost_centers_sin_ciclo();

create or replace function public.fn_cost_centers_bloquear_borrado()
returns trigger
language plpgsql
set search_path = public
as $fn$
begin
  if exists (
    select 1 from public.journal_lines jl where jl.cost_center_id = old.id
  ) then
    raise exception 'centro_con_movimientos' using errcode = '22023';
  end if;
  return old;
end;
$fn$;

drop trigger if exists trg_cost_centers_bloquear_borrado on public.cost_centers;
create trigger trg_cost_centers_bloquear_borrado
  before delete on public.cost_centers
  for each row execute function public.fn_cost_centers_bloquear_borrado();

-- ---------------------------------------------------------------------------
-- Herencia al insertar la línea. Un UPDATE posterior chocaría con el asiento
-- inmutable; aquí el centro queda en NEW antes de escribir la fila.
-- ---------------------------------------------------------------------------
