-- Pruebas de escenario · Calendario tributario (tax_calendar_dates)
-- Fecha: 2026-11-07 · Proyecto taqjemqjtumhwptchcxk. NO DEJA DATOS (begin … rollback).
--
-- 1. Estado real: cuántas fechas hay cargadas hoy (fuera de la prueba).
-- 2. La plataforma (service_role) puede cargar una fecha; la fila de prueba es FICTICIA y se revierte.
-- 3. Un usuario con sesión la lee; no puede insertar, cambiar ni borrar (ni siendo dueño de su organización).
-- 4. Un visitante sin sesión (anon) no la puede leer.
-- 5. Las reglas de forma de la tabla rechazan datos mal formados.

begin;

create temp table r (n serial primary key, escenario text, verificacion text, esperado text, obtenido text, ok boolean);
grant all on r to authenticated, anon, service_role;
grant usage on sequence r_n_seq to authenticated, anon, service_role;

insert into r (escenario, verificacion, esperado, obtenido, ok)
select '1', 'Fechas del calendario cargadas hoy en la base', 'informativo (0 = «Calendario sin cargar» en el Centro)', count(*)::text, true
  from public.tax_calendar_dates;

-- ── 2. Carga como la plataforma ──
set local role service_role;
do $$
declare v_err text;
begin
  v_err := null;
  begin
    insert into public.tax_calendar_dates (anio, obligacion, periodo, cuota, cantidad_digitos, digitos_desde, digitos_hasta, fecha_vencimiento, norma)
    values (2026, 'iva_bimestral', 5, 1, 1, 0, 0, '2026-11-10', 'FILA FICTICIA DE PRUEBA — no es el decreto');
  exception when others then v_err := sqlerrm;
  end;
  insert into r (escenario, verificacion, esperado, obtenido, ok) values
    ('2', 'service_role carga una fecha (ficticia)', 'se acepta', coalesce(v_err, 'aceptada'), v_err is null);
  -- 5. Reglas de forma.
  v_err := null;
  begin
    insert into public.tax_calendar_dates (anio, obligacion, periodo, cantidad_digitos, digitos_desde, digitos_hasta, fecha_vencimiento, norma)
    values (2026, 'iva_bimestral', 5, 1, 7, 3, '2026-11-10', 'x');
  exception when others then v_err := sqlerrm;
  end;
  insert into r (escenario, verificacion, esperado, obtenido, ok) values
    ('5', 'Rango de dígitos al revés (7 a 3)', 'rechaza: tax_calendar_dates_digitos', coalesce(v_err, 'NO RECHAZÓ'), v_err like '%tax_calendar_dates_digitos%');
  v_err := null;
  begin
    insert into public.tax_calendar_dates (anio, obligacion, periodo, cantidad_digitos, digitos_desde, digitos_hasta, fecha_vencimiento, norma)
    values (2026, 'iva_bimestral', 5, 1, 1, 1, '2026-11-10', '   ');
  exception when others then v_err := sqlerrm;
  end;
  insert into r (escenario, verificacion, esperado, obtenido, ok) values
    ('5', 'Fecha sin norma (texto vacío)', 'rechaza: la norma es obligatoria', coalesce(v_err, 'NO RECHAZÓ'), v_err like '%check%' or v_err like '%norma%');
  v_err := null;
  begin
    insert into public.tax_calendar_dates (anio, obligacion, periodo, cantidad_digitos, digitos_desde, digitos_hasta, fecha_vencimiento, norma)
    values (2026, 'iva_bimestral', 5, 1, 0, 0, '2026-11-12', 'duplicada');
  exception when others then v_err := sqlerrm;
  end;
  insert into r (escenario, verificacion, esperado, obtenido, ok) values
    ('5', 'Segunda fecha para la misma obligación, periodo, cuota y dígitos', 'rechaza: tax_calendar_dates_unico', coalesce(v_err, 'NO RECHAZÓ'), v_err like '%tax_calendar_dates_unico%');
end
$$;

-- ── 3. Usuario con sesión (dueño de la org 374) ──
reset role;
select set_config('request.jwt.claims', '{"sub":"bb11d6d2-f647-49f7-9b29-aa4c4438abf1","role":"authenticated"}', true);
set local role authenticated;
do $$
declare v_err text; v_txt text;
begin
  select string_agg(format('%s %s p%s dígito %s-%s vence %s', anio, obligacion, periodo, digitos_desde, digitos_hasta, fecha_vencimiento), '; ') into v_txt
    from public.tax_calendar_dates where norma like 'FILA FICTICIA%';
  insert into r (escenario, verificacion, esperado, obtenido, ok) values
    ('3', 'authenticated: lee la fecha cargada', '2026 iva_bimestral p5 dígito 0-0 vence 2026-11-10', coalesce(v_txt, 'NO LA VE'), v_txt = '2026 iva_bimestral p5 dígito 0-0 vence 2026-11-10');
  v_err := null;
  begin
    insert into public.tax_calendar_dates (anio, obligacion, periodo, digitos_desde, digitos_hasta, fecha_vencimiento, norma)
    values (2026, 'iva_bimestral', 5, 1, 1, '2026-11-11', 'intento');
  exception when others then v_err := sqlerrm;
  end;
  insert into r (escenario, verificacion, esperado, obtenido, ok) values
    ('3', 'authenticated: INSERT', 'rechaza: permiso denegado', coalesce(v_err, 'NO RECHAZÓ'), v_err like 'permission denied%');
  v_err := null;
  begin
    update public.tax_calendar_dates set fecha_vencimiento = '2026-12-31' where norma like 'FILA FICTICIA%';
  exception when others then v_err := sqlerrm;
  end;
  insert into r (escenario, verificacion, esperado, obtenido, ok) values
    ('3', 'authenticated: UPDATE (correr un vencimiento)', 'rechaza: permiso denegado', coalesce(v_err, 'NO RECHAZÓ'), v_err like 'permission denied%');
  v_err := null;
  begin
    delete from public.tax_calendar_dates where norma like 'FILA FICTICIA%';
  exception when others then v_err := sqlerrm;
  end;
  insert into r (escenario, verificacion, esperado, obtenido, ok) values
    ('3', 'authenticated: DELETE', 'rechaza: permiso denegado', coalesce(v_err, 'NO RECHAZÓ'), v_err like 'permission denied%');
end
$$;

-- ── 4. Visitante sin sesión ──
reset role;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
do $$
declare v_err text;
begin
  v_err := null;
  begin
    perform 1 from public.tax_calendar_dates limit 1;
  exception when others then v_err := sqlerrm;
  end;
  insert into r (escenario, verificacion, esperado, obtenido, ok) values
    ('4', 'anon: leer el calendario', 'rechaza: permiso denegado', coalesce(v_err, 'NO RECHAZÓ'), v_err like 'permission denied%');
end
$$;

reset role;
select n, escenario, verificacion, esperado, obtenido, ok from r order by n;

rollback;
