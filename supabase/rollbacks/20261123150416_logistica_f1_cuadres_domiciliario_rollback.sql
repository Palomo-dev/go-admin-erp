-- Reversión de 20261123150416_logistica_f1_cuadres_domiciliario.sql (logística Fase 1, 4/5).
--
-- ADVERTENCIA: no restaura datos. Borra los cuadres y sus líneas. Los pagos que se registraron al
-- recibir el dinero (payments, por fn_cobrar_pedido_web_en_caja o fn_registrar_pago) NO se borran:
-- son cobros reales en la caja y en la contabilidad. Los envíos quedan con cod_status = 'remitted'.

drop function if exists public.logistica_cuadre_anular(uuid, text);
drop function if exists public.logistica_cuadre_cerrar(uuid, text, text, text, text);
drop function if exists public.logistica_cuadre_recibir_linea(uuid, text, numeric, text, jsonb, text);
drop function if exists public.logistica_cuadre_abrir(integer, integer, uuid, text);
drop function if exists public.fn_logistica_cuadre_resumen(uuid);
drop function if exists public.fn_logistica_cuadre_recalcular(uuid);
drop function if exists public.fn_logistica_cuadre_exigir(integer, integer);
drop table if exists public.courier_settlement_lines;
drop table if exists public.courier_settlements;
