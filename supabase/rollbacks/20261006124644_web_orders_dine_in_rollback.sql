-- Rollback de 20261007130000_web_orders_dine_in.
--
-- Orden: primero el sitio debe dejar de enviar 'dine_in' (paquete A vuelve al
-- mapeo temporal a pickup). Si ya hay pedidos dine_in, el CHECK anterior no se
-- puede restaurar sin tocar datos: este rollback NO convierte filas; se detiene
-- con un error y hay que decidir a mano (p. ej. pasarlos a pickup con nota).
-- Las columnas restaurant_table_id y table_session_id se conservan (son
-- aditivas y NULL-ables; quitarlas perdería el vínculo mesa ↔ pedido). Si de
-- verdad hay que quitarlas, es una decisión aparte.

do $rb$
begin
  if exists (select 1 from public.web_orders where delivery_type = 'dine_in') then
    raise exception 'Hay pedidos dine_in: el CHECK anterior no se puede restaurar sin convertirlos';
  end if;
end
$rb$;

drop trigger if exists trg_web_orders_mesa_valida on public.web_orders;
drop function if exists public.fn_web_orders_mesa_valida();

alter table public.web_orders
  drop constraint if exists web_orders_delivery_type_check;
alter table public.web_orders
  add constraint web_orders_delivery_type_check
  check (delivery_type = any (array['pickup'::text, 'delivery_own'::text, 'delivery_third_party'::text]));
