-- Rollback de 20260926110000_pago_unico_registrar_y_anular.sql
--
-- ADVERTENCIA: no revierte datos. Los pagos registrados con fn_registrar_pago
-- siguen en payments (son pagos reales); sus recibos se pierden al borrar
-- payment_groups. Antes de revertir, exportar payment_groups si tiene filas.

drop function if exists public.fn_anular_pago(uuid, text);
drop function if exists public.fn_registrar_pago(text, jsonb, text, text, date, text, integer, numeric, numeric, text, text, text, integer);
drop function if exists public.fn_caja_abierta_para(integer, integer, uuid);
drop function if exists public.fn_finanzas_exigir_permiso(integer, text[]);

drop index if exists public.idx_payments_source;
drop index if exists public.idx_payments_group;

alter table public.payments drop column if exists void_reason;
alter table public.payments drop column if exists voided_by;
alter table public.payments drop column if exists voided_at;
alter table public.payments drop column if exists installment_id;
alter table public.payments drop column if exists payment_group_id;

drop table if exists public.payment_groups;
