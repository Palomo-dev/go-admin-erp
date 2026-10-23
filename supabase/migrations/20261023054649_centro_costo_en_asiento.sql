-- El centro de costo viaja en el INSERT de las líneas.
-- Antes, fn_auto_journal_bank y fn_auto_journal_cash_movement creaban el
-- asiento ya publicado y después hacían UPDATE journal_lines.cost_center_id.
-- fn_asiento_publicado_inmutable lo rechazaba con ASIENTO_PUBLICADO_INMUTABLE
-- y errcode 42501, y la tesorería lo mostraba como «sin permiso».
--
-- p_cuenta_sin_centro (default null) conserva la regla del UPDATE: la línea
-- de banco o de caja no lleva centro; el resto sí. Se remapea con la misma
-- función que la cuenta escrita, para compararla con el código que queda.

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

do $mig$
declare
  v_viejo text := 'public.fn_create_journal_entry(integer, integer, timestamp with time zone, text, text, text, text, text, numeric, text, numeric, uuid, boolean, text)';
  v_nuevo text := 'public.fn_create_journal_entry(integer, integer, timestamp with time zone, text, text, text, text, text, numeric, text, numeric, uuid, boolean, text, uuid, text)';
  v_def text;
  v_expr_debito text := 'case when p_cost_center_id is not null and (p_cuenta_sin_centro is null or p_debit_account is distinct from p_cuenta_sin_centro) then p_cost_center_id end';
  v_expr_credito text := 'case when p_cost_center_id is not null and (p_cuenta_sin_centro is null or p_credit_account is distinct from p_cuenta_sin_centro) then p_cost_center_id end';
  v_expr_impuesto text := 'case when p_cost_center_id is not null and (p_cuenta_sin_centro is null or p_tax_account is distinct from p_cuenta_sin_centro) then p_cost_center_id end';
begin
  if to_regprocedure(v_nuevo) is null then
    if to_regprocedure(v_viejo) is null then
      raise exception 'no está la firma vigente de fn_create_journal_entry';
    end if;
    v_def := pg_get_functiondef(v_viejo::regprocedure);
    v_def := pg_temp.reemplazar_exacto(
      v_def,
      'p_fact_key text DEFAULT NULL::text)',
      'p_fact_key text DEFAULT NULL::text, p_cost_center_id uuid DEFAULT NULL::uuid, p_cuenta_sin_centro text DEFAULT NULL::text)',
      'firma fn_create_journal_entry',
      1);
    v_def := pg_temp.reemplazar_exacto(
      v_def,
      $old$  if p_tax_account is not null then
    p_tax_account := public.fn_puc_cuenta_de_sede(p_organization_id, v_branch_id, p_tax_account);
  end if;$old$,
      $new$  if p_tax_account is not null then
    p_tax_account := public.fn_puc_cuenta_de_sede(p_organization_id, v_branch_id, p_tax_account);
  end if;

  -- centro_costo_en_linea: la cuenta de banco o caja no lleva centro.
  if p_cuenta_sin_centro is not null then
    p_cuenta_sin_centro := public.fn_puc_cuenta_de_sede(p_organization_id, v_branch_id, p_cuenta_sin_centro);
  end if;$new$,
      'remap centro',
      1);
    v_def := pg_temp.reemplazar_exacto(
      v_def,
      'insert into journal_lines (journal_entry_id, account_code, description, debit, credit)',
      'insert into journal_lines (journal_entry_id, account_code, description, debit, credit, cost_center_id)',
      'columnas journal_lines',
      6);
    v_def := pg_temp.reemplazar_exacto(
      v_def,
      'values (v_entry_id, p_debit_account, p_memo, p_amount, 0);',
      'values (v_entry_id, p_debit_account, p_memo, p_amount, 0, ' || v_expr_debito || ');',
      'linea debito',
      1);
    v_def := pg_temp.reemplazar_exacto(
      v_def,
      'values (v_entry_id, p_debit_account, p_memo, p_amount - coalesce(p_tax_amount, 0), 0);',
      'values (v_entry_id, p_debit_account, p_memo, p_amount - coalesce(p_tax_amount, 0), 0, ' || v_expr_debito || ');',
      'linea debito con impuesto',
      1);
    v_def := pg_temp.reemplazar_exacto(
      v_def,
      'values (v_entry_id, p_credit_account, p_memo, 0, p_amount - coalesce(p_tax_amount, 0));',
      'values (v_entry_id, p_credit_account, p_memo, 0, p_amount - coalesce(p_tax_amount, 0), ' || v_expr_credito || ');',
      'linea credito con impuesto',
      1);
    v_def := pg_temp.reemplazar_exacto(
      v_def,
      'values (v_entry_id, p_credit_account, p_memo, 0, p_amount);',
      'values (v_entry_id, p_credit_account, p_memo, 0, p_amount, ' || v_expr_credito || ');',
      'linea credito',
      1);
    v_def := pg_temp.reemplazar_exacto(
      v_def,
      'values (v_entry_id, p_tax_account, ''IVA - '' || p_memo, 0, p_tax_amount);',
      'values (v_entry_id, p_tax_account, ''IVA - '' || p_memo, 0, p_tax_amount, ' || v_expr_impuesto || ');',
      'linea iva credito',
      1);
    v_def := pg_temp.reemplazar_exacto(
      v_def,
      'values (v_entry_id, p_tax_account, ''IVA - '' || p_memo, p_tax_amount, 0);',
      'values (v_entry_id, p_tax_account, ''IVA - '' || p_memo, p_tax_amount, 0, ' || v_expr_impuesto || ');',
      'linea iva debito',
      1);
    execute v_def;
  end if;

  if to_regprocedure(v_viejo) is not null and to_regprocedure(v_nuevo) is not null then
    execute 'drop function ' || v_viejo;
  end if;

  if to_regprocedure(v_nuevo) is null or to_regprocedure(v_viejo) is not null then
    raise exception 'la firma de fn_create_journal_entry no quedó única';
  end if;

  execute 'revoke all on function ' || v_nuevo || ' from public, anon, authenticated';
  execute 'grant execute on function ' || v_nuevo || ' to service_role';

  if has_function_privilege('anon', v_nuevo, 'execute')
     or has_function_privilege('authenticated', v_nuevo, 'execute')
     or not has_function_privilege('service_role', v_nuevo, 'execute') then
    raise exception 'los permisos de fn_create_journal_entry no quedaron en service_role';
  end if;

  v_def := pg_get_functiondef('public.fn_auto_journal_cash_movement()'::regprocedure);
  if position('p_cuenta_sin_centro := v_tesoreria' in v_def) = 0 then
    v_def := pg_temp.reemplazar_exacto(
      v_def,
      $old$      p_fact_key := 'cash_move:' || new.id::text
    );

    if v_entry_id is not null and new.centro_costo_id is not null then
      update public.journal_lines
         set cost_center_id = new.centro_costo_id
       where journal_entry_id = v_entry_id
         and account_code is distinct from v_tesoreria;
    end if;$old$,
      $new$      p_fact_key := 'cash_move:' || new.id::text,
      p_cost_center_id := new.centro_costo_id,
      p_cuenta_sin_centro := v_tesoreria
    );$new$,
      'update caja',
      1);
    execute v_def;
  end if;

  v_def := pg_get_functiondef('public.fn_auto_journal_bank()'::regprocedure);
  if position('p_cuenta_sin_centro := v_banco' in v_def) = 0 then
    v_def := pg_temp.reemplazar_exacto(
      v_def,
      $old$      p_fact_key := 'bank:' || new.id::text
    );

    if v_entry_id is not null and new.centro_costo_id is not null then
      update public.journal_lines
         set cost_center_id = new.centro_costo_id
       where journal_entry_id = v_entry_id
         and account_code is distinct from v_banco;
    end if;$old$,
      $new$      p_fact_key := 'bank:' || new.id::text,
      p_cost_center_id := new.centro_costo_id,
      p_cuenta_sin_centro := v_banco
    );$new$,
      'update banco',
      1);
    execute v_def;
  end if;

  v_def := pg_get_functiondef('public.fn_asiento_publicado_inmutable()'::regprocedure);
  if position('42501' in v_def) > 0 then
    if position('SIN_PERMISO' in v_def) > 0 then
      raise exception 'fn_asiento_publicado_inmutable mezcla SIN_PERMISO';
    end if;
    v_def := pg_temp.reemplazar_exacto(
      v_def,
      'using errcode = ''42501''',
      'using errcode = ''P0001''',
      'errcode inmutable',
      2);
    execute v_def;
  end if;

  v_def := pg_get_functiondef('public.fn_asiento_manual_descartar(integer)'::regprocedure);
  if position('ASIENTO_PUBLICADO_INMUTABLE: solo se descartan borradores manuales'' using errcode = ''42501''' in v_def) > 0 then
    v_def := pg_temp.reemplazar_exacto(
      v_def,
      'ASIENTO_PUBLICADO_INMUTABLE: solo se descartan borradores manuales'' using errcode = ''42501''',
      'ASIENTO_PUBLICADO_INMUTABLE: solo se descartan borradores manuales'' using errcode = ''P0001''',
      'errcode descartar',
      1);
    execute v_def;
  end if;

  v_def := pg_get_functiondef(v_nuevo::regprocedure);
  if position('centro_costo_en_linea' in v_def) = 0
     or position('cost_center_id' in v_def) = 0
     or position('debit, credit)' in v_def) > 0 then
    raise exception 'el INSERT del asiento no quedó con centro de costo';
  end if;

  if position('update public.journal_lines' in pg_get_functiondef('public.fn_auto_journal_cash_movement()'::regprocedure)) > 0
     or position('update public.journal_lines' in pg_get_functiondef('public.fn_auto_journal_bank()'::regprocedure)) > 0
     or position('p_cuenta_sin_centro := v_tesoreria' in pg_get_functiondef('public.fn_auto_journal_cash_movement()'::regprocedure)) = 0
     or position('p_cuenta_sin_centro := v_banco' in pg_get_functiondef('public.fn_auto_journal_bank()'::regprocedure)) = 0 then
    raise exception 'el asiento automático de tesorería sigue actualizando líneas';
  end if;

  v_def := pg_get_functiondef('public.fn_asiento_publicado_inmutable()'::regprocedure);
  if position('42501' in v_def) > 0 or position('P0001' in v_def) = 0 then
    raise exception 'ASIENTO_PUBLICADO_INMUTABLE no quedó en P0001';
  end if;

  v_def := pg_get_functiondef('public.fn_asiento_manual_descartar(integer)'::regprocedure);
  if position('SIN_PERMISO'' using errcode = ''42501''' in v_def) = 0
     or position('borradores manuales'' using errcode = ''P0001''' in v_def) = 0 then
    raise exception 'descartar borrador no separó el permiso del asiento publicado';
  end if;
end;
$mig$;

notify pgrst, 'reload schema';
