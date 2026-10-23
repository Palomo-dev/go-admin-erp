-- Parches de las funciones vivas. El texto viejo se sustituye una sola vez.
-- ---------------------------------------------------------------------------

create or replace function pg_temp.reemplazar_cuerpo(p_firma regprocedure, p_viejo text, p_nuevo text)
returns void
language plpgsql
as $fn$
declare
  v_def text;
begin
  v_def := pg_get_functiondef(p_firma);
  if position(p_viejo in v_def) = 0 then
    if position(p_nuevo in v_def) > 0 then
      return;
    end if;
    raise exception 'No está el fragmento en %', p_firma::text;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$fn$;

select pg_temp.reemplazar_cuerpo(
  'public.fn_validar_datos_tesoreria()'::regprocedure,
  $viejo$    if v_exige_centro and new.centro_costo_id is null then
      raise exception 'centro_costo_invalido' using errcode = '22023';
    end if;$viejo$,
  $nuevo$    if v_exige_centro and new.centro_costo_id is null then
      new.centro_costo_id := public.fn_centro_defecto(new.organization_id, new.branch_id);
      if new.centro_costo_id is null then
        raise warning 'centro_costo_omitido: movimiento de tesorería sin centro activo';
      end if;
    end if;$nuevo$
);

select pg_temp.reemplazar_cuerpo(
  'public.fn_asiento_manual_crear(integer,integer,timestamptz,text,jsonb,boolean,text,numeric,text)'::regprocedure,
  $viejo$    if coalesce(v_exige.requiere_centro_costo, false) and v_cc is null then
      raise exception 'CENTRO_REQUERIDO: la cuenta % exige un centro de costo', v_cuenta
        using errcode = '22023';
    end if;$viejo$,
  $nuevo$    if coalesce(v_exige.requiere_centro_costo, false) and v_cc is null then
      v_cc := public.fn_centro_defecto(p_organization_id, p_branch_id)::text;
      if v_cc is null then
        raise warning 'centro_costo_omitido: la cuenta % no tiene centro y la organización no tiene uno activo', v_cuenta;
      end if;
    end if;$nuevo$
);

select pg_temp.reemplazar_cuerpo(
  'public.fn_armar_asiento_documento(text,uuid,jsonb)'::regprocedure,
  $viejo$    if coalesce(v_exige.requiere_centro_costo, false) then
      return jsonb_build_object('ok', false, 'fallo', 'La cuenta ' || v_fila.cuenta || ' exige un centro de costo', 'lineas', '[]'::jsonb, 'organization_id', v_org);
    end if;
    v_lineas := v_lineas || jsonb_build_array(jsonb_build_object(
      'cuenta', v_fila.cuenta,
      'descripcion', v_fila.descripcion,
      'debito', case when v_impuesto_al_credito then 0 else v_parte end,
      'credito', case when v_impuesto_al_credito then v_parte else 0 end,
      'tercero_nit', v_nit,
      'tercero_nombre', v_nombre
    ));$viejo$,
  $nuevo$    v_lineas := v_lineas || jsonb_build_array(jsonb_build_object(
      'cuenta', v_fila.cuenta,
      'descripcion', v_fila.descripcion,
      'debito', case when v_impuesto_al_credito then 0 else v_parte end,
      'credito', case when v_impuesto_al_credito then v_parte else 0 end,
      'tercero_nit', v_nit,
      'tercero_nombre', v_nombre,
      'cost_center_id', public.fn_centro_documento(v_org, v_branch, p_tipo, p_id)
    ));$nuevo$
);

select pg_temp.reemplazar_cuerpo(
  'public.fn_asiento_documento_por_lineas(uuid,text,text)'::regprocedure,
  $viejo$insert into public.journal_lines (
      journal_entry_id, account_code, description, debit, credit, organization_id, tercero_nit, tercero_nombre
    ) values (
      v_entry_id,
      v_linea->>'cuenta',
      v_linea->>'descripcion',
      coalesce((v_linea->>'debito')::numeric, 0),
      coalesce((v_linea->>'credito')::numeric, 0),
      (v_armado->>'organization_id')::integer,
      nullif(v_linea->>'tercero_nit', ''),
      nullif(v_linea->>'tercero_nombre', '')
    );$viejo$,
  $nuevo$insert into public.journal_lines (
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
      nullif(v_linea->>'cost_center_id', '')::uuid
    );$nuevo$
);

select pg_temp.reemplazar_cuerpo(
  'public.fn_void_purchase_invoice(uuid,text,uuid)'::regprocedure,
  $viejo$insert into public.journal_lines (journal_entry_id, account_code, description, debit, credit)
    select v_new_entry_id, jl.account_code, 'Reversa - ' || jl.description, jl.credit, jl.debit
      from public.journal_lines jl where jl.journal_entry_id = v_orig_entry.id;$viejo$,
  $nuevo$insert into public.journal_lines (journal_entry_id, account_code, description, debit, credit, cost_center_id)
    select v_new_entry_id, jl.account_code, 'Reversa - ' || jl.description, jl.credit, jl.debit, jl.cost_center_id
      from public.journal_lines jl where jl.journal_entry_id = v_orig_entry.id;$nuevo$
);

select pg_temp.reemplazar_cuerpo(
  'public.fn_auto_journal_bank()'::regprocedure,
  $viejo$p_cost_center_id := new.centro_costo_id,$viejo$,
  $nuevo$p_cost_center_id := coalesce(new.centro_costo_id, public.fn_centro_defecto(new.organization_id, v_branch_id)),$nuevo$
);

select pg_temp.reemplazar_cuerpo(
  'public.fn_auto_journal_cash_movement()'::regprocedure,
  $viejo$p_cost_center_id := new.centro_costo_id,$viejo$,
  $nuevo$p_cost_center_id := coalesce(new.centro_costo_id, public.fn_centro_defecto(v_session.organization_id, v_session.branch_id)),$nuevo$
);

select pg_temp.reemplazar_cuerpo(
  'public.fn_fc_guardar_int(integer,jsonb,uuid)'::regprocedure,
  $viejo$  v_branch integer := nullif(p_payload->>'branch_id', '')::integer;$viejo$,
  $nuevo$  v_branch integer := nullif(p_payload->>'branch_id', '')::integer;
  v_centro uuid := nullif(p_payload->>'cost_center_id', '')::uuid;
  v_distrib uuid := nullif(p_payload->>'distribucion_id', '')::uuid;$nuevo$
);

select pg_temp.reemplazar_cuerpo(
  'public.fn_fc_guardar_int(integer,jsonb,uuid)'::regprocedure,
  $viejo$      payment_terms_id, tax_included, salesperson_id, commission_rate, commission_type, commission_method, commission_amount
    ) values (
      p_org, v_branch, v_supplier, v_po, v_number, v_issue, v_due, v_currency,
      0, 0, 0, 0, 'draft', p_user, v_notes, v_payment_terms, v_payment_method,
      v_payment_terms_id, v_tax_included, v_sp, v_crate, v_ctype, v_cmethod, v_camount
    ) returning id into v_id;$viejo$,
  $nuevo$      payment_terms_id, tax_included, salesperson_id, commission_rate, commission_type, commission_method, commission_amount,
      cost_center_id, distribucion_id
    ) values (
      p_org, v_branch, v_supplier, v_po, v_number, v_issue, v_due, v_currency,
      0, 0, 0, 0, 'draft', p_user, v_notes, v_payment_terms, v_payment_method,
      v_payment_terms_id, v_tax_included, v_sp, v_crate, v_ctype, v_cmethod, v_camount,
      v_centro, v_distrib
    ) returning id into v_id;$nuevo$
);

select pg_temp.reemplazar_cuerpo(
  'public.fn_fc_guardar_int(integer,jsonb,uuid)'::regprocedure,
  $viejo$           commission_amount = v_camount,
           updated_at = now()$viejo$,
  $nuevo$           commission_amount = v_camount,
           cost_center_id = v_centro,
           distribucion_id = v_distrib,
           updated_at = now()$nuevo$
);

select pg_temp.reemplazar_cuerpo(
  'public.fn_fc_guardar_int(integer,jsonb,uuid)'::regprocedure,
  $viejo$      qty, unit_price, tax_code, tax_rate, total_line, discount_amount, tax_included, serial_numbers, note, cuenta_contable
    ) values (
      v_id, 'purchase', v_id, null, v_prod, v_desc,
      v_qty, v_price, nullif(btrim(v_l->>'tax_code'), ''), v_rate, v_total_line, round(v_disc, 2), v_tax_included,
      coalesce(v_seriales, '{}'::text[]), nullif(btrim(v_l->>'note'), ''),
      nullif(btrim(v_l->>'cuenta_contable'), '')
    );$viejo$,
  $nuevo$      qty, unit_price, tax_code, tax_rate, total_line, discount_amount, tax_included, serial_numbers, note, cuenta_contable, cost_center_id
    ) values (
      v_id, 'purchase', v_id, null, v_prod, v_desc,
      v_qty, v_price, nullif(btrim(v_l->>'tax_code'), ''), v_rate, v_total_line, round(v_disc, 2), v_tax_included,
      coalesce(v_seriales, '{}'::text[]), nullif(btrim(v_l->>'note'), ''),
      nullif(btrim(v_l->>'cuenta_contable'), ''),
      nullif(v_l->>'cost_center_id', '')::uuid
    );$nuevo$
);

do $case$
declare
  v_firma regprocedure := 'public.fn_create_journal_entry(integer,integer,timestamptz,text,text,text,text,text,numeric,text,numeric,uuid,boolean,text,uuid,text)'::regprocedure;
  v_def text;
  v_nuevo text;
  v_veces integer;
begin
  v_def := pg_get_functiondef(v_firma);
  if position('public.fn_centro_para_cuenta' in v_def) > 0 then
    return;
  end if;
  v_nuevo := regexp_replace(
    v_def,
    'case when p_cost_center_id is not null and \(p_cuenta_sin_centro is null or (p_debit_account|p_tax_account|p_credit_account) is distinct from p_cuenta_sin_centro\) then p_cost_center_id end',
    'public.fn_centro_para_cuenta(p_organization_id, p_branch_id, \1, p_cost_center_id, p_cuenta_sin_centro)',
    'g'
  );
  select count(*) into v_veces
    from regexp_matches(v_nuevo, 'fn_centro_para_cuenta', 'g');
  if v_veces <> 6 or v_nuevo = v_def then
    raise exception 'fn_create_journal_entry no quedó con el centro en las seis líneas';
  end if;
  execute v_nuevo;
end
$case$;

-- El asiento manual valida con v_cc, pero inserta el uuid del JSON.
-- Si la validación ya resolvió el defecto, el JSON sigue vacío y el trigger
-- de la línea lo completa. Aquí se copia el defecto al JSON cuando falta,
-- para que la fila lo traiga en el propio INSERT.
select pg_temp.reemplazar_cuerpo(
  'public.fn_asiento_manual_crear(integer,integer,timestamptz,text,jsonb,boolean,text,numeric,text)'::regprocedure,
  $viejo$         nullif(l->>'cost_center_id', '')::uuid,$viejo$,
  $nuevo$         coalesce(nullif(l->>'cost_center_id', '')::uuid, public.fn_centro_defecto(p_organization_id, p_branch_id)),$nuevo$
);

revoke all on function public.fn_sync_centro_costo_modo() from public, anon;
revoke all on function public.fn_cost_centers_sin_ciclo() from public, anon;
revoke all on function public.fn_cost_centers_bloquear_borrado() from public, anon;
revoke all on function public.fn_centro_misma_org() from public, anon;
revoke all on function public.fn_centro_asegurar(integer, text, text, uuid, integer, smallint, text, text, boolean, boolean) from public, anon, authenticated;
revoke all on function public.fn_sembrar_centros_costo_interno(integer, text, boolean) from public, anon, authenticated;
revoke all on function public.fn_sembrar_centros_costo(integer, text, boolean) from public, anon;
revoke all on function public.trg_fn_sembrar_centros_org() from public, anon;
revoke all on function public.trg_fn_sembrar_centros_sucursal() from public, anon;
revoke all on function public.fn_journal_linea_heredar_centro() from public, anon;
revoke all on function public.fn_modo_centro(integer, text) from public, anon, authenticated;
revoke all on function public.fn_centro_defecto(integer, integer) from public, anon, authenticated;
revoke all on function public.fn_centro_para_cuenta(integer, integer, text, uuid, text) from public, anon, authenticated;
revoke all on function public.fn_centro_documento(integer, integer, text, uuid) from public, anon, authenticated;

grant execute on function public.fn_sembrar_centros_costo(integer, text, boolean) to authenticated, service_role;
grant execute on function public.fn_sync_centro_costo_modo() to authenticated, service_role;
grant execute on function public.fn_cost_centers_sin_ciclo() to authenticated, service_role;
grant execute on function public.fn_cost_centers_bloquear_borrado() to authenticated, service_role;
grant execute on function public.fn_centro_misma_org() to authenticated, service_role;
grant execute on function public.trg_fn_sembrar_centros_org() to authenticated, service_role;
grant execute on function public.trg_fn_sembrar_centros_sucursal() to authenticated, service_role;
grant execute on function public.fn_journal_linea_heredar_centro() to authenticated, service_role;

do $grants$
declare
  v_firma regprocedure;
begin
  foreach v_firma in array array[
    'public.fn_modo_centro(integer,text)'::regprocedure,
    'public.fn_centro_defecto(integer,integer)'::regprocedure,
    'public.fn_centro_para_cuenta(integer,integer,text,uuid,text)'::regprocedure,
    'public.fn_centro_documento(integer,integer,text,uuid)'::regprocedure,
    'public.fn_centro_asegurar(integer,text,text,uuid,integer,smallint,text,text,boolean,boolean)'::regprocedure,
    'public.fn_sembrar_centros_costo_interno(integer,text,boolean)'::regprocedure,
    'public.fn_journal_linea_heredar_centro()'::regprocedure,
    'public.trg_fn_sembrar_centros_org()'::regprocedure,
    'public.trg_fn_sembrar_centros_sucursal()'::regprocedure,
    'public.fn_sync_centro_costo_modo()'::regprocedure,
    'public.fn_cost_centers_sin_ciclo()'::regprocedure,
    'public.fn_cost_centers_bloquear_borrado()'::regprocedure,
    'public.fn_centro_misma_org()'::regprocedure,
    'public.fn_sembrar_centros_costo(integer,text,boolean)'::regprocedure
  ]
  loop
    execute format('grant execute on function %s to %I, postgres, service_role', v_firma, current_user);
  end loop;
end
$grants$;

do $backfill$
declare
  v_org integer;
  v_antes integer;
  v_despues integer;
begin
  for v_org in select o.id from public.organizations o order by o.id loop
    perform public.fn_sembrar_centros_costo_interno(v_org, 'completo', true);
  end loop;

  if not exists (
    select 1 from public.cost_centers
     where organization_id = 140 and code = 'CC-PRUEBA'
  ) then
    raise exception 'El centro existente de la org 140 no sobrevivió la siembra';
  end if;

  select count(*) into v_antes from public.cost_centers where organization_id = 338;
  if v_antes < 1 then
    raise exception 'La org 338 quedó sin centros';
  end if;
  perform public.fn_sembrar_centros_costo_interno(338, 'completo', true);
  select count(*) into v_despues from public.cost_centers where organization_id = 338;
  if v_despues <> v_antes then
    raise exception 'La segunda siembra creó centros de más';
  end if;
end
$backfill$;
