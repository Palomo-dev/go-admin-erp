-- Devuelve fn_create_journal_entry a la firma de 14 argumentos, restaura el
-- UPDATE de cost_center_id en los asientos de caja y banco (vuelve a chocar
-- con el asiento publicado) y el errcode 42501 de ASIENTO_PUBLICADO_INMUTABLE.
--
-- No borra movimientos de caja, transacciones bancarias ni asientos creados
-- mientras esta migración estuvo aplicada. Las líneas que ya tienen
-- cost_center_id lo conservan.

create or replace function pg_temp.reemplazar_exacto(
  p_def text,
  p_viejo text,
  p_nuevo text,
  p_etiqueta text,
  p_veces integer
) returns text
language plpgsql
as $r$
declare
  v_veces integer;
begin
  if coalesce(p_viejo, '') = '' then
    raise exception 'fragmento vacío: %', p_etiqueta;
  end if;
  v_veces := (length(p_def) - length(replace(p_def, p_viejo, ''))) / length(p_viejo);
  if v_veces is distinct from p_veces then
    raise exception 'fragmento % aparece % veces (se esperaban %)', p_etiqueta, v_veces, p_veces;
  end if;
  return replace(p_def, p_viejo, p_nuevo);
end;
$r$;

do $rb$
declare
  v_viejo text := 'public.fn_create_journal_entry(integer, integer, timestamp with time zone, text, text, text, text, text, numeric, text, numeric, uuid, boolean, text)';
  v_nuevo text := 'public.fn_create_journal_entry(integer, integer, timestamp with time zone, text, text, text, text, text, numeric, text, numeric, uuid, boolean, text, uuid, text)';
  v_def text;
  v_expr_debito text := 'case when p_cost_center_id is not null and (p_cuenta_sin_centro is null or p_debit_account is distinct from p_cuenta_sin_centro) then p_cost_center_id end';
  v_expr_credito text := 'case when p_cost_center_id is not null and (p_cuenta_sin_centro is null or p_credit_account is distinct from p_cuenta_sin_centro) then p_cost_center_id end';
  v_expr_impuesto text := 'case when p_cost_center_id is not null and (p_cuenta_sin_centro is null or p_tax_account is distinct from p_cuenta_sin_centro) then p_cost_center_id end';
begin
  if to_regprocedure(v_nuevo) is not null then
    v_def := pg_get_functiondef(v_nuevo::regprocedure);
    v_def := pg_temp.reemplazar_exacto(
      v_def,
      'p_fact_key text DEFAULT NULL::text, p_cost_center_id uuid DEFAULT NULL::uuid, p_cuenta_sin_centro text DEFAULT NULL::text)',
      'p_fact_key text DEFAULT NULL::text)',
      'firma fn_create_journal_entry',
      1);
    v_def := pg_temp.reemplazar_exacto(
      v_def,
      $old$  if p_tax_account is not null then
    p_tax_account := public.fn_puc_cuenta_de_sede(p_organization_id, v_branch_id, p_tax_account);
  end if;

  -- centro_costo_en_linea: la cuenta de banco o caja no lleva centro.
  if p_cuenta_sin_centro is not null then
    p_cuenta_sin_centro := public.fn_puc_cuenta_de_sede(p_organization_id, v_branch_id, p_cuenta_sin_centro);
  end if;$old$,
      $new$  if p_tax_account is not null then
    p_tax_account := public.fn_puc_cuenta_de_sede(p_organization_id, v_branch_id, p_tax_account);
  end if;$new$,
      'remap centro',
      1);
    v_def := pg_temp.reemplazar_exacto(
      v_def,
      'insert into journal_lines (journal_entry_id, account_code, description, debit, credit, cost_center_id)',
      'insert into journal_lines (journal_entry_id, account_code, description, debit, credit)',
      'columnas journal_lines',
      6);
    v_def := pg_temp.reemplazar_exacto(
      v_def,
      'values (v_entry_id, p_debit_account, p_memo, p_amount, 0, ' || v_expr_debito || ');',
      'values (v_entry_id, p_debit_account, p_memo, p_amount, 0);',
      'linea debito',
      1);
    v_def := pg_temp.reemplazar_exacto(
      v_def,
      'values (v_entry_id, p_debit_account, p_memo, p_amount - coalesce(p_tax_amount, 0), 0, ' || v_expr_debito || ');',
      'values (v_entry_id, p_debit_account, p_memo, p_amount - coalesce(p_tax_amount, 0), 0);',
      'linea debito con impuesto',
      1);
    v_def := pg_temp.reemplazar_exacto(
      v_def,
      'values (v_entry_id, p_credit_account, p_memo, 0, p_amount - coalesce(p_tax_amount, 0), ' || v_expr_credito || ');',
      'values (v_entry_id, p_credit_account, p_memo, 0, p_amount - coalesce(p_tax_amount, 0));',
      'linea credito con impuesto',
      1);
    v_def := pg_temp.reemplazar_exacto(
      v_def,
      'values (v_entry_id, p_credit_account, p_memo, 0, p_amount, ' || v_expr_credito || ');',
      'values (v_entry_id, p_credit_account, p_memo, 0, p_amount);',
      'linea credito',
      1);
    v_def := pg_temp.reemplazar_exacto(
      v_def,
      'values (v_entry_id, p_tax_account, ''IVA - '' || p_memo, 0, p_tax_amount, ' || v_expr_impuesto || ');',
      'values (v_entry_id, p_tax_account, ''IVA - '' || p_memo, 0, p_tax_amount);',
      'linea iva credito',
      1);
    v_def := pg_temp.reemplazar_exacto(
      v_def,
      'values (v_entry_id, p_tax_account, ''IVA - '' || p_memo, p_tax_amount, 0, ' || v_expr_impuesto || ');',
      'values (v_entry_id, p_tax_account, ''IVA - '' || p_memo, p_tax_amount, 0);',
      'linea iva debito',
      1);
    execute v_def;
    execute 'drop function ' || v_nuevo;
  end if;

  if to_regprocedure(v_viejo) is null or to_regprocedure(v_nuevo) is not null then
    raise exception 'la firma de fn_create_journal_entry no volvió a la anterior';
  end if;

  execute 'revoke all on function ' || v_viejo || ' from public, anon, authenticated';
  execute 'grant execute on function ' || v_viejo || ' to service_role';

  v_def := pg_get_functiondef('public.fn_auto_journal_cash_movement()'::regprocedure);
  if position('p_cuenta_sin_centro := v_tesoreria' in v_def) > 0 then
    v_def := pg_temp.reemplazar_exacto(
      v_def,
      $old$      p_fact_key := 'cash_move:' || new.id::text,
      p_cost_center_id := new.centro_costo_id,
      p_cuenta_sin_centro := v_tesoreria
    );$old$,
      $new$      p_fact_key := 'cash_move:' || new.id::text
    );

    if v_entry_id is not null and new.centro_costo_id is not null then
      update public.journal_lines
         set cost_center_id = new.centro_costo_id
       where journal_entry_id = v_entry_id
         and account_code is distinct from v_tesoreria;
    end if;$new$,
      'update caja',
      1);
    execute v_def;
  end if;

  v_def := pg_get_functiondef('public.fn_auto_journal_bank()'::regprocedure);
  if position('p_cuenta_sin_centro := v_banco' in v_def) > 0 then
    v_def := pg_temp.reemplazar_exacto(
      v_def,
      $old$      p_fact_key := 'bank:' || new.id::text,
      p_cost_center_id := new.centro_costo_id,
      p_cuenta_sin_centro := v_banco
    );$old$,
      $new$      p_fact_key := 'bank:' || new.id::text
    );

    if v_entry_id is not null and new.centro_costo_id is not null then
      update public.journal_lines
         set cost_center_id = new.centro_costo_id
       where journal_entry_id = v_entry_id
         and account_code is distinct from v_banco;
    end if;$new$,
      'update banco',
      1);
    execute v_def;
  end if;

  v_def := pg_get_functiondef('public.fn_asiento_publicado_inmutable()'::regprocedure);
  if position('42501' in v_def) = 0 then
    v_def := pg_temp.reemplazar_exacto(
      v_def,
      'using errcode = ''P0001''',
      'using errcode = ''42501''',
      'errcode inmutable',
      2);
    execute v_def;
  end if;

  v_def := pg_get_functiondef('public.fn_asiento_manual_descartar(integer)'::regprocedure);
  if position('borradores manuales'' using errcode = ''P0001''' in v_def) > 0 then
    v_def := pg_temp.reemplazar_exacto(
      v_def,
      'ASIENTO_PUBLICADO_INMUTABLE: solo se descartan borradores manuales'' using errcode = ''P0001''',
      'ASIENTO_PUBLICADO_INMUTABLE: solo se descartan borradores manuales'' using errcode = ''42501''',
      'errcode descartar',
      1);
    execute v_def;
  end if;

  if position('p_cost_center_id' in pg_get_functiondef(v_viejo::regprocedure)) > 0
     or position('update public.journal_lines' in pg_get_functiondef('public.fn_auto_journal_cash_movement()'::regprocedure)) = 0
     or position('update public.journal_lines' in pg_get_functiondef('public.fn_auto_journal_bank()'::regprocedure)) = 0
     or position('42501' in pg_get_functiondef('public.fn_asiento_publicado_inmutable()'::regprocedure)) = 0 then
    raise exception 'el rollback no restauró el asiento ni la inmutabilidad';
  end if;
end;
$rb$;

notify pgrst, 'reload schema';
