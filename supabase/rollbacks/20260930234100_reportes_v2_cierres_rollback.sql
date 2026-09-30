-- Reversión de 20260930234100_reportes_v2_cierres.
--
-- Borra las funciones de cierre, la numeración y la tabla de cierres con sus
-- snapshots: se pierden los documentos emitidos en la v2. Los periodos
-- contables que se cerraron al firmar quedan como estén (fiscal_periods no se
-- toca); reabrirlos, si hace falta, desde Contabilidad › Periodos. Los eventos
-- de auditoría en report_executions se conservan.

drop function if exists public.fn_cierre_reabrir(uuid, text);
drop function if exists public.fn_cierre_firmar(uuid);
drop function if exists public.fn_cierre_guardar(bigint, uuid, jsonb, uuid);
drop function if exists public.fn_cierre_evento(public.report_closings, uuid, text, jsonb);

drop table if exists public.report_closing_counters;
drop table if exists public.report_closings;
