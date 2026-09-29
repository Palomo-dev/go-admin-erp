-- Membresías — fase 2: tarea de vencimiento (docs/design/MEMBRESIAS-FASE-1-2.md §3 M6).
--
-- El repositorio ya corre este tipo de tareas con pg_cron (investor_suscripciones_vencer,
-- reschedule-overdue-tasks…), así que se usa pg_cron y no una ruta /api/cron. Corre cada hora en el
-- minuto 7: cada organización cruza su medianoche a una hora distinta (fn_membresias_vencer usa la
-- zona de la organización) y la función es idempotente, así que correrla de más no cambia nada.

do $$
begin
  if exists (select 1 from cron.job where jobname = 'membresias-vencer') then
    perform cron.unschedule('membresias-vencer');
  end if;
  perform cron.schedule('membresias-vencer', '7 * * * *', 'select public.fn_membresias_vencer_todas()');
end $$;
