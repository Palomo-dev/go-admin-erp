-- Rollback de 20261006164925_pos_mesas_flujo_atencion (aplicada el 2026-10-06, versión 20261006164925).
--
-- ADVIERTE: no restaura datos. Las mesas que estén «Por limpiar» vuelven a «free» (el CHECK
-- original no admite 'cleaning'). La nota de la mesa (table_sessions.service_notes), la nota
-- en la comanda (kitchen_tickets.table_note), la forma y el tamaño de las mesas y el color y
-- el orden de las zonas se pierden al quitar sus columnas. Las líneas que ya pasaron por
-- pos_mesa_enviar_ronda conservan en sale_items.notes sus claves 'ronda', 'round_key' y
-- 'enviada_at' (inofensivas). Después del rollback la pantalla vuelve sola a su respaldo:
-- crea la comanda desde el navegador como antes.

drop function if exists public.pos_mesa_mover(uuid, uuid, text, uuid[]);
drop function if exists public.pos_mesa_marcar_estado(uuid, text);
drop function if exists public.pos_mesa_marcar_servido(uuid[]);
drop function if exists public.pos_mesa_enviar_ronda(uuid, uuid);
drop function if exists public.pos_mesa_asignar_cliente(uuid, uuid);
drop function if exists public.pos_mesa_abrir(uuid, integer, uuid, uuid, uuid);
drop function if exists public.fn_pos_mesa_nota_cocina(jsonb);

alter table public.kitchen_tickets drop column if exists table_note;
alter table public.table_sessions drop column if exists service_notes;
alter table public.restaurant_zone_layouts drop column if exists sort_order;
alter table public.restaurant_zone_layouts drop column if exists color;
alter table public.restaurant_tables drop constraint if exists restaurant_tables_size_check;
alter table public.restaurant_tables drop constraint if exists restaurant_tables_shape_check;
alter table public.restaurant_tables drop column if exists size;
alter table public.restaurant_tables drop column if exists shape;

update public.restaurant_tables set state = 'free', updated_at = now() where state = 'cleaning';
alter table public.restaurant_tables drop constraint if exists restaurant_tables_state_check;
alter table public.restaurant_tables
  add constraint restaurant_tables_state_check
  check (state = any (array['free'::text, 'occupied'::text, 'reserved'::text]));
