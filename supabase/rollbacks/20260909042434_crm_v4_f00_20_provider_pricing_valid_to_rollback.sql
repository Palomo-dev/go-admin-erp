-- ============================================================
-- ROLLBACK de 20260909042434_crm_v4_f00_20_provider_pricing_valid_to
-- ============================================================
-- Escrito el 2026-09-15 (F0-DB ronda 3, B1): la migración se aplicó por MCP
-- sin dejar rollback; este archivo deshace su DDL en orden inverso.
-- Quita valid_to, su CHECK, el índice de vigencia y restaura fn_unit_cost sin vigencia (versión de f00_03).
--
-- SOBRE LOS DATOS: restaura la estructura, no los datos: se pierden los valid_to que se hayan fijado.
-- ============================================================

begin;
create or replace function public.fn_unit_cost(p_provider text, p_sku text, p_at date default current_date)
returns numeric language sql stable set search_path = public as $$
  SELECT unit_cost_usd FROM public.provider_pricing
   WHERE provider = p_provider AND sku = p_sku AND valid_from <= p_at
   ORDER BY valid_from DESC LIMIT 1;
$$;
comment on function public.fn_unit_cost(text, text, date) is null;
drop index if exists public.provider_pricing_vigente_idx;
alter table public.provider_pricing drop constraint if exists provider_pricing_valid_range_check;
alter table public.provider_pricing drop column if exists valid_to;
commit;
