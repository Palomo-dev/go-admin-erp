-- Rollback de 20261103213008: vuelve a la definición de 20261025134095 (CURRENT_DATE).
create or replace function public.fn_comision_vinculo(p_org integer, p_payee_type text, p_payee_id uuid)
returns text language sql stable security definer set search_path to 'public', 'pg_temp' as $$
  select case
    when p_payee_type in ('supplier', 'third_party') then 'externo'
    else coalesce((select v.vinculo from public.vendor_commission_rates v
                    where v.organization_id = p_org and v.salesperson_id = p_payee_id
                    order by (current_date between v.valid_from and coalesce(v.valid_to, 'infinity'::date)) desc,
                             v.valid_from desc nulls last
                    limit 1), 'empleado')
  end
$$;
