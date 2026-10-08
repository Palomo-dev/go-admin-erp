-- Rollback de 20261008140014_plano_guardar_sede (E9).
--
-- Antes de aplicarlo, revierte el código del ERP que la llama
-- (src/components/pos/mesas/plano/planoService.ts → guardarPlano). La versión
-- anterior de ese servicio guardaba con N llamadas desde el navegador. No toca
-- datos.

drop function if exists public.guardar_plano_sede(integer, jsonb);
drop function if exists public.fn_plano_mesa_desde_json(jsonb);
