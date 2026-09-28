-- Tasas de comisión por vendedor · escritura por servidor con permiso de gestión (2026-09-28).
--
-- Hallazgos verificados por MCP:
--   - vendor_commission_rates tiene (id, organization_id, salesperson_id, rate,
--     valid_from date, valid_to date, created_at). El panel Configuración › CRM ›
--     Vendedores y comisiones y commissionService.ts usaban valid_until,
--     updated_at y salesperson_name, que NO existen: toda lectura y escritura
--     fallaba y getVendorRate tragaba el error y devolvía 0. La tabla tiene 0
--     filas: nadie pudo guardar nunca una tasa.
--   - La política vendor_commission_rates_org_member_all (ALL) y los GRANT de
--     anon/authenticated dejaban que cualquier miembro —o anon con la clave
--     pública, frenado solo por la política— escribiera tasas.
--
-- Qué hace:
--   1. fn_tasa_comision_vigente (INVOKER, con RLS): tasa vigente HOY en el día de
--      la organización (fn_today_for_org): la del vendedor y, si no hay, la
--      general. Una sola resolución para el navegador y el servidor.
--   2. fn_tasa_comision_guardar / fn_tasa_comision_eliminar (DEFINER): exigen
--      sesión, pertenencia y rol de gestión (admin 1/2, manager 5, superadmin) o
--      el permiso finance.approve; tasa 0–100; vendedor miembro de la
--      organización; vigencia coherente. Una tasa general por organización y una
--      por vendedor (se actualiza la existente).
--   3. authenticated conserva solo SELECT; anon pierde todo.

-- ── 1. Tasa vigente ─────────────────────────────────────────────────────────
create or replace function public.fn_tasa_comision_vigente(
  p_org integer, p_salesperson uuid default null, p_incluir_general boolean default true)
returns numeric
language sql
stable
security invoker
set search_path to 'public', 'pg_temp'
as $function$
  with hoy as (select public.fn_today_for_org(p_org) as d)
  select coalesce(
    (select r.rate from public.vendor_commission_rates r, hoy
      where p_salesperson is not null and r.organization_id = p_org and r.salesperson_id = p_salesperson
        and r.valid_from <= hoy.d and (r.valid_to is null or r.valid_to >= hoy.d)
      order by r.valid_from desc, r.created_at desc limit 1),
    (select r.rate from public.vendor_commission_rates r, hoy
      where p_incluir_general and r.organization_id = p_org and r.salesperson_id is null
        and r.valid_from <= hoy.d and (r.valid_to is null or r.valid_to >= hoy.d)
      order by r.valid_from desc, r.created_at desc limit 1),
    0)::numeric;
$function$;

revoke all on function public.fn_tasa_comision_vigente(integer, uuid, boolean) from public, anon;
grant execute on function public.fn_tasa_comision_vigente(integer, uuid, boolean) to authenticated, service_role;

-- ── 2. Guarda de gestión ────────────────────────────────────────────────────
create or replace function public.fn_tasa_comision_exigir_gestion(p_org integer)
returns void
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  if auth.uid() is null then
    raise exception 'no_autenticado' using errcode = '42501';
  end if;
  if exists (select 1 from public.organization_members om
              where om.user_id = auth.uid() and om.organization_id = p_org and om.is_active
                and (coalesce(om.is_super_admin, false) or om.role_id in (1, 2, 5))) then
    return;
  end if;
  perform public.fn_finanzas_exigir_permiso(p_org, array['finance.approve']);
end;
$function$;

revoke all on function public.fn_tasa_comision_exigir_gestion(integer) from public, anon, authenticated;

-- ── 3. Guardar ──────────────────────────────────────────────────────────────
create or replace function public.fn_tasa_comision_guardar(
  p_org integer, p_salesperson uuid, p_rate numeric,
  p_valid_from date default null, p_valid_to date default null, p_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_row public.vendor_commission_rates%rowtype;
  v_id  uuid;
begin
  perform public.fn_tasa_comision_exigir_gestion(p_org);
  if p_rate is null or p_rate < 0 or p_rate > 100 then
    raise exception 'tasa_invalida' using errcode = '22023', hint = 'La tasa es un porcentaje entre 0 y 100.';
  end if;
  if p_valid_from is not null and p_valid_to is not null and p_valid_to < p_valid_from then
    raise exception 'vigencia_invalida' using errcode = '22023';
  end if;
  if p_salesperson is not null and not exists (
      select 1 from public.organization_members om
       where om.organization_id = p_org and om.user_id = p_salesperson) then
    raise exception 'vendedor_invalido' using errcode = '22023';
  end if;

  if p_id is not null then
    select id into v_id from public.vendor_commission_rates
     where id = p_id and organization_id = p_org for update;
    if v_id is null then
      raise exception 'tasa_no_encontrada' using errcode = 'P0002';
    end if;
  else
    -- Una por vendedor (o una general): se actualiza la existente.
    select id into v_id from public.vendor_commission_rates
     where organization_id = p_org and salesperson_id is not distinct from p_salesperson
     order by created_at desc limit 1 for update;
  end if;

  if v_id is null then
    insert into public.vendor_commission_rates (organization_id, salesperson_id, rate, valid_from, valid_to)
    values (p_org, p_salesperson, p_rate, p_valid_from, p_valid_to)
    returning * into v_row;
  else
    update public.vendor_commission_rates
       set salesperson_id = p_salesperson, rate = p_rate,
           valid_from = coalesce(p_valid_from, valid_from), valid_to = p_valid_to
     where id = v_id and organization_id = p_org
    returning * into v_row;
  end if;
  return to_jsonb(v_row);
end;
$function$;

revoke all on function public.fn_tasa_comision_guardar(integer, uuid, numeric, date, date, uuid) from public, anon;
grant execute on function public.fn_tasa_comision_guardar(integer, uuid, numeric, date, date, uuid) to authenticated, service_role;

-- ── 4. Eliminar ─────────────────────────────────────────────────────────────
create or replace function public.fn_tasa_comision_eliminar(p_org integer, p_id uuid)
returns boolean
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_n integer;
begin
  perform public.fn_tasa_comision_exigir_gestion(p_org);
  delete from public.vendor_commission_rates where id = p_id and organization_id = p_org;
  get diagnostics v_n = row_count;
  return v_n > 0;
end;
$function$;

revoke all on function public.fn_tasa_comision_eliminar(integer, uuid) from public, anon;
grant execute on function public.fn_tasa_comision_eliminar(integer, uuid) to authenticated, service_role;

-- ── 5. La API solo lee ──────────────────────────────────────────────────────
revoke all on table public.vendor_commission_rates from anon;
revoke insert, update, delete, truncate, references, trigger on table public.vendor_commission_rates from authenticated;
