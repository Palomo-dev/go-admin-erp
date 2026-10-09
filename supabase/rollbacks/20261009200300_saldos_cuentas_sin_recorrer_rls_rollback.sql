-- Vuelve fn_saldos_cuentas a SECURITY INVOKER, como en
-- 20260924030912_saldos_de_cuentas_en_la_base.sql, y quita el índice de fecha.
-- No modifica filas.

drop index if exists public.idx_journal_entries_org_fecha;

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

comment on function public.fn_saldos_cuentas(integer, timestamptz, timestamptz) is null;
