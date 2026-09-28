-- Deshace 20260923120000_reportes_de_problema_desde_el_header.sql.
-- Ojo: borra los reportes recibidos. Exportarlos antes si ya hay datos.
-- Los objetos del bucket se borran desde la API de Storage (no con SQL);
-- el bucket solo se elimina si ya está vacío.

drop table if exists public.problem_reports;

delete from storage.buckets
where id = 'problem-reports'
  and not exists (select 1 from storage.objects where bucket_id = 'problem-reports');
