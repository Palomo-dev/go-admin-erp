-- Pruebas · Ronda 5 del Contador (2026-11-09, docs/contador/RESPUESTAS-CONTADOR-RONDA-5-2026-11-09.md), «Perfil»,
-- respuestas 6 y 7, y el pendiente de seguridad de la ronda 4:
--   T. Gran contribuyente con efectos a mitad de bimestre: la decisión de la transición registra resolución y fecha,
--      fecha de efectos, períodos de IVA y de retención afectados, tramo anterior y posterior, responsable y soporte;
--      cierra la aclaración de la vigencia y la reabre si cambian las fechas (aquí, la de la resolución).
--   C. Formato 2532 de la cooperativa del RTE: «no aplica» con constancia; lo que la pantalla no envía no se borra.
--   S. fn_tarifa_exacta_impuesto (20261108165000): comprueba la pertenencia a la organización del impuesto; sin anon ni
--      public.
-- Proyecto taqjemqjtumhwptchcxk · Organización de pruebas 374. NO DEJA DATOS (begin … rollback).
-- Requiere, en este orden y SIN aplicar: 20261108140500, 20261108160000, 20261108160500, 20261108161000, 20261108161500 y
-- 20261108165000. Se pegan donde dice «MIGRACIONES», dentro de la misma transacción.
-- Usuario simulado: el miembro activo de la org 374 (sesión con RLS y auth.uid()).

begin;

-- ═══ MIGRACIONES (solo en la prueba en seco, mientras no estén aplicadas) ═══

create temp table r (n serial primary key, escenario text, verificacion text, esperado text, obtenido text, ok boolean);
grant all on r to authenticated, anon;
grant usage on sequence r_n_seq to authenticated, anon;
create temp table ctx (k text primary key, v text);
grant all on ctx to authenticated, anon;
-- Impuesto de una organización a la que el usuario simulado no pertenece (se busca sin RLS, antes de entrar como él).
insert into ctx select 'imp_ajeno', (select ot.id::text from public.organization_taxes ot join public.organizations o on o.id = ot.organization_id
  where ot.organization_id not in (select m.organization_id from public.organization_members m where m.user_id = 'bb11d6d2-f647-49f7-9b29-aa4c4438abf1')
    and o.owner_user_id is distinct from 'bb11d6d2-f647-49f7-9b29-aa4c4438abf1' and o.created_by is distinct from 'bb11d6d2-f647-49f7-9b29-aa4c4438abf1'
  order by ot.organization_id, ot.id limit 1);

-- Ayudantes.
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
create function pg_temp.tr(p_desde date, p_d jsonb)
returns text language plpgsql as $$
declare v uuid; v_det text;
begin
  v := public.fn_tributario_transicion_gc_registrar(374, (select id from public.organization_tax_profiles where organization_id = 374 and vigente_desde = p_desde), p_d);
  return 'OK';
exception when others then
  get stacked diagnostics v_det = pg_exception_detail;
  return sqlstate || ' ' || sqlerrm || coalesce(' [' || nullif(v_det, '') || ']', '');
end $$;
create function pg_temp.fila(p_desde date) returns text language sql as $$
  select concat_ws(' · ', 'aclaraciones ' || aclaraciones::text, 'revisar ' || requiere_revision)
    from public.organization_tax_profiles where organization_id = 374 and vigente_desde = p_desde;
$$;
create function pg_temp.tarifa(p_id uuid) returns text language plpgsql as $$
begin
  return coalesce(public.fn_tarifa_exacta_impuesto(p_id)::text, 'NULL');
exception when others then return sqlerrm;
end $$;
grant execute on function pg_temp.g(date, jsonb, uuid) to authenticated, anon;
grant execute on function pg_temp.tr(date, jsonb) to authenticated, anon;
grant execute on function pg_temp.fila(date) to authenticated;
grant execute on function pg_temp.tarifa(uuid) to authenticated, anon;

create temp table base as select jsonb_build_object(
  'regimen_renta', 'ordinario', 'condicion_iva', 'responsable', 'periodicidad_iva', 'bimestral', 'agente_retencion', true,
  'responsabilidades_rut', jsonb_build_array('05', '07', '48')) as d;
-- Calificación EXCEPCIONAL con efectos el 15 de abril (mitad del bimestre marzo–abril).
create temp table gran as select jsonb_build_object(
  'regimen_renta', 'ordinario', 'condicion_iva', 'responsable', 'periodicidad_iva', 'bimestral', 'agente_retencion', true,
  'gran_contribuyente', true, 'gran_contribuyente_acto', 'Resolución 000777 de prueba', 'gran_contribuyente_acto_fecha', '2026-04-10',
  'gran_contribuyente_calificacion', 'excepcional', 'gran_contribuyente_desde', '2026-04-15',
  'responsabilidades', jsonb_build_array('O-13'), 'responsabilidades_rut', jsonb_build_array('05', '07', '13', '48')) as d;
create temp table coop as select jsonb_build_object(
  'regimen_renta', 'especial', 'condicion_iva', 'no_responsable', 'periodicidad_iva', 'no_aplica', 'rte_tipo', 'cooperativa_art19_4',
  'rte_ingresos_superan_160000_uvt', false) as d;
-- Decisión de la transición, completa.
create temp table trans as select jsonb_build_object(
  'resolucion', 'Resolución 000777 de prueba', 'resolucion_fecha', '2026-04-10', 'fecha_efectos', '2026-04-15',
  'periodos_iva', jsonb_build_array(jsonb_build_object('desde', '2026-03-01', 'hasta', '2026-04-30')),
  'periodos_retencion', jsonb_build_array(jsonb_build_object('desde', '2026-04-01', 'hasta', '2026-04-30')),
  'tramo_anterior', 'Del 1 de marzo al 14 de abril se declara como contribuyente ordinario en el bimestre marzo–abril.',
  'tramo_posterior', 'Desde el 15 de abril aplica la calificación; el bimestre marzo–abril se presenta completo por la regla decidida.',
  'responsable', 'Contador de la organización (prueba)',
  'soporte', jsonb_build_object('referencia', 'Resolución 000777 de prueba, folio 1', 'fecha', '2026-04-10'),
  'fundamento', 'La Res. 227 de 2025, art. 1.1.4.3, no regula el caso: se deja escrita la regla aplicada.') as d;
grant select on base, gran, coop, trans to authenticated, anon;

select set_config('request.jwt.claims', '{"sub":"bb11d6d2-f647-49f7-9b29-aa4c4438abf1","role":"authenticated"}', true);
set local role authenticated;

-- ── T · Transición del gran contribuyente ──
insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'T', x.v, x.e, x.o, x.o = x.e from base b, gran g, lateral (values
  ('Vigencia de enero, ordinaria', 'OK', pg_temp.g('2026-01-01', b.d)),
  ('Vigencia del 15 de abril: gran contribuyente excepcional a mitad de bimestre', 'OK', pg_temp.g('2026-04-15', g.d))
) x(v, e, o);
insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'T', 'La vigencia del 15 de abril queda para aclaración (transición por resolver)', 'aclaraciones {gran_contribuyente_transicion_por_resolver} · revisar true',
       coalesce(pg_temp.fila('2026-04-15'), 'NO ESTÁ'), pg_temp.fila('2026-04-15') = 'aclaraciones {gran_contribuyente_transicion_por_resolver} · revisar true';

insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'T', x.v, x.e, x.o, x.o = x.e from trans t, lateral (values
  ('Transición sobre una vigencia que no es gran contribuyente excepcional', '22023 TRANSICION_NO_APLICA', pg_temp.tr('2026-01-01', t.d)),
  ('Sin la resolución', '22023 RESOLUCION_REQUERIDA', pg_temp.tr('2026-04-15', t.d - 'resolucion')),
  ('Con otra fecha de la resolución que la del perfil', '22023 TRANSICION_NO_COINCIDE_CON_PERFIL', pg_temp.tr('2026-04-15', t.d || '{"resolucion_fecha":"2026-04-11"}')),
  ('Con otra fecha de efectos que la del perfil', '22023 TRANSICION_NO_COINCIDE_CON_PERFIL', pg_temp.tr('2026-04-15', t.d || '{"fecha_efectos":"2026-05-01"}')),
  ('Período de IVA de un mes (no es período fiscal)', '22023 PERIODOS_IVA_INVALIDOS',
   pg_temp.tr('2026-04-15', t.d || '{"periodos_iva":[{"desde":"2026-04-01","hasta":"2026-04-30"}]}')),
  ('Períodos de IVA que no contienen la fecha de efectos', '22023 PERIODOS_IVA_INVALIDOS [ninguno_contiene_la_fecha_de_efectos]',
   pg_temp.tr('2026-04-15', t.d || '{"periodos_iva":[{"desde":"2026-05-01","hasta":"2026-06-30"}]}')),
  ('Período de retención que no es un mes', '22023 PERIODOS_RETENCION_INVALIDOS',
   pg_temp.tr('2026-04-15', t.d || '{"periodos_retencion":[{"desde":"2026-03-01","hasta":"2026-04-30"}]}')),
  ('Sin períodos de retención', '22023 PERIODOS_RETENCION_INVALIDOS', pg_temp.tr('2026-04-15', t.d - 'periodos_retencion')),
  ('Sin decir qué se hace con el tramo anterior', '22023 TRAMO_REQUERIDO', pg_temp.tr('2026-04-15', t.d || '{"tramo_anterior":"Igual"}')),
  ('Sin responsable', '22023 RESPONSABLE_REQUERIDO', pg_temp.tr('2026-04-15', t.d - 'responsable')),
  ('Soporte sin fecha', '22023 SOPORTE_REQUERIDO', pg_temp.tr('2026-04-15', t.d || '{"soporte":{"referencia":"Resolución de prueba"}}')),
  ('Decisión completa', 'OK', pg_temp.tr('2026-04-15', t.d))
) x(v, e, o);
insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'T', 'Con la decisión, la aclaración de la transición se cierra', 'aclaraciones {} · revisar false',
       coalesce(pg_temp.fila('2026-04-15'), 'NO ESTÁ'), pg_temp.fila('2026-04-15') = 'aclaraciones {} · revisar false';
insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'T', 'La decisión guarda todo lo que pidió el Contador (y su vigencia, huella y autor)',
       'transicion_gran_contribuyente · 2026-03-01→2026-04-30 · completa · vigencia ok · huella gc · autor ok',
       d.obligacion || ' · ' || d.periodo_desde || '→' || d.periodo_hasta || ' · '
         || case when d.detalle ?& array['resolucion', 'resolucion_fecha', 'fecha_efectos', 'periodos_iva', 'periodos_retencion', 'tramo_anterior',
                                         'tramo_posterior', 'responsable', 'soporte'] and d.detalle -> 'soporte' ?& array['referencia', 'fecha']
                 then 'completa' else 'incompleta' end
         || ' · vigencia ' || case when d.vigencia_aplicada_id = (select id from public.organization_tax_profiles where organization_id = 374 and vigente_desde = '2026-04-15') then 'ok' else 'otra' end
         || ' · huella ' || split_part(d.huella, ':', 1)
         || ' · autor ' || case when d.decidido_por = 'bb11d6d2-f647-49f7-9b29-aa4c4438abf1' then 'ok' else 'otro' end,
       d.obligacion = 'transicion_gran_contribuyente' and d.periodo_desde = '2026-03-01' and d.periodo_hasta = '2026-04-30'
         and d.detalle ?& array['resolucion', 'resolucion_fecha', 'fecha_efectos', 'periodos_iva', 'periodos_retencion', 'tramo_anterior', 'tramo_posterior', 'responsable', 'soporte']
         and d.decidido_por = 'bb11d6d2-f647-49f7-9b29-aa4c4438abf1'
  from public.tax_period_decisions d where d.organization_id = 374 and d.obligacion = 'transicion_gran_contribuyente';
insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'T', 'Guardar otra vez la vigencia con las mismas fechas: la aclaración sigue cerrada', 'OK',
       pg_temp.g(null, g.d, (select id from public.organization_tax_profiles where organization_id = 374 and vigente_desde = '2026-04-15')),
       true
  from gran g;
update r set ok = (obtenido = 'OK') where n = (select max(n) from r);
insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'T', 'Leída después: sin la aclaración de la transición', 'aclaraciones {} · revisar false',
       coalesce(pg_temp.fila('2026-04-15'), 'NO ESTÁ'), pg_temp.fila('2026-04-15') = 'aclaraciones {} · revisar false';
insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'T', 'Guardar la vigencia con otra fecha de la resolución (12 de abril): la aclaración vuelve', 'OK',
       pg_temp.g(null, g.d || '{"gran_contribuyente_acto_fecha":"2026-04-12"}', (select id from public.organization_tax_profiles where organization_id = 374 and vigente_desde = '2026-04-15')),
       true
  from gran g;
update r set ok = (obtenido = 'OK') where n = (select max(n) from r);
insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'T', 'Leída después: la transición vuelve a estar por resolver', 'aclaraciones {gran_contribuyente_transicion_por_resolver} · revisar true',
       coalesce(pg_temp.fila('2026-04-15'), 'NO ESTÁ'), pg_temp.fila('2026-04-15') = 'aclaraciones {gran_contribuyente_transicion_por_resolver} · revisar true';

-- ── C · Formato 2532 de la cooperativa ──
insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'C', x.v, x.e, x.o, x.o = x.e from coop c, lateral (values
  ('Cooperativa: «no recibió donaciones» sin la constancia', '22023 CONSTANCIA_2532_REQUERIDA',
   pg_temp.g('2026-09-01', c.d || '{"rte_donaciones_cooperacion":false}')),
  ('Cooperativa: un valor que no es sí ni no', '22023 DATOS_INVALIDOS', pg_temp.g('2026-09-01', c.d || '{"rte_donaciones_cooperacion":"si"}')),
  ('Cooperativa: «no aplica» con su constancia', 'OK',
   pg_temp.g('2026-09-01', c.d || '{"rte_donaciones_cooperacion":false,"rte_donaciones_constancia":"Revisados los ingresos del año: sin donaciones ni cooperación internacional"}'))
) x(v, e, o);
insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'C', 'Queda «no aplica» con su constancia', 'false · Revisados los ingresos del año: sin donaciones ni cooperación internacional',
       coalesce(p.rte_donaciones_cooperacion::text, 'NULL') || ' · ' || coalesce(p.rte_donaciones_constancia, 'NULL'),
       p.rte_donaciones_cooperacion = false and p.rte_donaciones_constancia like 'Revisados%'
  from public.organization_tax_profiles p where p.organization_id = 374 and p.vigente_desde = '2026-09-01';
insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'C', 'Guardar otra vez sin esos datos (como la pantalla actual)', 'OK',
       pg_temp.g(null, c.d, (select id from public.organization_tax_profiles where organization_id = 374 and vigente_desde = '2026-09-01')), true
  from coop c;
update r set ok = (obtenido = 'OK') where n = (select max(n) from r);
insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'C', 'Lo que no se envió se conserva', 'false · con constancia',
       coalesce(p.rte_donaciones_cooperacion::text, 'NULL') || ' · ' || case when p.rte_donaciones_constancia is not null then 'con constancia' else 'sin constancia' end,
       p.rte_donaciones_cooperacion = false and p.rte_donaciones_constancia is not null
  from public.organization_tax_profiles p where p.organization_id = 374 and p.vigente_desde = '2026-09-01';
insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'C', 'Cooperativa que sí recibió donaciones', 'OK',
       pg_temp.g(null, c.d || '{"rte_donaciones_cooperacion":true}', (select id from public.organization_tax_profiles where organization_id = 374 and vigente_desde = '2026-09-01')), true
  from coop c;
update r set ok = (obtenido = 'OK') where n = (select max(n) from r);
insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'C', 'Queda «sí recibió» (el 2532 aplica)', 'true', coalesce(p.rte_donaciones_cooperacion::text, 'NULL'), p.rte_donaciones_cooperacion
  from public.organization_tax_profiles p where p.organization_id = 374 and p.vigente_desde = '2026-09-01';

-- ── S · fn_tarifa_exacta_impuesto ──
insert into ctx select 'imp374', (select ot.id::text from public.organization_taxes ot where ot.organization_id = 374 order by ot.id limit 1);
insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'S', 'Miembro de la 374: lee la tarifa de un impuesto de la 374', 'un número', case when x.o ~ '^[0-9.]+$' then 'un número' else x.o end, x.o ~ '^[0-9.]+$'
  from (select pg_temp.tarifa((select v::uuid from ctx where k = 'imp374')) o) x;
insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'S', 'Miembro de la 374: un impuesto de una organización a la que no pertenece', 'Acceso denegado a la organización', x.o, x.o = 'Acceso denegado a la organización'
  from (select pg_temp.tarifa((select v::uuid from ctx where k = 'imp_ajeno')) o) x;
insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'S', 'Un id que no existe', 'NULL', x.o, x.o = 'NULL' from (select pg_temp.tarifa('00000000-0000-4000-8000-000000000000') o) x;
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'S', 'Usuario con sesión que no es miembro de la 374', 'Acceso denegado a la organización', x.o, x.o = 'Acceso denegado a la organización'
  from (select pg_temp.tarifa((select v::uuid from ctx where k = 'imp374')) o) x;
insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'T', 'Usuario que no es miembro: registrar una transición', '42501 Acceso denegado a la organización', x.o, x.o = '42501 Acceso denegado a la organización'
  from trans t, lateral (select pg_temp.tr('2026-04-15', t.d) o) x;
reset role;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'S', 'anon: leer una tarifa', 'permission denied…', left(x.o, 40), x.o like 'permission denied%'
  from (select pg_temp.tarifa((select v::uuid from ctx where k = 'imp374')) o) x;
insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'T', 'anon: registrar una transición', 'permission denied…', left(x.o, 48), x.o like '42501 permission denied%'
  from trans t, lateral (select pg_temp.tr('2026-04-15', t.d) o) x;
reset role;
select set_config('request.jwt.claims', '', true);
insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'S', 'Sin sesión (funciones del servidor, service_role): lee la tarifa', 'un número', case when x.o ~ '^[0-9.]+$' then 'un número' else x.o end, x.o ~ '^[0-9.]+$'
  from (select pg_temp.tarifa((select v::uuid from ctx where k = 'imp374')) o) x;
insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'S', 'Permisos: anon no · public no · authenticated sí · service_role sí; SECURITY DEFINER en plpgsql',
       'anon false · public false · authenticated true · service_role true · definer true · plpgsql',
       format('anon %s · public %s · authenticated %s · service_role %s · definer %s · %s',
              has_function_privilege('anon', 'public.fn_tarifa_exacta_impuesto(uuid)', 'execute'),
              exists (select 1 from aclexplode(p.proacl) a where a.grantee = 0 and a.privilege_type = 'EXECUTE'),
              has_function_privilege('authenticated', 'public.fn_tarifa_exacta_impuesto(uuid)', 'execute'),
              has_function_privilege('service_role', 'public.fn_tarifa_exacta_impuesto(uuid)', 'execute'),
              p.prosecdef, l.lanname),
       not has_function_privilege('anon', 'public.fn_tarifa_exacta_impuesto(uuid)', 'execute')
         and not exists (select 1 from aclexplode(p.proacl) a where a.grantee = 0 and a.privilege_type = 'EXECUTE')
         and has_function_privilege('authenticated', 'public.fn_tarifa_exacta_impuesto(uuid)', 'execute')
         and has_function_privilege('service_role', 'public.fn_tarifa_exacta_impuesto(uuid)', 'execute')
         and p.prosecdef and l.lanname = 'plpgsql'
  from pg_proc p join pg_language l on l.oid = p.prolang where p.oid = 'public.fn_tarifa_exacta_impuesto(uuid)'::regprocedure;
insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'T', 'Permisos de la transición: anon no · public no · authenticated sí',
       'anon false · public false · authenticated true',
       format('anon %s · public %s · authenticated %s',
              has_function_privilege('anon', 'public.fn_tributario_transicion_gc_registrar(integer,uuid,jsonb)', 'execute'),
              exists (select 1 from aclexplode(p.proacl) a where a.grantee = 0 and a.privilege_type = 'EXECUTE'),
              has_function_privilege('authenticated', 'public.fn_tributario_transicion_gc_registrar(integer,uuid,jsonb)', 'execute')),
       not has_function_privilege('anon', 'public.fn_tributario_transicion_gc_registrar(integer,uuid,jsonb)', 'execute')
         and not exists (select 1 from aclexplode(p.proacl) a where a.grantee = 0 and a.privilege_type = 'EXECUTE')
         and has_function_privilege('authenticated', 'public.fn_tributario_transicion_gc_registrar(integer,uuid,jsonb)', 'execute')
  from pg_proc p where p.oid = 'public.fn_tributario_transicion_gc_registrar(integer,uuid,jsonb)'::regprocedure;

-- Miembro sin finance.approve (rol «Empleado», cambiado DENTRO de la transacción).
update public.organization_members set is_super_admin = false, role_id = 4
 where organization_id = 374 and user_id = 'bb11d6d2-f647-49f7-9b29-aa4c4438abf1';
select set_config('request.jwt.claims', '{"sub":"bb11d6d2-f647-49f7-9b29-aa4c4438abf1","role":"authenticated"}', true);
set local role authenticated;
insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'T', 'Registrar la transición con rol Empleado (sin finance.approve)', '42501 SIN_PERMISO', x.o, x.o = '42501 SIN_PERMISO'
  from trans t, lateral (select pg_temp.tr('2026-04-15', t.d) o) x;
reset role;

select n, escenario, verificacion, esperado, obtenido, ok from r order by n;

rollback;
