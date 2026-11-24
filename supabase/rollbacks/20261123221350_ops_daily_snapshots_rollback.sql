-- Rollback de 20261123221350_ops_daily_snapshots.
-- Borra las fotos diarias de la operación. El Inicio vuelve a no mostrar la comparación
-- «vs. cierre de ayer» ni la mini-gráfica de ocupación (sin foto no hay delta); el cron
-- /api/cron/fotos-operacion falla en silencio hasta quitarlo de vercel.json.

drop policy if exists ops_daily_snapshots_select on public.ops_daily_snapshots;
drop table if exists public.ops_daily_snapshots;
