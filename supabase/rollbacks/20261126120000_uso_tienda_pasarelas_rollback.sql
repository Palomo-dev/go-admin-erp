-- Rollback de 20261126120000_uso_tienda_pasarelas.sql.
-- Quita el trigger, su función, el CHECK y la columna. El uso elegido por cada pasarela se pierde
-- (todas vuelven a «pago completo y anticipo», el comportamiento previo). La tienda lee la columna
-- con respaldo si no existe (lib/checkout/metodosPagoSitio.ts), así que sigue funcionando.
drop trigger if exists trg_opm_validar_uso_tienda on public.organization_payment_methods;
drop function if exists public.fn_opm_validar_uso_tienda();
alter table public.organization_payment_methods
  drop constraint if exists organization_payment_methods_website_usage_check;
alter table public.organization_payment_methods
  drop column if exists website_usage;
