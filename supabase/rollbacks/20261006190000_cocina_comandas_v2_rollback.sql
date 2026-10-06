-- Reversión de 20261006190000_cocina_comandas_v2.sql.
--
-- Quita las RPC, la línea de tiempo, las columnas nuevas, los dos permisos y
-- la publicación Realtime de kitchen_ticket_items.
-- ADVIERTE: los eventos de kitchen_ticket_events y los tiempos started_at /
-- ready_at por ítem se pierden. El estado de las comandas (status) NO se
-- revierte: queda como lo dejaron las RPC, que es un estado válido para el
-- código anterior.

drop function if exists public.pos_cocina_rondas_mesa(integer, uuid, uuid);
drop function if exists public.pos_cocina_avisar_mesero(integer, uuid, integer);
drop function if exists public.pos_cocina_cerrar_anteriores(integer, uuid, integer, timestamptz, text);
drop function if exists public.pos_cocina_mover_item(integer, uuid, integer, text);
drop function if exists public.pos_cocina_cancelar(integer, uuid, integer, text);
drop function if exists public.pos_cocina_marcar_item(integer, uuid, integer, boolean);
drop function if exists public.pos_cocina_cambiar_estado(integer, uuid, integer, text, text, text);
drop function if exists public.fn_pos_cocina_aplicar_derivado(integer);
drop function if exists public.fn_pos_cocina_estado_derivado(integer);
drop function if exists public.fn_pos_cocina_puede(integer, uuid, text);

drop table if exists public.kitchen_ticket_events;

alter table public.kitchen_ticket_items
  drop column if exists ready_at,
  drop column if exists started_at;
alter table public.kitchen_tickets
  drop column if exists waiter_notified_at,
  drop column if exists started_at;

delete from public.role_permissions
 where permission_id in (select id from public.permissions where code in ('pos.cocina.operar', 'pos.cocina.gestionar'));
delete from public.job_position_permissions
 where permission_id in (select id from public.permissions where code in ('pos.cocina.operar', 'pos.cocina.gestionar'));
delete from public.permissions where code in ('pos.cocina.operar', 'pos.cocina.gestionar');

do $$
begin
  if exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'kitchen_ticket_items') then
    alter publication supabase_realtime drop table public.kitchen_ticket_items;
  end if;
end $$;
