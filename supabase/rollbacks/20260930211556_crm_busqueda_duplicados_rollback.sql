-- Conserva los resultados y exclusiones para auditoría; no restaura fusiones.
drop function if exists public.crm_start_duplicate_scan(integer);
drop function if exists public.crm_exclude_customer_pair(integer,uuid,uuid);
drop function if exists public.crm_find_duplicates(integer);
do $$ begin
  if to_regclass('public.customer_duplicate_scans') is not null then
    revoke all on public.customer_duplicate_scans from authenticated;
    drop policy if exists crm_duplicate_scans_read on public.customer_duplicate_scans;
  end if;
  if to_regclass('public.customer_merge_exclusions') is not null then
    revoke all on public.customer_merge_exclusions from authenticated;
    drop policy if exists crm_merge_exclusions_read on public.customer_merge_exclusions;
  end if;
end $$;
