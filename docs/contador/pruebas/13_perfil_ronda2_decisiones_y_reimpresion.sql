-- Pruebas · Ronda 2 del Contador: catálogo RUT cotejado con IN-CAC-0237, perfil con calidades y soporte, cambio de
-- periodicidad pendiente, decisiones de período e instantáneas de reimpresión fiel.
-- Fecha: 2026-11-07 · Proyecto taqjemqjtumhwptchcxk · Organización de pruebas 374. NO DEJA DATOS: termina con un error
-- a propósito que devuelve la tabla de resultados, y todo se revierte.
-- Requiere, en este orden y sin aplicar todavía: 20261108140500 (H2), 20261108160000 (catálogo), 20261108160500 (perfil),
-- 20261108161000 (decisiones) y 20261108161500 (instantáneas). Su cuerpo se pega donde dice «MIGRACIÓN …». En la corrida,
-- el marco normativo de cada código del catálogo se abrevió (los códigos, nombres, numerales y páginas son los del archivo).
-- Usuario simulado: el miembro activo de la org 374 (sesión con RLS y auth.uid()).

begin;
create temp table r (n serial primary key, verificacion text, esperado text, obtenido text, ok boolean);
grant all on r to authenticated, anon; grant usage on sequence r_n_seq to authenticated, anon;
create temp table f (clave text primary key, valor text);
grant all on f to authenticated;

-- ═══ MIGRACIÓN H2 (20261108140500) ═══
-- ═══ MIGRACIÓN CATÁLOGO (20261108160000) ═══

-- A · Catálogo
insert into r (verificacion, esperado, obtenido, ok)
select 'Catálogo RUT: cotejados con IN-CAC-0237 / no vigentes', '48 cotejados · {11,12} no vigentes y pendientes · sin 51',
       count(*) filter (where estado_validacion = 'cotejado_fuente_oficial')::text || ' cotejados · '
         || (array_agg(codigo order by codigo) filter (where not vigente))::text || ' · 51: ' || count(*) filter (where codigo = '51')::text,
       count(*) filter (where estado_validacion = 'cotejado_fuente_oficial') = 48
         and (array_agg(codigo order by codigo) filter (where not vigente)) = array['11','12']
         and count(*) filter (where codigo = '51') = 0
  from public.rut_responsabilidades;
insert into r (verificacion, esperado, obtenido, ok)
select 'Código 47 con su fuente oficial', 'Régimen Simple de Tributación - SIMPLE · numeral 31.31, página 68',
       nombre || ' · ' || fuente, nombre = 'Régimen Simple de Tributación - SIMPLE' and fuente like '%numeral 31.31, página 68'
  from public.rut_responsabilidades where codigo = '47';
insert into r (verificacion, esperado, obtenido, ok)
select 'Códigos FE: O-48 y O-49 no validados como FE; resto pendiente', 'O-48, O-49 no_validado_como_fe',
       string_agg(code || '=' || estado_validacion, '; ' order by sort_order),
       bool_and(case when code in ('O-48','O-49') then estado_validacion = 'no_validado_como_fe' else estado_validacion = 'pendiente_validacion' end)
  from public.dian_fiscal_responsibilities;
insert into r (verificacion, esperado, obtenido, ok)
select 'Mapeo RUT↔FE solo directo', '13, 15, 23, 47 (sin 48, 49 ni R-99-PN)', string_agg(rut_codigo || '→' || fe_codigo, ', ' order by rut_codigo),
       string_agg(rut_codigo, ',' order by rut_codigo) = '13,15,23,47'
  from public.rut_fe_responsabilidad_mapeo;

-- B · Vigencias con el campo combinado viejo
insert into public.organization_tax_profiles (organization_id, vigente_desde, vigente_hasta, regimen, responsabilidades, periodicidad_iva)
values (374, '2019-01-01', '2019-12-31', 'simple', array['O-47','O-48'], 'anual'),
       (374, '2020-01-01', '2020-12-31', 'ordinario', array['O-48','O-13'], 'bimestral'),
       (374, '2021-01-01', '2021-12-31', 'no_responsable_iva', array['R-99-PN'], 'no_aplica');

-- ═══ MIGRACIÓN PERFIL (20261108160500) ═══
-- ═══ MIGRACIÓN DECISIONES (20261108161000) ═══
-- ═══ MIGRACIÓN INSTANTÁNEAS (20261108161500) ═══

insert into r (verificacion, esperado, obtenido, ok)
select format('Migración del campo combinado: %s %s', p.regimen_origen, p.responsabilidades::text), x.e,
       concat_ws(' / ', coalesce(p.regimen_renta, 'NULL'), coalesce(p.condicion_iva, 'NULL'), 'gran=' || coalesce(p.gran_contribuyente::text, 'NULL'), 'revisar=' || p.requiere_revision),
       concat_ws(' / ', coalesce(p.regimen_renta, 'NULL'), coalesce(p.condicion_iva, 'NULL'), 'gran=' || coalesce(p.gran_contribuyente::text, 'NULL'), 'revisar=' || p.requiere_revision) = x.e
  from public.organization_tax_profiles p
  join (values ('2019-01-01'::date, 'simple / responsable / gran=NULL / revisar=true'),
               ('2020-01-01', 'NULL / responsable / gran=true / revisar=true'),
               ('2021-01-01', 'NULL / no_responsable / gran=NULL / revisar=true')) x(d, e) on x.d = p.vigente_desde
 where p.organization_id = 374 order by p.vigente_desde;
delete from public.organization_tax_profiles where organization_id = 374 and vigente_desde < '2024-01-01';

-- C · Combinaciones (como el miembro de la org 374)
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
grant execute on function pg_temp.g(date, jsonb, uuid) to authenticated;

-- Base válida: ordinario, responsable bimestral, gran contribuyente con acto, agente de IVA.
create temp table base_ok as select jsonb_build_object(
  'regimen_renta', 'ordinario', 'condicion_iva', 'responsable', 'periodicidad_iva', 'bimestral',
  'gran_contribuyente', true, 'gran_contribuyente_acto', 'Resolución 000123', 'gran_contribuyente_desde', '2025-01-01',
  'agente_retencion_iva', true, 'agente_retencion', true,
  'responsabilidades', jsonb_build_array('O-13', 'O-23'), 'responsabilidades_rut', jsonb_build_array('05', '07', '13', '23', '48')) as d;
grant select on base_ok to authenticated;

select set_config('request.jwt.claims', '{"sub":"bb11d6d2-f647-49f7-9b29-aa4c4438abf1","role":"authenticated"}', true);
set local role authenticated;

insert into r (verificacion, esperado, obtenido, ok)
select x.v, x.e, x.o, x.o = x.e from base_ok b, lateral (values
  ('Válida: ordinario, responsable bimestral, gran contribuyente con acto, agente de IVA', 'OK', pg_temp.g('2026-01-01', b.d)),
  ('SIMPLE con autorretención ordinaria activa (con acto)', '22023 COMBINACION_CONTRADICTORIA [simple_con_autorretencion]',
   pg_temp.g('2025-01-01', '{"regimen_renta":"simple","condicion_iva":"responsable","periodicidad_iva":"anual","autorretenedor":true,"autorretenedor_acto":"Res. 1","autorretenedor_acto_fecha":"2024-01-01","responsabilidades":["O-47","O-15"]}')),
  ('SIMPLE con autorretención especial', '22023 COMBINACION_CONTRADICTORIA [simple_con_autorretencion]',
   pg_temp.g('2025-01-01', '{"regimen_renta":"simple","condicion_iva":"responsable","periodicidad_iva":"anual","autorretencion_especial":true,"responsabilidades":["O-47"]}')),
  ('Gran contribuyente sin acto ni fecha', '22023 COMBINACION_CONTRADICTORIA [gran_contribuyente_sin_acto]',
   pg_temp.g('2025-01-01', (b.d - 'gran_contribuyente_acto' - 'gran_contribuyente_desde'))),
  ('R-99-PN junto con O-13 (y gran contribuyente marcado)', '22023 COMBINACION_CONTRADICTORIA [fe_r99_con_calidades,fe_r99_con_otros]',
   pg_temp.g('2025-01-01', jsonb_set(b.d, '{responsabilidades}', '["R-99-PN","O-13","O-23"]'))),
  ('R-99-PN con régimen SIMPLE', '22023 COMBINACION_CONTRADICTORIA [fe_r99_con_calidades]',
   pg_temp.g('2025-01-01', '{"regimen_renta":"simple","condicion_iva":"responsable","periodicidad_iva":"anual","responsabilidades":["R-99-PN"]}')),
  ('R-99-PN con responsable de IVA (no significa «no responsable»)', 'OK',
   pg_temp.g('2024-01-01', '{"regimen_renta":"ordinario","condicion_iva":"responsable","periodicidad_iva":"cuatrimestral","responsabilidades":["R-99-PN"]}')),
  ('O-48 como código FE', '22023 COMBINACION_CONTRADICTORIA [fe_codigo_no_validado]',
   pg_temp.g('2025-01-01', '{"regimen_renta":"ordinario","condicion_iva":"responsable","periodicidad_iva":"bimestral","responsabilidades":["O-48"]}')),
  ('IVA anual fuera del SIMPLE', '22023 COMBINACION_CONTRADICTORIA [periodicidad_anual_fuera_de_simple]',
   pg_temp.g('2025-01-01', '{"regimen_renta":"ordinario","condicion_iva":"responsable","periodicidad_iva":"anual"}')),
  ('RUT 47 y 05 a la vez (excluyentes según IN-CAC-0237)', '22023 COMBINACION_CONTRADICTORIA [rut_47_y_05]',
   pg_temp.g('2025-01-01', '{"regimen_renta":"simple","condicion_iva":"no_responsable","periodicidad_iva":"no_aplica","responsabilidades":["O-47"],"responsabilidades_rut":["05","47"]}')),
  ('RUT 04 y 05 con RTE (ESAL antes de calificar): ya no es bloqueo', 'OK',
   pg_temp.g('2023-01-01', '{"regimen_renta":"especial","rte_tipo":"calificada_art19","condicion_iva":"no_responsable","periodicidad_iva":"no_aplica","responsabilidades_rut":["04","05"]}')),
  ('RUT 53 sin SIMPLE', '22023 COMBINACION_CONTRADICTORIA [rut_53_sin_simple]',
   pg_temp.g('2025-01-01', '{"regimen_renta":"ordinario","condicion_iva":"no_responsable","periodicidad_iva":"no_aplica","responsabilidades_rut":["53"]}')),
  ('No contribuyente (art. 22) sin naturaleza jurídica', '22023 COMBINACION_CONTRADICTORIA [no_contribuyente_sin_naturaleza]',
   pg_temp.g('2025-01-01', '{"regimen_renta":"no_contribuyente_no_declarante","condicion_iva":"no_responsable","periodicidad_iva":"no_aplica"}')),
  ('No contribuyente (art. 22) con 05 en el RUT', '22023 COMBINACION_CONTRADICTORIA [rut_art22_con_renta]',
   pg_temp.g('2025-01-01', '{"regimen_renta":"no_contribuyente_no_declarante","no_contribuyente_naturaleza":"Junta de acción comunal","condicion_iva":"no_responsable","periodicidad_iva":"no_aplica","responsabilidades_rut":["05"]}')),
  ('RTE sin tipo de entidad', '22023 COMBINACION_CONTRADICTORIA [rte_sin_tipo]',
   pg_temp.g('2025-01-01', '{"regimen_renta":"especial","condicion_iva":"no_responsable","periodicidad_iva":"no_aplica"}')),
  ('INC sin actividad', '22023 COMBINACION_CONTRADICTORIA [inc_sin_actividad]',
   pg_temp.g('2025-01-01', '{"regimen_renta":"ordinario","condicion_iva":"responsable","periodicidad_iva":"bimestral","responsable_inc":true}')),
  ('Designación de gran contribuyente con periodicidad cuatrimestral', '22023 COMBINACION_CONTRADICTORIA [cambio_gran_contribuyente_no_bimestral]',
   pg_temp.g('2025-01-01', jsonb_set(jsonb_set(b.d, '{periodicidad_iva}', '"cuatrimestral"'), '{motivo_cambio_periodicidad}', '"designacion_gran_contribuyente"')))
) x(v, e, o);

-- D · Cambio de periodicidad a mitad de año: pendiente hasta documentar hecho, norma y fecha
insert into r (verificacion, esperado, obtenido, ok)
select 'Cambio bimestral → cuatrimestral el 2026-07-01 sin soporte: se guarda', 'OK', x.o, x.o = 'OK'
  from base_ok b, lateral (select pg_temp.g('2026-07-01', jsonb_set(b.d, '{periodicidad_iva}', '"cuatrimestral"')) o) x;
insert into r (verificacion, esperado, obtenido, ok)
select '… y queda «pendiente_soporte»', 'pendiente_soporte', cambio_periodicidad_estado, cambio_periodicidad_estado = 'pendiente_soporte'
  from public.organization_tax_profiles where organization_id = 374 and vigente_desde = '2026-07-01';
insert into r (verificacion, esperado, obtenido, ok)
select 'Soporte con fecha efectiva distinta del inicio', '22023 COMBINACION_CONTRADICTORIA [cambio_fecha_efectiva_distinta]', x.o, x.o = '22023 COMBINACION_CONTRADICTORIA [cambio_fecha_efectiva_distinta]'
  from base_ok b, lateral (select pg_temp.g('2026-07-01', b.d || '{"periodicidad_iva":"cuatrimestral","motivo_cambio_periodicidad":"otro","cambio_periodicidad_hecho":"Hecho","cambio_periodicidad_norma":"ET art. 600","cambio_periodicidad_fecha":"2026-07-02"}',
       (select id from public.organization_tax_profiles where organization_id = 374 and vigente_desde = '2026-07-01')) o) x;
insert into r (verificacion, esperado, obtenido, ok)
select 'Soporte completo (motivo, hecho, norma, fecha 2026-07-01)', 'OK', x.o, x.o = 'OK'
  from base_ok b,
       lateral (select pg_temp.g('2026-07-01', b.d || '{"periodicidad_iva":"cuatrimestral","motivo_cambio_periodicidad":"otro","cambio_periodicidad_hecho":"Hecho documentado","cambio_periodicidad_norma":"ET art. 600","cambio_periodicidad_fecha":"2026-07-01"}',
                (select id from public.organization_tax_profiles where organization_id = 374 and vigente_desde = '2026-07-01')) o) x;
insert into r (verificacion, esperado, obtenido, ok)
select '… y pasa a «documentado»', 'documentado', cambio_periodicidad_estado, cambio_periodicidad_estado = 'documentado'
  from public.organization_tax_profiles where organization_id = 374 and vigente_desde = '2026-07-01';
insert into r (verificacion, esperado, obtenido, ok)
select 'Cambio el 2027-01-01 (1 de enero)', 'OK', x.o, x.o = 'OK' from base_ok b, lateral (select pg_temp.g('2027-01-01', b.d) o) x;
insert into r (verificacion, esperado, obtenido, ok)
select '… sin cambio a mitad de año', 'no_aplica', cambio_periodicidad_estado, cambio_periodicidad_estado = 'no_aplica'
  from public.organization_tax_profiles where organization_id = 374 and vigente_desde = '2027-01-01';

-- E · Decisiones de período
create function pg_temp.dec(p_huella text) returns text language plpgsql as $$
begin
  return public.fn_tributario_decision_periodo_registrar(374, 'iva:cuatrimestral', '2026-05-01', '2026-08-31',
    'Rige la vigencia cuatrimestral desde julio', 'Concepto del Contador', 'IVA mayo–agosto 2026', null, p_huella)::text;
exception when others then return sqlstate || ' ' || sqlerrm;
end $$;
grant execute on function pg_temp.dec(text) to authenticated;
insert into f values ('decision1', pg_temp.dec('h1')), ('decision2', pg_temp.dec('h2'));
insert into r (verificacion, esperado, obtenido, ok)
select 'Dos decisiones sobre el cuatrimestre may–ago: historia completa, la nueva reemplaza la anterior', '2 decisiones; 1 con reemplaza_a; quién = el usuario',
       count(*)::text || ' decisiones; ' || (count(*) filter (where reemplaza_a is not null))::text || ' con reemplaza_a; quién ok=' || bool_and(decidido_por = 'bb11d6d2-f647-49f7-9b29-aa4c4438abf1'),
       count(*) = 2 and count(*) filter (where reemplaza_a is not null) = 1 and bool_and(decidido_por = 'bb11d6d2-f647-49f7-9b29-aa4c4438abf1')
  from public.tax_period_decisions where organization_id = 374;
do $$
declare v_err text;
begin
  begin insert into public.tax_period_decisions (organization_id, obligacion, periodo_desde, periodo_hasta, decision, fundamento, alcance, huella, decidido_por)
        values (374, 'iva', '2026-05-01', '2026-08-31', 'x x x', 'x x x', 'x x x', 'h', auth.uid());
  exception when others then v_err := sqlstate; end;
  insert into r (verificacion, esperado, obtenido, ok) values ('Escritura directa de una decisión (sin la RPC)', '42501', coalesce(v_err, 'NO RECHAZÓ'), v_err = '42501');
  begin delete from public.tax_period_decisions where organization_id = 374; get diagnostics v_err = row_count;
  exception when others then v_err := sqlstate; end;
  insert into r (verificacion, esperado, obtenido, ok) values ('Borrar decisiones', '42501 (nadie borra la historia)', coalesce(v_err, '?'), v_err = '42501');
end $$;
reset role;

-- F · Instantáneas de reimpresión fiel
do $$
declare v_cli uuid; v_suc integer; v_fac uuid; v_err text;
begin
  select id into v_suc from public.branches where organization_id = 374 order by id limit 1;
  insert into public.customers (organization_id, first_name, last_name, identification_type, identification_number, email)
  values (374, 'Cliente', 'Original', 'CC', '1010101010', 'original@example.com') returning id into v_cli;
  insert into f values ('cliente', v_cli::text);
  begin
    insert into public.invoice_sales (organization_id, branch_id, customer_id, status, issue_date, document_type)
    values (374, v_suc, v_cli, 'draft', '2026-11-07 10:00-05', 'invoice') returning id into v_fac;
    insert into f values ('factura', v_fac::text);
  exception when others then insert into f values ('error_factura', sqlstate || ' ' || sqlerrm);
  end;
end $$;
insert into r (verificacion, esperado, obtenido, ok)
select 'Factura en borrador: sin instantánea', '0', count(*)::text, count(*) = 0
  from public.document_party_snapshots where documento_id = (select valor::uuid from f where clave = 'factura');
do $$
begin
  update public.invoice_sales set status = 'issued' where id = (select valor::uuid from f where clave = 'factura');
exception when others then insert into f values ('error_expedir', sqlstate || ' ' || sqlerrm);
end $$;
insert into r (verificacion, esperado, obtenido, ok)
select 'Al expedir: instantánea con emisor (responsabilidades de la vigencia de la fecha) y receptor', 'factura_venta · {O-13,O-23} · Cliente Original',
       s.documento_tipo || ' · ' || (s.emisor -> 'fiscal_responsibilities')::text || ' · ' || coalesce(s.receptor ->> 'full_name', '—'),
       s.documento_tipo = 'factura_venta' and s.emisor -> 'fiscal_responsibilities' = '["O-13","O-23"]'::jsonb and s.receptor ->> 'full_name' = 'Cliente Original'
  from public.document_party_snapshots s where s.documento_id = (select valor::uuid from f where clave = 'factura');
-- Después de expedir cambian el cliente, la ficha de la empresa y la vigencia: la instantánea no.
update public.customers set first_name = 'Cliente', last_name = 'Cambiado' where id = (select valor::uuid from f where clave = 'cliente');
update public.organizations set fiscal_responsibilities = array['R-99-PN'] where id = 374;
update public.organization_tax_profiles set responsabilidades = array['R-99-PN'], updated_at = now() where organization_id = 374 and vigente_desde = '2026-07-01';
insert into r (verificacion, esperado, obtenido, ok)
select 'Tras cambiar cliente, ficha y vigencia, la instantánea conserva lo original', '{O-13,O-23} · Cliente Original',
       (s.emisor -> 'fiscal_responsibilities')::text || ' · ' || coalesce(s.receptor ->> 'full_name', '—'),
       s.emisor -> 'fiscal_responsibilities' = '["O-13","O-23"]'::jsonb and s.receptor ->> 'full_name' = 'Cliente Original'
  from public.document_party_snapshots s where s.documento_id = (select valor::uuid from f where clave = 'factura');
do $$
declare v_err text;
begin
  begin update public.document_party_snapshots set emisor = '{}'::jsonb where documento_id = (select valor::uuid from f where clave = 'factura');
  exception when others then v_err := sqlstate || ' ' || sqlerrm; end;
  insert into r (verificacion, esperado, obtenido, ok) values ('Modificar una instantánea (incluso con privilegios)', '55000 INSTANTANEA_INMUTABLE', coalesce(v_err, 'NO RECHAZÓ'), v_err like '55000%');
end $$;
-- Envío electrónico aceptado: el receptor tal como viajó queda en receptor_xml, una sola vez.
do $$
declare v_job uuid;
begin
  insert into public.electronic_invoicing_jobs (organization_id, invoice_id, document_type, provider, status, request_payload)
  values (374, (select valor::uuid from f where clave = 'factura'), 'invoice', 'factus', 'pending',
          '{"customer":{"identification":"1010101010","names":"Cliente Original XML","address":"Calle 1","legal_organization_code":"2"}}')
  returning id into v_job;
  update public.electronic_invoicing_jobs set status = 'accepted' where id = v_job;
exception when others then insert into f values ('error_envio', sqlstate || ' ' || sqlerrm);
end $$;
insert into r (verificacion, esperado, obtenido, ok)
select 'Envío aceptado: receptor_xml = el receptor enviado', 'Cliente Original XML', coalesce(receptor_xml ->> 'names', 'NULL'), receptor_xml ->> 'names' = 'Cliente Original XML'
  from public.document_party_snapshots where documento_id = (select valor::uuid from f where clave = 'factura');
-- Lectura con la sesión: el miembro la ve, otro usuario no, anon no.
select set_config('request.jwt.claims', '{"sub":"bb11d6d2-f647-49f7-9b29-aa4c4438abf1","role":"authenticated"}', true);
set local role authenticated;
insert into r (verificacion, esperado, obtenido, ok)
select 'Miembro de la org 374 lee la instantánea (RLS)', '1', count(*)::text, count(*) = 1
  from public.document_party_snapshots where documento_id = (select valor::uuid from f where clave = 'factura');
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000aa","role":"authenticated"}', true);
set local role authenticated;
insert into r (verificacion, esperado, obtenido, ok)
select 'Usuario de otra organización', '0', count(*)::text, count(*) = 0 from public.document_party_snapshots;
insert into r (verificacion, esperado, obtenido, ok)
select 'Usuario de otra organización: decisiones', '0', count(*)::text, count(*) = 0 from public.tax_period_decisions;
reset role;
set local role anon;
do $$
declare v_err text;
begin
  begin perform 1 from public.document_party_snapshots limit 1; exception when others then v_err := sqlstate; end;
  insert into r (verificacion, esperado, obtenido, ok) values ('anon lee instantáneas', '42501', coalesce(v_err, 'NO RECHAZÓ'), v_err = '42501');
end $$;
reset role;
insert into r (verificacion, esperado, obtenido, ok)
select 'Errores al crear los documentos de prueba', 'ninguno', coalesce(string_agg(clave || ': ' || valor, ' | '), 'ninguno'), count(*) = 0
  from f where clave like 'error%';

do $x$ begin raise exception E'RESULTADO\n%', (select string_agg(n || ' | ' || ok || ' | ' || verificacion || ' | ' || esperado || ' | ' || obtenido, E'\n' order by n) from r); end $x$;
rollback;
