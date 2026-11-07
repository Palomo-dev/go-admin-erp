-- Reversión de 20261107180000_finanzas_tasa_manual.
-- Restaura la estructura. Advertencia: quitar `created_by` y `reason` borra el
-- autor y el motivo de las tasas manuales registradas mientras estuvo aplicada;
-- las tasas en sí (rate, effective_date) se conservan.

-- 3. Las políticas de escritura de miembros, tal como estaban (pg_policies, 2026-11-07).
drop policy if exists exchange_rates_insert_org on public.exchange_rates;
create policy exchange_rates_insert_org on public.exchange_rates
  as permissive for insert to authenticated
  with check (organization_id in (select om.organization_id from public.organization_members om where om.user_id = auth.uid()));

drop policy if exists exchange_rates_update_org on public.exchange_rates;
create policy exchange_rates_update_org on public.exchange_rates
  as permissive for update to authenticated
  using (organization_id in (select om.organization_id from public.organization_members om where om.user_id = auth.uid()));

drop policy if exists exchange_rates_delete_org on public.exchange_rates;
create policy exchange_rates_delete_org on public.exchange_rates
  as permissive for delete to authenticated
  using (organization_id in (select om.organization_id from public.organization_members om where om.user_id = auth.uid()));

-- 2. La RPC.
drop function if exists public.fn_finanzas_registrar_tasa_manual(integer, text, date, numeric, text);

-- 1. Las columnas.
alter table public.exchange_rates drop column if exists reason;
alter table public.exchange_rates drop column if exists created_by;
