-- Reversión de 20261123150003_logistica_f1_rpc_envios.sql (logística Fase 1, 3/5).
--
-- Solo funciones: no toca datos. Los envíos, eventos, intentos y pruebas que estas RPC crearon se
-- quedan. Después de revertir, el servicio deliveryIntegrationService vuelve a fallar si no se
-- revierte también su código (llama a estas RPC).

drop function if exists public.logistica_codigo_entrega_reiniciar(uuid);
drop function if exists public.logistica_codigo_entrega(uuid);
drop function if exists public.logistica_registrar_novedad(uuid, text, text, date, text[], numeric, numeric);
drop function if exists public.logistica_marcar_entregado(uuid, jsonb, text, jsonb);
drop function if exists public.logistica_cambiar_estado(uuid, text, text, numeric, numeric);
drop function if exists public.logistica_asignar_domiciliario(uuid, uuid, uuid, date);
drop function if exists public.fn_logistica_liberar_vehiculo(uuid, uuid);
drop function if exists public.fn_logistica_registrar_evento(public.shipments, text, text, text, text, numeric, numeric, jsonb);
drop function if exists public.fn_logistica_envio_bloquear(uuid);
drop function if exists public.fn_logistica_transicion_valida(text, text);
