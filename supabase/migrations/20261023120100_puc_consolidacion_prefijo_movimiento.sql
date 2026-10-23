-- Movimiento de stock, reglas y traslado reversible del PUC.
-- Solo reemplaza funciones. No recorre chart_of_accounts ni journal_lines.
-- Reversión: supabase/rollbacks/20261023120100_puc_consolidacion_prefijo_movimiento_rollback.sql

set lock_timeout = '8s';
set statement_timeout = '40s';

-- ---------------------------------------------------------------------------
-- Entradas de inventario: nunca acreditan la clase 6
-- ---------------------------------------------------------------------------

create or replace function public.fn_cuentas_movimiento_stock(
  p_organization_id integer,
  p_source text,
  p_direction text,
  out debito text,
  out credito text,
  out evento text
)
returns record
language plpgsql
stable
security definer
set search_path to public, pg_temp
as $fn$
declare
  v_inv text;
  v_cmv text;
  v_faltante text;
  v_tmp text;
  v_type integer;
begin
  perform public.fn_assert_acceso_org(p_organization_id);

  select o.type_id into v_type
  from public.organizations o
  where o.id = p_organization_id;

  select ar.credit_account_code
    into v_inv
  from public.accounting_rules ar
  where ar.organization_id = p_organization_id
    and ar.source_type = 'inventory'
    and ar.event_type = 'adjusted'
    and ar.is_active
  order by ar.priority
  limit 1;
  v_inv := coalesce(nullif(btrim(v_inv), ''), '1405');
  v_cmv := case when v_type in (1, 2) then '6140' else '6135' end;

  if exists (
    select 1
    from public.chart_of_accounts c
    where c.organization_id = p_organization_id
      and c.account_code = '519595'
      and coalesce(c.is_active, true)
      and c.es_movimiento is distinct from false
  ) then
    v_faltante := '519595';
  else
    v_faltante := '5150';
  end if;

  evento := case
    when p_source = 'initial' then 'opening'
    when p_source in ('sale', 'web_sale', 'mesa_sale', 'invoice_sale', 'web_order', 'folio_item', 'room_consumption') then 'sale'
    when p_source in ('return', 'credit_note', 'invoice_void', 'web_refund', 'credit_note_void', 'folio_item_reversal') then 'return'
    when p_source in ('purchase', 'purchase_order', 'purchase_invoice') then 'purchase'
    when p_source = 'loss' or p_direction = 'out' then 'loss'
    else 'gain'
  end;

  select ar.debit_account_code, ar.credit_account_code
    into debito, credito
  from public.accounting_rules ar
  where ar.organization_id = p_organization_id
    and ar.source_type = 'inventory'
    and ar.event_type = evento
    and ar.is_active
  order by ar.priority
  limit 1;

  if debito is null or credito is null then
    if evento = 'opening' then
      debito := v_inv;
      credito := '3105';
    elsif evento = 'sale' then
      debito := v_cmv;
      credito := v_inv;
    elsif evento = 'return' then
      debito := v_inv;
      credito := v_cmv;
    elsif evento = 'purchase' then
      debito := v_inv;
      credito := '2205';
    elsif evento = 'loss' then
      debito := v_faltante;
      credito := v_inv;
    else
      debito := v_inv;
      credito := '4250';
    end if;
  end if;

  -- La regla guarda el par de la entrada. La salida de apertura, compra o
  -- devolución usa el mismo par al revés.
  if p_direction = 'out' and evento in ('return', 'opening', 'purchase') then
    v_tmp := debito;
    debito := credito;
    credito := v_tmp;
  end if;

  -- Una entrada que no es devolución no acredita costos (clase 6).
  if p_direction = 'in' and evento is distinct from 'return' and left(credito, 1) = '6' then
    debito := v_inv;
    credito := '4250';
  end if;
end;
$fn$;

create or replace function public.fn_auto_journal_stock_movement()
returns trigger
language plpgsql
security definer
set search_path to public, pg_temp
as $fn$
declare
  v_amount numeric;
  v_unit_cost numeric;
  v_description text;
  v_product_name text;
  v_debit_account text;
  v_credit_account text;
  v_debito_base text;
  v_credito_base text;
  v_evento text;
  v_fallo text;
  v_fact_key text;
begin
  -- Compras (las contabiliza la factura) y traslados no son ajustes.
  -- La apertura sí se contabiliza: inventario contra patrimonio, no contra costos.
  if new.source in ('purchase', 'purchase_order', 'purchase_invoice', 'purchase_void',
                    'transfer', 'transfer_out', 'transfer_in') then
    return new;
  end if;

  -- Los movimientos de un documento de ajuste de ganancia o pérdida los
  -- contabiliza el documento. El ajuste masivo usa source_id 'masivo:…',
  -- que no entra en este salto.
  if new.source = 'adjustment' and new.source_id ~ '^[0-9]{1,9}$' and exists (
    select 1
      from public.inventory_adjustments ia
     where ia.id = new.source_id::integer
       and ia.organization_id = new.organization_id
       and ia.type in ('gain', 'loss')
  ) then
    return new;
  end if;

  if new.direction not in ('out', 'in') then
    return new;
  end if;

  v_unit_cost := coalesce(new.unit_cost, 0);
  if v_unit_cost = 0 then
    select sl.avg_cost
      into v_unit_cost
      from public.stock_levels sl
     where sl.product_id = new.product_id
       and sl.branch_id = new.branch_id
     limit 1;
  end if;

  v_amount := abs(new.qty) * coalesce(v_unit_cost, 0);
  if v_amount <= 0 then
    return new;
  end if;

  v_fact_key := 'stock_movement:' || new.id::text;

  if exists (
    select 1
      from public.journal_entries je
     where je.organization_id = new.organization_id
       and (
         je.fact_key = v_fact_key
         or (je.source = 'stock_movements' and je.source_id = new.id::text)
       )
  ) then
    return new;
  end if;

  select c.debito, c.credito, c.evento
    into v_debito_base, v_credito_base, v_evento
    from public.fn_cuentas_movimiento_stock(new.organization_id, new.source, new.direction) c;

  if v_debito_base is null or v_credito_base is null then
    perform public.fn_log_journal_failure(
      new.organization_id, new.branch_id, coalesce(new.created_at, now()),
      'stock_movements', new.id::text, v_fact_key, v_debito_base, v_credito_base, v_amount,
      'no_rule', 'Sin cuentas para el movimiento ' || coalesce(new.source, '') || ' ' || coalesce(new.direction, ''));
    return new;
  end if;

  select r.cuenta, r.fallo
    into v_debit_account, v_fallo
    from public.fn_cuenta_configurada_de_sede(
      new.organization_id, new.branch_id, 'stock_movements', 'debito', v_debito_base
    ) r;
  if v_fallo is not null then
    perform public.fn_log_journal_failure(
      new.organization_id, new.branch_id, coalesce(new.created_at, now()),
      'stock_movements', new.id::text, v_fact_key, v_debit_account, v_credito_base, v_amount,
      'cuenta_no_configurada', v_fallo);
    return new;
  end if;

  select r.cuenta, r.fallo
    into v_credit_account, v_fallo
    from public.fn_cuenta_configurada_de_sede(
      new.organization_id, new.branch_id, 'stock_movements', 'credito', v_credito_base
    ) r;
  if v_fallo is not null then
    perform public.fn_log_journal_failure(
      new.organization_id, new.branch_id, coalesce(new.created_at, now()),
      'stock_movements', new.id::text, v_fact_key, v_debit_account, v_credit_account, v_amount,
      'cuenta_no_configurada', v_fallo);
    return new;
  end if;

  select p.name
    into v_product_name
    from public.products p
   where p.id = new.product_id
   limit 1;

  v_description := case v_evento
    when 'opening' then 'Apertura de inventario - '
    when 'sale' then 'Costo de venta - '
    when 'return' then 'Devolución de inventario - '
    when 'loss' then 'Ajuste de inventario (pérdida) - '
    when 'purchase' then 'Compra de inventario - '
    else 'Ajuste de inventario (ganancia) - '
  end || coalesce(v_product_name, 'Prod:' || new.product_id);

  -- entrada_clase_6: una entrada distinta de la devolución no acredita costos.
  if new.direction = 'in'
     and v_evento is distinct from 'return'
     and left(coalesce(v_credit_account, ''), 1) = '6' then
    v_credit_account := coalesce(
      public.fn_primera_cuenta_detalle(new.organization_id, array['4250', '4295', '4210']),
      v_credit_account
    );
    if left(coalesce(v_credit_account, ''), 1) = '6' then
      perform public.fn_log_journal_failure(
        new.organization_id, new.branch_id, coalesce(new.created_at, now()),
        'stock_movements', new.id::text, v_fact_key, v_debit_account, v_credit_account, v_amount,
        'entrada_clase_6', 'Una entrada que no es devolución no acredita la clase 6');
      return new;
    end if;
  end if;

  begin
    perform public.fn_create_journal_entry(
      new.organization_id,
      new.branch_id,
      coalesce(new.created_at, now()),
      v_description,
      'stock_movements',
      new.id::text,
      v_debit_account,
      v_credit_account,
      v_amount,
      null::text,
      0,
      null::uuid,
      false,
      v_fact_key
    );
  exception
    when unique_violation then
      return new;
  end;

  return new;
end;
$fn$;

-- ---------------------------------------------------------------------------
-- Código nuevo: numérico 1/2/4/6/8 (o par de 10 en adelante) y prefijo existente
-- ---------------------------------------------------------------------------

create or replace function public.fn_puc_validar_cuenta()
returns trigger
language plpgsql
set search_path to public, pg_temp
as $fn$
declare
  v_largo integer;
  v_prefijo integer;
begin
  -- Un plan viejo puede tener el padre mal colgado. Renombrar o desactivar
  -- no revalida ese padre. Cambiar el padre o el código sí pasa por la regla.
  if tg_op = 'UPDATE'
     and new.account_code = old.account_code
     and new.parent_code is not distinct from old.parent_code then
    if new.account_code ~ '^[0-9]+$' and length(new.account_code) in (1, 2) then
      new.es_movimiento := false;
    elsif new.es_movimiento is true and exists (
      select 1
      from public.chart_of_accounts
      where organization_id = new.organization_id
        and parent_code = new.account_code
    ) then
      new.es_movimiento := false;
    end if;
    return new;
  end if;

  if new.account_code !~ '^[0-9]+$' or left(new.account_code, 1) !~ '^[1-9]$' then
    if tg_op = 'UPDATE' and new.account_code = old.account_code then
      if new.parent_code is not null and position(new.parent_code in new.account_code) <> 1 then
        raise exception 'padre_invalido: el código % no empieza por el padre %', new.account_code, new.parent_code;
      end if;
      return new;
    end if;
    raise exception 'codigo_puc_invalido: % no es un código del PUC', new.account_code;
  end if;

  v_largo := length(new.account_code);
  if v_largo not in (1, 2, 4, 6, 8) and not (v_largo >= 10 and v_largo % 2 = 0) then
    raise exception 'codigo_puc_invalido: % no tiene la longitud de un nivel del PUC', new.account_code;
  end if;

  if v_largo = 1 then
    if new.parent_code is not null then
      raise exception 'padre_invalido: la clase % no lleva cuenta padre', new.account_code;
    end if;
  elsif new.parent_code is not null then
    v_prefijo := case
      when v_largo = 2 then 1
      when v_largo = 4 then 2
      when v_largo = 6 then 4
      when v_largo = 8 then 6
      else v_largo - 2
    end;
    if new.parent_code is distinct from left(new.account_code, v_prefijo) then
      raise exception 'padre_invalido: el padre de % es %, no %',
        new.account_code, left(new.account_code, v_prefijo), new.parent_code;
    end if;
  end if;

  if tg_op = 'INSERT' and v_largo > 1 then
    v_prefijo := case
      when v_largo = 2 then 1
      when v_largo = 4 then 2
      when v_largo = 6 then 4
      when v_largo = 8 then 6
      else v_largo - 2
    end;
    if not exists (
      select 1
      from public.chart_of_accounts
      where organization_id = new.organization_id
        and account_code = left(new.account_code, v_prefijo)
    ) then
      raise exception 'prefijo_ausente: el prefijo % de % no existe en la organización',
        left(new.account_code, v_prefijo), new.account_code;
    end if;
  end if;

  if v_largo in (1, 2) then
    new.es_movimiento := false;
  elsif tg_op = 'INSERT' and new.es_movimiento is null then
    new.es_movimiento := true;
  end if;

  if exists (
    select 1
    from public.chart_of_accounts
    where organization_id = new.organization_id
      and parent_code = new.account_code
  ) then
    new.es_movimiento := false;
  end if;

  if tg_op = 'INSERT' and new.parent_code is not null then
    update public.chart_of_accounts
       set es_movimiento = false,
           updated_at = now()
     where organization_id = new.organization_id
       and account_code = new.parent_code
       and es_movimiento is true;
  end if;

  return new;
end;
$fn$;

-- ---------------------------------------------------------------------------
-- Reglas de una organización nueva, según el sector
-- ---------------------------------------------------------------------------

create or replace function public.fn_create_default_accounting_rules(org_id integer, country_code text)
returns void
language plpgsql
security definer
set search_path to public, pg_temp
as $fn$
declare
  v_type integer;
  v_inv text;
  v_cmv text;
  v_prod text;
  v_serv text;
  v_noshow text;
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
  -- 4140 es título: el no-show acredita el auxiliar, que suma en 4140.
  v_noshow := case when v_type = 2 then '414005' when v_type = 1 then '414015' else '4235' end;

  insert into public.accounting_rules (
    organization_id, name, description, source_type, event_type,
    debit_account_code, credit_account_code, tax_account_code,
    use_tax_from_document, priority, is_active
  ) values
    (org_id, 'Venta a Credito', 'Facturacion de venta a credito', 'sale', 'created', '1305', v_prod, '2408', true, 10, true),
    (org_id, 'Venta de Contado', 'Facturacion de venta al contado', 'sale', 'created', '1105', v_prod, '2408', true, 11, true),
    (org_id, 'Cobro de Factura', 'Cobro de factura de cliente', 'sale_payment', 'paid', '1110', '1305', null, false, 20, true),
    (org_id, 'Cobro Parcial', 'Cobro parcial de factura', 'sale_payment', 'partial_paid', '1110', '1305', null, false, 21, true),
    (org_id, 'Compra a Credito', 'Compra de mercancia a credito', 'purchase', 'created', v_inv, '2205', '2408', true, 10, true),
    (org_id, 'Compra de Contado', 'Compra de mercancia al contado', 'purchase', 'created', v_inv, '1110', '2408', true, 11, true),
    (org_id, 'Pago a Proveedor', 'Pago a proveedor', 'purchase_payment', 'paid', '2205', '1110', null, false, 20, true),
    (org_id, 'Salida de Inventario (CMV)', 'Costo de mercancia vendida', 'inventory', 'adjusted', v_cmv, v_inv, null, false, 30, true),
    (org_id, 'Pago de Nomina', 'Pago de nomina (cancela pasivo)', 'payroll', 'paid', '2505', '1110', null, false, 10, true),
    (org_id, 'Nomina por Pagar', 'Provision de nomina', 'payroll', 'created', '5105', '2505', null, false, 11, true),
    (org_id, 'Seguridad Social Empleador', 'Aportes a seguridad social (patronal)', 'payroll', 'created', '5105', '2370', null, false, 12, true),
    (org_id, 'Gasto Administrativo', 'Registro de gasto administrativo', 'expense', 'created', '5105', '1110', null, false, 13, true),
    (org_id, 'Devolucion de Venta', 'Nota credito por devolucion', 'sale_credit_note', 'created', '4175', '1305', '2408', true, 25, true),
    (org_id, 'Anulacion de Venta', 'Anulacion de factura', 'sale', 'voided', '4175', '1305', '2408', true, 26, true),
    (org_id, 'Reembolso a Cliente', 'Reembolso de pago a cliente', 'refund', 'refunded', '4175', '1110', null, false, 27, true),
    (org_id, 'Conciliacion Bancaria', 'Ajuste por conciliacion bancaria', 'bank', 'adjusted', '1110', '4250', null, false, 28, true),
    (org_id, 'Propina', 'Registro de propina', 'tip', 'created', '5105', '1105', null, false, 30, true),
    (org_id, 'Movimiento de Caja', 'Movimiento de caja', 'cash_movement', 'created', '1105', v_prod, null, false, 30, true),
    (org_id, 'Ajuste Inventario Ganancia', 'Ajuste positivo de inventario', 'inventory_adjustment', 'gain', v_inv, '4250', null, false, 30, true),
    (org_id, 'Ajuste Inventario Perdida', 'Ajuste negativo de inventario', 'inventory_adjustment', 'loss', '519595', v_inv, null, false, 31, true),
    (org_id, 'Orden de Compra Recibida', 'Recepcion de orden de compra', 'purchase_order', 'received', v_inv, '2205', '2408', true, 30, true),
    (org_id, 'Membresia', 'Ingreso por membresia', 'membership', 'created', '1105', '4250', null, false, 30, true),
    (org_id, 'Sesion Parqueadero', 'Ingreso por sesion de parqueadero', 'parking', 'closed', '1105', '4235', null, false, 30, true),
    (org_id, 'Pase Parqueadero', 'Ingreso por pase de parqueadero', 'parking_pass', 'paid', '1105', '4235', null, false, 30, true),
    (org_id, 'Prestamo Empleado', 'Desembolso de prestamo a trabajador', 'loan', 'paid', '1365', '1105', null, false, 30, true),
    (org_id, 'Cuota Prestamo', 'Abono de prestamo a trabajador', 'installment', 'paid', '1105', '1365', null, false, 30, true),
    (org_id, 'Manifiesto Despacho', 'Manifiesto de transporte', 'manifest', 'created', v_inv, '1110', null, false, 30, true),
    (org_id, 'Envio', 'Costo de envio', 'shipment', 'created', '523550', '1110', null, false, 30, true),
    (org_id, 'Viaje', 'Ingreso por viaje', 'trip', 'created', '1105', v_prod, null, false, 30, true),
    (org_id, 'Incidente Transporte', 'Gasto por incidente de transporte', 'transport_incident', 'created', '5105', '1110', null, false, 30, true),
    (org_id, 'Cargo Folio Alimentos', 'Cargo a folio por alimentos', 'folio_item', 'created', '1305', '414015', null, false, 30, true),
    (org_id, 'Cargo Folio Servicios', 'Cargo a folio por servicios', 'folio_item', 'created', '1305', '414005', null, false, 31, true),
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
    (org_id, 'Inventario faltante', 'Faltante de inventario', 'inventory', 'loss', '519595', v_inv, null, false, 44, true),
    (org_id, 'Inventario sobrante', 'Sobrante de inventario', 'inventory', 'gain', v_inv, '4250', null, false, 45, true);
end;
$fn$;

-- ---------------------------------------------------------------------------
-- Nombres, destinos y cuentas que el traslado necesita
-- ---------------------------------------------------------------------------

create or replace function public.fn_puc_nombres_oficiales()
returns table(codigo text, nombre text)
language sql
immutable
set search_path to public, pg_temp
as $fn$
  select *
  from (values
    ('11', 'Disponible'),
    ('12', 'Inversiones'),
    ('15', 'Propiedades, planta y equipo'),
    ('21', 'Obligaciones financieras'),
    ('22', 'Proveedores'),
    ('1504', 'Terrenos'),
    ('1524', 'Equipo de oficina'),
    ('2205', 'Proveedores nacionales'),
    ('2605', 'Para costos y gastos'),
    ('3205', 'Prima en colocación de acciones, cuotas o partes de interés social'),
    ('3705', 'Utilidades o excedentes acumulados'),
    ('4205', 'Otras ventas'),
    ('5205', 'Gastos de personal'),
    ('5305', 'Financieros'),
    ('5405', 'Impuesto de renta y complementarios'),
    ('5905', 'Ganancias y pérdidas'),
    ('6205', 'De mercancías')
  ) as v(codigo, nombre);
$fn$;

create or replace function public.fn_puc_destino_reclass(p_type integer, p_codigo text, p_nombre text)
returns table(destino text, motivo text)
language plpgsql
immutable
set search_path to public, pg_temp
as $fn$
declare
  v_sufijo text;
begin
  if p_codigo ~ '^1405-[0-9]{1,2}$' then
    v_sufijo := lpad(substring(p_codigo from '[0-9]+$'), 2, '0');
    destino := case when p_type = 1 then '140505' else '143505' end || v_sufijo;
    motivo := 'Inventario de sede al auxiliar de 8 dígitos';
    return next;
    return;
  end if;
  if p_codigo ~ '^6105-[0-9]{1,2}$' then
    v_sufijo := lpad(substring(p_codigo from '[0-9]+$'), 2, '0');
    destino := case when p_type in (1, 2) then '614005' else '613505' end || v_sufijo;
    motivo := 'Costo de sede al auxiliar de 8 dígitos';
    return next;
    return;
  end if;
  if p_codigo = '1405' and p_type is distinct from 1 then
    destino := '1435';
    motivo := 'Inventario de comercio a 1435';
    return next;
    return;
  end if;
  if p_codigo = '6105' then
    destino := case when p_type in (1, 2) then '6140' else '6135' end;
    motivo := 'Costo a la cuenta del sector';
    return next;
    return;
  end if;
  if p_codigo = '2105' and coalesce(p_nombre, '') ~* 'proveedor' then
    destino := '2205';
    motivo := 'Proveedores a 2205';
    return next;
    return;
  end if;
  if p_codigo = '2405' then
    if coalesce(p_nombre, '') ~* 'anticipo|a favor' then
      destino := '2805';
      motivo := 'Anticipo a 2805';
    else
      destino := '2408';
      motivo := 'Impuesto a 2408';
    end if;
    return next;
    return;
  end if;
  if p_codigo = '4705' then
    destino := '4175';
    motivo := 'Devoluciones a 4175';
    return next;
  end if;
end;
$fn$;

create or replace function public.fn_puc_asegurar_cuenta(
  p_organization_id integer,
  p_codigo text,
  p_nombre text,
  p_movimiento boolean
)
returns text
language plpgsql
security definer
set search_path to public, pg_temp
as $fn$
declare
  v_codigo text := public.fn_puc_codigo_normalizado(p_codigo);
  v_largo integer;
  v_paso integer;
  v_prefijo text;
  v_padre text;
  v_nombre text;
  v_tipo text;
  v_nat text;
  v_modo text;
  v_pres text;
  v_desc text;
  v_tercero boolean;
  v_mov boolean;
  v_padre_mov boolean;
begin
  perform public.fn_assert_acceso_org(p_organization_id);
  if v_codigo !~ '^[1-9][0-9]*$' then
    return null;
  end if;
  v_largo := length(v_codigo);
  if v_largo not in (1, 2, 4, 6, 8) and not (v_largo >= 10 and v_largo % 2 = 0) then
    return null;
  end if;

  v_paso := 1;
  while v_paso <= v_largo loop
    v_prefijo := left(v_codigo, v_paso);
    if not exists (
      select 1 from public.chart_of_accounts
      where organization_id = p_organization_id and account_code = v_prefijo
    ) then
      v_padre := case
        when v_paso = 1 then null
        when v_paso = 2 then left(v_prefijo, 1)
        when v_paso = 4 then left(v_prefijo, 2)
        when v_paso = 6 then left(v_prefijo, 4)
        when v_paso = 8 then left(v_prefijo, 6)
        else left(v_prefijo, v_paso - 2)
      end;
      if v_padre is not null and not exists (
        select 1 from public.chart_of_accounts
        where organization_id = p_organization_id and account_code = v_padre
      ) then
        return null;
      end if;

      select p.nombre, p.tipo, p.naturaleza, p.requiere_tercero, p.centro_costo_modo,
             p.presentacion_niif, p.descripcion
        into v_nombre, v_tipo, v_nat, v_tercero, v_modo, v_pres, v_desc
      from public.puc_plantilla p
      where p.codigo = v_prefijo;

      v_mov := case when v_paso = v_largo then p_movimiento else false end;
      if v_paso in (1, 2) then
        v_mov := false;
      end if;
      v_nombre := coalesce(
        v_nombre,
        case when v_prefijo = v_codigo then nullif(btrim(p_nombre), '') end,
        'Cuenta ' || v_prefijo
      );
      v_tipo := coalesce(v_tipo, (
        select c.type from public.chart_of_accounts c
        where c.organization_id = p_organization_id and c.account_code = v_padre
      ), case left(v_prefijo, 1)
        when '1' then 'asset'
        when '2' then 'liability'
        when '3' then 'equity'
        when '4' then 'income'
        when '5' then 'expense'
        when '6' then 'expense'
        when '7' then 'expense'
        else 'order'
      end);
      v_nat := coalesce(v_nat, case
        when left(v_prefijo, 2) in ('84', '86', '88') then 'credito'
        when left(v_prefijo, 2) in ('94', '96', '98') then 'debito'
        when left(v_prefijo, 1) in ('1', '5', '6', '7', '8') then 'debito'
        else 'credito'
      end);
      v_modo := coalesce(v_modo, case
        when v_mov and left(v_prefijo, 1) in ('5', '6', '7') then 'obligatorio'
        when left(v_prefijo, 1) in ('4', '5', '6', '7') then 'opcional'
        else 'no_aplica'
      end);
      v_padre_mov := v_padre is not null and exists (
        select 1 from public.chart_of_accounts c
        where c.organization_id = p_organization_id
          and c.account_code = v_padre
          and c.es_movimiento is true
      );

      -- Un grupo que ya es de movimiento sigue recibiendo asientos.
      -- El auxiliar convive: los reportes suman por prefijo.
      if v_padre_mov then
        execute 'alter table public.chart_of_accounts disable trigger trg_puc_validar_cuenta';
      end if;
      begin
        insert into public.chart_of_accounts (
          organization_id, account_code, name, type, parent_code, is_active, description,
          naturaleza, es_movimiento, requiere_tercero, requiere_centro_costo,
          centro_costo_modo, presentacion_niif
        ) values (
          p_organization_id, v_prefijo, v_nombre, v_tipo, v_padre, true, v_desc,
          v_nat, v_mov, coalesce(v_tercero, false), v_modo = 'obligatorio',
          v_modo, coalesce(v_pres, public.fn_puc_presentacion_defecto(v_prefijo))
        )
        on conflict (organization_id, account_code) do nothing;
        if v_padre_mov then
          execute 'alter table public.chart_of_accounts enable trigger trg_puc_validar_cuenta';
        end if;
      exception when others then
        if v_padre_mov then
          execute 'alter table public.chart_of_accounts enable trigger trg_puc_validar_cuenta';
        end if;
        raise;
      end;
    end if;

    if v_paso = 1 then
      v_paso := 2;
    elsif v_paso = 2 then
      v_paso := 4;
    elsif v_paso = 4 then
      v_paso := 6;
    elsif v_paso = 6 then
      v_paso := 8;
    else
      v_paso := v_paso + 2;
    end if;
  end loop;
  return v_codigo;
end;
$fn$;

create or replace function public.fn_puc_cuenta_para_asiento(
  p_organization_id integer,
  p_codigo text,
  p_nombre text
)
returns text
language plpgsql
security definer
set search_path to public, pg_temp
as $fn$
declare
  v_codigo text := public.fn_puc_codigo_normalizado(p_codigo);
  v_cuenta text;
  v_largo integer;
begin
  perform public.fn_assert_acceso_org(p_organization_id);
  if v_codigo is null then
    return null;
  end if;

  if exists (
    select 1 from public.chart_of_accounts c
    where c.organization_id = p_organization_id
      and c.account_code = v_codigo
      and coalesce(c.is_active, true)
      and c.es_movimiento is distinct from false
  ) then
    return v_codigo;
  end if;

  select c.account_code into v_cuenta
  from public.chart_of_accounts c
  where c.organization_id = p_organization_id
    and c.account_code <> v_codigo
    and public.fn_puc_codigo_normalizado(c.account_code) like v_codigo || '%'
    and coalesce(c.is_active, true)
    and c.es_movimiento is distinct from false
  order by length(public.fn_puc_codigo_normalizado(c.account_code)), c.account_code
  limit 1;
  if v_cuenta is not null then
    return v_cuenta;
  end if;

  v_largo := length(v_codigo);
  if v_largo <= 2 then
    return null;
  end if;
  perform public.fn_puc_asegurar_cuenta(p_organization_id, v_codigo, p_nombre, false);
  if v_largo = 4 then
    perform public.fn_puc_asegurar_cuenta(p_organization_id, v_codigo || '05', coalesce(p_nombre, v_codigo) || ' por sede', false);
    return public.fn_puc_asegurar_cuenta(p_organization_id, v_codigo || '0501', coalesce(p_nombre, v_codigo), true);
  end if;
  return public.fn_puc_asegurar_cuenta(p_organization_id, v_codigo || '01', coalesce(p_nombre, v_codigo), true);
end;
$fn$;

create or replace function public.fn_puc_proponer_lado(
  p_type integer,
  p_source text,
  p_event text,
  p_lado text,
  p_actual text
)
returns table(propuesto text, editada boolean, motivo text)
language plpgsql
stable
set search_path to public, pg_temp
as $fn$
declare
  v_actual text := nullif(btrim(p_actual), '');
  v_clave text;
  v_prop text;
  v_editada boolean;
begin
  if v_actual is null then
    return;
  end if;

  if p_source in ('payroll', 'payroll_period') and p_event = 'created' and p_lado = 'debito' and v_actual = '5195' then
    propuesto := '5105'; editada := false; motivo := 'El costo patronal va a 5105';
    return next; return;
  end if;
  if p_source = 'maintenance' and p_lado = 'debito' and v_actual in ('5105', '5150') then
    propuesto := '5145'; editada := false; motivo := 'El mantenimiento va a 5145';
    return next; return;
  end if;
  if p_source = 'shipment' and p_lado = 'debito' and v_actual = '5105' then
    propuesto := '523550'; editada := false; motivo := 'El envío va a 523550';
    return next; return;
  end if;
  if p_source = 'ota_commission' and p_lado = 'debito' and v_actual = '5235' then
    propuesto := '529505'; editada := false; motivo := 'La comisión del canal va a 529505';
    return next; return;
  end if;
  if p_source = 'inventory_adjustment' and p_event = 'loss' and p_lado = 'debito' and v_actual = '5150' then
    propuesto := '519595'; editada := false; motivo := 'El faltante va a 519595';
    return next; return;
  end if;
  if p_source = 'reservation' and p_event = 'confirmed' and p_lado = 'credito' and v_actual in ('4250', '2705') then
    propuesto := '2805'; editada := false; motivo := 'La reserva confirmada acredita 2805';
    return next; return;
  end if;
  if p_source = 'reservation' and p_event = 'no_show' and p_lado = 'debito' and v_actual in ('4250', '1305') then
    propuesto := '2805'; editada := false; motivo := 'El no-show debita 2805';
    return next; return;
  end if;
  if p_source = 'reservation' and p_event = 'no_show' and p_lado = 'credito' then
    v_prop := case when p_type = 2 then '414005' when p_type = 1 then '414015' else '4235' end;
    if v_actual is distinct from v_prop then
      propuesto := v_prop;
      editada := v_actual not in ('4250', '2705', '4110', '4115', '4140', '4235', '4135');
      motivo := 'El no-show acredita el ingreso del sector';
      return next;
    end if;
    return;
  end if;
  if p_source = 'folio_item' and p_lado = 'credito' and v_actual = '4110' then
    propuesto := '414015'; editada := false; motivo := 'Los alimentos del folio van a 414015';
    return next; return;
  end if;
  if p_source = 'folio_item' and p_lado = 'credito' and v_actual = '4115' then
    propuesto := '414005'; editada := false; motivo := 'El hospedaje del folio va a 414005';
    return next; return;
  end if;
  if v_actual = '4705' then
    propuesto := '4175'; editada := false; motivo := '4705 se reemplaza por 4175';
    return next; return;
  end if;

  v_clave := public.fn_clave_cuenta_configurable(p_source, p_lado, v_actual);
  if v_clave is null then
    return;
  end if;
  select s.account_code into v_prop
  from public.fn_propuesta_configuracion_sector(p_type) s
  where s.clave = v_clave;
  if v_prop is null or v_prop = v_actual then
    return;
  end if;

  v_editada := not (
    (v_clave = 'inventario' and v_actual = '1405' and p_type is distinct from 1)
    or (v_clave = 'costo_ventas' and v_actual = '6105')
    or (v_clave = 'proveedores' and v_actual = '2105' and p_lado = 'credito')
    or (v_clave in ('iva_generado', 'iva_descontable') and v_actual = '2405')
    or (v_clave = 'devoluciones' and v_actual in ('4705', '4105'))
    or (v_clave = 'ventas_productos' and v_actual = '4105')
    or (v_clave = 'ventas_productos' and v_actual = '4110' and p_type in (1, 2))
    or (v_clave = 'ventas_servicios' and v_actual = '4140' and p_type = 1)
    or (v_clave = 'ventas_servicios' and v_actual = '4115' and p_type = 2)
    or (v_clave = 'comisiones' and v_actual = '5235')
    or (
      (p_source in ('sale_credit_note', 'refund') or (p_source = 'sale' and p_event = 'voided'))
      and p_lado = 'debito'
      and v_clave = 'devoluciones'
      and v_actual in ('4105', '4135', '4705', '4110', '4140')
    )
  );

  if v_clave = 'proveedores' and v_actual = '2105' and p_lado is distinct from 'credito' then
    v_editada := true;
  end if;

  propuesto := v_prop;
  editada := v_editada;
  motivo := case when v_editada
    then 'La regla fue editada y no se cambia'
    else 'Pasa a la cuenta del sector'
  end;
  return next;
end;
$fn$;

create or replace function public.fn_puc_proponer_config(p_type integer, p_clave text, p_actual text)
returns table(propuesto text, editada boolean, motivo text)
language plpgsql
stable
set search_path to public, pg_temp
as $fn$
declare
  v_actual text := nullif(btrim(p_actual), '');
  v_prop text;
  v_legado boolean;
begin
  if v_actual is null or p_clave is null then
    return;
  end if;
  select s.account_code into v_prop
  from public.fn_propuesta_configuracion_sector(p_type) s
  where s.clave = p_clave;
  if v_prop is null or v_prop = v_actual then
    return;
  end if;
  v_legado :=
    (p_clave = 'inventario' and v_actual = '1405' and p_type is distinct from 1)
    or (p_clave = 'costo_ventas' and v_actual = '6105')
    or (p_clave = 'proveedores' and v_actual = '2105')
    or (p_clave in ('iva_generado', 'iva_descontable') and v_actual = '2405')
    or (p_clave in ('devoluciones', 'descuentos') and v_actual in ('4705', '4105'))
    or (p_clave = 'ventas_productos' and (v_actual = '4105' or (v_actual = '4110' and p_type in (1, 2))))
    or (p_clave = 'ventas_servicios' and ((v_actual = '4140' and p_type = 1) or (v_actual = '4115' and p_type = 2)))
    or (p_clave = 'comisiones' and v_actual = '5235')
    or (p_clave = 'anticipos' and v_actual in ('2705', '4250'));
  propuesto := v_prop;
  editada := not v_legado;
  motivo := case when editada
    then 'La configuración fue editada y no se cambia'
    else 'Pasa a la cuenta del sector'
  end;
  return next;
end;
$fn$;

create or replace function public.fn_puc_reclasificaciones(p_organization_id integer)
returns table(
  origen text,
  destino text,
  branch_id integer,
  debito numeric,
  credito numeric,
  neto numeric,
  motivo text
)
language plpgsql
stable
security definer
set search_path to public, pg_temp
as $fn$
declare
  v_type integer;
begin
  perform public.fn_assert_acceso_org(p_organization_id);
  select o.type_id into v_type from public.organizations o where o.id = p_organization_id;

  return query
  with cand as (
    select c.account_code, d.destino, d.motivo
    from public.chart_of_accounts c
    cross join lateral public.fn_puc_destino_reclass(v_type, c.account_code, c.name) d
    where c.organization_id = p_organization_id
      and coalesce(c.is_active, true)
      and d.destino is not null
      and d.destino <> c.account_code
  ),
  mov as (
    select
      jl.account_code,
      je.branch_id as sede,
      sum(jl.debit) as debito,
      sum(jl.credit) as credito
    from public.journal_lines jl
    join public.journal_entries je on je.id = jl.journal_entry_id
    where jl.organization_id = p_organization_id
      and je.organization_id = p_organization_id
      and je.posted is true
      and jl.account_code in (select cand.account_code from cand)
    group by jl.account_code, je.branch_id
  )
  select
    c.account_code,
    c.destino,
    m.sede,
    coalesce(m.debito, 0),
    coalesce(m.credito, 0),
    coalesce(m.debito, 0) - coalesce(m.credito, 0),
    c.motivo
  from cand c
  left join mov m on m.account_code = c.account_code
  where c.account_code ~ '-'
     or abs(coalesce(m.debito, 0) - coalesce(m.credito, 0)) >= 0.01;
end;
$fn$;

-- ---------------------------------------------------------------------------
-- Vista previa (no escribe) y aplicación reversible
-- ---------------------------------------------------------------------------

create or replace function public.fn_puc_migracion_preview(p_organization_id integer)
returns jsonb
language plpgsql
stable
security definer
set search_path to public, pg_temp
as $fn$
declare
  v_type integer;
  v_sector text;
  v_renombres jsonb;
  v_reclas jsonb;
  v_reglas jsonb;
begin
  perform public.fn_assert_acceso_org(p_organization_id);
  select o.type_id into v_type from public.organizations o where o.id = p_organization_id;
  v_sector := case v_type
    when 1 then 'Restaurante'
    when 2 then 'Hotel'
    when 4 then 'Servicios'
    when 5 then 'Gimnasio'
    when 6 then 'Transporte'
    when 7 then 'Parqueadero'
    else 'Comercio'
  end;

  select coalesce(jsonb_agg(jsonb_build_object(
    'origen', c.account_code,
    'actual', c.name,
    'propuesto', n.nombre,
    'lineas', 0
  ) order by c.account_code), '[]'::jsonb)
  into v_renombres
  from public.chart_of_accounts c
  join public.fn_puc_nombres_oficiales() n on n.codigo = c.account_code
  where c.organization_id = p_organization_id
    and c.name is distinct from n.nombre
    and not exists (
      select 1 from public.journal_lines jl
      where jl.organization_id = c.organization_id
        and jl.account_code = c.account_code
    );

  select coalesce(jsonb_agg(jsonb_build_object(
    'origen', s.origen,
    'destino', s.destino,
    'debito', s.debito,
    'credito', s.credito,
    'neto', s.neto,
    'motivo', s.motivo
  ) order by s.origen), '[]'::jsonb)
  into v_reclas
  from (
    select r.origen, r.destino,
           sum(r.debito) as debito,
           sum(r.credito) as credito,
           sum(r.neto) as neto,
           min(r.motivo) as motivo
    from public.fn_puc_reclasificaciones(p_organization_id) r
    group by r.origen, r.destino
  ) s;

  select coalesce(jsonb_agg(x.fila order by x.nombre, x.lado), '[]'::jsonb)
  into v_reglas
  from (
    select jsonb_build_object(
      'id', ar.id::text,
      'nombre', ar.name,
      'source_type', ar.source_type,
      'event_type', ar.event_type,
      'lado', q.lado,
      'actual', q.actual,
      'propuesto', q.propuesto,
      'editada', q.editada,
      'motivo', q.motivo
    ) as fila, ar.name as nombre, q.lado
    from public.accounting_rules ar
    cross join lateral (
      select 'debito' as lado, ar.debit_account_code as actual, p.propuesto, p.editada, p.motivo
      from public.fn_puc_proponer_lado(v_type, ar.source_type, ar.event_type, 'debito', ar.debit_account_code) p
      union all
      select 'credito', ar.credit_account_code, p.propuesto, p.editada, p.motivo
      from public.fn_puc_proponer_lado(v_type, ar.source_type, ar.event_type, 'credito', ar.credit_account_code) p
      union all
      select 'impuesto', ar.tax_account_code, p.propuesto, p.editada, p.motivo
      from public.fn_puc_proponer_lado(v_type, ar.source_type, ar.event_type, 'impuesto', ar.tax_account_code) p
      where ar.tax_account_code is not null
    ) q
    where ar.organization_id = p_organization_id
      and ar.is_active
    union all
    select jsonb_build_object(
      'id', cc.id::text,
      'nombre', cc.clave,
      'source_type', 'configuracion',
      'event_type', cc.clave,
      'lado', 'cuenta',
      'actual', cc.account_code,
      'propuesto', p.propuesto,
      'editada', p.editada,
      'motivo', p.motivo
    ), cc.clave, 'cuenta'
    from public.configuracion_contable cc
    cross join lateral public.fn_puc_proponer_config(v_type, cc.clave, cc.account_code) p
    where cc.organization_id = p_organization_id
  ) x;

  return jsonb_build_object(
    'organization_id', p_organization_id,
    'type_id', v_type,
    'sector', v_sector,
    'renombres', v_renombres,
    'reclasificaciones', v_reclas,
    'reglas', v_reglas
  );
end;
$fn$;

create or replace function public.fn_puc_migracion_aplicar(
  p_organization_id integer,
  p_corrida uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path to public, pg_temp
as $fn$
declare
  v_type integer;
  v_sector text;
  v_corrida uuid;
  v_previa uuid;
  v_fila record;
  v_regla record;
  v_map record;
  v_entry integer;
  v_asientos integer[] := '{}';
  v_destino text;
  v_mov text;
  v_nombre text;
  v_monto numeric;
  v_debito text;
  v_credito text;
  v_key text;
  v_base_key text;
  v_n integer;
  v_branch integer;
  v_base_nueva text;
  v_puede boolean;
  v_hay boolean;
begin
  perform public.fn_assert_acceso_org(p_organization_id);
  perform pg_advisory_xact_lock(81405001, p_organization_id);
  perform set_config('lock_timeout', '15s', true);

  select o.type_id into v_type from public.organizations o where o.id = p_organization_id;
  v_sector := case v_type
    when 1 then 'Restaurante'
    when 2 then 'Hotel'
    when 4 then 'Servicios'
    when 5 then 'Gimnasio'
    when 6 then 'Transporte'
    when 7 then 'Parqueadero'
    else 'Comercio'
  end;

  v_hay := exists (select 1 from public.fn_puc_reclasificaciones(p_organization_id))
    or exists (
      select 1
      from public.chart_of_accounts c
      join public.fn_puc_nombres_oficiales() n on n.codigo = c.account_code
      where c.organization_id = p_organization_id
        and c.name is distinct from n.nombre
        and not exists (
          select 1 from public.journal_lines jl
          where jl.organization_id = c.organization_id and jl.account_code = c.account_code
        )
    )
    or exists (
      select 1
      from public.accounting_rules ar
      cross join lateral public.fn_puc_proponer_lado(v_type, ar.source_type, ar.event_type, 'debito', ar.debit_account_code) p
      where ar.organization_id = p_organization_id and ar.is_active and p.editada is false
      union all
      select 1
      from public.accounting_rules ar
      cross join lateral public.fn_puc_proponer_lado(v_type, ar.source_type, ar.event_type, 'credito', ar.credit_account_code) p
      where ar.organization_id = p_organization_id and ar.is_active and p.editada is false
      union all
      select 1
      from public.accounting_rules ar
      cross join lateral public.fn_puc_proponer_lado(v_type, ar.source_type, ar.event_type, 'impuesto', ar.tax_account_code) p
      where ar.organization_id = p_organization_id and ar.is_active and ar.tax_account_code is not null and p.editada is false
      union all
      select 1
      from public.configuracion_contable cc
      cross join lateral public.fn_puc_proponer_config(v_type, cc.clave, cc.account_code) p
      where cc.organization_id = p_organization_id and p.editada is false
    );

  if not v_hay then
    select c.id, c.journal_entry_id, c.asientos
      into v_previa, v_entry, v_asientos
    from public.puc_migracion_corrida c
    where c.organization_id = p_organization_id
      and c.estado = 'aplicado'
    order by c.applied_at desc nulls last, c.created_at desc
    limit 1;
    if v_previa is not null then
      return jsonb_build_object(
        'corrida_id', v_previa,
        'journal_entry_id', v_entry,
        'asientos', coalesce(to_jsonb(v_asientos), '[]'::jsonb),
        'ya_aplicado', true
      );
    end if;
  end if;

  insert into public.puc_migracion_corrida (organization_id, estado, resumen)
  values (p_organization_id, 'preview', jsonb_build_object('sector', v_sector))
  returning id into v_corrida;

  for v_fila in
    select * from public.fn_puc_reclasificaciones(p_organization_id)
  loop
    select c.name into v_nombre
    from public.chart_of_accounts c
    where c.organization_id = p_organization_id and c.account_code = v_fila.origen;

    if not exists (
      select 1 from public.chart_of_accounts
      where organization_id = p_organization_id and account_code = v_fila.destino
    ) then
      insert into public.puc_migracion_mapa (
        corrida_id, organization_id, origen, destino, accion, motivo, sector
      ) values (
        v_corrida, p_organization_id, v_fila.origen, v_fila.destino, 'crear', v_fila.motivo, v_sector
      );
    end if;
    v_destino := public.fn_puc_asegurar_cuenta(p_organization_id, v_fila.destino, v_nombre, true);
    if v_destino is null then
      raise exception 'prefijo_ausente: no se pudo abrir %', v_fila.destino;
    end if;

    v_mov := public.fn_puc_cuenta_para_asiento(p_organization_id, v_fila.destino, v_nombre);
    if v_mov is null or v_mov = v_fila.origen then
      raise exception 'cuenta_no_es_de_movimiento: %', v_fila.destino;
    end if;

    if abs(v_fila.neto) >= 0.01 then
      v_branch := v_fila.branch_id;
      if v_branch is null then
        select min(b.id) into v_branch
        from public.branches b
        where b.organization_id = p_organization_id;
      end if;
      if v_branch is null then
        raise exception 'sin_sede: la organización % no tiene sede para el traslado', p_organization_id;
      end if;

      v_base_key := 'puc_migracion:' || p_organization_id || ':' || v_branch || ':' || v_fila.origen;
      if exists (
        select 1
        from public.journal_entries je
        where je.organization_id = p_organization_id
          and je.fact_key = v_base_key
          and not exists (
            select 1 from public.journal_entries rev
            where rev.organization_id = p_organization_id
              and rev.fact_key = 'reversal:' || je.id
          )
      ) then
        raise exception 'puc_migracion_duplicada: % ya tiene traslado sin revertir', v_fila.origen;
      end if;
      v_key := v_base_key;
      v_n := 0;
      while exists (
        select 1 from public.journal_entries je
        where je.organization_id = p_organization_id and je.fact_key = v_key
      ) loop
        v_n := v_n + 1;
        v_key := v_base_key || ':r' || v_n;
        if v_n > 20 then
          raise exception 'puc_migracion_fact_key: %', v_fila.origen;
        end if;
      end loop;

      v_monto := abs(v_fila.neto);
      if v_fila.neto > 0 then
        v_debito := v_mov;
        v_credito := v_fila.origen;
      else
        v_debito := v_fila.origen;
        v_credito := v_mov;
      end if;

      v_entry := public.fn_create_journal_entry(
        p_organization_id := p_organization_id,
        p_branch_id := v_branch,
        p_entry_date := now(),
        p_memo := 'Traslado PUC ' || v_fila.origen || ' a ' || v_mov,
        p_source := 'puc_migracion',
        p_source_id := v_corrida::text,
        p_debit_account := v_debito,
        p_credit_account := v_credito,
        p_amount := v_monto,
        p_fact_key := v_key,
        p_cost_center_id := public.fn_centro_defecto(p_organization_id, v_branch)
      );
      if v_entry is null then
        raise exception 'puc_migracion_asiento: no se pudo contabilizar % hacia %', v_fila.origen, v_mov;
      end if;
      if v_entry <> all (v_asientos) then
        v_asientos := v_asientos || v_entry;
      end if;
      insert into public.puc_migracion_mapa (
        corrida_id, organization_id, origen, destino, accion, motivo, sector, detalle
      ) values (
        v_corrida, p_organization_id, v_fila.origen, v_mov, 'reclasificar', v_fila.motivo, v_sector,
        jsonb_build_object('branch_id', v_branch, 'neto', v_fila.neto, 'asiento', v_entry)
      );
    end if;

    update public.chart_of_accounts
      set is_active = false, updated_at = now()
    where organization_id = p_organization_id
      and account_code = v_fila.origen
      and coalesce(is_active, true);
    if found then
      insert into public.puc_migracion_mapa (
        corrida_id, organization_id, origen, destino, accion, motivo, sector
      ) values (
        v_corrida, p_organization_id, v_fila.origen, v_mov, 'inactivar', v_fila.motivo, v_sector
      );
    end if;

    for v_map in
      select m.id, m.branch_id, m.base_account_code, m.sub_account_code, m.legacy_code
      from public.branch_account_mappings m
      where m.organization_id = p_organization_id
        and m.sub_account_code = v_fila.origen
    loop
      v_base_nueva := left(v_mov, 4);
      v_puede := not exists (
        select 1 from public.branch_account_mappings o
        where o.organization_id = p_organization_id
          and o.branch_id = v_map.branch_id
          and o.base_account_code = v_base_nueva
          and o.id <> v_map.id
      );
      update public.branch_account_mappings
        set legacy_code = coalesce(legacy_code, sub_account_code),
            sub_account_code = v_mov,
            base_account_code = case when v_puede then v_base_nueva else base_account_code end
      where id = v_map.id;
      insert into public.puc_migracion_mapa (
        corrida_id, organization_id, origen, destino, accion, motivo, sector, detalle
      ) values (
        v_corrida, p_organization_id, v_fila.origen, v_mov, 'mapeo', v_fila.motivo, v_sector,
        jsonb_build_object(
          'id', v_map.id,
          'insertado', false,
          'base_anterior', v_map.base_account_code,
          'sub_anterior', v_map.sub_account_code,
          'legacy_anterior', v_map.legacy_code,
          'base_nuevo', case when v_puede then v_base_nueva else v_map.base_account_code end,
          'sub_nuevo', v_mov
        )
      );
    end loop;
  end loop;

  for v_regla in
    select q.*
    from (
      select ar.id::text as rid, 'accounting_rules'::text as tabla, 'debito'::text as lado,
             ar.debit_account_code as actual, p.propuesto, p.editada, p.motivo, ar.name as nombre
      from public.accounting_rules ar
      cross join lateral public.fn_puc_proponer_lado(v_type, ar.source_type, ar.event_type, 'debito', ar.debit_account_code) p
      where ar.organization_id = p_organization_id and ar.is_active
      union all
      select ar.id::text, 'accounting_rules', 'credito',
             ar.credit_account_code, p.propuesto, p.editada, p.motivo, ar.name
      from public.accounting_rules ar
      cross join lateral public.fn_puc_proponer_lado(v_type, ar.source_type, ar.event_type, 'credito', ar.credit_account_code) p
      where ar.organization_id = p_organization_id and ar.is_active
      union all
      select ar.id::text, 'accounting_rules', 'impuesto',
             ar.tax_account_code, p.propuesto, p.editada, p.motivo, ar.name
      from public.accounting_rules ar
      cross join lateral public.fn_puc_proponer_lado(v_type, ar.source_type, ar.event_type, 'impuesto', ar.tax_account_code) p
      where ar.organization_id = p_organization_id and ar.is_active and ar.tax_account_code is not null
      union all
      select cc.id::text, 'configuracion_contable', 'cuenta',
             cc.account_code, p.propuesto, p.editada, p.motivo, cc.clave
      from public.configuracion_contable cc
      cross join lateral public.fn_puc_proponer_config(v_type, cc.clave, cc.account_code) p
      where cc.organization_id = p_organization_id
    ) q
    where q.editada is false
      and q.propuesto is not null
      and q.propuesto is distinct from q.actual
  loop
    if public.fn_puc_asegurar_cuenta(p_organization_id, v_regla.propuesto, v_regla.nombre, true) is null then
      continue;
    end if;
    if v_regla.tabla = 'accounting_rules' and v_regla.lado = 'debito' then
      update public.accounting_rules
        set debit_account_code = v_regla.propuesto, updated_at = now()
      where id = v_regla.rid::uuid
        and organization_id = p_organization_id
        and debit_account_code = v_regla.actual;
    elsif v_regla.tabla = 'accounting_rules' and v_regla.lado = 'credito' then
      update public.accounting_rules
        set credit_account_code = v_regla.propuesto, updated_at = now()
      where id = v_regla.rid::uuid
        and organization_id = p_organization_id
        and credit_account_code = v_regla.actual;
    elsif v_regla.tabla = 'accounting_rules' and v_regla.lado = 'impuesto' then
      update public.accounting_rules
        set tax_account_code = v_regla.propuesto, updated_at = now()
      where id = v_regla.rid::uuid
        and organization_id = p_organization_id
        and tax_account_code = v_regla.actual;
    else
      update public.configuracion_contable
        set account_code = v_regla.propuesto, updated_at = now()
      where id = v_regla.rid::bigint
        and organization_id = p_organization_id
        and account_code = v_regla.actual;
    end if;
    if found then
      insert into public.puc_migracion_mapa (
        corrida_id, organization_id, origen, destino, accion, motivo, sector, detalle
      ) values (
        v_corrida, p_organization_id, v_regla.actual, v_regla.propuesto, 'regla', v_regla.motivo, v_sector,
        jsonb_build_object(
          'tabla', v_regla.tabla, 'id', v_regla.rid, 'lado', v_regla.lado,
          'anterior', v_regla.actual, 'nuevo', v_regla.propuesto
        )
      );
    end if;
  end loop;

  for v_fila in
    select c.account_code as origen, c.name as actual, n.nombre as propuesto
    from public.chart_of_accounts c
    join public.fn_puc_nombres_oficiales() n on n.codigo = c.account_code
    where c.organization_id = p_organization_id
      and c.name is distinct from n.nombre
      and not exists (
        select 1 from public.journal_lines jl
        where jl.organization_id = c.organization_id and jl.account_code = c.account_code
      )
  loop
    update public.chart_of_accounts
      set name = v_fila.propuesto, updated_at = now()
    where organization_id = p_organization_id
      and account_code = v_fila.origen
      and name = v_fila.actual
      and not exists (
        select 1 from public.journal_lines jl
        where jl.organization_id = p_organization_id and jl.account_code = v_fila.origen
      );
    if found then
      insert into public.puc_migracion_mapa (
        corrida_id, organization_id, origen, destino, accion, motivo, sector, detalle
      ) values (
        v_corrida, p_organization_id, v_fila.origen, v_fila.origen, 'renombrar', 'Nombre del decreto', v_sector,
        jsonb_build_object('anterior', v_fila.actual, 'nuevo', v_fila.propuesto)
      );
    end if;
  end loop;

  update public.puc_migracion_corrida
    set estado = 'aplicado',
        applied_at = now(),
        journal_entry_id = v_asientos[1],
        asientos = v_asientos,
        resumen = jsonb_build_object(
          'sector', v_sector,
          'asientos', coalesce(array_length(v_asientos, 1), 0)
        )
  where id = v_corrida;

  return jsonb_build_object(
    'corrida_id', v_corrida,
    'journal_entry_id', v_asientos[1],
    'asientos', coalesce(to_jsonb(v_asientos), '[]'::jsonb),
    'ya_aplicado', false
  );
end;
$fn$;

create or replace function public.fn_puc_migracion_revertir(p_organization_id integer)
returns jsonb
language plpgsql
security definer
set search_path to public, pg_temp
as $fn$
declare
  v_corrida uuid;
  v_asiento integer;
  v_rev integer;
  v_lote text;
  v_revs integer[] := '{}';
  v_mapa record;
begin
  perform public.fn_assert_acceso_org(p_organization_id);
  perform pg_advisory_xact_lock(81405001, p_organization_id);

  select c.id, 'puc_migracion:' || c.id::text
    into v_corrida, v_lote
  from public.puc_migracion_corrida c
  where c.organization_id = p_organization_id
    and c.estado = 'aplicado'
  order by c.applied_at desc nulls last, c.created_at desc
  limit 1;

  if v_corrida is null then
    raise exception 'no_hay_corrida: no hay un traslado aplicado en la organización %', p_organization_id;
  end if;

  for v_asiento in
    select unnest(c.asientos)
    from public.puc_migracion_corrida c
    where c.id = v_corrida
  loop
    if exists (
      select 1 from public.journal_entries je
      where je.organization_id = p_organization_id
        and je.fact_key = 'reversal:' || v_asiento
    ) then
      continue;
    end if;
    v_rev := public.fn_revertir_asiento(v_asiento, 'puc_migracion', v_lote);
    insert into public.journal_reversals (
      organization_id, lote, categoria, original_entry_id, reversal_entry_id
    ) values (
      p_organization_id, v_lote, 'puc_migracion', v_asiento, v_rev
    );
    v_revs := v_revs || v_rev;
  end loop;

  for v_mapa in
    select *
    from public.puc_migracion_mapa
    where corrida_id = v_corrida
    order by id desc
  loop
    if v_mapa.accion = 'regla' then
      if v_mapa.detalle->>'tabla' = 'accounting_rules' and v_mapa.detalle->>'lado' = 'debito' then
        update public.accounting_rules
          set debit_account_code = v_mapa.detalle->>'anterior', updated_at = now()
        where id = (v_mapa.detalle->>'id')::uuid
          and organization_id = p_organization_id
          and debit_account_code = v_mapa.detalle->>'nuevo';
      elsif v_mapa.detalle->>'tabla' = 'accounting_rules' and v_mapa.detalle->>'lado' = 'credito' then
        update public.accounting_rules
          set credit_account_code = v_mapa.detalle->>'anterior', updated_at = now()
        where id = (v_mapa.detalle->>'id')::uuid
          and organization_id = p_organization_id
          and credit_account_code = v_mapa.detalle->>'nuevo';
      elsif v_mapa.detalle->>'tabla' = 'accounting_rules' and v_mapa.detalle->>'lado' = 'impuesto' then
        update public.accounting_rules
          set tax_account_code = v_mapa.detalle->>'anterior', updated_at = now()
        where id = (v_mapa.detalle->>'id')::uuid
          and organization_id = p_organization_id
          and tax_account_code = v_mapa.detalle->>'nuevo';
      elsif v_mapa.detalle->>'tabla' = 'configuracion_contable' then
        update public.configuracion_contable
          set account_code = v_mapa.detalle->>'anterior', updated_at = now()
        where id = (v_mapa.detalle->>'id')::bigint
          and organization_id = p_organization_id
          and account_code = v_mapa.detalle->>'nuevo';
      end if;
    elsif v_mapa.accion = 'mapeo' then
      if coalesce((v_mapa.detalle->>'insertado')::boolean, false) then
        delete from public.branch_account_mappings
        where id = (v_mapa.detalle->>'id')::uuid
          and organization_id = p_organization_id
          and sub_account_code = v_mapa.detalle->>'sub_nuevo';
      else
        update public.branch_account_mappings
          set base_account_code = v_mapa.detalle->>'base_anterior',
              sub_account_code = v_mapa.detalle->>'sub_anterior',
              legacy_code = v_mapa.detalle->>'legacy_anterior'
        where id = (v_mapa.detalle->>'id')::uuid
          and organization_id = p_organization_id
          and sub_account_code = v_mapa.detalle->>'sub_nuevo';
      end if;
    elsif v_mapa.accion = 'inactivar' then
      update public.chart_of_accounts
        set is_active = true, updated_at = now()
      where organization_id = p_organization_id
        and account_code = v_mapa.origen
        and is_active is false;
    elsif v_mapa.accion = 'renombrar' then
      update public.chart_of_accounts
        set name = v_mapa.detalle->>'anterior', updated_at = now()
      where organization_id = p_organization_id
        and account_code = v_mapa.origen
        and name = v_mapa.detalle->>'nuevo';
    end if;
  end loop;

  update public.puc_migracion_corrida
    set estado = 'revertido', reverted_at = now()
  where id = v_corrida;

  return jsonb_build_object(
    'corrida_id', v_corrida,
    'reversos', coalesce(to_jsonb(v_revs), '[]'::jsonb)
  );
end;
$fn$;

comment on function public.fn_puc_migracion_preview(integer) is
  'Vista previa del traslado de PUC. No inserta, no actualiza y no borra.';
comment on function public.fn_puc_migracion_aplicar(integer, uuid) is
  'Crea el asiento de traslado, inactiva los orígenes y es idempotente. El periodo de la fecha de hoy tiene que estar abierto.';
comment on function public.fn_puc_migracion_revertir(integer) is
  'Contra-asiento de la última corrida aplicada y restaura reglas, mapeos y cuentas. No borra auxiliares creados.';

revoke all on function public.fn_cuentas_movimiento_stock(integer, text, text) from public, anon;
revoke all on function public.fn_auto_journal_stock_movement() from public, anon;
revoke all on function public.fn_puc_validar_cuenta() from public, anon;
revoke all on function public.fn_create_default_accounting_rules(integer, text) from public, anon;
revoke all on function public.fn_asiento_movimiento_caja(integer, text, text) from public, anon;
revoke all on function public.fn_auto_journal_bank() from public, anon;
revoke all on function public.fn_traslado_int_asiento(integer, integer, text, integer, integer, numeric, text) from public, anon;
revoke all on function public.fn_puc_nombres_oficiales() from public, anon, authenticated;
revoke all on function public.fn_puc_destino_reclass(integer, text, text) from public, anon, authenticated;
revoke all on function public.fn_puc_asegurar_cuenta(integer, text, text, boolean) from public, anon, authenticated;
revoke all on function public.fn_puc_cuenta_para_asiento(integer, text, text) from public, anon, authenticated;
revoke all on function public.fn_puc_proponer_lado(integer, text, text, text, text) from public, anon, authenticated;
revoke all on function public.fn_puc_proponer_config(integer, text, text) from public, anon, authenticated;
revoke all on function public.fn_puc_reclasificaciones(integer) from public, anon, authenticated;
revoke all on function public.fn_puc_migracion_preview(integer) from public, anon;
revoke all on function public.fn_puc_migracion_aplicar(integer, uuid) from public, anon;
revoke all on function public.fn_puc_migracion_revertir(integer) from public, anon;

grant execute on function public.fn_cuentas_movimiento_stock(integer, text, text) to service_role;
grant execute on function public.fn_auto_journal_stock_movement() to service_role;
grant execute on function public.fn_auto_journal_bank() to authenticated, service_role;
grant execute on function public.fn_create_default_accounting_rules(integer, text) to authenticated, service_role;
grant execute on function public.fn_asiento_movimiento_caja(integer, text, text) to authenticated, service_role;
grant execute on function public.fn_traslado_int_asiento(integer, integer, text, integer, integer, numeric, text) to service_role;
grant execute on function public.fn_puc_asegurar_cuenta(integer, text, text, boolean) to service_role;
grant execute on function public.fn_puc_cuenta_para_asiento(integer, text, text) to service_role;
grant execute on function public.fn_puc_reclasificaciones(integer) to service_role;
grant execute on function public.fn_puc_migracion_preview(integer) to authenticated, service_role;
grant execute on function public.fn_puc_migracion_aplicar(integer, uuid) to authenticated, service_role;
grant execute on function public.fn_puc_migracion_revertir(integer) to authenticated, service_role;

revoke all on table public.puc_migracion_corrida from authenticated;
revoke all on table public.puc_migracion_mapa from authenticated;
grant select on table public.puc_migracion_corrida to authenticated, service_role;
grant select on table public.puc_migracion_mapa to authenticated, service_role;
