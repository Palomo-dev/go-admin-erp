-- Revierte 20261022033041_fuente_contador_backfill.
-- No había asientos que restaurar: esa migración no escribió journal_lines.
-- Sí borra las cuentas marcadas "Agregada desde la plantilla del contador."
-- si todavía no tienen movimientos. Si alguna ya los tiene, se deja y hay que
-- inactivarla a mano.
-- requiere_tercero y requiere_centro_costo vuelven a falso en todo el plan,
-- que era el estado de las 5548 cuentas anteriores. Un cambio posterior a
-- esta migración se pierde.
-- concepto_exogena se elimina con lo que se haya anotado ahí.
-- Los nombres que esta migración cambió vuelven al texto anterior.
-- Las categorías predefinidas de esta siembra se borran, incluida una clave
-- igual creada después.

delete from public.categorias_tesoreria
 where clave in (
   'ventas_productos', 'servicios', 'arriendos_recibidos', 'intereses_recibidos',
   'comisiones_recibidas', 'reintegros', 'aportes_socios', 'prestamos_recibidos',
   'anticipos_clientes', 'cobro_cartera', 'devolucion_proveedores', 'otros_ingresos',
   'proveedores', 'nomina', 'seguridad_social', 'arriendo', 'energia', 'agua', 'gas',
   'internet', 'transporte', 'publicidad', 'mantenimiento', 'papeleria', 'aseo',
   'honorarios', 'seguros', 'impuestos', 'impuestos_declarados', 'comisiones_bancarias',
   'gmf', 'intereses_pagados', 'software', 'combustible', 'viaticos', 'domicilios',
   'pago_prestamos', 'retiros_socios', 'devoluciones_clientes', 'otros_gastos'
 );

delete from public.chart_of_accounts c
 where c.description = 'Agregada desde la plantilla del contador.'
   and not exists (
     select 1 from public.journal_lines jl
      where jl.organization_id = c.organization_id
        and jl.account_code = c.account_code
   );

update public.chart_of_accounts
   set name = 'Proveedores Nacionales', updated_at = now()
 where account_code = '2105' and name = 'Bancos nacionales';

update public.chart_of_accounts
   set name = 'Ventas de Mercancias', updated_at = now()
 where account_code = '4105' and name = 'Agricultura, ganadería, caza y silvicultura';

update public.chart_of_accounts
   set name = 'Costo de Mercancias Vendidas', updated_at = now()
 where account_code = '6105' and name = 'Agricultura, ganadería, caza y silvicultura';

update public.chart_of_accounts
   set name = 'Inventarios', updated_at = now()
 where account_code = '1405' and name = 'Materias primas';

update public.chart_of_accounts
   set name = 'Otros Gastos', updated_at = now()
 where account_code = '5905' and name = 'Ganancias y pérdidas';

update public.chart_of_accounts
   set name = 'PÉRDIDA DEL EJERCICIO', updated_at = now()
 where account_code = '3610' and name = 'Pérdida del ejercicio';

update public.chart_of_accounts c
   set naturaleza = null, updated_at = now()
  from public.puc_plantilla p
 where c.account_code = p.codigo
   and c.naturaleza = p.naturaleza
   and c.description is distinct from 'Agregada desde la plantilla del contador.';

update public.chart_of_accounts
   set requiere_tercero = false,
       requiere_centro_costo = false,
       updated_at = now()
 where requiere_tercero or requiere_centro_costo;

alter table public.chart_of_accounts drop column if exists concepto_exogena;

delete from public.puc_plantilla
 where codigo in (
   '135515', '135517', '135518', '1460', '1598', '2355', '4120', '421005', '4225',
   '511595', '5130', '513525', '513530', '513535', '513550', '513555', '513595',
   '5140', '519525', '519530', '519545', '523550', '523560', '530515', '530520',
   '530595', '6120'
 );

update public.puc_plantilla
   set es_movimiento = true
 where codigo in ('1355', '4210', '5115', '5135', '5195', '5235', '5305');

update public.puc_plantilla
   set requiere_tercero = false,
       requiere_centro_costo = false;

update public.puc_plantilla
   set requiere_tercero = true
 where codigo in (
   '1305', '1310', '1325', '1330', '1355', '1365', '1380', '2105', '2205', '2210',
   '2215', '2305', '2335', '2365', '2367', '2368', '2370', '2380', '2505', '2805'
 );

update public.puc_plantilla
   set requiere_centro_costo = true
 where codigo in (
   '5105', '5110', '5115', '5120', '5135', '5145', '5150', '5155', '5160', '5165',
   '5195', '5205', '5235', '5295', '5305', '5395', '5405', '5905', '6105', '6135',
   '6140', '6155', '6205', '6210', '6225', '7105', '7205', '7305', '7405'
 );

create or replace function public.fn_sembrar_categorias_tesoreria(p_org integer)
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_insertadas integer := 0;
begin
  perform public.fn_assert_acceso_org(p_org);
  perform set_config('app.sembrar_categorias', '1', true);

  insert into public.categorias_tesoreria (
    organization_id, clave, tipo, nombre, icono, cuenta_sugerida, orden, activa, es_predefinida
  )
  select
    p_org,
    v.clave,
    v.tipo,
    v.nombre,
    v.icono,
    case
      when c.account_code is not null
       and c.is_active is distinct from false
       and c.es_movimiento is distinct from false
      then v.cuenta
      else null
    end,
    v.orden,
    true,
    true
  from (
    values
      ('ventas_productos', 'ingreso', 'Ventas de productos', 'shopping-bag', '4135', 10),
      ('servicios', 'ingreso', 'Servicios', 'wrench', '4155', 20),
      ('arriendos_recibidos', 'ingreso', 'Arriendos recibidos', 'home', '4220', 30),
      ('intereses_recibidos', 'ingreso', 'Intereses', 'percent', '421005', 40),
      ('comisiones_recibidas', 'ingreso', 'Comisiones recibidas', 'badge-percent', '4235', 50),
      ('reintegros', 'ingreso', 'Reintegros y recuperaciones', 'rotate-ccw', '4250', 60),
      ('aportes_socios', 'ingreso', 'Aportes de socios', 'users', '3105', 70),
      ('prestamos_recibidos', 'ingreso', 'Préstamos recibidos', 'landmark', '2105', 80),
      ('anticipos_clientes', 'ingreso', 'Anticipos de clientes', 'wallet', '2805', 90),
      ('cobro_cartera', 'ingreso', 'Cobro de cartera', 'receipt', '1305', 100),
      ('devolucion_proveedores', 'ingreso', 'Devolución de proveedores', 'undo-2', '2205', 110),
      ('otros_ingresos', 'ingreso', 'Otros ingresos', 'circle-plus', '4295', 120),
      ('proveedores', 'egreso', 'Proveedores y compras', 'truck', '2205', 10),
      ('nomina', 'egreso', 'Nómina', 'users', '5105', 20),
      ('seguridad_social', 'egreso', 'Seguridad social y parafiscales', 'shield', '5105', 30),
      ('arriendo', 'egreso', 'Arriendo', 'home', '5120', 40),
      ('energia', 'egreso', 'Energía', 'zap', '513530', 50),
      ('agua', 'egreso', 'Agua', 'droplet', '513525', 60),
      ('internet', 'egreso', 'Internet y telefonía', 'wifi', '513535', 70),
      ('transporte', 'egreso', 'Transporte y fletes', 'truck', '5135', 80),
      ('publicidad', 'egreso', 'Publicidad', 'megaphone', '523560', 90),
      ('mantenimiento', 'egreso', 'Mantenimiento', 'wrench', '5145', 100),
      ('papeleria', 'egreso', 'Papelería', 'file-text', '5195', 110),
      ('aseo', 'egreso', 'Aseo y cafetería', 'coffee', '5195', 120),
      ('honorarios', 'egreso', 'Honorarios', 'briefcase', '5110', 130),
      ('seguros', 'egreso', 'Seguros', 'shield-check', '5130', 140),
      ('impuestos', 'egreso', 'Impuestos', 'landmark', '5115', 150),
      ('comisiones_bancarias', 'egreso', 'Comisiones bancarias', 'landmark', '530515', 160),
      ('gmf', 'egreso', 'GMF 4x1000', 'banknote', '511595', 170),
      ('intereses_pagados', 'egreso', 'Intereses', 'percent', '530520', 180),
      ('software', 'egreso', 'Software y suscripciones', 'monitor', '5165', 190),
      ('combustible', 'egreso', 'Combustible', 'fuel', '5195', 200),
      ('viaticos', 'egreso', 'Viáticos', 'plane', '5155', 210),
      ('domicilios', 'egreso', 'Domicilios', 'bike', '5135', 220),
      ('pago_prestamos', 'egreso', 'Pago de préstamos', 'landmark', '2105', 230),
      ('retiros_socios', 'egreso', 'Retiros de socios', 'log-out', '3105', 240),
      ('devoluciones_clientes', 'egreso', 'Devoluciones a clientes', 'undo-2', '4175', 250),
      ('otros_gastos', 'egreso', 'Otros gastos', 'circle-minus', '5195', 260)
  ) as v(clave, tipo, nombre, icono, cuenta, orden)
  left join public.chart_of_accounts c
    on c.organization_id = p_org
   and c.account_code = v.cuenta
  where not exists (
    select 1 from public.categorias_tesoreria ya
     where ya.organization_id = p_org and ya.clave = v.clave
  )
  and not exists (
    select 1 from public.categorias_tesoreria ya
     where ya.organization_id = p_org
       and ya.tipo = v.tipo
       and lower(ya.nombre) = lower(v.nombre)
  )
  on conflict (organization_id, clave) where clave is not null do nothing;

  get diagnostics v_insertadas = row_count;
  perform set_config('app.sembrar_categorias', '', true);
  return v_insertadas;
end;
$fn$;
