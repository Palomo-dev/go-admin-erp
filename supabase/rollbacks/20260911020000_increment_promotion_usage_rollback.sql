-- ============================================================
-- ROLLBACK de 20260911020000_increment_promotion_usage
-- ============================================================
-- Elimina la RPC. No hay datos que revertir: los incrementos ya hechos en
-- `promotions.usage_count` se conservan (son estadística, no dinero).
-- Ojo: el sitio web (goadmin-websites, app/api/orders/route.ts) la invoca;
-- tras revertir, esa llamada fallará y se registrará en el log del pedido sin
-- bloquear la creación del pedido.
-- ============================================================

begin;

drop function if exists public.increment_promotion_usage(integer, uuid[]);

commit;
