-- Rollback de 20260928150534_gosec_catalogo_tasas_solo_plataforma.
-- Devuelve las políticas de escritura y los EXECUTE tal como estaban el
-- 2026-09-28 (pg_policies / pg_proc.proacl antes de aplicar). OJO: reabre la
-- escritura del catálogo GLOBAL a usuarios de cualquier organización y a anon
-- en las funciones invoker. No restaura datos.

create policy currency_rates_insert_policy on public.currency_rates
  for insert to authenticated
  with check (auth.uid() in (select organization_members.user_id from organization_members
                              where organization_members.role_id = any (array[2, 2, 22])));
create policy currency_rates_update_policy on public.currency_rates
  for all to public
  using (auth.uid() in (select organization_members.user_id from organization_members
                         where organization_members.role_id = 2));

grant select, insert, update, delete, truncate on table public.currency_rates to anon, authenticated;

do $$
declare
  f text;
begin
  -- Invoker con EXECUTE para PUBLIC, anon y authenticated.
  foreach f in array array[
    'public.update_global_exchange_rates(jsonb, text, bigint, text, text)',
    'public.insert_fallback_rates()',
    'public.auto_generate_missing_rates()'
  ] loop
    execute format('grant execute on function %s to public, anon, authenticated, service_role', f);
  end loop;
  -- Invoker con EXECUTE solo por PUBLIC (y service_role).
  foreach f in array array[
    'public.fill_missing_currency_dates()',
    'public.fill_historical_rates_real_api()'
  ] loop
    execute format('grant execute on function %s to public, service_role', f);
  end loop;
  -- SECURITY DEFINER con EXECUTE para authenticated y service_role.
  foreach f in array array[
    'public.save_exchange_rates(integer, uuid, jsonb, text)',
    'public.save_exchange_rates(integer, uuid, jsonb, text, bigint)',
    'public.save_exchange_rates(integer, uuid, jsonb, text, bigint, date)',
    'public.save_exchange_rates(integer, uuid, jsonb, text, bigint, date, text)',
    'public.save_exchange_rates(jsonb, date, text, bigint, text)',
    'public.save_global_exchange_rates(jsonb, text, bigint, date, text)',
    'public.update_all_exchange_rates()',
    'public.update_all_exchange_rates(jsonb, text, bigint, date)',
    'public.update_all_exchange_rates_with_api(jsonb, text, bigint, date)',
    'public.generate_missing_currencies()',
    'public.auto_update_exchange_rates()',
    'public.log_exchange_rates_execution(timestamp with time zone, boolean, text, integer, integer, integer, jsonb)',
    'public.update_exchange_rates(integer)'
  ] loop
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;
