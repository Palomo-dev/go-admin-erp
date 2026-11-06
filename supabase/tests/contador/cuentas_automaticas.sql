-- Prueba aislada de cuentas automáticas: la cuenta que muestra la pantalla es la que usa el asiento.
-- Solo para una base local vacía: la base borra el esquema public. Datos inventados, sin clientes.
--
-- Uso, desde la raíz del repositorio:
--   psql -p <puerto> -U postgres -d <base> -v ON_ERROR_STOP=1 -f supabase/tests/contador/cuentas_automaticas.sql
--
-- cuentas_automaticas_base.sql trae la estructura y la copia exacta de 65 funciones del motor.
-- Dobles de esta prueba: auth.uid, auth.role y get_user_permission_codes (lee prueba.permisos).
-- Los disparadores de asiento son los reales: cada caso emite el documento y lee journal_lines.

\set ON_ERROR_STOP on
\i supabase/tests/contador/cuentas_automaticas_base.sql
set client_min_messages = warning;

create table prueba.permisos (user_id uuid, organization_id integer, code text);

create or replace function public.get_user_permission_codes(p_user_id uuid, p_organization_id integer)
returns text[] language sql stable
as $$ select coalesce(array_agg(code), array[]::text[]) from prueba.permisos where user_id = p_user_id and organization_id = p_organization_id $$;

create function prueba.como(p_uid text, p_rol text default 'authenticated') returns void language plpgsql as $$
begin
  perform set_config('test.uid', p_uid, false);
  perform set_config('test.role', p_rol, false);
end $$;

create function prueba.igual(p_real text, p_esperado text, p_que text) returns void language plpgsql as $$
begin
  if p_real is distinct from p_esperado then
    raise exception 'FALLO % : esperado [%], real [%]', p_que, p_esperado, p_real;
  end if;
  raise notice 'ok  %', p_que;
end $$;

create function prueba.falla(p_sql text, p_contiene text, p_que text) returns void language plpgsql as $$
declare v_msg text;
begin
  begin
    execute p_sql;
  exception when others then
    get stacked diagnostics v_msg = message_text;
    if position(p_contiene in v_msg) = 0 then
      raise exception 'FALLO % : error distinto: %', p_que, v_msg;
    end if;
    raise notice 'ok  %', p_que;
    return;
  end;
  raise exception 'FALLO % : debía fallar', p_que;
end $$;

-- Una consulta a la RPC, y un campo de su única fila.
create function prueba.ver(p_org integer, p_branch integer, p_doc text, p_consulta jsonb) returns jsonb language sql as $$
  select public.fn_cuentas_efectivas(p_org, p_branch, p_doc, jsonb_build_array(p_consulta)) -> 0
$$;

-- Cuentas de un asiento, sin contrapartida ni impuesto.
create function prueba.cuentas_asiento(p_source text, p_id uuid, p_lado text) returns text language sql as $$
  select string_agg(l.account_code, ',' order by l.account_code)
    from public.journal_lines l
    join public.journal_entries e on e.id = l.journal_entry_id
   where e.source = p_source and e.source_id = p_id::text
     and (case p_lado when 'credito' then l.credit > 0 else l.debit > 0 end)
     and l.account_code not like '24%' and l.account_code not like '1305%' and l.account_code not like '2205%'
$$;

create function prueba.factura(p_org integer, p_branch integer, p_lineas jsonb) returns uuid language plpgsql as $$
declare v_id uuid := gen_random_uuid(); v jsonb; v_total numeric := 0;
begin
  insert into public.invoice_sales (id, organization_id, branch_id, customer_id, number, total, tax_total, status, document_type, issue_date, currency)
  values (v_id, p_org, p_branch, (select c.id from public.customers c where c.organization_id = p_org limit 1),
          'F-' || left(v_id::text, 6), 0, 0, 'draft', 'invoice', '2026-10-15', 'COP');
  for v in select * from jsonb_array_elements(p_lineas) loop
    insert into public.invoice_items (invoice_id, invoice_type, invoice_sales_id, product_id, description, qty, unit_price, total_line, cuenta_contable)
    values (v_id, 'sale', v_id, nullif(v->>'product_id', '')::integer, 'Línea', 1, 1000, 1000, v->>'cuenta_contable');
    v_total := v_total + 1000;
  end loop;
  update public.invoice_sales set total = v_total, status = 'issued' where id = v_id;
  return v_id;
end $$;

create function prueba.compra(p_org integer, p_branch integer, p_proveedor integer, p_lineas jsonb,
                              p_estado text default 'received', p_metodo text default 'credit', p_fecha date default '2026-10-15')
returns uuid language plpgsql as $$
declare v_id uuid := gen_random_uuid(); v jsonb; v_total numeric := 0;
begin
  insert into public.invoice_purchase (id, organization_id, branch_id, supplier_id, number_ext, total, tax_total, status, issue_date, payment_method, currency)
  values (v_id, p_org, p_branch, p_proveedor, 'C-' || left(v_id::text, 6), 0, 0, 'draft', p_fecha, p_metodo, 'COP');
  for v in select * from jsonb_array_elements(p_lineas) loop
    insert into public.invoice_items (invoice_id, invoice_type, invoice_purchase_id, product_id, description, qty, unit_price, total_line, cuenta_contable)
    values (v_id, 'purchase', v_id, nullif(v->>'product_id', '')::integer, 'Línea', 1, 1000, 1000, v->>'cuenta_contable');
    v_total := v_total + 1000;
  end loop;
  update public.invoice_purchase set total = v_total, status = p_estado where id = v_id;
  return v_id;
end $$;

-- Foto de la función vigente, para comparar después de la migración.
select prueba.como('', 'service_role');
create function prueba.catalogo_antes(p_organization_id integer, p_product_id integer, p_rol text, p_cuenta_linea text)
returns text language sql stable as $$
  select coalesce(
    nullif(btrim(p_cuenta_linea), ''),
    case p_rol
      when 'costo' then nullif(btrim(p.cuenta_costo), '')
      when 'inventario' then nullif(btrim(p.cuenta_inventario), '')
      when 'devolucion' then coalesce(nullif(btrim(p.cuenta_devolucion), ''), nullif(btrim(p.cuenta_ingreso), ''))
      else nullif(btrim(p.cuenta_ingreso), '')
    end,
    case p_rol
      when 'costo' then nullif(btrim(c.cuenta_costo), '')
      when 'inventario' then nullif(btrim(c.cuenta_inventario), '')
      when 'devolucion' then coalesce(nullif(btrim(c.cuenta_devolucion), ''), nullif(btrim(c.cuenta_ingreso), ''))
      else nullif(btrim(c.cuenta_ingreso), '')
    end
  )
  from (select 1) semilla
  left join public.products p on p.id = p_product_id and p.organization_id = p_organization_id
  left join public.categories c on c.id = p.category_id and c.organization_id = p.organization_id
$$;

\echo '--- Datos'
insert into public.organizations (id, type_id, name) values
  (10, 3, 'Tienda A'), (20, 3, 'Tienda B'), (30, 5, 'Gimnasio'), (40, 1, 'Restaurante'), (50, 1, 'Restaurante sin clave'),
  (60, 6, 'Transporte'), (70, 3, 'Sin reglas');
insert into public.branches (id, organization_id, name, is_main, is_active) values
  (101, 10, 'Principal', true, true), (102, 10, 'Norte', false, true), (201, 20, 'Principal', true, true),
  (301, 30, 'Principal', true, true), (302, 30, 'Sur', false, true), (401, 40, 'Principal', true, true),
  (501, 50, 'Principal', true, true), (601, 60, 'Principal', true, true), (701, 70, 'Principal', true, true);

insert into public.profiles (id, metadata) values
  ('00000000-0000-0000-0000-000000000001', '{"tema": "claro"}'),
  ('00000000-0000-0000-0000-000000000002', null),
  ('00000000-0000-0000-0000-000000000003', '{}');
insert into public.organization_members (organization_id, user_id, is_active) values
  (10, '00000000-0000-0000-0000-000000000001', true),
  (30, '00000000-0000-0000-0000-000000000001', true),
  (40, '00000000-0000-0000-0000-000000000001', true),
  (50, '00000000-0000-0000-0000-000000000001', true),
  (60, '00000000-0000-0000-0000-000000000001', true),
  (70, '00000000-0000-0000-0000-000000000001', true),
  (20, '00000000-0000-0000-0000-000000000002', true),
  (10, '00000000-0000-0000-0000-000000000003', true);
insert into prueba.permisos select '00000000-0000-0000-0000-000000000001'::uuid, o, c
  from unnest(array[10, 30, 40, 50, 60, 70]) o, unnest(array['finance.view', 'finance.create']) c;
insert into prueba.permisos values
  ('00000000-0000-0000-0000-000000000002', 20, 'finance.view'),
  ('00000000-0000-0000-0000-000000000002', 20, 'finance.create');

insert into public.customers (id, organization_id, first_name, last_name, identification_number)
select gen_random_uuid(), o, 'Cliente', 'Prueba', '123' from unnest(array[10, 20, 30, 40, 50, 60, 70]) o;

insert into public.chart_of_accounts (organization_id, account_code, name, type, parent_code, es_movimiento, is_active, centro_costo_modo)
select o, c, n, t, p, m, true, 'no_aplica'
from unnest(array[10, 20, 30, 40, 50, 60, 70]) o
cross join (values
  ('1', 'Activo', 'asset', null, false),
  ('13', 'Deudores', 'asset', '1', false), ('1305', 'Clientes', 'asset', '13', false), ('130505', 'Nacionales', 'asset', '1305', false), ('13050501', 'Clientes nacionales', 'asset', '130505', true),
  ('14', 'Inventarios', 'asset', '1', false), ('1435', 'Mercancías', 'asset', '14', false), ('143501', 'Inventario por sede', 'asset', '1435', false),
  ('14350101', 'Mercancías principal', 'asset', '143501', true), ('14350102', 'Mercancías norte', 'asset', '143501', true),
  ('2', 'Pasivo', 'liability', null, false), ('22', 'Proveedores', 'liability', '2', false), ('2205', 'Nacionales', 'liability', '22', false), ('220505', 'Proveedores', 'liability', '2205', false), ('22050501', 'Proveedores nacionales', 'liability', '220505', true),
  ('24', 'Impuestos', 'liability', '2', false), ('2408', 'IVA', 'liability', '24', false), ('240805', 'Generado', 'liability', '2408', false), ('24080501', 'IVA generado', 'liability', '240805', true), ('240810', 'Descontable', 'liability', '2408', false), ('24081001', 'IVA descontable', 'liability', '240810', true),
  ('4', 'Ingresos', 'income', null, false), ('41', 'Operacionales', 'income', '4', false), ('4135', 'Comercio', 'income', '41', false),
  ('413595', 'Otros', 'income', '4135', false), ('41359501', 'Venta de mercancías', 'income', '413595', true),
  ('413520', 'Calzado', 'income', '4135', false), ('41352001', 'Venta de calzado', 'income', '413520', true), ('41352002', 'Venta de ropa', 'income', '413520', true),
  ('4140', 'Hoteles', 'income', '41', false), ('414015', 'Restaurante', 'income', '4140', true), ('41401501', 'Restaurante aux', 'income', '414015', true),
  ('4175', 'Devoluciones', 'income', '41', false), ('41750101', 'Devoluciones en ventas', 'income', '4175', true),
  ('42', 'No operacionales', 'income', '4', false), ('42958101', 'Redondeo a favor', 'income', '42', true),
  ('5', 'Gastos', 'expense', null, false), ('53959501', 'Redondeo en contra', 'expense', '5', true), ('51355001', 'Fletes', 'expense', '5', true), ('51355002', 'Mantenimiento', 'expense', '5', true), ('52950501', 'Comisiones', 'expense', '5', true),
  ('6', 'Costos', 'expense', null, false), ('61', 'Costo', 'expense', '6', false), ('6135', 'Comercio', 'expense', '61', false), ('613505', 'Por sede', 'expense', '6135', false), ('61350501', 'Costo de mercancías', 'expense', '613505', true)
) as v(c, n, t, p, m);
delete from public.chart_of_accounts where organization_id = 40 and account_code = '414015';
insert into public.chart_of_accounts (organization_id, account_code, name, type, parent_code, es_movimiento, is_active, centro_costo_modo)
values (40, '414015', 'Restaurante', 'income', '4140', false, true, 'no_aplica');
delete from public.chart_of_accounts where organization_id = 50 and account_code = '41401501';

insert into public.accounting_rules (organization_id, source_type, event_type, debit_account_code, credit_account_code, tax_account_code, use_tax_from_document, is_active, priority)
select o, s, e, d, c, x, true, true, 1
from (values (10, '41359501'), (20, '41359501'), (30, '4135'), (40, '414015'), (50, '4135'), (60, '41359501')) r(o, ingreso)
cross join lateral (values
  ('sale', 'created', '13050501', r.ingreso, '24080501'),
  ('sale_payment', 'paid', '1105', '13050501', null),
  ('purchase', 'created', '14350101', '22050501', '24081001'),
  ('purchase_payment', 'paid', '22050501', '1110', null),
  ('sale_credit_note', 'created', '41750101', '13050501', '24080501')
) as v(s, e, d, c, x);

-- Configuración: ventas_servicios existe pero la regla de la org 10 no la consulta, como en producción.
insert into public.configuracion_contable (id, organization_id, branch_id, clave, account_code) values
  (1, 10, null, 'ventas_productos', '41359501'),
  (2, 10, null, 'ventas_servicios', '41352002'),
  (3, 30, null, 'ventas_productos', '41352001'),
  (4, 30, 302, 'ventas_productos', '41352002'),
  (5, 40, null, 'ventas_productos', '41401501'),
  (6, 10, null, 'comisiones', '52950501');

insert into public.branch_account_mappings (organization_id, branch_id, base_account_code, sub_account_code) values
  (10, 101, '1435', '14350101'), (10, 102, '1435', '14350102');

insert into public.categories (id, organization_id, name, slug, parent_id, cuenta_ingreso) values
  (1, 10, 'Calzado', 'calzado', null, '41352001'),
  (2, 10, 'Tenis', 'tenis', 1, null),
  (3, 10, 'Tenis de mesa', 'tenis-mesa', 2, null),
  (4, 10, 'Sandalias', 'sandalias', 1, '41352002'),
  (9, 20, 'Ajena', 'ajena', null, '41352002');
insert into public.products (id, organization_id, name, category_id, track_stock, product_type, cuenta_ingreso) values
  (1, 10, 'Sin cuentas', null, true, 'product', null),
  (2, 10, 'Con cuenta', null, true, 'product', '41352002'),
  (3, 10, 'De categoría', 1, true, 'product', null),
  (4, 10, 'De subcategoría', 3, true, 'product', null),
  (5, 10, 'Subcategoría propia', 4, true, 'product', null),
  (6, 10, 'Propia gana', 1, true, 'product', '41352002'),
  (7, 10, 'Servicio', null, false, 'service', null),
  (8, 10, 'Sin inventario', null, false, 'product', null),
  (9, 20, 'Ajeno', null, true, 'product', '41352002');
insert into public.suppliers (id, organization_id, name, trade_name, supplier_type) values
  (1, 10, 'Distribuidora', null, 'company'),
  (2, 10, 'Wompi', null, 'company'),
  (3, 20, 'Ajeno', null, 'company'),
  (4, 10, 'Otro', 'bold_link', 'company'),
  (5, 60, 'Transportes', null, 'company'),
  (6, 10, 'Sin historial', null, 'company');

-- Los mismos disparadores de producción: emitir el documento crea el asiento.
create trigger trg_auto_journal_sale after insert or update on public.invoice_sales
  for each row execute function public.fn_auto_journal_sale();
create trigger trg_auto_journal_purchase after insert or update on public.invoice_purchase
  for each row execute function public.fn_auto_journal_purchase();
create trigger trg_invoice_items_cuenta_contable before insert or update on public.invoice_items
  for each row execute function public.fn_validar_cuenta_linea_documento();
create trigger trg_products_cuentas_catalogo before insert or update on public.products
  for each row execute function public.fn_validar_cuentas_catalogo();
create trigger trg_categories_cuentas_catalogo before insert or update on public.categories
  for each row execute function public.fn_validar_cuentas_catalogo();

-- fn_puc_asegurar_cuenta lo apaga y lo enciende mientras crea una cuenta.
create function prueba.sin_validar() returns trigger language plpgsql as $$ begin return new; end $$;
create trigger trg_puc_validar_cuenta before insert on public.chart_of_accounts
  for each row execute function prueba.sin_validar();

\echo '--- Instalar migraciones'
\i supabase/migrations/20261107150000_categoria_hereda_cuenta.sql
\i supabase/migrations/20261107151000_cuenta_efectiva.sql
\i supabase/migrations/20261107152000_cuenta_efectiva_auxiliar_previsto.sql

set client_min_messages = notice;
select prueba.como('00000000-0000-0000-0000-000000000001');

\echo '--- 1. Cada origen en la venta, contra el asiento real'
select prueba.igual(prueba.ver(10, 101, 'venta', '{"product_id": 1}')->>'cuenta', '41359501', 'sin cuenta propia: la regla');
select prueba.igual(prueba.ver(10, 101, 'venta', '{"product_id": 1}')->>'origen', 'regla', 'origen regla, aunque exista la clave ventas_productos');
select prueba.igual(prueba.ver(10, 101, 'venta', '{"product_id": 1}')->>'estado', 'automatica', 'estado automática');
select prueba.igual(prueba.cuentas_asiento('invoice_sales', prueba.factura(10, 101, '[{"product_id": 1}]'), 'credito'), '41359501', 'asiento: la regla');

select prueba.igual(prueba.ver(10, 101, 'venta', '{"product_id": 1, "cuenta_contable": "41352001"}')->>'origen', 'linea', 'origen línea');
select prueba.igual(prueba.ver(10, 101, 'venta', '{"product_id": 1, "cuenta_contable": "41352001"}')->>'estado', 'propia', 'línea: estado propia');
select prueba.igual(prueba.cuentas_asiento('invoice_sales', prueba.factura(10, 101, '[{"product_id": 1, "cuenta_contable": "41352001"}]'), 'credito'), '41352001', 'asiento: la línea');

select prueba.igual(prueba.ver(10, 101, 'venta', '{"product_id": 2}')->>'origen', 'producto', 'origen producto');
select prueba.igual(prueba.ver(10, 101, 'venta', '{"product_id": 2}')->>'cuenta', '41352002', 'cuenta del producto');
select prueba.igual(prueba.cuentas_asiento('invoice_sales', prueba.factura(10, 101, '[{"product_id": 2}]'), 'credito'), '41352002', 'asiento: el producto');

select prueba.igual(prueba.ver(10, 101, 'venta', '{"product_id": 3}')->>'estado', 'categoria', 'estado de categoría');
select prueba.igual(prueba.ver(10, 101, 'venta', '{"product_id": 3}')->>'categoria_origen', 'Calzado', 'nombre de la categoría');
select prueba.igual(prueba.cuentas_asiento('invoice_sales', prueba.factura(10, 101, '[{"product_id": 3}]'), 'credito'), '41352001', 'asiento: la categoría');

select prueba.igual(prueba.ver(10, 101, 'venta', '{"product_id": 6, "cuenta_contable": "41359501"}')->>'origen', 'linea', 'la línea gana al producto');
select prueba.igual(prueba.ver(10, 101, 'venta', '{"product_id": 6}')->>'origen', 'producto', 'el producto gana a la categoría');
select prueba.igual(prueba.ver(10, 101, 'venta', '{"category_id": 1}')->>'cuenta', '41352001', 'consulta por categoría, sin producto');
select prueba.igual(prueba.ver(10, 101, 'venta', '{}')->>'origen', 'regla', 'consulta sin nada: la cuenta por defecto');

-- Documento mixto: una línea sin cuenta va por el camino por líneas.
select prueba.igual(
  prueba.cuentas_asiento('invoice_sales', prueba.factura(10, 101, '[{"product_id": 1}, {"product_id": 2}]'), 'credito'),
  '41352002,41359501', 'asiento por líneas: cada línea con su cuenta');
select prueba.igual(
  (select string_agg(e->>'cuenta', ',' order by e->>'cuenta') from jsonb_array_elements(
     public.fn_cuentas_efectivas(10, 101, 'venta', '[{"clave": "a", "product_id": 1}, {"clave": "b", "product_id": 2}]')) e),
  '41352002,41359501', 'la RPC por lote dice lo mismo');
select prueba.igual(
  public.fn_cuentas_efectivas(10, 101, 'venta', '[{"clave": "a", "product_id": 1}]') -> 0 ->> 'clave', 'a', 'devuelve la clave de la consulta');

\echo '--- 2. Sede, empresa y sector'
select prueba.igual(prueba.ver(30, 301, 'venta', '{}')->>'cuenta', '41352001', 'clave de la empresa');
select prueba.igual(prueba.ver(30, 301, 'venta', '{}')->>'origen', 'empresa', 'origen empresa');
select prueba.igual(prueba.ver(30, 302, 'venta', '{}')->>'cuenta', '41352002', 'clave de la sede');
select prueba.igual(prueba.ver(30, 302, 'venta', '{}')->>'origen', 'sede', 'origen sede');
select prueba.igual(prueba.ver(40, 401, 'venta', '{}')->>'cuenta', '41401501', 'la regla vieja pasa a la clave');
select prueba.igual(prueba.ver(40, 401, 'venta', '{}')->>'origen', 'empresa', 'esa clave sí se aplica: origen empresa');
select prueba.igual(prueba.ver(50, 501, 'venta', '{}')->>'cuenta', '414015', 'sin clave guardada: la propuesta del sector');
select prueba.igual(prueba.ver(50, 501, 'venta', '{}')->>'origen', 'sector', 'origen sector');
select prueba.igual(prueba.cuentas_asiento('invoice_sales', prueba.factura(30, 301, '[{}]'), 'credito'), '41352001', 'asiento: la clave de la empresa');
select prueba.igual(prueba.cuentas_asiento('invoice_sales', prueba.factura(30, 302, '[{}]'), 'credito'), '41352002', 'asiento: la clave de la sede');
select prueba.igual(prueba.cuentas_asiento('invoice_sales', prueba.factura(40, 401, '[{}]'), 'credito'), '41401501', 'asiento: la clave de la regla vieja');
select prueba.igual(prueba.cuentas_asiento('invoice_sales', prueba.factura(50, 501, '[{}]'), 'credito'), '414015', 'asiento: la propuesta del sector');

\echo '--- 3. Un servicio usa la misma cuenta que un producto'
select prueba.igual(prueba.ver(10, 101, 'venta', '{"product_id": 7}')->>'cuenta', '41359501', 'servicio: la regla, no ventas_servicios');
select prueba.igual(prueba.cuentas_asiento('invoice_sales', prueba.factura(10, 101, '[{"product_id": 7}]'), 'credito'), '41359501', 'asiento del servicio: igual');

\echo '--- 4. Cuenta de título'
insert into public.chart_of_accounts (organization_id, account_code, name, type, parent_code, es_movimiento, is_active, centro_costo_modo)
values (10, '4135200201', 'Ropa hombre', 'income', '41352002', true, true, 'no_aplica');
select prueba.igual(prueba.ver(10, 101, 'venta', '{"product_id": 2}')->>'estado', 'titulo', 'la cuenta del producto pasó a título');
select prueba.igual(prueba.ver(10, 101, 'venta', '{"product_id": 2}')->>'configurada', '41352002', 'dice cuál se eligió');
select prueba.igual(prueba.ver(10, 101, 'venta', '{"product_id": 2}')->>'cuenta', '4135200201', 'y cuál recibirá el movimiento');
select prueba.igual(prueba.ver(10, 101, 'venta', '{"product_id": 2}')->>'asentable', 'true', 'se puede asentar');
select prueba.igual(prueba.cuentas_asiento('invoice_sales', prueba.factura(10, 101, '[{"product_id": 2}]'), 'credito'), '4135200201', 'el asiento usa ese auxiliar');
delete from public.chart_of_accounts where organization_id = 10 and account_code = '4135200201';
update public.chart_of_accounts set es_movimiento = false where organization_id = 10 and account_code = '41352002';
select prueba.igual(prueba.ver(10, 101, 'venta', '{"product_id": 2}')->>'estado', 'titulo', 'título sin auxiliares');
select prueba.igual(prueba.ver(10, 101, 'venta', '{"product_id": 2}')->>'asentable', 'false', 'no se puede asentar');
update public.chart_of_accounts set es_movimiento = true where organization_id = 10 and account_code = '41352002';

\echo '--- 5. Sin cuenta'
select prueba.igual(prueba.ver(70, 701, 'venta', '{}')->>'estado', 'sin_cuenta', 'sin regla: sin cuenta');
select prueba.igual(prueba.ver(70, 701, 'venta', '{}')->>'fallo', 'No hay regla contable activa para este documento', 'dice el motivo');
select prueba.igual(prueba.ver(10, 101, 'venta', '{"cuenta_contable": "99999999"}')->>'estado', 'sin_cuenta', 'cuenta que no está en el plan');

\echo '--- 6. Compra'
select prueba.igual(prueba.ver(10, 102, 'compra', '{"product_id": 1}')->>'cuenta', '14350102', 'inventario: el auxiliar de la sede');
select prueba.igual(prueba.ver(10, 102, 'compra', '{"product_id": 1}')->>'origen', 'sede', 'origen sede');
select prueba.igual(prueba.cuentas_asiento('invoice_purchase', prueba.compra(10, 102, 1, '[{"product_id": 1}]'), 'debito'), '14350102', 'asiento: el auxiliar de la sede');
select prueba.igual(prueba.ver(10, 102, 'compra', '{"product_id": 8}')->>'rol', 'costo', 'producto sin inventario: rol costo');
select prueba.igual(prueba.ver(10, 102, 'compra', '{"product_id": 8}')->>'cuenta', '14350102', 'sin cuenta propia también cae en inventario');
select prueba.igual(prueba.cuentas_asiento('invoice_purchase', prueba.compra(10, 102, 1, '[{"product_id": 8}]'), 'debito'), '14350102', 'asiento igual');
select prueba.igual(prueba.ver(10, 102, 'compra', '{"cuenta_contable": "51355001"}')->>'origen', 'linea', 'línea manual con cuenta');
select prueba.igual(prueba.cuentas_asiento('invoice_purchase', prueba.compra(10, 102, 1, '[{"cuenta_contable": "51355001"}]'), 'debito'), '51355001', 'asiento de la línea manual');
-- Una línea con cuenta cambia el camino de las demás: la regla ya no pasa al auxiliar de la sede.
select prueba.igual(
  (select string_agg(e->>'cuenta', ',' order by e->>'cuenta') from jsonb_array_elements(
     public.fn_cuentas_efectivas(10, 102, 'compra', '[{"clave": "a", "product_id": 1}, {"clave": "b", "cuenta_contable": "51355001"}]')) e),
  '14350101,51355001', 'por líneas: la RPC ve el mismo cambio');
select prueba.igual(
  prueba.cuentas_asiento('invoice_purchase', prueba.compra(10, 102, 1, '[{"product_id": 1}, {"cuenta_contable": "51355001"}]'), 'debito'),
  '14350101,51355001', 'y el asiento también');

\echo '--- 7. Roles del catálogo'
select prueba.igual(prueba.ver(10, 101, 'catalogo', '{"rol": "ingreso", "category_id": 2}')->>'cuenta', '41352001', 'ingreso heredado');
select prueba.igual(prueba.ver(10, 101, 'catalogo', '{"rol": "inventario"}')->>'cuenta', '14350101', 'inventario por defecto');
select prueba.igual(prueba.ver(10, 101, 'catalogo', '{"rol": "costo"}')->>'cuenta', '61350501', 'costo por defecto');
select prueba.igual(prueba.ver(10, 101, 'catalogo', '{"rol": "devolucion"}')->>'cuenta', '41750101', 'devolución por defecto');
select prueba.falla($$select prueba.ver(10, 101, 'catalogo', '{}')$$, 'ROL_INVALIDO', 'el catálogo exige rol');
select prueba.falla($$select public.fn_cuentas_efectivas(10, 101, 'otro', '[]')$$, 'DOCUMENTO_INVALIDO', 'documento desconocido');
select prueba.falla($$select public.fn_cuentas_efectivas(10, 101, 'venta', '{}')$$, 'CONSULTAS_INVALIDAS', 'consultas que no son lista');

\echo '--- 8. Herencia a subcategorías'
select prueba.igual(prueba.ver(10, 101, 'venta', '{"product_id": 4}')->>'cuenta', '41352001', 'sube dos niveles');
select prueba.igual(prueba.ver(10, 101, 'venta', '{"product_id": 4}')->>'categoria_origen', 'Calzado', 'dice de qué categoría viene');
select prueba.igual(prueba.cuentas_asiento('invoice_sales', prueba.factura(10, 101, '[{"product_id": 4}]'), 'credito'), '41352001', 'asiento: la heredada');
select prueba.igual(prueba.ver(10, 101, 'venta', '{"product_id": 5}')->>'cuenta', '41352002', 'la más cercana gana');
select prueba.igual(prueba.cuentas_asiento('invoice_sales', prueba.factura(10, 101, '[{"product_id": 5}]'), 'credito'), '41352002', 'asiento: la más cercana');
select prueba.igual(public.fn_cuenta_catalogo_linea(10, 3, 'devolucion', null), '41352001', 'devolución usa el ingreso del mismo nivel');
select prueba.igual(
  (select count(*)::text from public.products p
     cross join unnest(array['ingreso', 'costo', 'inventario', 'devolucion']) r
     left join public.categories c on c.id = p.category_id
    where (c.parent_id is null)
      and public.fn_cuenta_catalogo_linea(p.organization_id, p.id, r, null) is distinct from prueba.catalogo_antes(p.organization_id, p.id, r, null)),
  '0', 'sin subcategorías, idéntica a la versión anterior');
update public.categories set parent_id = 3 where id = 1;
select prueba.igual(prueba.ver(10, 101, 'venta', '{"product_id": 4}')->>'cuenta', '41352001', 'un ciclo no cuelga la búsqueda');
update public.categories set parent_id = null where id = 1;

\echo '--- 9. Solo lectura'
select prueba.como('00000000-0000-0000-0000-000000000001');
create temp table antes as
  select (select count(*) from public.chart_of_accounts) cuentas, (select count(*) from public.branch_account_mappings) mapeos,
         (select count(*) from public.journal_entries) asientos;
begin transaction read only;
select public.fn_cuentas_efectivas(10, 102, 'compra', '[{"product_id": 1}, {"product_id": 8}, {}]') is not null;
select public.fn_cuentas_efectivas(10, 102, 'venta', '[{"product_id": 1}, {"product_id": 2}]') is not null;
select public.fn_cuentas_efectivas(10, 102, 'catalogo', '[{"rol": "costo"}, {"rol": "inventario"}, {"rol": "devolucion"}, {"rol": "ingreso"}]') is not null;
commit;
select prueba.igual(
  (select count(*)::text from antes a where a.cuentas = (select count(*) from public.chart_of_accounts)
     and a.mapeos = (select count(*) from public.branch_account_mappings)
     and a.asientos = (select count(*) from public.journal_entries)), '1', 'no cambió nada');
-- Sede sin mapeo: el motor crearía el auxiliar al asentar. La consulta no lo crea.
delete from public.branch_account_mappings where branch_id = 102;
select prueba.igual(prueba.ver(10, 102, 'compra', '{"product_id": 1}') ->> 'estado', 'automatica', 'sede sin mapeo: responde');
select prueba.igual((select count(*)::text from public.branch_account_mappings where branch_id = 102), '0', 'y no crea el mapeo');
insert into public.branch_account_mappings (organization_id, branch_id, base_account_code, sub_account_code) values (10, 102, '1435', '14350102');

\echo '--- 10. Aislamiento entre empresas'
select prueba.como('00000000-0000-0000-0000-000000000002');
select prueba.falla($$select public.fn_cuentas_efectivas(10, 101, 'venta', '[{}]')$$, 'Acceso denegado', 'otra empresa no consulta');
select prueba.falla($$select * from public.fn_cuenta_sugerida_proveedor(10, 1)$$, 'Acceso denegado', 'otra empresa no ve sugerencias');
select prueba.falla($$select public.fn_cuenta_catalogo_fijar(10, 'producto', 1, 'ingreso', '41352001')$$, 'Acceso denegado', 'otra empresa no fija cuentas');
select prueba.como('00000000-0000-0000-0000-000000000001');
select prueba.igual(prueba.ver(10, 101, 'venta', '{"product_id": 9}')->>'origen', 'regla', 'producto ajeno: no usa su cuenta');
select prueba.igual(prueba.ver(10, 101, 'venta', '{"category_id": 9}')->>'origen', 'regla', 'categoría ajena: no usa su cuenta');
select prueba.igual(prueba.ver(10, 101, 'venta', '{"category_id": 9}')->>'categoria_nombre', null, 'y no dice cómo se llama');
select prueba.igual(prueba.ver(10, 201, 'compra', '{"product_id": 1}')->>'cuenta', '14350101', 'sede ajena: usa la principal');
select prueba.falla($$select public.fn_cuenta_catalogo_fijar(10, 'producto', 9, 'ingreso', '41352001')$$, 'NO_ENCONTRADO', 'producto ajeno no se fija');
select prueba.falla($$select public.fn_cuenta_catalogo_fijar(10, 'categoria', 9, 'ingreso', '41352001')$$, 'NO_ENCONTRADO', 'categoría ajena no se fija');
select prueba.como('');
select prueba.falla($$select public.fn_cuentas_efectivas(10, 101, 'venta', '[{}]')$$, 'SESION_REQUERIDA', 'sin sesión no consulta');
select prueba.como('00000000-0000-0000-0000-000000000003');
select prueba.falla($$select public.fn_cuentas_efectivas(10, 101, 'venta', '[{}]')$$, 'SIN_PERMISO', 'miembro sin permiso');
select prueba.falla($$select * from public.fn_cuenta_sugerida_proveedor(10, 1)$$, 'SIN_PERMISO', 'sugerencia sin permiso');
select prueba.falla($$select public.fn_cuenta_catalogo_fijar(10, 'producto', 1, 'ingreso', '41352001')$$, 'SIN_PERMISO', 'fijar sin permiso');
select prueba.igual(
  (select string_agg(f, ',' order by f) from unnest(array['fn_cuentas_efectivas(integer,integer,text,jsonb)', 'fn_cuenta_sugerida_proveedor(integer,integer)',
     'fn_cuenta_catalogo_fijar(integer,text,integer,text,text)', 'fn_preferencia_ver_cuentas()', 'fn_preferencia_ver_cuentas_guardar(boolean)']) f
    where has_function_privilege('anon', 'public.' || f, 'execute')), null, 'anon no ejecuta ninguna');
select prueba.igual(
  (select string_agg(f, ',' order by f) from unnest(array['fn_cuenta_lectura_asiento(integer,integer,text,boolean)', 'fn_cuenta_efectiva_defecto(integer,integer,text,text,boolean)',
     'fn_cuenta_efectiva_resolver(integer,integer,text,text,integer,integer,text,boolean)', 'fn_cuenta_de_rol(text,text,text,text,text)', 'fn_cuenta_categoria_heredada(integer,integer,text)']) f
    where has_function_privilege('authenticated', 'public.' || f, 'execute')), null, 'las internas no se exponen');
select prueba.igual(
  (select string_agg(p.proname, ',' order by p.proname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef and p.proconfig is null
      and p.proname in ('fn_cuentas_efectivas', 'fn_cuenta_sugerida_proveedor', 'fn_cuenta_catalogo_fijar', 'fn_cuenta_efectiva_resolver', 'fn_cuenta_efectiva_defecto', 'fn_cuenta_lectura_asiento')),
  null, 'search_path fijo en todas');

\echo '--- 11. Alcance por producto y categoría'
select prueba.como('00000000-0000-0000-0000-000000000001');
update public.products set cuenta_costo = '61350501', cuenta_inventario = '14350101' where id = 1;
select public.fn_cuenta_catalogo_fijar(10, 'producto', 1, 'ingreso', '41352001');
select prueba.igual((select cuenta_ingreso || '|' || cuenta_costo || '|' || cuenta_inventario from public.products where id = 1),
  '41352001|61350501|14350101', 'cambia un rol y conserva los otros');
select prueba.igual(prueba.ver(10, 101, 'venta', '{"product_id": 1}')->>'origen', 'producto', 'siempre para este producto');
select public.fn_cuenta_catalogo_fijar(10, 'producto', 1, 'ingreso', null);
select prueba.igual((select coalesce(cuenta_ingreso, 'vacía') || '|' || cuenta_costo from public.products where id = 1), 'vacía|61350501', 'volver a automática');
update public.products set cuenta_costo = null, cuenta_inventario = null where id = 1;
select public.fn_cuenta_catalogo_fijar(10, 'categoria', 2, 'ingreso', '41352002');
select prueba.igual(prueba.ver(10, 101, 'venta', '{"product_id": 4}')->>'cuenta', '41352002', 'para toda la categoría, y sus subcategorías');
select prueba.igual(prueba.ver(10, 101, 'venta', '{"product_id": 3}')->>'cuenta', '41352001', 'la categoría padre no cambia');
select public.fn_cuenta_catalogo_fijar(10, 'categoria', 2, 'ingreso', null);
select prueba.falla($$select public.fn_cuenta_catalogo_fijar(10, 'producto', 1, 'ingreso', '4135')$$, 'no es de movimiento', 'no acepta una cuenta de título');
select prueba.falla($$select public.fn_cuenta_catalogo_fijar(10, 'producto', 1, 'otro', '41352001')$$, 'ROL_INVALIDO', 'rol desconocido');
select prueba.falla($$select public.fn_cuenta_catalogo_fijar(10, 'otro', 1, 'ingreso', '41352001')$$, 'TIPO_INVALIDO', 'tipo desconocido');

\echo '--- 12. Sugerencia por proveedor'
select prueba.igual((select count(*)::text from public.fn_cuenta_sugerida_proveedor(10, 6)), '0', 'sin historial: sin sugerencia');
select prueba.compra(10, 101, 1, '[{"cuenta_contable": "51355001"}]', 'received', 'credit', '2026-09-01') is not null;
select prueba.compra(10, 101, 1, '[{"cuenta_contable": "51355001"}]', 'paid', 'credit', '2026-09-02') is not null;
select prueba.compra(10, 101, 1, '[{"cuenta_contable": "51355002"}]', 'received', 'credit', '2026-09-03') is not null;
-- Las primeras del caso 6 ya usaron 51355001 con este proveedor. Esto no debe contar:
select prueba.compra(10, 101, 1, '[{"cuenta_contable": "51355002"}]', 'draft', 'credit', '2026-09-04') is not null;
select prueba.compra(10, 101, 1, '[{"cuenta_contable": "51355002"}]', 'void', 'credit', '2026-09-04') is not null;
select prueba.compra(10, 101, 1, '[{"cuenta_contable": "51355002"}]', 'received', 'wompi', '2026-09-05') is not null;
select prueba.compra(10, 101, 1, '[{"product_id": 1, "cuenta_contable": "51355002"}]', 'received', 'credit', '2026-09-06') is not null;
select prueba.compra(10, 101, 1, '[{"cuenta_contable": "52950501"}]', 'received', 'credit', '2026-09-07') is not null;
select prueba.compra(10, 101, 1, '[{"cuenta_contable": "52950501"}]', 'received', 'credit', '2026-09-08') is not null;
select prueba.compra(10, 101, 1, '[{"cuenta_contable": "52950501"}]', 'received', 'credit', '2026-09-09') is not null;
select prueba.compra(10, 101, 1, '[{"cuenta_contable": "52950501"}]', 'received', 'credit', '2026-09-10') is not null;
select prueba.igual((select cuenta from public.fn_cuenta_sugerida_proveedor(10, 1)), '51355001', 'la más usada');
select prueba.igual((select nombre from public.fn_cuenta_sugerida_proveedor(10, 1)), 'Fletes', 'con su nombre');
select prueba.igual((select veces::text from public.fn_cuenta_sugerida_proveedor(10, 1)), '4', 'cuántas veces');
select prueba.igual((select count(*)::text from public.fn_cuenta_sugerida_proveedor(10, 1) where cuenta = '52950501'), '0', 'nunca una cuenta de comisiones');
select prueba.compra(10, 101, 2, '[{"cuenta_contable": "51355001"}]') is not null;
select prueba.igual((select count(*)::text from public.fn_cuenta_sugerida_proveedor(10, 2)), '0', 'proveedor que es una pasarela');
select prueba.compra(10, 101, 4, '[{"cuenta_contable": "51355001"}]') is not null;
select prueba.igual((select count(*)::text from public.fn_cuenta_sugerida_proveedor(10, 4)), '0', 'nombre comercial de pasarela');
select prueba.igual((select count(*)::text from public.fn_cuenta_sugerida_proveedor(10, 3)), '0', 'proveedor de otra empresa');
select prueba.igual((select count(*)::text from public.fn_cuenta_sugerida_proveedor(60, 5)), '0', 'empresa de transporte: sin sugerencia');
update public.chart_of_accounts set es_movimiento = false where organization_id = 10 and account_code = '51355001';
select prueba.igual((select cuenta from public.fn_cuenta_sugerida_proveedor(10, 1)), '51355002', 'la cuenta que pasó a título ya no se sugiere');
update public.chart_of_accounts set es_movimiento = true where organization_id = 10 and account_code = '51355001';

\echo '--- 13. Preferencia del interruptor'
select prueba.como('00000000-0000-0000-0000-000000000001');
select prueba.igual(public.fn_preferencia_ver_cuentas()::text, 'false', 'apagado por defecto');
select prueba.igual(public.fn_preferencia_ver_cuentas_guardar(true)::text, 'true', 'guardar');
select prueba.igual(public.fn_preferencia_ver_cuentas()::text, 'true', 'se recuerda');
select prueba.igual((select metadata->>'tema' from public.profiles where id = '00000000-0000-0000-0000-000000000001'), 'claro', 'conserva lo demás del perfil');
select prueba.como('00000000-0000-0000-0000-000000000002');
select prueba.igual(public.fn_preferencia_ver_cuentas()::text, 'false', 'cada persona tiene la suya');
select public.fn_preferencia_ver_cuentas_guardar(true);
select prueba.igual((select metadata->>'ver_cuentas_contables' from public.profiles where id = '00000000-0000-0000-0000-000000000002'), 'true', 'perfil con metadata vacía');
select prueba.como('');
select prueba.falla($$select public.fn_preferencia_ver_cuentas_guardar(true)$$, 'SESION_REQUERIDA', 'sin sesión no guarda');

\echo '--- 14. Garantías del libro'
select prueba.como('', 'service_role');
select prueba.igual((select count(*)::text from (
  select e.id from public.journal_entries e join public.journal_lines l on l.journal_entry_id = e.id
   group by e.id having round(sum(l.debit), 2) <> round(sum(l.credit), 2)) x), '0', 'todos los asientos cuadran');
select prueba.igual((select count(*)::text from public.journal_lines l join public.journal_entries e on e.id = l.journal_entry_id
   where public.fn_es_cuenta_de_titulo(e.organization_id, l.account_code)), '0', 'ninguna línea en cuenta de título');
select prueba.igual((select count(*)::text from (select organization_id, fact_key from public.journal_entries where fact_key is not null
   group by 1, 2 having count(*) > 1) x), '0', 'sin fact_key duplicada');
select prueba.igual((select count(*)::text from public.journal_entries), (select count(*)::text from public.journal_entries where posted), 'publicados');
select prueba.igual((select coalesce(string_agg(distinct reason || ': ' || left(coalesce(detail, ''), 80), ' | '), 'ninguno') from public.journal_entry_failures), 'ninguno', 'sin fallos de contabilización');

\echo '--- 15. Compra en las dos formas de plan que tiene producción'
select prueba.como('', 'service_role');
insert into public.organizations (id, type_id, name) values (80, 3, 'Mapeo 14350501'), (90, 1, 'Sin 1435 de sede'), (81, 3, 'Otra sede ocupa 01');
insert into public.branches (id, organization_id, name, is_main, is_active) values
  (801, 80, 'Centro', true, true), (901, 90, 'Centro', true, true), (811, 81, 'Una', true, true), (812, 81, 'Dos', false, true);
insert into public.customers (id, organization_id, first_name, last_name, identification_number)
  select gen_random_uuid(), o, 'Cliente', 'Prueba', '123' from unnest(array[80, 81, 90]) o;
insert into public.chart_of_accounts (organization_id, account_code, name, type, parent_code, es_movimiento, is_active, centro_costo_modo)
  select o, account_code, name, type, parent_code, es_movimiento, true, 'no_aplica'
    from public.chart_of_accounts, unnest(array[80, 81, 90]) o
   where organization_id = 20 and account_code not like '143%';
insert into public.chart_of_accounts (organization_id, account_code, name, type, parent_code, es_movimiento, is_active, centro_costo_modo) values
  (80, '1435', 'Mercancías', 'asset', '14', false, true, 'no_aplica'), (80, '143505', 'Por sede', 'asset', '1435', false, true, 'no_aplica'), (80, '14350501', 'Sede', 'asset', '143505', true, true, 'no_aplica'),
  (81, '1435', 'Mercancías', 'asset', '14', false, true, 'no_aplica'), (81, '143505', 'Por sede', 'asset', '1435', false, true, 'no_aplica'), (81, '14350501', 'Sede', 'asset', '143505', true, true, 'no_aplica'),
  (81, '143501', 'Por sede', 'asset', '1435', false, true, 'no_aplica'), (81, '14350101', 'Mercancías una', 'asset', '143501', true, true, 'no_aplica'),
  (90, '1435', 'Mercancías', 'asset', '14', true, true, 'no_aplica'), (90, '1405', 'Materia prima', 'asset', '14', false, true, 'no_aplica'), (90, '140505', 'Sede', 'asset', '1405', false, true, 'no_aplica'), (90, '14050501', 'Insumos', 'asset', '140505', true, true, 'no_aplica');
insert into public.accounting_rules (organization_id, source_type, event_type, debit_account_code, credit_account_code, tax_account_code, use_tax_from_document, is_active, priority)
  select o, s, e, d, c, x, true, true, 1 from unnest(array[80, 81, 90]) o
  cross join (values ('sale', 'created', '13050501', '41359501', '24080501'), ('purchase', 'created', '14350101', '22050501', '24081001'),
                     ('purchase_payment', 'paid', '22050501', '1110', null)) v(s, e, d, c, x);
insert into public.branch_account_mappings (organization_id, branch_id, base_account_code, sub_account_code) values
  (80, 801, '1435', '14350501'), (90, 901, '1405', '14050501'), (81, 811, '1435', '14350101'), (81, 812, '1435', '14350501');
insert into public.suppliers (id, organization_id, name, supplier_type) values (80, 80, 'Proveedor', 'company'), (81, 81, 'Proveedor', 'company'), (90, 90, 'Proveedor', 'company');
insert into public.products (id, organization_id, name, track_stock, product_type) values (80, 80, 'Uno', true, 'product'), (81, 81, 'Uno', true, 'product'), (90, 90, 'Uno', true, 'product');
insert into public.organization_members (organization_id, user_id, is_active)
  select o, '00000000-0000-0000-0000-000000000001', true from unnest(array[80, 81, 90]) o;
insert into prueba.permisos select '00000000-0000-0000-0000-000000000001'::uuid, o, 'finance.view' from unnest(array[80, 81, 90]) o;

select prueba.como('00000000-0000-0000-0000-000000000001');
select prueba.igual(prueba.ver(80, 801, 'compra', '{"product_id": 80}')->>'cuenta', '14350101', 'mapeo 14350501: dice el auxiliar que usará el motor');
select prueba.igual(prueba.ver(80, 801, 'compra', '{"product_id": 80}')->>'estado', 'automatica', 'cuenta prevista: no es un error');
select prueba.igual(prueba.ver(80, 801, 'compra', '{"product_id": 80}')->>'prevista', 'true', 'avisa que se creará');
select prueba.igual(prueba.ver(80, 801, 'compra', '{"product_id": 80}')->>'nombre', 'Inventario Centro', 'con el nombre que le dará el motor');
select prueba.igual(prueba.ver(80, 801, 'compra', '{"product_id": 80}')->>'asentable', 'true', 'se podrá asentar');
select prueba.igual(prueba.ver(80, 801, 'compra', '{"product_id": 80}')->>'origen', 'sede', 'origen sede');
select prueba.igual(prueba.ver(80, 801, 'catalogo', '{"rol": "inventario"}')->>'cuenta', '14350101', 'el resumen del producto dice lo mismo');
select prueba.igual(prueba.ver(90, 901, 'compra', '{"product_id": 90}')->>'cuenta', '14350101', 'sin mapeo de 1435: igual');
select prueba.igual(prueba.ver(81, 812, 'compra', '{"product_id": 81}')->>'cuenta', '14350102', 'sufijo ocupado por otra sede: el siguiente libre');
select prueba.igual((select count(*)::text from public.chart_of_accounts where organization_id in (80, 90) and account_code like '143501%'), '0', 'consultar no creó ninguna cuenta');
select prueba.igual((select count(*)::text from public.branch_account_mappings where organization_id = 80 and sub_account_code = '14350501'), '1', 'ni cambió el mapeo');
select prueba.igual(
  (select string_agg(e->>'cuenta', ',' order by e->>'cuenta') from jsonb_array_elements(
     public.fn_cuentas_efectivas(90, 901, 'compra', '[{"clave": "a", "product_id": 90}, {"clave": "b", "cuenta_contable": "51355001"}]')) e),
  '1435010101,51355001', 'por líneas: el auxiliar que crea fn_puc_cuenta_para_asiento');
select prueba.como('', 'service_role');
create temp table compra_80 as select prueba.compra(80, 801, 80, '[{"product_id": 80}]') as id;
select prueba.igual(prueba.cuentas_asiento('invoice_purchase', (select id from compra_80), 'debito'), '14350101', 'el asiento real usa esa cuenta');
create temp table compra_90 as select prueba.compra(90, 901, 90, '[{"product_id": 90}, {"cuenta_contable": "51355001"}]') as id;
select prueba.igual(prueba.cuentas_asiento('invoice_purchase', (select id from compra_90), 'debito'), '1435010101,51355001', 'por líneas: el asiento real también');
create temp table compra_81 as select prueba.compra(81, 812, 81, '[{"product_id": 81}]') as id;
select prueba.igual(prueba.cuentas_asiento('invoice_purchase', (select id from compra_81), 'debito'), '14350102', 'sufijo siguiente: el asiento real también');

\echo '--- 16. Rollback y reaplicación'
\i supabase/rollbacks/20261107152000_cuenta_efectiva_auxiliar_previsto_rollback.sql
\i supabase/rollbacks/20261107151000_cuenta_efectiva_rollback.sql
\i supabase/rollbacks/20261107150000_categoria_hereda_cuenta_rollback.sql
select prueba.igual((select count(*)::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname in ('fn_cuentas_efectivas', 'fn_cuenta_categoria_heredada', 'fn_cuenta_de_rol', 'fn_preferencia_ver_cuentas')), '0', 'rollback quita las funciones');
select prueba.igual(public.fn_cuenta_catalogo_linea(10, 3, 'ingreso', null), '41352001', 'rollback: categoría directa');
select prueba.igual(public.fn_cuenta_catalogo_linea(10, 4, 'ingreso', null), null, 'rollback: sin herencia');
\i supabase/migrations/20261107150000_categoria_hereda_cuenta.sql
\i supabase/migrations/20261107151000_cuenta_efectiva.sql
\i supabase/migrations/20261107152000_cuenta_efectiva_auxiliar_previsto.sql
\i supabase/migrations/20261107150000_categoria_hereda_cuenta.sql
\i supabase/migrations/20261107151000_cuenta_efectiva.sql
\i supabase/migrations/20261107152000_cuenta_efectiva_auxiliar_previsto.sql
select prueba.igual(public.fn_cuenta_catalogo_linea(10, 4, 'ingreso', null), '41352001', 'reaplicar dos veces');
select prueba.igual((select prosrc ~ 'v_prevista' from pg_proc where proname = 'fn_cuenta_efectiva_resolver')::text, 'true', 'la versión final queda instalada');

\echo 'TODAS LAS PRUEBAS PASARON'
