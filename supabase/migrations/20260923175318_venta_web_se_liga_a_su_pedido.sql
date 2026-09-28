-- F-63 / ADR-CC-011 · La venta web se liga a su pedido desde la base
--
-- El código en producción aún crea la venta web con un INSERT directo y no
-- llena sales.web_order_id, así que uq_sales_web_order_viva no lo protegería
-- hasta el despliegue. Este disparador liga la venta con su pedido a partir de
-- la nota que escriben los dos caminos ('Pedido web: <order_number>'; verificado
-- en las 628 ventas web existentes). Con eso, una segunda venta del mismo
-- pedido choca con el índice único y no se crea, venga del camino que venga.

create or replace function public.fn_sales_ligar_pedido_web()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.web_order_id is null and new.source = 'web' and new.notes ~ '^Pedido web: \S+' then
    select w.id into new.web_order_id
      from public.web_orders w
     where w.organization_id = new.organization_id
       and w.order_number = substring(new.notes from '^Pedido web: (\S+)')
     limit 1;
  end if;
  return new;
end;
$$;

revoke all on function public.fn_sales_ligar_pedido_web() from public, anon, authenticated;

drop trigger if exists trg_sales_ligar_pedido_web on public.sales;
create trigger trg_sales_ligar_pedido_web
  before insert on public.sales
  for each row execute function public.fn_sales_ligar_pedido_web();
