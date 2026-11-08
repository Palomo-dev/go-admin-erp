-- Pruebas de controles · Anticipos a proveedores (permisos, organización, escritura directa)
-- Fecha: 2026-11-07 · Proyecto taqjemqjtumhwptchcxk · Organización de pruebas 374. NO DEJA DATOS (begin … rollback).
--
-- 1. Visitante sin sesión (anon): no puede ejecutar las funciones.
-- 2. Usuario sin sesión de la org 374 (no miembro): «Acceso denegado» y no ve los anticipos.
-- 3. Miembro de la 374 sin permisos de Finanzas (se le baja el rol a «Empleado» DENTRO de la transacción): sin_permiso.
-- 4. Ni el miembro con todos los permisos puede escribir directo en las tablas (solo por las funciones).
-- 5. Un proveedor de otra organización no sirve para un anticipo de la 374.

begin;

create temp table r (n serial primary key, escenario text, verificacion text, esperado text, obtenido text, ok boolean);
create temp table ctx (k text primary key, v text);
grant all on r, ctx to authenticated, anon;
grant usage on sequence r_n_seq to authenticated, anon;

with s as (
  insert into public.suppliers (organization_id, name, nit, supplier_type)
  values (374, 'Proveedor de prueba A', '900000001', 'company') returning id)
insert into ctx select 'sup', id::text from s;
-- Un proveedor de OTRA organización (solo su id).
insert into ctx select 'sup_otra', min(id)::text from public.suppliers where organization_id <> 374;

-- ── El dueño de la 374 crea un anticipo para las pruebas de permisos ──
select set_config('request.jwt.claims', '{"sub":"bb11d6d2-f647-49f7-9b29-aa4c4438abf1","role":"authenticated"}', true);
set local role authenticated;
do $$
declare v_res jsonb; v_err text;
begin
  v_res := public.fn_anticipo_proveedor_crear((select v::int from ctx where k = 'sup'), 585, 100000, 'transfer', 'control-anticipo-1', 374, null, 'TRF-C1');
  insert into ctx values ('ant', v_res ->> 'anticipo_id');

  -- 4. Escritura directa, incluso con todos los permisos.
  v_err := null;
  begin
    insert into public.supplier_advances (organization_id, branch_id, supplier_id, amount, balance, currency, account_code)
    values (374, 585, (select v::int from ctx where k = 'sup'), 5, 5, 'COP', '1330');
  exception when others then v_err := sqlerrm;
  end;
  insert into r (escenario, verificacion, esperado, obtenido, ok) values
    ('4', 'INSERT directo en supplier_advances (dueño)', 'rechaza: permiso denegado', coalesce(v_err, 'NO RECHAZÓ'), v_err like 'permission denied%');
  v_err := null;
  begin
    update public.supplier_advances set balance = 999999 where id = (select v::uuid from ctx where k = 'ant');
  exception when others then v_err := sqlerrm;
  end;
  insert into r (escenario, verificacion, esperado, obtenido, ok) values
    ('4', 'UPDATE directo del saldo (dueño)', 'rechaza: permiso denegado', coalesce(v_err, 'NO RECHAZÓ'), v_err like 'permission denied%');
  v_err := null;
  begin
    delete from public.supplier_advance_applications where organization_id = 374;
  exception when others then v_err := sqlerrm;
  end;
  insert into r (escenario, verificacion, esperado, obtenido, ok) values
    ('4', 'DELETE directo de aplicaciones (dueño)', 'rechaza: permiso denegado', coalesce(v_err, 'NO RECHAZÓ'), v_err like 'permission denied%');

  -- 5. Proveedor de otra organización.
  v_err := null;
  begin
    perform public.fn_anticipo_proveedor_crear((select v::int from ctx where k = 'sup_otra'), 585, 1000, 'transfer', 'control-otra-org', 374, null, 'TRF-C2');
  exception when others then v_err := sqlerrm;
  end;
  insert into r (escenario, verificacion, esperado, obtenido, ok) values
    ('5', 'Anticipo con el proveedor de otra organización', 'rechaza: proveedor_no_encontrado', coalesce(v_err, 'NO RECHAZÓ'), v_err = 'proveedor_no_encontrado');

  -- Validaciones de entrada.
  v_err := null;
  begin
    perform public.fn_anticipo_proveedor_crear((select v::int from ctx where k = 'sup'), 585, 1000, 'credit', 'control-metodo-credito', 374);
  exception when others then v_err := sqlerrm;
  end;
  insert into r (escenario, verificacion, esperado, obtenido, ok) values
    ('5', 'Anticipo con método «crédito» (no mueve dinero)', 'rechaza: metodo_invalido', coalesce(v_err, 'NO RECHAZÓ'), v_err = 'metodo_invalido');
  v_err := null;
  begin
    perform public.fn_anticipo_proveedor_crear((select v::int from ctx where k = 'sup'), 585, 1000, 'cash', 'control-sin-caja', 374);
  exception when others then v_err := sqlerrm;
  end;
  insert into r (escenario, verificacion, esperado, obtenido, ok) values
    ('5', 'Anticipo en efectivo sin caja abierta', 'rechaza: sin_caja_abierta', coalesce(v_err, 'NO RECHAZÓ'), v_err = 'sin_caja_abierta');
  v_err := null;
  begin
    perform public.fn_anticipo_proveedor_crear((select v::int from ctx where k = 'sup'), 585, 1000, 'transfer', '', 374);
  exception when others then v_err := sqlerrm;
  end;
  insert into r (escenario, verificacion, esperado, obtenido, ok) values
    ('5', 'Anticipo sin clave de idempotencia', 'rechaza: clave_idempotencia_invalida', coalesce(v_err, 'NO RECHAZÓ'), v_err = 'clave_idempotencia_invalida');
  v_err := null;
  begin
    perform public.fn_anticipo_proveedor_devolver((select v::uuid from ctx where k = 'ant'), 1000, 'transfer', 'x', 'control-motivo', 374);
  exception when others then v_err := sqlerrm;
  end;
  insert into r (escenario, verificacion, esperado, obtenido, ok) values
    ('5', 'Devolución sin motivo (menos de 3 letras)', 'rechaza: motivo_obligatorio', coalesce(v_err, 'NO RECHAZÓ'), v_err = 'motivo_obligatorio');
end
$$;

-- ── 2. Usuario con sesión que NO es miembro de la 374 ──
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
do $$
declare v_err text; v_n int;
begin
  v_err := null;
  begin
    perform public.fn_anticipo_proveedor_crear((select v::int from ctx where k = 'sup'), 585, 1000, 'transfer', 'control-no-miembro', 374);
  exception when others then v_err := sqlerrm;
  end;
  insert into r (escenario, verificacion, esperado, obtenido, ok) values
    ('2', 'No miembro: crear anticipo en la 374', 'rechaza: Acceso denegado a la organización', coalesce(v_err, 'NO RECHAZÓ'), v_err = 'Acceso denegado a la organización');
  v_err := null;
  begin
    perform public.fn_anticipo_proveedor_anular((select v::uuid from ctx where k = 'ant'), 'Intento ajeno', null);
  exception when others then v_err := sqlerrm;
  end;
  insert into r (escenario, verificacion, esperado, obtenido, ok) values
    ('2', 'No miembro: anular un anticipo de la 374 (sin decir la organización)', 'rechaza: Acceso denegado a la organización', coalesce(v_err, 'NO RECHAZÓ'), v_err = 'Acceso denegado a la organización');
  select count(*) into v_n from public.supplier_advances where organization_id = 374;
  insert into r (escenario, verificacion, esperado, obtenido, ok) values
    ('2', 'No miembro: ve anticipos de la 374', '0 filas (RLS por pertenencia)', v_n::text, v_n = 0);
end
$$;

-- ── 3. Miembro de la 374 sin permisos de Finanzas ──
reset role;
-- Sin sesión simulada mientras el administrador de la base cambia el rol (el aviso de «rol cambiado» valida la sesión).
select set_config('request.jwt.claims', '', true);
update public.organization_members set is_super_admin = false, role_id = 4
 where organization_id = 374 and user_id = 'bb11d6d2-f647-49f7-9b29-aa4c4438abf1';
select set_config('request.jwt.claims', '{"sub":"bb11d6d2-f647-49f7-9b29-aa4c4438abf1","role":"authenticated"}', true);
set local role authenticated;
do $$
declare v_err text; v_n int;
begin
  v_err := null;
  begin
    perform public.fn_anticipo_proveedor_crear((select v::int from ctx where k = 'sup'), 585, 1000, 'transfer', 'control-sin-permiso', 374);
  exception when others then v_err := sqlerrm;
  end;
  insert into r (escenario, verificacion, esperado, obtenido, ok) values
    ('3', 'Miembro rol Empleado: crear (exige finance.create)', 'rechaza: sin_permiso', coalesce(v_err, 'NO RECHAZÓ'), v_err = 'sin_permiso');
  v_err := null;
  begin
    perform public.fn_anticipo_proveedor_devolver((select v::uuid from ctx where k = 'ant'), 1000, 'transfer', 'Prueba de permiso', 'control-sin-permiso-dev', 374);
  exception when others then v_err := sqlerrm;
  end;
  insert into r (escenario, verificacion, esperado, obtenido, ok) values
    ('3', 'Miembro rol Empleado: devolver (exige finance.void)', 'rechaza: sin_permiso', coalesce(v_err, 'NO RECHAZÓ'), v_err = 'sin_permiso');
  v_err := null;
  begin
    perform public.fn_anticipo_proveedor_anular((select v::uuid from ctx where k = 'ant'), 'Prueba de permiso', 374);
  exception when others then v_err := sqlerrm;
  end;
  insert into r (escenario, verificacion, esperado, obtenido, ok) values
    ('3', 'Miembro rol Empleado: anular (exige finance.void)', 'rechaza: sin_permiso', coalesce(v_err, 'NO RECHAZÓ'), v_err = 'sin_permiso');
  select count(*) into v_n from public.supplier_advances where organization_id = 374;
  insert into r (escenario, verificacion, esperado, obtenido, ok) values
    ('3', 'Miembro rol Empleado: puede LEER los anticipos', '1 fila (la lectura es por pertenencia, no por permiso)', v_n::text, v_n = 1);
end
$$;

-- ── 1. Visitante sin sesión ──
reset role;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
do $$
declare v_err text;
begin
  v_err := null;
  begin
    perform public.fn_anticipo_proveedor_crear((select v::int from ctx where k = 'sup'), 585, 1000, 'transfer', 'control-anon', 374);
  exception when others then v_err := sqlerrm;
  end;
  insert into r (escenario, verificacion, esperado, obtenido, ok) values
    ('1', 'anon: crear anticipo', 'rechaza: permiso denegado sobre la función', coalesce(v_err, 'NO RECHAZÓ'), v_err like 'permission denied%');
  v_err := null;
  begin
    perform 1 from public.supplier_advances limit 1;
  exception when others then v_err := sqlerrm;
  end;
  insert into r (escenario, verificacion, esperado, obtenido, ok) values
    ('1', 'anon: leer supplier_advances', 'rechaza: permiso denegado sobre la tabla', coalesce(v_err, 'NO RECHAZÓ'), v_err like 'permission denied%');
end
$$;

reset role;
select n, escenario, verificacion, esperado, obtenido, ok from r order by n;

rollback;
