-- Pruebas · P5/P8: catálogo RUT vs códigos FE, renta e IVA separados, combinaciones, vigencias y calendario.
-- Fecha: 2026-11-07 · Proyecto taqjemqjtumhwptchcxk · Organización de pruebas 374. NO DEJA DATOS (begin … rollback).
-- Requiere, en este orden y sin aplicar todavía: 20261108140500_responsabilidades_fiscales_en.sql (H2),
-- 20261108160000_tributario_catalogo_rut_y_codigos_fe.sql y 20261108160500_tributario_perfil_renta_iva.sql. Mientras no
-- estén aplicadas, su cuerpo se pega donde dice «MIGRACIÓN …» (así se obtuvo el .resultado.txt). Entre la del catálogo
-- y la del perfil se crean vigencias con el campo combinado viejo para probar la migración de datos.
-- Usuario simulado: el miembro activo de la org 374 (sesión con RLS y auth.uid()).

begin;
create temp table r (n serial primary key, verificacion text, esperado text, obtenido text, ok boolean);
grant all on r to authenticated, anon; grant usage on sequence r_n_seq to authenticated, anon;

-- ═══ MIGRACIÓN H2 (20261108140500) ═══
-- ═══ MIGRACIÓN CATÁLOGO (20261108160000) ═══

-- 1 · Catálogo del RUT y códigos del documento electrónico
insert into r (verificacion, esperado, obtenido, ok)
select 'Catálogo RUT: códigos cargados / no vigentes', '51 / {11,12}',
       count(*)::text || ' / ' || (array_agg(codigo order by codigo) filter (where not vigente))::text,
       count(*) = 51 and (array_agg(codigo order by codigo) filter (where not vigente)) = array['11','12']
  from public.rut_responsabilidades;
insert into r (verificacion, esperado, obtenido, ok)
select 'Catálogo RUT: todo pendiente de validación', '0 validados', count(*) filter (where estado_validacion <> 'pendiente_validacion')::text || ' validados',
       count(*) filter (where estado_validacion <> 'pendiente_validacion') = 0
  from public.rut_responsabilidades;
insert into r (verificacion, esperado, obtenido, ok)
select 'Códigos FE: estado de validación', 'O-48,O-49 no_vigente_por_confirmar; resto pendiente_validacion',
       string_agg(code || '=' || estado_validacion, '; ' order by sort_order),
       bool_and(case when code in ('O-48','O-49') then estado_validacion = 'no_vigente_por_confirmar' else estado_validacion = 'pendiente_validacion' end)
  from public.dian_fiscal_responsibilities;
insert into r (verificacion, esperado, obtenido, ok)
select 'Códigos FE: descripciones sin cambio', 'Gran contribuyente … No responsable (persona natural)',
       string_agg(description, ' · ' order by sort_order),
       string_agg(description, ' · ' order by sort_order) = 'Gran contribuyente · Autorretenedor · Agente de retención IVA · Régimen simple de tributación · Responsable de IVA · No responsable de IVA · No responsable (persona natural)'
  from public.dian_fiscal_responsibilities;
insert into r (verificacion, esperado, obtenido, ok)
select 'Mapeo RUT↔FE: R-99-PN sin equivalencia', '0 filas para R-99-PN; 6 filas en total',
       count(*) filter (where fe_codigo = 'R-99-PN')::text || ' / ' || count(*)::text,
       count(*) filter (where fe_codigo = 'R-99-PN') = 0 and count(*) = 6
  from public.rut_fe_responsabilidad_mapeo;

-- 2 · Vigencias con el campo combinado viejo (como estaban antes de separar renta e IVA)
insert into public.organization_tax_profiles (organization_id, vigente_desde, vigente_hasta, regimen, responsabilidades, periodicidad_iva)
values (374, '2019-01-01', '2019-12-31', 'simple', array['O-47','O-48'], 'anual'),
       (374, '2020-01-01', '2020-12-31', 'ordinario', array['O-48','O-13'], 'bimestral'),
       (374, '2021-01-01', '2021-12-31', 'no_responsable_iva', array['R-99-PN'], 'no_aplica'),
       (374, '2022-01-01', '2022-12-31', 'no_responsable_iva', array['O-48'], 'no_aplica'),
       (374, '2023-01-01', '2023-12-31', 'especial', '{}', 'no_aplica');

-- ═══ MIGRACIÓN PERFIL (20261108160500) ═══

insert into r (verificacion, esperado, obtenido, ok)
select format('Migración del campo combinado: %s %s', p.regimen_origen, p.responsabilidades::text), x.e,
       concat_ws(' / ', coalesce(p.regimen_renta, 'NULL'), coalesce(p.condicion_iva, 'NULL'), 'gran=' || coalesce(p.gran_contribuyente::text, 'NULL'), 'revisar=' || p.requiere_revision),
       concat_ws(' / ', coalesce(p.regimen_renta, 'NULL'), coalesce(p.condicion_iva, 'NULL'), 'gran=' || coalesce(p.gran_contribuyente::text, 'NULL'), 'revisar=' || p.requiere_revision) = x.e
  from public.organization_tax_profiles p
  join (values ('2019-01-01'::date, 'simple / responsable / gran=NULL / revisar=true'),
               ('2020-01-01', 'NULL / responsable / gran=true / revisar=true'),
               ('2021-01-01', 'NULL / no_responsable / gran=NULL / revisar=true'),
               ('2022-01-01', 'NULL / NULL / gran=NULL / revisar=true'),
               ('2023-01-01', 'especial / NULL / gran=NULL / revisar=true')) x(d, e) on x.d = p.vigente_desde
 where p.organization_id = 374
 order by p.vigente_desde;

with otra as (
  update public.organization_tax_profiles p set regimen_origen = p.regimen
   where p.regimen_origen is null and p.regimen is not null and p.regimen_renta is null and p.condicion_iva is null
  returning 1)
insert into r (verificacion, esperado, obtenido, ok)
select 'Migración de datos idempotente (segunda pasada)', '0 filas', count(*)::text || ' filas', count(*) = 0 from otra;

delete from public.organization_tax_profiles where organization_id = 374 and vigente_desde < '2024-01-01';

-- 3 · Guardar como el miembro de la org 374
create function pg_temp.g(p_desde date, p_renta text, p_iva text, p_per text, p_gran boolean, p_auto boolean, p_agiva boolean,
                          p_fe text[], p_rut text[], p_motivo text default null, p_id uuid default null)
returns text language plpgsql as $$
declare v uuid; v_det text;
begin
  v := public.fn_perfil_tributario_guardar_v2(374, p_id, p_desde, p_renta, p_iva, p_per, p_gran, p_auto, p_agiva, false, false,
                                              p_fe, p_rut, p_motivo, '{}', '[]'::jsonb, null);
  return 'OK';
exception when others then
  get stacked diagnostics v_det = pg_exception_detail;
  return sqlstate || ' ' || sqlerrm || coalesce(' [' || nullif(v_det, '') || ']', '');
end $$;
grant execute on function pg_temp.g(date, text, text, text, boolean, boolean, boolean, text[], text[], text, uuid) to authenticated;

select set_config('request.jwt.claims', '{"sub":"bb11d6d2-f647-49f7-9b29-aa4c4438abf1","role":"authenticated"}', true);
set local role authenticated;

insert into r (verificacion, esperado, obtenido, ok)
select x.v, x.e, x.o, x.o = x.e from (values
  ('Válida: ordinario + responsable bimestral + gran contribuyente + agente IVA (O-13, O-23; RUT 05,13,23,48)', 'OK',
   pg_temp.g('2026-01-01', 'ordinario', 'responsable', 'bimestral', true, false, true, array['O-13','O-23'], array['05','13','23','48'])),
  ('Contradictoria: no responsable con periodicidad bimestral', '22023 COMBINACION_CONTRADICTORIA [no_responsable_con_periodicidad]',
   pg_temp.g('2025-01-01', 'ordinario', 'no_responsable', 'bimestral', false, false, false, '{}', '{}')),
  ('Contradictoria: SIMPLE responsable de IVA bimestral (art. 915: anual)', '22023 COMBINACION_CONTRADICTORIA [simple_responsable_no_anual]',
   pg_temp.g('2025-01-01', 'simple', 'responsable', 'bimestral', false, false, false, array['O-47'], '{}')),
  ('Contradictoria: ordinario con periodicidad anual', '22023 COMBINACION_CONTRADICTORIA [periodicidad_anual_fuera_de_simple]',
   pg_temp.g('2025-01-01', 'ordinario', 'responsable', 'anual', false, false, false, '{}', '{}')),
  ('Contradictoria: O-47 sin régimen SIMPLE', '22023 COMBINACION_CONTRADICTORIA [fe_o47_sin_simple]',
   pg_temp.g('2025-01-01', 'ordinario', 'responsable', 'bimestral', false, false, false, array['O-47'], '{}')),
  ('Contradictoria: RUT 05 y 47 a la vez con SIMPLE', '22023 COMBINACION_CONTRADICTORIA [rut_regimen_renta_contradictorio,rut_varios_regimenes_renta]',
   pg_temp.g('2025-01-01', 'simple', 'no_responsable', 'no_aplica', false, false, false, array['O-47'], array['05','47'])),
  ('Contradictoria: RUT 49 con responsable de IVA', '22023 COMBINACION_CONTRADICTORIA [rut_iva_contradictorio]',
   pg_temp.g('2025-01-01', 'ordinario', 'responsable', 'bimestral', false, false, false, '{}', array['49'])),
  ('Contradictoria: renta sin definir', '22023 COMBINACION_CONTRADICTORIA [falta_regimen_renta]',
   pg_temp.g('2025-01-01', null, 'responsable', 'bimestral', false, false, false, '{}', '{}')),
  ('Válida: R-99-PN NO equivale a no responsable (responsable de IVA con R-99-PN se acepta)', 'OK',
   pg_temp.g('2024-01-01', 'ordinario', 'responsable', 'cuatrimestral', false, false, false, array['R-99-PN'], '{}')),
  ('Código del RUT inexistente', '22023 RESPONSABILIDAD_RUT_INVALIDA',
   pg_temp.g('2025-01-01', 'ordinario', 'responsable', 'bimestral', false, false, false, '{}', array['99']))
) x(v, e, o);

-- 4 · Periodicidad del IVA: reglas anuales
insert into r (verificacion, esperado, obtenido, ok)
select x.v, x.e, x.o, x.o = x.e from (values
  ('Cambio bimestral → cuatrimestral el 2026-07-01 sin motivo', '22023 COMBINACION_CONTRADICTORIA [periodicidad_cambio_sin_motivo]',
   pg_temp.g('2026-07-01', 'ordinario', 'responsable', 'cuatrimestral', true, false, true, array['O-13','O-23'], '{}'))
) x(v, e, o);
insert into r (verificacion, esperado, obtenido, ok)
select x.v, x.e, x.o, x.o = x.e from (values
  ('El mismo cambio con motivo «otro» (queda como advertencia aceptada)', 'OK',
   pg_temp.g('2026-07-01', 'ordinario', 'responsable', 'cuatrimestral', true, false, true, array['O-13','O-23'], '{}', 'otro'))
) x(v, e, o);
insert into r (verificacion, esperado, obtenido, ok)
select x.v, x.e, x.o, x.o = x.e from (values
  ('Cambio cuatrimestral → bimestral el 2027-01-01 (1 de enero: sin motivo)', 'OK',
   pg_temp.g('2027-01-01', 'ordinario', 'responsable', 'bimestral', true, false, true, array['O-13','O-23'], '{}'))
) x(v, e, o);
insert into r (verificacion, esperado, obtenido, ok)
select x.v, x.e, x.o, x.o = x.e from (values
  ('Ingreso al SIMPLE el 2027-05-01 con IVA anual (tratamiento específico: sin motivo)', 'OK',
   pg_temp.g('2027-05-01', 'simple', 'responsable', 'anual', false, false, false, array['O-47'], array['47','48']))
) x(v, e, o);

insert into r (verificacion, esperado, obtenido, ok)
select 'Vigencias encadenadas de la org 374', '2024-01-01→2025-12-31 · 2026-01-01→2026-06-30 · 2026-07-01→2026-12-31 · 2027-01-01→2027-04-30 · 2027-05-01→abierta',
       string_agg(vigente_desde || '→' || coalesce(vigente_hasta::text, 'abierta'), ' · ' order by vigente_desde),
       string_agg(vigente_desde || '→' || coalesce(vigente_hasta::text, 'abierta'), ' · ' order by vigente_desde)
         = '2024-01-01→2025-12-31 · 2026-01-01→2026-06-30 · 2026-07-01→2026-12-31 · 2027-01-01→2027-04-30 · 2027-05-01→abierta'
  from public.organization_tax_profiles where organization_id = 374;
insert into r (verificacion, esperado, obtenido, ok)
select 'Motivo guardado y campo combinado derivado', 'otro / ordinario; SIMPLE → simple',
       string_agg(coalesce(motivo_cambio_periodicidad, '-') || ' / ' || coalesce(regimen, 'NULL'), '; ' order by vigente_desde),
       string_agg(coalesce(motivo_cambio_periodicidad, '-') || ' / ' || coalesce(regimen, 'NULL'), '; ' order by vigente_desde)
         = '- / ordinario; - / ordinario; otro / ordinario; - / ordinario; - / simple'
  from public.organization_tax_profiles where organization_id = 374;

-- 5 · Un período con dos vigencias (lo que el Centro y el borrador señalan; ver jest para el aviso)
insert into r (verificacion, esperado, obtenido, ok)
select x.v, x.e, x.o::text, x.o::text = x.e from (
  select 'Vigencias dentro del cuatrimestre may–ago 2026' v, '2' e,
         (select count(*) from public.organization_tax_profiles where organization_id = 374 and vigente_desde <= '2026-08-31' and coalesce(vigente_hasta, 'infinity') >= '2026-05-01') o
  union all
  select 'Vigencias dentro del bimestre jul–ago 2026', '1',
         (select count(*) from public.organization_tax_profiles where organization_id = 374 and vigente_desde <= '2026-08-31' and coalesce(vigente_hasta, 'infinity') >= '2026-07-01')
  union all
  select 'Vigencias dentro del año 2027 (IVA anual del SIMPLE)', '2',
         (select count(*) from public.organization_tax_profiles where organization_id = 374 and vigente_desde <= '2027-12-31' and coalesce(vigente_hasta, 'infinity') >= '2027-01-01')
) x;

-- 6 · H2: la vigencia futura rige desde su fecha sin tocar documentos anteriores
insert into r (verificacion, esperado, obtenido, ok)
select x.v, x.e, coalesce(x.o, 'NULL'), coalesce(x.o, 'NULL') = x.e from (values
  ('Responsabilidades FE de un documento del 2026-12-31', '{O-13,O-23}', public.fn_responsabilidades_fiscales_en(374, '2026-12-31')::text),
  ('Responsabilidades FE de un documento del 2027-05-01 (vigencia futura, sin volver a guardar)', '{O-47}', public.fn_responsabilidades_fiscales_en(374, '2027-05-01')::text),
  ('Responsabilidades FE de un documento del 2027-04-30', '{O-13,O-23}', public.fn_responsabilidades_fiscales_en(374, '2027-04-30')::text)
) x(v, e, o);
reset role;
insert into r (verificacion, esperado, obtenido, ok)
select 'Ficha de la empresa: la vigencia futura no la cambia', '{O-13,O-23} (la que rige hoy)', fiscal_responsibilities::text,
       fiscal_responsibilities = array['O-13','O-23']
  from public.organizations where id = 374;
insert into r (verificacion, esperado, obtenido, ok)
select 'Los documentos expedidos no guardan responsabilidades del emisor (no hay nada que reescribir)', '0 columnas',
       count(*)::text || ' columnas', count(*) = 0
  from information_schema.columns
 where table_schema = 'public' and table_name in ('invoice_sales', 'support_documents', 'sales') and column_name ilike '%responsab%';

-- 7 · Calendario
insert into r (verificacion, esperado, obtenido, ok)
select 'Calendario 2026 y 2027 cargado', '0 fechas (el Centro debe decir «incompleto», no «sin obligaciones»)', count(*)::text || ' fechas', count(*) = 0
  from public.tax_calendar_dates where anio in (2026, 2027);

-- 8 · Controles
select set_config('request.jwt.claims', '{"sub":"bb11d6d2-f647-49f7-9b29-aa4c4438abf1","role":"authenticated"}', true);
set local role authenticated;
do $$
declare v_err text;
begin
  begin
    perform public.fn_perfil_tributario_guardar(374, null, '2028-01-01', 'ordinario', array['O-48'], false, false, 'bimestral', '[]'::jsonb, null);
  exception when others then v_err := sqlstate || ' ' || sqlerrm; end;
  insert into r (verificacion, esperado, obtenido, ok) values ('La vía vieja (campo combinado) ya no está disponible para usuarios', '42501 permission denied', coalesce(v_err, 'NO RECHAZÓ'), v_err like '42501%');
end $$;
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000aa","role":"authenticated"}', true);
set local role authenticated;
insert into r (verificacion, esperado, obtenido, ok)
select 'Usuario que no es miembro', 'rechazo de acceso', o, o not in ('OK') from (select pg_temp.g('2028-01-01', 'ordinario', 'responsable', 'bimestral', false, false, false, '{}', '{}') o) x;
reset role;
set local role anon;
do $$
declare v_err text;
begin
  begin
    perform public.fn_perfil_tributario_guardar_v2(374, null, '2028-01-01', 'ordinario', 'responsable', 'bimestral', false, false, false, false, false, '{}', '{}', null, '{}', '[]'::jsonb, null);
  exception when others then v_err := sqlstate || ' ' || sqlerrm; end;
  insert into r (verificacion, esperado, obtenido, ok) values ('anon (clave pública)', '42501 permission denied', coalesce(v_err, 'NO RECHAZÓ'), v_err like '42501%');
end $$;
reset role;

select n, verificacion, esperado, obtenido, ok from r order by n;
rollback;
