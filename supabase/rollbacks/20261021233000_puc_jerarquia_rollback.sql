-- Rollback de 20261021233000_puc_jerarquia.sql
--
-- Devuelve las funciones a la definición viva del 2026-10-21 (antes de
-- esta migración), quita los disparadores nuevos, las columnas PUC y la
-- plantilla. Ejecutarlo en una sola transacción.
--
-- No restaura datos. Las columnas nuevas se eliminan. En las filas que ya
-- existían, es_movimiento quedó null y requiere_tercero / requiere_centro_costo
-- quedaron en el default false: no había un valor previo que recuperar.
-- Si una organización creada después de la migración tiene cuentas
-- type = 'order' (clases 8 y 9 de la plantilla), este script se niega
-- a correr y no borra esas filas.

do $rollback_puc$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'chart_of_accounts'
      and column_name = 'nivel'
  ) and exists (
    select 1 from public.chart_of_accounts where type = 'order'
  ) then
    raise exception 'rollback_puc: hay cuentas type = order. Este rollback no borra filas.';
  end if;
end
$rollback_puc$;

drop trigger if exists zz_trg_puc_linea_solo_movimiento on public.journal_lines;
drop trigger if exists trg_puc_no_borrar_con_movimientos on public.chart_of_accounts;
drop trigger if exists trg_puc_validar_cuenta on public.chart_of_accounts;

CREATE OR REPLACE FUNCTION public.fn_create_default_chart_of_accounts(org_id integer, country_code text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  perform public.fn_assert_acceso_org(org_id::integer);
  -- Evitar duplicados: si ya tiene cuentas, no hacer nada
  IF EXISTS (SELECT 1 FROM public.chart_of_accounts WHERE organization_id = org_id) THEN
    RETURN;
  END IF;

  CASE country_code
    -- ============================================================
    -- COLOMBIA: PUC (Plan Unico de Cuentas) + NIIF
    -- ============================================================
    WHEN 'COL' THEN
      -- Clases principales (nivel 0)
      INSERT INTO public.chart_of_accounts (organization_id, account_code, name, type, parent_code, is_active, description) VALUES
        (org_id, '1', 'Activo', 'asset', NULL, true, 'Clase 1 - Activo segun PUC/NIIF'),
        (org_id, '2', 'Pasivo', 'liability', NULL, true, 'Clase 2 - Pasivo segun PUC/NIIF'),
        (org_id, '3', 'Patrimonio', 'equity', NULL, true, 'Clase 3 - Patrimonio segun PUC/NIIF'),
        (org_id, '4', 'Ingresos', 'income', NULL, true, 'Clase 4 - Ingresos segun PUC/NIIF'),
        (org_id, '5', 'Gastos', 'expense', NULL, true, 'Clase 5 - Gastos segun PUC/NIIF'),
        (org_id, '6', 'Costos de Ventas y Produccion', 'expense', NULL, true, 'Clase 6 - Costos segun PUC/NIIF');

      -- Grupos (nivel 1)
      INSERT INTO public.chart_of_accounts (organization_id, account_code, name, type, parent_code, is_active, description) VALUES
        (org_id, '11', 'Activo Corriente', 'asset', '1', true, 'Activos disponibles o exigibles a corto plazo'),
        (org_id, '12', 'Activo No Corriente', 'asset', '1', true, 'Activos a largo plazo'),
        (org_id, '21', 'Pasivo Corriente', 'liability', '2', true, 'Obligaciones a corto plazo'),
        (org_id, '22', 'Pasivo No Corriente', 'liability', '2', true, 'Obligaciones a largo plazo');

      -- Cuentas de Activo Corriente (nivel 2)
      INSERT INTO public.chart_of_accounts (organization_id, account_code, name, type, parent_code, is_active, description) VALUES
        (org_id, '1105', 'Caja', 'asset', '11', true, 'Disponible en efectivo'),
        (org_id, '1110', 'Bancos', 'asset', '11', true, 'Disponible en cuentas bancarias'),
        (org_id, '1305', 'Clientes', 'asset', '11', true, 'Cuentas por cobrar a clientes'),
        (org_id, '1365', 'Cuentas por Cobrar Varias', 'asset', '11', true, 'Cuentas por cobrar a terceros'),
        (org_id, '1405', 'Inventarios', 'asset', '11', true, 'Existencias de mercancias y materiales');

      -- Cuentas de Activo No Corriente (nivel 2)
      INSERT INTO public.chart_of_accounts (organization_id, account_code, name, type, parent_code, is_active, description) VALUES
        (org_id, '1504', 'Flota y Equipo de Transporte', 'asset', '12', true, 'Vehiculos y equipos de transporte'),
        (org_id, '1524', 'Equipo de Computo y Comunicacion', 'asset', '12', true, 'Equipos informaticos y de comunicacion'),
        (org_id, '1592', 'Depreciacion Acumulada', 'asset', '12', true, 'Depreciacion acumulada de activos no corrientes');

      -- Cuentas de Pasivo Corriente (nivel 2)
      INSERT INTO public.chart_of_accounts (organization_id, account_code, name, type, parent_code, is_active, description) VALUES
        (org_id, '2105', 'Proveedores Nacionales', 'liability', '21', true, 'Obligaciones con proveedores locales'),
        (org_id, '2205', 'Cuentas por Pagar a Terceros', 'liability', '21', true, 'Obligaciones con terceros'),
        (org_id, '2405', 'Impuestos y Contribuciones por Pagar', 'liability', '21', true, 'Tributos por pagar (IVA, retenciones, etc.)'),
        (org_id, '2505', 'Salarios y Prestaciones por Pagar', 'liability', '21', true, 'Obligaciones laborales por pagar');

      -- Cuentas de Pasivo No Corriente (nivel 2)
      INSERT INTO public.chart_of_accounts (organization_id, account_code, name, type, parent_code, is_active, description) VALUES
        (org_id, '2605', 'Obligaciones Financieras a Largo Plazo', 'liability', '22', true, 'Prestamos y creditos a largo plazo');

      -- Cuentas de Patrimonio (nivel 1)
      INSERT INTO public.chart_of_accounts (organization_id, account_code, name, type, parent_code, is_active, description) VALUES
        (org_id, '3105', 'Capital Social', 'equity', '3', true, 'Aportes de los socios'),
        (org_id, '3605', 'Utilidad del Ejercicio', 'equity', '3', true, 'Resultado del periodo'),
        (org_id, '3705', 'Reservas', 'equity', '3', true, 'Reservas legales y estatutarias');

      -- Cuentas de Ingresos (nivel 1)
      INSERT INTO public.chart_of_accounts (organization_id, account_code, name, type, parent_code, is_active, description) VALUES
        (org_id, '4105', 'Ventas de Mercancias', 'income', '4', true, 'Ingresos por venta de productos'),
        (org_id, '4205', 'Servicios Prestados', 'income', '4', true, 'Ingresos por servicios'),
        (org_id, '4705', 'Devoluciones en Ventas', 'income', '4', true, 'Devoluciones y rebajas en ventas');

      -- Cuentas de Gastos (nivel 1)
      INSERT INTO public.chart_of_accounts (organization_id, account_code, name, type, parent_code, is_active, description) VALUES
        (org_id, '5105', 'Gastos de Personal', 'expense', '5', true, 'Salarios, prestaciones y beneficios'),
        (org_id, '5205', 'Gastos de Servicios', 'expense', '5', true, 'Agua, energia, internet, telefono, etc.'),
        (org_id, '5305', 'Gastos de Arrendamientos', 'expense', '5', true, 'Canon de arrendamiento'),
        (org_id, '5405', 'Gastos de Mantenimiento y Reparaciones', 'expense', '5', true, 'Mantenimiento de activos'),
        (org_id, '5905', 'Otros Gastos', 'expense', '5', true, 'Gastos no clasificados');

      -- Cuentas de Costos (nivel 1)
      INSERT INTO public.chart_of_accounts (organization_id, account_code, name, type, parent_code, is_active, description) VALUES
        (org_id, '6105', 'Costo de Mercancias Vendidas', 'expense', '6', true, 'CMV - Costo directo de ventas'),
        (org_id, '6205', 'Costo de Produccion', 'expense', '6', true, 'Materia prima, mano de obra directa y CIF');

    -- ============================================================
    -- MEXICO: CINIF / IFRS (NIF)
    -- ============================================================
    WHEN 'MEX' THEN
      INSERT INTO public.chart_of_accounts (organization_id, account_code, name, type, parent_code, is_active, description) VALUES
        (org_id, '1000', 'Activo', 'asset', NULL, true, 'Total de activos segun NIF/IFRS'),
        (org_id, '2000', 'Pasivo', 'liability', NULL, true, 'Total de pasivos segun NIF/IFRS'),
        (org_id, '3000', 'Capital Contable', 'equity', NULL, true, 'Patrimonio de los accionistas'),
        (org_id, '4000', 'Ingresos', 'income', NULL, true, 'Ingresos por ventas y servicios'),
        (org_id, '5000', 'Costos y Gastos', 'expense', NULL, true, 'Costos y gastos operativos');

      INSERT INTO public.chart_of_accounts (organization_id, account_code, name, type, parent_code, is_active, description) VALUES
        (org_id, '1100', 'Activo Circulante', 'asset', '1000', true, 'Activos de corto plazo'),
        (org_id, '1200', 'Activo No Circulante', 'asset', '1000', true, 'Activos de largo plazo'),
        (org_id, '2100', 'Pasivo a Corto Plazo', 'liability', '2000', true, 'Obligaciones de corto plazo'),
        (org_id, '2200', 'Pasivo a Largo Plazo', 'liability', '2000', true, 'Obligaciones de largo plazo');

      INSERT INTO public.chart_of_accounts (organization_id, account_code, name, type, parent_code, is_active, description) VALUES
        (org_id, '1101', 'Caja y Bancos', 'asset', '1100', true, 'Efectivo y equivalentes'),
        (org_id, '1102', 'Cuentas por Cobrar', 'asset', '1100', true, 'Clientes y deudores'),
        (org_id, '1103', 'Inventarios', 'asset', '1100', true, 'Existencias'),
        (org_id, '1201', 'Inmuebles, Planta y Equipo', 'asset', '1200', true, 'Activos fijos'),
        (org_id, '1202', 'Depreciacion Acumulada', 'asset', '1200', true, 'Depreciacion de activos fijos'),
        (org_id, '2101', 'Proveedores', 'liability', '2100', true, 'Cuentas por pagar a proveedores'),
        (org_id, '2102', 'Impuestos por Pagar', 'liability', '2100', true, 'Tributos por pagar (IVA, ISR)'),
        (org_id, '2103', 'Pasivos Laborales', 'liability', '2100', true, 'Sueldos y prestaciones por pagar'),
        (org_id, '2201', 'Deudas a Largo Plazo', 'liability', '2200', true, 'Pasivos financieros LP'),
        (org_id, '3101', 'Capital Social', 'equity', '3000', true, 'Aportes de socios'),
        (org_id, '3102', 'Utilidad del Ejercicio', 'equity', '3000', true, 'Resultado del periodo'),
        (org_id, '3103', 'Reserva Legal', 'equity', '3000', true, 'Reservas estatutarias'),
        (org_id, '4101', 'Ventas', 'income', '4000', true, 'Ingresos por ventas'),
        (org_id, '4102', 'Servicios', 'income', '4000', true, 'Ingresos por servicios'),
        (org_id, '4103', 'Devoluciones sobre Ventas', 'income', '4000', true, 'Devoluciones y rebajas'),
        (org_id, '5101', 'Costo de Ventas', 'expense', '5000', true, 'Costo directo de ventas'),
        (org_id, '5102', 'Gastos de Administracion', 'expense', '5000', true, 'Gastos operativos'),
        (org_id, '5103', 'Gastos de Ventas', 'expense', '5000', true, 'Gastos comerciales'),
        (org_id, '5104', 'Gastos de Personal', 'expense', '5000', true, 'Sueldos y prestaciones');

    -- ============================================================
    -- ESPANA: Plan General Contable (PGC)
    -- ============================================================
    WHEN 'ESP' THEN
      INSERT INTO public.chart_of_accounts (organization_id, account_code, name, type, parent_code, is_active, description) VALUES
        (org_id, '1', 'Financiacion Ajena (Pasivo)', 'liability', NULL, true, 'Pasivo segun PGC'),
        (org_id, '2', 'Inmovilizado (Activo No Corriente)', 'asset', NULL, true, 'Activo no corriente PGC'),
        (org_id, '3', 'Existencias', 'asset', NULL, true, 'Inventarios PGC'),
        (org_id, '4', 'Acreedores y Deudores (Activo/Pasivo Corriente)', 'asset', NULL, true, 'Clientes, proveedores y otros'),
        (org_id, '5', 'Cuentas Financieras', 'asset', NULL, true, 'Tesoreria e inversiones financieras'),
        (org_id, '6', 'Compras y Gastos', 'expense', NULL, true, 'Gastos PGC'),
        (org_id, '7', 'Ventas e Ingresos', 'income', NULL, true, 'Ingresos PGC'),
        (org_id, '10', 'Capital y Reservas', 'equity', NULL, true, 'Patrimonio neto PGC');

      INSERT INTO public.chart_of_accounts (organization_id, account_code, name, type, parent_code, is_active, description) VALUES
        (org_id, '100', 'Capital Social', 'equity', '10', true, 'Capital escriturado'),
        (org_id, '129', 'Resultado del Ejercicio', 'equity', '10', true, 'Utilidad o perdida del periodo'),
        (org_id, '200', 'Inmovilizado Material', 'asset', '2', true, 'Inmuebles, maquinaria, etc.'),
        (org_id, '281', 'Amortizacion Acumulada', 'asset', '2', true, 'Amortizacion del inmovilizado'),
        (org_id, '300', 'Mercaderias', 'asset', '3', true, 'Existencias comerciales'),
        (org_id, '430', 'Clientes', 'asset', '4', true, 'Cuentas por cobrar'),
        (org_id, '400', 'Proveedores', 'liability', '4', true, 'Cuentas por pagar'),
        (org_id, '475', 'Hacienda Publica Acreedora', 'liability', '4', true, 'Impuestos por pagar (IVA, IS)'),
        (org_id, '465', 'Remuneraciones Pendientes de Pago', 'liability', '4', true, 'Salarios por pagar'),
        (org_id, '570', 'Caja, Euros', 'asset', '5', true, 'Efectivo'),
        (org_id, '572', 'Bancos c/c', 'asset', '5', true, 'Cuentas bancarias'),
        (org_id, '600', 'Compras de Mercaderias', 'expense', '6', true, 'Compras'),
        (org_id, '640', 'Sueldos y Salarios', 'expense', '6', true, 'Gastos de personal'),
        (org_id, '620', 'Gastos en Arrendamientos', 'expense', '6', true, 'Alquileres'),
        (org_id, '628', 'Reparaciones y Conservacion', 'expense', '6', true, 'Mantenimiento'),
        (org_id, '629', 'Otros Servicios', 'expense', '6', true, 'Servicios diversos'),
        (org_id, '700', 'Ventas de Mercaderias', 'income', '7', true, 'Ingresos por ventas'),
        (org_id, '705', 'Prestaciones de Servicios', 'income', '7', true, 'Ingresos por servicios'),
        (org_id, '708', 'Devoluciones de Ventas', 'income', '7', true, 'Devoluciones y rebajas');

    -- ============================================================
    -- CHILE: IFRS / NCCh (Normas Chilenas de Contabilidad)
    -- ============================================================
    WHEN 'CHL' THEN
      INSERT INTO public.chart_of_accounts (organization_id, account_code, name, type, parent_code, is_active, description) VALUES
        (org_id, '1000', 'Activo', 'asset', NULL, true, 'Total activos IFRS/NCCh'),
        (org_id, '2000', 'Pasivo', 'liability', NULL, true, 'Total pasivos IFRS/NCCh'),
        (org_id, '3000', 'Patrimonio', 'equity', NULL, true, 'Patrimonio neto'),
        (org_id, '4000', 'Ingresos', 'income', NULL, true, 'Ingresos operativos y no operativos'),
        (org_id, '5000', 'Gastos', 'expense', NULL, true, 'Gastos operativos y no operativos');

      INSERT INTO public.chart_of_accounts (organization_id, account_code, name, type, parent_code, is_active, description) VALUES
        (org_id, '1100', 'Activo Circulante', 'asset', '1000', true, 'Activos corrientes'),
        (org_id, '1200', 'Activo No Circulante', 'asset', '1000', true, 'Activos no corrientes'),
        (org_id, '2100', 'Pasivo Circulante', 'liability', '2000', true, 'Pasivos corrientes'),
        (org_id, '2200', 'Pasivo No Circulante', 'liability', '2000', true, 'Pasivos no corrientes');

      INSERT INTO public.chart_of_accounts (organization_id, account_code, name, type, parent_code, is_active, description) VALUES
        (org_id, '1101', 'Caja y Bancos', 'asset', '1100', true, 'Efectivo y equivalentes'),
        (org_id, '1102', 'Cuentas por Cobrar', 'asset', '1100', true, 'Deudores por venta'),
        (org_id, '1103', 'Existencias', 'asset', '1100', true, 'Inventarios'),
        (org_id, '1201', 'Activo Fijo', 'asset', '1200', true, 'Propiedades, planta y equipo'),
        (org_id, '1202', 'Depreciacion Acumulada', 'asset', '1200', true, 'Depreciacion acumulada'),
        (org_id, '2101', 'Proveedores', 'liability', '2100', true, 'Cuentas por pagar'),
        (org_id, '2102', 'Impuestos por Pagar', 'liability', '2100', true, 'Tributos (IVA, impuesto renta)'),
        (org_id, '2103', 'Remuneraciones por Pagar', 'liability', '2100', true, 'Pasivos laborales'),
        (org_id, '2201', 'Obligaciones Financieras LP', 'liability', '2200', true, 'Deudas largo plazo'),
        (org_id, '3101', 'Capital', 'equity', '3000', true, 'Aportes de socios'),
        (org_id, '3102', 'Resultado del Ejercicio', 'equity', '3000', true, 'Utilidad o perdida'),
        (org_id, '3103', 'Reservas', 'equity', '3000', true, 'Reservas legales'),
        (org_id, '4101', 'Ventas', 'income', '4000', true, 'Ingresos por ventas'),
        (org_id, '4102', 'Servicios', 'income', '4000', true, 'Ingresos por servicios'),
        (org_id, '4103', 'Devoluciones sobre Ventas', 'income', '4000', true, 'Devoluciones'),
        (org_id, '5101', 'Costo de Ventas', 'expense', '5000', true, 'CMV'),
        (org_id, '5102', 'Gastos de Administracion', 'expense', '5000', true, 'Gastos administrativos'),
        (org_id, '5103', 'Gastos de Personal', 'expense', '5000', true, 'Remuneraciones'),
        (org_id, '5104', 'Gastos Generales', 'expense', '5000', true, 'Arriendo, servicios, otros');

    -- ============================================================
    -- DEFAULT / GENERIC IFRS (para paises sin plan especifico)
    -- ============================================================
    ELSE
      INSERT INTO public.chart_of_accounts (organization_id, account_code, name, type, parent_code, is_active, description) VALUES
        (org_id, '1000', 'Assets', 'asset', NULL, true, 'Total assets (IFRS)'),
        (org_id, '2000', 'Liabilities', 'liability', NULL, true, 'Total liabilities (IFRS)'),
        (org_id, '3000', 'Equity', 'equity', NULL, true, 'Total equity (IFRS)'),
        (org_id, '4000', 'Revenue', 'income', NULL, true, 'Revenue (IFRS)'),
        (org_id, '5000', 'Expenses', 'expense', NULL, true, 'Expenses (IFRS)');

      INSERT INTO public.chart_of_accounts (organization_id, account_code, name, type, parent_code, is_active, description) VALUES
        (org_id, '1100', 'Current Assets', 'asset', '1000', true, 'Short-term assets'),
        (org_id, '1200', 'Non-Current Assets', 'asset', '1000', true, 'Long-term assets'),
        (org_id, '2100', 'Current Liabilities', 'liability', '2000', true, 'Short-term liabilities'),
        (org_id, '2200', 'Non-Current Liabilities', 'liability', '2000', true, 'Long-term liabilities');

      INSERT INTO public.chart_of_accounts (organization_id, account_code, name, type, parent_code, is_active, description) VALUES
        (org_id, '1101', 'Cash and Banks', 'asset', '1100', true, 'Cash and equivalents'),
        (org_id, '1102', 'Accounts Receivable', 'asset', '1100', true, 'Trade receivables'),
        (org_id, '1103', 'Inventory', 'asset', '1100', true, 'Goods in stock'),
        (org_id, '1201', 'Property, Plant and Equipment', 'asset', '1200', true, 'Fixed assets'),
        (org_id, '1202', 'Accumulated Depreciation', 'asset', '1200', true, 'Depreciation of fixed assets'),
        (org_id, '2101', 'Accounts Payable', 'liability', '2100', true, 'Trade payables'),
        (org_id, '2102', 'Taxes Payable', 'liability', '2100', true, 'Tax obligations'),
        (org_id, '2103', 'Salaries Payable', 'liability', '2100', true, 'Payroll obligations'),
        (org_id, '2201', 'Long-Term Debt', 'liability', '2200', true, 'Long-term financial obligations'),
        (org_id, '3101', 'Share Capital', 'equity', '3000', true, 'Owners equity'),
        (org_id, '3102', 'Retained Earnings', 'equity', '3000', true, 'Current year result'),
        (org_id, '3103', 'Reserves', 'equity', '3000', true, 'Legal and statutory reserves'),
        (org_id, '4101', 'Sales Revenue', 'income', '4000', true, 'Revenue from sales'),
        (org_id, '4102', 'Service Revenue', 'income', '4000', true, 'Revenue from services'),
        (org_id, '4103', 'Sales Returns', 'income', '4000', true, 'Returns and allowances'),
        (org_id, '5101', 'Cost of Goods Sold', 'expense', '5000', true, 'COGS'),
        (org_id, '5102', 'Administrative Expenses', 'expense', '5000', true, 'Admin and overhead'),
        (org_id, '5103', 'Personnel Expenses', 'expense', '5000', true, 'Salaries and benefits'),
        (org_id, '5104', 'General Expenses', 'expense', '5000', true, 'Rent, utilities, other');

  END CASE;
END;
$function$

CREATE OR REPLACE FUNCTION public.fn_create_default_accounting_rules(org_id integer, country_code text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  perform public.fn_assert_acceso_org(org_id::integer);
  IF EXISTS (SELECT 1 FROM public.accounting_rules WHERE organization_id = org_id) THEN
    RETURN;
  END IF;

  CASE country_code
    WHEN 'COL' THEN
      INSERT INTO public.accounting_rules (organization_id, name, description, source_type, event_type, debit_account_code, credit_account_code, tax_account_code, use_tax_from_document, priority, is_active)
      VALUES
        (org_id, 'Venta a Credito', 'Facturacion de venta a credito', 'sale', 'created', '1305', '4105', '2405', true, 10, true),
        (org_id, 'Venta de Contado', 'Facturacion de venta al contado', 'sale', 'created', '1105', '4105', '2405', true, 11, true),
        (org_id, 'Cobro de Factura', 'Cobro de factura de cliente', 'sale_payment', 'paid', '1110', '1305', NULL, false, 20, true),
        (org_id, 'Cobro Parcial', 'Cobro parcial de factura', 'sale_payment', 'partial_paid', '1110', '1305', NULL, false, 21, true),
        (org_id, 'Compra a Credito', 'Compra de mercancia a credito', 'purchase', 'created', '1405', '2105', '2405', true, 10, true),
        (org_id, 'Compra de Contado', 'Compra de mercancia al contado', 'purchase', 'created', '1405', '1110', '2405', true, 11, true),
        (org_id, 'Pago a Proveedor', 'Pago a proveedor', 'purchase_payment', 'paid', '2105', '1110', NULL, false, 20, true),
        (org_id, 'Salida de Inventario (CMV)', 'Costo de mercancia vendida', 'inventory', 'adjusted', '6105', '1405', NULL, false, 30, true),
        (org_id, 'Pago de Nomina', 'Pago de nomina (cancela pasivo)', 'payroll', 'paid', '2505', '1110', NULL, false, 10, true),
        (org_id, 'Nomina por Pagar', 'Provision de nomina', 'payroll', 'created', '5105', '2505', NULL, false, 11, true),
        (org_id, 'Seguridad Social Empleador', 'Aportes a seguridad social (patronal)', 'payroll', 'created', '5195', '2370', NULL, false, 12, true),
        (org_id, 'Gasto Administrativo', 'Registro de gasto administrativo', 'expense', 'created', '5105', '1110', NULL, false, 13, true),
        (org_id, 'Devolucion de Venta', 'Nota credito por devolucion', 'sale_credit_note', 'created', '4105', '1305', '2405', true, 25, true),
        (org_id, 'Anulacion de Venta', 'Anulacion de factura', 'sale', 'voided', '4105', '1305', '2405', true, 26, true),
        (org_id, 'Reembolso a Cliente', 'Reembolso de pago a cliente', 'refund', 'refunded', '4105', '1110', NULL, false, 27, true),
        (org_id, 'Conciliacion Bancaria', 'Ajuste por conciliacion bancaria', 'bank', 'adjusted', '1110', '5105', NULL, false, 28, true),
        (org_id, 'Propina', 'Registro de propina', 'tip', 'created', '5105', '1105', NULL, false, 30, true),
        (org_id, 'Movimiento de Caja', 'Movimiento de caja', 'cash_movement', 'created', '1105', '4105', NULL, false, 30, true),
        (org_id, 'Ajuste Inventario Ganancia', 'Ajuste positivo de inventario', 'inventory_adjustment', 'gain', '1405', '4250', NULL, false, 30, true),
        (org_id, 'Ajuste Inventario Perdida', 'Ajuste negativo de inventario', 'inventory_adjustment', 'loss', '5150', '1405', NULL, false, 31, true),
        (org_id, 'Orden de Compra Recibida', 'Recepcion de orden de compra', 'purchase_order', 'received', '1405', '2105', '2405', true, 30, true),
        (org_id, 'Membresia', 'Ingreso por membresia', 'membership', 'created', '1105', '4250', NULL, false, 30, true),
        (org_id, 'Sesion Parqueadero', 'Ingreso por sesion de parqueadero', 'parking', 'closed', '1105', '4235', NULL, false, 30, true),
        (org_id, 'Pase Parqueadero', 'Ingreso por pase de parqueadero', 'parking_pass', 'paid', '1105', '4235', NULL, false, 30, true),
        (org_id, 'Prestamo Empleado', 'Desembolso de prestamo', 'loan', 'paid', '1305', '1105', NULL, false, 30, true),
        (org_id, 'Cuota Prestamo', 'Pago de cuota de prestamo', 'installment', 'paid', '1105', '1305', NULL, false, 30, true),
        (org_id, 'Manifiesto Despacho', 'Manifiesto de transporte', 'manifest', 'created', '1405', '1110', NULL, false, 30, true),
        (org_id, 'Envio', 'Costo de envio', 'shipment', 'created', '5105', '1110', NULL, false, 30, true),
        (org_id, 'Viaje', 'Ingreso por viaje', 'trip', 'created', '1105', '4105', NULL, false, 30, true),
        (org_id, 'Incidente Transporte', 'Gasto por incidente de transporte', 'transport_incident', 'created', '5105', '1110', NULL, false, 30, true),
        (org_id, 'Cargo Folio Alimentos', 'Cargo a folio por alimentos', 'folio_item', 'created', '1305', '4110', NULL, false, 30, true),
        (org_id, 'Cargo Folio Servicios', 'Cargo a folio por servicios', 'folio_item', 'created', '1305', '4115', NULL, false, 31, true),
        (org_id, 'Pago Folio', 'Pago de folio', 'folio_payment', 'paid', '1105', '1305', NULL, false, 30, true),
        (org_id, 'Comision OTA', 'Comisión del canal: gasto contra cuenta por pagar al canal (ADR-CC-013)', 'ota_commission', 'confirmed', '5235', '2335', NULL, false, 30, true),
        (org_id, 'Mantenimiento', 'Gasto de mantenimiento', 'maintenance', 'created', '5105', '1110', NULL, false, 30, true),
        (org_id, 'Reserva Confirmada', 'Reserva confirmada', 'reservation', 'confirmed', '1305', '4250', NULL, false, 30, true),
        (org_id, 'Costo Patronal COL', 'Provision SS patronal al aprobar período', 'payroll_period', 'created', '5195', '2370', NULL, false, 5, true),
        (org_id, 'Pago Costo Patronal COL', 'Pago obligaciones patronales al cerrar período', 'payroll_period', 'paid', '2370', '1110', NULL, false, 5, true);

    WHEN 'MEX' THEN
      INSERT INTO public.accounting_rules (organization_id, name, description, source_type, event_type, debit_account_code, credit_account_code, tax_account_code, use_tax_from_document, priority, is_active)
      VALUES
        (org_id, 'Venta a Credito', 'Facturacion de venta a credito', 'sale', 'created', '1102', '4101', '2102', true, 10, true),
        (org_id, 'Venta de Contado', 'Facturacion de venta al contado', 'sale', 'created', '1101', '4101', '2102', true, 11, true),
        (org_id, 'Cobro de Factura', 'Cobro de factura de cliente', 'sale_payment', 'paid', '1101', '1102', NULL, false, 20, true),
        (org_id, 'Cobro Parcial', 'Cobro parcial de factura', 'sale_payment', 'partial_paid', '1101', '1102', NULL, false, 21, true),
        (org_id, 'Compra a Credito', 'Compra de mercancia a credito', 'purchase', 'created', '1103', '2101', '2102', true, 10, true),
        (org_id, 'Compra de Contado', 'Compra de mercancia al contado', 'purchase', 'created', '1103', '1101', '2102', true, 11, true),
        (org_id, 'Pago a Proveedor', 'Pago a proveedor', 'purchase_payment', 'paid', '2101', '1101', NULL, false, 20, true),
        (org_id, 'Salida de Inventario (COGS)', 'Costo de mercancia vendida', 'inventory', 'adjusted', '5101', '1103', NULL, false, 30, true),
        (org_id, 'Pago de Nomina', 'Pago de nomina (cancela pasivo)', 'payroll', 'paid', '2103', '1101', NULL, false, 10, true),
        (org_id, 'Nomina por Pagar', 'Provision de nomina', 'payroll', 'created', '5103', '2103', NULL, false, 11, true),
        (org_id, 'Seguridad Social Empleador', 'Aportes IMSS patronal', 'payroll', 'created', '5193', '2104', NULL, false, 12, true),
        (org_id, 'Gasto Administrativo', 'Gastos administrativos', 'expense', 'created', '5102', '1101', NULL, false, 13, true),
        (org_id, 'Devolucion de Venta', 'Nota credito por devolucion', 'sale_credit_note', 'created', '4101', '1102', '2102', true, 25, true),
        (org_id, 'Anulacion de Venta', 'Anulacion de factura', 'sale', 'voided', '4101', '1102', '2102', true, 26, true),
        (org_id, 'Reembolso a Cliente', 'Reembolso de pago a cliente', 'refund', 'refunded', '4101', '1101', NULL, false, 27, true),
        (org_id, 'Conciliacion Bancaria', 'Ajuste por conciliacion bancaria', 'bank', 'adjusted', '1101', '5102', NULL, false, 28, true),
        (org_id, 'Propina', 'Registro de propina', 'tip', 'created', '5103', '1101', NULL, false, 30, true),
        (org_id, 'Movimiento de Caja', 'Movimiento de caja', 'cash_movement', 'created', '1101', '4101', NULL, false, 30, true),
        (org_id, 'Ajuste Inventario Ganancia', 'Ajuste positivo', 'inventory_adjustment', 'gain', '1103', '4101', NULL, false, 30, true),
        (org_id, 'Ajuste Inventario Perdida', 'Ajuste negativo', 'inventory_adjustment', 'loss', '5101', '1103', NULL, false, 31, true),
        (org_id, 'Orden de Compra Recibida', 'Recepcion OC', 'purchase_order', 'received', '1103', '2101', '2102', true, 30, true),
        (org_id, 'Membresia', 'Ingreso membresia', 'membership', 'created', '1101', '4101', NULL, false, 30, true),
        (org_id, 'Sesion Parqueadero', 'Ingreso parking', 'parking', 'closed', '1101', '4101', NULL, false, 30, true),
        (org_id, 'Pase Parqueadero', 'Ingreso pase parking', 'parking_pass', 'paid', '1101', '4101', NULL, false, 30, true),
        (org_id, 'Prestamo Empleado', 'Desembolso prestamo', 'loan', 'paid', '1102', '1101', NULL, false, 30, true),
        (org_id, 'Cuota Prestamo', 'Pago cuota', 'installment', 'paid', '1101', '1102', NULL, false, 30, true),
        (org_id, 'Manifiesto', 'Manifiesto transporte', 'manifest', 'created', '1103', '1101', NULL, false, 30, true),
        (org_id, 'Envio', 'Costo envio', 'shipment', 'created', '5102', '1101', NULL, false, 30, true),
        (org_id, 'Viaje', 'Ingreso viaje', 'trip', 'created', '1101', '4101', NULL, false, 30, true),
        (org_id, 'Incidente Transporte', 'Gasto incidente', 'transport_incident', 'created', '5102', '1101', NULL, false, 30, true),
        (org_id, 'Cargo Folio', 'Cargo folio', 'folio_item', 'created', '1102', '4101', NULL, false, 30, true),
        (org_id, 'Pago Folio', 'Pago folio', 'folio_payment', 'paid', '1101', '1102', NULL, false, 30, true),
        (org_id, 'Comision OTA', 'Comision OTA', 'ota_commission', 'created', '5102', '1102', NULL, false, 30, true),
        (org_id, 'Mantenimiento', 'Mantenimiento', 'maintenance', 'created', '5102', '1101', NULL, false, 30, true),
        (org_id, 'Reserva', 'Reserva', 'reservation', 'confirmed', '1102', '4101', NULL, false, 30, true),
        (org_id, 'Costo Patronal MEX', 'Provision IMSS patronal al aprobar período', 'payroll_period', 'created', '5193', '2104', NULL, false, 5, true),
        (org_id, 'Pago Costo Patronal MEX', 'Pago obligaciones patronales al cerrar período', 'payroll_period', 'paid', '2104', '1101', NULL, false, 5, true);

    WHEN 'ESP' THEN
      INSERT INTO public.accounting_rules (organization_id, name, description, source_type, event_type, debit_account_code, credit_account_code, tax_account_code, use_tax_from_document, priority, is_active)
      VALUES
        (org_id, 'Venta a Credito', 'Venta credito', 'sale', 'created', '1300', '7000', '4770', true, 10, true),
        (org_id, 'Venta de Contado', 'Venta contado', 'sale', 'created', '5700', '7000', '4770', true, 11, true),
        (org_id, 'Cobro Factura', 'Cobro factura', 'sale_payment', 'paid', '5700', '1300', NULL, false, 20, true),
        (org_id, 'Cobro Parcial', 'Cobro parcial', 'sale_payment', 'partial_paid', '5700', '1300', NULL, false, 21, true),
        (org_id, 'Compra a Credito', 'Compra credito', 'purchase', 'created', '6000', '4000', '4720', true, 10, true),
        (org_id, 'Compra de Contado', 'Compra contado', 'purchase', 'created', '6000', '5700', '4720', true, 11, true),
        (org_id, 'Pago a Proveedor', 'Pago proveedor', 'purchase_payment', 'paid', '4000', '5700', NULL, false, 20, true),
        (org_id, 'Salida Inventario', 'CMV', 'inventory', 'adjusted', '6200', '3000', NULL, false, 30, true),
        (org_id, 'Pago Nomina', 'Pago nomina', 'payroll', 'paid', '4651', '5700', NULL, false, 10, true),
        (org_id, 'Nomina por Pagar', 'Provision nomina', 'payroll', 'created', '6400', '4651', NULL, false, 11, true),
        (org_id, 'SS Empleador', 'SS patronal', 'payroll', 'created', '642', '476', NULL, false, 12, true),
        (org_id, 'Gasto Admin', 'Gastos admin', 'expense', 'created', '6200', '5700', NULL, false, 13, true),
        (org_id, 'Devolucion Venta', 'Nota credito', 'sale_credit_note', 'created', '7000', '1300', '4770', true, 25, true),
        (org_id, 'Anulacion Venta', 'Anulacion', 'sale', 'voided', '7000', '1300', '4770', true, 26, true),
        (org_id, 'Reembolso', 'Reembolso', 'refund', 'refunded', '7000', '5700', NULL, false, 27, true),
        (org_id, 'Conciliacion Bancaria', 'Conciliacion', 'bank', 'adjusted', '5700', '6200', NULL, false, 28, true),
        (org_id, 'Propina', 'Propina', 'tip', 'created', '6400', '5700', NULL, false, 30, true),
        (org_id, 'Mov Caja', 'Mov caja', 'cash_movement', 'created', '5700', '7000', NULL, false, 30, true),
        (org_id, 'Ajuste Inv Ganancia', 'Ajuste positivo', 'inventory_adjustment', 'gain', '3000', '7000', NULL, false, 30, true),
        (org_id, 'Ajuste Inv Perdida', 'Ajuste negativo', 'inventory_adjustment', 'loss', '6200', '3000', NULL, false, 31, true),
        (org_id, 'OC Recibida', 'Recepcion OC', 'purchase_order', 'received', '6000', '4000', '4720', true, 30, true),
        (org_id, 'Membresia', 'Membresia', 'membership', 'created', '5700', '7000', NULL, false, 30, true),
        (org_id, 'Parking', 'Sesion parking', 'parking', 'closed', '5700', '7000', NULL, false, 30, true),
        (org_id, 'Pase Parking', 'Pase parking', 'parking_pass', 'paid', '5700', '7000', NULL, false, 30, true),
        (org_id, 'Prestamo', 'Prestamo', 'loan', 'paid', '1300', '5700', NULL, false, 30, true),
        (org_id, 'Cuota', 'Cuota prestamo', 'installment', 'paid', '5700', '1300', NULL, false, 30, true),
        (org_id, 'Manifiesto', 'Manifiesto', 'manifest', 'created', '6000', '5700', NULL, false, 30, true),
        (org_id, 'Envio', 'Envio', 'shipment', 'created', '6200', '5700', NULL, false, 30, true),
        (org_id, 'Viaje', 'Viaje', 'trip', 'created', '5700', '7000', NULL, false, 30, true),
        (org_id, 'Incidente', 'Incidente', 'transport_incident', 'created', '6200', '5700', NULL, false, 30, true),
        (org_id, 'Folio', 'Cargo folio', 'folio_item', 'created', '1300', '7000', NULL, false, 30, true),
        (org_id, 'Pago Folio', 'Pago folio', 'folio_payment', 'paid', '5700', '1300', NULL, false, 30, true),
        (org_id, 'Comision OTA', 'Comision OTA', 'ota_commission', 'created', '6200', '1300', NULL, false, 30, true),
        (org_id, 'Mantenimiento', 'Mantenimiento', 'maintenance', 'created', '6200', '5700', NULL, false, 30, true),
        (org_id, 'Reserva', 'Reserva', 'reservation', 'confirmed', '1300', '7000', NULL, false, 30, true),
        (org_id, 'Costo Patronal ESP', 'Provision SS patronal al aprobar período', 'payroll_period', 'created', '642', '476', NULL, false, 5, true),
        (org_id, 'Pago Costo Patronal ESP', 'Pago SS patronal al cerrar período', 'payroll_period', 'paid', '476', '572', NULL, false, 5, true);

    WHEN 'CHL' THEN
      INSERT INTO public.accounting_rules (organization_id, name, description, source_type, event_type, debit_account_code, credit_account_code, tax_account_code, use_tax_from_document, priority, is_active)
      VALUES
        (org_id, 'Venta a Credito', 'Venta credito', 'sale', 'created', '1102', '4101', '2102', true, 10, true),
        (org_id, 'Venta de Contado', 'Venta contado', 'sale', 'created', '1101', '4101', '2102', true, 11, true),
        (org_id, 'Cobro Factura', 'Cobro factura', 'sale_payment', 'paid', '1101', '1102', NULL, false, 20, true),
        (org_id, 'Cobro Parcial', 'Cobro parcial', 'sale_payment', 'partial_paid', '1101', '1102', NULL, false, 21, true),
        (org_id, 'Compra a Credito', 'Compra credito', 'purchase', 'created', '1103', '2101', '2102', true, 10, true),
        (org_id, 'Compra de Contado', 'Compra contado', 'purchase', 'created', '1103', '1101', '2102', true, 11, true),
        (org_id, 'Pago a Proveedor', 'Pago proveedor', 'purchase_payment', 'paid', '2101', '1101', NULL, false, 20, true),
        (org_id, 'Salida Inventario', 'CMV', 'inventory', 'adjusted', '5101', '1103', NULL, false, 30, true),
        (org_id, 'Pago Nomina', 'Pago nomina (cancela pasivo)', 'payroll', 'paid', '2103', '1101', NULL, false, 10, true),
        (org_id, 'Nomina por Pagar', 'Provision nomina', 'payroll', 'created', '5103', '2103', NULL, false, 11, true),
        (org_id, 'SS Empleador', 'AFP/IPS patronal', 'payroll', 'created', '5193', '2104', NULL, false, 12, true),
        (org_id, 'Gasto Admin', 'Gastos admin', 'expense', 'created', '5102', '1101', NULL, false, 13, true),
        (org_id, 'Devolucion Venta', 'Nota credito', 'sale_credit_note', 'created', '4101', '1102', '2102', true, 25, true),
        (org_id, 'Anulacion Venta', 'Anulacion', 'sale', 'voided', '4101', '1102', '2102', true, 26, true),
        (org_id, 'Reembolso', 'Reembolso', 'refund', 'refunded', '4101', '1101', NULL, false, 27, true),
        (org_id, 'Conciliacion Bancaria', 'Conciliacion', 'bank', 'adjusted', '1101', '5102', NULL, false, 28, true),
        (org_id, 'Propina', 'Propina', 'tip', 'created', '5103', '1101', NULL, false, 30, true),
        (org_id, 'Mov Caja', 'Mov caja', 'cash_movement', 'created', '1101', '4101', NULL, false, 30, true),
        (org_id, 'Ajuste Inv Ganancia', 'Ajuste positivo', 'inventory_adjustment', 'gain', '1103', '4101', NULL, false, 30, true),
        (org_id, 'Ajuste Inv Perdida', 'Ajuste negativo', 'inventory_adjustment', 'loss', '5101', '1103', NULL, false, 31, true),
        (org_id, 'OC Recibida', 'Recepcion OC', 'purchase_order', 'received', '1103', '2101', '2102', true, 30, true),
        (org_id, 'Membresia', 'Membresia', 'membership', 'created', '1101', '4101', NULL, false, 30, true),
        (org_id, 'Parking', 'Sesion parking', 'parking', 'closed', '1101', '4101', NULL, false, 30, true),
        (org_id, 'Pase Parking', 'Pase parking', 'parking_pass', 'paid', '1101', '4101', NULL, false, 30, true),
        (org_id, 'Prestamo', 'Prestamo', 'loan', 'paid', '1102', '1101', NULL, false, 30, true),
        (org_id, 'Cuota', 'Cuota prestamo', 'installment', 'paid', '1101', '1102', NULL, false, 30, true),
        (org_id, 'Manifiesto', 'Manifiesto', 'manifest', 'created', '1103', '1101', NULL, false, 30, true),
        (org_id, 'Envio', 'Envio', 'shipment', 'created', '5102', '1101', NULL, false, 30, true),
        (org_id, 'Viaje', 'Viaje', 'trip', 'created', '1101', '4101', NULL, false, 30, true),
        (org_id, 'Incidente', 'Incidente', 'transport_incident', 'created', '5102', '1101', NULL, false, 30, true),
        (org_id, 'Folio', 'Cargo folio', 'folio_item', 'created', '1102', '4101', NULL, false, 30, true),
        (org_id, 'Pago Folio', 'Pago folio', 'folio_payment', 'paid', '1101', '1102', NULL, false, 30, true),
        (org_id, 'Comision OTA', 'Comision OTA', 'ota_commission', 'created', '5102', '1102', NULL, false, 30, true),
        (org_id, 'Mantenimiento', 'Mantenimiento', 'maintenance', 'created', '5102', '1101', NULL, false, 30, true),
        (org_id, 'Reserva', 'Reserva', 'reservation', 'confirmed', '1102', '4101', NULL, false, 30, true),
        (org_id, 'Costo Patronal CHL', 'Provision AFP/IPS patronal al aprobar período', 'payroll_period', 'created', '5193', '2104', NULL, false, 5, true),
        (org_id, 'Pago Costo Patronal CHL', 'Pago obligaciones patronales al cerrar período', 'payroll_period', 'paid', '2104', '1101', NULL, false, 5, true);

    ELSE
      INSERT INTO public.accounting_rules (organization_id, name, description, source_type, event_type, debit_account_code, credit_account_code, tax_account_code, use_tax_from_document, priority, is_active)
      VALUES
        (org_id, 'Sale on Credit', 'Credit sale', 'sale', 'created', '1102', '4101', '2102', true, 10, true),
        (org_id, 'Cash Sale', 'Cash sale', 'sale', 'created', '1101', '4101', '2102', true, 11, true),
        (org_id, 'Invoice Payment', 'Customer payment', 'sale_payment', 'paid', '1101', '1102', NULL, false, 20, true),
        (org_id, 'Partial Payment', 'Partial payment', 'sale_payment', 'partial_paid', '1101', '1102', NULL, false, 21, true),
        (org_id, 'Credit Purchase', 'Credit purchase', 'purchase', 'created', '1103', '2101', '2102', true, 10, true),
        (org_id, 'Cash Purchase', 'Cash purchase', 'purchase', 'created', '1103', '1101', '2102', true, 11, true),
        (org_id, 'Supplier Payment', 'Supplier payment', 'purchase_payment', 'paid', '2101', '1101', NULL, false, 20, true),
        (org_id, 'Inventory Outflow (COGS)', 'COGS', 'inventory', 'adjusted', '5101', '1103', NULL, false, 30, true),
        (org_id, 'Payroll Payment', 'Payroll payment (cancela pasivo)', 'payroll', 'paid', '2103', '1101', NULL, false, 10, true),
        (org_id, 'Payroll Payable', 'Payroll provision', 'payroll', 'created', '5103', '2103', NULL, false, 11, true),
        (org_id, 'Employer Social Security', 'Employer SS', 'payroll', 'created', '5193', '2104', NULL, false, 12, true),
        (org_id, 'Administrative Expense', 'Admin expense', 'expense', 'created', '5102', '1101', NULL, false, 13, true),
        (org_id, 'Sales Refund', 'Credit note', 'sale_credit_note', 'created', '4101', '1102', '2102', true, 25, true),
        (org_id, 'Sale Void', 'Invoice void', 'sale', 'voided', '4101', '1102', '2102', true, 26, true),
        (org_id, 'Customer Refund', 'Refund', 'refund', 'refunded', '4101', '1101', NULL, false, 27, true),
        (org_id, 'Bank Reconciliation', 'Bank reconciliation', 'bank', 'adjusted', '1101', '5102', NULL, false, 28, true),
        (org_id, 'Tip', 'Tip', 'tip', 'created', '5103', '1101', NULL, false, 30, true),
        (org_id, 'Cash Movement', 'Cash movement', 'cash_movement', 'created', '1101', '4101', NULL, false, 30, true),
        (org_id, 'Inventory Adjustment Gain', 'Inventory gain', 'inventory_adjustment', 'gain', '1103', '4101', NULL, false, 30, true),
        (org_id, 'Inventory Adjustment Loss', 'Inventory loss', 'inventory_adjustment', 'loss', '5101', '1103', NULL, false, 31, true),
        (org_id, 'Purchase Order Received', 'PO received', 'purchase_order', 'received', '1103', '2101', '2102', true, 30, true),
        (org_id, 'Membership', 'Membership', 'membership', 'created', '1101', '4101', NULL, false, 30, true),
        (org_id, 'Parking Session', 'Parking session', 'parking', 'closed', '1101', '4101', NULL, false, 30, true),
        (org_id, 'Parking Pass', 'Parking pass', 'parking_pass', 'paid', '1101', '4101', NULL, false, 30, true),
        (org_id, 'Employee Loan', 'Loan disbursement', 'loan', 'paid', '1102', '1101', NULL, false, 30, true),
        (org_id, 'Loan Installment', 'Loan payment', 'installment', 'paid', '1101', '1102', NULL, false, 30, true),
        (org_id, 'Manifest', 'Dispatch manifest', 'manifest', 'created', '1103', '1101', NULL, false, 30, true),
        (org_id, 'Shipment', 'Shipment cost', 'shipment', 'created', '5102', '1101', NULL, false, 30, true),
        (org_id, 'Trip', 'Trip income', 'trip', 'created', '1101', '4101', NULL, false, 30, true),
        (org_id, 'Transport Incident', 'Transport incident', 'transport_incident', 'created', '5102', '1101', NULL, false, 30, true),
        (org_id, 'Folio Item', 'Folio charge', 'folio_item', 'created', '1102', '4101', NULL, false, 30, true),
        (org_id, 'Folio Payment', 'Folio payment', 'folio_payment', 'paid', '1101', '1102', NULL, false, 30, true),
        (org_id, 'OTA Commission', 'OTA commission', 'ota_commission', 'created', '5102', '1102', NULL, false, 30, true),
        (org_id, 'Maintenance', 'Maintenance', 'maintenance', 'created', '5102', '1101', NULL, false, 30, true),
        (org_id, 'Reservation', 'Reservation', 'reservation', 'confirmed', '1102', '4101', NULL, false, 30, true),
        (org_id, 'Employer Cost Provision', 'Employer SS provision on period approval', 'payroll_period', 'created', '5193', '2104', NULL, false, 5, true),
        (org_id, 'Employer Cost Payment', 'Employer obligations payment on period close', 'payroll_period', 'paid', '2104', '1101', NULL, false, 5, true);

  END CASE;

  -- C1: Reglas de comisiones (común para todos los países)
  INSERT INTO public.accounting_rules (organization_id, name, description, source_type, event_type, debit_account_code, credit_account_code, priority, is_active)
  VALUES
    (org_id, 'Comisión Devengada', 'Provisión comisión al vender', 'commission', 'accrued',
      CASE country_code
        WHEN 'COL' THEN '5235'
        WHEN 'MEX' THEN '5235'
        WHEN 'ESP' THEN '6400'
        WHEN 'CHL' THEN '6235'
        ELSE '5235'
      END,
      CASE country_code
        WHEN 'COL' THEN '2370'
        WHEN 'MEX' THEN '2370'
        WHEN 'ESP' THEN '4100'
        WHEN 'CHL' THEN '2370'
        ELSE '2104'
      END,
      5, true),
    (org_id, 'Pago Comisión', 'Pago de comisión al empleado/proveedor', 'commission', 'paid',
      CASE country_code
        WHEN 'COL' THEN '2370'
        WHEN 'MEX' THEN '2370'
        WHEN 'ESP' THEN '4100'
        WHEN 'CHL' THEN '2370'
        ELSE '2104'
      END,
      CASE country_code
        WHEN 'COL' THEN '1110'
        WHEN 'MEX' THEN '1110'
        WHEN 'ESP' THEN '5700'
        WHEN 'CHL' THEN '1105'
        ELSE '1101'
      END,
      5, true);

END;
$function$

CREATE OR REPLACE FUNCTION public.fn_add_module_accounts(org_id integer, country_code text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  perform public.fn_assert_acceso_org(org_id::integer);
  IF country_code = 'COL' THEN
    INSERT INTO public.chart_of_accounts (organization_id, account_code, name, type, parent_code, is_active, description)
    SELECT org_id, code, name, type, NULL, true, 'Cuenta de modulo (parking/folio/payroll/comisiones)'
    FROM (VALUES
      ('2370','Obligaciones Laborales y Seguridad Social por Pagar','liability'),
      ('4110','Ingresos por Alimentos y Bebidas','income'),
      ('4115','Ingresos por Servicios','income'),
      ('4235','Ingresos por Parqueadero','income'),
      ('4250','Otros Ingresos Operacionales','income'),
      ('5150','Gastos de Mantenimiento y Reparaciones','expense'),
      ('5195','Aportes Seguridad Social Patronal','expense')
    ) AS v(code, name, type)
    WHERE NOT EXISTS (SELECT 1 FROM public.chart_of_accounts c WHERE c.organization_id = org_id AND c.account_code = v.code);
  ELSE
    -- GEN / generico (usado cuando country_code es NULL)
    INSERT INTO public.chart_of_accounts (organization_id, account_code, name, type, parent_code, is_active, description)
    SELECT org_id, code, name, type, NULL, true, 'Cuenta de modulo (parking/folio/payroll/comisiones)'
    FROM (VALUES
      ('2104','Employer Social Security Payable','liability'),
      ('5193','Employer Social Security Expense','expense')
    ) AS v(code, name, type)
    WHERE NOT EXISTS (SELECT 1 FROM public.chart_of_accounts c WHERE c.organization_id = org_id AND c.account_code = v.code);
  END IF;
END;
$function$

CREATE OR REPLACE FUNCTION public.fn_create_branch_subaccounts()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_seq integer;
    v_sub_code text;
    v_base_accounts text[] := ARRAY['1405', '6105']; -- Inventario y CMV
    v_base_name text;
    v_base_type text;
    v_base_parent text;
    v_branch_name text;
BEGIN
    -- Solo para organizaciones que ya tienen las cuentas base
    FOR i IN 1..array_length(v_base_accounts, 1) LOOP
        v_sub_code := v_base_accounts[i];

        -- Verificar que la cuenta base existe para esta organización
        SELECT name, type, parent_code INTO v_base_name, v_base_type, v_base_parent
        FROM chart_of_accounts
        WHERE account_code = v_sub_code
          AND organization_id = NEW.organization_id
          AND is_active = true
        LIMIT 1;

        IF v_base_name IS NULL THEN
            CONTINUE; -- Si no existe la cuenta base, saltar
        END IF;

        -- Calcular secuencial: buscar el máximo número de sub-cuenta existente
        SELECT COALESCE(MAX(
            CASE 
                WHEN split_part(sub_account_code, '-', 2) ~ '^[0-9]+$' 
                THEN split_part(sub_account_code, '-', 2)::int 
                ELSE 0 
            END
        ), 0) + 1
        INTO v_seq
        FROM branch_account_mappings
        WHERE organization_id = NEW.organization_id
          AND base_account_code = v_sub_code;

        v_sub_code := v_base_accounts[i] || '-' || lpad(v_seq::text, 2, '0');

        -- Insertar sub-cuenta en chart_of_accounts
        INSERT INTO chart_of_accounts (account_code, organization_id, name, type, parent_code, is_active, description)
        VALUES (
            v_sub_code,
            NEW.organization_id,
            v_base_name || ' - ' || NEW.name,
            v_base_type,
            v_base_accounts[i],
            true,
            'Sub-cuenta automática para sucursal: ' || NEW.name
        )
        ON CONFLICT (account_code, organization_id) DO NOTHING;

        -- Insertar mapeo en branch_account_mappings
        INSERT INTO branch_account_mappings (organization_id, branch_id, base_account_code, sub_account_code)
        VALUES (NEW.organization_id, NEW.id, v_base_accounts[i], v_sub_code)
        ON CONFLICT (organization_id, branch_id, base_account_code) DO NOTHING;

    END LOOP;

    RETURN NEW;
END;
$function$

CREATE OR REPLACE FUNCTION public.fn_asegurar_cuenta_anticipos(p_organization_id integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_parent text;
begin
  if exists (select 1 from chart_of_accounts where organization_id = p_organization_id and account_code = '2805') then
    return;
  end if;

  if exists (select 1 from chart_of_accounts where organization_id = p_organization_id and account_code = '21') then
    v_parent := '21';
  else
    select parent_code into v_parent
    from chart_of_accounts
    where organization_id = p_organization_id
      and account_code in ('2105', '2101', '2205', '2102')
      and parent_code is not null
    order by account_code
    limit 1;
  end if;

  insert into chart_of_accounts (organization_id, account_code, name, type, parent_code, is_active, description)
  values (p_organization_id, '2805', 'Anticipos y avances recibidos', 'liability', v_parent, true,
          'Saldos a favor de clientes: anticipos y notas crédito sobre facturas ya pagadas')
  on conflict (organization_id, account_code) do nothing;
end;
$function$

CREATE OR REPLACE FUNCTION public.fn_asegurar_cuentas_retencion(p_organization_id integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_parent text;
begin
  if exists (select 1 from chart_of_accounts where organization_id = p_organization_id and account_code = '2365')
     and exists (select 1 from chart_of_accounts where organization_id = p_organization_id and account_code = '2367')
     and exists (select 1 from chart_of_accounts where organization_id = p_organization_id and account_code = '2368') then
    return;
  end if;

  if exists (select 1 from chart_of_accounts where organization_id = p_organization_id and account_code = '21') then
    v_parent := '21';
  else
    select parent_code into v_parent
    from chart_of_accounts
    where organization_id = p_organization_id
      and account_code in ('2105', '2101', '2205', '2102')
      and parent_code is not null
    order by account_code
    limit 1;
  end if;

  insert into chart_of_accounts (organization_id, account_code, name, type, parent_code, is_active, description)
  values
    (p_organization_id, '2365', 'Retención en la fuente', 'liability', v_parent, true,
     'Retenciones en la fuente practicadas a proveedores, por pagar a la DIAN'),
    (p_organization_id, '2367', 'Impuesto a las ventas retenido', 'liability', v_parent, true,
     'ReteIVA practicado a proveedores, por pagar a la DIAN'),
    (p_organization_id, '2368', 'Impuesto de industria y comercio retenido', 'liability', v_parent, true,
     'ReteICA practicado a proveedores, por pagar al municipio')
  on conflict (organization_id, account_code) do nothing;
end;
$function$

CREATE OR REPLACE FUNCTION public.fn_asegurar_cuentas_comision_ota(p_organization_id integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_parent text;
begin
  if not exists (select 1 from chart_of_accounts where organization_id = p_organization_id and account_code = '2335') then
    if exists (select 1 from chart_of_accounts where organization_id = p_organization_id and account_code = '23') then
      v_parent := '23';
    elsif exists (select 1 from chart_of_accounts where organization_id = p_organization_id and account_code = '2') then
      v_parent := '2';
    else
      select parent_code into v_parent from chart_of_accounts
       where organization_id = p_organization_id and account_code in ('2205', '2105', '2370') and parent_code is not null
       order by account_code limit 1;
    end if;
    insert into chart_of_accounts (organization_id, account_code, name, type, parent_code, is_active, description)
    values (p_organization_id, '2335', 'Costos y gastos por pagar', 'liability', v_parent, true,
            'Obligaciones por costos y gastos, entre ellas la comisión por pagar a los canales de venta (OTA)')
    on conflict (organization_id, account_code) do nothing;
  end if;

  if not exists (select 1 from chart_of_accounts where organization_id = p_organization_id and account_code = '5235') then
    select parent_code into v_parent from chart_of_accounts
     where organization_id = p_organization_id and account_code in ('5205', '5105', '5195') and parent_code is not null
     order by account_code limit 1;
    insert into chart_of_accounts (organization_id, account_code, name, type, parent_code, is_active, description)
    values (p_organization_id, '5235', 'Comisiones', 'expense', v_parent, true,
            'Gasto por comisiones, entre ellas las de los canales de venta (OTA)')
    on conflict (organization_id, account_code) do nothing;
  end if;
end;
$function$

CREATE OR REPLACE FUNCTION public.fn_create_journal_entry(p_organization_id integer, p_branch_id integer, p_entry_date timestamp with time zone, p_memo text, p_source text, p_source_id text, p_debit_account text, p_credit_account text, p_amount numeric, p_tax_account text DEFAULT NULL::text, p_tax_amount numeric DEFAULT 0, p_created_by uuid DEFAULT NULL::uuid, p_tax_is_credit boolean DEFAULT false, p_fact_key text DEFAULT NULL::text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_entry_id integer;
    v_branch_id integer;
BEGIN
    IF p_fact_key IS NOT NULL THEN
        SELECT id INTO v_entry_id
        FROM journal_entries
        WHERE organization_id = p_organization_id AND fact_key = p_fact_key
        LIMIT 1;

        IF v_entry_id IS NOT NULL THEN
            RETURN v_entry_id;
        END IF;
    END IF;

    IF p_amount IS NULL OR p_amount <= 0 THEN
        PERFORM fn_log_journal_failure(p_organization_id, p_branch_id, p_entry_date, p_source,
            p_source_id, p_fact_key, p_debit_account, p_credit_account, p_amount,
            'amount_invalid', 'Importe nulo o no positivo');
        RETURN NULL;
    END IF;

    IF p_debit_account IS NULL OR p_credit_account IS NULL THEN
        PERFORM fn_log_journal_failure(p_organization_id, p_branch_id, p_entry_date, p_source,
            p_source_id, p_fact_key, p_debit_account, p_credit_account, p_amount,
            'account_null', 'La regla contable no trae cuenta de debito o de credito');
        RETURN NULL;
    END IF;

    IF p_debit_account = p_credit_account THEN
        PERFORM fn_log_journal_failure(p_organization_id, p_branch_id, p_entry_date, p_source,
            p_source_id, p_fact_key, p_debit_account, p_credit_account, p_amount,
            'same_account', 'Debito y credito sobre la misma cuenta ' || p_debit_account);
        RETURN NULL;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM chart_of_accounts
        WHERE organization_id = p_organization_id AND account_code = p_debit_account
    ) THEN
        PERFORM fn_log_journal_failure(p_organization_id, p_branch_id, p_entry_date, p_source,
            p_source_id, p_fact_key, p_debit_account, p_credit_account, p_amount,
            'debit_account_missing', 'La cuenta de debito ' || p_debit_account || ' no esta en el plan contable de la organizacion');
        RETURN NULL;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM chart_of_accounts
        WHERE organization_id = p_organization_id AND account_code = p_credit_account
    ) THEN
        PERFORM fn_log_journal_failure(p_organization_id, p_branch_id, p_entry_date, p_source,
            p_source_id, p_fact_key, p_debit_account, p_credit_account, p_amount,
            'credit_account_missing', 'La cuenta de credito ' || p_credit_account || ' no esta en el plan contable de la organizacion');
        RETURN NULL;
    END IF;

    IF p_tax_account IS NOT NULL AND p_tax_amount > 0 AND NOT EXISTS (
        SELECT 1 FROM chart_of_accounts
        WHERE organization_id = p_organization_id AND account_code = p_tax_account
    ) THEN
        PERFORM fn_log_journal_failure(p_organization_id, p_branch_id, p_entry_date, p_source,
            p_source_id, p_fact_key, p_debit_account, p_credit_account, p_amount,
            'tax_account_missing', 'La cuenta de impuesto ' || p_tax_account || ' no esta en el plan contable de la organizacion');
        RETURN NULL;
    END IF;

    IF NOT fn_is_period_open(p_organization_id, p_entry_date::date) THEN
        PERFORM fn_log_journal_failure(p_organization_id, p_branch_id, p_entry_date, p_source,
            p_source_id, p_fact_key, p_debit_account, p_credit_account, p_amount,
            'period_closed', 'Periodo contable cerrado para la fecha ' || p_entry_date::date);
        RETURN NULL;
    END IF;

    IF p_branch_id IS NULL OR p_branch_id = 0 OR NOT EXISTS (
        SELECT 1 FROM branches WHERE id = p_branch_id AND organization_id = p_organization_id
    ) THEN
        SELECT id INTO v_branch_id
        FROM branches
        WHERE organization_id = p_organization_id AND is_main = true AND is_active = true
        LIMIT 1;

        IF v_branch_id IS NULL THEN
            SELECT MIN(id) INTO v_branch_id FROM branches WHERE organization_id = p_organization_id;
        END IF;
    ELSE
        v_branch_id := p_branch_id;
    END IF;

    BEGIN
        INSERT INTO journal_entries (
            organization_id, branch_id, entry_date, memo,
            source, source_id, posted, created_by, fact_key
        ) VALUES (
            p_organization_id, v_branch_id, p_entry_date, p_memo,
            p_source, p_source_id, true, p_created_by, p_fact_key
        ) RETURNING id INTO v_entry_id;
    EXCEPTION WHEN unique_violation THEN
        IF p_fact_key IS NULL THEN
            RAISE;
        END IF;

        SELECT id INTO v_entry_id
        FROM journal_entries
        WHERE organization_id = p_organization_id AND fact_key = p_fact_key
        LIMIT 1;
        RETURN v_entry_id;
    END;

    IF p_tax_is_credit THEN
        INSERT INTO journal_lines (journal_entry_id, account_code, description, debit, credit)
        VALUES (v_entry_id, p_debit_account, p_memo, p_amount, 0);

        IF p_tax_account IS NOT NULL AND p_tax_amount > 0 THEN
            INSERT INTO journal_lines (journal_entry_id, account_code, description, debit, credit)
            VALUES (v_entry_id, p_tax_account, 'IVA - ' || p_memo, 0, p_tax_amount);
        END IF;

        INSERT INTO journal_lines (journal_entry_id, account_code, description, debit, credit)
        VALUES (v_entry_id, p_credit_account, p_memo, 0, p_amount - COALESCE(p_tax_amount, 0));
    ELSE
        INSERT INTO journal_lines (journal_entry_id, account_code, description, debit, credit)
        VALUES (v_entry_id, p_debit_account, p_memo, p_amount - COALESCE(p_tax_amount, 0), 0);

        IF p_tax_account IS NOT NULL AND p_tax_amount > 0 THEN
            INSERT INTO journal_lines (journal_entry_id, account_code, description, debit, credit)
            VALUES (v_entry_id, p_tax_account, 'IVA - ' || p_memo, p_tax_amount, 0);
        END IF;

        INSERT INTO journal_lines (journal_entry_id, account_code, description, debit, credit)
        VALUES (v_entry_id, p_credit_account, p_memo, 0, p_amount);
    END IF;

    RETURN v_entry_id;
END;
$function$

drop function if exists public.fn_puc_cuenta_de_sede(integer, integer, text);
drop function if exists public.fn_puc_linea_solo_movimiento();
drop function if exists public.fn_puc_no_borrar_con_movimientos();
drop function if exists public.fn_puc_validar_cuenta();

alter table public.chart_of_accounts drop column if exists nivel;
alter table public.chart_of_accounts drop column if exists clase;
alter table public.chart_of_accounts drop column if exists naturaleza;
alter table public.chart_of_accounts drop column if exists es_movimiento;
alter table public.chart_of_accounts drop column if exists requiere_tercero;
alter table public.chart_of_accounts drop column if exists requiere_centro_costo;
alter table public.chart_of_accounts drop column if exists activa;

comment on column public.chart_of_accounts.is_active is null;

drop table if exists public.puc_plantilla;

alter table public.chart_of_accounts drop constraint if exists chart_of_accounts_type_check;
alter table public.chart_of_accounts
  add constraint chart_of_accounts_type_check
  check (type = any (array['asset'::text, 'liability'::text, 'income'::text, 'expense'::text, 'equity'::text]));

revoke all on function public.fn_create_default_chart_of_accounts(integer, text) from public, anon;
revoke all on function public.fn_create_default_accounting_rules(integer, text) from public, anon;
revoke all on function public.fn_add_module_accounts(integer, text) from public, anon;
grant execute on function public.fn_create_default_chart_of_accounts(integer, text) to authenticated, service_role;
grant execute on function public.fn_create_default_accounting_rules(integer, text) to authenticated, service_role;
grant execute on function public.fn_add_module_accounts(integer, text) to authenticated, service_role;

revoke all on function public.fn_asegurar_cuenta_anticipos(integer) from public, anon, authenticated;
revoke all on function public.fn_asegurar_cuentas_retencion(integer) from public, anon, authenticated;
revoke all on function public.fn_asegurar_cuentas_comision_ota(integer) from public, anon, authenticated;
grant execute on function public.fn_asegurar_cuenta_anticipos(integer) to service_role;
grant execute on function public.fn_asegurar_cuentas_retencion(integer) to service_role;
grant execute on function public.fn_asegurar_cuentas_comision_ota(integer) to service_role;

revoke all on function public.fn_create_journal_entry(integer, integer, timestamp with time zone, text, text, text, text, text, numeric, text, numeric, uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.fn_create_journal_entry(integer, integer, timestamp with time zone, text, text, text, text, text, numeric, text, numeric, uuid, boolean, text) to service_role;

-- El disparador de sedes ya era ejecutable por public. No se estrecha aquí.
grant execute on function public.fn_create_branch_subaccounts() to public, anon, authenticated, service_role;
