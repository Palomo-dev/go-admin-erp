-- Revierte 20261023085110_centros_costo_parches.
-- Devuelve los fragmentos de tesorería, asiento manual, documento, anulación
-- de compra, banco, caja y factura de compra al texto anterior a esta migración.
-- También quita la siembra: borra los centros con template_key que no tienen
-- movimientos y desactiva los que sí tienen. No actualiza journal_lines.
-- El centro CC-PRUEBA de la org 140 tiene template_key nulo y no se toca.
-- Antes: 20261023085438, 20261023085352 y 20261023085326, en ese orden.
-- Los centros desactivados porque ya tenían movimientos se quedan. Este archivo
-- no restaura el cuerpo completo de funciones ajenas si alguien las editó después:
-- si el fragmento no está, la reversión se detiene.

do $orden$
begin
  if to_regclass('public.cost_center_distribution_lines') is not null then
    raise exception 'Revierte primero 20261023085326_centros_costo_distribucion';
  end if;
  if to_regprocedure('public.fn_asiento_manual_crear(integer,integer,timestamptz,text,jsonb,boolean,text,numeric,text)') is not null
     and position('fn_repartir_monto' in pg_get_functiondef('public.fn_asiento_manual_crear(integer,integer,timestamptz,text,jsonb,boolean,text,numeric,text)'::regprocedure)) > 0 then
    raise exception 'Revierte primero 20261023085352_centros_costo_reparto';
  end if;
end
$orden$;

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
  'public.fn_asiento_manual_crear(integer,integer,timestamptz,text,jsonb,boolean,text,numeric,text)'::regprocedure,
  $rb_viejo$         coalesce(nullif(l->>'cost_center_id', '')::uuid, public.fn_centro_defecto(p_organization_id, p_branch_id)),$rb_viejo$,
  $rb_nuevo$         nullif(l->>'cost_center_id', '')::uuid,$rb_nuevo$
);
select pg_temp.reemplazar_cuerpo(
  'public.fn_fc_guardar_int(integer,jsonb,uuid)'::regprocedure,
  $rb_viejo$      qty, unit_price, tax_code, tax_rate, total_line, discount_amount, tax_included, serial_numbers, note, cuenta_contable, cost_center_id
    ) values (
      v_id, 'purchase', v_id, null, v_prod, v_desc,
      v_qty, v_price, nullif(btrim(v_l->>'tax_code'), ''), v_rate, v_total_line, round(v_disc, 2), v_tax_included,
      coalesce(v_seriales, '{}'::text[]), nullif(btrim(v_l->>'note'), ''),
      nullif(btrim(v_l->>'cuenta_contable'), ''),
      nullif(v_l->>'cost_center_id', '')::uuid
    );$rb_viejo$,
  $rb_nuevo$      qty, unit_price, tax_code, tax_rate, total_line, discount_amount, tax_included, serial_numbers, note, cuenta_contable
    ) values (
      v_id, 'purchase', v_id, null, v_prod, v_desc,
      v_qty, v_price, nullif(btrim(v_l->>'tax_code'), ''), v_rate, v_total_line, round(v_disc, 2), v_tax_included,
      coalesce(v_seriales, '{}'::text[]), nullif(btrim(v_l->>'note'), ''),
      nullif(btrim(v_l->>'cuenta_contable'), '')
    );$rb_nuevo$
);
select pg_temp.reemplazar_cuerpo(
  'public.fn_fc_guardar_int(integer,jsonb,uuid)'::regprocedure,
  $rb_viejo$           commission_amount = v_camount,
           cost_center_id = v_centro,
           distribucion_id = v_distrib,
           updated_at = now()$rb_viejo$,
  $rb_nuevo$           commission_amount = v_camount,
           updated_at = now()$rb_nuevo$
);
select pg_temp.reemplazar_cuerpo(
  'public.fn_fc_guardar_int(integer,jsonb,uuid)'::regprocedure,
  $rb_viejo$      payment_terms_id, tax_included, salesperson_id, commission_rate, commission_type, commission_method, commission_amount,
      cost_center_id, distribucion_id
    ) values (
      p_org, v_branch, v_supplier, v_po, v_number, v_issue, v_due, v_currency,
      0, 0, 0, 0, 'draft', p_user, v_notes, v_payment_terms, v_payment_method,
      v_payment_terms_id, v_tax_included, v_sp, v_crate, v_ctype, v_cmethod, v_camount,
      v_centro, v_distrib
    ) returning id into v_id;$rb_viejo$,
  $rb_nuevo$      payment_terms_id, tax_included, salesperson_id, commission_rate, commission_type, commission_method, commission_amount
    ) values (
      p_org, v_branch, v_supplier, v_po, v_number, v_issue, v_due, v_currency,
      0, 0, 0, 0, 'draft', p_user, v_notes, v_payment_terms, v_payment_method,
      v_payment_terms_id, v_tax_included, v_sp, v_crate, v_ctype, v_cmethod, v_camount
    ) returning id into v_id;$rb_nuevo$
);
select pg_temp.reemplazar_cuerpo(
  'public.fn_fc_guardar_int(integer,jsonb,uuid)'::regprocedure,
  $rb_viejo$  v_branch integer := nullif(p_payload->>'branch_id', '')::integer;
  v_centro uuid := nullif(p_payload->>'cost_center_id', '')::uuid;
  v_distrib uuid := nullif(p_payload->>'distribucion_id', '')::uuid;$rb_viejo$,
  $rb_nuevo$  v_branch integer := nullif(p_payload->>'branch_id', '')::integer;$rb_nuevo$
);
select pg_temp.reemplazar_cuerpo(
  'public.fn_auto_journal_cash_movement()'::regprocedure,
  $rb_viejo$p_cost_center_id := coalesce(new.centro_costo_id, public.fn_centro_defecto(v_session.organization_id, v_session.branch_id)),$rb_viejo$,
  $rb_nuevo$p_cost_center_id := new.centro_costo_id,$rb_nuevo$
);
select pg_temp.reemplazar_cuerpo(
  'public.fn_auto_journal_bank()'::regprocedure,
  $rb_viejo$p_cost_center_id := coalesce(new.centro_costo_id, public.fn_centro_defecto(new.organization_id, v_branch_id)),$rb_viejo$,
  $rb_nuevo$p_cost_center_id := new.centro_costo_id,$rb_nuevo$
);
select pg_temp.reemplazar_cuerpo(
  'public.fn_void_purchase_invoice(uuid,text,uuid)'::regprocedure,
  $rb_viejo$insert into public.journal_lines (journal_entry_id, account_code, description, debit, credit, cost_center_id)
    select v_new_entry_id, jl.account_code, 'Reversa - ' || jl.description, jl.credit, jl.debit, jl.cost_center_id
      from public.journal_lines jl where jl.journal_entry_id = v_orig_entry.id;$rb_viejo$,
  $rb_nuevo$insert into public.journal_lines (journal_entry_id, account_code, description, debit, credit)
    select v_new_entry_id, jl.account_code, 'Reversa - ' || jl.description, jl.credit, jl.debit
      from public.journal_lines jl where jl.journal_entry_id = v_orig_entry.id;$rb_nuevo$
);
select pg_temp.reemplazar_cuerpo(
  'public.fn_asiento_documento_por_lineas(uuid,text,text)'::regprocedure,
  $rb_viejo$insert into public.journal_lines (
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
    );$rb_viejo$,
  $rb_nuevo$insert into public.journal_lines (
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
    );$rb_nuevo$
);
select pg_temp.reemplazar_cuerpo(
  'public.fn_armar_asiento_documento(text,uuid,jsonb)'::regprocedure,
  $rb_viejo$    v_lineas := v_lineas || jsonb_build_array(jsonb_build_object(
      'cuenta', v_fila.cuenta,
      'descripcion', v_fila.descripcion,
      'debito', case when v_impuesto_al_credito then 0 else v_parte end,
      'credito', case when v_impuesto_al_credito then v_parte else 0 end,
      'tercero_nit', v_nit,
      'tercero_nombre', v_nombre,
      'cost_center_id', public.fn_centro_documento(v_org, v_branch, p_tipo, p_id)
    ));$rb_viejo$,
  $rb_nuevo$    if coalesce(v_exige.requiere_centro_costo, false) then
      return jsonb_build_object('ok', false, 'fallo', 'La cuenta ' || v_fila.cuenta || ' exige un centro de costo', 'lineas', '[]'::jsonb, 'organization_id', v_org);
    end if;
    v_lineas := v_lineas || jsonb_build_array(jsonb_build_object(
      'cuenta', v_fila.cuenta,
      'descripcion', v_fila.descripcion,
      'debito', case when v_impuesto_al_credito then 0 else v_parte end,
      'credito', case when v_impuesto_al_credito then v_parte else 0 end,
      'tercero_nit', v_nit,
      'tercero_nombre', v_nombre
    ));$rb_nuevo$
);
select pg_temp.reemplazar_cuerpo(
  'public.fn_asiento_manual_crear(integer,integer,timestamptz,text,jsonb,boolean,text,numeric,text)'::regprocedure,
  $rb_viejo$    if coalesce(v_exige.requiere_centro_costo, false) and v_cc is null then
      v_cc := public.fn_centro_defecto(p_organization_id, p_branch_id)::text;
      if v_cc is null then
        raise warning 'centro_costo_omitido: la cuenta % no tiene centro y la organización no tiene uno activo', v_cuenta;
      end if;
    end if;$rb_viejo$,
  $rb_nuevo$    if coalesce(v_exige.requiere_centro_costo, false) and v_cc is null then
      raise exception 'CENTRO_REQUERIDO: la cuenta % exige un centro de costo', v_cuenta
        using errcode = '22023';
    end if;$rb_nuevo$
);
select pg_temp.reemplazar_cuerpo(
  'public.fn_validar_datos_tesoreria()'::regprocedure,
  $rb_viejo$    if v_exige_centro and new.centro_costo_id is null then
      new.centro_costo_id := public.fn_centro_defecto(new.organization_id, new.branch_id);
      if new.centro_costo_id is null then
        raise warning 'centro_costo_omitido: movimiento de tesorería sin centro activo';
      end if;
    end if;$rb_viejo$,
  $rb_nuevo$    if v_exige_centro and new.centro_costo_id is null then
      raise exception 'centro_costo_invalido' using errcode = '22023';
    end if;$rb_nuevo$
);

do $case$
declare
  v_firma regprocedure := 'public.fn_create_journal_entry(integer,integer,timestamptz,text,text,text,text,text,numeric,text,numeric,uuid,boolean,text,uuid,text)'::regprocedure;
  v_def text;
  v_nuevo text;
  v_veces integer;
begin
  v_def := pg_get_functiondef(v_firma);
  if position('public.fn_centro_para_cuenta' in v_def) = 0 then
    return;
  end if;
  v_nuevo := regexp_replace(
    v_def,
    'public\.fn_centro_para_cuenta\(p_organization_id, p_branch_id, (p_debit_account|p_tax_account|p_credit_account), p_cost_center_id, p_cuenta_sin_centro\)',
    'case when p_cost_center_id is not null and (p_cuenta_sin_centro is null or \1 is distinct from p_cuenta_sin_centro) then p_cost_center_id end',
    'g'
  );
  select count(*) into v_veces from regexp_matches(v_nuevo, 'fn_centro_para_cuenta', 'g');
  if v_veces <> 0 or v_nuevo = v_def then
    raise exception 'fn_create_journal_entry no recuperó las seis expresiones de centro';
  end if;
  execute v_nuevo;
end
$case$;

update public.branches b
   set default_cost_center_id = null
 where b.default_cost_center_id in (
   select c.id from public.cost_centers c where c.template_key is not null
 );

update public.cost_centers
   set parent_id = null
 where template_key is not null
   and parent_id is not null;

update public.cost_centers c
   set is_active = false,
       is_default = false
 where c.template_key is not null
   and (
     exists (select 1 from public.journal_lines jl where jl.cost_center_id = c.id)
     or exists (
       select 1 from public.cost_centers h
        where h.parent_id = c.id
          and h.template_key is null
     )
   );

delete from public.cost_centers c
 where c.template_key is not null
   and not exists (select 1 from public.journal_lines jl where jl.cost_center_id = c.id)
   and not exists (select 1 from public.cost_centers h where h.parent_id = c.id);
