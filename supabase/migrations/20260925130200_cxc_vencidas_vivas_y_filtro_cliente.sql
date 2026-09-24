-- Cuentas por cobrar (POS y Finanzas): dos fallos verificados el 2026-09-23
-- (docs/design/POS-PARIDAD-PAGINAS-SECUNDARIAS.md §2.6 y hallazgo B5).
--
-- 1. El filtro «Cliente» es un campo de texto («Nombre del cliente») que el
--    servicio mandaba a `customer_id_filter uuid` → 22P02 «invalid input
--    syntax for type uuid» y la consulta entera fallaba. Nuevo parámetro
--    `customer_search text` (nombre o razón social); `customer_id_filter` se
--    queda para cuando llegue el selector de cliente del diseño.
--
-- 2. Vencidas invisibles. El estado `overdue` solo lo pone el disparador
--    `calculate_days_overdue` (BEFORE UPDATE) y únicamente desde `current`:
--    una cuenta con abono (`partial`) nunca pasa a vencida, y como no hay cron
--    (C-2) `days_overdue` solo se recalcula cuando algo toca la fila. Conteo a
--    2026-09-23: 57 `partial` con vencimiento pasado y saldo > 0 fuera de
--    «Vencidas», 204 `current` vencidas sin marcar y 476 filas con
--    `days_overdue` desactualizado.
--
--    Arreglo SIN escribir `accounts_receivable` (la cartera la mantienen los
--    disparadores de pagos y facturas): el estado vencido se deriva al leer.
--    `fn_cxc_estado_vivo(org)` devuelve, por cuenta, los días vencidos de hoy
--    (día de la sucursal o de la organización, `fn_timezone_for`) y el estado
--    efectivo:
--      - saldo > 0 y vencimiento anterior a hoy → `overdue` (también `partial`)
--      - `overdue` guardado pero ya no vencida → `partial` o `current`
--      - lo demás, el estado guardado.
--    La usan el listado paginado (filtro de estado, aging y días) y las
--    estadísticas (KPI «Vencidas»). `status` y `days_overdue` guardados no se
--    tocan; el listado añade `status_efectivo` y `dias_vencida`.
--
-- `get_accounts_receivable_paginated` cambia de firma (+ `customer_search`):
-- se elimina la de 10 argumentos y se crea la de 11 con los mismos permisos.
-- La de 9 argumentos (sin sucursal) no tiene llamadores y queda igual.

create or replace function public.fn_cxc_estado_vivo(p_org integer)
returns table(account_id uuid, dias_vencida integer, estado_efectivo text)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.fn_assert_acceso_org(p_org);
  return query
  with zonas as (
    select x.branch_id, public.fn_timezone_for(p_org, x.branch_id) as tz
      from (select distinct a.branch_id from public.accounts_receivable a where a.organization_id = p_org) x
  ),
  dias as (
    select ar.id, ar.status, coalesce(ar.balance, 0) as balance, coalesce(ar.amount, 0) as amount,
           case
             when coalesce(ar.balance, 0) > 0 and ar.due_date is not null
                  and (ar.due_date at time zone z.tz)::date < (now() at time zone z.tz)::date
               then ((now() at time zone z.tz)::date - (ar.due_date at time zone z.tz)::date)
             else 0
           end::integer as dias
      from public.accounts_receivable ar
      left join zonas z on z.branch_id is not distinct from ar.branch_id
     where ar.organization_id = p_org
  )
  select d.id,
         d.dias,
         case
           when d.dias > 0 then 'overdue'
           when d.status = 'overdue' and d.balance > 0 and d.balance < d.amount then 'partial'
           when d.status = 'overdue' and d.balance > 0 then 'current'
           else d.status
         end
    from dias d;
end;
$$;

comment on function public.fn_cxc_estado_vivo(integer) is
  'Estado de cartera derivado al leer: días vencidos de hoy (zona de la sucursal/organización) y estado efectivo (saldo > 0 y vencida → overdue, también las parciales). No escribe accounts_receivable.';

revoke all on function public.fn_cxc_estado_vivo(integer) from public, anon;
grant execute on function public.fn_cxc_estado_vivo(integer) to authenticated, service_role;

drop function if exists public.get_accounts_receivable_paginated(integer, text, text, text, uuid, date, date, integer, integer, integer);

create or replace function public.get_accounts_receivable_paginated(
  org_id integer,
  search_term text default null,
  status_filter text default 'todos',
  aging_filter text default 'todos',
  customer_id_filter uuid default null,
  date_from date default null,
  date_to date default null,
  page_size integer default 10,
  page_number integer default 1,
  branch_id_filter integer default null,
  customer_search text default null
)
returns json
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  offset_value integer;
  result_data json;
  v_cliente text := nullif(lower(btrim(coalesce(customer_search, ''))), '');
begin
  perform public.fn_assert_acceso_org(org_id::integer);
  offset_value := (greatest(page_number, 1) - 1) * page_size;

  with filtered_accounts as (
    select
      ar.*,
      c.full_name as customer_name,
      c.email as customer_email,
      c.phone as customer_phone,
      inv.number as invoice_number,
      v.estado_efectivo as status_efectivo,
      v.dias_vencida
    from accounts_receivable ar
    join public.fn_cxc_estado_vivo(org_id) v on v.account_id = ar.id
    left join customers c on ar.customer_id = c.id
    left join invoice_sales inv on ar.invoice_id = inv.id
    where ar.organization_id = org_id
      -- Filtro por sucursal (NULL = consolidado organización)
      and (branch_id_filter is null or ar.branch_id = branch_id_filter)
      -- Filtro por búsqueda
      and (
        search_term is null or
        lower(c.full_name) like lower('%' || search_term || '%') or
        lower(c.email) like lower('%' || search_term || '%') or
        lower(c.phone) like lower('%' || search_term || '%') or
        lower(inv.number) like lower('%' || search_term || '%')
      )
      -- Filtro por estado: el efectivo (una parcial vencida es «Vencida»)
      and (status_filter = 'todos' or v.estado_efectivo = status_filter)
      -- Filtro por cliente: id (selector) o texto (nombre o razón social)
      and (customer_id_filter is null or ar.customer_id = customer_id_filter)
      and (v_cliente is null
           or lower(coalesce(c.full_name, '')) like '%' || v_cliente || '%'
           or lower(coalesce(c.company_name, '')) like '%' || v_cliente || '%')
      -- Filtro por fechas
      and (date_from is null or ar.created_at::date >= date_from)
      and (date_to is null or ar.created_at::date <= date_to)
      -- Filtro por aging: días vencidos de hoy, no el valor guardado
      and (
        aging_filter = 'todos' or
        (aging_filter = '0-30' and v.dias_vencida >= 0 and v.dias_vencida <= 30) or
        (aging_filter = '31-60' and v.dias_vencida > 30 and v.dias_vencida <= 60) or
        (aging_filter = '61-90' and v.dias_vencida > 60 and v.dias_vencida <= 90) or
        (aging_filter = '90+' and v.dias_vencida > 90)
      )
  ),
  total_count_calc as (
    select count(*) as total_count from filtered_accounts
  ),
  paginated_results as (
    select * from filtered_accounts
    order by created_at desc
    limit page_size
    offset offset_value
  )
  select json_build_object(
    'data', coalesce((select json_agg(pr order by pr.created_at desc) from paginated_results pr), '[]'::json),
    'total_count', (select total_count from total_count_calc),
    'page_size', page_size,
    'page_number', page_number,
    'total_pages', ceil((select total_count from total_count_calc)::decimal / page_size)
  )
  into result_data;

  return result_data;
end;
$$;

revoke all on function public.get_accounts_receivable_paginated(integer, text, text, text, uuid, date, date, integer, integer, integer, text) from public, anon;
grant execute on function public.get_accounts_receivable_paginated(integer, text, text, text, uuid, date, date, integer, integer, integer, text) to authenticated, service_role;

create or replace function public.get_accounts_receivable_stats(org_id integer, branch_id_filter integer default null)
returns table(total_cuentas integer, total_amount numeric, total_balance numeric, current_amount numeric, overdue_amount numeric, paid_amount numeric, partial_amount numeric, promedio_dias_cobro numeric)
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  perform public.fn_assert_acceso_org(org_id::integer);
  return query
  select
    count(*)::integer as total_cuentas,
    sum(abs(ar.amount))::numeric as total_amount,
    sum(case when ar.balance > 0 then ar.balance else 0 end)::numeric as total_balance,
    sum(case when v.estado_efectivo = 'current' and ar.balance > 0 then ar.balance else 0 end)::numeric as current_amount,
    sum(case when v.estado_efectivo = 'overdue' and ar.balance > 0 then ar.balance else 0 end)::numeric as overdue_amount,
    sum(case when v.estado_efectivo = 'paid' then abs(ar.amount) else 0 end)::numeric as paid_amount,
    sum(case when v.estado_efectivo = 'partial' and ar.balance > 0 then ar.balance else 0 end)::numeric as partial_amount,
    case
      when count(case when v.dias_vencida > 0 then 1 end) > 0
      then avg(case when v.dias_vencida > 0 then v.dias_vencida end)::numeric
      else 0
    end as promedio_dias_cobro
  from accounts_receivable ar
  join public.fn_cxc_estado_vivo(org_id) v on v.account_id = ar.id
  where ar.organization_id = org_id
    and (branch_id_filter is null or ar.branch_id = branch_id_filter);
end;
$$;

revoke all on function public.get_accounts_receivable_stats(integer, integer) from public, anon;
grant execute on function public.get_accounts_receivable_stats(integer, integer) to authenticated, service_role;
