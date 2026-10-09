-- El estado de resultados (y el balance de prueba y el general) llaman
-- fn_saldos_cuentas. Era SECURITY INVOKER: cada asiento pasaba por la
-- política restrictiva app_branch_access y cada línea por la política de
-- journal_lines. Con el tope de 8 s de authenticated la sentencia se
-- cancelaba, PostgREST respondía 500 y la pantalla se quedaba en blanco.
--
-- Ahora corre como el dueño (postgres, que no aplica RLS). La pertenencia
-- la exige fn_assert_acceso_org. El alcance de sucursal es el mismo que
-- app_branch_access, evaluado una vez por sucursal: un asiento sin sucursal
-- sigue viéndose, y sin sesión (service_role) se ve la organización entera,
-- igual que cuando el rol de servicio no pasaba por RLS.
-- El índice deja el corte por organización y fecha en los asientos publicados.

create index if not exists idx_journal_entries_org_fecha
  on public.journal_entries (organization_id, entry_date)
  where posted;

analyze public.journal_entries;

create or replace function public.fn_saldos_cuentas(
  p_organization_id integer,
  p_desde timestamptz default null,
  p_hasta timestamptz default null
)
returns table (account_code text, debito numeric, credito numeric)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_sucursales integer[];
begin
  perform public.fn_assert_acceso_org(p_organization_id);

  if v_uid is not null then
    select coalesce(array_agg(b.id), '{}'::integer[])
      into v_sucursales
      from public.branches b
     where b.organization_id = p_organization_id
       and public.app_branch_access(b.id);
  end if;

  return query
  select jl.account_code::text,
         coalesce(sum(jl.debit), 0),
         coalesce(sum(jl.credit), 0)
    from public.journal_entries je
    join public.journal_lines jl on jl.journal_entry_id = je.id
   where je.organization_id = p_organization_id
     and je.posted
     and (p_desde is null or je.entry_date >= p_desde)
     and (p_hasta is null or je.entry_date <= p_hasta)
     and (
       v_uid is null
       or je.branch_id is null
       or je.branch_id = any (v_sucursales)
     )
   group by jl.account_code;
end;
$$;

revoke all on function public.fn_saldos_cuentas(integer, timestamptz, timestamptz) from public, anon;
grant execute on function public.fn_saldos_cuentas(integer, timestamptz, timestamptz) to authenticated, service_role;

comment on function public.fn_saldos_cuentas(integer, timestamptz, timestamptz) is
  'Débitos y créditos por cuenta de asientos publicados en el rango. Exige pertenencia a la organización y limita las sucursales con app_branch_access, una vez por sucursal.';
