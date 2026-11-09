-- IVA no descontable determinado ANTES de contabilizar → al activo, costo o gasto de la línea (B5).
-- Contador, ronda 3 (2026-11-08, docs/contador/RESPUESTAS-CONTADOR-RONDA-3-2026-11-08.md): de acuerdo en llevarlo al
-- activo, costo o gasto desde el asiento de compra cuando ya esté determinado que no procede como descuento; esto NO
-- autoriza modificar históricos. Explicación: docs/contador/IVA-CLASIFICACION-Y-FORMULARIO-300.md (sección 8).
-- ESCRITA, NO APLICADA. Se aplica por el MCP después de 20261108140000 (H1) y 20261108150000 (columnas de procedencia).
-- Reversión: supabase/rollbacks/20261108152000_iva_no_descontable_al_costo_rollback.sql (antes que las de H1 y 150000).
--
-- Qué hace (compras y documento soporte; ventas y notas no cambian):
--   1. fn_iva_factor_descontable_linea(línea): parte del IVA de la línea que va a la 2408 descontable.
--        «no_descontable» → 0 · «proporcional» → % / 100 · «descontable», «por_evaluar» o sin evaluar → 1.
--        Solo cuenta lo DETERMINADO ANTES de contabilizar: si el documento ya tiene un asiento grabado antes de la
--        evaluación (iva_descontable_evaluado_en), la evaluación no cambia su contabilidad → 1. Así, recontabilizar
--        un documento ya contabilizado no lo reescribe con una evaluación posterior (no se tocan históricos).
--   2. fn_iva_no_descontable_linea(línea) = IVA de la línea × (1 − factor), con el IVA de la línea calculado igual
--      que en el borrador del 300 (fn_iva_base_linea × tarifa, a 2 decimales). INC excluido (ya va al costo).
--      fn_iva_no_descontable_documento(origen, id) = su suma en las líneas del documento.
--   3. fn_iva_pesos_por_tarifa (H1): en compras y documento soporte cada línea pesa por su parte descontable
--      (peso × factor), para que la 2408 que queda se reparta por tarifa sin incluir el IVA que se fue al costo.
--   4. fn_armar_asiento_documento (asiento por líneas: compras con cuenta propia y documento soporte): el IVA no
--      descontable sale de la línea de IVA y se suma a la línea del documento a la que pertenece (su cuenta de
--      inventario, activo, costo o gasto). El asiento sigue cuadrando: débitos = total.
--   5. fn_auto_journal_purchase (asiento de cabecera, sin cuenta propia por línea): el IVA no descontable sale del
--      impuesto y queda en la cuenta débito de la compra, igual que ya se hace con el INC, SOLO si esa cuenta es la de
--      cada una de las líneas (ronda 4, abajo).
--
-- RONDA 4 DEL CONTADOR (2026-11-09, docs/contador/RESPUESTAS-CONTADOR-RONDA-4-2026-11-09.md, «IVA · 1»), reescrita
-- sin aplicar. No acepta que una inconsistencia mande todo el IVA a la 2408, ni una cuenta única de cabecera cuando las
-- líneas pertenecen a activos o gastos distintos:
--   · IVA no descontable de las líneas MAYOR que el IVA del documento (o que su total): el documento queda PENDIENTE
--     DE CORREGIR y NO se publica el asiento definitivo. Asiento por líneas: fn_armar_asiento_documento devuelve
--     ok=false con el motivo (fn_asiento_documento_por_lineas lo deja en la bandeja de pendientes contables). Asiento
--     de cabecera: fn_auto_journal_purchase registra el pendiente 'iva_no_descontable_por_corregir' y no crea asiento.
--     En la ronda 3 el IVA entero quedaba en la 2408: ya no.
--   · Asiento de cabecera con IVA no descontable: fn_iva_no_descontable_cuenta_unica_fallo(compra, cuenta) dice si la
--     cuenta de cabecera NO es la de cada línea: líneas de distinta naturaleza (bienes y servicios, o sin tipo de
--     operación) o líneas de servicios que irían a una cuenta de inventarios (14…). Entonces el documento queda
--     pendiente 'iva_no_descontable_por_corregir' («asigne la cuenta contable de cada línea») y, ya con cuenta por
--     línea, se contabiliza por líneas: el IVA no descontable va a la cuenta de cada línea (paso 4).
-- Asientos ya publicados: NO se reescriben (ni UPDATE ni DELETE sobre journal_entries / journal_lines).
-- Llamadores con reemplazo verificado (cada texto viejo debe aparecer exactamente UNA vez; el rollback hace el inverso).
-- Prueba en seco (org 374, begin … rollback, H1 + 150000 + esta pegadas): docs/contador/pruebas/17_iva_no_descontable_al_costo.sql
-- Ronda 4: docs/contador/pruebas/18_iva_ronda4_contador.sql (inconsistencia y cuenta única de cabecera).

-- ── 1. Factor descontable de una línea ─────────────────────────────────────────
create or replace function public.fn_iva_factor_descontable_linea(p_item_id uuid)
returns numeric
language sql
stable
set search_path to 'public', 'pg_temp'
as $function$
  select case
           when coalesce(it.iva_descontable, 'por_evaluar') not in ('no_descontable', 'proporcional')
                or it.iva_descontable_evaluado_en is null then 1
           -- Determinado DESPUÉS de un asiento ya grabado del documento: no cambia su contabilidad.
           when exists (
             select 1 from public.journal_entries je
              where je.organization_id = coalesce(
                      (select p.organization_id from public.invoice_purchase p where p.id = it.invoice_purchase_id),
                      (select d.organization_id from public.support_documents d where d.id = it.support_document_id))
                and je.source = case when it.support_document_id is not null then 'support_documents' else 'invoice_purchase' end
                and je.source_id = coalesce(it.support_document_id, it.invoice_purchase_id)::text
                and je.created_at < it.iva_descontable_evaluado_en) then 1
           when it.iva_descontable = 'no_descontable' then 0
           else least(greatest(coalesce(it.iva_descontable_porcentaje, 0), 0), 100) / 100
         end
    from public.invoice_items it
   where it.id = p_item_id
     and (it.invoice_purchase_id is not null or it.support_document_id is not null);
$function$;

comment on function public.fn_iva_factor_descontable_linea(uuid) is
  'Parte del IVA de una línea de compra o documento soporte que va a la 2408 descontable: 0 no descontable, % del proporcional, 1 en otro caso. Solo cuenta la evaluación hecha antes del primer asiento del documento (B5, ronda 3).';

-- ── 2. IVA no descontable de una línea y de un documento ──────────────────────
create or replace function public.fn_iva_no_descontable_linea(p_item_id uuid)
returns numeric
language sql
stable
set search_path to 'public', 'pg_temp'
as $function$
  select coalesce((
    select case when f.factor >= 1 then 0
                when f.factor <= 0 then x.iva
                else x.iva - round(x.iva * f.factor, 2) end
      from public.invoice_items it
      cross join lateral (
        select abs(round(public.fn_iva_base_linea(it.qty, it.unit_price, it.discount_amount, it.tax_included, it.tax_rate)
                         * coalesce(it.tax_rate, 0) / 100, 2)) as iva) x
      cross join lateral (select coalesce(public.fn_iva_factor_descontable_linea(it.id), 1) as factor) f
     where it.id = p_item_id
       and coalesce(it.tax_rate, 0) > 0
       and upper(coalesce(it.tax_code, '')) not like 'INC%'
       and abs(coalesce(it.tax_rate, 0) - 8) >= 0.05), 0);
$function$;

comment on function public.fn_iva_no_descontable_linea(uuid) is
  'IVA de una línea de compra o documento soporte cuya improcedencia como descuento quedó determinada antes de contabilizar (no descontable, o la parte no procedente del proporcional). Va al costo, no a la 2408 (B5, ronda 3).';

create or replace function public.fn_iva_no_descontable_documento(p_source text, p_id uuid)
returns numeric
language sql
stable
set search_path to 'public', 'pg_temp'
as $function$
  select coalesce(sum(public.fn_iva_no_descontable_linea(ii.id)), 0)
    from public.invoice_items ii
   where case p_source
           when 'invoice_purchase' then ii.invoice_purchase_id = p_id
           when 'support_documents' then ii.support_document_id = p_id
           else false
         end;
$function$;

comment on function public.fn_iva_no_descontable_documento(text, uuid) is
  'Suma del IVA no descontable determinado antes de contabilizar en las líneas de una compra o documento soporte (B5, ronda 3).';

-- Ronda 4: ¿la cuenta de cabecera de una compra es la cuenta de cada línea? NULL = sí (el IVA no descontable puede ir
-- ahí); texto = el motivo por el que el documento queda pendiente de corregir (hace falta la cuenta de cada línea).
create or replace function public.fn_iva_no_descontable_cuenta_unica_fallo(p_invoice_purchase_id uuid, p_cuenta_cabecera text)
returns text
language sql
stable
set search_path to 'public', 'pg_temp'
as $function$
  with l as (
    select coalesce(it.iva_tipo_operacion,
                    case p.product_type when 'product' then 'bienes' when 'service' then 'servicios' end) as tipo
      from public.invoice_items it
      left join public.products p on p.id = it.product_id
     where it.invoice_purchase_id = p_invoice_purchase_id
  )
  select case
           when not exists (select 1 from l) then null
           when exists (select 1 from l where l.tipo is null) or (select count(distinct l.tipo) from l) > 1
             then 'IVA no descontable en una compra cuyas líneas son de activos, costos o gastos distintos (o sin tipo de operación): no se lleva a una cuenta única de cabecera. Asigne la cuenta contable de cada línea y reintente; el IVA no descontable irá a la cuenta de cada línea.'
           when coalesce(p_cuenta_cabecera, '') like '14%' and exists (select 1 from l where l.tipo = 'servicios')
             then 'IVA no descontable de servicios: la cuenta de cabecera de la compra es de inventarios (' || p_cuenta_cabecera || '). Asigne la cuenta de costo o gasto de cada línea y reintente.'
         end;
$function$;

comment on function public.fn_iva_no_descontable_cuenta_unica_fallo(uuid, text) is
  'Ronda 4 del Contador: NULL si la cuenta de cabecera de la compra es la de todas sus líneas; si no, el motivo por el que el IVA no descontable no puede ir a una cuenta única (el documento queda pendiente de corregir).';

revoke all on function public.fn_iva_factor_descontable_linea(uuid) from public, anon;
revoke all on function public.fn_iva_no_descontable_linea(uuid) from public, anon;
revoke all on function public.fn_iva_no_descontable_documento(text, uuid) from public, anon;
revoke all on function public.fn_iva_no_descontable_cuenta_unica_fallo(uuid, text) from public, anon;
grant execute on function public.fn_iva_factor_descontable_linea(uuid) to authenticated, service_role;
grant execute on function public.fn_iva_no_descontable_linea(uuid) to authenticated, service_role;
grant execute on function public.fn_iva_no_descontable_documento(text, uuid) to authenticated, service_role;
grant execute on function public.fn_iva_no_descontable_cuenta_unica_fallo(uuid, text) to authenticated, service_role;

-- ── 3 a 5. Llamadores: reemplazos verificados ──────────────────────────────────
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

-- 3. fn_iva_pesos_por_tarifa (de H1)
do $do$
declare
  v_firma constant regprocedure := 'public.fn_iva_pesos_por_tarifa(integer,text,text)'::regprocedure;
  v_def text := pg_get_functiondef(v_firma);
begin
  if position('iva_no_descontable_al_costo_20261108' in v_def) > 0 then
    raise notice 'fn_iva_pesos_por_tarifa ya pesa la parte descontable';
    return;
  end if;

  v_def := pg_temp.fn_reemplazo_verificado(v_def,
$v$      select it.qty, it.unit_price, it.discount_amount, it.tax_included as ti_linea, it.tax_code,$v$,
$v$      select it.qty, it.unit_price, it.discount_amount, it.tax_included as ti_linea, it.tax_code,
             -- iva_no_descontable_al_costo_20261108 (B5): en compras y documento soporte, solo la parte descontable.
             case when p_source in ('invoice_purchase', 'support_documents')
                  then coalesce(public.fn_iva_factor_descontable_linea(it.id), 1) else 1 end as factor,$v$, 'fn_iva_pesos_por_tarifa/factor');

  v_def := pg_temp.fn_reemplazo_verificado(v_def,
$v$      select l.t,
             abs(case when coalesce(l.ti_linea, l.ti_doc, false)$v$,
$v$      select l.t, l.factor,
             abs(case when coalesce(l.ti_linea, l.ti_doc, false)$v$, 'fn_iva_pesos_por_tarifa/base');

  v_def := pg_temp.fn_reemplazo_verificado(v_def,
$v$    select b.t, sum(b.base * b.t / 100)
      from b
     group by b.t;$v$,
$v$    select b.t, sum(b.base * b.t / 100 * b.factor)
      from b
     group by b.t
    having p_source not in ('invoice_purchase', 'support_documents') or sum(b.base * b.t / 100 * b.factor) > 0;$v$, 'fn_iva_pesos_por_tarifa/suma');

  execute v_def;
end;
$do$;

-- 4. fn_armar_asiento_documento (asiento por líneas)
do $do$
declare
  v_firma constant regprocedure := 'public.fn_armar_asiento_documento(text,uuid,jsonb)'::regprocedure;
  v_def text := pg_get_functiondef(v_firma);
begin
  if position('iva_no_descontable_al_costo_20261108' in v_def) > 0 then
    raise notice 'fn_armar_asiento_documento ya lleva el IVA no descontable al costo';
    return;
  end if;

  v_def := pg_temp.fn_reemplazo_verificado(v_def,
$v$  v_inc numeric := 0;
  v_inc_cta text;
begin$v$,
$v$  v_inc numeric := 0;
  v_inc_cta text;
  v_nd numeric := 0;
begin$v$, 'fn_armar_asiento_documento/declare');

  v_def := pg_temp.fn_reemplazo_verificado(v_def,
$v$    v_tax := round(v_tax - v_inc, 2);
    v_inc := 0;
  else$v$,
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
  else$v$, 'fn_armar_asiento_documento/no_descontable');

  v_def := pg_temp.fn_reemplazo_verificado(v_def,
$v$'orden', s.orden, 'cuenta', s.cuenta, 'monto', s.monto, 'descripcion', s.descripcion
           ) order by s.orden), '[]'::jsonb)
      into v_reparto
      from (
        select row_number() over (order by ii.created_at, ii.id) as orden,$v$,
$v$'orden', s.orden, 'cuenta', s.cuenta, 'monto', s.monto, 'descripcion', s.descripcion, 'nd', s.nd
           ) order by s.orden), '[]'::jsonb)
      into v_reparto
      from (
        select row_number() over (order by ii.created_at, ii.id) as orden,$v$, 'fn_armar_asiento_documento/reparto');

  v_def := pg_temp.fn_reemplazo_verificado(v_def,
$v$               coalesce(nullif(btrim(ii.description), ''), v_memo) as descripcion
          from public.invoice_items ii$v$,
$v$               coalesce(nullif(btrim(ii.description), ''), v_memo) as descripcion,
               case when v_nd > 0 then public.fn_iva_no_descontable_linea(ii.id) else 0 end as nd
          from public.invoice_items ii$v$, 'fn_armar_asiento_documento/linea');

  v_def := pg_temp.fn_reemplazo_verificado(v_def,
$v$           e->>'descripcion' as descripcion
      from jsonb_array_elements(v_reparto) e$v$,
$v$           e->>'descripcion' as descripcion,
           coalesce((e->>'nd')::numeric, 0) as nd
      from jsonb_array_elements(v_reparto) e$v$, 'fn_armar_asiento_documento/bucle');

  v_def := pg_temp.fn_reemplazo_verificado(v_def,
$v$    if v_parte = 0 then
      continue;
    end if;$v$,
$v$    v_parte := v_parte + v_fila.nd;           -- iva_no_descontable_al_costo_20261108: IVA no descontable de la línea
    if v_parte = 0 then
      continue;
    end if;$v$, 'fn_armar_asiento_documento/parte');

  execute v_def;
end;
$do$;

-- 5. fn_auto_journal_purchase (asiento de cabecera)
do $do$
declare
  v_firma constant regprocedure := 'public.fn_auto_journal_purchase()'::regprocedure;
  v_def text := pg_get_functiondef(v_firma);
begin
  if position('iva_no_descontable_al_costo_20261108' in v_def) > 0 then
    raise notice 'fn_auto_journal_purchase ya lleva el IVA no descontable al costo';
    return;
  end if;

  v_def := pg_temp.fn_reemplazo_verificado(v_def,
$v$  v_inc numeric := 0;
begin$v$,
$v$  v_inc numeric := 0;
  v_nd numeric := 0;
  v_nd_fallo text;
begin$v$, 'fn_auto_journal_purchase/declare');

  v_def := pg_temp.fn_reemplazo_verificado(v_def,
$v$    v_inc := public.fn_impuesto_inc_parte('invoice_purchase', new.id::text, new.tax_total);
  end if;$v$,
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
  end if;$v$, 'fn_auto_journal_purchase/no_descontable');

  v_def := pg_temp.fn_reemplazo_verificado(v_def,
$v$  else
    v_entry_id := fn_create_journal_entry($v$,
$v$  elsif v_nd_fallo is not null then
    -- iva_no_descontable_al_costo_20261108 (ronda 4): pendiente de corregir, sin asiento definitivo.
    perform fn_log_journal_failure(
      new.organization_id, new.branch_id, coalesce(new.issue_date, now()),
      'invoice_purchase', new.id::text, v_fact_key,
      v_debito, v_credito, new.total,
      'iva_no_descontable_por_corregir', v_nd_fallo);
  else
    v_entry_id := fn_create_journal_entry($v$, 'fn_auto_journal_purchase/pendiente');

  execute v_def;
end;
$do$;

drop function if exists pg_temp.fn_reemplazo_verificado(text, text, text, text);
