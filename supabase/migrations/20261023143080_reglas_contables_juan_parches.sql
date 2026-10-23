-- Parches del motivo, reglas de una organización nueva y el comprobante de reclasificación.
-- Sigue a 20261023143050_reglas_contables_juan_asientos.sql.
-- No publica borradores. Reversión: supabase/rollbacks/20261023143080_reglas_contables_juan_parches_rollback.sql

set lock_timeout = '8s';
set statement_timeout = '40s';

-- ---------------------------------------------------------------------------
-- El borrador del ajuste guarda el motivo. La salida de stock lo manda.
-- ---------------------------------------------------------------------------

do $patch$
declare
  v_def text := pg_get_functiondef('public.fn_ajuste_guardar(integer, jsonb)'::regprocedure);
begin
  if position('motivo_ajuste' in v_def) = 0 then
    v_def := replace(
      v_def,
      'v_nota text := nullif(btrim(p_ajuste->>''notes''), '''');',
      'v_nota text := nullif(btrim(p_ajuste->>''notes''), '''');' || chr(10) || '  v_motivo_ajuste text := nullif(lower(btrim(p_ajuste->>''motivo_ajuste'')), '''');'
    );
    v_def := replace(
      v_def,
      'if v_razon is null or length(v_razon) > 60 then',
      'if v_motivo_ajuste is not null and v_motivo_ajuste not in (''robo'', ''siniestro'') then' || chr(10) || '    raise exception ''motivo_ajuste_invalido'' using errcode = ''22023'';' || chr(10) || '  end if;' || chr(10) || '  if v_razon is null or length(v_razon) > 60 then'
    );
    v_def := replace(
      v_def,
      'set branch_id = v_branch, mode = v_modo, reason = v_razon, notes = v_nota,',
      'set branch_id = v_branch, mode = v_modo, reason = v_razon, notes = v_nota, motivo_ajuste = v_motivo_ajuste,'
    );
    v_def := replace(
      v_def,
      'insert into public.inventory_adjustments (organization_id, branch_id, type, reason, status, created_by, notes, mode, counted_at)',
      'insert into public.inventory_adjustments (organization_id, branch_id, type, reason, status, created_by, notes, mode, counted_at, motivo_ajuste)'
    );
    v_def := replace(
      v_def,
      'v_nota, v_modo, v_contado)',
      'v_nota, v_modo, v_contado, v_motivo_ajuste)'
    );
    if position('motivo_ajuste' in v_def) = 0 then
      raise exception 'no se pudo injertar motivo_ajuste en fn_ajuste_guardar';
    end if;
    execute v_def;
  end if;
end
$patch$;

do $patch$
declare
  v_def text := pg_get_functiondef('public.fn_stock_registrar_movimiento(integer, integer, integer, integer, text, numeric, numeric, text, text)'::regprocedure);
begin
  if position('motivo_ajuste' in v_def) = 0 then
    v_def := replace(
      v_def,
      '''reason'', v_motivo,',
      '''reason'', v_motivo,' || chr(10) || '    ''motivo_ajuste'', case when v_motivo in (''robo'', ''siniestro'') then v_motivo when v_motivo = ''theft'' then ''robo'' end,'
    );
    if position('motivo_ajuste' in v_def) = 0 then
      raise exception 'no se pudo injertar motivo_ajuste en fn_stock_registrar_movimiento';
    end if;
    execute v_def;
  end if;
end
$patch$;

do $patch$
declare
  v_def text := pg_get_functiondef('public.fn_ajuste_detalle(integer, integer)'::regprocedure);
begin
  if position('motivo_ajuste' in v_def) = 0 then
    v_def := replace(
      v_def,
      '''razon'', v_aj.reason,',
      '''razon'', v_aj.reason,' || chr(10) || '      ''motivo_ajuste'', v_aj.motivo_ajuste,'
    );
    if position('motivo_ajuste' in v_def) = 0 then
      raise exception 'no se pudo injertar motivo_ajuste en fn_ajuste_detalle';
    end if;
    execute v_def;
  end if;
end
$patch$;

-- ---------------------------------------------------------------------------
-- Organización nueva: el manifiesto no acredita bancos y la salida no es CMV
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
  v_noshow := case when v_type = 2 then '414005' when v_type = 1 then '414015' else '4235' end;
  v_manifiesto := case when v_type = 6 then '2335' else '2205' end;

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
    (org_id, 'Salida de inventario', 'Salida que no es venta: gasto contra inventario. El costo de ventas solo sale de una venta o factura.', 'inventory', 'adjusted', '519595', v_inv, null, false, 30, true),
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
    (org_id, 'Ajuste Inventario Perdida', 'Faltante de inventario. El robo y el siniestro debitan 5315.', 'inventory_adjustment', 'loss', '519595', v_inv, null, false, 31, true),
    (org_id, 'Orden de Compra Recibida', 'Recepcion de orden de compra', 'purchase_order', 'received', v_inv, '2205', '2408', true, 30, true),
    (org_id, 'Membresia', 'Ingreso por membresia', 'membership', 'created', '1105', '4250', null, false, 30, true),
    (org_id, 'Sesion Parqueadero', 'Ingreso por sesion de parqueadero', 'parking', 'closed', '1105', '4235', null, false, 30, true),
    (org_id, 'Pase Parqueadero', 'Ingreso por pase de parqueadero', 'parking_pass', 'paid', '1105', '4235', null, false, 30, true),
    (org_id, 'Prestamo Empleado', 'Desembolso de prestamo a trabajador', 'loan', 'paid', '1365', '1105', null, false, 30, true),
    (org_id, 'Cuota Prestamo', 'Abono de prestamo a trabajador', 'installment', 'paid', '1105', '1365', null, false, 30, true),
    (org_id, 'Manifiesto Despacho', 'Inventario contra proveedores, o contra costos por pagar si la organización es de transporte. La caja solo si es de contado.', 'manifest', 'created', v_inv, v_manifiesto, null, false, 30, true),
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
    (org_id, 'Inventario faltante', 'Faltante de inventario. El robo y el siniestro debitan 5315.', 'inventory', 'loss', '519595', v_inv, null, false, 44, true),
    (org_id, 'Inventario sobrante', 'Sobrante de inventario', 'inventory', 'gain', v_inv, '4250', null, false, 45, true);
end;
$fn$;

revoke all on function public.fn_create_default_accounting_rules(integer, text) from public, anon;
grant execute on function public.fn_create_default_accounting_rules(integer, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Un borrador por organización. No toca asientos publicados.
-- La venta que debitó la clase 6 se queda: eso sí es costo de ventas.
-- La entrada que acreditó la clase 6 tampoco entra: es otra corrección.
-- Si la misma salida generó el asiento del movimiento (clase 6) y el del
-- ajuste (5150), los dos se reclasifican: el resultado no cambia de monto,
-- solo de cuenta. Los borradores los crea la migración siguiente.
-- ---------------------------------------------------------------------------

create or replace function public.fn_regla_contable_reclasificar()
returns jsonb
language plpgsql
security definer
set search_path to public, pg_temp
as $fn$
declare
  v_org record;
  v_fila record;
  v_tz text;
  v_fecha timestamptz;
  v_branch integer;
  v_entry integer;
  v_key text;
  v_debito numeric;
  v_credito numeric;
  v_monto numeric;
  v_con integer := 0;
  v_vacios integer := 0;
  v_fallos integer := 0;
begin
  create temporary table if not exists _regla_reclass (
    organization_id integer,
    destino text,
    origen text,
    monto numeric
  ) on commit drop;
  truncate _regla_reclass;

  insert into _regla_reclass (organization_id, destino, origen, monto)
  select je.organization_id, '519595', jl.account_code, round(sum(jl.debit), 2)
  from public.journal_entries je
  join public.journal_lines jl on jl.journal_entry_id = je.id
  join public.stock_movements sm
    on je.source = 'stock_movements'
   and je.source_id = sm.id::text
   and sm.organization_id = je.organization_id
  join public.regla_contable_aviso a on a.organization_id = je.organization_id
  where je.posted is true
    and sm.source = 'adjustment'
    and sm.direction = 'out'
    and jl.debit > 0
    and left(jl.account_code, 1) = '6'
  group by je.organization_id, jl.account_code
  having round(sum(jl.debit), 2) >= 0.01;

  insert into _regla_reclass (organization_id, destino, origen, monto)
  select je.organization_id,
         case
           when lower(coalesce(ia.motivo_ajuste, '')) in ('robo', 'siniestro')
             or lower(coalesce(ia.reason, '')) in ('robo', 'siniestro', 'theft')
           then '5315'
           else '519595'
         end,
         jl.account_code,
         round(sum(jl.debit), 2)
  from public.journal_entries je
  join public.journal_lines jl on jl.journal_entry_id = je.id
  left join public.inventory_adjustments ia
    on je.source = 'inventory_adjustment'
   and je.source_id = ia.id::text
   and ia.organization_id = je.organization_id
  join public.regla_contable_aviso a on a.organization_id = je.organization_id
  where je.posted is true
    and je.source = 'inventory_adjustment'
    and jl.debit > 0
    and (left(jl.account_code, 4) = '5150' or left(jl.account_code, 1) = '6')
  group by 1, 2, 3
  having round(sum(jl.debit), 2) >= 0.01;

  for v_org in
    select organization_id from public.regla_contable_aviso order by organization_id
  loop
    begin
      v_key := 'regla_contable:' || v_org.organization_id::text;
      select je.id into v_entry
      from public.journal_entries je
      where je.organization_id = v_org.organization_id
        and je.fact_key = v_key
      limit 1;

      if v_entry is null then
        select coalesce(nullif(btrim(o.timezone), ''), 'America/Bogota')
          into v_tz
        from public.organizations o
        where o.id = v_org.organization_id;

        v_fecha := date_trunc('month', now() at time zone v_tz) at time zone v_tz;

        select b.id into v_branch
        from public.branches b
        where b.organization_id = v_org.organization_id
          and b.is_main is true
          and b.is_active is true
        order by b.id
        limit 1;
        if v_branch is null then
          select min(b.id) into v_branch
          from public.branches b
          where b.organization_id = v_org.organization_id;
        end if;
        if v_branch is null then
          update public.regla_contable_aviso
             set nota = 'sin_sucursal'
           where organization_id = v_org.organization_id;
          v_fallos := v_fallos + 1;
          continue;
        end if;

        insert into public.journal_entries (
          organization_id, branch_id, entry_date, memo, source, source_id, posted, fact_key
        ) values (
          v_org.organization_id, v_branch, v_fecha,
          'Reclasificación por corrección de regla contable',
          'manual', v_org.organization_id::text, false, v_key
        )
        returning id into v_entry;

        for v_fila in
          select destino, round(sum(monto), 2) as monto
          from _regla_reclass
          where organization_id = v_org.organization_id
          group by destino
          having round(sum(monto), 2) >= 0.01
        loop
          insert into public.journal_lines (journal_entry_id, account_code, description, debit, credit, organization_id)
          values (
            v_entry, v_fila.destino,
            'Reclasificación por corrección de regla contable',
            v_fila.monto, 0, v_org.organization_id
          );
        end loop;

        for v_fila in
          select origen, round(sum(monto), 2) as monto
          from _regla_reclass
          where organization_id = v_org.organization_id
          group by origen
          having round(sum(monto), 2) >= 0.01
        loop
          insert into public.journal_lines (journal_entry_id, account_code, description, debit, credit, organization_id)
          values (
            v_entry, v_fila.origen,
            'Reclasificación por corrección de regla contable',
            0, v_fila.monto, v_org.organization_id
          );
        end loop;
      end if;

      select coalesce(sum(debit), 0), coalesce(sum(credit), 0)
        into v_debito, v_credito
      from public.journal_lines
      where journal_entry_id = v_entry;

      if round(v_debito, 2) <> round(v_credito, 2) then
        raise exception 'descuadre % / %', v_debito, v_credito;
      end if;

      v_monto := round(v_debito, 2);
      update public.regla_contable_aviso
         set journal_entry_id = v_entry,
             monto = v_monto,
             nota = case when v_monto = 0 then 'sin_movimiento' else null end
       where organization_id = v_org.organization_id;

      if v_monto = 0 then
        v_vacios := v_vacios + 1;
      else
        v_con := v_con + 1;
      end if;
    exception when others then
      v_fallos := v_fallos + 1;
      update public.regla_contable_aviso
         set nota = left(sqlerrm, 200)
       where organization_id = v_org.organization_id;
    end;
  end loop;

  return jsonb_build_object(
    'orgs', (select count(*) from public.regla_contable_aviso),
    'con_monto', v_con,
    'sin_movimiento', v_vacios,
    'fallos', v_fallos,
    'monto', (select coalesce(sum(monto), 0) from public.regla_contable_aviso)
  );
end;
$fn$;

revoke all on function public.fn_regla_contable_reclasificar() from public, anon, authenticated;
grant execute on function public.fn_regla_contable_reclasificar() to service_role;
