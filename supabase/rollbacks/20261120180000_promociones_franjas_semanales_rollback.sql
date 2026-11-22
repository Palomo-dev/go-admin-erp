-- Reversión de 20261120180000_promociones_franjas_semanales.sql.
-- ADVERTENCIA: borra la columna y con ella las franjas semanales guardadas. Las
-- promociones que las usaban quedan con applicable_days/start_time/end_time NULL,
-- es decir, «todo el día, todos los días». Exporta las filas con schedule_windows
-- no nulo antes de revertir y pásalas a mano al esquema de una sola franja.
alter table public.promotions drop constraint if exists promotions_schedule_windows_exclusivo;
alter table public.promotions drop constraint if exists promotions_schedule_windows_forma;
alter table public.promotions drop column if exists schedule_windows;
