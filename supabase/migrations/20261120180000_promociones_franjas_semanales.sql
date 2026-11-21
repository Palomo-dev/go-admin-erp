-- Promociones: varias franjas semanales que pueden cruzar días.
--
-- Hasta hoy el horario de una promoción era `applicable_days` + una sola
-- franja diaria `start_time`/`end_time` (si el fin es menor que el inicio,
-- cruza la medianoche y la madrugada cuenta como el día de inicio). Con eso
-- no se puede decir «viernes 20:00 a sábado 02:00 y sábado 16:00 a domingo
-- 14:00» en una sola promoción.
--
-- `schedule_windows` es una lista de franjas semanales:
--   [{"desde_dia":"saturday","desde_hora":"16:00","hasta_dia":"sunday","hasta_hora":"14:00"}, …]
-- Días en inglés (los mismos de `applicable_days`), horas `HH:mm` en la zona
-- de la organización. El fin es exclusivo y la duración es menor que 7 días
-- (inicio = fin no se admite). NULL = se usa el esquema anterior tal cual.
--
-- Aditiva: columna NULL-able, sin migración de datos. Las dos reglas de
-- forma son CHECK con jsonpath (inmutables, sin funciones nuevas).

alter table public.promotions
  add column if not exists schedule_windows jsonb;

comment on column public.promotions.schedule_windows is
  'Franjas semanales en que la promoción está activa: lista de {desde_dia, desde_hora, hasta_dia, hasta_hora} '
  '(días monday…sunday, horas HH:mm de la zona de la organización, fin exclusivo, pueden cruzar días, duración < 7 días). '
  'NULL = horario de applicable_days + start_time/end_time. Con valor, esas tres columnas van NULL. '
  'Lo evalúa src/lib/promotions/vigencia.ts (ERP) y lib/promotions.ts (tienda web).';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'promotions_schedule_windows_forma') then
    alter table public.promotions add constraint promotions_schedule_windows_forma check (
      schedule_windows is null or (
        jsonb_typeof(schedule_windows) = 'array'
        and jsonb_array_length(schedule_windows) between 1 and 14
        and not jsonb_path_exists(schedule_windows, 'strict $[*] ? (@.type() != "object")')
        and not jsonb_path_exists(schedule_windows, 'lax $[*] ? (!exists(@.desde_dia) || !exists(@.desde_hora) || !exists(@.hasta_dia) || !exists(@.hasta_hora))')
        and not jsonb_path_exists(schedule_windows, 'strict $[*] ? (@.desde_dia.type() != "string" || @.desde_hora.type() != "string" || @.hasta_dia.type() != "string" || @.hasta_hora.type() != "string")')
        and not jsonb_path_exists(schedule_windows, 'strict $[*] ? (!(@.desde_dia like_regex "^(monday|tuesday|wednesday|thursday|friday|saturday|sunday)$") || !(@.hasta_dia like_regex "^(monday|tuesday|wednesday|thursday|friday|saturday|sunday)$") || !(@.desde_hora like_regex "^([01][0-9]|2[0-3]):[0-5][0-9]$") || !(@.hasta_hora like_regex "^([01][0-9]|2[0-3]):[0-5][0-9]$"))')
        and not jsonb_path_exists(schedule_windows, 'strict $[*] ? (@.desde_dia == @.hasta_dia && @.desde_hora == @.hasta_hora)')
      )
    );
  end if;
  -- Un solo esquema por fila: con franjas semanales, el horario viejo va vacío.
  if not exists (select 1 from pg_constraint where conname = 'promotions_schedule_windows_exclusivo') then
    alter table public.promotions add constraint promotions_schedule_windows_exclusivo check (
      schedule_windows is null or (
        start_time is null and end_time is null
        and (applicable_days is null or applicable_days = '[]'::jsonb)
      )
    );
  end if;
end $$;
