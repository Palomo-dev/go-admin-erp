-- Reversión de 20261001001000_reportes_v2_programados_frecuencias.
-- Solo es segura si ningún envío usa quarterly, custom o pdf_excel: los
-- UPDATE los devuelven a un valor que el CHECK anterior admite.

update public.scheduled_reports set frequency = 'monthly' where frequency = 'quarterly';
update public.scheduled_reports set frequency = 'weekly' where frequency = 'custom';
update public.scheduled_reports set formato = 'pdf' where formato = 'pdf_excel';

alter table public.scheduled_reports drop constraint if exists scheduled_reports_dias_semana_check;
alter table public.scheduled_reports drop constraint if exists scheduled_reports_frequency_check;
alter table public.scheduled_reports
  add constraint scheduled_reports_frequency_check
  check (frequency in ('daily', 'weekly', 'biweekly', 'monthly'));
alter table public.scheduled_reports drop constraint if exists scheduled_reports_formato_check;
alter table public.scheduled_reports
  add constraint scheduled_reports_formato_check
  check (formato in ('pdf', 'excel', 'csv'));
alter table public.scheduled_reports drop column if exists dias_semana;
