-- Revierte 20261002014500_avisos_miembro_lead.
-- Quita el trigger y la función y restaura los CHECK anteriores.
-- No borra filas de member_notices. Si ya hay un aviso lead.asignado
-- o entity_type customer, recrear el CHECK falla: hay que borrar esas filas antes.

drop trigger if exists trg_avisos_miembro_lead on public.customers;
drop function if exists public.fn_avisos_miembro_lead();

alter table public.member_notices drop constraint if exists member_notices_event_check;
alter table public.member_notices add constraint member_notices_event_check check (event in (
  'tarea.asignada', 'oportunidad.asignada', 'oportunidad.etapa',
  'tarea.completada', 'tarea.atrasada', 'tarea.vence',
  'oportunidad.vence', 'oportunidad.atrasada',
  'oportunidad.ganada', 'oportunidad.perdida', 'oportunidad.contacto',
  'caja.diferencia', 'cartera.resumen', 'inventario.cero', 'inventario.bajo'
));

alter table public.member_notices drop constraint if exists member_notices_entity_check;
alter table public.member_notices add constraint member_notices_entity_check check (
  entity_type in ('task', 'opportunity', 'cash_session', 'digest', 'stock')
);
