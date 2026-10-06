-- ⚠️ SIN APLICAR (2026-10-07). Paquete E · E5 — marcar la comanda web «en preparación» o «lista»
-- hace avanzar el pedido web. Requiere E2 (kitchen_tickets.web_order_id).
--
-- ENSAYO (2026-10-07, bloque `do` que aplica esta migración, cambia comandas
-- como `authenticated` miembro de la org 140 y se deshace con `raise
-- exception`; el `drop trigger if exists` se omitió porque el trigger no
-- existe y el MCP se cuelga con él):
--   ENSAYO_OK comanda_preparing->pedido=preparing | comanda_ready->pedido=ready
--   ready_at=t | pedido_entregado_no_retrocede=delivered |
--   comanda_pos_sin_web=ready (sin efecto)
--
-- Problema: en Comandas, marcar lista la comanda de un pedido web no cambiaba
-- nada del pedido: el cliente seguía viendo «Confirmado» en /pedido/<n> y el
-- equipo tenía que ir a Pedidos online a cambiar el estado a mano.
--
-- Qué hace: trigger AFTER UPDATE OF status en kitchen_tickets, SOLO para
-- comandas con web_order_id (las del POS normal y las rondas que el mesero
-- manda desde la mesa nunca lo llevan, así que no dispara en ellas; la comanda
-- de un pedido «Comer aquí» agregado a la mesa por E3 sí) y ticket_type='order':
--   comanda 'preparing' → pedido 'confirmed' pasa a 'preparing'.
--   comanda 'ready'     → pedido 'confirmed'/'preparing' pasa a 'ready' con
--                         ready_at = now().
-- Nunca retrocede un pedido (in_delivery, delivered, cancelados… no se tocan).
-- El correo al cliente lo envía el ERP (kitchenService → POST
-- /api/web-orders/[id]/aviso-estado) después de cambiar la comanda.
-- SECURITY DEFINER: quien marca la comanda (cocina) puede no tener permiso de
-- escritura sobre web_orders. Sin entrada de usuario: todo sale de NEW.

create or replace function public.fn_comanda_web_avanza_pedido()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $f$
begin
  if new.web_order_id is null or new.ticket_type <> 'order' or new.status is not distinct from old.status then
    return new;
  end if;
  if new.status = 'preparing' then
    update public.web_orders
       set status = 'preparing'
     where id = new.web_order_id
       and organization_id = new.organization_id
       and status = 'confirmed';
  elsif new.status = 'ready' then
    update public.web_orders
       set status = 'ready', ready_at = coalesce(ready_at, now())
     where id = new.web_order_id
       and organization_id = new.organization_id
       and status in ('confirmed', 'preparing');
  end if;
  return new;
end;
$f$;

revoke all on function public.fn_comanda_web_avanza_pedido() from public, anon, authenticated;

drop trigger if exists trg_comanda_web_avanza_pedido on public.kitchen_tickets;
create trigger trg_comanda_web_avanza_pedido
  after update of status on public.kitchen_tickets
  for each row
  when (new.web_order_id is not null)
  execute function public.fn_comanda_web_avanza_pedido();
