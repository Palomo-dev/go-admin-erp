-- Reversión de 20260929217000_inv_b9_pedido_web_confirmar_stock.
-- Antes de aplicarla, webOrderServerConfirmation y webOrderConfirmationService deben volver a hacer
-- el stock por su cuenta. No revierte movimientos, reservas ni seriales ya procesados.

drop function if exists public.fn_pedido_web_confirmar_stock(uuid, uuid, uuid);
