-- Reversión de 20260925100000_pos_cocina_rondas_ajustes_alergias_notas_rapidas.sql
--
-- ADVERTENCIA: borra datos. Las comandas de ajuste (`ticket_type = 'adjustment'`)
-- quedan como comandas normales sin marca, los ítems anulados pierden su motivo
-- y las notas rápidas configuradas se pierden. Antes de ejecutar, exportar:
--   select * from public.pos_quick_notes;
--   select * from public.kitchen_tickets where ticket_type = 'adjustment' or has_allergy;
-- El código que llama a /api/pos/cocina/* debe revertirse ANTES (las rutas
-- fallan sin estas funciones).

drop function if exists public.pos_notas_rapidas_sugeridas(integer, integer, integer);
drop function if exists public.pos_cocina_confirmar_alergia(integer, uuid, integer);
drop function if exists public.pos_cocina_ajustar_linea_mesa(integer, uuid, uuid, numeric, text);
drop function if exists public.pos_cocina_enviar_ronda(integer, uuid, jsonb);
drop function if exists public.fn_pos_cocina_resultado_ronda(integer, uuid, uuid, boolean);
drop function if exists public.fn_pos_cocina_linea_enviada(integer, uuid, uuid);

drop trigger if exists trg_kitchen_ticket_item_alergia_guarda on public.kitchen_ticket_items;
drop trigger if exists trg_kitchen_ticket_alergia_guarda on public.kitchen_tickets;
drop function if exists public.fn_kitchen_ticket_item_alergia_guarda();
drop function if exists public.fn_kitchen_ticket_alergia_guarda();

drop table if exists public.pos_quick_notes;

drop index if exists public.kitchen_ticket_items_cart_line_id_idx;
drop index if exists public.kitchen_ticket_items_sale_item_id_idx;
drop index if exists public.kitchen_ticket_items_kitchen_ticket_id_idx;
drop index if exists public.kitchen_tickets_cart_id_idx;
drop index if exists public.kitchen_tickets_round_key_uq;

alter table public.kitchen_ticket_items drop constraint if exists kitchen_ticket_items_adjusts_item_id_fkey;
alter table public.kitchen_ticket_items drop constraint if exists kitchen_ticket_items_adjustment_kind_check;
alter table public.kitchen_ticket_items drop column if exists cancel_reason;
alter table public.kitchen_ticket_items drop column if exists cancelled_at;
alter table public.kitchen_ticket_items drop column if exists adjustment_reason;
alter table public.kitchen_ticket_items drop column if exists adjusts_item_id;
alter table public.kitchen_ticket_items drop column if exists quantity_delta;
alter table public.kitchen_ticket_items drop column if exists adjustment_kind;
alter table public.kitchen_ticket_items drop column if exists is_allergy;
alter table public.kitchen_ticket_items drop column if exists cart_line_id;

alter table public.kitchen_tickets drop constraint if exists kitchen_tickets_adjusts_ticket_id_fkey;
alter table public.kitchen_tickets drop constraint if exists kitchen_tickets_ticket_type_check;
alter table public.kitchen_tickets drop column if exists allergy_ack_by;
alter table public.kitchen_tickets drop column if exists allergy_ack_at;
alter table public.kitchen_tickets drop column if exists has_allergy;
alter table public.kitchen_tickets drop column if exists round_key;
alter table public.kitchen_tickets drop column if exists cart_id;
alter table public.kitchen_tickets drop column if exists adjusts_ticket_id;
alter table public.kitchen_tickets drop column if exists ticket_type;
