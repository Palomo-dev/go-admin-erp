-- Reversión de 20261108152000_iva_no_descontable_al_costo.sql (B5, ronda 3; reescrita con la ronda 4 del 2026-11-09:
-- deshace también el pendiente «iva_no_descontable_por_corregir» y borra fn_iva_no_descontable_cuenta_unica_fallo).
-- Se corre ANTES de las reversiones de 20261108150000 y de 20261108140000 (H1): las funciones de este archivo leen
-- las columnas de procedencia de 150000 y modifican funciones de H1.
-- Deshace los reemplazos (el inverso exacto de cada uno) y borra las tres funciones nuevas.
-- NO revierte datos: los asientos creados mientras estuvo aplicada (con el IVA no descontable en el costo) se quedan
-- como se publicaron; si hiciera falta cambiarlos, se recontabilizan por el flujo normal.

create or replace function pg_temp.fn_reemplazo_verificado(p_def text, p_viejo text, p_nuevo text, p_etiqueta text)
returns text
language plpgsql
as $function$
declare
  v_veces integer := (length(p_def) - length(replace(p_def, p_viejo, ''))) / length(p_viejo);
begin
  if v_veces <> 1 then
    raise exception '%: se esperaba 1 aparición del texto a reemplazar y hay %', p_etiqueta, v_veces;
  end if;
  return replace(p_def, p_viejo, p_nuevo);
end;
$function$;

-- 5. fn_auto_journal_purchase
do $do$
declare
  v_firma constant regprocedure := 'public.fn_auto_journal_purchase()'::regprocedure;
  v_def text := pg_get_functiondef(v_firma);
begin
  if position('iva_no_descontable_al_costo_20261108' in v_def) = 0 then
    raise notice 'fn_auto_journal_purchase no tiene el cambio B5';
    return;
  end if;

  v_def := pg_temp.fn_reemplazo_verificado(v_def,
$v$  elsif v_nd_fallo is not null then
    -- iva_no_descontable_al_costo_20261108 (ronda 4): pendiente de corregir, sin asiento definitivo.
    perform fn_log_journal_failure(
      new.organization_id, new.branch_id, coalesce(new.issue_date, now()),
      'invoice_purchase', new.id::text, v_fact_key,
      v_debito, v_credito, new.total,
      'iva_no_descontable_por_corregir', v_nd_fallo);
  else
    v_entry_id := fn_create_journal_entry($v$,
$v$  else
    v_entry_id := fn_create_journal_entry($v$, 'fn_auto_journal_purchase/pendiente (reversión)');

  v_def := pg_temp.fn_reemplazo_verificado(v_def,
$v$    v_inc := public.fn_impuesto_inc_parte('invoice_purchase', new.id::text, new.tax_total);
    -- iva_no_descontable_al_costo_20261108 (B5, ronda 3): el IVA no descontable ya determinado sale del impuesto y
    -- queda en la cuenta débito de la compra, como el INC, solo si esa cuenta es la de cada línea.
    -- Ronda 4: si no cuadra con el IVA (o el total) del documento, o la cuenta de cabecera no es la de cada línea, el
    -- documento queda pendiente de corregir (sin asiento); nunca todo a la 2408.
    v_nd := public.fn_iva_no_descontable_documento('invoice_purchase', new.id);
    if v_nd > greatest(abs(coalesce(new.tax_total, 0)) - v_inc, 0) or v_nd > abs(coalesce(new.total, 0)) then
      v_nd_fallo := format('IVA no descontable de las líneas (%s) mayor que el IVA del documento (%s): el documento queda pendiente de corregir y no se publica su asiento. Revise la tarifa, el IVA y la evaluación de cada línea y reintente.',
                           v_nd, greatest(abs(coalesce(new.tax_total, 0)) - v_inc, 0));
    elsif v_nd > 0 and not public.fn_documento_tiene_cuenta_propia(new.organization_id, new.id, 'compra') then
      v_nd_fallo := public.fn_iva_no_descontable_cuenta_unica_fallo(new.id, v_debito);
    end if;
    v_inc := v_inc + v_nd;
  end if;$v$,
$v$    v_inc := public.fn_impuesto_inc_parte('invoice_purchase', new.id::text, new.tax_total);
  end if;$v$, 'fn_auto_journal_purchase/no_descontable (reversión)');

  v_def := pg_temp.fn_reemplazo_verificado(v_def,
$v$  v_inc numeric := 0;
  v_nd numeric := 0;
  v_nd_fallo text;
begin$v$,
$v$  v_inc numeric := 0;
begin$v$, 'fn_auto_journal_purchase/declare (reversión)');

  execute v_def;
end;
$do$;

-- 4. fn_armar_asiento_documento
do $do$
declare
  v_firma constant regprocedure := 'public.fn_armar_asiento_documento(text,uuid,jsonb)'::regprocedure;
  v_def text := pg_get_functiondef(v_firma);
begin
  if position('iva_no_descontable_al_costo_20261108' in v_def) = 0 then
    raise notice 'fn_armar_asiento_documento no tiene el cambio B5';
    return;
  end if;

  v_def := pg_temp.fn_reemplazo_verificado(v_def,
$v$    v_parte := v_parte + v_fila.nd;           -- iva_no_descontable_al_costo_20261108: IVA no descontable de la línea
    if v_parte = 0 then
      continue;
    end if;$v$,
$v$    if v_parte = 0 then
      continue;
    end if;$v$, 'fn_armar_asiento_documento/parte (reversión)');

  v_def := pg_temp.fn_reemplazo_verificado(v_def,
$v$           e->>'descripcion' as descripcion,
           coalesce((e->>'nd')::numeric, 0) as nd
      from jsonb_array_elements(v_reparto) e$v$,
$v$           e->>'descripcion' as descripcion
      from jsonb_array_elements(v_reparto) e$v$, 'fn_armar_asiento_documento/bucle (reversión)');

  v_def := pg_temp.fn_reemplazo_verificado(v_def,
$v$               coalesce(nullif(btrim(ii.description), ''), v_memo) as descripcion,
               case when v_nd > 0 then public.fn_iva_no_descontable_linea(ii.id) else 0 end as nd
          from public.invoice_items ii$v$,
$v$               coalesce(nullif(btrim(ii.description), ''), v_memo) as descripcion
          from public.invoice_items ii$v$, 'fn_armar_asiento_documento/linea (reversión)');

  v_def := pg_temp.fn_reemplazo_verificado(v_def,
$v$'orden', s.orden, 'cuenta', s.cuenta, 'monto', s.monto, 'descripcion', s.descripcion, 'nd', s.nd
           ) order by s.orden), '[]'::jsonb)
      into v_reparto
      from (
        select row_number() over (order by ii.created_at, ii.id) as orden,$v$,
$v$'orden', s.orden, 'cuenta', s.cuenta, 'monto', s.monto, 'descripcion', s.descripcion
           ) order by s.orden), '[]'::jsonb)
      into v_reparto
      from (
        select row_number() over (order by ii.created_at, ii.id) as orden,$v$, 'fn_armar_asiento_documento/reparto (reversión)');

  v_def := pg_temp.fn_reemplazo_verificado(v_def,
$v$    v_tax := round(v_tax - v_inc, 2);
    v_inc := 0;
    -- iva_no_descontable_al_costo_20261108 (B5, ronda 3): el IVA cuya improcedencia como descuento ya está
    -- determinada sale de la 2408 y se suma a la línea del documento a la que pertenece (su cuenta).
    -- Ronda 4: si no cuadra con el IVA (o el total) del documento, no se adivina ni se deja todo en la 2408: el
    -- documento queda pendiente de corregir y no se publica el asiento.
    v_nd := public.fn_iva_no_descontable_documento(v_source, p_id);
    if v_nd > v_tax or v_nd > v_total then
      return jsonb_build_object('ok', false, 'fallo',
        format('IVA no descontable de las líneas (%s) mayor que el IVA del documento (%s): el documento queda pendiente de corregir y no se publica su asiento. Revise la tarifa, el IVA y la evaluación de cada línea y reintente.', v_nd, v_tax),
        'lineas', '[]'::jsonb, 'organization_id', v_org);
    end if;
    v_tax := round(v_tax - v_nd, 2);
  else$v$,
$v$    v_tax := round(v_tax - v_inc, 2);
    v_inc := 0;
  else$v$, 'fn_armar_asiento_documento/no_descontable (reversión)');

  v_def := pg_temp.fn_reemplazo_verificado(v_def,
$v$  v_inc numeric := 0;
  v_inc_cta text;
  v_nd numeric := 0;
begin$v$,
$v$  v_inc numeric := 0;
  v_inc_cta text;
begin$v$, 'fn_armar_asiento_documento/declare (reversión)');

  execute v_def;
end;
$do$;

-- 3. fn_iva_pesos_por_tarifa
do $do$
declare
  v_firma constant regprocedure := 'public.fn_iva_pesos_por_tarifa(integer,text,text)'::regprocedure;
  v_def text := pg_get_functiondef(v_firma);
begin
  if position('iva_no_descontable_al_costo_20261108' in v_def) = 0 then
    raise notice 'fn_iva_pesos_por_tarifa no tiene el cambio B5';
    return;
  end if;

  v_def := pg_temp.fn_reemplazo_verificado(v_def,
$v$    select b.t, sum(b.base * b.t / 100 * b.factor)
      from b
     group by b.t
    having p_source not in ('invoice_purchase', 'support_documents') or sum(b.base * b.t / 100 * b.factor) > 0;$v$,
$v$    select b.t, sum(b.base * b.t / 100)
      from b
     group by b.t;$v$, 'fn_iva_pesos_por_tarifa/suma (reversión)');

  v_def := pg_temp.fn_reemplazo_verificado(v_def,
$v$      select l.t, l.factor,
             abs(case when coalesce(l.ti_linea, l.ti_doc, false)$v$,
$v$      select l.t,
             abs(case when coalesce(l.ti_linea, l.ti_doc, false)$v$, 'fn_iva_pesos_por_tarifa/base (reversión)');

  v_def := pg_temp.fn_reemplazo_verificado(v_def,
$v$      select it.qty, it.unit_price, it.discount_amount, it.tax_included as ti_linea, it.tax_code,
             -- iva_no_descontable_al_costo_20261108 (B5): en compras y documento soporte, solo la parte descontable.
             case when p_source in ('invoice_purchase', 'support_documents')
                  then coalesce(public.fn_iva_factor_descontable_linea(it.id), 1) else 1 end as factor,$v$,
$v$      select it.qty, it.unit_price, it.discount_amount, it.tax_included as ti_linea, it.tax_code,$v$, 'fn_iva_pesos_por_tarifa/factor (reversión)');

  execute v_def;
end;
$do$;

drop function if exists pg_temp.fn_reemplazo_verificado(text, text, text, text);

drop function if exists public.fn_iva_no_descontable_cuenta_unica_fallo(uuid, text);
drop function if exists public.fn_iva_no_descontable_documento(text, uuid);
drop function if exists public.fn_iva_no_descontable_linea(uuid);
drop function if exists public.fn_iva_factor_descontable_linea(uuid);
