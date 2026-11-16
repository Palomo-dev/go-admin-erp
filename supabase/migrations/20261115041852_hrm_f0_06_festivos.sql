-- HRM fase 0 · paso 6: festivos de Colombia por año (plataforma) y días propios
-- de cada organización. ADR-001 §5.
--
-- fn_hr_festivos_calcular(anio) aplica la Ley 51 de 1983 (traslado al lunes
-- siguiente) y la Ley 37 de 1905, con la Pascua por el algoritmo gregoriano
-- anónimo. Se cargan 2026 y 2027 (18 por año). Años futuros:
-- fn_hr_festivos_cargar(anio), solo con la service role.

create table if not exists public.hr_holidays (
  id            uuid primary key default gen_random_uuid(),
  country_code  text not null default 'COL' check (country_code ~ '^[A-Z]{3}$'),
  holiday_date  date not null,
  name          text not null,
  kind          text not null check (kind in ('fijo','trasladable','pascua','pascua_trasladable')),
  legal_source  text not null,
  created_at    timestamptz not null default now(),
  constraint hr_holidays_uq unique (country_code, holiday_date)
);

create table if not exists public.hr_org_holidays (
  id              uuid primary key default gen_random_uuid(),
  organization_id integer not null references public.organizations(id) on delete cascade,
  branch_id       integer references public.branches(id) on delete cascade,
  holiday_date    date not null,
  name            text not null,
  is_paid_rest    boolean not null default true,
  created_by      uuid,
  created_at      timestamptz not null default now()
);
create unique index if not exists hr_org_holidays_uq on public.hr_org_holidays (organization_id, coalesce(branch_id, 0), holiday_date);

create or replace function public.fn_hr_org_festivo_validar()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if new.branch_id is not null and not exists (
       select 1 from public.branches b where b.id = new.branch_id and b.organization_id = new.organization_id) then
    raise exception 'hr: la sede es de otra organización' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' then new.created_by := coalesce(auth.uid(), new.created_by); end if;
  return new;
end;
$$;
revoke execute on function public.fn_hr_org_festivo_validar() from public, anon, authenticated;
drop trigger if exists trg_hr_org_holidays_validar on public.hr_org_holidays;
create trigger trg_hr_org_holidays_validar before insert or update on public.hr_org_holidays
  for each row execute function public.fn_hr_org_festivo_validar();

alter table public.hr_holidays enable row level security;
alter table public.hr_org_holidays enable row level security;
revoke all on public.hr_holidays, public.hr_org_holidays from anon, public;
revoke insert, update, delete, truncate on public.hr_holidays from authenticated;
grant select on public.hr_holidays to authenticated;
grant select, insert, update, delete on public.hr_org_holidays to authenticated;

drop policy if exists hr_holidays_select on public.hr_holidays;
create policy hr_holidays_select on public.hr_holidays for select to authenticated using (true);
drop policy if exists hr_org_holidays_select on public.hr_org_holidays;
create policy hr_org_holidays_select on public.hr_org_holidays for select to authenticated
  using (organization_id in (select om.organization_id from public.organization_members om
                              where om.user_id = (select auth.uid()) and om.is_active));
drop policy if exists hr_org_holidays_write on public.hr_org_holidays;
create policy hr_org_holidays_write on public.hr_org_holidays for all to authenticated
  using (organization_id in (select public.fn_hr_orgs_con_permiso('hr.parameters.manage')))
  with check (organization_id in (select public.fn_hr_orgs_con_permiso('hr.parameters.manage')));

-- Domingo de Pascua (algoritmo gregoriano anónimo, Meeus/Jones/Butcher).
create or replace function public.fn_hr_pascua(p_anio integer)
returns date
language plpgsql immutable
set search_path = public, pg_temp
as $$
declare
  a int := p_anio % 19; b int := p_anio / 100; c int := p_anio % 100;
  d int := b / 4; e int := b % 4; f int := (b + 8) / 25; g int := (b - f + 1) / 3;
  h int := (19 * a + b - d - g + 15) % 30; i int := c / 4; k int := c % 4;
  l int := (32 + 2 * e + 2 * i - h - k) % 7; m int := (a + 11 * h + 22 * l) / 451;
  mes int := (h + l - 7 * m + 114) / 31; dia int := ((h + l - 7 * m + 114) % 31) + 1;
begin
  return make_date(p_anio, mes, dia);
end;
$$;

-- Lunes siguiente (o el mismo día si ya es lunes).
create or replace function public.fn_hr_lunes_siguiente(p_fecha date)
returns date
language sql immutable
set search_path = public, pg_temp
as $$ select p_fecha + ((8 - extract(isodow from p_fecha)::int) % 7) $$;

create or replace function public.fn_hr_festivos_calcular(p_anio integer)
returns table (holiday_date date, name text, kind text)
language sql immutable
set search_path = public, pg_temp
as $$
  with p as (select public.fn_hr_pascua(p_anio) as pascua)
  select make_date(p_anio, 1, 1), 'Año Nuevo', 'fijo'
  union all select public.fn_hr_lunes_siguiente(make_date(p_anio, 1, 6)), 'Día de los Reyes Magos', 'trasladable'
  union all select public.fn_hr_lunes_siguiente(make_date(p_anio, 3, 19)), 'Día de San José', 'trasladable'
  union all select pascua - 3, 'Jueves Santo', 'pascua' from p
  union all select pascua - 2, 'Viernes Santo', 'pascua' from p
  union all select make_date(p_anio, 5, 1), 'Día del Trabajo', 'fijo'
  union all select public.fn_hr_lunes_siguiente(pascua + 39), 'Ascensión del Señor', 'pascua_trasladable' from p
  union all select public.fn_hr_lunes_siguiente(pascua + 60), 'Corpus Christi', 'pascua_trasladable' from p
  union all select public.fn_hr_lunes_siguiente(pascua + 68), 'Sagrado Corazón de Jesús', 'pascua_trasladable' from p
  union all select public.fn_hr_lunes_siguiente(make_date(p_anio, 6, 29)), 'San Pedro y San Pablo', 'trasladable'
  union all select make_date(p_anio, 7, 20), 'Día de la Independencia', 'fijo'
  union all select make_date(p_anio, 8, 7), 'Batalla de Boyacá', 'fijo'
  union all select public.fn_hr_lunes_siguiente(make_date(p_anio, 8, 15)), 'La Asunción de la Virgen', 'trasladable'
  union all select public.fn_hr_lunes_siguiente(make_date(p_anio, 10, 12)), 'Día de la Raza', 'trasladable'
  union all select public.fn_hr_lunes_siguiente(make_date(p_anio, 11, 1)), 'Todos los Santos', 'trasladable'
  union all select public.fn_hr_lunes_siguiente(make_date(p_anio, 11, 11)), 'Independencia de Cartagena', 'trasladable'
  union all select make_date(p_anio, 12, 8), 'Día de la Inmaculada Concepción', 'fijo'
  union all select make_date(p_anio, 12, 25), 'Día de Navidad', 'fijo';
$$;

create or replace function public.fn_hr_festivos_cargar(p_anio integer)
returns integer
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare n integer;
begin
  if p_anio < 2020 or p_anio > 2100 then
    raise exception 'hr: año fuera de rango' using errcode = '22023';
  end if;
  insert into public.hr_holidays (country_code, holiday_date, name, kind, legal_source)
  select 'COL', f.holiday_date, f.name, f.kind,
         case f.kind when 'fijo' then 'Ley 51 de 1983; Ley 37 de 1905'
                     when 'pascua' then 'Ley 51 de 1983; Ley 37 de 1905 (no se traslada)'
                     else 'Ley 51 de 1983 (se traslada al lunes siguiente)' end
    from public.fn_hr_festivos_calcular(p_anio) f
  on conflict (country_code, holiday_date) do nothing;
  get diagnostics n = row_count;
  return n;
end;
$$;

create or replace function public.fn_hr_es_festivo(p_org integer, p_fecha date, p_branch integer default null)
returns boolean
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
begin
  perform public.fn_assert_acceso_org(p_org);
  return exists (select 1 from public.hr_holidays h
                  where h.country_code = public.fn_hr_pais(p_org) and h.holiday_date = p_fecha)
      or exists (select 1 from public.hr_org_holidays o
                  where o.organization_id = p_org and o.holiday_date = p_fecha
                    and (o.branch_id is null or o.branch_id = p_branch));
end;
$$;

create or replace function public.fn_hr_festivos(p_org integer, p_desde date, p_hasta date, p_branch integer default null)
returns table (fecha date, nombre text, origen text)
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
begin
  perform public.fn_assert_acceso_org(p_org);
  return query
    select h.holiday_date, h.name, 'plataforma'::text from public.hr_holidays h
     where h.country_code = public.fn_hr_pais(p_org) and h.holiday_date between p_desde and p_hasta
    union all
    select o.holiday_date, o.name, 'organizacion'::text from public.hr_org_holidays o
     where o.organization_id = p_org and o.holiday_date between p_desde and p_hasta
       and (o.branch_id is null or o.branch_id = p_branch)
    order by 1;
end;
$$;

revoke execute on function public.fn_hr_pascua(integer) from public, anon;
revoke execute on function public.fn_hr_lunes_siguiente(date) from public, anon;
revoke execute on function public.fn_hr_festivos_calcular(integer) from public, anon;
revoke execute on function public.fn_hr_festivos_cargar(integer) from public, anon, authenticated;
revoke execute on function public.fn_hr_es_festivo(integer, date, integer) from public, anon;
revoke execute on function public.fn_hr_festivos(integer, date, date, integer) from public, anon;
grant execute on function public.fn_hr_pascua(integer) to authenticated, service_role;
grant execute on function public.fn_hr_lunes_siguiente(date) to authenticated, service_role;
grant execute on function public.fn_hr_festivos_calcular(integer) to authenticated, service_role;
grant execute on function public.fn_hr_festivos_cargar(integer) to service_role;
grant execute on function public.fn_hr_es_festivo(integer, date, integer) to authenticated, service_role;
grant execute on function public.fn_hr_festivos(integer, date, date, integer) to authenticated, service_role;

select public.fn_hr_festivos_cargar(2026);
select public.fn_hr_festivos_cargar(2027);
