do $patch_corr$
declare
  v_src text;
  v_nuevo text;
  v_ancla text := $old$    if v_entry is null then
      insert into public.journal_entries (
        organization_id, branch_id, entry_date, memo, source, source_id, posted, fact_key
      ) values (
        v_org, v_branch, v_fecha, v_memo, 'manual', v_org::text, false, v_key
      )
      returning id into v_entry;$old$;
  v_estado text := $old$    insert into pg_temp._corr_estado values (v_org, v_grupo, null, v_entry);$old$;
begin
  select p.prosrc into v_src
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'fn_correccion_flujo_borradores';
  if position('corr_sin_lineas' in v_src) > 0 then
    return;
  end if;
  if position(v_ancla in v_src) = 0 or position(v_estado in v_src) = 0 then
    raise exception 'no está la cabecera de fn_correccion_flujo_borradores';
  end if;
  v_nuevo := replace(v_src, v_ancla, $new$    -- corr_sin_lineas: sin pesos no hay cabecera.
    if not exists (
      select 1 from pg_temp._corr_neta n
      where n.organization_id = v_org
        and n.grupo = v_grupo
        and (round(coalesce(n.debito, 0), 0) >= 1 or round(coalesce(n.credito, 0), 0) >= 1)
    ) then
      if v_entry is not null and v_posted is not true then
        delete from public.journal_lines where journal_entry_id = v_entry;
        delete from public.journal_entries where id = v_entry and posted is false;
      end if;
      insert into pg_temp._corr_estado values (v_org, v_grupo, 'sin_movimiento', null);
      continue;
    end if;

    if v_entry is null then
      insert into public.journal_entries (
        organization_id, branch_id, entry_date, memo, source, source_id, posted, fact_key
      ) values (
        v_org, v_branch, v_fecha, v_memo, 'manual', v_org::text, false, v_key
      )
      returning id into v_entry;$new$);
  v_nuevo := replace(v_nuevo, v_estado, $new$    if not exists (
      select 1 from public.journal_lines
      where journal_entry_id = v_entry
        and (coalesce(debit, 0) <> 0 or coalesce(credit, 0) <> 0)
    ) then
      delete from public.journal_lines where journal_entry_id = v_entry;
      delete from public.journal_entries where id = v_entry and posted is false;
      insert into pg_temp._corr_estado values (v_org, v_grupo, 'sin_movimiento', null);
      continue;
    end if;

    insert into pg_temp._corr_estado values (v_org, v_grupo, null, v_entry);$new$);
  if position('corr_sin_lineas' in v_nuevo) = 0 then
    raise exception 'no se pudo proteger fn_correccion_flujo_borradores';
  end if;
  execute 'create or replace function public.fn_correccion_flujo_borradores() returns jsonb language plpgsql security definer set search_path to public, pg_temp as $fn$'
    || v_nuevo || '$fn$';
end;
$patch_corr$;

revoke all on function public.fn_correccion_flujo_borradores() from public, anon, authenticated;
grant execute on function public.fn_correccion_flujo_borradores() to service_role;

create or replace function public.fn_log_journal_failure(
  p_organization_id integer,
  p_branch_id integer,
  p_entry_date timestamp with time zone,
  p_source text,
  p_source_id text,
  p_fact_key text,
  p_debit_account text,
  p_credit_account text,
  p_amount numeric,
  p_reason text,
  p_detail text
) returns void
language plpgsql
security definer
set search_path to public, pg_temp
as $fn$
begin
  if p_fact_key is not null and exists (
    select 1
      from public.journal_entry_failures f
     where f.organization_id is not distinct from p_organization_id
       and f.fact_key = p_fact_key
       and f.reason = p_reason
       and f.resolved_at is null
  ) then
    update public.journal_entry_failures f
       set detail = p_detail,
           amount = p_amount,
           debit_account = p_debit_account,
           credit_account = p_credit_account,
           entry_date = p_entry_date,
           source = p_source,
           source_id = p_source_id,
           branch_id = p_branch_id
     where f.organization_id is not distinct from p_organization_id
       and f.fact_key = p_fact_key
       and f.reason = p_reason
       and f.resolved_at is null;
    return;
  end if;

  insert into public.journal_entry_failures (
    organization_id, branch_id, entry_date, source, source_id, fact_key,
    debit_account, credit_account, amount, reason, detail
  ) values (
    p_organization_id, p_branch_id, p_entry_date, p_source, p_source_id, p_fact_key,
    p_debit_account, p_credit_account, p_amount, p_reason, p_detail
  );
exception when others then
  raise notice 'No se pudo registrar el rechazo contable (%): %', p_reason, sqlerrm;
end;
$fn$;

revoke all on function public.fn_log_journal_failure(integer, integer, timestamp with time zone, text, text, text, text, text, numeric, text, text) from public, anon;
grant execute on function public.fn_log_journal_failure(integer, integer, timestamp with time zone, text, text, text, text, text, numeric, text, text) to service_role;
