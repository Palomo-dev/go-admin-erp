-- Rollback de 130800: quita las filas nuevas de puc_plantilla, devuelve los padres a movimiento,
-- restaura el nombre del trigger y las versiones vivas (25-oct) de las dos funciones.
delete from public.puc_plantilla where codigo in ('370505','37050501','613505','61350501','61350502','429595',
  '42959501','24080501','24080502','24081001','24081002','53051501');
update public.puc_plantilla set es_movimiento = true where codigo in ('3705','6135','4295','240805','240810','530515');
update public.puc_plantilla set nombre = 'Comisiones bancarias' where codigo = '530515';
alter trigger trg_zzzz_configuracion_contable on public.organizations rename to tr_zz_configuracion_contable;

CREATE OR REPLACE FUNCTION public.fn_create_default_accounting_rules(org_id integer, country_code text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_type integer;
  v_inv text;
  v_cmv text;
  v_prod text;
  v_serv text;
  v_noshow text;
  v_manifiesto text;
begin
  perform public.fn_assert_acceso_org(org_id);
  if country_code is null then
    null;
  end if;
  if exists (select 1 from public.accounting_rules where organization_id = org_id) then
    return;
  end if;

  select o.type_id into v_type from public.organizations o where o.id = org_id;
  select s.account_code into v_inv
  from public.fn_propuesta_configuracion_sector(v_type) s where s.clave = 'inventario';
  select s.account_code into v_cmv
  from public.fn_propuesta_configuracion_sector(v_type) s where s.clave = 'costo_ventas';
  select s.account_code into v_prod
  from public.fn_propuesta_configuracion_sector(v_type) s where s.clave = 'ventas_productos';
  select s.account_code into v_serv
  from public.fn_propuesta_configuracion_sector(v_type) s where s.clave = 'ventas_servicios';
  v_inv := coalesce(v_inv, '1435');
  v_cmv := coalesce(v_cmv, '6135');
  v_prod := coalesce(v_prod, '4135');
  v_serv := coalesce(v_serv, '4235');
  v_noshow := case when v_type = 2 then v_serv when v_type = 1 then v_prod else '4235' end;
  v_manifiesto := case when v_type = 6 then '2335' else '2205' end;

  insert into public.accounting_rules (
    organization_id, name, description, source_type, event_type,
    debit_account_code, credit_account_code, tax_account_code,
    use_tax_from_document, priority, is_active
  ) values
    (org_id, 'Venta a Credito', 'Facturacion de venta a credito', 'sale', 'created', '1305', v_prod, '240805', true, 10, true),
    (org_id, 'Venta de Contado', 'Facturacion de venta al contado', 'sale', 'created', '1105', v_prod, '240805', true, 11, true),
    (org_id, 'Cobro de Factura', 'Cobro de factura de cliente', 'sale_payment', 'paid', '1110', '1305', null, false, 20, true),
    (org_id, 'Cobro Parcial', 'Cobro parcial de factura', 'sale_payment', 'partial_paid', '1110', '1305', null, false, 21, true),
    (org_id, 'Compra a Credito', 'Compra de mercancia a credito', 'purchase', 'created', v_inv, '2205', '240810', true, 10, true),
    (org_id, 'Compra de Contado', 'Compra de mercancia al contado', 'purchase', 'created', v_inv, '2205', '240810', true, 11, true),
    (org_id, 'Pago a Proveedor', 'Pago a proveedor', 'purchase_payment', 'paid', '2205', '1110', null, false, 20, true),
    (org_id, 'Salida de inventario', 'Salida que no es venta: gasto contra inventario. El costo de ventas solo sale de una venta o factura.', 'inventory', 'adjusted', '519595', v_inv, null, false, 30, true),
    (org_id, 'Pago de Nomina', 'Pago de nomina (cancela pasivo)', 'payroll', 'paid', '2505', '1110', null, false, 10, true),
    (org_id, 'Nomina por Pagar', 'Provision de nomina', 'payroll', 'created', '5105', '2505', null, false, 11, true),
    (org_id, 'Seguridad Social Empleador', 'Aportes a seguridad social (patronal)', 'payroll', 'created', '5105', '2370', null, false, 12, true),
    (org_id, 'Gasto Administrativo', 'Registro de gasto administrativo', 'expense', 'created', '5105', '1110', null, false, 13, true),
    (org_id, 'Devolucion de Venta', 'Nota credito por devolucion', 'sale_credit_note', 'created', '4175', '1305', '240805', true, 25, true),
    (org_id, 'Anulacion de Venta', 'Anulacion de factura', 'sale', 'voided', '4175', '1305', '240805', true, 26, true),
    (org_id, 'Reembolso a Cliente', 'Reembolso de pago a cliente', 'refund', 'refunded', '4175', '1110', null, false, 27, true),
    (org_id, 'Conciliacion Bancaria', 'Ajuste por conciliacion bancaria', 'bank', 'adjusted', '1110', '4250', null, false, 28, true),
    (org_id, 'Propina', 'Registro de propina', 'tip', 'created', '5105', '1105', null, false, 30, true),
    (org_id, 'Movimiento de Caja', 'Movimiento de caja', 'cash_movement', 'created', '1105', v_prod, null, false, 30, true),
    (org_id, 'Ajuste Inventario Ganancia', 'Ajuste positivo de inventario', 'inventory_adjustment', 'gain', v_inv, '4250', null, false, 30, true),
    (org_id, 'Ajuste Inventario Perdida', 'Faltante de inventario. El robo y el siniestro debitan 5315.', 'inventory_adjustment', 'loss', '519595', v_inv, null, false, 31, true),
    (org_id, 'Orden de Compra Recibida', 'Recepcion de orden de compra', 'purchase_order', 'received', v_inv, '2205', '240810', true, 30, true),
    (org_id, 'Membresia', 'Ingreso por membresia', 'membership', 'created', '1105', '4250', null, false, 30, true),
    (org_id, 'Sesion Parqueadero', 'Ingreso por sesion de parqueadero', 'parking', 'closed', '1105', '4235', null, false, 30, true),
    (org_id, 'Pase Parqueadero', 'Ingreso por pase de parqueadero', 'parking_pass', 'paid', '1105', '4235', null, false, 30, true),
    (org_id, 'Prestamo Empleado', 'Desembolso de prestamo a trabajador', 'loan', 'paid', '1365', '1105', null, false, 30, true),
    (org_id, 'Cuota Prestamo', 'Abono de prestamo a trabajador', 'installment', 'paid', '1105', '1365', null, false, 30, true),
    (org_id, 'Manifiesto Despacho', 'Inventario contra proveedores, o contra costos por pagar si la organización es de transporte. La caja solo si es de contado.', 'manifest', 'created', v_inv, v_manifiesto, null, false, 30, true),
    (org_id, 'Envio', 'Costo de envio', 'shipment', 'created', '523550', '1110', null, false, 30, true),
    (org_id, 'Viaje', 'Ingreso por viaje', 'trip', 'created', '1105', v_prod, null, false, 30, true),
    (org_id, 'Incidente Transporte', 'Gasto por incidente de transporte', 'transport_incident', 'created', '5105', '1110', null, false, 30, true),
    (org_id, 'Cargo Folio Alimentos', 'Cargo a folio por alimentos', 'folio_item', 'created', '1305', v_prod, null, false, 30, true),
    (org_id, 'Cargo Folio Servicios', 'Cargo a folio por servicios', 'folio_item', 'created', '1305', v_serv, null, false, 31, true),
    (org_id, 'Pago Folio', 'Pago de folio', 'folio_payment', 'paid', '1105', '1305', null, false, 30, true),
    (org_id, 'Comision OTA', 'Comision del canal: gasto contra cuenta por pagar al canal', 'ota_commission', 'confirmed', '529505', '2335', null, false, 30, true),
    (org_id, 'Mantenimiento', 'Gasto de mantenimiento', 'maintenance', 'created', '5145', '1110', null, false, 30, true),
    (org_id, 'Reserva Confirmada', 'Reserva confirmada', 'reservation', 'confirmed', '1305', '2805', null, false, 30, true),
    (org_id, 'Reserva no presentada', 'El anticipo pasa al ingreso del sector', 'reservation', 'no_show', '2805', v_noshow, null, false, 32, true),
    (org_id, 'Costo Patronal', 'Provision de seguridad social patronal al aprobar el periodo', 'payroll_period', 'created', '5105', '2370', null, false, 5, true),
    (org_id, 'Pago Costo Patronal', 'Pago de obligaciones patronales al cerrar el periodo', 'payroll_period', 'paid', '2370', '1110', null, false, 5, true),
    (org_id, 'Inventario apertura', 'Apertura de inventario contra patrimonio', 'inventory', 'opening', v_inv, '3105', null, false, 40, true),
    (org_id, 'Inventario venta', 'Costo de la venta', 'inventory', 'sale', v_cmv, v_inv, null, false, 41, true),
    (org_id, 'Inventario devolucion', 'Devolucion al inventario', 'inventory', 'return', v_inv, v_cmv, null, false, 42, true),
    (org_id, 'Inventario compra', 'Entrada de compra', 'inventory', 'purchase', v_inv, '2205', null, false, 43, true),
    (org_id, 'Inventario faltante', 'Faltante de inventario. El robo y el siniestro debitan 5315.', 'inventory', 'loss', '519595', v_inv, null, false, 44, true),
    (org_id, 'Inventario sobrante', 'Sobrante de inventario', 'inventory', 'gain', v_inv, '4295', null, false, 45, true);
end;
$function$;

CREATE OR REPLACE FUNCTION public.fn_sembrar_configuracion_contable(p_org integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_tipo integer;
  v_inv text;
begin
  perform public.fn_assert_acceso_org(p_org);
  if exists (
    select 1 from public.configuracion_contable where organization_id = p_org
  ) then
    return;
  end if;

  select o.type_id into v_tipo from public.organizations o where o.id = p_org;

  -- Inventario va SIEMPRE a un auxiliar 143501xx (regla de Juan: nunca 1435 sola ni 1405).
  -- Si aún no hay sede (la org se acaba de crear), fn_inventario_auxiliar_1435 devuelve null
  -- y la clave no se siembra: el resolver usa el auxiliar de la sede en tiempo de asiento.
  v_inv := public.fn_inventario_auxiliar_1435(p_org, null);

  insert into public.configuracion_contable (organization_id, branch_id, clave, account_code)
  select p_org, null, p.clave, x.codigo
  from public.fn_propuesta_configuracion_sector(v_tipo) p
  cross join lateral (
    select case
      when p.clave = 'inventario' then v_inv
      -- Cuenta de título: su único auxiliar de movimiento, si lo hay.
      when p.account_code not like '24%' and exists (
        select 1 from public.chart_of_accounts t
        where t.organization_id = p_org and t.account_code = p.account_code and t.es_movimiento is false
      ) then (
        select min(h.account_code) from public.chart_of_accounts h
        where h.organization_id = p_org
          and h.account_code like p.account_code || '_%'
          and h.es_movimiento is true
        having count(*) = 1
      )
      else p.account_code
    end as codigo
  ) x
  join public.chart_of_accounts c
    on c.organization_id = p_org
   and c.account_code = x.codigo
   and c.es_movimiento is distinct from false
  on conflict (organization_id, branch_id, clave) do nothing;
end;
$function$;
