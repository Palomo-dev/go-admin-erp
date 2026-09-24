-- ADR-CC-012 · Los informes contables suman en la base, no en el navegador
--
-- ReportesContablesService traía journal_lines sin paginar y sumaba en el
-- navegador. PostgREST corta en 1.000 filas, así que en cualquier organización
-- con más movimiento el balance de prueba, el estado de resultados y el
-- balance general salían con saldos truncados sin avisar (la org 144 tiene
-- 16.419 líneas). Esta función devuelve una fila por cuenta con débitos y
-- créditos de asientos publicados en el rango, calculada en la base.
--
-- SECURITY INVOKER: la lectura pasa por la RLS de journal_entries y
-- journal_lines, y además se exige pertenencia a la organización.

create or replace function public.fn_saldos_cuentas(
  p_organization_id integer,
  p_desde timestamptz default null,
  p_hasta timestamptz default null
)
returns table (account_code text, debito numeric, credito numeric)
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
begin
  perform public.fn_assert_acceso_org(p_organization_id);

  return query
  select jl.account_code::text, coalesce(sum(jl.debit), 0), coalesce(sum(jl.credit), 0)
    from public.journal_lines jl
    join public.journal_entries je on je.id = jl.journal_entry_id
   where je.organization_id = p_organization_id
     and coalesce(je.posted, false)
     and (p_desde is null or je.entry_date >= p_desde)
     and (p_hasta is null or je.entry_date <= p_hasta)
   group by jl.account_code;
end;
$$;

revoke all on function public.fn_saldos_cuentas(integer, timestamptz, timestamptz) from public, anon;
grant execute on function public.fn_saldos_cuentas(integer, timestamptz, timestamptz) to authenticated, service_role;
