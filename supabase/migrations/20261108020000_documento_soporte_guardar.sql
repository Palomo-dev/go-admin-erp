-- Documento soporte: guardar en una transacción y líneas legibles por la organización.
-- Aplicada por el MCP el 2026-11-07 con orden del dueño (incluye el DROP de los CHECK viejos).
--
-- Por qué (verificado por el MCP el 2026-11-07, proyecto taqjemqjtumhwptchcxk):
-- 1. `invoice_items` NO admite líneas de documento soporte: su CHECK
--    `invoice_items_invoice_type_check` solo deja 'sale' y 'purchase', y
--    `chk_invoice_items_type_sales` exige factura de venta o de compra. El
--    formulario viejo insertaba `invoice_type = 'support_document'` desde el
--    navegador: el insert fallaba SIEMPRE y dejaba la cabecera huérfana
--    (en la base hay 0 documentos soporte). La cola (`colaFacturacion`) y el
--    motor de documentos ya leen las líneas por `invoice_items.support_document_id`
--    (esa FK existe, con ON DELETE CASCADE): se amplían los CHECK, no se crea
--    otra tabla, y el envío a la DIAN no cambia.
-- 2. La RLS de `invoice_items` solo cubre 'sale' y 'purchase': las líneas de
--    un documento soporte no se podían leer con la sesión del usuario (el PDF del
--    motor salía sin líneas). Se añade una política de LECTURA por pertenencia;
--    las escrituras van solo por la RPC.
-- 3. Cabecera y líneas en UNA transacción (CLAUDE.md: servicios multi-tabla en
--    RPC), con la referencia `DS-0001` calculada en la base con bloqueo (antes,
--    leyendo la última desde el navegador: carrera posible) y única por
--    organización (índice parcial; hoy 0 filas, se crea sin limpiar nada).
--
-- Aditiva: CHECK más amplios (toda fila actual cumple los nuevos), política
-- nueva, índice nuevo y dos funciones nuevas. Reversión:
-- supabase/rollbacks/20261108020000_documento_soporte_guardar_rollback.sql

-- ── 1. CHECK de invoice_items: admitir líneas de documento soporte ─────────────
alter table public.invoice_items
  add constraint invoice_items_invoice_type_check_v2
  check (invoice_type = any (array['sale'::text, 'purchase'::text, 'support_document'::text])) not valid;
alter table public.invoice_items validate constraint invoice_items_invoice_type_check_v2;
alter table public.invoice_items drop constraint if exists invoice_items_invoice_type_check;

alter table public.invoice_items
  add constraint chk_invoice_items_documento
  check (
    (invoice_type = 'sale' and invoice_sales_id is not null and invoice_purchase_id is null)
    or (invoice_type = 'purchase' and invoice_purchase_id is not null and invoice_sales_id is null)
    or (invoice_type = 'support_document' and support_document_id is not null
        and invoice_sales_id is null and invoice_purchase_id is null)
  ) not valid;
alter table public.invoice_items validate constraint chk_invoice_items_documento;
alter table public.invoice_items drop constraint if exists chk_invoice_items_type_sales;

-- ── 2. Lectura de las líneas del documento soporte por la organización ────────
-- IN (SELECT … JOIN) con (select auth.uid()): el EXISTS anidado por fila es el
-- patrón que ya dio tiempos de espera en otras tablas.
drop policy if exists invoice_items_soporte_select on public.invoice_items;
create policy invoice_items_soporte_select on public.invoice_items
  for select to authenticated
  using (
    invoice_type = 'support_document'
    and support_document_id in (
      select sd.id
        from public.support_documents sd
        join public.organization_members om on om.organization_id = sd.organization_id
       where om.user_id = (select auth.uid()) and om.is_active
    )
  );

-- ── 3. Referencia única por organización ─────────────────────────────────────
create unique index if not exists uq_support_documents_org_referencia
  on public.support_documents (organization_id, reference_code);

-- ── 4. Siguiente referencia DS-0001 (con bloqueo) ────────────────────────────
create or replace function public.fn_documento_soporte_referencia(p_org integer)
 returns text
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_max integer;
begin
  perform public.fn_assert_acceso_org(p_org);
  perform pg_advisory_xact_lock(hashtext('documento_soporte_referencia'), p_org);
  select coalesce(max((substring(reference_code from '^DS-(\d{1,9})$'))::integer), 0)
    into v_max
    from public.support_documents
   where organization_id = p_org;
  return 'DS-' || lpad((v_max + 1)::text, 4, '0');
end;
$function$;

revoke all on function public.fn_documento_soporte_referencia(integer) from public, anon;
grant execute on function public.fn_documento_soporte_referencia(integer) to authenticated, service_role;

-- ── 5. Guardar (crear o editar) en una transacción ───────────────────────────
-- p_datos: { branch_id, supplier_id, provider (jsonb armado en el servidor desde
-- `suppliers`), invoice_purchase_id?, issue_date (YYYY-MM-DD), payment_form
-- ('1' contado | '2' crédito), payment_method_code (código DIAN), due_date?,
-- currency?, observation?, tax_included, items: [{ product_id?, description,
-- qty, unit_price, discount_amount?, tax_rate?, tax_code?, cuenta_contable?, note? }] }
create or replace function public.fn_documento_soporte_guardar(p_org integer, p_id uuid, p_datos jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_doc public.support_documents%rowtype;
  v_id uuid;
  v_ref text;
  v_branch integer;
  v_supplier integer;
  v_compra uuid;
  v_fecha date;
  v_tz text;
  v_emision timestamptz;
  v_forma text;
  v_medio text;
  v_vence date;
  v_incluido boolean;
  v_items jsonb;
  v_item jsonb;
  v_qty numeric;
  v_precio numeric;
  v_desc numeric;
  v_tasa numeric;
  v_producto integer;
  v_neto numeric;
  v_base numeric;
  v_imp numeric;
  v_total_linea numeric;
  v_subtotal numeric := 0;
  v_impuestos numeric := 0;
  v_total numeric := 0;
  v_orden integer := 0;
begin
  if v_uid is null then
    raise exception 'no_autenticado' using errcode = '42501';
  end if;
  perform public.fn_finanzas_exigir_permiso(p_org, array['finance.create']);
  if p_datos is null or jsonb_typeof(p_datos) <> 'object' then
    raise exception 'datos_invalidos' using errcode = '22023';
  end if;

  v_branch := nullif(p_datos->>'branch_id', '')::integer;
  if v_branch is null or not exists (select 1 from public.branches b where b.id = v_branch and b.organization_id = p_org) then
    raise exception 'sucursal_invalida' using errcode = '22023';
  end if;
  if not public.app_branch_access(v_branch) then
    raise exception 'sin_acceso_sucursal' using errcode = '42501';
  end if;
  v_supplier := nullif(p_datos->>'supplier_id', '')::integer;
  if v_supplier is null or not exists (select 1 from public.suppliers s where s.id = v_supplier and s.organization_id = p_org) then
    raise exception 'proveedor_invalido' using errcode = '22023';
  end if;
  if jsonb_typeof(p_datos->'provider') <> 'object' or coalesce(btrim(p_datos->'provider'->>'names'), '') = '' then
    raise exception 'proveedor_invalido' using errcode = '22023';
  end if;
  v_compra := nullif(p_datos->>'invoice_purchase_id', '')::uuid;
  if v_compra is not null and not exists (select 1 from public.invoice_purchase ip where ip.id = v_compra and ip.organization_id = p_org) then
    raise exception 'compra_invalida' using errcode = '22023';
  end if;

  -- Día de emisión de la organización → mediodía en su zona: el día no se corre
  -- al leerlo en otra zona (antes: medianoche UTC del navegador).
  v_tz := public.fn_timezone_for(p_org, v_branch);
  v_fecha := coalesce(nullif(p_datos->>'issue_date', '')::date, public.fn_today_for_org(p_org));
  v_emision := (v_fecha + time '12:00') at time zone v_tz;
  v_forma := coalesce(nullif(p_datos->>'payment_form', ''), '1');
  if v_forma not in ('1', '2') then
    raise exception 'datos_invalidos' using errcode = '22023';
  end if;
  v_medio := nullif(btrim(coalesce(p_datos->>'payment_method_code', '')), '');
  if v_medio is null then
    raise exception 'medio_pago_requerido' using errcode = '22023';
  end if;
  v_vence := nullif(p_datos->>'due_date', '')::date;
  if v_forma = '2' and (v_vence is null or v_vence < v_fecha) then
    raise exception 'vencimiento_invalido' using errcode = '22023';
  end if;
  v_incluido := coalesce((p_datos->>'tax_included')::boolean, false);

  v_items := p_datos->'items';
  if v_items is null or jsonb_typeof(v_items) <> 'array' or jsonb_array_length(v_items) = 0 then
    raise exception 'documento_sin_lineas' using errcode = '22023';
  end if;
  if jsonb_array_length(v_items) > 500 then
    raise exception 'datos_invalidos' using errcode = '22023';
  end if;
  for v_item in select * from jsonb_array_elements(v_items) loop
    v_qty := (v_item->>'qty')::numeric;
    v_precio := coalesce((v_item->>'unit_price')::numeric, 0);
    v_desc := coalesce((v_item->>'discount_amount')::numeric, 0);
    v_tasa := coalesce((v_item->>'tax_rate')::numeric, 0);
    v_producto := nullif(v_item->>'product_id', '')::integer;
    if v_qty is null or v_qty <= 0 or v_precio < 0 or v_desc < 0 or v_desc > v_qty * v_precio
       or v_tasa < 0 or v_tasa > 100 or coalesce(btrim(v_item->>'description'), '') = '' then
      raise exception 'linea_invalida' using errcode = '22023';
    end if;
    if v_producto is not null and not exists (select 1 from public.products p where p.id = v_producto and p.organization_id = p_org) then
      raise exception 'producto_invalido' using errcode = '22023';
    end if;
  end loop;

  if p_id is null then
    v_ref := public.fn_documento_soporte_referencia(p_org);
    insert into public.support_documents (
      organization_id, branch_id, supplier_id, invoice_purchase_id, reference_code, issue_date, created_time,
      observation, payment_details, cash_rounding_amount, provider, currency, tax_included, status, created_by
    ) values (
      p_org, v_branch, v_supplier, v_compra, v_ref, v_emision, to_char(now() at time zone v_tz, 'HH24:MI:SS'),
      nullif(left(coalesce(p_datos->>'observation', ''), 500), ''), '[]'::jsonb, 0, p_datos->'provider',
      nullif(btrim(coalesce(p_datos->>'currency', '')), ''), v_incluido, 'draft', v_uid
    )
    returning id into v_id;
  else
    select * into v_doc from public.support_documents where id = p_id and organization_id = p_org for update;
    if not found then
      raise exception 'documento_no_encontrado' using errcode = 'P0002';
    end if;
    -- Solo lo que la DIAN no ha recibido: borrador, rechazado o con error, sin envío vivo.
    if v_doc.status not in ('draft', 'rejected', 'failed') or coalesce(v_doc.is_validated, false) then
      raise exception 'documento_no_editable' using errcode = '22023';
    end if;
    if exists (select 1 from public.electronic_invoicing_jobs j
                where j.support_document_id = v_doc.id and j.status in ('pending', 'processing', 'sent')) then
      raise exception 'documento_en_envio' using errcode = '22023';
    end if;
    -- Nacido de una factura de compra (`fn_fc_crear_ds_int`): sus líneas SON las de la
    -- compra. Reemplazarlas borraría las de la compra; se corrige la compra.
    if exists (select 1 from public.invoice_items ii
                where ii.support_document_id = v_doc.id and ii.invoice_type <> 'support_document') then
      raise exception 'documento_de_compra' using errcode = '22023';
    end if;
    if v_doc.branch_id is not null and not public.app_branch_access(v_doc.branch_id) then
      raise exception 'sin_acceso_sucursal' using errcode = '42501';
    end if;
    v_id := v_doc.id;
    v_ref := v_doc.reference_code;
    update public.support_documents set
      branch_id = v_branch, supplier_id = v_supplier, invoice_purchase_id = v_compra, issue_date = v_emision,
      observation = nullif(left(coalesce(p_datos->>'observation', ''), 500), ''), provider = p_datos->'provider',
      currency = coalesce(nullif(btrim(coalesce(p_datos->>'currency', '')), ''), currency),
      tax_included = v_incluido, updated_at = now()
    where id = v_id;
    delete from public.invoice_items where support_document_id = v_id and invoice_type = 'support_document';
  end if;

  for v_item in select * from jsonb_array_elements(v_items) loop
    v_orden := v_orden + 1;
    v_qty := (v_item->>'qty')::numeric;
    v_precio := coalesce((v_item->>'unit_price')::numeric, 0);
    v_desc := round(coalesce((v_item->>'discount_amount')::numeric, 0), 2);
    v_tasa := coalesce((v_item->>'tax_rate')::numeric, 0);
    v_producto := nullif(v_item->>'product_id', '')::integer;
    -- Misma regla que calcularLineaCompra / fn_recalc_invoice_totals (F-51).
    v_neto := round(v_qty * v_precio, 2) - v_desc;
    if v_incluido then
      v_base := case when v_tasa > 0 then round(v_neto / (1 + v_tasa / 100), 2) else v_neto end;
      v_imp := v_neto - v_base;
      v_total_linea := v_neto;
    else
      v_base := v_neto;
      v_imp := case when v_tasa > 0 then round(v_neto * v_tasa / 100, 2) else 0 end;
      v_total_linea := v_neto + v_imp;
    end if;
    v_subtotal := v_subtotal + v_base;
    v_impuestos := v_impuestos + v_imp;
    v_total := v_total + v_total_linea;

    insert into public.invoice_items (
      invoice_id, invoice_type, support_document_id, invoice_sales_id, invoice_purchase_id, product_id, description,
      qty, unit_price, discount_amount, tax_code, tax_rate, tax_included, total_line, code_reference, is_excluded,
      note, cuenta_contable, created_at
    ) values (
      v_id, 'support_document', v_id, null, null, v_producto, btrim(v_item->>'description'),
      v_qty, v_precio, v_desc,
      (select t.code from public.tax_templates t where t.code = nullif(v_item->>'tax_code', '')),
      v_tasa, v_incluido, v_total_linea,
      case when v_producto is not null then 'PROD-' || v_producto else 'ITEM-' || v_orden end,
      case when v_tasa = 0 then 1 else 0 end,
      nullif(btrim(coalesce(v_item->>'note', '')), ''),
      nullif(btrim(coalesce(v_item->>'cuenta_contable', '')), ''),
      now() + make_interval(secs => v_orden / 1000.0)
    );
  end loop;

  update public.support_documents set
    subtotal = v_subtotal, tax_total = v_impuestos, total = v_total,
    payment_details = jsonb_build_array(
      jsonb_strip_nulls(jsonb_build_object(
        'payment_form', v_forma,
        'payment_method_code', v_medio,
        'amount', to_char(v_total, 'FM999999999999990.00'),
        'due_date', case when v_forma = '2' then v_vence::text end
      ))
    ),
    updated_at = now()
  where id = v_id;

  insert into public.finance_audit_log (organization_id, entity, entity_id, action, user_id, diff)
  values (p_org, 'support_documents', v_id::text, case when p_id is null then 'insert' else 'update' end, v_uid,
          jsonb_build_object('referencia', v_ref, 'lineas', jsonb_array_length(v_items), 'total', v_total));

  return jsonb_build_object('id', v_id, 'referencia', v_ref, 'subtotal', v_subtotal, 'tax_total', v_impuestos, 'total', v_total);
end;
$function$;

revoke all on function public.fn_documento_soporte_guardar(integer, uuid, jsonb) from public, anon;
grant execute on function public.fn_documento_soporte_guardar(integer, uuid, jsonb) to authenticated, service_role;

comment on function public.fn_documento_soporte_guardar(integer, uuid, jsonb) is
  'Crea o edita un documento soporte (borrador, rechazado o con error, sin envío vivo) con sus líneas en una transacción. Permiso finance.create. La referencia DS-#### la pone la base.';
