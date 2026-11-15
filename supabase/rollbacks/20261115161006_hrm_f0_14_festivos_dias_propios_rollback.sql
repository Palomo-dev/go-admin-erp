-- Revierte HRM fase 0 · paso 14. Devuelve las funciones a su versión anterior
-- (copiada de la migración que la creó).
-- ADVERTENCIA: borra los días propios con varias sedes o medio día (no caben en el modelo anterior) y la fecha original de los festivos.

drop function if exists public.fn_hr_es_dia_propio(integer, date, integer);
drop function if exists public.fn_hr_festivos(integer, date, date, integer);
drop function if exists public.fn_hr_festivos_calcular(integer);
create function public.fn_hr_festivos_calcular(p_anio integer)
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

create function public.fn_hr_festivos(p_org integer, p_desde date, p_hasta date, p_branch integer default null)
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
revoke execute on function public.fn_hr_festivos_calcular(integer) from public, anon;
grant execute on function public.fn_hr_festivos_calcular(integer) to authenticated, service_role;
revoke execute on function public.fn_hr_festivos(integer, date, date, integer) from public, anon;
grant execute on function public.fn_hr_festivos(integer, date, date, integer) to authenticated, service_role;

delete from public.hr_org_holidays where half_day or cardinality(branch_ids) > 1;
update public.hr_org_holidays set branch_id = branch_ids[1] where cardinality(branch_ids) = 1;
drop index if exists public.hr_org_holidays_fecha_uq;
create unique index if not exists hr_org_holidays_uq on public.hr_org_holidays (organization_id, coalesce(branch_id, 0), holiday_date);
alter table public.hr_org_holidays drop constraint if exists hr_org_holidays_medio_dia_chk;
alter table public.hr_org_holidays drop column if exists contador_review;
alter table public.hr_org_holidays drop column if exists half_day_from;
alter table public.hr_org_holidays drop column if exists half_day;
alter table public.hr_org_holidays drop column if exists branch_ids;
alter table public.hr_holidays drop column if exists original_date;
