-- P1 (25-oct-2026): fusión de public.fn_reintentar_fallos_asiento (conflicto entre 134030 y 134000).
-- 134030 quitó el respaldo fijo array['4250','4295','4210'] (banco, ingreso) pero no traía la rama de stock
-- cuenta_no_configurada; 134000 trae esa rama pero conserva el '4295'. En el orden del plan
-- (134010 → 134020 → 134030 → 134000 → 134005 → 134040 → 134050) 134000 corre después de 134030 y deja viva
-- la versión con '4295': el control previo de 134060 la detecta y NO titula 4295 en ninguna org.
-- Esta versión = 134000 (rama stock desde el 26-oct-2026 Bogotá vía fn_reprocesar_fallos_stock_desde)
--   + ingreso bancario por la clave ingresos_diversos (fn_cuenta_ingresos_diversos, igual que 134030), sin '4295'.
-- Corre después de 134050 y antes de 134060. Idempotente (CREATE OR REPLACE).
-- Rollback: supabase/rollbacks/20261025134055_p1_merge_fn_reintentar_fallos_asiento_rollback.sql

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
  v_org integer;
  v_stock jsonb;
begin
  for f in
    select *
      from public.journal_entry_failures
     where resolved_at is null
       and reason in ('cuenta_linea', 'sin_cuenta', 'tercero_requerido', 'cuenta_no_configurada')
       and fact_key is not null
       -- Inventario (stock_movement:*) va por fn_reprocesar_fallos_stock, abajo.
       and not (reason = 'cuenta_no_configurada' and coalesce(fact_key, '') like 'stock_movement:%')
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
                v_credito := public.fn_primera_cuenta_detalle(v_bt.organization_id, array[public.fn_cuenta_ingresos_diversos(v_bt.organization_id, v_branch)]);
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
           and reason in ('cuenta_linea', 'sin_cuenta', 'tercero_requerido', 'cuenta_no_configurada');
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

  -- Fallos de inventario cuenta_no_configurada NUEVOS (desde el 26-oct-2026 Bogotá).
  -- El atraso anterior (345, 346, 199: 12.244 fallos) NO lo toca el cron: se reprocesa a mano
  -- con fn_reprocesar_fallos_stock(org) y el OK de Juan.
  for v_org in
    select distinct jf.organization_id
      from public.journal_entry_failures jf
     where jf.resolved_at is null
       and jf.reason = 'cuenta_no_configurada'
       and jf.source = 'stock_movements'
       and jf.fact_key like 'stock_movement:%'
       and jf.created_at >= timestamptz '2026-10-26 00:00:00-05'
  loop
    begin
      v_stock := public.fn_reprocesar_fallos_stock_desde(v_org, timestamptz '2026-10-26 00:00:00-05', 500);
      v_resueltos := v_resueltos + coalesce((v_stock->>'resueltos')::integer, 0) + coalesce((v_stock->>'ya_existian')::integer, 0);
      v_siguen := v_siguen + coalesce((v_stock->>'siguen')::integer, 0);
      if v_aviso is null then
        v_aviso := v_stock->>'aviso';
      end if;
    exception when others then
      if v_aviso is null then
        v_aviso := 'stock org ' || v_org || ': ' || sqlerrm;
      end if;
    end;
  end loop;

  return jsonb_build_object('resueltos', v_resueltos, 'siguen', v_siguen, 'aviso', v_aviso);
end;
$function$
;
