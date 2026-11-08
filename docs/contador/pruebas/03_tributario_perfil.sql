-- Pruebas de escenario · Perfil tributario por vigencia (fn_perfil_tributario_guardar)
-- Fecha: 2026-11-07 · Proyecto taqjemqjtumhwptchcxk · Organización de pruebas 374. NO DEJA DATOS (begin … rollback).
--
-- Qué se prueba:
--   1. Guardar dos vigencias (2026-01-01 y 2026-07-01) y comprobar cuál rige en cada fecha.
--   2. Insertar una vigencia anterior y otra intermedia: las fechas de cierre se ajustan solas, sin huecos ni solapes.
--   3. Corregir una vigencia (mismo id): cambian los datos, no las fechas.
--   4. organizations.fiscal_responsibilities (lo que lee la facturación electrónica) sigue a la vigencia de HOY.
--   5. Validaciones: duplicada, O-48 con O-49, código inexistente, régimen inválido, municipio inexistente.
--   6. Permisos: rol sin finance.approve, no miembro, anon, escritura directa.
-- La regla «cuál rige» es la misma de la aplicación (src/lib/finanzas/tributario/perfil.ts, vigenciaEn):
--   vigente_desde <= día  y  (vigente_hasta es nula  o  vigente_hasta >= día).

begin;

create temp table r (n serial primary key, escenario text, verificacion text, esperado text, obtenido text, ok boolean);
create temp table ctx (k text primary key, v text);
grant all on r, ctx to authenticated, anon;
grant usage on sequence r_n_seq to authenticated, anon;
insert into ctx values
  ('bogota', (select id::text from public.municipalities where code = '11001')),
  ('medellin', (select id::text from public.municipalities where code = '05001')),
  ('fr_antes', coalesce((select fiscal_responsibilities::text from public.organizations where id = 374), 'NULL'));

select set_config('request.jwt.claims', '{"sub":"bb11d6d2-f647-49f7-9b29-aa4c4438abf1","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  v_bog uuid := (select v::uuid from ctx where k = 'bogota');
  v_med uuid := (select v::uuid from ctx where k = 'medellin');
  v1 uuid; v2 uuid; v0 uuid; v15 uuid;
  v_txt text; v_err text; v_n int;
  v_dia date;
  -- Vigencia que rige un día, con la regla de la aplicación.
  v_rige text;
begin
  -- ═══ 1. Dos vigencias ═══
  v1 := public.fn_perfil_tributario_guardar(374, null, '2026-01-01', 'ordinario', array['O-48'], false, false, 'bimestral',
          jsonb_build_array(jsonb_build_object('municipality_id', v_bog, 'periodicidad', 'bimestral', 'tarifa_por_mil', 9.66, 'actividad', '4711')),
          'Vigencia de prueba 1');
  v2 := public.fn_perfil_tributario_guardar(374, null, '2026-07-01', 'ordinario', array['O-48', 'O-23'], true, false, 'cuatrimestral',
          jsonb_build_array(jsonb_build_object('municipality_id', v_bog, 'periodicidad', 'bimestral', 'tarifa_por_mil', 9.66),
                            jsonb_build_object('municipality_id', v_med, 'periodicidad', 'anual', 'tarifa_por_mil', 7)),
          'Vigencia de prueba 2');
  select string_agg(format('%s→%s %s %s %s ret=%s ICA=%s', vigente_desde, coalesce(vigente_hasta::text, 'abierta'), regimen, responsabilidades, periodicidad_iva, agente_retencion,
                           (select count(*) from public.organization_tax_profile_ica i where i.profile_id = p.id)), ' | ' order by vigente_desde)
    into v_txt from public.organization_tax_profiles p where organization_id = 374;
  insert into r (escenario, verificacion, esperado, obtenido, ok) values
    ('1', 'Dos vigencias guardadas', '2026-01-01→2026-06-30 (bimestral, ICA 1) | 2026-07-01→abierta (cuatrimestral, agente de retención, ICA 2)', v_txt,
     v_txt = '2026-01-01→2026-06-30 ordinario {O-48} bimestral ret=f ICA=1 | 2026-07-01→abierta ordinario {O-48,O-23} cuatrimestral ret=t ICA=2');

  foreach v_dia in array array['2025-12-31', '2026-01-01', '2026-03-15', '2026-06-30', '2026-07-01', '2026-11-07', '2027-05-01']::date[] loop
    select coalesce(string_agg(p.vigente_desde::text || ' (' || p.periodicidad_iva || ')', ', '), 'ninguna') into v_rige
      from public.organization_tax_profiles p
     where p.organization_id = 374 and p.vigente_desde <= v_dia and (p.vigente_hasta is null or p.vigente_hasta >= v_dia);
    insert into r (escenario, verificacion, esperado, obtenido, ok) values
      ('1', 'Vigencia que rige el ' || v_dia,
       case when v_dia < '2026-01-01' then 'ninguna' when v_dia < '2026-07-01' then '2026-01-01 (bimestral)' else '2026-07-01 (cuatrimestral)' end,
       v_rige,
       v_rige = case when v_dia < '2026-01-01' then 'ninguna' when v_dia < '2026-07-01' then '2026-01-01 (bimestral)' else '2026-07-01 (cuatrimestral)' end);
  end loop;

  -- ═══ 4. Responsabilidades de la empresa = las de la vigencia de hoy ═══
  select fiscal_responsibilities::text into v_txt from public.organizations where id = 374;
  insert into r (escenario, verificacion, esperado, obtenido, ok) values
    ('4', 'organizations.fiscal_responsibilities tras guardar la vigencia de hoy', '{O-48,O-23} (la de 2026-07-01, que rige hoy)', v_txt, v_txt = '{O-48,O-23}');

  -- ═══ 2. Vigencia anterior y vigencia intermedia ═══
  v0 := public.fn_perfil_tributario_guardar(374, null, '2025-01-01', 'simple', array['O-47'], false, false, 'anual', '[]'::jsonb, 'Vigencia anterior');
  v15 := public.fn_perfil_tributario_guardar(374, null, '2026-04-01', 'ordinario', array['O-48'], false, true, 'bimestral', '[]'::jsonb, 'Vigencia intermedia');
  select string_agg(format('%s→%s', vigente_desde, coalesce(vigente_hasta::text, 'abierta')), ' | ' order by vigente_desde)
    into v_txt from public.organization_tax_profiles where organization_id = 374;
  insert into r (escenario, verificacion, esperado, obtenido, ok) values
    ('2', 'Fechas tras añadir 2025-01-01 y 2026-04-01', '2025-01-01→2025-12-31 | 2026-01-01→2026-03-31 | 2026-04-01→2026-06-30 | 2026-07-01→abierta', v_txt,
     v_txt = '2025-01-01→2025-12-31 | 2026-01-01→2026-03-31 | 2026-04-01→2026-06-30 | 2026-07-01→abierta');
  select count(*) into v_n
    from public.organization_tax_profiles a join public.organization_tax_profiles b
      on a.organization_id = b.organization_id and a.id < b.id
     and daterange(a.vigente_desde, coalesce(a.vigente_hasta, 'infinity'::date), '[]') && daterange(b.vigente_desde, coalesce(b.vigente_hasta, 'infinity'::date), '[]')
   where a.organization_id = 374;
  insert into r (escenario, verificacion, esperado, obtenido, ok) values
    ('2', 'Vigencias que se solapan', '0', v_n::text, v_n = 0);
  select fiscal_responsibilities::text into v_txt from public.organizations where id = 374;
  insert into r (escenario, verificacion, esperado, obtenido, ok) values
    ('4', 'fiscal_responsibilities tras guardar vigencias que NO rigen hoy', 'sigue {O-48,O-23}', v_txt, v_txt = '{O-48,O-23}');

  -- ═══ 3. Corregir una vigencia ═══
  perform public.fn_perfil_tributario_guardar(374, v1, '2030-01-01', 'ordinario', array['O-48'], false, false, 'cuatrimestral', '[]'::jsonb, 'Corregida');
  select format('%s→%s %s ICA=%s', vigente_desde, vigente_hasta, periodicidad_iva, (select count(*) from public.organization_tax_profile_ica i where i.profile_id = p.id))
    into v_txt from public.organization_tax_profiles p where id = v1;
  insert into r (escenario, verificacion, esperado, obtenido, ok) values
    ('3', 'Corregir la vigencia 2026-01-01 (se envía otra fecha y ICA vacío)', '2026-01-01→2026-03-31 cuatrimestral ICA=0 (la fecha no cambia; el ICA se reemplaza)', v_txt,
     v_txt = '2026-01-01→2026-03-31 cuatrimestral ICA=0');

  -- ═══ 5. Validaciones ═══
  v_err := null;
  begin perform public.fn_perfil_tributario_guardar(374, null, '2026-07-01', 'ordinario', array['O-48'], false, false, 'bimestral', '[]'::jsonb, null);
  exception when others then v_err := sqlerrm; end;
  insert into r (escenario, verificacion, esperado, obtenido, ok) values ('5', 'Otra vigencia con la misma fecha de inicio', 'rechaza: VIGENCIA_DUPLICADA', coalesce(v_err, 'NO RECHAZÓ'), v_err = 'VIGENCIA_DUPLICADA');
  v_err := null;
  begin perform public.fn_perfil_tributario_guardar(374, null, '2027-01-01', 'ordinario', array['O-48', 'O-49'], false, false, 'bimestral', '[]'::jsonb, null);
  exception when others then v_err := sqlerrm; end;
  insert into r (escenario, verificacion, esperado, obtenido, ok) values ('5', 'O-48 (responsable de IVA) junto con O-49 (no responsable)', 'rechaza: RESPONSABILIDADES_INCOMPATIBLES', coalesce(v_err, 'NO RECHAZÓ'), v_err = 'RESPONSABILIDADES_INCOMPATIBLES');
  v_err := null;
  begin perform public.fn_perfil_tributario_guardar(374, null, '2027-01-01', 'ordinario', array['O-99'], false, false, 'bimestral', '[]'::jsonb, null);
  exception when others then v_err := sqlerrm; end;
  insert into r (escenario, verificacion, esperado, obtenido, ok) values ('5', 'Código de responsabilidad que no existe (O-99)', 'rechaza: RESPONSABILIDAD_INVALIDA', coalesce(v_err, 'NO RECHAZÓ'), v_err = 'RESPONSABILIDAD_INVALIDA');
  v_err := null;
  begin perform public.fn_perfil_tributario_guardar(374, null, '2027-01-01', 'comun', array['O-48'], false, false, 'bimestral', '[]'::jsonb, null);
  exception when others then v_err := sqlerrm; end;
  insert into r (escenario, verificacion, esperado, obtenido, ok) values ('5', 'Régimen inexistente («comun»)', 'rechaza: REGIMEN_INVALIDO', coalesce(v_err, 'NO RECHAZÓ'), v_err = 'REGIMEN_INVALIDO');
  v_err := null;
  begin perform public.fn_perfil_tributario_guardar(374, null, '2027-01-01', 'ordinario', array['O-48'], false, false, 'bimestral',
          jsonb_build_array(jsonb_build_object('municipality_id', gen_random_uuid(), 'periodicidad', 'anual')), null);
  exception when others then v_err := sqlerrm; end;
  insert into r (escenario, verificacion, esperado, obtenido, ok) values ('5', 'ICA con un municipio que no existe', 'rechaza: MUNICIPIO_INVALIDO', coalesce(v_err, 'NO RECHAZÓ'), v_err = 'MUNICIPIO_INVALIDO');
  -- Combinación que la función ACEPTA (no la valida): no responsable de IVA con O-48 y periodicidad bimestral.
  v_err := null;
  begin perform public.fn_perfil_tributario_guardar(374, null, '2027-01-01', 'no_responsable_iva', array['O-48'], false, false, 'bimestral', '[]'::jsonb, 'Combinación dudosa');
  exception when others then v_err := sqlerrm; end;
  insert into r (escenario, verificacion, esperado, obtenido, ok) values ('5', 'Régimen «no responsable de IVA» con O-48 y periodicidad bimestral (informativo)', 'la función lo acepta: queda para el criterio del Contador', coalesce(v_err, 'ACEPTADO'), v_err is null);

  -- ═══ 6. Escritura directa ═══
  v_err := null;
  begin insert into public.organization_tax_profiles (organization_id, vigente_desde, regimen) values (374, '2028-01-01', 'ordinario');
  exception when others then v_err := sqlerrm; end;
  insert into r (escenario, verificacion, esperado, obtenido, ok) values ('6', 'INSERT directo en organization_tax_profiles (dueño)', 'rechaza: permiso denegado', coalesce(v_err, 'NO RECHAZÓ'), v_err like 'permission denied%');
  v_err := null;
  begin update public.organization_tax_profiles set regimen = 'simple' where id = v2;
  exception when others then v_err := sqlerrm; end;
  insert into r (escenario, verificacion, esperado, obtenido, ok) values ('6', 'UPDATE directo de una vigencia (dueño)', 'rechaza: permiso denegado', coalesce(v_err, 'NO RECHAZÓ'), v_err like 'permission denied%');
end
$$;

-- ═══ 6. Miembro sin finance.approve (rol «Empleado», cambiado DENTRO de la transacción) ═══
reset role;
select set_config('request.jwt.claims', '', true);
update public.organization_members set is_super_admin = false, role_id = 4
 where organization_id = 374 and user_id = 'bb11d6d2-f647-49f7-9b29-aa4c4438abf1';
select set_config('request.jwt.claims', '{"sub":"bb11d6d2-f647-49f7-9b29-aa4c4438abf1","role":"authenticated"}', true);
set local role authenticated;
do $$
declare v_err text; v_n int;
begin
  v_err := null;
  begin perform public.fn_perfil_tributario_guardar(374, null, '2028-01-01', 'ordinario', array['O-48'], false, false, 'bimestral', '[]'::jsonb, null);
  exception when others then v_err := sqlerrm; end;
  insert into r (escenario, verificacion, esperado, obtenido, ok) values ('6', 'Miembro rol Empleado: guardar perfil', 'rechaza: SIN_PERMISO', coalesce(v_err, 'NO RECHAZÓ'), v_err = 'SIN_PERMISO');
  select count(*) into v_n from public.organization_tax_profiles where organization_id = 374;
  insert into r (escenario, verificacion, esperado, obtenido, ok) values ('6', 'Miembro rol Empleado: puede leer el perfil', '5 vigencias (lectura por pertenencia)', v_n::text, v_n = 5);
end
$$;

-- No miembro.
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
do $$
declare v_err text; v_n int;
begin
  v_err := null;
  begin perform public.fn_perfil_tributario_guardar(374, null, '2028-01-01', 'ordinario', array['O-48'], false, false, 'bimestral', '[]'::jsonb, null);
  exception when others then v_err := sqlerrm; end;
  insert into r (escenario, verificacion, esperado, obtenido, ok) values ('6', 'No miembro: guardar perfil de la 374', 'rechaza: Acceso denegado a la organización', coalesce(v_err, 'NO RECHAZÓ'), v_err = 'Acceso denegado a la organización');
  select count(*) into v_n from public.organization_tax_profiles where organization_id = 374;
  insert into r (escenario, verificacion, esperado, obtenido, ok) values ('6', 'No miembro: ve el perfil de la 374', '0 filas', v_n::text, v_n = 0);
end
$$;

-- anon.
reset role;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
do $$
declare v_err text;
begin
  v_err := null;
  begin perform public.fn_perfil_tributario_guardar(374, null, '2028-01-01', 'ordinario', array['O-48'], false, false, 'bimestral', '[]'::jsonb, null);
  exception when others then v_err := sqlerrm; end;
  insert into r (escenario, verificacion, esperado, obtenido, ok) values ('6', 'anon: guardar perfil', 'rechaza: permiso denegado sobre la función', coalesce(v_err, 'NO RECHAZÓ'), v_err like 'permission denied%');
  v_err := null;
  begin perform 1 from public.organization_tax_profiles limit 1;
  exception when others then v_err := sqlerrm; end;
  insert into r (escenario, verificacion, esperado, obtenido, ok) values ('6', 'anon: leer organization_tax_profiles', 'rechaza: permiso denegado sobre la tabla', coalesce(v_err, 'NO RECHAZÓ'), v_err like 'permission denied%');
end
$$;

reset role;
select n, escenario, verificacion, esperado, obtenido, ok from r order by n;

rollback;
