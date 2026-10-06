-- Reversión de 20261006171048_cocina_comandas_v2_esquema.sql.
-- Quita la línea de tiempo, las columnas nuevas y los dos permisos.
-- ADVIERTE: los eventos de kitchen_ticket_events y los tiempos started_at /
-- ready_at / waiter_notified_at se pierden (no se pueden reconstruir), y las
-- asignaciones de pos.cocina.* a roles o cargos también.
-- Requiere revertir antes 171208 y 171155 (las RPC dependen de estas columnas).

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
