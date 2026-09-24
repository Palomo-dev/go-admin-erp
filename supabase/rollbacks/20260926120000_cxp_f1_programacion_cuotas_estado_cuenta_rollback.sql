-- Rollback de 20260926120000_cxp_f1_programacion_cuotas_estado_cuenta.sql
--
-- Orden: revertir antes 20260926130000 (`fn_void_purchase_invoice` v2 cancela
-- programaciones y usa `fn_fc_instante`).
--
-- ADVERTENCIA DE DATOS: borra `ap_payment_schedules`. Las programaciones
-- pendientes, aprobadas o rechazadas se pierden (los pagos que ya creó la
-- aprobación se quedan en `payments`). Copiarla antes si hace falta el rastro.
-- Las cuotas (`ap_installments`) no se tocan; su estado deja de derivarse de
-- lo abonado.

drop trigger if exists trg_ap_installment_estado on public.ap_installments;
drop function if exists public.fn_ap_installment_estado();

drop function if exists public.fn_estado_cuenta_proveedor(integer, integer, date, date);
drop function if exists public.fn_estado_cuenta_proveedor_movs(integer, integer);
drop function if exists public.fn_cxp_crear_plan_cuotas(uuid, jsonb);
drop function if exists public.fn_cxp_eliminar_plan_cuotas(uuid);
drop function if exists public.fn_cancelar_pago_programado(uuid, text);
drop function if exists public.fn_rechazar_pago_programado(uuid, text);
drop function if exists public.fn_aprobar_pago_programado(uuid, text);
drop function if exists public.fn_programar_pago(uuid, numeric, date, text, integer, text, text, uuid);
drop function if exists public.fn_fc_es_aprobador(integer, uuid);
drop function if exists public.fn_fc_instante(text, text);
drop function if exists public.fn_cxp_moneda(uuid);

drop table if exists public.ap_payment_schedules;
