-- Fuente del contador. Agrega concepto_exogena, completa el plan con la
-- plantilla y siembra las categorías de tesorería ya corregidas.
-- No mueve saldos ni reescribe journal_lines. No elige 6155 ni 6170.
-- No crea la cuenta de la contribución parafiscal del turismo.

alter table public.chart_of_accounts
  add column if not exists concepto_exogena text;

comment on column public.chart_of_accounts.concepto_exogena is
  'Concepto de información exógena DIAN. Lo asigna el contador. Opcional.';

insert into public.puc_plantilla (
  codigo, nombre, tipo, padre, descripcion, naturaleza, es_movimiento, requiere_tercero, requiere_centro_costo
)
values
  ('135515', 'Retención en la fuente', 'asset', '1355', 'Subcuenta de 1355. El tercero es quien retuvo.', 'debito', true, true, false),
  ('135517', 'Retención de IVA', 'asset', '1355', 'Subcuenta de 1355.', 'debito', true, true, false),
  ('135518', 'Retención de ICA', 'asset', '1355', 'Subcuenta de 1355.', 'debito', true, true, false),
  ('1460', 'Envases y empaques', 'asset', '14', 'Insumos de restaurante.', 'debito', true, false, false),
  ('1598', 'Deterioro de propiedad, planta y equipo', 'asset', '15', 'Naturaleza crédito.', 'credito', true, false, false),
  ('2355', 'Deudas con socios', 'liability', '23', 'Préstamo de un socio. No es la 2195.', 'credito', true, true, false),
  ('4120', 'Industrias manufactureras', 'income', '41', 'Ingreso de manufactura.', 'credito', true, true, true),
  ('421005', 'Intereses', 'income', '4210', 'Intereses recibidos.', 'credito', true, true, true),
  ('4225', 'Comisiones', 'income', '42', 'Comisiones recibidas. La 4235 es servicios.', 'credito', true, true, true),
  ('511595', 'Gravamen a los movimientos financieros', 'expense', '5115', 'GMF. Alternativa 530595.', 'debito', true, true, true),
  ('5130', 'Seguros', 'expense', '51', null, 'debito', true, true, true),
  ('513525', 'Agua', 'expense', '5135', null, 'debito', true, true, true),
  ('513530', 'Energía', 'expense', '5135', null, 'debito', true, true, true),
  ('513535', 'Teléfono e internet', 'expense', '5135', 'No usar 513540: es correo, portes y telegramas.', 'debito', true, true, true),
  ('513550', 'Transporte, fletes y acarreos', 'expense', '5135', 'Administración.', 'debito', true, true, true),
  ('513555', 'Gas', 'expense', '5135', 'Categoría nueva.', 'debito', true, true, true),
  ('513595', 'Otros servicios', 'expense', '5135', 'Internet alterno y SaaS mensual.', 'debito', true, true, true),
  ('5140', 'Gastos legales', 'expense', '51', null, 'debito', true, true, true),
  ('519525', 'Aseo y cafetería', 'expense', '5195', null, 'debito', true, true, true),
  ('519530', 'Papelería', 'expense', '5195', null, 'debito', true, true, true),
  ('519545', 'Combustible', 'expense', '5195', null, 'debito', true, true, true),
  ('523550', 'Transporte, fletes y acarreos', 'expense', '5235', 'Ventas.', 'debito', true, true, true),
  ('523560', 'Publicidad', 'expense', '5235', null, 'debito', true, true, true),
  ('530515', 'Comisiones bancarias', 'expense', '5305', null, 'debito', true, true, true),
  ('530520', 'Intereses', 'expense', '5305', 'Intereses pagados.', 'debito', true, true, true),
  ('530595', 'Gravamen a los movimientos financieros', 'expense', '5305', 'Alternativa del GMF. El defecto es 511595.', 'debito', true, true, true),
  ('6120', 'Industrias manufactureras', 'expense', '61', 'Costo de ventas de manufactura.', 'debito', true, true, true)
on conflict (codigo) do nothing;

update public.puc_plantilla
   set es_movimiento = false
 where codigo in ('1355', '4210', '5115', '5135', '5195', '5235', '5305')
   and exists (
     select 1 from public.puc_plantilla h
      where h.padre = puc_plantilla.codigo
   );

update public.puc_plantilla
   set requiere_centro_costo = true
 where left(codigo, 1) in ('4', '5', '6', '7')
   and length(codigo) >= 4
   and codigo <> '6155';

update public.puc_plantilla
   set requiere_tercero = true
 where length(codigo) >= 4
   and codigo <> '6155'
   and (
     left(codigo, 2) in ('13', '21', '22', '23', '25', '28')
     or left(codigo, 4) in ('2408', '3105', '3115')
     or left(codigo, 1) in ('4', '5', '6')
   );

update public.chart_of_accounts c
   set name = p.nombre,
       updated_at = now()
  from public.puc_plantilla p
 where c.account_code = p.codigo
   and not exists (
     select 1 from public.journal_lines jl
      where jl.organization_id = c.organization_id
        and jl.account_code = c.account_code
   )
   and (
     (c.account_code = '2105' and c.name = 'Proveedores Nacionales' and p.nombre = 'Bancos nacionales')
     or (c.account_code = '4105' and c.name = 'Ventas de Mercancias' and p.nombre = 'Agricultura, ganadería, caza y silvicultura')
     or (c.account_code = '6105' and c.name = 'Costo de Mercancias Vendidas' and p.nombre = 'Agricultura, ganadería, caza y silvicultura')
     or (c.account_code = '1405' and c.name = 'Inventarios' and p.nombre = 'Materias primas')
     or (c.account_code = '5905' and c.name = 'Otros Gastos' and p.nombre = 'Ganancias y pérdidas')
     or (c.account_code = '3610' and c.name = 'PÉRDIDA DEL EJERCICIO' and p.nombre = 'Pérdida del ejercicio')
   );

update public.chart_of_accounts c
   set naturaleza = p.naturaleza,
       updated_at = now()
  from public.puc_plantilla p
 where c.account_code = p.codigo
   and c.naturaleza is null
   and c.account_code <> '6155';

insert into public.chart_of_accounts (
  organization_id, account_code, name, type, parent_code, is_active, description,
  naturaleza, es_movimiento, requiere_tercero, requiere_centro_costo
)
select
  o.id, p.codigo, p.nombre, p.tipo, p.padre, true,
  'Agregada desde la plantilla del contador.',
  p.naturaleza, p.es_movimiento, p.requiere_tercero, p.requiere_centro_costo
from public.organizations o
join public.puc_plantilla p on length(p.codigo) = 1
where p.codigo <> '6155'
  and not exists (
    select 1 from public.chart_of_accounts c
     where c.organization_id = o.id and c.account_code = p.codigo
  );

insert into public.chart_of_accounts (
  organization_id, account_code, name, type, parent_code, is_active, description,
  naturaleza, es_movimiento, requiere_tercero, requiere_centro_costo
)
select
  o.id, p.codigo, p.nombre, p.tipo, p.padre, true,
  'Agregada desde la plantilla del contador.',
  p.naturaleza, false, p.requiere_tercero, p.requiere_centro_costo
from public.organizations o
join public.puc_plantilla p on length(p.codigo) = 2
where p.codigo <> '6155'
  and not exists (
    select 1 from public.chart_of_accounts c
     where c.organization_id = o.id and c.account_code = p.codigo
  )
  and exists (
    select 1 from public.chart_of_accounts padre
     where padre.organization_id = o.id and padre.account_code = p.padre
  );

insert into public.chart_of_accounts (
  organization_id, account_code, name, type, parent_code, is_active, description,
  naturaleza, es_movimiento, requiere_tercero, requiere_centro_costo
)
select
  o.id, p.codigo, p.nombre, p.tipo, p.padre, true,
  'Agregada desde la plantilla del contador.',
  p.naturaleza, p.es_movimiento, p.requiere_tercero, p.requiere_centro_costo
from public.organizations o
join public.puc_plantilla p on length(p.codigo) = 4
where p.codigo <> '6155'
  and not exists (
    select 1 from public.chart_of_accounts c
     where c.organization_id = o.id and c.account_code = p.codigo
  )
  and exists (
    select 1 from public.chart_of_accounts padre
     where padre.organization_id = o.id and padre.account_code = p.padre
  );

insert into public.chart_of_accounts (
  organization_id, account_code, name, type, parent_code, is_active, description,
  naturaleza, es_movimiento, requiere_tercero, requiere_centro_costo
)
select
  o.id, p.codigo, p.nombre, p.tipo, p.padre, true,
  'Agregada desde la plantilla del contador.',
  p.naturaleza, p.es_movimiento, p.requiere_tercero, p.requiere_centro_costo
from public.organizations o
join public.puc_plantilla p on length(p.codigo) = 6
where p.codigo <> '6155'
  and not exists (
    select 1 from public.chart_of_accounts c
     where c.organization_id = o.id and c.account_code = p.codigo
  )
  and exists (
    select 1 from public.chart_of_accounts padre
     where padre.organization_id = o.id and padre.account_code = p.padre
  );

insert into public.chart_of_accounts (
  organization_id, account_code, name, type, parent_code, is_active, description,
  naturaleza, es_movimiento, requiere_tercero, requiere_centro_costo
)
select
  o.id, p.codigo, p.nombre, p.tipo, p.padre, true,
  'Agregada desde la plantilla del contador.',
  p.naturaleza, p.es_movimiento, p.requiere_tercero, p.requiere_centro_costo
from public.organizations o
join public.puc_plantilla p on length(p.codigo) >= 8
where p.codigo <> '6155'
  and not exists (
    select 1 from public.chart_of_accounts c
     where c.organization_id = o.id and c.account_code = p.codigo
  )
  and exists (
    select 1 from public.chart_of_accounts padre
     where padre.organization_id = o.id and padre.account_code = p.padre
  );

update public.chart_of_accounts c
   set requiere_tercero = true,
       updated_at = now()
 where c.requiere_tercero = false
   and length(c.account_code) >= 4
   and c.account_code ~ '^[0-9]+$'
   and c.account_code <> '6155'
   and (
     left(c.account_code, 2) in ('13', '21', '22', '23', '25', '28')
     or left(c.account_code, 4) in ('2408', '3105', '3115')
     or left(c.account_code, 1) in ('4', '5', '6')
   )
   and not exists (
     select 1 from public.accounting_rules r
      where r.organization_id = c.organization_id
        and r.is_active
        and c.account_code in (r.debit_account_code, r.credit_account_code, r.tax_account_code)
   );

update public.chart_of_accounts c
   set requiere_centro_costo = true,
       updated_at = now()
 where c.requiere_centro_costo = false
   and length(c.account_code) >= 4
   and c.account_code ~ '^[0-9]+$'
   and left(c.account_code, 1) in ('4', '5', '6', '7')
   and c.account_code <> '6155'
   and not exists (
     select 1 from public.accounting_rules r
      where r.organization_id = c.organization_id
        and r.is_active
        and c.account_code in (r.debit_account_code, r.credit_account_code, r.tax_account_code)
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
      ('comisiones_recibidas', 'ingreso', 'Comisiones recibidas', 'badge-percent', '4225', 50),
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
      ('gas', 'egreso', 'Gas', 'flame', '513555', 65),
      ('internet', 'egreso', 'Internet y telefonía', 'wifi', '513535', 70),
      ('transporte', 'egreso', 'Transporte y fletes', 'truck', '513550', 80),
      ('publicidad', 'egreso', 'Publicidad', 'megaphone', '523560', 90),
      ('mantenimiento', 'egreso', 'Mantenimiento', 'wrench', '5145', 100),
      ('papeleria', 'egreso', 'Papelería', 'file-text', '519530', 110),
      ('aseo', 'egreso', 'Aseo y cafetería', 'coffee', '519525', 120),
      ('honorarios', 'egreso', 'Honorarios', 'briefcase', '5110', 130),
      ('seguros', 'egreso', 'Seguros', 'shield-check', '5130', 140),
      ('impuestos', 'egreso', 'Impuestos', 'landmark', '5115', 150),
      ('impuestos_declarados', 'egreso', 'Pago de impuestos declarados', 'landmark', '2408', 155),
      ('comisiones_bancarias', 'egreso', 'Comisiones bancarias', 'landmark', '530515', 160),
      ('gmf', 'egreso', 'GMF 4x1000', 'banknote', '511595', 170),
      ('intereses_pagados', 'egreso', 'Intereses', 'percent', '530520', 180),
      ('software', 'egreso', 'Software y suscripciones', 'monitor', '513595', 190),
      ('combustible', 'egreso', 'Combustible', 'fuel', '519545', 200),
      ('viaticos', 'egreso', 'Viáticos', 'plane', '5155', 210),
      ('domicilios', 'egreso', 'Domicilios', 'bike', '523550', 220),
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

do $sembrar$
declare
  r record;
begin
  for r in select id from public.organizations loop
    perform public.fn_sembrar_categorias_tesoreria(r.id);
  end loop;
end
$sembrar$;

do $verificar$
begin
  if exists (select 1 from public.chart_of_accounts where account_code = '6155') then
    raise exception '6155 no se copia: el costo de servicios sigue por definir';
  end if;
  if exists (select 1 from public.puc_plantilla where codigo = '6170') then
    raise exception '6170 no se agrega hasta que Juan confirme el costo de servicios';
  end if;
  if exists (
    select 1 from public.chart_of_accounts
     where name ilike '%parafiscal%turismo%' or account_code = 'turismo'
  ) then
    raise exception 'la contribución parafiscal del turismo sigue sin código';
  end if;
end
$verificar$;
