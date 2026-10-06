-- Rollback de 20261007130300_fn_cobrar_pedido_web_en_caja.
-- Antes: el ERP oculta «Cobrar y entregar» (el código trata la función como
-- ausente). Facturas, pagos y ventas ya cobrados se conservan: son dinero real
-- registrado en caja.

drop function if exists public.fn_cobrar_pedido_web_en_caja(uuid, text, jsonb, text, numeric);
