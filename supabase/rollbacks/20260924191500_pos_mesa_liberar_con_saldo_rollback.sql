-- Reversión de 20260924191500_pos_mesa_liberar_con_saldo.sql
--
-- ADVERTENCIA: no restaura datos. Si ya hay comandas o ítems en `cancelled`,
-- las restricciones originales no se pueden volver a crear hasta decidir qué
-- hacer con ellos; este archivo los devuelve a `delivered` para poder hacerlo
-- (es la única forma de cumplir el CHECK anterior) y deja el motivo en
-- `cancellation_reason` hasta que se borra la columna. Revisar antes de ejecutar.

drop function if exists public.pos_mesa_liberar(integer, uuid, uuid, text, text, boolean);
drop function if exists public.pos_mesa_resumen_liberacion(integer, uuid);
drop function if exists public.fn_pos_mesa_saldo(uuid);

update public.kitchen_ticket_items set status = 'delivered' where status = 'cancelled';
update public.kitchen_tickets set status = 'delivered' where status = 'cancelled';

alter table public.kitchen_ticket_items drop constraint if exists kitchen_ticket_items_status_check;
alter table public.kitchen_ticket_items add constraint kitchen_ticket_items_status_check
  check (status = any (array['pending'::text, 'in_progress'::text, 'ready'::text, 'delivered'::text]));

alter table public.kitchen_tickets drop constraint if exists kitchen_tickets_status_check;
alter table public.kitchen_tickets add constraint kitchen_tickets_status_check
  check (status = any (array['new'::text, 'preparing'::text, 'ready'::text, 'delivered'::text]));

alter table public.kitchen_tickets drop column if exists cancellation_reason;
alter table public.kitchen_tickets drop column if exists cancelled_at;
