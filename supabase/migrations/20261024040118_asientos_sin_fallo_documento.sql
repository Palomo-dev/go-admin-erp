do $patch_cero$
declare
  v_src text;
  v_nuevo text;
begin
  select p.prosrc into v_src
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'fn_create_journal_entry';
  if position('importe_cero_sin_fallo' in v_src) > 0 then
    return;
  end if;
  if position('El importe redondeado a pesos quedo en cero' in v_src) = 0 then
    raise exception 'no está el fallo de importe redondeado a cero';
  end if;
  v_nuevo := replace(
    v_src,
    $old$  if p_amount is null or p_amount <= 0 then$old$,
    $new$  -- importe_cero_sin_fallo: 0 pesos no es un fallo.
  if p_amount is not null and p_amount >= 0 and round(p_amount, 0) <= 0 then
    return null;
  end if;

  if p_amount is null or p_amount < 0 then$new$
  );
  v_nuevo := replace(
    v_nuevo,
    $old$  if p_amount <= 0 then
    perform fn_log_journal_failure(p_organization_id, p_branch_id, p_entry_date, p_source,
      p_source_id, p_fact_key, p_debit_account, p_credit_account, p_amount,
      'amount_invalid', 'El importe redondeado a pesos quedo en cero');
    return null;
  end if;$old$,
    $new$  if p_amount <= 0 then
    return null;
  end if;$new$
  );
  if position('importe_cero_sin_fallo' in v_nuevo) = 0
     or position('El importe redondeado a pesos quedo en cero' in v_nuevo) > 0 then
    raise exception 'no se pudo silenciar el importe en cero';
  end if;
  execute
    'create or replace function public.fn_create_journal_entry('
    || pg_get_function_arguments('public.fn_create_journal_entry'::regproc)
    || ') returns integer language plpgsql security definer set search_path to public, pg_temp as $fn$'
    || v_nuevo || '$fn$';
end;
$patch_cero$;

-- ---------------------------------------------------------------------------
-- 1405 (y cualquier cuenta que no sea de movimiento) usa el detalle.
-- Un total de 0 pesos sale como sin_importe, sin cabecera.
-- ---------------------------------------------------------------------------

do $patch_armar$
declare
  v_src text;
  v_args text;
  v_nuevo text;
begin
  select p.prosrc, pg_get_function_arguments(p.oid)
    into v_src, v_args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'fn_armar_asiento_documento'
     and pg_get_function_identity_arguments(p.oid) = 'p_tipo text, p_id uuid, p_lineas jsonb';
  if position('fn_cuenta_movimiento_o_detalle' in v_src) > 0 then
    return;
  end if;

  v_nuevo := replace(
    v_src,
    $old$  v_neto := round(v_total - v_tax, 2);

  select t.nit, t.nombre into v_nit, v_nombre$old$,
    $new$  v_neto := round(v_total - v_tax, 2);

  if round(coalesce(v_total, 0), 0) <= 0 then
    return jsonb_build_object(
      'ok', true, 'sin_importe', true, 'fallo', null,
      'lineas', '[]'::jsonb, 'debitos', 0,
      'organization_id', v_org, 'branch_id', v_branch, 'source', v_source
    );
  end if;

  select t.nit, t.nombre into v_nit, v_nombre$new$
  );

  v_nuevo := replace(
    v_nuevo,
    $old$    v_fallo := public.fn_validar_cuenta_movimiento(v_org, v_fila.cuenta);
    if v_fallo is not null then
      return jsonb_build_object('ok', false, 'fallo', v_fallo, 'lineas', '[]'::jsonb, 'organization_id', v_org);
    end if;
    select * into v_exige from public.fn_exigencias_cuenta(v_org, v_fila.cuenta);$old$,
    $new$    v_cuenta := public.fn_cuenta_movimiento_o_detalle(v_org, v_branch, v_fila.cuenta);
    v_fallo := public.fn_validar_cuenta_movimiento(v_org, v_cuenta);
    if v_fallo is not null then
      return jsonb_build_object('ok', false, 'fallo', v_fallo, 'lineas', '[]'::jsonb, 'organization_id', v_org);
    end if;
    select * into v_exige from public.fn_exigencias_cuenta(v_org, v_cuenta);$new$
  );

  v_nuevo := replace(v_nuevo, $q$'cuenta', v_fila.cuenta$q$, $q$'cuenta', v_cuenta$q$);
  v_nuevo := replace(
    v_nuevo,
    $q$'La cuenta ' || v_fila.cuenta || ' exige el NIT o la cédula del tercero'$q$,
    $q$'La cuenta ' || v_cuenta || ' exige el NIT o la cédula del tercero'$q$
  );

  v_nuevo := replace(
    v_nuevo,
    $old$    v_fallo := public.fn_validar_cuenta_movimiento(v_org, v_cfg.impuesto);
    if v_fallo is not null then
      return jsonb_build_object('ok', false, 'fallo', v_fallo, 'lineas', '[]'::jsonb, 'organization_id', v_org);
    end if;
    select * into v_exige from public.fn_exigencias_cuenta(v_org, v_cfg.impuesto);$old$,
    $new$    v_cuenta := public.fn_cuenta_movimiento_o_detalle(v_org, v_branch, v_cfg.impuesto);
    v_fallo := public.fn_validar_cuenta_movimiento(v_org, v_cuenta);
    if v_fallo is not null then
      return jsonb_build_object('ok', false, 'fallo', v_fallo, 'lineas', '[]'::jsonb, 'organization_id', v_org);
    end if;
    select * into v_exige from public.fn_exigencias_cuenta(v_org, v_cuenta);$new$
  );
  v_nuevo := replace(v_nuevo, $q$'cuenta', v_cfg.impuesto$q$, $q$'cuenta', v_cuenta$q$);
  v_nuevo := replace(
    v_nuevo,
    $q$'La cuenta ' || v_cfg.impuesto || ' exige el NIT o la cédula del tercero'$q$,
    $q$'La cuenta ' || v_cuenta || ' exige el NIT o la cédula del tercero'$q$
  );

  v_nuevo := replace(
    v_nuevo,
    $old$  v_cuenta := case when v_impuesto_al_credito then v_cfg.debito else v_cfg.credito end;
  v_fallo := public.fn_validar_cuenta_movimiento(v_org, v_cuenta);$old$,
    $new$  v_cuenta := public.fn_cuenta_movimiento_o_detalle(
    v_org, v_branch,
    case when v_impuesto_al_credito then v_cfg.debito else v_cfg.credito end
  );
  v_fallo := public.fn_validar_cuenta_movimiento(v_org, v_cuenta);$new$
  );

  -- El argumento del resolver sigue nombrando v_fila.cuenta. Lo que no puede
  -- quedar es validar, exigir o contabilizar esa cuenta sin pasar por el detalle.
  if position('fn_cuenta_movimiento_o_detalle' in v_nuevo) = 0
     or position('sin_importe' in v_nuevo) = 0
     or position('fn_validar_cuenta_movimiento(v_org, v_fila.cuenta)' in v_nuevo) > 0
     or position('fn_exigencias_cuenta(v_org, v_fila.cuenta)' in v_nuevo) > 0
     or position('''cuenta'', v_fila.cuenta' in v_nuevo) > 0
     or position('''La cuenta '' || v_fila.cuenta' in v_nuevo) > 0 then
    raise exception 'no se pudo actualizar fn_armar_asiento_documento';
  end if;

  execute
    'create or replace function public.'
    || 'fn_armar_asiento_documento('
    || v_args
    || ') returns jsonb language plpgsql stable set search_path to public, pg_temp as $cuerpo$'
    || v_nuevo || '$cuerpo$';
end;
$patch_armar$;

create or replace function public.fn_asiento_documento_por_lineas(
  p_id uuid,
  p_tipo text,
  p_fact_key text
) returns integer
language plpgsql
security definer
set search_path to public, pg_temp
as $fn$
declare
  v_armado jsonb;
  v_entry_id integer;
  v_linea jsonb;
begin
  v_armado := public.fn_armar_asiento_documento(p_tipo, p_id, null);
  if coalesce((v_armado->>'sin_importe')::boolean, false) then
    return null;
  end if;
  if coalesce((v_armado->>'ok')::boolean, false) is not true then
    perform public.fn_log_journal_failure(
      nullif(v_armado->>'organization_id', '')::integer,
      nullif(v_armado->>'branch_id', '')::integer,
      coalesce(nullif(v_armado->>'fecha', '')::timestamptz, now()),
      coalesce(v_armado->>'source', 'invoice_sales'),
      p_id::text,
      p_fact_key,
      null, null,
      coalesce((v_armado->>'debitos')::numeric, 0),
      'cuenta_linea',
      coalesce(v_armado->>'fallo', 'No se pudo armar el asiento')
    );
    return null;
  end if;

  if not public.fn_is_period_open(
    (v_armado->>'organization_id')::integer,
    ((v_armado->>'fecha')::timestamptz)::date
  ) then
    perform public.fn_log_journal_failure(
      nullif(v_armado->>'organization_id', '')::integer,
      nullif(v_armado->>'branch_id', '')::integer,
      coalesce(nullif(v_armado->>'fecha', '')::timestamptz, now()),
      coalesce(v_armado->>'source', 'invoice_sales'),
      p_id::text,
      p_fact_key,
      null, null,
      coalesce((v_armado->>'debitos')::numeric, 0),
      'period_closed',
      'Periodo contable cerrado para la fecha ' || (((v_armado->>'fecha')::timestamptz)::date)
    );
    return null;
  end if;

  perform set_config('app.contabilidad_mantenimiento', 'on', true);
  delete from public.journal_entries e
   where e.organization_id = (v_armado->>'organization_id')::integer
     and e.fact_key = p_fact_key
     and p_fact_key is not null
     and not exists (
       select 1 from public.journal_lines l where l.journal_entry_id = e.id
     );
  perform set_config('app.contabilidad_mantenimiento', '', true);

  begin
    insert into public.journal_entries (
      organization_id, branch_id, entry_date, memo, source, source_id, posted, created_by, fact_key
    ) values (
      (v_armado->>'organization_id')::integer,
      (v_armado->>'branch_id')::integer,
      (v_armado->>'fecha')::timestamptz,
      v_armado->>'memo',
      v_armado->>'source',
      p_id::text,
      true,
      nullif(v_armado->>'created_by', '')::uuid,
      p_fact_key
    ) returning id into v_entry_id;
  exception when unique_violation then
    select e.id into v_entry_id
      from public.journal_entries e
     where e.organization_id = (v_armado->>'organization_id')::integer
       and e.fact_key = p_fact_key
     limit 1;
    return v_entry_id;
  end;

  for v_linea in select * from jsonb_array_elements(v_armado->'lineas') loop
    insert into public.journal_lines (
      journal_entry_id, account_code, description, debit, credit, organization_id, tercero_nit, tercero_nombre, cost_center_id
    ) values (
      v_entry_id,
      v_linea->>'cuenta',
      v_linea->>'descripcion',
      coalesce((v_linea->>'debito')::numeric, 0),
      coalesce((v_linea->>'credito')::numeric, 0),
      (v_armado->>'organization_id')::integer,
      nullif(v_linea->>'tercero_nit', ''),
      nullif(v_linea->>'tercero_nombre', ''),
      case
        when p_tipo = 'compra' and exists (
          select 1 from public.invoice_purchase ip
           where ip.id = p_id
             and ip.organization_id = (v_armado->>'organization_id')::integer
             and ip.distribucion_id is not null
        ) then null
        else nullif(v_linea->>'cost_center_id', '')::uuid
      end
    );
  end loop;

  if not exists (select 1 from public.journal_lines l where l.journal_entry_id = v_entry_id) then
    perform set_config('app.contabilidad_mantenimiento', 'on', true);
    delete from public.journal_entries where id = v_entry_id and posted is true;
    perform set_config('app.contabilidad_mantenimiento', '', true);
    return null;
  end if;

  -- El redondeo a pesos toca líneas de un asiento que acaba de nacer publicado.
  perform set_config('app.contabilidad_mantenimiento', 'on', true);
  perform public.fn_redondear_asiento_pesos(v_entry_id);
  perform set_config('app.contabilidad_mantenimiento', '', true);
  return v_entry_id;
end;
$fn$;