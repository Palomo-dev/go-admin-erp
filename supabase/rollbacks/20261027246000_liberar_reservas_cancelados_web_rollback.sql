-- Reversión de 20261027246000: vuelve a dejar VIVAS las reservas liberadas,
-- devuelve a stock_levels.qty_reserved lo que se descontó (antes − después,
-- respeta lo que se haya movido desde entonces) y restaura stock_released_at.
-- Solo toca filas del respaldo; luego borra la tabla de respaldo.
set statement_timeout = '60s';
begin;

do $$
begin
  if exists (select 1 from public.bk_20261027246000_reservas_cancelados b
              join public.web_orders w on w.id = b.order_id
             where b.tipo = 'pedido' and w.status <> 'cancelled') then
    raise exception 'Algún pedido ya no está cancelado (¿reactivado?): revisar a mano antes de revertir';
  end if;
end $$;

update public.stock_reservations r
   set released_at = null, release_reason = null
  from public.bk_20261027246000_reservas_cancelados b
 where b.tipo = 'reserva' and r.id::text = b.id_fila
   and r.release_reason = 'cancelado_sin_liberar_20261027246000';

update public.stock_levels sl
   set qty_reserved = coalesce(sl.qty_reserved, 0) + (b.qty_reserved_antes - b.qty_reserved_despues),
       updated_at = now()
  from public.bk_20261027246000_reservas_cancelados b
 where b.tipo = 'nivel' and sl.id::text = b.id_fila
   and b.qty_reserved_despues is not null;

update public.web_orders w
   set stock_released_at = b.stock_released_at_antes
  from public.bk_20261027246000_reservas_cancelados b
 where b.tipo = 'pedido' and w.id = b.order_id;

drop table public.bk_20261027246000_reservas_cancelados;

commit;
