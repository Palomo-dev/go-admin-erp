-- HRM fase 0 · paso 14: festivos con su fecha original y días propios de la
-- empresa por varias sedes y medio día (diseño 10.RH.1, Festivos).
-- Decisión del dueño del 2026-11-15: un día propio de la empresa se paga como
-- día ordinario, sin recargo festivo; queda marcado para revisión del Contador.
-- Por eso fn_hr_es_festivo ya NO cuenta los días propios: para eso está
-- fn_hr_es_dia_propio.

-- 1. Fecha original de los festivos trasladados -------------------------------------
alter table public.hr_holidays add column if not exists original_date date;
comment on column public.hr_holidays.original_date is 'Fecha de la celebración antes del traslado al lunes (Ley 51 de 1983). Igual a holiday_date si no se traslada.';

drop function if exists public.fn_hr_festivos_calcular(integer);
create function public.fn_hr_festivos_calcular(p_anio integer)
returns table (holiday_date date, name text, kind text, original_date date)
language sql immutable
set search_path = public, pg_temp
as $$
  with p as (select public.fn_hr_pascua(p_anio) as pascua),
  base (fecha, nombre, clase) as (
    select make_date(p_anio, 1, 1), 'Año Nuevo', 'fijo'
    union all select make_date(p_anio, 1, 6), 'Día de los Reyes Magos', 'trasladable'
    union all select make_date(p_anio, 3, 19), 'Día de San José', 'trasladable'
    union all select pascua - 3, 'Jueves Santo', 'pascua' from p
    union all select pascua - 2, 'Viernes Santo', 'pascua' from p
    union all select make_date(p_anio, 5, 1), 'Día del Trabajo', 'fijo'
    union all select pascua + 39, 'Ascensión del Señor', 'pascua_trasladable' from p
    union all select pascua + 60, 'Corpus Christi', 'pascua_trasladable' from p
    union all select pascua + 68, 'Sagrado Corazón de Jesús', 'pascua_trasladable' from p
    union all select make_date(p_anio, 6, 29), 'San Pedro y San Pablo', 'trasladable'
    union all select make_date(p_anio, 7, 20), 'Día de la Independencia', 'fijo'
    union all select make_date(p_anio, 8, 7), 'Batalla de Boyacá', 'fijo'
    union all select make_date(p_anio, 8, 15), 'La Asunción de la Virgen', 'trasladable'
    union all select make_date(p_anio, 10, 12), 'Día de la Raza', 'trasladable'
    union all select make_date(p_anio, 11, 1), 'Todos los Santos', 'trasladable'
    union all select make_date(p_anio, 11, 11), 'Independencia de Cartagena', 'trasladable'
    union all select make_date(p_anio, 12, 8), 'Día de la Inmaculada Concepción', 'fijo'
    union all select make_date(p_anio, 12, 25), 'Día de Navidad', 'fijo'
  )
  select case when clase in ('trasladable','pascua_trasladable') then public.fn_hr_lunes_siguiente(fecha) else fecha end,
         nombre, clase, fecha
    from base;
$$;
revoke execute on function public.fn_hr_festivos_calcular(integer) from public, anon;
grant execute on function public.fn_hr_festivos_calcular(integer) to authenticated, service_role;

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
  insert into public.hr_holidays (country_code, holiday_date, name, kind, legal_source, original_date)
  select 'COL', f.holiday_date, f.name, f.kind,
         case f.kind when 'fijo' then 'Ley 51 de 1983; Ley 37 de 1905'
                     when 'pascua' then 'Ley 51 de 1983; Ley 37 de 1905 (no se traslada)'
                     else 'Ley 51 de 1983 (se traslada al lunes siguiente)' end,
         f.original_date
    from public.fn_hr_festivos_calcular(p_anio) f
  on conflict (country_code, holiday_date) do update set original_date = excluded.original_date;
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke execute on function public.fn_hr_festivos_cargar(integer) from public, anon, authenticated;
grant execute on function public.fn_hr_festivos_cargar(integer) to service_role;

select public.fn_hr_festivos_cargar(2026);
select public.fn_hr_festivos_cargar(2027);

-- 2. Días propios: varias sedes, medio día y revisión del Contador ------------------
alter table public.hr_org_holidays add column if not exists branch_ids integer[];
alter table public.hr_org_holidays add column if not exists half_day boolean not null default false;
alter table public.hr_org_holidays add column if not exists half_day_from time;
alter table public.hr_org_holidays add column if not exists contador_review boolean not null default true;
comment on column public.hr_org_holidays.branch_ids is 'Sedes donde aplica; NULL = todas las sedes.';
comment on column public.hr_org_holidays.contador_review is 'Se paga como día ordinario, sin recargo festivo (decisión del dueño 2026-11-15); pendiente de revisión del Contador.';
-- La tabla nació el 2026-11-14 y está vacía: se cambia el índice único por uno por fecha.
drop index if exists public.hr_org_holidays_uq;
create unique index if not exists hr_org_holidays_fecha_uq on public.hr_org_holidays (organization_id, holiday_date);
alter table public.hr_org_holidays drop constraint if exists hr_org_holidays_medio_dia_chk;
alter table public.hr_org_holidays add constraint hr_org_holidays_medio_dia_chk check (not half_day or half_day_from is not null);

create or replace function public.fn_hr_org_festivo_validar()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if new.branch_id is not null then
    new.branch_ids := array(select distinct x from unnest(coalesce(new.branch_ids, '{}') || new.branch_id) x);
    new.branch_id := null;
  end if;
  if cardinality(new.branch_ids) = 0 then
    new.branch_ids := null;
  end if;
  if new.branch_ids is not null and exists (
       select 1 from unnest(new.branch_ids) x
        where not exists (select 1 from public.branches b where b.id = x and b.organization_id = new.organization_id)) then
    raise exception 'hr: una de las sedes es de otra organización' using errcode = '42501';
  end if;
  if not new.half_day then new.half_day_from := null; end if;
  if tg_op = 'INSERT' then new.created_by := coalesce(auth.uid(), new.created_by); end if;
  return new;
end;
$$;
revoke execute on function public.fn_hr_org_festivo_validar() from public, anon, authenticated;

-- 3. Festivo de ley (recargo) y día propio (ordinario), por separado ---------------
create or replace function public.fn_hr_es_festivo(p_org integer, p_fecha date, p_branch integer default null)
returns boolean
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
begin
  perform public.fn_assert_acceso_org(p_org);
  return exists (select 1 from public.hr_holidays h
                  where h.country_code = public.fn_hr_pais(p_org) and h.holiday_date = p_fecha);
end;
$$;

create or replace function public.fn_hr_es_dia_propio(p_org integer, p_fecha date, p_branch integer default null)
returns boolean
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
begin
  perform public.fn_assert_acceso_org(p_org);
  return exists (select 1 from public.hr_org_holidays o
                  where o.organization_id = p_org and o.holiday_date = p_fecha
                    and (o.branch_ids is null or p_branch = any (o.branch_ids)));
end;
$$;

drop function if exists public.fn_hr_festivos(integer, date, date, integer);
create function public.fn_hr_festivos(p_org integer, p_desde date, p_hasta date, p_branch integer default null)
returns table (id uuid, fecha date, nombre text, origen text, fecha_original date, medio_dia boolean,
               medio_dia_desde time, sedes integer[], revision_contador boolean)
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
begin
  perform public.fn_assert_acceso_org(p_org);
  return query
    select h.id, h.holiday_date, h.name, 'plataforma'::text, coalesce(h.original_date, h.holiday_date), false, null::time, null::integer[], false
      from public.hr_holidays h
     where h.country_code = public.fn_hr_pais(p_org) and h.holiday_date between p_desde and p_hasta
    union all
    select o.id, o.holiday_date, o.name, 'organizacion'::text, o.holiday_date, o.half_day, o.half_day_from, o.branch_ids, o.contador_review
      from public.hr_org_holidays o
     where o.organization_id = p_org and o.holiday_date between p_desde and p_hasta
       and (p_branch is null or o.branch_ids is null or p_branch = any (o.branch_ids))
    order by 2;
end;
$$;

revoke execute on function public.fn_hr_es_festivo(integer, date, integer) from public, anon;
revoke execute on function public.fn_hr_es_dia_propio(integer, date, integer) from public, anon;
revoke execute on function public.fn_hr_festivos(integer, date, date, integer) from public, anon;
grant execute on function public.fn_hr_es_festivo(integer, date, integer) to authenticated, service_role;
grant execute on function public.fn_hr_es_dia_propio(integer, date, integer) to authenticated, service_role;
grant execute on function public.fn_hr_festivos(integer, date, date, integer) to authenticated, service_role;
