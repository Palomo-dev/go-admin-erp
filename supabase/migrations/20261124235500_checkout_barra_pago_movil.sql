-- Barra fija del pago en celular de la tienda web (Figma «16 Sitio web» 3059:80757, aprobada por el
-- dueño el 2026-11-24): tres estilos y la tienda elige en Sitio web › Ventas en línea › Checkout.
-- Aplicada con apply_migration (MCP). Aditiva.
--
--   checkout_mobile_bar_style: 'dos_filas' (A), 'dos_lineas' (B) o 'partido' (C). NULL = sin elegir,
--   y la tienda pinta C (el estilo por defecto). Solo la fila global (branch_id IS NULL) se escribe
--   desde el ERP, como el resto de ajustes del checkout.
--
-- No hay contenedor JSON de ajustes del checkout en website_settings (comprobado por MCP el
-- 2026-11-24): por eso una columna, NULL-able y sin default, que no cambia ninguna tienda.
--
-- Idempotente. Rollback: supabase/rollbacks/20261124235500_checkout_barra_pago_movil_rollback.sql

set lock_timeout = '10s';

alter table public.website_settings
  add column if not exists checkout_mobile_bar_style text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'website_settings_checkout_mobile_bar_style_valido'
      and conrelid = 'public.website_settings'::regclass
  ) then
    alter table public.website_settings
      add constraint website_settings_checkout_mobile_bar_style_valido
      check (checkout_mobile_bar_style is null or checkout_mobile_bar_style in ('dos_filas', 'dos_lineas', 'partido'));
  end if;
end $$;

comment on column public.website_settings.checkout_mobile_bar_style is
  'Barra fija del pago en celular de la tienda: dos_filas (A), dos_lineas (B) o partido (C). NULL = C.';
