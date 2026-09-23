-- Rollback de 20260923200100_descartar_notificacion_solo_para_mi.sql.
-- Borra los descartes personales: las notificaciones descartadas vuelven a
-- verse en la campana de quien las descartó (siguen marcadas como leídas).
drop table if exists public.notification_dismissals;
