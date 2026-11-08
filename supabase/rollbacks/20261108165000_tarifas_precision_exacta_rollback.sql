-- Reversión de 20261108165000_tarifas_precision_exacta.sql.
-- Antes revertir 20261108170000 (usa fn_tarifa_exacta_impuesto).
-- ADVERTENCIA: se pierde la tarifa exacta guardada (no está en ninguna otra columna); rate no se tocó.
drop function if exists public.fn_tarifa_exacta_impuesto(uuid);
alter table public.organization_taxes drop column if exists tarifa_exacta;
alter table public.tax_templates drop column if exists tarifa_exacta;
