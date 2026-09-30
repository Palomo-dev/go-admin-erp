-- Reportes v2: frecuencias y formato del diálogo «Programar envío» (Figma,
-- página 14, nodo 1390:44739), que ofrece Diario, Semanal, Quincenal,
-- Mensual, Trimestral y Personalizado, y los formatos PDF, Excel y PDF + Excel.
--
-- scheduled_reports sigue sin filas: los CHECK se amplían (se quitan y se
-- vuelven a crear con más valores), nada se reescribe.
--   frequency   + quarterly (trimestral) y custom (personalizado);
--   formato     + pdf_excel (los dos adjuntos en el mismo correo);
--   dias_semana días ISO (1 = lunes … 7 = domingo) del personalizado.
-- Cuándo sale cada frecuencia (hora local de zona_horaria):
--   daily       todos los días;
--   weekly      el día `dia` de la semana (1–7);
--   biweekly    los días 1 y 16 del mes (`dia` no aplica);
--   monthly     el día `dia` del mes (1–28);
--   quarterly   el día `dia` (1–28) del primer mes de cada trimestre;
--   custom      los días de `dias_semana`.

alter table public.scheduled_reports
  add column if not exists dias_semana smallint[];

alter table public.scheduled_reports drop constraint if exists scheduled_reports_frequency_check;
alter table public.scheduled_reports
  add constraint scheduled_reports_frequency_check
  check (frequency in ('daily', 'weekly', 'biweekly', 'monthly', 'quarterly', 'custom'));

alter table public.scheduled_reports drop constraint if exists scheduled_reports_formato_check;
alter table public.scheduled_reports
  add constraint scheduled_reports_formato_check
  check (formato in ('pdf', 'excel', 'csv', 'pdf_excel'));

alter table public.scheduled_reports drop constraint if exists scheduled_reports_dias_semana_check;
alter table public.scheduled_reports
  add constraint scheduled_reports_dias_semana_check
  check (
    dias_semana is null
    or (cardinality(dias_semana) between 1 and 7 and dias_semana <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[])
  );

comment on column public.scheduled_reports.dias_semana is
  'Frecuencia personalizada: días ISO de la semana (1 = lunes … 7 = domingo).';
