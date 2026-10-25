-- P1 (25-oct-2026): siembra de orgs NUEVAS siempre con auxiliares de movimiento. NO aplicada.
-- 1) puc_plantilla: agrega 370505/37050501, 613505/61350501/61350502, 429595/42959501/42959502,
--    429581/42958101 y 539595/53959501 (Ajuste al peso a favor / en contra),
--    24080501/24080502, 24081001/24081002, 53051501; los padres 3705/6135/4295/5395/240805/240810/530515 de título.
-- 2) fn_create_default_accounting_rules: inventario 14350101, costo 61350501, apertura 37050501,
--    sobrantes 42959501, faltantes 61350502, IVA 24080501/24081001 (nunca cuentas de grupo).
-- 3) fn_sembrar_configuracion_contable: claves a los auxiliares del contador + mapeo por sede 6135->61350501.
--    fn_propuesta_configuracion_sector NO se cambia (es el fallback de fn_cuenta_por_clave para orgs viejas).
-- 4) Orden de triggers en organizations (alfabético): tr_zz_configuracion_contable corría ANTES de
--    trg_create_default_branch_and_period (sin sede => sin auxiliar 14350101). Se renombra a
--    trg_zzzz_configuracion_contable: corre después de tr_auto_create_chart_of_accounts* y de la sede.
-- Rollback: supabase/rollbacks/20261025134040_p1_siembra_auxiliares_movimiento_rollback.sql

insert into public.puc_plantilla (codigo, nombre, tipo, padre, descripcion, naturaleza, es_movimiento,
                                  requiere_tercero, requiere_centro_costo, centro_costo_modo, presentacion_niif)
select t.codigo, t.nombre, p.tipo, t.padre, null, p.naturaleza, t.mov,
       coalesce(p.requiere_tercero, false), p.requiere_centro_costo, p.centro_costo_modo, p.presentacion_niif
  from (values
    ('370505',   '3705',   'Saldos iniciales',                   false, 1),
    ('37050501', '370505', 'Inventario inicial',                 true,  2),
    ('613505',   '6135',   'Costo de mercancías vendidas',       false, 3),
    ('61350501', '613505', 'Costo de ventas de mercancías',      true,  4),
    ('61350502', '613505', 'Mermas y faltantes de inventario',   true,  5),
    ('429595',   '4295',   'Otros ingresos diversos',            false, 6),
    ('42959501', '429595', 'Sobrantes de inventario',            true,  7),
    ('42959502', '429595', 'Otros ingresos diversos',            true,  7),
    ('429581',   '4295',   'Ajuste al peso',                     false, 7),
    ('42958101', '429581', 'Ajuste al peso a favor',             true,  7),
    ('539595',   '5395',   'Ajuste al peso',                     false, 7),
    ('53959501', '539595', 'Ajuste al peso en contra',           true,  7),
    ('24080501', '240805', 'IVA generado 19%',                   true,  8),
    ('24080502', '240805', 'IVA generado 5%',                    true,  9),
    ('24081001', '240810', 'IVA descontable 19%',                true, 10),
    ('24081002', '240810', 'IVA descontable 5%',                 true, 11),
    ('53051501', '530515', 'Comisiones bancarias y financieras', true, 12)
  ) t(codigo, padre, nombre, mov, orden)
  join public.puc_plantilla p on p.codigo = left(t.codigo, 4)
 order by t.orden, length(t.codigo)
on conflict (codigo) do nothing;

update public.puc_plantilla set es_movimiento = false
 where codigo in ('3705', '6135', '4295', '5395', '240805', '240810', '530515') and es_movimiento is true;
update public.puc_plantilla set nombre = 'Comisiones' where codigo = '530515';

alter trigger tr_zz_configuracion_contable on public.organizations rename to trg_zzzz_configuracion_contable;

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
  v_merma text;
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
  -- Siempre auxiliares de movimiento (P1 25-oct-2026): el plan de la org nueva sale de puc_plantilla,
  -- que ya trae 14350101 (vía trg_sede_auxiliar_1435), 61350501/61350502, 37050501, 42959501, IVA 19%/5%.
  v_inv := '14350101';
  -- Costo según sector (regla del contador, decisión de Juan 22-oct): hoteles/restaurantes 61400501,
  -- el resto 61350501. Mermas: 61400502 (cocina) o 61350502.
  v_cmv := case
             when v_type in (1, 2) then '61400501'
             when v_cmv = '6135' or v_cmv is null then '61350501'
             else v_cmv end;
  v_merma := case when v_type in (1, 2) then '61400502' else '61350502' end;
  v_prod := coalesce(v_prod, '4135');
  v_serv := coalesce(v_serv, '4235');
  v_noshow := case when v_type = 2 then v_serv when v_type = 1 then v_prod else '4235' end;
  v_manifiesto := case when v_type = 6 then '2335' else '2205' end;

  insert into public.accounting_rules (
    organization_id, name, description, source_type, event_type,
    debit_account_code, credit_account_code, tax_account_code,
    use_tax_from_document, priority, is_active
  ) values
    (org_id, 'Venta a Credito', 'Facturacion de venta a credito', 'sale', 'created', '1305', v_prod, '24080501', true, 10, true),
    (org_id, 'Venta de Contado', 'Facturacion de venta al contado', 'sale', 'created', '1105', v_prod, '24080501', true, 11, true),
    (org_id, 'Cobro de Factura', 'Cobro de factura de cliente', 'sale_payment', 'paid', '1110', '1305', null, false, 20, true),
    (org_id, 'Cobro Parcial', 'Cobro parcial de factura', 'sale_payment', 'partial_paid', '1110', '1305', null, false, 21, true),
    (org_id, 'Compra a Credito', 'Compra de mercancia a credito', 'purchase', 'created', v_inv, '2205', '24081001', true, 10, true),
    (org_id, 'Compra de Contado', 'Compra de mercancia al contado', 'purchase', 'created', v_inv, '2205', '24081001', true, 11, true),
    (org_id, 'Pago a Proveedor', 'Pago a proveedor', 'purchase_payment', 'paid', '2205', '1110', null, false, 20, true),
    (org_id, 'Salida de inventario', 'Salida que no es venta: gasto contra inventario. El costo de ventas solo sale de una venta o factura.', 'inventory', 'adjusted', '519595', v_inv, null, false, 30, true),
    (org_id, 'Pago de Nomina', 'Pago de nomina (cancela pasivo)', 'payroll', 'paid', '2505', '1110', null, false, 10, true),
    (org_id, 'Nomina por Pagar', 'Provision de nomina', 'payroll', 'created', '5105', '2505', null, false, 11, true),
    (org_id, 'Seguridad Social Empleador', 'Aportes a seguridad social (patronal)', 'payroll', 'created', '5105', '2370', null, false, 12, true),
    (org_id, 'Gasto Administrativo', 'Registro de gasto administrativo', 'expense', 'created', '5105', '1110', null, false, 13, true),
    (org_id, 'Devolucion de Venta', 'Nota credito por devolucion', 'sale_credit_note', 'created', '4175', '1305', '24080501', true, 25, true),
    (org_id, 'Anulacion de Venta', 'Anulacion de factura', 'sale', 'voided', '4175', '1305', '24080501', true, 26, true),
    (org_id, 'Reembolso a Cliente', 'Reembolso de pago a cliente', 'refund', 'refunded', '4175', '1110', null, false, 27, true),
    (org_id, 'Conciliacion Bancaria', 'Ajuste por conciliacion bancaria', 'bank', 'adjusted', '1110', '4250', null, false, 28, true),
    (org_id, 'Propina', 'Registro de propina', 'tip', 'created', '5105', '1105', null, false, 30, true),
    (org_id, 'Movimiento de Caja', 'Movimiento de caja', 'cash_movement', 'created', '1105', v_prod, null, false, 30, true),
    (org_id, 'Ajuste Inventario Ganancia', 'Ajuste positivo de inventario', 'inventory_adjustment', 'gain', v_inv, '42959501', null, false, 30, true),
    (org_id, 'Ajuste Inventario Perdida', 'Faltante de inventario. El robo y el siniestro debitan 5315.', 'inventory_adjustment', 'loss', v_merma, v_inv, null, false, 31, true),
    (org_id, 'Orden de Compra Recibida', 'Recepcion de orden de compra', 'purchase_order', 'received', v_inv, '2205', '24081001', true, 30, true),
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
    (org_id, 'Inventario apertura', 'Apertura de inventario contra saldos iniciales (37050501)', 'inventory', 'opening', v_inv, '37050501', null, false, 40, true),
    (org_id, 'Inventario venta', 'Costo de la venta', 'inventory', 'sale', v_cmv, v_inv, null, false, 41, true),
    (org_id, 'Inventario devolucion', 'Devolucion al inventario', 'inventory', 'return', v_inv, v_cmv, null, false, 42, true),
    (org_id, 'Inventario compra', 'Entrada de compra', 'inventory', 'purchase', v_inv, '2205', null, false, 43, true),
    (org_id, 'Inventario faltante', 'Faltante de inventario. El robo y el siniestro debitan 5315.', 'inventory', 'loss', v_merma, v_inv, null, false, 44, true),
    (org_id, 'Inventario sobrante', 'Sobrante de inventario', 'inventory', 'gain', v_inv, '42959501', null, false, 45, true);
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
  v_nivel integer;
begin
  perform public.fn_assert_acceso_org(p_org);
  if exists (
    select 1 from public.configuracion_contable where organization_id = p_org
  ) then
    return;
  end if;

  select o.type_id into v_tipo from public.organizations o where o.id = p_org;

  -- Hoteles y restaurantes (type_id 1/2, regla del contador): plan propio de A&B, SOLO en esas orgs
  -- (no va a puc_plantilla, que es de todas): 1405/140505/14050501 insumos de cocina y
  -- 6140/614005/61400501 costo A&B, 61400502 mermas de cocina. En comercio no se crea nada.
  if v_tipo in (1, 2) then
   for v_nivel in 1..3 loop  -- por nivel: el hijo necesita al padre ya insertado
    insert into public.chart_of_accounts (
      organization_id, account_code, name, type, parent_code, is_active, activa,
      naturaleza, es_movimiento, requiere_tercero, requiere_centro_costo, centro_costo_modo,
      presentacion_niif, created_at, updated_at)
    select p_org, t.codigo, t.nombre, p.type, t.padre, true, true, p.naturaleza, t.mov,
           coalesce(p.requiere_tercero, false), p.requiere_centro_costo, p.centro_costo_modo,
           p.presentacion_niif, now(), now()
      from (values
        ('1405',     '14',     'Materias primas',              false, 1),
        ('140505',   '1405',   'Insumos de cocina',            false, 2),
        ('14050501', '140505', 'Insumos de cocina',            true,  3),
        ('6140',     '61',     'Hoteles y restaurantes',       false, 1),
        ('614005',   '6140',   'Restaurantes',                 false, 2),
        ('61400501', '614005', 'Costo de alimentos y bebidas', true,  3),
        ('61400502', '614005', 'Mermas de cocina',             true,  3)
      ) as t(codigo, padre, nombre, mov, orden)
      join public.chart_of_accounts p on p.organization_id = p_org and p.account_code = t.padre
     where t.orden = v_nivel
    on conflict (organization_id, account_code) do nothing;
   end loop;
  end if;

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
      -- Auxiliares del contador (P1 25-oct-2026), si existen y son de movimiento en la org.
      when exists (
        select 1 from public.chart_of_accounts a
        where a.organization_id = p_org and a.es_movimiento is true
          and a.account_code = case p.clave
            when 'costo_ventas' then case when v_tipo in (1, 2) then '61400501' when p.account_code = '6135' then '61350501' end
            when 'saldo_inicial' then '37050501'
            when 'faltante_inventario' then case when v_tipo in (1, 2) then '61400502' else '61350502' end
            when 'redondeo' then '42958101'
            when 'ingresos_diversos' then '42959501'
            when 'comisiones' then '53051501'
            when 'iva_generado' then '24080501'
            when 'iva_descontable' then '24081001'
          end
      ) then case p.clave
            when 'costo_ventas' then case when v_tipo in (1, 2) then '61400501' else '61350501' end
            when 'saldo_inicial' then '37050501'
            when 'faltante_inventario' then case when v_tipo in (1, 2) then '61400502' else '61350502' end
            when 'redondeo' then '42958101'
            when 'ingresos_diversos' then '42959501'
            when 'comisiones' then '53051501'
            when 'iva_generado' then '24080501'
            when 'iva_descontable' then '24081001'
          end
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

  -- Ingresos diversos: 42959501 explícito (QA 25-oct), no solo el respaldo del resolver.
  insert into public.configuracion_contable (organization_id, branch_id, clave, account_code)
  select p_org, null, 'ingresos_diversos', '42959501'
  where exists (select 1 from public.chart_of_accounts a
                 where a.organization_id = p_org and a.account_code = '42959501' and a.es_movimiento is true)
  on conflict (organization_id, branch_id, clave) do nothing;

  -- Redondeo en contra (Ajuste al peso): 53959501 (clave creada en 134020).
  insert into public.configuracion_contable (organization_id, branch_id, clave, account_code)
  select p_org, null, 'redondeo_en_contra', '53959501'
  where exists (select 1 from public.chart_of_accounts c
                where c.organization_id = p_org and c.account_code = '53959501' and c.es_movimiento is true)
  on conflict (organization_id, branch_id, clave) do nothing;

  -- Costo de ventas por sede: 6135 -> 61350501 (igual que el Bloque B), si el auxiliar existe.
  insert into public.branch_account_mappings (organization_id, branch_id, base_account_code, sub_account_code, created_at)
  select p_org, b.id, '6135', '61350501', now()
  from public.branches b
  where b.organization_id = p_org
    and exists (select 1 from public.chart_of_accounts c
                where c.organization_id = p_org and c.account_code = '61350501' and c.es_movimiento is true)
    and not exists (select 1 from public.branch_account_mappings m
                    where m.organization_id = p_org and m.branch_id = b.id and m.base_account_code = '6135');

  -- Hoteles y restaurantes: costo por sede 6140 -> 61400501.
  insert into public.branch_account_mappings (organization_id, branch_id, base_account_code, sub_account_code, created_at)
  select p_org, b.id, '6140', '61400501', now()
  from public.branches b
  where b.organization_id = p_org and v_tipo in (1, 2)
    and exists (select 1 from public.chart_of_accounts c
                where c.organization_id = p_org and c.account_code = '61400501' and c.es_movimiento is true)
    and not exists (select 1 from public.branch_account_mappings m
                    where m.organization_id = p_org and m.branch_id = b.id and m.base_account_code = '6140');
end;
$function$;
