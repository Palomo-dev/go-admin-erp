-- Auxiliar por tercero con saldo corrido: saldo inicial (antes de p_desde) por tercero y cuenta,
-- y cada movimiento del periodo con su saldo acumulado. Saldo según la naturaleza de la cuenta
-- (clases 1, 5, 6, 7: débito − crédito; 2, 3, 4: crédito − débito). Solo lectura.
create or replace function public.fn_auxiliar_tercero_detalle(
  p_organization_id integer,
  p_desde timestamptz,
  p_hasta timestamptz,
  p_cuenta text default null,
  p_tercero text default null,
  p_limite integer default 2000
)
returns table(
  tercero_nit text, tercero_nombre text, account_code text,
  journal_entry_id bigint, entry_date timestamptz, memo text,
  debit numeric, credit numeric, saldo_inicial numeric, saldo_corrido numeric
)
language plpgsql stable security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_limite integer := least(greatest(coalesce(p_limite, 2000), 1), 5000);
  v_cuenta text := nullif(trim(coalesce(p_cuenta, '')), '');
  v_tercero text := nullif(trim(coalesce(p_tercero, '')), '');
begin
  perform public.fn_assert_acceso_org(p_organization_id);
  return query
  with base as (
    select coalesce(jl.tercero_nit, '') as nit, jl.tercero_nombre as nombre, jl.account_code as cuenta,
           jl.journal_entry_id::bigint as asiento, je.entry_date as fecha, coalesce(jl.description, je.memo) as detalle,
           coalesce(jl.debit, 0) as deb, coalesce(jl.credit, 0) as cre, jl.id as linea,
           case when left(jl.account_code, 1) in ('1', '5', '6', '7') then 1 else -1 end as signo
      from public.journal_lines jl
      join public.journal_entries je on je.id = jl.journal_entry_id and je.organization_id = p_organization_id
     where jl.organization_id = p_organization_id
       and je.posted is true
       and je.entry_date <= p_hasta
       and (v_cuenta is null or jl.account_code like v_cuenta || '%')
       and (v_tercero is null or jl.tercero_nit = v_tercero or jl.tercero_nombre ilike '%' || v_tercero || '%')
  ), inicial as (
    select b.nit, b.cuenta, sum((b.deb - b.cre) * b.signo) as saldo
      from base b where b.fecha < p_desde group by b.nit, b.cuenta
  ), periodo as (
    select b.*, coalesce(i.saldo, 0) as ini
      from base b left join inicial i on i.nit = b.nit and i.cuenta = b.cuenta
     where b.fecha >= p_desde
  )
  select p.nit, coalesce(max(p.nombre) over (partition by p.nit), ''), p.cuenta, p.asiento, p.fecha, p.detalle,
         p.deb, p.cre, p.ini,
         p.ini + sum((p.deb - p.cre) * p.signo) over (partition by p.nit, p.cuenta order by p.fecha, p.linea
                                                       rows between unbounded preceding and current row)
    from periodo p
   order by p.nit, p.cuenta, p.fecha, p.linea
   limit v_limite;
end;
$$;

revoke all on function public.fn_auxiliar_tercero_detalle(integer, timestamptz, timestamptz, text, text, integer) from public, anon;
grant execute on function public.fn_auxiliar_tercero_detalle(integer, timestamptz, timestamptz, text, text, integer) to authenticated;
