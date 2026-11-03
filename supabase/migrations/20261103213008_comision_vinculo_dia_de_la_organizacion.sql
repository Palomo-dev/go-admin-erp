-- fn_comision_vinculo elegía la tarifa vigente con CURRENT_DATE (día UTC):
-- entre las 19:00 y las 24:00 de Bogotá ya era «mañana». Ahora usa el día de
-- la zona de la organización (fn_today_for_org). Es la única función que el
-- inventario de CURRENT_DATE (ADR-004/ADR-005) encontraba en el proyecto nuevo.
create or replace function public.fn_comision_vinculo(p_org integer, p_payee_type text, p_payee_id uuid)
returns text language sql stable security definer set search_path to 'public', 'pg_temp' as $$
  select case
    when p_payee_type in ('supplier', 'third_party') then 'externo'
    else coalesce((select v.vinculo from public.vendor_commission_rates v
                    where v.organization_id = p_org and v.salesperson_id = p_payee_id
                    order by (public.fn_today_for_org(p_org) between v.valid_from and coalesce(v.valid_to, 'infinity'::date)) desc,
                             v.valid_from desc nulls last
                    limit 1), 'empleado')
  end
$$;
