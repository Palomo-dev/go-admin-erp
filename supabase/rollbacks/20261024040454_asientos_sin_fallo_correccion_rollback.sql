-- Quita la guarda que impide cabeceras vacías en la corrección de flujo
-- y el deduplicado de fn_log_journal_failure. No recrea borradores vacíos.

do $rb_corr$
declare
  v_src text;
  v_nuevo text;
  v_guardia text := $old$    -- corr_sin_lineas: sin pesos no hay cabecera.
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
      returning id into v_entry;$old$;
  v_ancla text := $new$    if v_entry is null then
      insert into public.journal_entries (
        organization_id, branch_id, entry_date, memo, source, source_id, posted, fact_key
      ) values (
        v_org, v_branch, v_fecha, v_memo, 'manual', v_org::text, false, v_key
      )
      returning id into v_entry;$new$;
  v_cierre text := $old$    if not exists (
      select 1 from public.journal_lines
      where journal_entry_id = v_entry
        and (coalesce(debit, 0) <> 0 or coalesce(credit, 0) <> 0)
    ) then
      delete from public.journal_lines where journal_entry_id = v_entry;
      delete from public.journal_entries where id = v_entry and posted is false;
      insert into pg_temp._corr_estado values (v_org, v_grupo, 'sin_movimiento', null);
      continue;
    end if;

    insert into pg_temp._corr_estado values (v_org, v_grupo, null, v_entry);$old$;
  v_estado text := $new$    insert into pg_temp._corr_estado values (v_org, v_grupo, null, v_entry);$new$;
begin
  select p.prosrc into v_src
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'fn_correccion_flujo_borradores';
  if position('corr_sin_lineas' in v_src) = 0 then
    return;
  end if;
  if position(v_guardia in v_src) = 0 or position(v_cierre in v_src) = 0 then
    raise exception 'no está la guarda de fn_correccion_flujo_borradores';
  end if;
  v_nuevo := replace(v_src, v_guardia, v_ancla);
  v_nuevo := replace(v_nuevo, v_cierre, v_estado);
  if position('corr_sin_lineas' in v_nuevo) > 0 then
    raise exception 'no se pudo quitar la guarda de cabeceras vacías';
  end if;
  execute 'create or replace function public.fn_correccion_flujo_borradores() returns jsonb language plpgsql security definer set search_path to public, pg_temp as $fn$'
    || v_nuevo || '$fn$';
end;
$rb_corr$;

revoke all on function public.fn_correccion_flujo_borradores() from public, anon, authenticated;
grant execute on function public.fn_correccion_flujo_borradores() to service_role;

create or replace function public.fn_log_journal_failure(
  p_organization_id integer,
  p_branch_id integer,
  p_entry_date timestamptz,
  p_source text,
  p_source_id text,
  p_fact_key text,
  p_debit_account text,
  p_credit_account text,
  p_amount numeric,
  p_reason text,
  p_detail text
)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
BEGIN
    INSERT INTO journal_entry_failures (
        organization_id, branch_id, entry_date, source, source_id, fact_key,
        debit_account, credit_account, amount, reason, detail
    ) VALUES (
        p_organization_id, p_branch_id, p_entry_date, p_source, p_source_id, p_fact_key,
        p_debit_account, p_credit_account, p_amount, p_reason, p_detail
    );
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'No se pudo registrar el rechazo contable (%): %', p_reason, SQLERRM;
END;
$function$;

revoke all on function public.fn_log_journal_failure(
  integer, integer, timestamptz, text, text, text, text, text, numeric, text, text
) from public, anon, authenticated;
grant execute on function public.fn_log_journal_failure(
  integer, integer, timestamptz, text, text, text, text, text, numeric, text, text
) to service_role;
