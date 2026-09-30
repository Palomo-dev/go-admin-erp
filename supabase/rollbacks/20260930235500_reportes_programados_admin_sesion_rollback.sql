-- Quita la política que deja a un administrador ver los envíos programados
-- de toda su organización con la sesión. Sin ella, la ruta tiene que volver
-- a listarlos con el service role: la RLS de la fila propia no alcanza.

drop policy if exists scheduled_reports_admin_org on public.scheduled_reports;
