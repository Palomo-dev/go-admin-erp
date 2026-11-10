-- Pruebas · Ronda 6 del Contador (2026-11-10, docs/contador/RESPUESTAS-CONTADOR-RONDA-6-2026-11-10.md), «Perfil»,
-- respuesta 6: el dato del formato 2532 va POR AÑO GRAVABLE, no por vigencia del perfil.
--   P. tributario_rte_2532_anio y fn_tributario_2532_registrar (20261108160500): permisos (anon, usuario sin pertenencia,
--      escritura directa), validaciones (año, sí o no, constancia obligatoria cuando no recibió, largo), una fila por año
--      (registrar otra vez la reemplaza; null la quita → «por confirmar»), lectura por RLS del miembro, y que la vigencia
--      del perfil ya no tiene ni lee el dato.
-- Proyecto taqjemqjtumhwptchcxk · Organización de pruebas 374. NO DEJA DATOS (begin … rollback).
-- Requiere, en este orden y SIN aplicar: 20261108140500, 20261108160000, 20261108160500, 20261108161000, 20261108161500 y
-- 20261108165000. Se pegan donde dice «MIGRACIONES», dentro de la misma transacción.
-- Usuario simulado: A = el miembro activo de la org 374; X = un usuario sin pertenencia a la 374.

begin;
set local timezone to 'America/Bogota';

-- ═══ MIGRACIONES (solo en la prueba en seco, mientras no estén aplicadas) ═══

create temp table r (n serial primary key, escenario text, verificacion text, esperado text, obtenido text, ok boolean);
grant all on r to authenticated, anon;
grant usage on sequence r_n_seq to authenticated, anon;
create temp table ctx (k text primary key, v text);
grant all on ctx to authenticated, anon;

-- Ayudantes.
create function pg_temp.f(p_anio integer, p_d jsonb)
returns text language plpgsql as $$
declare v jsonb; v_det text;
begin
  v := public.fn_tributario_2532_registrar(374, p_anio, p_d);
  return 'OK' || coalesce(' ' || (v ->> 'formato_2532'), '');
exception when others then
  get stacked diagnostics v_det = pg_exception_detail;
  return sqlstate || ' ' || sqlerrm || coalesce(' [' || nullif(v_det, '') || ']', '');
end $$;
create function pg_temp.g(p_desde date, p_d jsonb)
returns text language plpgsql as $$
declare v uuid; v_det text;
begin
  v := public.fn_perfil_tributario_guardar_v2(374, null, p_desde, p_d, '[]'::jsonb, null);
  return 'OK';
exception when others then
  get stacked diagnostics v_det = pg_exception_detail;
  return sqlstate || ' ' || sqlerrm || coalesce(' [' || nullif(v_det, '') || ']', '');
end $$;
create function pg_temp.ins(p_recibio boolean, p_constancia text)
returns text language plpgsql as $$
begin
  insert into public.tributario_rte_2532_anio (organization_id, anio_gravable, recibio, constancia) values (374, 2030, p_recibio, p_constancia);
  return 'OK';
exception when others then return sqlstate || ' ' || left(sqlerrm, 60);
end $$;
grant execute on function pg_temp.f(integer, jsonb) to authenticated, anon;
grant execute on function pg_temp.g(date, jsonb) to authenticated, anon;
grant execute on function pg_temp.ins(boolean, text) to authenticated, anon;

-- ── P · Permisos ──
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'P', 'anon: registrar el dato del 2532', '42501 permission denied…', left(x.o, 23) || '…', x.o like '42501 permission denied%'
  from (select pg_temp.f(2025, '{"recibio":true}') o) x;
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'P', 'Usuario sin pertenencia a la organización', '42501', left(x.o, 5), x.o like '42501%'
  from (select pg_temp.f(2025, '{"recibio":true}') o) x;
reset role;

-- ── P · Validaciones y registro, como el miembro A ──
select set_config('request.jwt.claims', '{"sub":"bb11d6d2-f647-49f7-9b29-aa4c4438abf1","role":"authenticated"}', true);
set local role authenticated;
insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'P', x.v, x.e, x.o, x.o = x.e from (values
  ('Escritura directa en la tabla (sin la función)', '42501 permission denied for table tributario_rte_2532_anio', pg_temp.ins(true, null)),
  ('Año gravable fuera de rango', '22023 ANIO_INVALIDO', pg_temp.f(1999, '{"recibio":true}')),
  ('Sin decir si recibió', '22023 DATOS_INVALIDOS', pg_temp.f(2025, '{"constancia":"x"}')),
  ('Un valor que no es sí ni no', '22023 DATOS_INVALIDOS', pg_temp.f(2025, '{"recibio":"no"}')),
  ('2025: «no recibió» sin la constancia', '22023 CONSTANCIA_2532_REQUERIDA', pg_temp.f(2025, '{"recibio":false}')),
  ('2025: constancia de más de 1.000 caracteres', '22023 TEXTO_LARGO', pg_temp.f(2025, jsonb_build_object('recibio', false, 'constancia', repeat('x', 1001)))),
  ('2025: «no recibió», con la constancia de lo verificado → el 2532 no aplica', 'OK no_aplica',
   pg_temp.f(2025, '{"recibio":false,"constancia":"Revisados los ingresos y la cuenta de donaciones de 2025: no hubo donaciones ni cooperación internacional"}')),
  ('2026: recibió cooperación internacional no reembolsable → el 2532 aplica', 'OK aplica', pg_temp.f(2026, '{"recibio":true}'))
) x(v, e, o);
insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'P', 'El miembro lee los dos años (RLS), cada uno con su dato y quién lo registró', '2025 false con constancia A · 2026 true sin constancia A',
       string_agg(a.anio_gravable || ' ' || a.recibio || case when a.constancia is null then ' sin constancia' else ' con constancia' end
                  || case when a.registrado_por = 'bb11d6d2-f647-49f7-9b29-aa4c4438abf1' then ' A' else ' otro' end, ' · ' order by a.anio_gravable),
       string_agg(a.anio_gravable || ' ' || a.recibio || case when a.constancia is null then ' sin constancia' else ' con constancia' end
                  || case when a.registrado_por = 'bb11d6d2-f647-49f7-9b29-aa4c4438abf1' then ' A' else ' otro' end, ' · ' order by a.anio_gravable)
         = '2025 false con constancia A · 2026 true sin constancia A'
  from public.tributario_rte_2532_anio a where a.organization_id = 374;
insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'P', '2026 se registra otra vez («no recibió», con constancia): reemplaza el dato del año', 'OK no_aplica', x.o, x.o = 'OK no_aplica'
  from (select pg_temp.f(2026, '{"recibio":false,"constancia":"Corrección: el ingreso de 2026 era un préstamo, no cooperación"}') o) x;
insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'P', 'Sigue habiendo una sola fila por año', '2025 1 · 2026 1',
       string_agg(x.anio_gravable || ' ' || x.c, ' · ' order by x.anio_gravable), string_agg(x.anio_gravable || ' ' || x.c, ' · ' order by x.anio_gravable) = '2025 1 · 2026 1'
  from (select a.anio_gravable, count(*) c from public.tributario_rte_2532_anio a where a.organization_id = 374 group by a.anio_gravable) x;
insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'P', '2026 se quita (null): vuelve a «por confirmar»', 'OK', x.o, x.o = 'OK' from (select pg_temp.f(2026, null) o) x;
insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'P', 'Queda solo el dato de 2025', '2025', string_agg(a.anio_gravable::text, ','), string_agg(a.anio_gravable::text, ',') = '2025'
  from public.tributario_rte_2532_anio a where a.organization_id = 374;

-- ── P · La vigencia del perfil ya no tiene ni lee el dato ──
insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'P', 'Guardar una vigencia de cooperativa con la clave vieja «no recibió» y sin constancia: se ignora (no exige la constancia)', 'OK',
       pg_temp.g('2026-10-01', '{"regimen_renta":"especial","condicion_iva":"no_responsable","periodicidad_iva":"no_aplica","rte_tipo":"cooperativa_art19_4","rte_ingresos_superan_160000_uvt":false,"rte_donaciones_cooperacion":false}'),
       true;
update r set ok = (obtenido = 'OK') where n = (select max(n) from r);
reset role;
insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'P', 'organization_tax_profiles ya no tiene las columnas del 2532 de la ronda 5', '0', count(*)::text, count(*) = 0
  from information_schema.columns where table_schema = 'public' and table_name = 'organization_tax_profiles'
   and column_name in ('rte_donaciones_cooperacion', 'rte_donaciones_constancia');
insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'P', 'La tabla exige la constancia cuando no recibió (restricción, aun sin la función)', '23514', left(x.o, 5), x.o like '23514%'
  from (select pg_temp.ins(false, null) o) x;
insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'P', 'anon no tiene permisos sobre la tabla; authenticated solo lectura', 'anon - · authenticated SELECT',
       'anon ' || coalesce((select string_agg(privilege_type, ',' order by privilege_type) from information_schema.role_table_grants
                             where table_schema = 'public' and table_name = 'tributario_rte_2532_anio' and grantee = 'anon'), '-')
       || ' · authenticated ' || coalesce((select string_agg(privilege_type, ',' order by privilege_type) from information_schema.role_table_grants
                                            where table_schema = 'public' and table_name = 'tributario_rte_2532_anio' and grantee = 'authenticated'), '-'),
       'anon ' || coalesce((select string_agg(privilege_type, ',' order by privilege_type) from information_schema.role_table_grants
                             where table_schema = 'public' and table_name = 'tributario_rte_2532_anio' and grantee = 'anon'), '-')
       || ' · authenticated ' || coalesce((select string_agg(privilege_type, ',' order by privilege_type) from information_schema.role_table_grants
                                            where table_schema = 'public' and table_name = 'tributario_rte_2532_anio' and grantee = 'authenticated'), '-')
         = 'anon - · authenticated SELECT';
insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'P', 'La función: SECURITY DEFINER, sin ejecución para anon ni public', 'definer · anon false · public false',
       case when p.prosecdef then 'definer' else 'invoker' end || ' · anon ' || has_function_privilege('anon', p.oid, 'execute')
       || ' · public ' || coalesce((select bool_or(a.grantee = 0) from aclexplode(p.proacl) a where a.privilege_type = 'EXECUTE'), false),
       p.prosecdef and not has_function_privilege('anon', p.oid, 'execute')
       and not coalesce((select bool_or(a.grantee = 0) from aclexplode(p.proacl) a where a.privilege_type = 'EXECUTE'), false)
  from pg_proc p where p.oid = 'public.fn_tributario_2532_registrar(integer,integer,jsonb)'::regprocedure;

select n, escenario, verificacion, esperado, obtenido, ok from r order by n;

rollback;
