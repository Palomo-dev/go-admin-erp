-- Rollback de 20261028210000_web_order_changes. Libera antes las reservas CHG-* abiertas.
set lock_timeout = '3s';
set statement_timeout = '60s';
begin;
select public.fn_inv_int_liberar(c.organization_id, 'CHG-' || c.id, 'rollback_web_order_changes')
  from public.web_order_changes c where c.estado in ('draft', 'pending_payment', 'pending_refund');
drop function if exists public.fn_web_order_change_pago_tardio(uuid, uuid, text);
drop function if exists public.fn_web_order_changes_expirar();
drop function if exists public.fn_web_order_change_cancelar(uuid, uuid, text);
drop function if exists public.fn_web_order_change_aplicar(uuid, uuid, uuid, text, text);
drop function if exists public.fn_web_order_change_crear(uuid, uuid, jsonb, jsonb, text);
delete from public.role_permissions where permission_id in (select id from public.permissions where code = 'pos.web_order.change');
delete from public.job_position_permissions where permission_id in (select id from public.permissions where code = 'pos.web_order.change');
delete from public.permissions where code = 'pos.web_order.change';
alter table public.web_order_items drop column if exists change_id;
drop table if exists public.web_order_changes;
commit;
