-- Pruebas · Ronda 4 del Contador (2026-11-09, docs/contador/RESPUESTAS-CONTADOR-RONDA-4-2026-11-09.md), «Perfil y
-- documentos históricos»: catálogo del RUT no exhaustivo (código 67 por norma; 11 y 12 históricos), códigos de FE
-- cotejados con la tabla 13.2.6.1 del anexo 1.9, SIMPLE y autorretención (15 y 59 no equivalentes; RUT contradictorio
-- para aclaración, sin borrar), gran contribuyente (ordinaria / excepcional, cuatrimestral BLOQUEADA, transición sin
-- cortes inventados) y motivos de cambio de periodicidad («documentado» ≠ «procedente»).
-- Proyecto taqjemqjtumhwptchcxk · Organización de pruebas 374. NO DEJA DATOS (begin … rollback).
-- Requiere, en este orden y SIN aplicar: 20261108140500, 20261108160000, 20261108160500, 20261108161000,
-- 20261108161500 y 20261108165000 (esta última no cambia en la ronda 4: se carga para mostrar que la cadena completa
-- corre). Se pegan donde dice «MIGRACIONES», dentro de la misma transacción.
-- Usuario simulado: el miembro activo de la org 374 (sesión con RLS y auth.uid()).

begin;

-- ═══ MIGRACIONES (solo en la prueba en seco, mientras no estén aplicadas) ═══

create temp table r (n serial primary key, escenario text, verificacion text, esperado text, obtenido text, ok boolean);
grant all on r to authenticated, anon;
grant usage on sequence r_n_seq to authenticated, anon;
-- Resultado de un guardado, leído en otra sentencia (una sentencia no ve lo que escribe una función que ella llama).
create temp table res (k text primary key, v text);
grant all on res to authenticated;

-- ── A · Catálogo del RUT y códigos de FE ──
insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'A', 'Código 67 (CARF) por norma, pendiente de validación', 'norma · pendiente_validacion · vigente · Resolución DIAN 000227 de 2025, artículo 1.6.11.5',
       tipo_fuente || ' · ' || estado_validacion || ' · ' || case when vigente then 'vigente' else 'no vigente' end || ' · ' || split_part(fuente, ' (', 1),
       tipo_fuente = 'norma' and estado_validacion = 'pendiente_validacion' and vigente
         and fuente like 'Resolución DIAN 000227 de 2025, artículo 1.6.11.5%'
  from public.rut_responsabilidades where codigo = '67';
insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'A', 'Catálogo por tipo de fuente (no exhaustivo)', 'historico 2 · instructivo 48 · norma 1',
       string_agg(tipo_fuente || ' ' || n, ' · ' order by tipo_fuente), string_agg(tipo_fuente || ' ' || n, ' · ' order by tipo_fuente) = 'historico 2 · instructivo 48 · norma 1'
  from (select tipo_fuente, count(*) n from public.rut_responsabilidades group by tipo_fuente) x;
insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'A', '11 y 12: evidencia histórica, no vigentes', '11 historico/no vigente · 12 historico/no vigente',
       string_agg(codigo || ' ' || estado_validacion || '/' || case when vigente then 'vigente' else 'no vigente' end, ' · ' order by codigo),
       bool_and(estado_validacion = 'historico' and not vigente and tipo_fuente = 'historico') and count(*) = 2
  from public.rut_responsabilidades where codigo in ('11', '12');
insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'A', 'El comentario de la tabla dice que el catálogo NO es exhaustivo', 'contiene «NO es exhaustivo»',
       case when obj_description('public.rut_responsabilidades'::regclass, 'pg_class') like '%NO es exhaustivo%' then 'contiene «NO es exhaustivo»' else 'no lo dice' end,
       obj_description('public.rut_responsabilidades'::regclass, 'pg_class') like '%NO es exhaustivo%';
insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'A', 'Códigos de FE según la tabla 13.2.6.1 del anexo 1.9', 'O-13, O-15, O-23, O-47, R-99-PN cotejados · O-48, O-49 no_pertenece_tabla_fe',
       string_agg(code || '=' || estado_validacion, '; ' order by code),
       bool_and(case when code in ('O-48', 'O-49') then estado_validacion = 'no_pertenece_tabla_fe' else estado_validacion = 'cotejado_fuente_oficial' end)
         and bool_and(fuente like '%13.2.6.1%')
  from public.dian_fiscal_responsibilities;
insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'A', 'R-99-PN se denomina «No aplica – Otros» (nombre y descripción)', 'No aplica – Otros · No aplica – Otros',
       nombre_anexo || ' · ' || description, nombre_anexo = 'No aplica – Otros' and description = 'No aplica – Otros'
  from public.dian_fiscal_responsibilities where code = 'R-99-PN';
insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'A', 'Las demás descripciones de FE no cambian', 'O-13 Gran contribuyente · O-48 Responsable de IVA',
       string_agg(code || ' ' || description, ' · ' order by code),
       string_agg(code || ' ' || description, ' · ' order by code) = 'O-13 Gran contribuyente · O-48 Responsable de IVA'
  from public.dian_fiscal_responsibilities where code in ('O-13', 'O-48');

-- ── Ayudantes (como el miembro de la org 374) ──
create function pg_temp.g(p_desde date, p_d jsonb, p_id uuid default null)
returns text language plpgsql as $$
declare v uuid; v_det text;
begin
  v := public.fn_perfil_tributario_guardar_v2(374, p_id, p_desde, p_d, '[]'::jsonb, null);
  return 'OK';
exception when others then
  get stacked diagnostics v_det = pg_exception_detail;
  return sqlstate || ' ' || sqlerrm || coalesce(' [' || nullif(v_det, '') || ']', '');
end $$;
create function pg_temp.ev(p_desde date, p_proc text, p_fund text)
returns text language plpgsql as $$
begin
  return (public.fn_perfil_tributario_evaluar_cambio(374, (select id from public.organization_tax_profiles where organization_id = 374 and vigente_desde = p_desde),
                                                     p_proc, p_fund)) ->> 'procedencia';
exception when others then return sqlstate || ' ' || sqlerrm;
end $$;
create function pg_temp.fila(p_desde date) returns text language sql as $$
  select concat_ws(' · ', 'aclaraciones ' || aclaraciones::text, 'revisar ' || requiere_revision, 'rut ' || responsabilidades_rut::text)
    from public.organization_tax_profiles where organization_id = 374 and vigente_desde = p_desde;
$$;
grant execute on function pg_temp.g(date, jsonb, uuid) to authenticated;
grant execute on function pg_temp.ev(date, text, text) to authenticated;
grant execute on function pg_temp.fila(date) to authenticated;

create temp table base as select jsonb_build_object(
  'regimen_renta', 'ordinario', 'condicion_iva', 'responsable', 'periodicidad_iva', 'bimestral', 'agente_retencion', true,
  'responsabilidades_rut', jsonb_build_array('05', '07', '48')) as d;
create temp table simple as select jsonb_build_object(
  'regimen_renta', 'simple', 'condicion_iva', 'responsable', 'periodicidad_iva', 'anual',
  'responsabilidades', jsonb_build_array('O-47'), 'responsabilidades_rut', jsonb_build_array('47', '48')) as d;
create temp table gran as select jsonb_build_object(
  'regimen_renta', 'ordinario', 'condicion_iva', 'responsable', 'periodicidad_iva', 'bimestral',
  'gran_contribuyente', true, 'gran_contribuyente_acto', 'Resolución 000999', 'gran_contribuyente_acto_fecha', '2025-11-20',
  'gran_contribuyente_calificacion', 'ordinaria', 'gran_contribuyente_desde', '2026-01-01',
  'responsabilidades', jsonb_build_array('O-13'), 'responsabilidades_rut', jsonb_build_array('05', '13', '48')) as d;
grant select on base, simple, gran to authenticated;

select set_config('request.jwt.claims', '{"sub":"bb11d6d2-f647-49f7-9b29-aa4c4438abf1","role":"authenticated"}', true);
set local role authenticated;

-- ── B · Catálogo no exhaustivo y SIMPLE ──
insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'B', x.v, x.e, x.o, x.o = x.e from base b, simple s, lateral (values
  ('RUT con un código que el catálogo no tiene (68): se guarda', 'OK', pg_temp.g('2019-01-01', b.d || '{"responsabilidades_rut":["05","07","48","68"]}')),
  ('RUT con un código mal formado (AB): se rechaza por su forma', '22023 RESPONSABILIDAD_RUT_INVALIDA', pg_temp.g('2019-06-01', b.d || '{"responsabilidades_rut":["05","AB"]}')),
  ('RUT con 11 (histórico): se guarda', 'OK', pg_temp.g('2020-01-01', b.d || '{"responsabilidades_rut":["05","07","11","48"]}')),
  ('SIMPLE con 15 en el RUT: se guarda (RUT contradictorio, para aclaración)', 'OK', pg_temp.g('2021-01-01', s.d || '{"responsabilidades_rut":["47","48","15"]}')),
  ('SIMPLE con 59 en el RUT: se guarda (para aclaración)', 'OK', pg_temp.g('2021-07-01', s.d || '{"responsabilidades_rut":["47","48","59"]}')),
  ('SIMPLE con autorretención especial marcada', '22023 COMBINACION_CONTRADICTORIA [simple_con_autorretencion]', pg_temp.g('2022-01-01', s.d || '{"autorretencion_especial":true}')),
  ('SIMPLE con autorretención ordinaria marcada (con acto)', '22023 COMBINACION_CONTRADICTORIA [simple_con_autorretencion]',
   pg_temp.g('2022-01-01', s.d || '{"autorretenedor":true,"autorretenedor_acto":"Res. 1","autorretenedor_acto_fecha":"2021-01-01"}')),
  ('Ordinario: autorretención especial (59) sin ser autorretenedor ordinario (15)', 'OK',
   pg_temp.g('2022-07-01', b.d || '{"autorretencion_especial":true,"responsabilidades_rut":["05","07","48","59"]}')),
  ('Ordinario: 15 en el RUT con solo la especial (no son equivalentes)', '22023 COMBINACION_CONTRADICTORIA [rut_15_sin_autorretenedor]',
   pg_temp.g('2023-01-01', b.d || '{"autorretencion_especial":true,"responsabilidades_rut":["05","07","15","48","59"]}'))
) x(v, e, o);

insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'B', x.v, x.e, coalesce(pg_temp.fila(x.d), 'NO ESTÁ'), pg_temp.fila(x.d) = x.e from (values
  ('Vigencia con 68: para aclaración, sin borrar el código', '2019-01-01'::date, 'aclaraciones {rut_codigo_fuera_de_catalogo} · revisar true · rut {05,07,48,68}'),
  ('Vigencia con 11: histórico, para aclaración', '2020-01-01', 'aclaraciones {rut_codigo_no_vigente} · revisar true · rut {05,07,11,48}'),
  ('SIMPLE con 15: para aclaración y el 15 se conserva', '2021-01-01', 'aclaraciones {rut_simple_con_autorretencion_para_aclaracion} · revisar true · rut {47,48,15}'),
  ('SIMPLE con 59: para aclaración y el 59 se conserva', '2021-07-01', 'aclaraciones {rut_simple_con_autorretencion_para_aclaracion} · revisar true · rut {47,48,59}'),
  ('Ordinario con 59: sin aclaraciones', '2022-07-01', 'aclaraciones {} · revisar false · rut {05,07,48,59}')
) x(v, d, e);

-- ── C · Gran contribuyente ──
insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'C', x.v, x.e, x.o, x.o = x.e from gran g, lateral (values
  ('Ordinaria (resolución del 2025-11-20): efectos 2026-01-01, vigencia 2026-01-01 bimestral', 'OK', pg_temp.g('2026-01-01', g.d)),
  ('Ordinaria con efectos el 2025-12-01 (antes del 1 de enero siguiente)', '22023 COMBINACION_CONTRADICTORIA [gran_contribuyente_fecha_efectos]',
   pg_temp.g('2025-12-01', g.d || '{"gran_contribuyente_desde":"2025-12-01"}')),
  ('Vigencia gran contribuyente que empieza antes de los efectos', '22023 COMBINACION_CONTRADICTORIA [gran_contribuyente_antes_de_efectos]',
   pg_temp.g('2025-09-01', g.d)),
  ('Ya exigible: cuatrimestral se BLOQUEA (no se advierte)', '22023 COMBINACION_CONTRADICTORIA [gran_contribuyente_no_bimestral]',
   pg_temp.g('2027-01-01', g.d || '{"periodicidad_iva":"cuatrimestral"}')),
  ('Sin calificación (ordinaria o excepcional)', '22023 COMBINACION_CONTRADICTORIA [gran_contribuyente_sin_calificacion]',
   pg_temp.g('2027-01-01', g.d - 'gran_contribuyente_calificacion')),
  ('Sin la fecha del acto', '22023 COMBINACION_CONTRADICTORIA [gran_contribuyente_sin_acto]',
   pg_temp.g('2027-01-01', g.d - 'gran_contribuyente_acto_fecha')),
  ('Excepcional con efectos antes del acto', '22023 COMBINACION_CONTRADICTORIA [gran_contribuyente_fecha_efectos]',
   pg_temp.g('2026-06-10', g.d || '{"gran_contribuyente_calificacion":"excepcional","gran_contribuyente_acto_fecha":"2026-06-10","gran_contribuyente_desde":"2026-06-01"}'))
) x(v, e, o);

-- Excepcional con efectos a mitad del bimestre mayo–junio: la vigencia anterior se cierra el día antes (sin solape), la
-- nueva queda para aclaración y el sistema no inventa un corte de período.
reset role;
delete from public.organization_tax_profiles where organization_id = 374 and vigente_desde = '2026-01-01';
select set_config('request.jwt.claims', '{"sub":"bb11d6d2-f647-49f7-9b29-aa4c4438abf1","role":"authenticated"}', true);
set local role authenticated;
insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'C', 'Vigencia 2026-01-01 sin gran contribuyente (cuatrimestral)', 'OK', x.o, x.o = 'OK'
  from base b, lateral (select pg_temp.g('2026-01-01', b.d || '{"periodicidad_iva":"cuatrimestral"}') o) x;
insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'C', 'Calificación excepcional desde el 2026-06-10 (a mitad de bimestre), bimestral', 'OK', x.o, x.o = 'OK'
  from gran g, lateral (select pg_temp.g('2026-06-10', g.d || '{"gran_contribuyente_calificacion":"excepcional","gran_contribuyente_acto_fecha":"2026-06-10","gran_contribuyente_desde":"2026-06-10","motivo_cambio_periodicidad":"designacion_gran_contribuyente","cambio_periodicidad_hecho":"Resolución excepcional de la DIAN","cambio_periodicidad_norma":"Res. 227 de 2025, art. 1.1.4.3","cambio_periodicidad_fecha":"2026-06-10"}') o) x;
insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'C', 'Transición: la anterior termina el 2026-06-09, la nueva para aclaración, sin cortes inventados',
       '2026-01-01→2026-06-09 · 2026-06-10→abierta · {gran_contribuyente_transicion_por_resolver} · documentado/por_evaluar',
       string_agg(vigente_desde || '→' || coalesce(vigente_hasta::text, 'abierta'), ' · ' order by vigente_desde)
         || ' · ' || (select aclaraciones::text || ' · ' || cambio_periodicidad_estado || '/' || cambio_periodicidad_procedencia
                        from public.organization_tax_profiles where organization_id = 374 and vigente_desde = '2026-06-10'),
       string_agg(vigente_desde || '→' || coalesce(vigente_hasta::text, 'abierta'), ' · ' order by vigente_desde)
         || ' · ' || (select aclaraciones::text || ' · ' || cambio_periodicidad_estado || '/' || cambio_periodicidad_procedencia
                        from public.organization_tax_profiles where organization_id = 374 and vigente_desde = '2026-06-10')
         = '2026-01-01→2026-06-09 · 2026-06-10→abierta · {gran_contribuyente_transicion_por_resolver} · documentado/por_evaluar'
  from public.organization_tax_profiles where organization_id = 374 and vigente_desde >= '2026-01-01';

-- ── D · Motivos de cambio de periodicidad: «documentado» ≠ «procedente» ──
insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'D', 'Cambio a mitad de año con motivo «corrección de clasificación» (solo descriptivo)', 'OK', x.o, x.o = 'OK'
  from base b, lateral (select pg_temp.g('2027-07-01', b.d || '{"periodicidad_iva":"cuatrimestral","motivo_cambio_periodicidad":"correccion_clasificacion","cambio_periodicidad_hecho":"Ingresos del año anterior mal clasificados","cambio_periodicidad_norma":"ET art. 600","cambio_periodicidad_fecha":"2027-07-01"}') o) x;
insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'D', x.v, x.e, x.o, x.o = x.e from (values
  ('Estado del cambio documentado: la procedencia queda por evaluar', 'documentado/por_evaluar',
   (select cambio_periodicidad_estado || '/' || cambio_periodicidad_procedencia from public.organization_tax_profiles where organization_id = 374 and vigente_desde = '2027-07-01')),
  ('Evaluar «procedente» sin fundamento', '22023 FUNDAMENTO_REQUERIDO', pg_temp.ev('2027-07-01', 'procedente', null)),
  ('Evaluar un cambio que no está documentado (vigencia sin cambio)', '22023 CAMBIO_NO_DOCUMENTADO', pg_temp.ev('2026-01-01', 'procedente', 'Fundamento suficiente')),
  ('Evaluar con una procedencia que no existe', '22023 PROCEDENCIA_INVALIDA', pg_temp.ev('2027-07-01', 'aprobado', 'Fundamento suficiente')),
  ('Evaluar «procedente» con fundamento', 'procedente', pg_temp.ev('2027-07-01', 'procedente', 'Concepto del Contador sobre la corrección de clasificación'))
) x(v, e, o);
insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'D', 'Quién y cuándo evaluó', 'el usuario · con fecha · con fundamento',
       case when cambio_periodicidad_evaluado_por = 'bb11d6d2-f647-49f7-9b29-aa4c4438abf1' then 'el usuario' else coalesce(cambio_periodicidad_evaluado_por::text, 'nadie') end
         || ' · ' || case when cambio_periodicidad_evaluado_en is not null then 'con fecha' else 'sin fecha' end
         || ' · ' || case when cambio_periodicidad_evaluacion is not null then 'con fundamento' else 'sin fundamento' end,
       cambio_periodicidad_evaluado_por = 'bb11d6d2-f647-49f7-9b29-aa4c4438abf1' and cambio_periodicidad_evaluado_en is not null and cambio_periodicidad_evaluacion is not null
  from public.organization_tax_profiles where organization_id = 374 and vigente_desde = '2027-07-01';
insert into res select 'mismo', pg_temp.g('2027-07-01', b.d || '{"periodicidad_iva":"cuatrimestral","motivo_cambio_periodicidad":"correccion_clasificacion","cambio_periodicidad_hecho":"Ingresos del año anterior mal clasificados","cambio_periodicidad_norma":"ET art. 600","cambio_periodicidad_fecha":"2027-07-01"}',
                (select id from public.organization_tax_profiles where organization_id = 374 and vigente_desde = '2027-07-01')) from base b;
insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'D', 'Guardar otra vez con los mismos datos conserva la evaluación', 'OK · procedente', x.v || ' · ' || p.cambio_periodicidad_procedencia,
       x.v = 'OK' and p.cambio_periodicidad_procedencia = 'procedente'
  from res x, public.organization_tax_profiles p
 where x.k = 'mismo' and p.organization_id = 374 and p.vigente_desde = '2027-07-01';
insert into res select 'otro_hecho', pg_temp.g('2027-07-01', b.d || '{"periodicidad_iva":"cuatrimestral","motivo_cambio_periodicidad":"correccion_clasificacion","cambio_periodicidad_hecho":"Otro hecho distinto","cambio_periodicidad_norma":"ET art. 600","cambio_periodicidad_fecha":"2027-07-01"}',
                (select id from public.organization_tax_profiles where organization_id = 374 and vigente_desde = '2027-07-01')) from base b;
insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'D', 'Cambiar el hecho devuelve la procedencia a «por evaluar»', 'OK · por_evaluar · sin evaluación', x.v || ' · ' || p.cambio_periodicidad_procedencia
         || ' · ' || case when p.cambio_periodicidad_evaluacion is null then 'sin evaluación' else 'con evaluación' end,
       x.v = 'OK' and p.cambio_periodicidad_procedencia = 'por_evaluar' and p.cambio_periodicidad_evaluacion is null
  from res x, public.organization_tax_profiles p
 where x.k = 'otro_hecho' and p.organization_id = 374 and p.vigente_desde = '2027-07-01';
insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'D', 'Motivo que no existe en la lista', '23514 (CHECK de la columna)', split_part(x.o, ' ', 1) || ' (CHECK de la columna)', x.o like '23514%'
  from base b, lateral (select pg_temp.g('2027-04-01', b.d || '{"periodicidad_iva":"bimestral","motivo_cambio_periodicidad":"autorizado_por_motivo"}') o) x;
reset role;

-- ── E · Permisos ──
update public.organization_members set is_super_admin = false, role_id = 4
 where organization_id = 374 and user_id = 'bb11d6d2-f647-49f7-9b29-aa4c4438abf1';
select set_config('request.jwt.claims', '{"sub":"bb11d6d2-f647-49f7-9b29-aa4c4438abf1","role":"authenticated"}', true);
set local role authenticated;
insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'E', 'Evaluar la procedencia con rol Empleado (sin finance.approve)', '42501 SIN_PERMISO', x.o, x.o = '42501 SIN_PERMISO'
  from (select pg_temp.ev('2027-07-01', 'procedente', 'Fundamento suficiente') o) x;
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'E', 'Evaluar desde otra organización (no miembro)', 'rechaza', case when x.o in ('procedente', 'no_procedente', 'por_evaluar') then x.o else 'rechaza' end,
       x.o not in ('procedente', 'no_procedente', 'por_evaluar')
  from (select pg_temp.ev('2027-07-01', 'procedente', 'Fundamento suficiente') o) x;
reset role;
set local role anon;
do $$
declare v_err text;
begin
  begin perform public.fn_perfil_tributario_evaluar_cambio(374, gen_random_uuid(), 'procedente', 'Fundamento suficiente'); exception when others then v_err := sqlstate; end;
  insert into r (escenario, verificacion, esperado, obtenido, ok) values ('E', 'anon: evaluar la procedencia', '42501', coalesce(v_err, 'NO RECHAZÓ'), v_err = '42501');
  v_err := null;
  begin perform public.fn_perfil_tributario_aclaraciones('{}'::jsonb); exception when others then v_err := sqlstate; end;
  insert into r (escenario, verificacion, esperado, obtenido, ok) values ('E', 'anon: aclaraciones', '42501', coalesce(v_err, 'NO RECHAZÓ'), v_err = '42501');
end $$;
reset role;

-- ── F · La cadena completa corrió (incluida 20261108165000, sin cambios en la ronda 4) ──
insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'F', 'Funciones de la cadena presentes', 'aclaraciones · evaluar_cambio · decisión de período · instantánea · tarifa exacta',
       concat_ws(' · ',
         case when to_regprocedure('public.fn_perfil_tributario_aclaraciones(jsonb)') is not null then 'aclaraciones' end,
         case when to_regprocedure('public.fn_perfil_tributario_evaluar_cambio(integer,uuid,text,text)') is not null then 'evaluar_cambio' end,
         case when to_regprocedure('public.fn_tributario_decision_periodo_registrar(integer,text,date,date,text,text,text,uuid,text)') is not null then 'decisión de período' end,
         case when to_regclass('public.document_party_snapshots') is not null then 'instantánea' end,
         case when to_regprocedure('public.fn_tarifa_exacta_impuesto(uuid)') is not null then 'tarifa exacta' end),
       to_regprocedure('public.fn_perfil_tributario_aclaraciones(jsonb)') is not null
         and to_regprocedure('public.fn_perfil_tributario_evaluar_cambio(integer,uuid,text,text)') is not null
         and to_regprocedure('public.fn_tributario_decision_periodo_registrar(integer,text,date,date,text,text,text,uuid,text)') is not null
         and to_regclass('public.document_party_snapshots') is not null
         and to_regprocedure('public.fn_tarifa_exacta_impuesto(uuid)') is not null;

select n, escenario, verificacion, esperado, obtenido, ok from r order by n;

rollback;
