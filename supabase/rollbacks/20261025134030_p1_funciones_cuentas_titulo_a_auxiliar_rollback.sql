-- Rollback de 20261025134030: restaura las 18 funciones a su versión viva al 25-oct-2026 y quita el resolver.

-- fn_asiento_movimiento_caja
CREATE OR REPLACE FUNCTION public.fn_asiento_movimiento_caja(p_organization_id integer, p_tipo text, p_concept_code text)
 RETURNS TABLE(accion text, debito text, credito text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_tipo text := case when p_tipo in ('in', 'deposit', 'income') then 'in' else 'out' end;
  v_clave text := coalesce(p_concept_code, '');
  v_caja text;
  v_contra text;
begin
  perform public.fn_assert_acceso_org(p_organization_id);
  if v_clave = 'cambioEfectivo' then
    accion := 'omitir';
    debito := null;
    credito := null;
    return next;
    return;
  end if;

  v_caja := public.fn_cuenta_caja_existente(p_organization_id, null, null);

  if v_tipo = 'out' then
    v_contra := case v_clave
      when 'pagoProveedor' then coalesce(
        public.fn_cuenta_por_clave(p_organization_id, null, 'proveedores'),
        public.fn_primera_cuenta_detalle(p_organization_id, array['2205', '2105']))
      when 'prestamoEmpleado' then public.fn_primera_cuenta_detalle(p_organization_id, array['1365'])
      when 'retiroConsignacion' then coalesce(
        public.fn_cuenta_por_clave(p_organization_id, null, 'bancos'),
        public.fn_primera_cuenta_detalle(p_organization_id, array['1110']))
      when 'retiroEfectivo' then coalesce(
        public.fn_cuenta_por_clave(p_organization_id, null, 'bancos'),
        public.fn_primera_cuenta_detalle(p_organization_id, array['1110']))
      else public.fn_primera_cuenta_detalle(p_organization_id, array['5195', '5135', '5305', '5105'])
    end;
    if v_contra is not null and left(v_contra, 1) = '4' then
      v_contra := null;
    end if;
    if v_caja is null or v_contra is null then
      accion := 'sin_cuenta';
      debito := v_contra;
      credito := v_caja;
      return next;
      return;
    end if;
    accion := 'asiento';
    debito := v_contra;
    credito := v_caja;
    return next;
    return;
  end if;

  v_contra := case v_clave
    when 'ventaContadoEspecial' then coalesce(
      public.fn_cuenta_por_clave(p_organization_id, null, 'ventas_productos'),
      public.fn_primera_cuenta_detalle(p_organization_id, array['4135', '414015', '4145', '4235', '4105']))
    when 'fondoAdicional' then public.fn_primera_cuenta_detalle(p_organization_id, array['3105', '3115', '3605'])
    when 'prestamoInterno' then public.fn_primera_cuenta_detalle(p_organization_id, array['2380', '2305', '2195'])
    when 'devolucionRecibida' then coalesce(
      public.fn_cuenta_por_clave(p_organization_id, null, 'proveedores'),
      public.fn_primera_cuenta_detalle(p_organization_id, array['2205', '2105']))
    else public.fn_primera_cuenta_detalle(p_organization_id, array['4250', '4295', '4210'])
  end;
  if v_clave is distinct from 'ventaContadoEspecial' and v_contra is not null and left(v_contra, 4) = '4105' then
    v_contra := null;
  end if;
  if v_caja is null or v_contra is null then
    accion := 'sin_cuenta';
    debito := v_caja;
    credito := v_contra;
    return next;
    return;
  end if;
  accion := 'asiento';
  debito := v_caja;
  credito := v_contra;
  return next;
end;
$function$
;

-- fn_auto_journal_bank
CREATE OR REPLACE FUNCTION public.fn_auto_journal_bank()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_entry_id integer;
  v_branch_id integer;
  v_default_branch integer;
  v_banco text;
  v_debito text;
  v_credito text;
  v_fallo text;
  v_importe numeric := abs(coalesce(new.amount, 0));
  v_es_entrada boolean;
begin
  if new.organization_id is not null then
    perform public.fn_assert_acceso_org(new.organization_id);
  end if;
  if v_importe <= 0 or round(v_importe, 0) <= 0 then
    return new;
  end if;

  select branch_id, nullif(btrim(account_code), '')
    into v_branch_id, v_banco
  from public.bank_accounts
  where id = new.bank_account_id
    and organization_id = new.organization_id;

  select min(id) into v_default_branch from public.branches where organization_id = new.organization_id;
  v_branch_id := coalesce(v_branch_id, v_default_branch);

  -- La cuenta del banco ocupa el lugar de la cuenta de la sesión.
  -- Si no es de movimiento, sigue el mismo orden de la caja.
  v_banco := public.fn_cuenta_caja(new.organization_id, v_branch_id, v_banco);

  if nullif(btrim(new.cuenta_contable), '') is not null then
    v_es_entrada := case
      when new.transaction_type in ('deposit', 'interest') then true
      when new.transaction_type in ('withdrawal', 'fee') then false
      else coalesce(new.amount, 0) >= 0
    end;
    select a.debito, a.credito, a.fallo
      into v_debito, v_credito, v_fallo
    from public.fn_asiento_tesoreria_elegido(
      new.organization_id,
      case when v_es_entrada then 'in' else 'out' end,
      new.cuenta_contable,
      v_banco
    ) a;

    if v_fallo is not null or v_debito is null or v_credito is null then
      perform public.fn_log_journal_failure(
        new.organization_id, v_branch_id, coalesce(new.trans_date, new.created_at, now()),
        'bank_transactions', new.id::text, 'bank:' || new.id::text,
        v_debito, v_credito, v_importe,
        'sin_cuenta', coalesce(v_fallo, 'Elige una cuenta de movimiento'));
      return new;
    end if;

    v_entry_id := public.fn_create_journal_entry(
      p_organization_id := new.organization_id,
      p_branch_id := v_branch_id,
      p_entry_date := coalesce(new.trans_date, new.created_at, now()),
      p_memo := 'Trans. Bancaria - ' || coalesce(new.description, new.transaction_type),
      p_source := 'bank_transactions',
      p_source_id := new.id::text,
      p_debit_account := v_debito,
      p_credit_account := v_credito,
      p_amount := v_importe,
      p_fact_key := 'bank:' || new.id::text,
      p_cost_center_id := case
        when new.distribucion_id is not null then null
        else coalesce(new.centro_costo_id, public.fn_centro_defecto(new.organization_id, v_branch_id))
      end,
      p_cuenta_sin_centro := v_banco
    );
    return new;
  end if;

  if new.amount < 0 then
    v_debito := public.fn_primera_cuenta_detalle(new.organization_id, array['5305', '5195', '5135']);
    v_credito := v_banco;
  else
    v_debito := v_banco;
    v_credito := public.fn_primera_cuenta_detalle(new.organization_id, array['4250', '4295', '4210']);
  end if;

  if v_debito is null or v_credito is null
     or left(v_debito, 1) = '4'
     or left(v_credito, 1) = '5' then
    perform public.fn_log_journal_failure(
      new.organization_id, v_branch_id, coalesce(new.trans_date, new.created_at, now()),
      'bank_transactions', new.id::text, 'bank:' || new.id::text,
      v_debito, v_credito, v_importe,
      'sin_cuenta', 'El ajuste de banco no usa 5105 ni 4105 y no encontró cuenta de detalle');
    return new;
  end if;

  v_entry_id := public.fn_create_journal_entry(
    p_organization_id := new.organization_id,
    p_branch_id := v_branch_id,
    p_entry_date := coalesce(new.trans_date, new.created_at, now()),
    p_memo := 'Trans. Bancaria - ' || coalesce(new.description, new.transaction_type),
    p_source := 'bank_transactions',
    p_source_id := new.id::text,
    p_debit_account := v_debito,
    p_credit_account := v_credito,
    p_amount := v_importe,
    p_fact_key := 'bank:' || new.id::text
  );

  return new;
end;
$function$
;

-- fn_reintentar_fallos_asiento
CREATE OR REPLACE FUNCTION public.fn_reintentar_fallos_asiento()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  f public.journal_entry_failures%rowtype;
  v_entry integer;
  v_resueltos integer := 0;
  v_siguen integer := 0;
  v_aviso text;
  v_mov public.cash_movements%rowtype;
  v_bt public.bank_transactions%rowtype;
  v_sesion record;
  v_branch integer;
  v_compra public.invoice_purchase%rowtype;
  v_regla record;
  v_tes text;
  v_debito text;
  v_credito text;
  v_fallo text;
  v_es_entrada boolean;
  v_importe numeric;
  v_asiento record;
  v_doc uuid;
  v_total numeric;
  v_tipo text;
begin
  for f in
    select *
      from public.journal_entry_failures
     where resolved_at is null
       and reason in ('cuenta_linea', 'sin_cuenta', 'tercero_requerido')
       and fact_key is not null
     order by id
     for update
  loop
    begin
      v_entry := null;
      v_fallo := null;
      v_debito := null;
      v_credito := null;

      select e.id into v_entry
        from public.journal_entries e
       where e.organization_id = f.organization_id
         and e.fact_key = f.fact_key
         and exists (select 1 from public.journal_lines l where l.journal_entry_id = e.id)
       limit 1;

      if v_entry is null then
        perform set_config('app.contabilidad_mantenimiento', 'on', true);
        delete from public.journal_entries e
         where e.organization_id = f.organization_id
           and e.fact_key = f.fact_key
           and not exists (select 1 from public.journal_lines l where l.journal_entry_id = e.id);
        perform set_config('app.contabilidad_mantenimiento', '', true);
      end if;

      v_tipo := case
        when f.fact_key like 'cash_move:%' or f.source = 'cash_movements' then 'caja'
        when f.fact_key like 'bank:%' or f.source = 'bank_transactions' then 'banco'
        when f.fact_key like 'accrual:purchase:%' or f.source = 'invoice_purchase' then 'compra'
        when f.fact_key like 'accrual:sale:%' or f.fact_key like 'accrual:credit_note:%' or f.source = 'invoice_sales' then 'venta'
        else 'otro'
      end;

      if v_entry is null and v_tipo = 'caja' and f.source_id ~ '^[0-9]+$' then
        select * into v_mov
          from public.cash_movements
         where id = f.source_id::integer
           and organization_id = f.organization_id;
        if found and v_mov.return_id is null then
          select cs.organization_id, cs.branch_id, cs.account_code
            into v_sesion
            from public.cash_sessions cs
           where cs.id = v_mov.cash_session_id;
          v_es_entrada := coalesce(v_mov.type, 'in') in ('in', 'deposit', 'income');
          v_importe := abs(coalesce(v_mov.amount, 0));
          if coalesce(v_mov.amount, 0) < 0 then
            v_es_entrada := not v_es_entrada;
          end if;
          if v_sesion.organization_id is not null and round(v_importe, 0) >= 1 then
            v_tes := public.fn_cuenta_caja(v_sesion.organization_id, v_sesion.branch_id, v_sesion.account_code);
            if nullif(btrim(v_mov.cuenta_contable), '') is not null then
              select a.debito, a.credito, a.fallo
                into v_debito, v_credito, v_fallo
                from public.fn_asiento_tesoreria_elegido(
                  v_sesion.organization_id,
                  case when v_es_entrada then 'in' else 'out' end,
                  v_mov.cuenta_contable,
                  v_tes
                ) a;
            else
              select a.accion, a.debito, a.credito
                into v_asiento
                from public.fn_asiento_movimiento_caja(
                  v_sesion.organization_id,
                  case when v_es_entrada then 'in' else 'out' end,
                  v_mov.concept_code
                ) a;
              v_debito := v_asiento.debito;
              v_credito := v_asiento.credito;
              if v_es_entrada and v_debito is null then
                v_debito := v_tes;
              elsif not v_es_entrada and v_credito is null then
                v_credito := v_tes;
              end if;
              if v_asiento.accion = 'omitir' then
                v_fallo := 'omitir';
              end if;
            end if;
            if v_fallo is null and v_debito is not null and v_credito is not null then
              v_entry := public.fn_create_journal_entry(
                p_organization_id := v_sesion.organization_id,
                p_branch_id := v_sesion.branch_id,
                p_entry_date := v_mov.created_at,
                p_memo := 'Mov. Caja: ' || coalesce(v_mov.type, '') || ' - ' || coalesce(v_mov.concept, ''),
                p_source := 'cash_movements',
                p_source_id := v_mov.id::text,
                p_debit_account := v_debito,
                p_credit_account := v_credito,
                p_amount := v_importe,
                p_fact_key := f.fact_key,
                p_cost_center_id := case
                  when v_mov.distribucion_id is not null then null
                  else coalesce(v_mov.centro_costo_id, public.fn_centro_defecto(v_sesion.organization_id, v_sesion.branch_id))
                end,
                p_cuenta_sin_centro := v_tes
              );
            end if;
          end if;
        end if;
      elsif v_entry is null and v_tipo = 'banco' and f.source_id ~ '^[0-9]+$' then
        select * into v_bt
          from public.bank_transactions
         where id = f.source_id::integer
           and organization_id = f.organization_id;
        if found then
          v_importe := abs(coalesce(v_bt.amount, 0));
          if round(v_importe, 0) >= 1 then
            select b.branch_id, nullif(btrim(b.account_code), '')
              into v_branch, v_tes
              from public.bank_accounts b
             where b.id = v_bt.bank_account_id
               and b.organization_id = v_bt.organization_id;
            v_branch := coalesce(
              v_branch,
              (select min(br.id) from public.branches br where br.organization_id = v_bt.organization_id)
            );
            v_tes := public.fn_cuenta_caja(v_bt.organization_id, v_branch, v_tes);
            if nullif(btrim(v_bt.cuenta_contable), '') is not null then
              v_es_entrada := case
                when v_bt.transaction_type in ('deposit', 'interest') then true
                when v_bt.transaction_type in ('withdrawal', 'fee') then false
                else coalesce(v_bt.amount, 0) >= 0
              end;
              select a.debito, a.credito, a.fallo
                into v_debito, v_credito, v_fallo
                from public.fn_asiento_tesoreria_elegido(
                  v_bt.organization_id,
                  case when v_es_entrada then 'in' else 'out' end,
                  v_bt.cuenta_contable,
                  v_tes
                ) a;
            else
              if coalesce(v_bt.amount, 0) < 0 then
                v_debito := public.fn_primera_cuenta_detalle(v_bt.organization_id, array['5305', '5195', '5135']);
                v_credito := v_tes;
              else
                v_debito := v_tes;
                v_credito := public.fn_primera_cuenta_detalle(v_bt.organization_id, array['4250', '4295', '4210']);
              end if;
              if v_debito is null or v_credito is null
                 or left(coalesce(v_debito, ''), 1) = '4'
                 or left(coalesce(v_credito, ''), 1) = '5' then
                v_fallo := 'sin_cuenta';
              end if;
            end if;
            if v_fallo is null and v_debito is not null and v_credito is not null then
              v_entry := public.fn_create_journal_entry(
                p_organization_id := v_bt.organization_id,
                p_branch_id := v_branch,
                p_entry_date := coalesce(v_bt.trans_date, v_bt.created_at, f.entry_date, now()),
                p_memo := 'Trans. Bancaria - ' || coalesce(v_bt.description, v_bt.transaction_type),
                p_source := 'bank_transactions',
                p_source_id := v_bt.id::text,
                p_debit_account := v_debito,
                p_credit_account := v_credito,
                p_amount := v_importe,
                p_fact_key := f.fact_key,
                p_cost_center_id := case
                  when v_bt.distribucion_id is not null then null
                  else coalesce(v_bt.centro_costo_id, public.fn_centro_defecto(v_bt.organization_id, v_branch))
                end,
                p_cuenta_sin_centro := v_tes
              );
            end if;
          end if;
        end if;
      elsif v_entry is null and v_tipo in ('compra', 'venta') then
        v_doc := null;
        if f.source_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
          if v_tipo = 'compra' and exists (
            select 1 from public.invoice_purchase i
             where i.id = f.source_id::uuid and i.organization_id = f.organization_id
          ) then
            v_doc := f.source_id::uuid;
          elsif v_tipo = 'venta' and exists (
            select 1 from public.invoice_sales i
             where i.id = f.source_id::uuid and i.organization_id = f.organization_id
          ) then
            v_doc := f.source_id::uuid;
          end if;
        end if;
        if v_doc is null and substring(f.fact_key from '[0-9a-f-]{36}$') is not null then
          v_doc := substring(f.fact_key from '[0-9a-f-]{36}$')::uuid;
        end if;

        if v_tipo = 'compra' and v_doc is not null then
          select * into v_compra
            from public.invoice_purchase i
           where i.id = v_doc and i.organization_id = f.organization_id;
          v_total := coalesce(v_compra.total, 0);
          if v_compra.id is not null and round(v_total, 0) <= 0 and v_total >= 0 then
            update public.journal_entry_failures
               set resolved_at = now(),
                   resolution = 'importe_cero'
             where id = f.id and resolved_at is null;
            v_resueltos := v_resueltos + 1;
            continue;
          end if;
          if v_compra.id is not null then
            if public.fn_documento_tiene_cuenta_propia(v_compra.organization_id, v_compra.id, 'compra') then
              v_entry := public.fn_asiento_documento_por_lineas(v_compra.id, 'compra', f.fact_key);
            else
              select * into v_regla from public.fn_regla_devengo_compra(v_compra.organization_id);
              v_debito := public.fn_cuenta_movimiento_o_detalle(
                v_compra.organization_id, v_compra.branch_id, v_regla.debit_account_code
              );
              v_credito := public.fn_cuenta_movimiento_o_detalle(
                v_compra.organization_id, v_compra.branch_id, v_regla.credit_account_code
              );
              v_fallo := public.fn_bloqueo_tercero_documento(
                v_compra.organization_id, v_compra.branch_id, 'invoice_purchase', v_compra.id
              );
              if v_fallo is null and v_debito is not null and v_credito is not null then
                v_entry := public.fn_create_journal_entry(
                  p_organization_id := v_compra.organization_id,
                  p_branch_id := v_compra.branch_id,
                  p_entry_date := coalesce(v_compra.issue_date, f.entry_date, now()),
                  p_memo := 'Compra ' || coalesce(v_compra.number_ext, v_compra.id::text),
                  p_source := 'invoice_purchase',
                  p_source_id := v_compra.id::text,
                  p_debit_account := v_debito,
                  p_credit_account := v_credito,
                  p_amount := v_compra.total,
                  p_tax_account := v_regla.tax_account_code,
                  p_tax_amount := case when v_regla.use_tax_from_document then coalesce(v_compra.tax_total, 0) else 0 end,
                  p_tax_is_credit := false,
                  p_fact_key := f.fact_key
                );
              end if;
            end if;
          end if;
        elsif v_tipo = 'venta' and v_doc is not null then
          select i.total into v_total
            from public.invoice_sales i
           where i.id = v_doc and i.organization_id = f.organization_id;
          if v_total is not null and round(v_total, 0) <= 0 and v_total >= 0 then
            update public.journal_entry_failures
               set resolved_at = now(),
                   resolution = 'importe_cero'
             where id = f.id and resolved_at is null;
            v_resueltos := v_resueltos + 1;
            continue;
          end if;
          if v_total is not null then
            v_entry := public.fn_asiento_documento_por_lineas(
              v_doc,
              case when f.fact_key like 'accrual:credit_note:%' then 'nota_credito' else 'venta' end,
              f.fact_key
            );
          end if;
        end if;
      end if;

      if v_entry is not null and exists (
        select 1 from public.journal_lines l where l.journal_entry_id = v_entry
      ) then
        update public.journal_entry_failures
           set resolved_at = now(),
               resolved_entry_id = v_entry,
               resolution = 'Reintento automático por la clave del hecho.'
         where organization_id = f.organization_id
           and fact_key = f.fact_key
           and resolved_at is null
           and reason in ('cuenta_linea', 'sin_cuenta', 'tercero_requerido');
        v_resueltos := v_resueltos + 1;
      else
        v_siguen := v_siguen + 1;
      end if;
    exception when others then
      v_siguen := v_siguen + 1;
      if v_aviso is null then
        v_aviso := f.id::text || ': ' || sqlerrm;
      end if;
    end;
  end loop;

  return jsonb_build_object('resueltos', v_resueltos, 'siguen', v_siguen, 'aviso', v_aviso);
end;
$function$
;

-- fn_asiento_stock_movement
CREATE OR REPLACE FUNCTION public.fn_asiento_stock_movement(p_sm stock_movements, OUT entry_id integer, OUT fallo text, OUT ya_existia boolean)
 RETURNS record
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
  ya_existia := false;
  if p_sm.source in ('purchase', 'purchase_order', 'purchase_invoice', 'purchase_void',
                    'transfer', 'transfer_out', 'transfer_in') then
    fallo := 'no_aplica';
    return;
  end if;

  if p_sm.source in ('return', 'credit_note', 'invoice_void', 'production') then
    fallo := 'no_aplica';
    return;
  end if;

  if p_sm.source = 'adjustment' and p_sm.source_id ~ '^[0-9]{1,9}$' and exists (
    select 1
      from public.inventory_adjustments ia
     where ia.id = p_sm.source_id::integer
       and ia.organization_id = p_sm.organization_id
       and ia.type in ('gain', 'loss')
  ) then
    fallo := 'no_aplica';
    return;
  end if;

  if p_sm.direction not in ('out', 'in') then
    fallo := 'no_aplica';
    return;
  end if;

  v_unit_cost := coalesce(p_sm.unit_cost, 0);
  if v_unit_cost = 0 then
    select sl.avg_cost
      into v_unit_cost
      from public.stock_levels sl
     where sl.product_id = p_sm.product_id
       and sl.branch_id = p_sm.branch_id
     limit 1;
  end if;

  v_amount := abs(p_sm.qty) * coalesce(v_unit_cost, 0);
  if v_amount <= 0 then
    fallo := 'no_aplica';
    return;
  end if;

  v_fact_key := 'stock_movement:' || p_sm.id::text;

  select je.id into entry_id
    from public.journal_entries je
   where je.organization_id = p_sm.organization_id
     and (
       je.fact_key = v_fact_key
       or (je.source = 'stock_movements' and je.source_id = p_sm.id::text)
     )
   order by je.id
   limit 1;
  if entry_id is not null then
    ya_existia := true;
    return;
  end if;

  select c.debito, c.credito, c.evento
    into v_debito_base, v_credito_base, v_evento
    from public.fn_cuentas_movimiento_stock(p_sm.organization_id, p_sm.source, p_sm.direction) c;

  if v_debito_base is null or v_credito_base is null then
    perform public.fn_log_journal_failure(
      p_sm.organization_id, p_sm.branch_id, coalesce(p_sm.created_at, now()),
      'stock_movements', p_sm.id::text, v_fact_key, v_debito_base, v_credito_base, v_amount,
      'no_rule', 'Sin cuentas para el movimiento ' || coalesce(p_sm.source, '') || ' ' || coalesce(p_sm.direction, ''));
    fallo := 'no_rule';
    return;
  end if;

  select r.cuenta, r.fallo
    into v_debit_account, v_fallo
    from public.fn_cuenta_configurada_de_sede(
      p_sm.organization_id, p_sm.branch_id, 'stock_movements', 'debito', v_debito_base
    ) r;
  if v_fallo is not null then
    perform public.fn_log_journal_failure(
      p_sm.organization_id, p_sm.branch_id, coalesce(p_sm.created_at, now()),
      'stock_movements', p_sm.id::text, v_fact_key, v_debit_account, v_credito_base, v_amount,
      'cuenta_no_configurada', v_fallo);
    fallo := v_fallo;
    return;
  end if;

  select r.cuenta, r.fallo
    into v_credit_account, v_fallo
    from public.fn_cuenta_configurada_de_sede(
      p_sm.organization_id, p_sm.branch_id, 'stock_movements', 'credito', v_credito_base
    ) r;
  if v_fallo is not null then
    perform public.fn_log_journal_failure(
      p_sm.organization_id, p_sm.branch_id, coalesce(p_sm.created_at, now()),
      'stock_movements', p_sm.id::text, v_fact_key, v_debit_account, v_credit_account, v_amount,
      'cuenta_no_configurada', v_fallo);
    fallo := v_fallo;
    return;
  end if;

  select p.name
    into v_product_name
    from public.products p
   where p.id = p_sm.product_id
     and not exists (
       select 1 from public.products pp_elim
        where pp_elim.id = p.parent_product_id
          and pp_elim.status = 'deleted'
     )
   limit 1;

  v_description := case v_evento
    when 'opening' then 'Apertura de inventario - '
    when 'sale' then 'Costo de venta - '
    when 'return' then 'Devolución de inventario - '
    when 'loss' then 'Ajuste de inventario (pérdida) - '
    when 'purchase' then 'Compra de inventario - '
    else 'Ajuste de inventario (ganancia) - '
  end || coalesce(v_product_name, 'Prod:' || p_sm.product_id);

  if p_sm.direction = 'in'
     and v_evento is distinct from 'return'
     and left(coalesce(v_credit_account, ''), 1) = '6' then
    v_credit_account := coalesce(
      public.fn_primera_cuenta_detalle(p_sm.organization_id, array['4295', '4210']),
      v_credit_account
    );
    if left(coalesce(v_credit_account, ''), 1) = '6' then
      perform public.fn_log_journal_failure(
        p_sm.organization_id, p_sm.branch_id, coalesce(p_sm.created_at, now()),
        'stock_movements', p_sm.id::text, v_fact_key, v_debit_account, v_credit_account, v_amount,
        'entrada_clase_6', 'Una entrada que no es devolución no acredita la clase 6');
      fallo := 'entrada_clase_6';
      return;
    end if;
  end if;

  begin
    entry_id := public.fn_create_journal_entry(
      p_sm.organization_id,
      p_sm.branch_id,
      coalesce(p_sm.created_at, now()),
      v_description,
      'stock_movements',
      p_sm.id::text,
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
      -- Otro proceso lo creó en paralelo: se toma el existente (idempotente por fact_key).
      select je.id into entry_id
        from public.journal_entries je
       where je.organization_id = p_sm.organization_id and je.fact_key = v_fact_key
       limit 1;
      ya_existia := true;
      return;
  end;

  return;
end;
$function$
;

-- fn_auto_journal_stock_movement
CREATE OR REPLACE FUNCTION public.fn_auto_journal_stock_movement()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
  if new.source in ('purchase', 'purchase_order', 'purchase_invoice', 'purchase_void',
                    'transfer', 'transfer_out', 'transfer_in') then
    return new;
  end if;

  if new.source in ('return', 'credit_note', 'invoice_void', 'production') then
    return new;
  end if;

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
     and not exists (
       select 1 from public.products pp_elim
        where pp_elim.id = p.parent_product_id
          and pp_elim.status = 'deleted'
     )
   limit 1;

  v_description := case v_evento
    when 'opening' then 'Apertura de inventario - '
    when 'sale' then 'Costo de venta - '
    when 'return' then 'Devolución de inventario - '
    when 'loss' then 'Ajuste de inventario (pérdida) - '
    when 'purchase' then 'Compra de inventario - '
    else 'Ajuste de inventario (ganancia) - '
  end || coalesce(v_product_name, 'Prod:' || new.product_id);

  if new.direction = 'in'
     and v_evento is distinct from 'return'
     and left(coalesce(v_credit_account, ''), 1) = '6' then
    v_credit_account := coalesce(
      public.fn_primera_cuenta_detalle(new.organization_id, array['4295', '4210']),
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
$function$
;

-- fn_auto_journal_inventory_adjustment
CREATE OR REPLACE FUNCTION public.fn_auto_journal_inventory_adjustment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_rule record;
  v_neto numeric;
  v_amount numeric;
  v_event_type text;
  v_existing_entry integer;
  v_debit_account text;
  v_credit_account text;
  v_description text;
  v_nprod integer;
  v_prod integer;
  v_explicita boolean;
  v_razon text;
begin
  if new.status is distinct from 'posted' then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then
    return new;
  end if;

  select coalesce(sum(case when sm.direction = 'in' then 1 else -1 end * abs(sm.qty)
                      * coalesce(nullif(sm.unit_cost, 0),
                                 (select sl.avg_cost from stock_levels sl
                                   where sl.product_id = sm.product_id and sl.branch_id = sm.branch_id
                                     and sl.lot_id is not distinct from sm.lot_id
                                   order by sl.id limit 1), 0)), 0),
         count(distinct sm.product_id),
         min(sm.product_id)
    into v_neto, v_nprod, v_prod
    from stock_movements sm
   where sm.source = 'adjustment'
     and sm.source_id = new.id::text
     and sm.organization_id = new.organization_id;

  v_amount := round(abs(v_neto), 2);
  if v_amount <= 0 then
    return new;
  end if;
  v_event_type := case when v_neto > 0 then 'gain' else 'loss' end;

  select je.id into v_existing_entry
    from journal_entries je
   where je.source = 'inventory_adjustment'
     and je.source_id = new.id::text
     and je.organization_id = new.organization_id
   limit 1;
  if v_existing_entry is not null then
    return new;
  end if;

  select * into v_rule
    from accounting_rules
   where organization_id = new.organization_id
     and source_type = 'inventory_adjustment'
     and event_type = v_event_type
     and is_active = true
   order by priority
   limit 1;

  v_credit_account := public.fn_cuenta_inventario_producto(
    new.organization_id,
    new.branch_id,
    case when v_nprod = 1 then v_prod else null end
  );

  v_razon := lower(btrim(coalesce(new.reason, '')));
  if v_razon = 'correccion_conteo' then
    return new;
  end if;

  if v_event_type = 'gain' then
    v_debit_account := public.fn_inventario_auxiliar_1435(new.organization_id, new.branch_id);
    if v_razon in ('initial_setup', 'saldo_inicial') then
      v_credit_account := public.fn_cuenta_configurada(new.organization_id, new.branch_id, 'saldo_inicial', '3105');
    elsif v_razon in ('compra_sin_orden', 'compra sin orden') then
      v_credit_account := coalesce(
        public.fn_cuenta_por_clave(new.organization_id, new.branch_id, 'proveedores'),
        '2205'
      );
    else
      v_credit_account := public.fn_cuenta_configurada(new.organization_id, new.branch_id, 'ingresos_diversos', '4295');
    end if;
    if left(coalesce(v_credit_account, ''), 4) = '4250'
       or v_debit_account is null
       or left(v_debit_account, 4) <> '1435' then
      perform public.fn_log_journal_failure(
        new.organization_id, new.branch_id, coalesce(new.posted_at, now()),
        'inventory_adjustment', new.id::text, 'inventory_adjustment:' || new.id::text,
        v_debit_account, v_credit_account, v_amount,
        'sobrante_cuenta', 'El sobrante debita el auxiliar de 1435 y no acredita 4250');
      return new;
    end if;
  else
    v_explicita := v_rule.debit_account_code is not null
      and v_rule.debit_account_code not in ('5150', '6105', '519595', '5315')
      and left(v_rule.debit_account_code, 1) <> '6'
      and coalesce(new.motivo_ajuste, '') = ''
      and lower(coalesce(new.reason, '')) not in ('robo', 'siniestro', 'theft', 'consumo_interno', 'consumo interno');
    if v_explicita then
      v_debit_account := v_rule.debit_account_code;
    else
      v_debit_account := public.fn_debito_salida_inventario(
        new.organization_id, new.branch_id, new.motivo_ajuste, new.reason
      );
    end if;
    if left(coalesce(v_debit_account, ''), 1) = '6' then
      perform public.fn_log_journal_failure(
        new.organization_id, new.branch_id, coalesce(new.posted_at, now()),
        'inventory_adjustment', new.id::text, 'inventory_adjustment:' || new.id::text,
        v_debit_account, v_credit_account, v_amount,
        'salida_clase_6', 'Un faltante o un consumo interno no debita la clase 6');
      return new;
    end if;
  end if;

  if v_debit_account is null or v_credit_account is null then
    perform public.fn_log_journal_failure(
      new.organization_id, new.branch_id, coalesce(new.posted_at, now()),
      'inventory_adjustment', new.id::text, null, v_debit_account, v_credit_account, v_amount,
      'no_rule', 'Sin cuenta de inventario o de gasto para el ajuste');
    return new;
  end if;

  v_description := 'Ajuste de inventario ' || coalesce(new.code, new.id::text)
    || ' - ' || coalesce(new.motivo_ajuste, new.reason, 'N/A')
    || coalesce(' - ' || nullif(new.notes, ''), '');

  perform public.fn_create_journal_entry(
    p_organization_id => new.organization_id,
    p_branch_id => new.branch_id,
    p_entry_date => coalesce(new.posted_at, new.updated_at, now()),
    p_memo => v_description,
    p_source => 'inventory_adjustment',
    p_source_id => new.id::text,
    p_debit_account => v_debit_account,
    p_credit_account => v_credit_account,
    p_amount => v_amount,
    p_fact_key => 'inventory_adjustment:' || new.id::text
  );
  return new;
end;
$function$
;

-- fn_auto_journal_purchase
CREATE OR REPLACE FUNCTION public.fn_auto_journal_purchase()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_rule record;
  v_entry_id integer;
  v_fact_key text;
  v_debito text;
  v_credito text;
  v_aux text;
  v_impuesto text;
begin
  if new.status is distinct from 'received' then
    return new;
  end if;

  if tg_op = 'UPDATE' and old.status = 'received' then
    return new;
  end if;

  if coalesce(new.total, 0) >= 0 and round(coalesce(new.total, 0), 0) <= 0 then
    return new;
  end if;

  v_fact_key := 'accrual:purchase:' || new.id::text;

  if exists (
    select 1 from journal_entries
    where organization_id = new.organization_id
      and source = 'invoice_purchase'
      and source_id = new.id::text
      and memo like 'Compra %'
  ) then
    return new;
  end if;

  select * into v_rule from fn_regla_devengo_compra(new.organization_id);

  if v_rule.debit_account_code is null then
    perform fn_log_journal_failure(
      new.organization_id, new.branch_id, coalesce(new.issue_date, now()),
      'invoice_purchase', new.id::text, v_fact_key, null, null, new.total,
      'no_rule', 'Sin regla contable activa de compra');
    return new;
  end if;

  v_debito := public.fn_cuenta_movimiento_o_detalle(
    new.organization_id, new.branch_id, v_rule.debit_account_code
  );
  v_credito := public.fn_cuenta_movimiento_o_detalle(
    new.organization_id, new.branch_id, v_rule.credit_account_code
  );

  v_aux := public.fn_asegurar_auxiliar_1435(new.organization_id, new.branch_id);
  if v_aux is not null and (
       v_debito is null
       or v_debito in ('1405', '1435', '6135')
       or v_debito like '1405%'
       or v_debito like '1435%'
       or left(v_debito, 1) = '6'
     ) then
    v_debito := v_aux;
  end if;

  if v_credito is null
     or v_credito in ('2105', '1405', '1435', '6135')
     or v_credito like '1405%'
     or v_credito like '1435%'
     or left(v_credito, 1) = '6' then
    v_credito := coalesce(
      public.fn_puc_cuenta_para_asiento(new.organization_id, '2205', 'Proveedores nacionales'),
      v_credito
    );
  end if;

  v_impuesto := nullif(btrim(v_rule.tax_account_code), '');
  if v_impuesto is null or v_impuesto in ('2405', '2408') or v_impuesto like '2405%' then
    if exists (
      select 1 from public.chart_of_accounts c
      where c.organization_id = new.organization_id and c.account_code = '240810'
    ) then
      v_impuesto := '240810';
    elsif exists (
      select 1 from public.chart_of_accounts c
      where c.organization_id = new.organization_id and c.account_code = '2408'
    ) then
      insert into public.chart_of_accounts (
        organization_id, account_code, name, type, parent_code, naturaleza, es_movimiento, centro_costo_modo
      ) values (
        new.organization_id, '240810', 'IVA descontable', 'liability', '2408', 'debito', true, 'no_aplica'
      ) on conflict (organization_id, account_code) do nothing;
      v_impuesto := '240810';
    end if;
  end if;

  if public.fn_documento_tiene_cuenta_propia(new.organization_id, new.id, 'compra') then
    v_entry_id := public.fn_asiento_documento_por_lineas(new.id, 'compra', v_fact_key);
  elsif public.fn_bloqueo_tercero_documento(new.organization_id, new.branch_id, 'invoice_purchase', new.id) is not null then
    perform fn_log_journal_failure(
      new.organization_id, new.branch_id, coalesce(new.issue_date, now()),
      'invoice_purchase', new.id::text, v_fact_key,
      v_debito, v_credito, new.total,
      'tercero_requerido',
      public.fn_bloqueo_tercero_documento(new.organization_id, new.branch_id, 'invoice_purchase', new.id));
  else
    v_entry_id := fn_create_journal_entry(
      p_organization_id := new.organization_id,
      p_branch_id := new.branch_id,
      p_entry_date := coalesce(new.issue_date, now()),
      p_memo := 'Compra ' || coalesce(new.number_ext, new.id::text),
      p_source := 'invoice_purchase',
      p_source_id := new.id::text,
      p_debit_account := v_debito,
      p_credit_account := v_credito,
      p_amount := new.total,
      p_tax_account := v_impuesto,
      p_tax_amount := case when v_rule.use_tax_from_document then new.tax_total else 0 end,
      p_tax_is_credit := false,
      p_fact_key := v_fact_key
    );
  end if;

  perform fn_asiento_compra_aplicar_retenciones(v_entry_id, new.id, v_credito);

  return new;
end;
$function$
;

-- fn_clave_cuenta_configurable
CREATE OR REPLACE FUNCTION public.fn_clave_cuenta_configurable(p_source text, p_lado text, p_codigo text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select case
    when s.code is null then null
    when s.code = '240810' then 'iva_descontable'
    when s.code = '240805' then 'iva_generado'
    when p_lado = 'impuesto' and s.code in ('2408', '2405') then
      case when s.origen = any (array['purchase', 'purchases', 'invoice_purchase', 'purchase_order', 'purchase_orders'])
        then 'iva_descontable' else 'iva_generado' end
    when p_lado = 'descuento' and s.code = '4175' then 'descuentos'
    when s.code = '1105' then 'caja'
    when s.code = '1110' then 'bancos'
    when s.code = '1305' and s.origen <> all (array['loan', 'loans', 'employee_loans', 'installment', 'installments', 'loan_installments', 'ap_installments']) then 'clientes'
    when s.code in ('2105', '2205') then 'proveedores'
    when s.code in ('1405', '1435') then 'inventario'
    when s.code in ('6105', '6135', '6140') then 'costo_ventas'
    when s.code = '2365' then 'retefuente'
    when s.code = '2367' then 'reteiva'
    when s.code = '2368' then 'reteica'
    when s.code = '2805' then 'anticipos'
    when s.code in ('5235', '529505') then 'comisiones'
    when s.code = '5105' and s.origen = any (array['tip', 'tips']) then 'propinas'
    when s.code = '5105' and s.origen = any (array['payroll', 'payroll_slips', 'payroll_period', 'payroll_periods']) then 'nomina'
    when s.code = '2505' and s.origen = any (array['payroll', 'payroll_slips', 'payroll_period', 'payroll_periods']) then 'nomina_por_pagar'
    when s.code = '2370' and s.origen = any (array['payroll', 'payroll_slips', 'payroll_period', 'payroll_periods']) then 'nomina_aportes'
    when s.code in ('4175', '4705') then 'devoluciones'
    when p_lado = 'debito' and s.code in ('4105', '4135', '4110', '414015', '4145', '4235', '4115', '4140', '414005', '414095', '4155') then 'devoluciones'
    when s.code in ('4105', '4135', '4110', '414015', '4145') then 'ventas_productos'
    when s.code in ('4235', '4115', '4140', '414005', '414095', '4155') then 'ventas_servicios'
    else null
  end
  from (select nullif(btrim(p_codigo), '') as code, coalesce(btrim(p_source), '') as origen) s;
$function$
;

-- fn_cuenta_iva
CREATE OR REPLACE FUNCTION public.fn_cuenta_iva(p_organization_id integer, p_branch_id integer, p_source text, p_cuenta_regla text)
 RETURNS text
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_map text;
  v_clave text;
  v_conf text;
begin
  select tam.account_code into v_map
    from public.tax_account_mapping tam
    left join public.organization_taxes ot
      on ot.id = tam.organization_tax_id
     and ot.organization_id = p_organization_id
    left join public.tax_templates tt
      on tt.id = tam.tax_template_id
   where tam.organization_id = p_organization_id
     and coalesce(tam.is_active, true)
     and (
       (ot.id is not null and coalesce(ot.is_active, true) and ot.kind = 'tax'
         and ot.name ilike '%iva%' and ot.name not ilike '%rete%')
       or (tt.id is not null and coalesce(tt.kind, 'tax') = 'tax'
         and (coalesce(tt.code, '') ilike '%iva%' or coalesce(tt.name, '') ilike '%iva%')
         and coalesce(tt.code, '') not ilike '%rete%'
         and coalesce(tt.name, '') not ilike '%rete%')
     )
     and exists (
       select 1 from public.chart_of_accounts c
        where c.organization_id = p_organization_id
          and c.account_code = tam.account_code
          and c.es_movimiento is distinct from false
     )
   order by tam.updated_at desc nulls last, tam.id desc
   limit 1;
  if v_map is not null then
    return v_map;
  end if;

  v_clave := public.fn_clave_cuenta_configurable(
    p_source,
    'impuesto',
    case
      when coalesce(p_source, '') = any (array[
        'purchase', 'purchases', 'invoice_purchase', 'purchase_order', 'purchase_orders'
      ]) then '2405'
      else '2408'
    end
  );
  if v_clave is not null then
    select c.account_code into v_conf
      from public.configuracion_contable c
     where c.organization_id = p_organization_id
       and c.clave = v_clave
       and (c.branch_id = p_branch_id or c.branch_id is null)
     order by c.branch_id nulls last
     limit 1;
    if v_conf is not null and exists (
      select 1 from public.chart_of_accounts c
       where c.organization_id = p_organization_id
         and c.account_code = v_conf
         and c.es_movimiento is distinct from false
    ) then
      return v_conf;
    end if;
  end if;

  return nullif(btrim(p_cuenta_regla), '');
end;
$function$
;

-- fn_cuenta_por_clave
CREATE OR REPLACE FUNCTION public.fn_cuenta_por_clave(p_organization_id integer, p_branch_id integer, p_clave text)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_cuenta text;
  v_type integer;
begin
  perform public.fn_assert_acceso_org(p_organization_id);
  select c.account_code into v_cuenta
  from public.configuracion_contable c
  where c.organization_id = p_organization_id and c.clave = p_clave
    and (c.branch_id = p_branch_id or c.branch_id is null)
    and nullif(btrim(c.account_code), '') is not null
  order by c.branch_id nulls last
  limit 1;
  if v_cuenta is null then
    select o.type_id into v_type from public.organizations o where o.id = p_organization_id;
    select s.account_code into v_cuenta from public.fn_propuesta_configuracion_sector(v_type) s where s.clave = p_clave;
  end if;
  if v_cuenta is null then
    return null;
  end if;
  if exists (
    select 1 from public.chart_of_accounts c
    where c.organization_id = p_organization_id and c.account_code = v_cuenta
      and coalesce(c.is_active, true) and c.es_movimiento is distinct from false
  ) then
    return v_cuenta;
  end if;
  return null;
end;
$function$
;

-- fn_propuesta_configuracion_sector
CREATE OR REPLACE FUNCTION public.fn_propuesta_configuracion_sector(p_type_id integer)
 RETURNS TABLE(clave text, account_code text)
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select v.clave,
    case v.clave
      when 'ventas_productos' then case p_type_id
        when 1 then '414015'
        when 2 then '4140'
        when 4 then '4155'
        when 6 then '4145'
        when 7 then '4235'
        else '4135'
      end
      when 'ventas_servicios' then case p_type_id
        when 1 then '414095'
        when 2 then '4140'
        else '4235'
      end
      when 'costo_ventas' then case when p_type_id in (1, 2) then '6140' else '6135' end
      -- Inventario: nunca 1405. fn_sembrar_configuracion_contable lo cambia por el auxiliar 143501xx.
      when 'inventario' then '1435'
      else v.defecto
    end
  from (values
    ('caja', '1105'),
    ('bancos', '1110'),
    ('clientes', '1305'),
    ('proveedores', '2205'),
    ('ventas_productos', '4135'),
    ('ventas_servicios', '4235'),
    ('devoluciones', '4175'),
    ('descuentos', '4175'),
    ('costo_ventas', '6135'),
    ('inventario', '1435'),
    ('iva_generado', '240805'),
    ('iva_descontable', '240810'),
    ('retefuente', '2365'),
    ('reteiva', '2367'),
    ('reteica', '2368'),
    ('propinas', '5105'),
    ('comisiones', '529505'),
    ('anticipos', '2805'),
    ('nomina', '5105'),
    ('nomina_por_pagar', '2505'),
    ('nomina_aportes', '2370'),
    ('faltante_inventario', '519595'),
    ('gastos_extraordinarios', '5315'),
    ('consumo_interno', '519595'),
    ('manifiesto_por_pagar', '2205'),
    ('manifiesto_transporte', '2335'),
    ('saldo_inicial', '3105'),
    ('impuesto_consumo', '2495'),
    ('redondeo', '4295'),
    ('compra_servicio', '2335')
  ) as v(clave, defecto);
$function$
;

-- fn_puc_destino_reclass
CREATE OR REPLACE FUNCTION public.fn_puc_destino_reclass(p_type integer, p_codigo text, p_nombre text)
 RETURNS TABLE(destino text, motivo text)
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$
;

-- fn_reclasificar_iva_generado
CREATE OR REPLACE FUNCTION public.fn_reclasificar_iva_generado(p_org integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_neto numeric;
  v_branch integer;
  v_existente integer;
  v_id integer;
begin
  perform public.fn_finanzas_exigir_permiso(p_org, array['finance.create', 'accounting.reverse']);
  select je.id into v_existente
    from public.journal_entries je
   where je.organization_id = p_org
     and je.fact_key = 'reclasificacion:iva_generado:' || p_org::text
   limit 1;
  if v_existente is not null then
    return jsonb_build_object('repetida', true, 'journal_entry_id', v_existente, 'monto', 0);
  end if;

  select coalesce(sum(jl.credit - jl.debit), 0) into v_neto
    from public.journal_lines jl
    join public.journal_entries je on je.id = jl.journal_entry_id
   where je.organization_id = p_org
     and coalesce(je.posted, false)
     and jl.account_code = '2405'
     and jl.description like 'IVA - %'
     and coalesce(je.fact_key, '') not like 'reclasificacion:iva_generado:%';
  if v_neto <= 0.01 then
    return jsonb_build_object('repetida', false, 'journal_entry_id', null, 'monto', 0);
  end if;

  select b.id into v_branch
    from public.branches b
   where b.organization_id = p_org and b.is_main and b.is_active
   order by b.id
   limit 1;
  if v_branch is null then
    select min(b.id) into v_branch from public.branches b where b.organization_id = p_org;
  end if;

  v_id := public.fn_create_journal_entry(
    p_organization_id := p_org,
    p_branch_id := v_branch,
    p_entry_date := now(),
    p_memo := 'Reclasificación de IVA generado de 2405 a 2408',
    p_source := 'manual',
    p_source_id := 'iva-generado',
    p_debit_account := '2405',
    p_credit_account := '2408',
    p_amount := round(v_neto, 2),
    p_tax_account := null,
    p_tax_amount := 0,
    p_created_by := auth.uid(),
    p_tax_is_credit := false,
    p_fact_key := 'reclasificacion:iva_generado:' || p_org::text
  );
  if v_id is null then
    raise exception 'cuenta_no_configurada' using errcode = '22023',
      detail = 'No se pudo publicar el traslado de 2405 a 2408. Revise que ambas cuentas existan y sean de movimiento.';
  end if;
  return jsonb_build_object('repetida', false, 'journal_entry_id', v_id, 'monto', round(v_neto, 2));
end;
$function$
;

-- fn_regla_devengo_compra
CREATE OR REPLACE FUNCTION public.fn_regla_devengo_compra(p_organization_id integer)
 RETURNS TABLE(debit_account_code text, credit_account_code text, tax_account_code text, use_tax_from_document boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_payable text;
  v_debit text;
  v_credit text;
  v_tax text;
  v_use boolean;
  v_type integer;
  v_destino text;
begin
  select r.debit_account_code into v_payable
  from public.accounting_rules r
  where r.organization_id = p_organization_id
    and r.source_type = 'purchase_payment'
    and r.is_active = true
  order by r.priority
  limit 1;

  select r.debit_account_code,
         coalesce(v_payable, r.credit_account_code),
         r.tax_account_code,
         r.use_tax_from_document
    into v_debit, v_credit, v_tax, v_use
  from public.accounting_rules r
  where r.organization_id = p_organization_id
    and r.source_type = 'purchase'
    and r.is_active = true
    and coalesce(r.event_type, 'created') = 'created'
  order by
    (r.credit_account_code = v_payable) desc nulls last,
    (r.conditions->>'is_credit' = 'true') desc nulls last,
    r.priority
  limit 1;

  if v_debit is null then
    return;
  end if;

  if p_organization_id is distinct from 149 then
    select o.type_id into v_type from public.organizations o where o.id = p_organization_id;
    if v_credit = '2105' or (v_type in (4, 6) and v_credit in ('2105', '2205')) then
      if v_type in (4, 6) then
        v_destino := coalesce(public.fn_cuenta_por_clave(p_organization_id, null, 'compra_servicio'), '2335');
      else
        v_destino := coalesce(public.fn_cuenta_por_clave(p_organization_id, null, 'proveedores'), '2205');
      end if;
      if exists (
        select 1 from public.chart_of_accounts c
        where c.organization_id = p_organization_id and c.account_code = v_destino
          and coalesce(c.is_active, true) and c.es_movimiento is distinct from false
      ) then
        v_credit := v_destino;
      elsif v_credit = '2105' then
        v_credit := case when v_type in (4, 6) then '2335' else '2205' end;
      end if;
    end if;

    if v_tax in ('2405', '2408') then
      v_destino := coalesce(public.fn_cuenta_por_clave(p_organization_id, null, 'iva_descontable'), '240810');
      if exists (
        select 1 from public.chart_of_accounts c
        where c.organization_id = p_organization_id and c.account_code = v_destino
          and coalesce(c.is_active, true) and c.es_movimiento is distinct from false
      ) then
        v_tax := v_destino;
      end if;
    end if;
  end if;

  return query select v_debit, v_credit, v_tax, v_use;
end;
$function$
;

-- fn_regla_devengo_venta
CREATE OR REPLACE FUNCTION public.fn_regla_devengo_venta(p_organization_id integer)
 RETURNS TABLE(debit_account_code text, credit_account_code text, tax_account_code text, use_tax_from_document boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_recv text;
  v_debit text;
  v_credit text;
  v_tax text;
  v_use boolean;
  v_type integer;
  v_destino text;
begin
  select r.credit_account_code into v_recv
  from public.accounting_rules r
  where r.organization_id = p_organization_id
    and r.source_type = 'sale_payment'
    and r.is_active = true
  order by r.priority
  limit 1;

  select coalesce(v_recv, r.debit_account_code),
         r.credit_account_code,
         r.tax_account_code,
         r.use_tax_from_document
    into v_debit, v_credit, v_tax, v_use
  from public.accounting_rules r
  where r.organization_id = p_organization_id
    and r.source_type = 'sale'
    and r.is_active = true
    and coalesce(r.event_type, 'created') = 'created'
    and r.credit_account_code like '4%'
  order by
    (r.debit_account_code = v_recv) desc nulls last,
    (r.conditions->>'is_credit' = 'true') desc nulls last,
    r.priority
  limit 1;

  if v_credit is null and v_debit is null then
    return;
  end if;

  if p_organization_id is distinct from 149 then
    select o.type_id into v_type from public.organizations o where o.id = p_organization_id;
    if coalesce(v_type, 3) in (1, 2, 3)
       and v_credit in ('4105', '4110', '4115', '4135', '4140', '414005', '414015', '414095') then
      v_destino := public.fn_cuenta_por_clave(p_organization_id, null, 'ventas_productos');
      if v_destino is null then
        v_destino := case
          when v_type = 1 then '414015'
          when v_type = 2 and exists (
            select 1 from public.chart_of_accounts c
            where c.organization_id = p_organization_id and c.account_code = '4140'
              and coalesce(c.is_active, true) and c.es_movimiento is distinct from false
          ) then '4140'
          when v_type = 2 then '414005'
          else '4135'
        end;
      end if;
      if exists (
        select 1 from public.chart_of_accounts c
        where c.organization_id = p_organization_id and c.account_code = v_destino
          and coalesce(c.is_active, true) and c.es_movimiento is distinct from false
      ) then
        v_credit := v_destino;
      end if;
    end if;

    if v_tax in ('2405', '2408') then
      v_destino := coalesce(public.fn_cuenta_por_clave(p_organization_id, null, 'iva_generado'), '240805');
      if exists (
        select 1 from public.chart_of_accounts c
        where c.organization_id = p_organization_id and c.account_code = v_destino
          and coalesce(c.is_active, true) and c.es_movimiento is distinct from false
      ) then
        v_tax := v_destino;
      end if;
    end if;
  end if;

  return query select v_debit, v_credit, v_tax, v_use;
end;
$function$
;

-- fn_sembrar_categorias_tesoreria
CREATE OR REPLACE FUNCTION public.fn_sembrar_categorias_tesoreria(p_org integer)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$
;

-- fn_sobrante_borradores
CREATE OR REPLACE FUNCTION public.fn_sobrante_borradores()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_org integer;
  v_entry integer;
  v_posted boolean;
  v_memo text;
  v_branch integer;
  v_old_4250 numeric;
  v_old_3105 numeric;
  v_old_4295 numeric;
  v_residual numeric;
  v_compra numeric;
  v_saldo numeric;
  v_diversos numeric;
  v_nuevo numeric;
  v_d numeric;
  v_c numeric;
  v_centro_d uuid;
  v_centro_c uuid;
  v_centro uuid;
  g record;
  v_n integer;
begin
  drop table if exists pg_temp._sob_neto;
  create temp table _sob_neto as
  with pares as (
    select distinct ia.organization_id, ia.id as ajuste_id, je_sm.id as asiento_stock
    from public.inventory_adjustments ia
    join public.stock_movements sm
      on sm.organization_id = ia.organization_id
     and sm.source = 'adjustment'
     and sm.source_id = ia.id::text
    join public.journal_entries je_sm
      on je_sm.organization_id = sm.organization_id
     and je_sm.source = 'stock_movements'
     and je_sm.source_id = sm.id::text
     and je_sm.posted is true
    join public.journal_entries je_ia
      on je_ia.organization_id = ia.organization_id
     and je_ia.source = 'inventory_adjustment'
     and je_ia.source_id = ia.id::text
     and je_ia.posted is true
    where ia.organization_id <> 149
  )
  select p.organization_id,
         p.ajuste_id,
         round(sum(case when jl.account_code like '1405%' then jl.debit - jl.credit else 0 end), 2) as neto_1405,
         min(jl.account_code) filter (where jl.account_code like '1405%') as c1405,
         max(jl.account_code) filter (where jl.account_code like '1405%') as c1405b,
         min(jl.account_code) filter (where jl.account_code like '6105%') as c6105,
         max(jl.account_code) filter (where jl.account_code like '6105%') as c6105b
  from pares p
  join public.journal_lines jl on jl.journal_entry_id = p.asiento_stock
  group by p.organization_id, p.ajuste_id;

  if exists (
    select 1 from pg_temp._sob_neto
    where c1405 is distinct from c1405b or c6105 is distinct from c6105b
  ) then
    raise exception 'sobrante_cuentas_mixtas';
  end if;

  drop table if exists pg_temp._sob_doble;
  create temp table _sob_doble as
  select organization_id, ajuste_id, neto_1405, c1405, c6105
  from pg_temp._sob_neto
  where neto_1405 > 0;

  select count(*) into v_n from pg_temp._sob_doble;
  if v_n <> 48 then
    raise exception 'sobrante_doble_distinto: %', v_n;
  end if;

  delete from public.sobrante_aviso where origen = 'historico';

  for g in
    select organization_id, c1405, c6105, round(sum(neto_1405), 0) as monto, count(*) as ajustes
    from pg_temp._sob_doble
    group by organization_id, c1405, c6105
  loop
    if g.monto <= 0 or g.c1405 is null or g.c6105 is null or left(g.c1405, 4) <> '1405' or left(g.c6105, 4) <> '6105' then
      raise exception 'sobrante_reversion_incompleta org %', g.organization_id;
    end if;

    select je.id, je.posted, je.memo, je.branch_id
      into v_entry, v_posted, v_memo, v_branch
    from public.journal_entries je
    where je.organization_id = g.organization_id
      and je.fact_key = 'correccion_reversion:' || g.organization_id::text
    limit 1;

    if v_entry is null or v_posted is true then
      raise exception 'sobrante_reversion_publicada org %', g.organization_id;
    end if;

    insert into public.sobrante_linea_respaldo (
      journal_entry_id, line_id, account_code, description, debit, credit,
      debit_base, credit_base, organization_id, cost_center_id
    )
    select jl.journal_entry_id, jl.id, jl.account_code, jl.description, jl.debit, jl.credit,
           jl.debit_base, jl.credit_base, jl.organization_id, jl.cost_center_id
    from public.journal_lines jl
    where jl.journal_entry_id = v_entry
      and not exists (
        select 1 from public.sobrante_linea_respaldo r
        where r.journal_entry_id = v_entry
      );

    select jl.cost_center_id into v_centro_d
    from public.journal_lines jl
    where jl.journal_entry_id = v_entry and jl.account_code like '6105%'
    order by jl.id
    limit 1;
    select jl.cost_center_id into v_centro_c
    from public.journal_lines jl
    where jl.journal_entry_id = v_entry and jl.account_code like '1405%'
    order by jl.id
    limit 1;

    delete from public.journal_lines where journal_entry_id = v_entry;

    insert into public.journal_lines (
      journal_entry_id, account_code, description, debit, credit,
      organization_id, debit_base, credit_base, cost_center_id
    ) values
      (v_entry, g.c6105, coalesce(v_memo, 'Reversión del doble de stock'), g.monto, 0, g.organization_id, g.monto, 0, v_centro_d),
      (v_entry, g.c1405, coalesce(v_memo, 'Reversión del doble de stock'), 0, g.monto, g.organization_id, 0, g.monto, v_centro_c);

    insert into public.sobrante_aviso (organization_id, clase, monto, detalle, origen)
    values (
      g.organization_id, 'reversion_doble', g.monto,
      jsonb_build_object('ajustes', g.ajustes, 'debito', g.c6105, 'credito', g.c1405, 'asiento', v_entry),
      'historico'
    );
  end loop;

  drop table if exists pg_temp._sob_dest;
  create temp table _sob_dest as
  select ia.organization_id,
         case
           when lower(btrim(coalesce(ia.reason, ''))) in ('initial_setup', 'saldo_inicial') then '3105'
           when lower(btrim(coalesce(ia.reason, ''))) in ('compra_sin_orden', 'compra sin orden') then '2205'
           else '4295'
         end as destino,
         round(sum(jl.credit), 0) as monto
  from public.journal_lines jl
  join public.journal_entries je on je.id = jl.journal_entry_id and je.posted is true
  join public.inventory_adjustments ia
    on je.source = 'inventory_adjustment'
   and je.source_id = ia.id::text
   and ia.organization_id = je.organization_id
  where je.organization_id <> 149
    and jl.credit > 0
    and (jl.account_code = '4250' or jl.account_code like '4250-%')
    and not exists (
      select 1 from pg_temp._sob_doble d
      where d.organization_id = ia.organization_id
        and d.ajuste_id = ia.id
    )
  group by 1, 2
  having round(sum(jl.credit), 0) <> 0;

  for v_org in
    select distinct x.organization_id
    from (
      select organization_id from pg_temp._sob_dest
      union
      select je.organization_id
      from public.journal_entries je
      join public.journal_lines jl on jl.journal_entry_id = je.id
      where je.posted is false
        and je.fact_key = 'correccion_reclasificacion:' || je.organization_id::text
        and je.organization_id <> 149
        and (jl.account_code = '4250' or jl.account_code like '4250-%')
    ) x
  loop
    select je.id, je.posted, je.memo
      into v_entry, v_posted, v_memo
    from public.journal_entries je
    where je.organization_id = v_org
      and je.fact_key = 'correccion_reclasificacion:' || v_org::text
    limit 1;

    if v_entry is null or v_posted is true then
      raise exception 'sobrante_reclas_publicada org %', v_org;
    end if;

    select coalesce(sum(debit), 0) into v_old_4250
    from public.journal_lines
    where journal_entry_id = v_entry and (account_code = '4250' or account_code like '4250-%');
    select coalesce(sum(credit), 0) into v_old_3105
    from public.journal_lines
    where journal_entry_id = v_entry and (account_code = '3105' or account_code like '3105-%');
    select coalesce(sum(credit), 0) into v_old_4295
    from public.journal_lines
    where journal_entry_id = v_entry and (account_code = '4295' or account_code like '4295-%');

    v_residual := round(v_old_4250 - v_old_3105 - v_old_4295, 0);
    select coalesce(sum(monto), 0) into v_compra from pg_temp._sob_dest where organization_id = v_org and destino = '2205';
    select coalesce(sum(monto), 0) into v_saldo from pg_temp._sob_dest where organization_id = v_org and destino = '3105';
    select coalesce(sum(monto), 0) into v_diversos from pg_temp._sob_dest where organization_id = v_org and destino = '4295';

    if v_residual < -1 or abs(v_residual - v_compra) > 1 then
      raise exception 'sobrante_residual_compra org % residual % compra %', v_org, v_residual, v_compra;
    end if;

    v_nuevo := round(v_saldo + v_diversos + v_residual, 0);

    select jl.cost_center_id into v_centro
    from public.journal_lines jl
    where jl.journal_entry_id = v_entry
      and jl.cost_center_id is not null
      and (
        jl.account_code in ('4250', '3105', '4295')
        or jl.account_code like '4250-%'
        or jl.account_code like '3105-%'
        or jl.account_code like '4295-%'
      )
    order by jl.id
    limit 1;

    insert into public.sobrante_linea_respaldo (
      journal_entry_id, line_id, account_code, description, debit, credit,
      debit_base, credit_base, organization_id, cost_center_id
    )
    select jl.journal_entry_id, jl.id, jl.account_code, jl.description, jl.debit, jl.credit,
           jl.debit_base, jl.credit_base, jl.organization_id, jl.cost_center_id
    from public.journal_lines jl
    where jl.journal_entry_id = v_entry
      and not exists (
        select 1 from public.sobrante_linea_respaldo r
        where r.journal_entry_id = v_entry
      );

    delete from public.journal_lines
    where journal_entry_id = v_entry
      and (
        account_code in ('4250', '3105', '4295')
        or account_code like '4250-%'
        or account_code like '3105-%'
        or account_code like '4295-%'
      );

    if v_nuevo > 0 then
      insert into public.journal_lines (
        journal_entry_id, account_code, description, debit, credit,
        organization_id, debit_base, credit_base, cost_center_id
      ) values (
        v_entry, '4250', coalesce(v_memo, 'Reclasificación de sobrantes'), v_nuevo, 0, v_org, v_nuevo, 0, v_centro
      );
    end if;
    if v_saldo > 0 then
      insert into public.journal_lines (
        journal_entry_id, account_code, description, debit, credit,
        organization_id, debit_base, credit_base, cost_center_id
      ) values (
        v_entry, '3105', coalesce(v_memo, 'Reclasificación de sobrantes'), 0, v_saldo, v_org, 0, v_saldo, v_centro
      );
    end if;
    if v_diversos > 0 then
      insert into public.journal_lines (
        journal_entry_id, account_code, description, debit, credit,
        organization_id, debit_base, credit_base, cost_center_id
      ) values (
        v_entry, '4295', coalesce(v_memo, 'Reclasificación de sobrantes'), 0, v_diversos, v_org, 0, v_diversos, v_centro
      );
    end if;

    select coalesce(sum(debit), 0), coalesce(sum(credit), 0)
      into v_d, v_c
    from public.journal_lines
    where journal_entry_id = v_entry;
    if v_d <> v_c then
      raise exception 'sobrante_descuadre org % debito % credito %', v_org, v_d, v_c;
    end if;

    insert into public.sobrante_aviso (organization_id, clase, monto, detalle, origen)
    values
      (v_org, 'reclas_4250', v_nuevo, jsonb_build_object('asiento', v_entry, 'saldo', v_saldo, 'diversos', v_diversos, 'compra', v_residual), 'historico');
  end loop;

  insert into public.sobrante_linea_respaldo (
    journal_entry_id, line_id, account_code, description, debit, credit,
    debit_base, credit_base, organization_id, cost_center_id
  )
  select jl.journal_entry_id, jl.id, jl.account_code, jl.description, jl.debit, jl.credit,
         jl.debit_base, jl.credit_base, jl.organization_id, jl.cost_center_id
  from public.journal_lines jl
  join public.journal_entries je on je.id = jl.journal_entry_id
  where je.posted is false
    and je.fact_key like 'carga_inicial_borrador:%'
    and je.organization_id <> 149
    and jl.account_code like '1405%'
    and jl.debit > 0
    and not exists (
      select 1 from public.sobrante_linea_respaldo r
      where r.journal_entry_id = je.id
    );

  update public.journal_lines jl
     set account_code = aux.cuenta
    from public.journal_entries je
    join lateral (
      select public.fn_inventario_auxiliar_1435(je.organization_id, je.branch_id) as cuenta
    ) aux on true
   where jl.journal_entry_id = je.id
     and je.posted is false
     and je.fact_key like 'carga_inicial_borrador:%'
     and je.organization_id <> 149
     and jl.debit > 0
     and jl.account_code like '1405%'
     and aux.cuenta like '1435%';

  insert into public.sobrante_aviso (organization_id, clase, monto, detalle, origen)
  select je.organization_id, 'carga_1435', round(sum(jl.debit), 0),
         jsonb_build_object('asiento', je.id, 'cuenta', min(jl.account_code)),
         'historico'
  from public.journal_lines jl
  join public.journal_entries je on je.id = jl.journal_entry_id
  where je.posted is false
    and je.fact_key like 'carga_inicial_borrador:%'
    and jl.debit > 0
    and jl.account_code like '1435%'
    and exists (
      select 1 from public.sobrante_linea_respaldo r
      where r.journal_entry_id = je.id
        and r.account_code like '1405%'
    )
  group by je.organization_id, je.id;

  if exists (
    select 1
    from public.journal_entries je
    join public.journal_lines jl on jl.journal_entry_id = je.id
    where je.posted is false
      and je.fact_key like 'carga_inicial_borrador:%'
      and jl.debit > 0
      and jl.account_code like '1405%'
  ) then
    raise exception 'carga_inicial_sigue_en_1405';
  end if;

  if exists (
    select 1
    from public.journal_entries je
    join public.journal_lines jl on jl.journal_entry_id = je.id
    where je.fact_key like 'correccion_reversion:%'
      and je.organization_id in (select distinct organization_id from pg_temp._sob_doble)
      and (
        je.posted is true
        or jl.account_code like '4250%'
        or jl.account_code like '4295%'
        or je.organization_id = 149
      )
  ) then
    raise exception 'sobrante_reversion_invalida';
  end if;

  if exists (
    select 1
    from public.journal_entries je
    where je.posted is false
      and (je.fact_key like 'correccion_reversion:%' or je.fact_key like 'correccion_reclasificacion:%' or je.fact_key like 'carga_inicial_borrador:%')
      and je.organization_id <> 149
      and (
        select coalesce(sum(jl.debit), 0) - coalesce(sum(jl.credit), 0)
        from public.journal_lines jl
        where jl.journal_entry_id = je.id
      ) <> 0
  ) then
    raise exception 'sobrante_borrador_descuadrado';
  end if;

  return v_n;
end;
$function$
;

-- fn_correccion_flujo_borradores
CREATE OR REPLACE FUNCTION public.fn_correccion_flujo_borradores()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_editar integer := 0;
  v_org integer;
  v_grupo text;
  v_key text;
  v_entry integer;
  v_posted boolean;
  v_branch integer;
  v_tz text;
  v_fecha timestamptz;
  v_memo text;
  v_d numeric;
  v_c numeric;
  v_cuenta text;
  r record;
  v_solape numeric;
  v_debito numeric;
  v_linea integer;
  v_credito numeric;
  v_quitar numeric;
begin
  if auth.role() in ('anon', 'authenticated') then
    raise exception 'sin_permiso';
  end if;

  if not exists (
    select 1 from public.journal_entries
    where id = 811 and organization_id = 130 and source = 'invoice_sales'
      and memo = 'Venta HB-0012' and posted is true
  ) then
    raise exception 'el asiento 811 no es la factura anulada de la org 130';
  end if;

  if exists (
    select 1 from public.journal_entries
    where fact_key = 'reversal:811' and organization_id = 130 and posted is true
  ) then
    raise exception 'el asiento 811 ya tiene un reverso publicado';
  end if;

  if (
    select round(sum(case when account_code = '2405' then debit else 0 end), 2)
         + round(sum(case when account_code = '4105' then credit else 0 end), 2)
         + round(sum(case when account_code = '1305' then debit else 0 end), 2)
    from public.journal_lines
    where journal_entry_id = 811
  ) is distinct from 1000000.00 then
    raise exception 'las lineas del asiento 811 no coinciden con el comprobante a revertir';
  end if;

  drop table if exists pg_temp._corr_dobles;
  create temporary table _corr_dobles as
  select ia.organization_id, ia.id
  from public.inventory_adjustments ia
  where ia.organization_id <> 149
    and ia.type = 'gain'
    and exists (
      select 1 from public.journal_entries je
      where je.organization_id = ia.organization_id
        and je.source = 'inventory_adjustment'
        and je.source_id = ia.id::text
        and je.posted is true
    )
    and exists (
      select 1
      from public.stock_movements sm
      join public.journal_entries jes
        on jes.organization_id = sm.organization_id
       and jes.source = 'stock_movements'
       and jes.source_id = sm.id::text
       and jes.posted is true
      where sm.organization_id = ia.organization_id
        and sm.source = 'adjustment'
        and sm.source_id = ia.id::text
    );

  drop table if exists pg_temp._corr_solape;
  create temporary table _corr_solape as
  select d.organization_id, jl.account_code, sum(jl.debit) as monto
  from pg_temp._corr_dobles d
  join public.stock_movements sm
    on sm.organization_id = d.organization_id
   and sm.source = 'adjustment'
   and sm.source_id = d.id::text
   and sm.direction = 'out'
  join public.journal_entries je
    on je.organization_id = sm.organization_id
   and je.source = 'stock_movements'
   and je.source_id = sm.id::text
   and je.posted is true
  join public.journal_lines jl
    on jl.journal_entry_id = je.id
   and jl.debit > 0
   and (jl.account_code = '6105-01' or jl.account_code like '6105-01-%')
  group by d.organization_id, jl.account_code
  having sum(jl.debit) >= 0.01;

  with marca as (
    insert into public.correccion_flujo_linea_respaldo (accion)
    values ('edicion_borradores')
    on conflict (accion) where journal_line_id is null do nothing
    returning id
  )
  select count(*) into v_editar from marca;

  if v_editar = 1 then
    if exists (
      select 1
      from public.journal_entries je
      where je.posted is true
        and je.fact_key like 'regla_contable:%'
        and je.organization_id <> 149
        and (
          exists (
            select 1 from public.journal_lines jl
            where jl.journal_entry_id = je.id
              and (jl.account_code = '5150' or jl.account_code like '5150-%')
              and jl.credit > 0
          )
          or exists (
            select 1 from pg_temp._corr_solape s
            where s.organization_id = je.organization_id
          )
        )
    ) then
      raise exception 'un comprobante regla_contable ya esta publicado';
    end if;

    for r in
      select je.id as entry_id, je.organization_id
      from public.journal_entries je
      where je.posted is false
        and je.organization_id <> 149
        and je.fact_key = 'regla_contable:' || je.organization_id::text
        and (
          exists (
            select 1 from public.journal_lines jl
            where jl.journal_entry_id = je.id
              and (jl.account_code = '5150' or jl.account_code like '5150-%')
              and jl.credit > 0
          )
          or exists (
            select 1 from pg_temp._corr_solape s
            where s.organization_id = je.organization_id
          )
        )
    loop
      select coalesce(sum(jl.credit), 0) into v_quitar
      from public.journal_lines jl
      where jl.journal_entry_id = r.entry_id
        and (jl.account_code = '5150' or jl.account_code like '5150-%')
        and jl.credit > 0;

      select coalesce(sum(monto), 0) into v_solape
      from pg_temp._corr_solape
      where organization_id = r.organization_id;

      select count(*), coalesce(sum(debit), 0)
        into v_linea, v_debito
      from public.journal_lines
      where journal_entry_id = r.entry_id
        and account_code = '519595'
        and debit > 0;

      if v_linea <> 1 or v_debito + 0.02 < v_quitar + v_solape then
        raise exception 'la org % no puede absorber el credito de 5150 o el solape', r.organization_id;
      end if;

      insert into public.correccion_flujo_linea_respaldo (
        accion, journal_line_id, journal_entry_id, organization_id, account_code,
        description, debit, credit, debit_base, credit_base
      )
      select 'debito_original', jl.id, jl.journal_entry_id, jl.organization_id, jl.account_code,
             jl.description, jl.debit, jl.credit, jl.debit_base, jl.credit_base
      from public.journal_lines jl
      where jl.journal_entry_id = r.entry_id
        and jl.account_code = '519595'
        and jl.debit > 0
      on conflict (accion, journal_line_id) where journal_line_id is not null do nothing;

      insert into public.correccion_flujo_linea_respaldo (
        accion, journal_line_id, journal_entry_id, organization_id, account_code,
        description, debit, credit, debit_base, credit_base
      )
      select 'quitar_5150', jl.id, jl.journal_entry_id, jl.organization_id, jl.account_code,
             jl.description, jl.debit, jl.credit, jl.debit_base, jl.credit_base
      from public.journal_lines jl
      where jl.journal_entry_id = r.entry_id
        and (jl.account_code = '5150' or jl.account_code like '5150-%')
        and jl.credit > 0
      on conflict (accion, journal_line_id) where journal_line_id is not null do nothing;

      delete from public.journal_lines jl
      where jl.journal_entry_id = r.entry_id
        and (jl.account_code = '5150' or jl.account_code like '5150-%')
        and jl.credit > 0;

      for v_cuenta in
        select account_code from pg_temp._corr_solape where organization_id = r.organization_id
      loop
        select coalesce(sum(monto), 0) into v_solape
        from pg_temp._corr_solape
        where organization_id = r.organization_id
          and account_code = v_cuenta;

        select jl.id, jl.credit into v_linea, v_credito
        from public.journal_lines jl
        where jl.journal_entry_id = r.entry_id
          and jl.account_code = v_cuenta
          and jl.credit > 0
        order by jl.credit desc, jl.id
        limit 1;

        if v_linea is null or v_credito + 0.02 < v_solape then
          raise exception 'la org % no tiene credito suficiente en %', r.organization_id, v_cuenta;
        end if;

        insert into public.correccion_flujo_linea_respaldo (
          accion, journal_line_id, journal_entry_id, organization_id, account_code,
          description, debit, credit, debit_base, credit_base
        )
        select 'quitar_solape_6105', jl.id, jl.journal_entry_id, jl.organization_id, jl.account_code,
               jl.description, jl.debit, jl.credit, jl.debit_base, jl.credit_base
        from public.journal_lines jl
        where jl.id = v_linea
        on conflict (accion, journal_line_id) where journal_line_id is not null do nothing;

        if v_credito - v_solape <= 0.005 then
          delete from public.journal_lines where id = v_linea;
        else
          update public.journal_lines
             set credit = credit - v_solape,
                 credit_base = credit - v_solape,
                 updated_at = now()
           where id = v_linea;
        end if;
      end loop;

      update public.journal_lines
         set debit = debit - v_quitar - (
               select coalesce(sum(monto), 0) from pg_temp._corr_solape where organization_id = r.organization_id
             ),
             debit_base = debit - v_quitar - (
               select coalesce(sum(monto), 0) from pg_temp._corr_solape where organization_id = r.organization_id
             ),
             updated_at = now()
       where journal_entry_id = r.entry_id
         and account_code = '519595'
         and debit > 0;

      delete from public.journal_lines
      where journal_entry_id = r.entry_id
        and account_code = '519595'
        and debit <= 0.005
        and credit <= 0.005;
    end loop;
  end if;

  if exists (
    select 1
    from public.journal_entries je
    join lateral (
      select coalesce(sum(debit), 0) as d, coalesce(sum(credit), 0) as c
      from public.journal_lines jl
      where jl.journal_entry_id = je.id
    ) l on true
    where je.fact_key like 'regla_contable:%'
      and je.posted is false
      and l.d is distinct from l.c
  ) then
    raise exception 'el borrador regla_contable quedo descuadrado';
  end if;

  drop table if exists pg_temp._corr_cruda;
  create temporary table _corr_cruda (
    organization_id integer,
    grupo text,
    clase text,
    cuenta text,
    debito numeric,
    credito numeric
  );

  insert into pg_temp._corr_cruda (organization_id, grupo, clase, cuenta, debito, credito)
  select je.organization_id, 'reversion', 'reversion_masivo', jl.account_code,
         round(sum(jl.credit), 0), round(sum(jl.debit), 0)
  from public.stock_movements sm
  join public.journal_entries je
    on je.organization_id = sm.organization_id
   and je.source = 'stock_movements'
   and je.source_id = sm.id::text
   and je.posted is true
  join public.journal_lines jl on jl.journal_entry_id = je.id
  where sm.organization_id in (137, 338)
    and sm.organization_id <> 149
    and sm.source = 'adjustment'
    and sm.source_id is null
    and coalesce(sm.note, '') ilike 'Ajuste masivo%'
    and not exists (
      select 1 from public.journal_entries rev
      where rev.organization_id = je.organization_id
        and rev.posted is true
        and rev.fact_key = 'reversal:' || je.id::text
    )
  group by je.organization_id, jl.account_code
  having round(sum(jl.debit), 0) <> 0 or round(sum(jl.credit), 0) <> 0;

  insert into pg_temp._corr_cruda (organization_id, grupo, clase, cuenta, debito, credito)
  select je.organization_id, 'reversion', 'reversion_sobrante', jl.account_code,
         round(sum(jl.credit), 0), round(sum(jl.debit), 0)
  from pg_temp._corr_dobles d
  join public.stock_movements sm
    on sm.organization_id = d.organization_id
   and sm.source = 'adjustment'
   and sm.source_id = d.id::text
  join public.journal_entries je
    on je.organization_id = sm.organization_id
   and je.source = 'stock_movements'
   and je.source_id = sm.id::text
   and je.posted is true
  join public.journal_lines jl on jl.journal_entry_id = je.id
  where not exists (
    select 1 from public.journal_entries rev
    where rev.organization_id = je.organization_id
      and rev.posted is true
      and rev.fact_key = 'reversal:' || je.id::text
  )
  group by je.organization_id, jl.account_code
  having round(sum(jl.debit), 0) <> 0 or round(sum(jl.credit), 0) <> 0;

  insert into pg_temp._corr_cruda (organization_id, grupo, clase, cuenta, debito, credito)
  select 130, 'reversion', 'reversion_factura_anulada', jl.account_code,
         round(sum(jl.credit), 0), round(sum(jl.debit), 0)
  from public.journal_lines jl
  where jl.journal_entry_id = 811
  group by jl.account_code;

  insert into pg_temp._corr_cruda (organization_id, grupo, clase, cuenta, debito, credito)
  select s.organization_id, 'reclasificacion', 'reclas_2105', '2105', s.neto, 0
  from (
    select je.organization_id,
           round(sum(jl.credit) - sum(jl.debit), 0) as neto,
           case when o.type_id in (4, 6) then '2335' else '2205' end as destino
    from public.journal_lines jl
    join public.journal_entries je on je.id = jl.journal_entry_id
    join public.organizations o on o.id = je.organization_id
    where je.posted is true
      and je.organization_id <> 149
      and jl.account_code = '2105'
    group by je.organization_id, o.type_id
    having round(sum(jl.credit) - sum(jl.debit), 0) >= 1
  ) s
  union all
  select s.organization_id, 'reclasificacion', 'reclas_2105', s.destino, 0, s.neto
  from (
    select je.organization_id,
           round(sum(jl.credit) - sum(jl.debit), 0) as neto,
           case when o.type_id in (4, 6) then '2335' else '2205' end as destino
    from public.journal_lines jl
    join public.journal_entries je on je.id = jl.journal_entry_id
    join public.organizations o on o.id = je.organization_id
    where je.posted is true
      and je.organization_id <> 149
      and jl.account_code = '2105'
    group by je.organization_id, o.type_id
    having round(sum(jl.credit) - sum(jl.debit), 0) >= 1
  ) s;

  drop table if exists pg_temp._corr_2405;
  create temporary table _corr_2405 as
  with recursive caminata as (
    select je.id, je.organization_id, je.source, je.fact_key, je.source as raiz, 0 as nivel
    from public.journal_entries je
    where je.posted is true
      and je.organization_id <> 149
      and je.id <> 811
      and exists (
        select 1 from public.journal_lines jl
        where jl.journal_entry_id = je.id
          and jl.account_code = '2405'
      )
    union all
    select c.id, c.organization_id, c.source, padre.fact_key, padre.source, c.nivel + 1
    from caminata c
    join public.journal_entries padre
      on c.raiz = 'reversal'
     and padre.id::text = regexp_replace(coalesce(c.fact_key, ''), '^reversal:', '')
     and c.nivel < 4
  ),
  raices as (
    select distinct on (c.id) c.id, c.raiz
    from caminata c
    order by c.id, c.nivel desc
  )
  select je.organization_id, je.id as entry_id, je.source, ra.raiz, jl.debit, jl.credit
  from public.journal_lines jl
  join public.journal_entries je on je.id = jl.journal_entry_id
  join raices ra on ra.id = je.id
  where jl.account_code = '2405';

  if exists (
    select 1 from pg_temp._corr_2405
    where raiz not in (
      'invoice_purchase', 'purchase', 'purchase_order', 'accounts_payable',
      'invoice_sales', 'sales', 'reservation', 'credit_note'
    )
  ) then
    raise exception 'hay 2405 sin clasificar';
  end if;

  insert into pg_temp._corr_cruda (organization_id, grupo, clase, cuenta, debito, credito)
  select s.organization_id, 'reclasificacion', 'reclas_2405_descontable', '240810', s.neto, 0
  from (
    select organization_id, round(sum(debit - credit), 0) as neto
    from pg_temp._corr_2405
    where raiz in ('invoice_purchase', 'purchase', 'purchase_order', 'accounts_payable')
    group by organization_id
    having round(sum(debit - credit), 0) >= 1
  ) s
  union all
  select s.organization_id, 'reclasificacion', 'reclas_2405_descontable', '2405', 0, s.neto
  from (
    select organization_id, round(sum(debit - credit), 0) as neto
    from pg_temp._corr_2405
    where raiz in ('invoice_purchase', 'purchase', 'purchase_order', 'accounts_payable')
    group by organization_id
    having round(sum(debit - credit), 0) >= 1
  ) s;

  insert into pg_temp._corr_cruda (organization_id, grupo, clase, cuenta, debito, credito)
  select s.organization_id, 'reclasificacion', 'reclas_2405_generado',
         case when s.neto >= 0 then '2405' else '240805' end,
         abs(s.neto), 0
  from (
    select organization_id, round(sum(
      case
        when credit > 0 and (
          source in ('invoice_sales', 'sales', 'reservation')
          or (source = 'reversal' and raiz in ('invoice_sales', 'sales', 'reservation', 'credit_note'))
        ) then credit
        when debit > 0 and (
          source = 'credit_note'
          or (source = 'reversal' and raiz in ('invoice_sales', 'sales', 'reservation', 'credit_note'))
        ) then -debit
        else 0
      end
    ), 0) as neto
    from pg_temp._corr_2405
    group by organization_id
    having abs(round(sum(
      case
        when credit > 0 and (
          source in ('invoice_sales', 'sales', 'reservation')
          or (source = 'reversal' and raiz in ('invoice_sales', 'sales', 'reservation', 'credit_note'))
        ) then credit
        when debit > 0 and (
          source = 'credit_note'
          or (source = 'reversal' and raiz in ('invoice_sales', 'sales', 'reservation', 'credit_note'))
        ) then -debit
        else 0
      end
    ), 0)) >= 1
  ) s
  union all
  select s.organization_id, 'reclasificacion', 'reclas_2405_generado',
         case when s.neto >= 0 then '240805' else '2405' end,
         0, abs(s.neto)
  from (
    select organization_id, round(sum(
      case
        when credit > 0 and (
          source in ('invoice_sales', 'sales', 'reservation')
          or (source = 'reversal' and raiz in ('invoice_sales', 'sales', 'reservation', 'credit_note'))
        ) then credit
        when debit > 0 and (
          source = 'credit_note'
          or (source = 'reversal' and raiz in ('invoice_sales', 'sales', 'reservation', 'credit_note'))
        ) then -debit
        else 0
      end
    ), 0) as neto
    from pg_temp._corr_2405
    group by organization_id
    having abs(round(sum(
      case
        when credit > 0 and (
          source in ('invoice_sales', 'sales', 'reservation')
          or (source = 'reversal' and raiz in ('invoice_sales', 'sales', 'reservation', 'credit_note'))
        ) then credit
        when debit > 0 and (
          source = 'credit_note'
          or (source = 'reversal' and raiz in ('invoice_sales', 'sales', 'reservation', 'credit_note'))
        ) then -debit
        else 0
      end
    ), 0)) >= 1
  ) s;

  insert into pg_temp._corr_cruda (organization_id, grupo, clase, cuenta, debito, credito)
  select s.organization_id, 'reclasificacion', 'reclas_5150', '5145', s.neto, 0
  from (
    select je.organization_id, jl.account_code,
           round(sum(jl.debit) - sum(jl.credit), 0) as neto
    from public.journal_lines jl
    join public.journal_entries je on je.id = jl.journal_entry_id
    where je.posted is true
      and je.organization_id <> 149
      and (jl.account_code = '5150' or jl.account_code like '5150-%')
    group by je.organization_id, jl.account_code
    having round(sum(jl.debit) - sum(jl.credit), 0) >= 1
  ) s
  union all
  select s.organization_id, 'reclasificacion', 'reclas_5150', s.account_code, 0, s.neto
  from (
    select je.organization_id, jl.account_code,
           round(sum(jl.debit) - sum(jl.credit), 0) as neto
    from public.journal_lines jl
    join public.journal_entries je on je.id = jl.journal_entry_id
    where je.posted is true
      and je.organization_id <> 149
      and (jl.account_code = '5150' or jl.account_code like '5150-%')
    group by je.organization_id, jl.account_code
    having round(sum(jl.debit) - sum(jl.credit), 0) >= 1
  ) s;

  insert into pg_temp._corr_cruda (organization_id, grupo, clase, cuenta, debito, credito)
  select s.organization_id, 'reclasificacion', 'reclas_4250', s.account_code, s.monto, 0
  from (
    select ia.organization_id, jl.account_code,
           case
             when lower(btrim(coalesce(ia.reason, ''))) in ('initial_setup', 'saldo_inicial') then '3105'
             when lower(btrim(coalesce(ia.reason, ''))) in ('compra_sin_orden', 'compra sin orden') then '2205'
             when lower(btrim(coalesce(ia.reason, ''))) in ('physical_count', 'audit') then null
             else '4295'
           end as destino,
           round(sum(jl.credit), 0) as monto
    from public.journal_lines jl
    join public.journal_entries je on je.id = jl.journal_entry_id
    join public.inventory_adjustments ia
      on je.source = 'inventory_adjustment'
     and je.source_id = ia.id::text
     and ia.organization_id = je.organization_id
    where je.posted is true
      and je.organization_id <> 149
      and jl.credit > 0
      and (jl.account_code = '4250' or jl.account_code like '4250-%')
      and not (ia.organization_id = 204 and upper(btrim(ia.code)) ~ '^AJ-020[1-7]$')
    group by ia.organization_id, jl.account_code, 3
    having round(sum(jl.credit), 0) >= 1
  ) s
  where s.destino is not null
  union all
  select s.organization_id, 'reclasificacion', 'reclas_4250', s.destino, 0, s.monto
  from (
    select ia.organization_id, jl.account_code,
           case
             when lower(btrim(coalesce(ia.reason, ''))) in ('initial_setup', 'saldo_inicial') then '3105'
             when lower(btrim(coalesce(ia.reason, ''))) in ('compra_sin_orden', 'compra sin orden') then '2205'
             when lower(btrim(coalesce(ia.reason, ''))) in ('physical_count', 'audit') then null
             else '4295'
           end as destino,
           round(sum(jl.credit), 0) as monto
    from public.journal_lines jl
    join public.journal_entries je on je.id = jl.journal_entry_id
    join public.inventory_adjustments ia
      on je.source = 'inventory_adjustment'
     and je.source_id = ia.id::text
     and ia.organization_id = je.organization_id
    where je.posted is true
      and je.organization_id <> 149
      and jl.credit > 0
      and (jl.account_code = '4250' or jl.account_code like '4250-%')
      and not (ia.organization_id = 204 and upper(btrim(ia.code)) ~ '^AJ-020[1-7]$')
    group by ia.organization_id, jl.account_code, 3
    having round(sum(jl.credit), 0) >= 1
  ) s
  where s.destino is not null;

  insert into pg_temp._corr_cruda (organization_id, grupo, clase, cuenta, debito, credito)
  select 130, 'reclasificacion', 'reclas_4105', '4105', s.neto, 0
  from (
    select round(sum(jl.credit) - sum(jl.debit), 0) as neto
    from public.journal_lines jl
    join public.journal_entries je on je.id = jl.journal_entry_id
    where je.organization_id = 130
      and je.posted is true
      and je.id <> 811
      and jl.account_code = '4105'
  ) s
  where s.neto >= 1
  union all
  select 130, 'reclasificacion', 'reclas_4105', '4140', 0, s.neto
  from (
    select round(sum(jl.credit) - sum(jl.debit), 0) as neto
    from public.journal_lines jl
    join public.journal_entries je on je.id = jl.journal_entry_id
    where je.organization_id = 130
      and je.posted is true
      and je.id <> 811
      and jl.account_code = '4105'
  ) s
  where s.neto >= 1;

  insert into pg_temp._corr_cruda (organization_id, grupo, clase, cuenta, debito, credito)
  select s.organization_id, 'reclasificacion', 'reclas_6105_01', s.destino, s.residual, 0
  from (
    select base.organization_id, base.account_code,
           round(base.neto, 0) as residual,
           coalesce(
             (
               select c.account_code
               from public.configuracion_contable c
               join public.chart_of_accounts a
                 on a.organization_id = c.organization_id
                and a.account_code = c.account_code
               where c.organization_id = base.organization_id
                 and c.clave = 'costo_ventas'
                 and c.branch_id is null
                 and c.account_code in ('6135', '6140')
                 and coalesce(a.is_active, true)
                 and a.es_movimiento is distinct from false
               limit 1
             ),
             case when o.type_id in (1, 2) then '6140' else '6135' end
           ) as destino
    from (
      select p.organization_id, p.account_code,
             p.neto
             + coalesce(g.neto, 0)
             + coalesce(v.neto, 0) as neto
      from (
        select je.organization_id, jl.account_code, sum(jl.debit) - sum(jl.credit) as neto
        from public.journal_lines jl
        join public.journal_entries je on je.id = jl.journal_entry_id
        where je.posted is true
          and je.organization_id <> 149
          and (jl.account_code = '6105-01' or jl.account_code like '6105-01-%')
        group by je.organization_id, jl.account_code
      ) p
      left join (
        select je.organization_id, jl.account_code, sum(jl.debit) - sum(jl.credit) as neto
        from public.journal_lines jl
        join public.journal_entries je on je.id = jl.journal_entry_id
        where je.posted is false
          and je.fact_key like 'regla_contable:%'
          and (jl.account_code = '6105-01' or jl.account_code like '6105-01-%')
        group by je.organization_id, jl.account_code
      ) g
        on g.organization_id = p.organization_id
       and g.account_code = p.account_code
      left join (
        select c.organization_id, c.cuenta as account_code, sum(c.debito) - sum(c.credito) as neto
        from pg_temp._corr_cruda c
        where c.grupo = 'reversion'
          and (c.cuenta = '6105-01' or c.cuenta like '6105-01-%')
        group by c.organization_id, c.cuenta
      ) v
        on v.organization_id = p.organization_id
       and v.account_code = p.account_code
    ) base
    join public.organizations o on o.id = base.organization_id
    where base.organization_id not in (137, 338, 149)
      and round(base.neto, 0) >= 1
  ) s
  where s.destino is distinct from s.account_code
  union all
  select s.organization_id, 'reclasificacion', 'reclas_6105_01', s.account_code, 0, s.residual
  from (
    select base.organization_id, base.account_code,
           round(base.neto, 0) as residual,
           coalesce(
             (
               select c.account_code
               from public.configuracion_contable c
               join public.chart_of_accounts a
                 on a.organization_id = c.organization_id
                and a.account_code = c.account_code
               where c.organization_id = base.organization_id
                 and c.clave = 'costo_ventas'
                 and c.branch_id is null
                 and c.account_code in ('6135', '6140')
                 and coalesce(a.is_active, true)
                 and a.es_movimiento is distinct from false
               limit 1
             ),
             case when o.type_id in (1, 2) then '6140' else '6135' end
           ) as destino
    from (
      select p.organization_id, p.account_code,
             p.neto + coalesce(g.neto, 0) + coalesce(v.neto, 0) as neto
      from (
        select je.organization_id, jl.account_code, sum(jl.debit) - sum(jl.credit) as neto
        from public.journal_lines jl
        join public.journal_entries je on je.id = jl.journal_entry_id
        where je.posted is true
          and je.organization_id <> 149
          and (jl.account_code = '6105-01' or jl.account_code like '6105-01-%')
        group by je.organization_id, jl.account_code
      ) p
      left join (
        select je.organization_id, jl.account_code, sum(jl.debit) - sum(jl.credit) as neto
        from public.journal_lines jl
        join public.journal_entries je on je.id = jl.journal_entry_id
        where je.posted is false
          and je.fact_key like 'regla_contable:%'
          and (jl.account_code = '6105-01' or jl.account_code like '6105-01-%')
        group by je.organization_id, jl.account_code
      ) g
        on g.organization_id = p.organization_id
       and g.account_code = p.account_code
      left join (
        select c.organization_id, c.cuenta as account_code, sum(c.debito) - sum(c.credito) as neto
        from pg_temp._corr_cruda c
        where c.grupo = 'reversion'
          and (c.cuenta = '6105-01' or c.cuenta like '6105-01-%')
        group by c.organization_id, c.cuenta
      ) v
        on v.organization_id = p.organization_id
       and v.account_code = p.account_code
    ) base
    join public.organizations o on o.id = base.organization_id
    where base.organization_id not in (137, 338, 149)
      and round(base.neto, 0) >= 1
  ) s
  where s.destino is distinct from s.account_code;

  if not exists (
    select 1 from pg_temp._corr_cruda
    where organization_id = 137 and clase = 'reversion_masivo'
  ) then
    raise exception 'no se encontro el ajuste masivo pendiente de la org 137';
  end if;

  drop table if exists pg_temp._corr_neta;
  create temporary table _corr_neta as
  select organization_id, grupo, cuenta,
         case when round(sum(debito), 0) > round(sum(credito), 0)
              then round(sum(debito), 0) - round(sum(credito), 0) else 0 end as debito,
         case when round(sum(credito), 0) > round(sum(debito), 0)
              then round(sum(credito), 0) - round(sum(debito), 0) else 0 end as credito
  from pg_temp._corr_cruda
  group by organization_id, grupo, cuenta
  having abs(round(sum(debito), 0) - round(sum(credito), 0)) >= 1;

  drop table if exists pg_temp._corr_estado;
  create temporary table _corr_estado (
    organization_id integer,
    grupo text,
    nota text,
    journal_entry_id integer
  );

  for v_org, v_grupo in
    select distinct n.organization_id, n.grupo
    from pg_temp._corr_neta n
    where n.organization_id <> 149
    order by 1, 2
  loop
    v_key := case when v_grupo = 'reversion'
      then 'correccion_reversion:'
      else 'correccion_reclasificacion:'
    end || v_org::text;
    v_memo := case when v_grupo = 'reversion'
      then 'Reversión por corrección de regla contable'
      else 'Reclasificación por corrección de regla contable'
    end;

    select je.id, coalesce(je.posted, false)
      into v_entry, v_posted
    from public.journal_entries je
    where je.organization_id = v_org
      and je.fact_key = v_key;
    if not found then
      v_entry := null;
      v_posted := false;
    end if;

    if v_posted then
      insert into pg_temp._corr_estado values (v_org, v_grupo, 'ya_publicado', v_entry);
      continue;
    end if;

    select b.id into v_branch
    from public.branches b
    where b.organization_id = v_org
      and b.is_main is true
      and b.is_active is true
    order by b.id
    limit 1;
    if v_branch is null then
      select min(b.id) into v_branch
      from public.branches b
      where b.organization_id = v_org;
    end if;
    if v_branch is null then
      insert into pg_temp._corr_estado values (v_org, v_grupo, 'sin_sucursal', null);
      continue;
    end if;

    if exists (
      select 1
      from pg_temp._corr_neta n
      where n.organization_id = v_org
        and n.grupo = v_grupo
        and not exists (
          select 1 from public.chart_of_accounts c
          where c.organization_id = n.organization_id
            and c.account_code = n.cuenta
            and coalesce(c.is_active, true)
            and c.es_movimiento is distinct from false
        )
    ) then
      insert into pg_temp._corr_estado values (v_org, v_grupo, 'sin_cuenta', null);
      continue;
    end if;

    select coalesce(nullif(btrim(o.timezone), ''), 'America/Bogota')
      into v_tz
    from public.organizations o
    where o.id = v_org;
    v_fecha := date_trunc('month', now() at time zone v_tz) at time zone v_tz;

    -- corr_sin_lineas: sin pesos no hay cabecera.
    if not exists (
      select 1 from pg_temp._corr_neta n
      where n.organization_id = v_org
        and n.grupo = v_grupo
        and (round(coalesce(n.debito, 0), 0) >= 1 or round(coalesce(n.credito, 0), 0) >= 1)
    ) then
      if v_entry is not null and v_posted is not true then
        delete from public.journal_lines where journal_entry_id = v_entry;
        delete from public.journal_entries where id = v_entry and posted is false;
      end if;
      insert into pg_temp._corr_estado values (v_org, v_grupo, 'sin_movimiento', null);
      continue;
    end if;

    if v_entry is null then
      insert into public.journal_entries (
        organization_id, branch_id, entry_date, memo, source, source_id, posted, fact_key
      ) values (
        v_org, v_branch, v_fecha, v_memo, 'manual', v_org::text, false, v_key
      )
      returning id into v_entry;
    else
      delete from public.journal_lines where journal_entry_id = v_entry;
      update public.journal_entries
         set entry_date = v_fecha,
             memo = v_memo,
             posted = false,
             updated_at = now()
       where id = v_entry;
    end if;

    insert into public.journal_lines (
      journal_entry_id, account_code, description, debit, credit,
      organization_id, debit_base, credit_base
    )
    select v_entry, n.cuenta, v_memo, n.debito, n.credito, v_org, n.debito, n.credito
    from pg_temp._corr_neta n
    where n.organization_id = v_org
      and n.grupo = v_grupo;

    select coalesce(sum(debit), 0), coalesce(sum(credit), 0)
      into v_d, v_c
    from public.journal_lines
    where journal_entry_id = v_entry;

    if v_d <> v_c then
      if abs(v_d - v_c) > 5 then
        raise exception 'descuadre org % % debito % credito %', v_org, v_grupo, v_d, v_c;
      end if;
      perform public.fn_redondear_asiento_pesos(v_entry);
      select coalesce(sum(debit), 0), coalesce(sum(credit), 0)
        into v_d, v_c
      from public.journal_lines
      where journal_entry_id = v_entry;
      if v_d <> v_c then
        raise exception 'descuadre org % % debito % credito %', v_org, v_grupo, v_d, v_c;
      end if;
    end if;

    if not exists (
      select 1 from public.journal_lines
      where journal_entry_id = v_entry
        and (coalesce(debit, 0) <> 0 or coalesce(credit, 0) <> 0)
    ) then
      delete from public.journal_lines where journal_entry_id = v_entry;
      delete from public.journal_entries where id = v_entry and posted is false;
      insert into pg_temp._corr_estado values (v_org, v_grupo, 'sin_movimiento', null);
      continue;
    end if;

    insert into pg_temp._corr_estado values (v_org, v_grupo, null, v_entry);
  end loop;

  delete from public.journal_lines jl
  using public.journal_entries je
  where je.id = jl.journal_entry_id
    and je.posted is false
    and (je.fact_key like 'correccion_reversion:%' or je.fact_key like 'correccion_reclasificacion:%')
    and not exists (
      select 1 from pg_temp._corr_estado e
      where e.journal_entry_id = je.id
        and e.nota is null
    );

  delete from public.journal_entries je
  where je.posted is false
    and (je.fact_key like 'correccion_reversion:%' or je.fact_key like 'correccion_reclasificacion:%')
    and not exists (
      select 1 from pg_temp._corr_estado e
      where e.journal_entry_id = je.id
        and e.nota is null
    );

  delete from public.correccion_flujo_aviso;

  insert into public.correccion_flujo_aviso (organization_id, clase, journal_entry_id, monto, detalle, nota)
  select c.organization_id, c.clase, e.journal_entry_id, round(sum(c.debito), 0),
         jsonb_build_object('cuentas', jsonb_agg(distinct c.cuenta)),
         e.nota
  from pg_temp._corr_cruda c
  left join pg_temp._corr_estado e
    on e.organization_id = c.organization_id
   and e.grupo = c.grupo
  where c.clase <> 'reversion_masivo'
  group by c.organization_id, c.clase, e.journal_entry_id, e.nota
  having round(sum(c.debito), 0) >= 1;

  insert into public.correccion_flujo_aviso (organization_id, clase, journal_entry_id, monto, detalle, nota)
  select m.organization_id, 'reversion_masivo', e.journal_entry_id, m.pendiente,
         jsonb_build_object('pendiente', m.pendiente, 'ya_revertido', m.ya, 'asientos', m.asientos),
         case when m.pendiente = 0 and m.ya > 0 then 'ya_revertido' else e.nota end
  from (
    select je.organization_id,
           coalesce(round(sum(jl.debit) filter (
             where not exists (
               select 1 from public.journal_entries rev
               where rev.organization_id = je.organization_id
                 and rev.posted is true
                 and rev.fact_key = 'reversal:' || je.id::text
             )
           ), 0), 0) as pendiente,
           coalesce(round(sum(jl.debit) filter (
             where exists (
               select 1 from public.journal_entries rev
               where rev.organization_id = je.organization_id
                 and rev.posted is true
                 and rev.fact_key = 'reversal:' || je.id::text
             )
           ), 0), 0) as ya,
           count(distinct je.id) as asientos
    from public.stock_movements sm
    join public.journal_entries je
      on je.organization_id = sm.organization_id
     and je.source = 'stock_movements'
     and je.source_id = sm.id::text
     and je.posted is true
    join public.journal_lines jl on jl.journal_entry_id = je.id
    where sm.organization_id in (137, 338)
      and sm.source = 'adjustment'
      and sm.source_id is null
      and coalesce(sm.note, '') ilike 'Ajuste masivo%'
    group by je.organization_id
  ) m
  left join pg_temp._corr_estado e
    on e.organization_id = m.organization_id
   and e.grupo = 'reversion';

  insert into public.correccion_flujo_aviso (organization_id, clase, monto, detalle, nota)
  select ia.organization_id, 'reclas_4250_se_queda', round(sum(jl.credit), 0),
         jsonb_build_object('motivo', lower(btrim(coalesce(ia.reason, '')))),
         'se_queda'
  from public.journal_lines jl
  join public.journal_entries je on je.id = jl.journal_entry_id
  join public.inventory_adjustments ia
    on je.source = 'inventory_adjustment'
   and je.source_id = ia.id::text
   and ia.organization_id = je.organization_id
  where je.posted is true
    and je.organization_id <> 149
    and jl.credit > 0
    and (jl.account_code = '4250' or jl.account_code like '4250-%')
    and lower(btrim(coalesce(ia.reason, ''))) in ('physical_count', 'audit')
    and not (ia.organization_id = 204 and upper(btrim(ia.code)) ~ '^AJ-020[1-7]$')
  group by ia.organization_id, lower(btrim(coalesce(ia.reason, '')))
  having round(sum(jl.credit), 0) >= 1;

  insert into public.correccion_flujo_aviso (organization_id, clase, monto, detalle, nota)
  select 204, 'pendiente_confirmacion', round(sum(jl.credit), 0),
         jsonb_build_object('codigos', 'AJ-0201 a AJ-0207', 'motivo', 'physical_count'),
         'en_espera_de_confirmacion'
  from public.journal_lines jl
  join public.journal_entries je on je.id = jl.journal_entry_id
  join public.inventory_adjustments ia
    on je.source = 'inventory_adjustment'
   and je.source_id = ia.id::text
   and ia.organization_id = je.organization_id
  where ia.organization_id = 204
    and je.posted is true
    and upper(btrim(ia.code)) ~ '^AJ-020[1-7]$'
    and jl.credit > 0
    and jl.account_code = '4250';

  insert into public.correccion_flujo_aviso (organization_id, clase, monto, detalle, nota)
  select t.organization_id, 'reclas_2405_pendiente', t.monto,
         jsonb_build_object('debito_factura', t.monto),
         'pendiente'
  from (
    select organization_id, round(sum(debit), 0) as monto
    from pg_temp._corr_2405
    where source in ('invoice_sales', 'sales')
      and debit > 0
    group by organization_id
    having round(sum(debit), 0) >= 1
  ) t;

  insert into public.correccion_flujo_aviso (organization_id, clase, monto, detalle, nota)
  select base.organization_id, 'reclas_6105_01', round(abs(base.neto), 0),
         jsonb_build_object('cuenta', base.account_code, 'neto', round(base.neto, 0)),
         case
           when base.organization_id in (137, 338) then 'excluida_reversion_masiva'
           else 'saldo_credito'
         end
  from (
    select p.organization_id, p.account_code,
           p.neto + coalesce(g.neto, 0) + coalesce(v.neto, 0) as neto
    from (
      select je.organization_id, jl.account_code, sum(jl.debit) - sum(jl.credit) as neto
      from public.journal_lines jl
      join public.journal_entries je on je.id = jl.journal_entry_id
      where je.posted is true
        and je.organization_id <> 149
        and (jl.account_code = '6105-01' or jl.account_code like '6105-01-%')
      group by je.organization_id, jl.account_code
    ) p
    left join (
      select je.organization_id, jl.account_code, sum(jl.debit) - sum(jl.credit) as neto
      from public.journal_lines jl
      join public.journal_entries je on je.id = jl.journal_entry_id
      where je.posted is false
        and je.fact_key like 'regla_contable:%'
        and (jl.account_code = '6105-01' or jl.account_code like '6105-01-%')
      group by je.organization_id, jl.account_code
    ) g
      on g.organization_id = p.organization_id and g.account_code = p.account_code
    left join (
      select c.organization_id, c.cuenta as account_code, sum(c.debito) - sum(c.credito) as neto
      from pg_temp._corr_cruda c
      where c.grupo = 'reversion'
        and (c.cuenta = '6105-01' or c.cuenta like '6105-01-%')
      group by c.organization_id, c.cuenta
    ) v
      on v.organization_id = p.organization_id and v.account_code = p.account_code
  ) base
  where base.organization_id in (137, 338)
     or round(base.neto, 0) <= -1;

  insert into public.correccion_flujo_aviso (organization_id, clase, monto, detalle, nota)
  select base.organization_id, '6105_sin_mover', round(abs(base.neto), 0),
         jsonb_build_object('cuenta', base.account_code, 'neto', round(base.neto, 0)),
         'sin_reclasificar'
  from (
    select p.organization_id, p.account_code,
           p.neto + coalesce(v.neto, 0) as neto
    from (
      select je.organization_id, jl.account_code, sum(jl.debit) - sum(jl.credit) as neto
      from public.journal_lines jl
      join public.journal_entries je on je.id = jl.journal_entry_id
      where je.posted is true
        and je.organization_id <> 149
        and (
          jl.account_code = '6105'
          or (jl.account_code like '6105-%' and jl.account_code not like '6105-01' and jl.account_code not like '6105-01-%')
        )
      group by je.organization_id, jl.account_code
    ) p
    left join (
      select c.organization_id, c.cuenta as account_code, sum(c.debito) - sum(c.credito) as neto
      from pg_temp._corr_cruda c
      where c.grupo = 'reversion'
      group by c.organization_id, c.cuenta
    ) v
      on v.organization_id = p.organization_id and v.account_code = p.account_code
  ) base
  where abs(round(base.neto, 0)) >= 1;

  insert into public.correccion_flujo_aviso (organization_id, clase, monto, detalle, nota)
  select nom.organization_id, 'renombre', 0,
         jsonb_build_object('cuenta', nom.account_code, 'nombre_anterior', nom.name),
         'sin_comprobante'
  from public.correccion_flujo_nombre_respaldo nom;

  insert into public.correccion_flujo_aviso (organization_id, clase, monto, detalle, nota)
  values (null, 'renombre', 0, jsonb_build_object('cuenta', '2495'), 'sin_lineas_impuesto_consumo');

  if exists (
    select 1
    from public.journal_entries je
    join lateral (
      select coalesce(sum(debit), 0) as d,
             coalesce(sum(credit), 0) as c,
             bool_or(debit <> round(debit, 0) or credit <> round(credit, 0)) as fraccion
      from public.journal_lines jl
      where jl.journal_entry_id = je.id
    ) l on true
    where (je.fact_key like 'correccion_reversion:%' or je.fact_key like 'correccion_reclasificacion:%')
      and (
        je.posted is true
        or je.organization_id = 149
        or l.d <> l.c
        or l.fraccion
      )
  ) then
    raise exception 'borrador de correccion descuadrado, publicado o de la org 149';
  end if;

  return jsonb_build_object(
    'borradores', (
      select count(*) from public.journal_entries
      where (fact_key like 'correccion_reversion:%' or fact_key like 'correccion_reclasificacion:%')
        and posted is false
    ),
    'avisos', (select count(*) from public.correccion_flujo_aviso),
    'editados', v_editar
  );
end;
$function$
;

drop function if exists public.fn_marcar_revision_iva(integer, text, text, text, text);
drop function if exists public.fn_cuenta_auxiliar_de_titulo(integer, integer, text, numeric, text);
-- La tabla de revisión se conserva si tiene filas (datos para el contador).
do $$ begin
  if not exists (select 1 from public.contabilidad_revision_iva) then
    drop table public.contabilidad_revision_iva;
  end if;
end $$;
