-- Cotizaciones de venta — escritura en el servidor, totales en la base,
-- numeración única y conversión a factura por la lógica canónica.
--
-- Antes (cotizacionesService.ts corría en el navegador, sin permisos):
--   · convertToInvoice numeraba FACT- en el navegador, insertaba la factura YA
--     emitida (cartera y asiento con el total de cabecera antes de las
--     líneas), sin kardex, sin venta ligada, sin impuestos del documento, sin
--     comisión y sin transacción; marcaba la cotización con dos updates
--     sueltos, dejaba convertir una rechazada y emitía facturas a cualquier
--     miembro sin finance.create;
--   · crear/editar/duplicar/cambiar estado/eliminar eran llamadas sueltas, sin
--     permiso y algunas sin filtro de organización; la cabecera no cuadraba
--     con las líneas tras promociones y resolveLineTax;
--   · numeración COT- «el último + 1» leída en el navegador (carrera) y otra
--     copia en el CRM; 'expired' nunca se asignaba.
--
-- Daño medido el 2026-09-28 (solo se reporta, no se repara): 7 cotizaciones en
-- 3 organizaciones; 4 convertidas por el camino viejo → 4 facturas
-- ('issued' ×3, 'paid' ×1), todas con líneas (1 cada una), ninguna con kardex
-- ni comisión, 3 sin venta ligada; 3 cotizaciones 'sent' ya vencidas (que se
-- mostraban como enviadas); 0 números duplicados por organización; 0
-- cotizaciones sin sucursal; 0 cabeceras descuadradas con sus líneas.
--
-- 1. invoice_sales.quotation_id (aditiva, NULL): la cotización de la que nace
--    la factura (cadena de documentos).
-- 2. UNIQUE (organization_id, number) en quotations (0 duplicados medidos).
-- 3. fn_cotizacion_numero (interna): consecutivo 'quote' de la sucursal
--    (sale_sequences, el mismo de Configuración › Consecutivos) si existe y
--    está activo; si no, COT-0001 correlativo por organización con candado.
-- 4. fn_cotizacion_estado_vivo: 'expired' se deriva al leer (borrador o
--    enviada con valid_until anterior al día de la organización), sin cron y
--    sin escribir la fila, como el estado vencido de la cartera.
-- 5. fn_cotizacion_recalcular (interna): total_line de cada línea con la regla
--    de computeLineTotal (taxResolverCore) y la cabecera con la regla de
--    fn_recalc_invoice_totals (con impuesto incluido la base se redondea por
--    línea); descuento = suma de descuentos de línea. «Impuesto incluido» es
--    del documento, como en la factura.
-- 6. fn_cotizacion_guardar(org, id, datos): crea o edita (solo draft/sent) en
--    una transacción; número en la base; cliente, sucursal, vendedor,
--    oportunidad y productos validados contra la organización.
-- 7. fn_cotizacion_cambiar_estado, fn_cotizacion_eliminar (solo draft),
--    fn_cotizacion_duplicar (vigencia nueva desde hoy).
-- 8. fn_cotizacion_convertir(org, id, número, sucursal, oportunidad, tasa):
--    finance.create, FOR UPDATE de la cotización, idempotente (una convertida
--    devuelve su factura), no convierte rechazadas ni vencidas; la factura nace
--    en BORRADOR por fn_factura_venta_guardar (venta ligada, impuestos,
--    comisión) y se emite después con la emisión estándar. El número del
--    borrador lo propone la ruta con la regla del formulario de facturas
--    (generateInvoiceNumberWithClient); fn_factura_venta_guardar exige que sea
--    único (numero_duplicado → la ruta pide otro).
-- 9. fn_cotizaciones_listado: listado y detalle con el estado vivo.
--
-- Permisos (resueltos en la base con fn_finanzas_exigir_permiso, que exige
-- además pertenencia con fn_assert_acceso_org): escribir una cotización pide
-- finance.create o sales_management (el mismo par que el motor de documentos
-- usa para verla: PERMISOS_POR_TIPO.cotizacion = finance.view | sales_management);
-- convertir pide finance.create, porque crea una factura.
--
-- Dry-run 2026-09-28 en una transacción que se deshace (org 125): alta con 2
-- líneas y total_line falso del cliente → COT-0006 con líneas 2.261 y 1.190,
-- subtotal 2.900, impuesto 551, descuento 100, total 3.451 (el número 'HACK-1'
-- del cuerpo se ignora); usuario sin finance.create ni sales_management →
-- sin_permiso (también al convertir); usuario de otra organización → «Acceso
-- denegado» y con su propia organización → cotizacion_no_encontrada;
-- draft→sent y sent→sent (sin_cambio); →converted → transicion_invalida;
-- eliminar una enviada → cotizacion_no_eliminable; aceptar o convertir una
-- 'sent' vencida → cotizacion_vencida; duplicar → COT-0007 con vigencia desde
-- hoy; convertir → factura BORRADOR con venta ligada (2 sale_items), 2 líneas,
-- IVA_19 en invoice_applied_taxes, comisión 5 %, quotation_id y sin cartera ni
-- asiento (nacen al emitir), faltantes de inventario como aviso; convertir otra
-- vez → la misma factura (ya_convertida); convertir una rechazada →
-- cotizacion_rechazada; editar la convertida → cotizacion_no_editable; el
-- listado con estado 'expired' devuelve las 3 'sent' vencidas de la org.
-- Hallado en el dry-run y corregido aquí: con líneas de distinto «impuesto
-- incluido» la factura partía distinto la base (la factura lo lee del
-- documento), por eso el indicador es del documento; y un tax_code que no es
-- plantilla rompía la FK de invoice_items al convertir.

-- ── 1 ── Cadena de documentos ──────────────────────────────────────────────
alter table public.invoice_sales
  add column if not exists quotation_id uuid null references public.quotations(id) on delete set null;
create index if not exists idx_invoice_sales_quotation on public.invoice_sales (quotation_id)
  where quotation_id is not null;
comment on column public.invoice_sales.quotation_id is
  'Cotización de la que nace la factura (fn_cotizacion_convertir). NULL en facturas sin cotización o convertidas antes del 2026-09-28.';

-- ── 2 ── Número único por organización ─────────────────────────────────────
create unique index if not exists uq_quotations_org_number on public.quotations (organization_id, number);

-- ── 3 ── Numeración ────────────────────────────────────────────────────────
create or replace function public.fn_cotizacion_numero(p_org integer, p_branch integer)
 returns text
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_numero text;
  v_intentos integer := 0;
begin
  perform pg_advisory_xact_lock(hashtextextended('numero_cotizacion:' || p_org, 0));
  if p_branch is not null and exists (
      select 1 from public.sale_sequences s
       where s.organization_id = p_org and s.branch_id = p_branch and s.sequence_type = 'quote' and s.is_active) then
    -- El consecutivo de la sucursal; si choca con un número ya usado (reinicio
    -- periódico, otra sucursal con el mismo prefijo), avanza.
    loop
      v_numero := public.fn_get_next_sale_number(p_org, p_branch, 'quote');
      exit when not exists (select 1 from public.quotations q where q.organization_id = p_org and q.number = v_numero);
      v_intentos := v_intentos + 1;
      if v_intentos >= 50 then
        raise exception 'numero_duplicado' using errcode = '23505';
      end if;
    end loop;
    return v_numero;
  end if;
  select 'COT-' || lpad((coalesce(max(substring(q.number from '^COT-(\d+)$')::bigint), 0) + 1)::text, 4, '0')
    into v_numero
    from public.quotations q
   where q.organization_id = p_org and q.number ~ '^COT-\d+$';
  return v_numero;
end;
$function$;

revoke all on function public.fn_cotizacion_numero(integer, integer) from public, anon, authenticated;
grant execute on function public.fn_cotizacion_numero(integer, integer) to service_role;

-- ── 4 ── Estado vivo ───────────────────────────────────────────────────────
create or replace function public.fn_cotizacion_estado_vivo(p_status text, p_valid_until date, p_hoy date)
 returns text
 language sql
 immutable
 set search_path to 'public', 'pg_temp'
as $function$
  select case
    when p_status in ('draft', 'sent') and p_valid_until is not null and p_hoy is not null and p_valid_until < p_hoy
      then 'expired'
    else p_status
  end;
$function$;

-- ── 5 ── Totales desde las líneas ──────────────────────────────────────────
create or replace function public.fn_cotizacion_recalcular(p_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_sub numeric;
  v_total numeric;
  v_desc numeric;
begin
  -- total_line: la regla de computeLineTotal (taxResolverCore.ts).
  update public.quotation_items qi
     set total_line = case
           when qi.tax_included then round(qi.qty * qi.unit_price - coalesce(qi.discount_amount, 0), 2)
           else round((qi.qty * qi.unit_price - coalesce(qi.discount_amount, 0)) * (1 + coalesce(qi.tax_rate, 0) / 100), 2)
         end
   where qi.quotation_id = p_id;

  -- Cabecera: la regla de fn_recalc_invoice_totals.
  select coalesce(sum(case
           when qi.tax_included and coalesce(qi.tax_rate, 0) > 0
             then round((qi.qty * qi.unit_price - coalesce(qi.discount_amount, 0)) / (1 + qi.tax_rate / 100), 2)
           else qi.qty * qi.unit_price - coalesce(qi.discount_amount, 0)
         end), 0),
         coalesce(sum(qi.total_line), 0),
         coalesce(sum(coalesce(qi.discount_amount, 0)), 0)
    into v_sub, v_total, v_desc
    from public.quotation_items qi
   where qi.quotation_id = p_id;

  update public.quotations
     set subtotal = v_sub, tax_total = greatest(v_total - v_sub, 0), total = v_total,
         discount_total = v_desc, updated_at = now()
   where id = p_id;
end;
$function$;

revoke all on function public.fn_cotizacion_recalcular(uuid) from public, anon, authenticated;
grant execute on function public.fn_cotizacion_recalcular(uuid) to service_role;

-- ── 6 ── Guardar (crear o editar) ──────────────────────────────────────────
create or replace function public.fn_cotizacion_guardar(p_org integer, p_id uuid, p_datos jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_q public.quotations%rowtype;
  v_id uuid;
  v_branch integer;
  v_customer uuid;
  v_vendedor uuid;
  v_oportunidad uuid;
  v_emision date;
  v_vence date;
  v_items jsonb;
  v_item jsonb;
  v_qty numeric;
  v_precio numeric;
  v_desc numeric;
  v_tasa numeric;
  v_producto integer;
  v_numero text;
  v_incluido boolean;
begin
  if v_uid is null then
    raise exception 'no_autenticado' using errcode = '42501';
  end if;
  perform public.fn_finanzas_exigir_permiso(p_org, array['finance.create', 'sales_management']);
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
  v_customer := nullif(p_datos->>'customer_id', '')::uuid;
  if v_customer is null or not exists (select 1 from public.customers c where c.id = v_customer and c.organization_id = p_org) then
    raise exception 'cliente_invalido' using errcode = '22023';
  end if;
  v_vendedor := nullif(p_datos->>'salesperson_id', '')::uuid;
  if v_vendedor is not null and not exists (
      select 1 from public.organization_members om where om.organization_id = p_org and om.user_id = v_vendedor) then
    raise exception 'vendedor_invalido' using errcode = '22023';
  end if;
  v_oportunidad := nullif(p_datos->>'opportunity_id', '')::uuid;
  if v_oportunidad is not null and not exists (
      select 1 from public.opportunities o where o.id = v_oportunidad and o.organization_id = p_org) then
    raise exception 'oportunidad_invalida' using errcode = '22023';
  end if;

  v_emision := coalesce(nullif(p_datos->>'issue_date', '')::date, public.fn_today_for_org(p_org));
  v_vence := nullif(p_datos->>'valid_until', '')::date;
  if v_vence is not null and v_vence < v_emision then
    raise exception 'vigencia_invalida' using errcode = '22023';
  end if;

  v_items := p_datos->'items';
  if v_items is null or jsonb_typeof(v_items) <> 'array' or jsonb_array_length(v_items) = 0 then
    raise exception 'cotizacion_sin_lineas' using errcode = '22023';
  end if;
  if jsonb_array_length(v_items) > 500 then
    raise exception 'datos_invalidos' using errcode = '22023';
  end if;
  -- Impuesto incluido es del DOCUMENTO, como en la factura (fn_factura_venta_guardar
  -- y fn_recalc_invoice_totals lo leen de la cabecera): todas las líneas lo llevan.
  v_incluido := coalesce((p_datos->>'tax_included')::boolean, (v_items->0->>'tax_included')::boolean, false);
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
    v_numero := public.fn_cotizacion_numero(p_org, v_branch);
    insert into public.quotations (
      organization_id, branch_id, number, customer_id, issue_date, valid_until, currency, status,
      payment_terms, payment_method, notes, terms_conditions, salesperson_id, opportunity_id, created_by, sections_json
    ) values (
      p_org, v_branch, v_numero, v_customer, v_emision, v_vence, nullif(btrim(coalesce(p_datos->>'currency', '')), ''), 'draft',
      nullif(p_datos->>'payment_terms', '')::integer, nullif(p_datos->>'payment_method', ''),
      nullif(p_datos->>'notes', ''), nullif(p_datos->>'terms_conditions', ''), v_vendedor, v_oportunidad, v_uid,
      case when jsonb_typeof(p_datos->'sections_json') = 'object' then p_datos->'sections_json' end
    )
    returning id into v_id;
  else
    select * into v_q from public.quotations where id = p_id and organization_id = p_org for update;
    if not found then
      raise exception 'cotizacion_no_encontrada' using errcode = 'P0002';
    end if;
    if v_q.status not in ('draft', 'sent') then
      raise exception 'cotizacion_no_editable' using errcode = '22023';
    end if;
    if not public.app_branch_access(v_q.branch_id) then
      raise exception 'sin_acceso_sucursal' using errcode = '42501';
    end if;
    v_id := v_q.id;
    v_numero := v_q.number;
    update public.quotations set
      branch_id = v_branch, customer_id = v_customer, issue_date = v_emision, valid_until = v_vence,
      currency = coalesce(nullif(btrim(coalesce(p_datos->>'currency', '')), ''), currency),
      payment_terms = nullif(p_datos->>'payment_terms', '')::integer,
      payment_method = nullif(p_datos->>'payment_method', ''),
      notes = nullif(p_datos->>'notes', ''), terms_conditions = nullif(p_datos->>'terms_conditions', ''),
      salesperson_id = v_vendedor, opportunity_id = v_oportunidad,
      sections_json = case when jsonb_typeof(p_datos->'sections_json') = 'object' then p_datos->'sections_json' else sections_json end,
      updated_at = now()
    where id = v_id;
    delete from public.quotation_items where quotation_id = v_id;
  end if;

  insert into public.quotation_items (quotation_id, product_id, description, qty, unit_price, discount_amount, tax_code, tax_rate, tax_included, total_line)
  select v_id, nullif(i->>'product_id', '')::integer, btrim(i->>'description'), (i->>'qty')::numeric,
         coalesce((i->>'unit_price')::numeric, 0), coalesce((i->>'discount_amount')::numeric, 0),
         -- Código de impuesto: solo si es una plantilla real (invoice_items lo exige por FK
         -- al convertir); un código desconocido se descarta y la tarifa se conserva.
         (select t.code from public.tax_templates t where t.code = nullif(i->>'tax_code', '')), coalesce((i->>'tax_rate')::numeric, 0),
         v_incluido, 0
    from jsonb_array_elements(v_items) i;

  perform public.fn_cotizacion_recalcular(v_id);

  insert into public.finance_audit_log (organization_id, entity, entity_id, action, user_id, diff)
  values (p_org, 'quotations', v_id::text, case when p_id is null then 'insert' else 'update' end, v_uid,
          jsonb_build_object('numero', v_numero, 'lineas', jsonb_array_length(v_items),
                             'total', (select total from public.quotations where id = v_id)));

  return (select jsonb_build_object('id', q.id, 'numero', q.number, 'total', q.total, 'subtotal', q.subtotal,
                                    'tax_total', q.tax_total, 'discount_total', q.discount_total)
            from public.quotations q where q.id = v_id);
end;
$function$;

revoke all on function public.fn_cotizacion_guardar(integer, uuid, jsonb) from public, anon;
grant execute on function public.fn_cotizacion_guardar(integer, uuid, jsonb) to authenticated, service_role;

-- ── 7a ── Cambiar estado ───────────────────────────────────────────────────
create or replace function public.fn_cotizacion_cambiar_estado(p_org integer, p_id uuid, p_estado text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_q public.quotations%rowtype;
  v_vivo text;
begin
  if v_uid is null then
    raise exception 'no_autenticado' using errcode = '42501';
  end if;
  perform public.fn_finanzas_exigir_permiso(p_org, array['finance.create', 'sales_management']);
  if p_estado is null or p_estado not in ('sent', 'accepted', 'rejected') then
    -- 'expired' se deriva al leer y 'converted' solo lo pone fn_cotizacion_convertir.
    raise exception 'transicion_invalida' using errcode = '22023';
  end if;
  select * into v_q from public.quotations where id = p_id and organization_id = p_org for update;
  if not found then
    raise exception 'cotizacion_no_encontrada' using errcode = 'P0002';
  end if;
  if not public.app_branch_access(v_q.branch_id) then
    raise exception 'sin_acceso_sucursal' using errcode = '42501';
  end if;
  -- Idempotente: pedir el estado que ya tiene no hace nada.
  if v_q.status = p_estado then
    return jsonb_build_object('id', v_q.id, 'status', v_q.status, 'sin_cambio', true);
  end if;
  if v_q.status not in ('draft', 'sent') or (v_q.status = 'sent' and p_estado = 'sent') then
    raise exception 'transicion_invalida' using errcode = '22023';
  end if;
  v_vivo := public.fn_cotizacion_estado_vivo(v_q.status, v_q.valid_until, public.fn_today_for_org(p_org));
  if v_vivo = 'expired' and p_estado <> 'rejected' then
    raise exception 'cotizacion_vencida' using errcode = '22023';
  end if;

  update public.quotations set status = p_estado, updated_at = now() where id = v_q.id;
  insert into public.finance_audit_log (organization_id, entity, entity_id, action, user_id, diff)
  values (p_org, 'quotations', v_q.id::text, 'update', v_uid,
          jsonb_build_object('numero', v_q.number, 'estado_anterior', v_q.status, 'estado', p_estado));
  return jsonb_build_object('id', v_q.id, 'status', p_estado, 'sin_cambio', false);
end;
$function$;

revoke all on function public.fn_cotizacion_cambiar_estado(integer, uuid, text) from public, anon;
grant execute on function public.fn_cotizacion_cambiar_estado(integer, uuid, text) to authenticated, service_role;

-- ── 7b ── Eliminar (solo borradores) ───────────────────────────────────────
create or replace function public.fn_cotizacion_eliminar(p_org integer, p_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_q public.quotations%rowtype;
begin
  if v_uid is null then
    raise exception 'no_autenticado' using errcode = '42501';
  end if;
  perform public.fn_finanzas_exigir_permiso(p_org, array['finance.create', 'sales_management']);
  select * into v_q from public.quotations where id = p_id and organization_id = p_org for update;
  if not found then
    raise exception 'cotizacion_no_encontrada' using errcode = 'P0002';
  end if;
  if not public.app_branch_access(v_q.branch_id) then
    raise exception 'sin_acceso_sucursal' using errcode = '42501';
  end if;
  if v_q.status <> 'draft' or v_q.converted_invoice_id is not null
     or exists (select 1 from public.invoice_sales i where i.quotation_id = v_q.id) then
    raise exception 'cotizacion_no_eliminable' using errcode = '22023';
  end if;
  delete from public.quotations where id = v_q.id;  -- las líneas caen por ON DELETE CASCADE
  insert into public.finance_audit_log (organization_id, entity, entity_id, action, user_id, diff)
  values (p_org, 'quotations', v_q.id::text, 'delete', v_uid,
          jsonb_build_object('numero', v_q.number, 'total', v_q.total));
  return jsonb_build_object('id', v_q.id, 'eliminada', true);
end;
$function$;

revoke all on function public.fn_cotizacion_eliminar(integer, uuid) from public, anon;
grant execute on function public.fn_cotizacion_eliminar(integer, uuid) to authenticated, service_role;

-- ── 7c ── Duplicar (vigencia nueva) ────────────────────────────────────────
create or replace function public.fn_cotizacion_duplicar(p_org integer, p_id uuid, p_valid_until date default null)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_q public.quotations%rowtype;
  v_id uuid;
  v_hoy date;
  v_vence date;
  v_numero text;
begin
  if v_uid is null then
    raise exception 'no_autenticado' using errcode = '42501';
  end if;
  perform public.fn_finanzas_exigir_permiso(p_org, array['finance.create', 'sales_management']);
  select * into v_q from public.quotations where id = p_id and organization_id = p_org;
  if not found then
    raise exception 'cotizacion_no_encontrada' using errcode = 'P0002';
  end if;
  if not public.app_branch_access(v_q.branch_id) then
    raise exception 'sin_acceso_sucursal' using errcode = '42501';
  end if;
  v_hoy := public.fn_today_for_org(p_org);
  -- La copia vale desde hoy: la misma duración que la original (30 días si no tenía).
  v_vence := coalesce(p_valid_until,
                      v_hoy + coalesce(greatest(v_q.valid_until - v_q.issue_date, 0), 30));
  if v_vence < v_hoy then
    raise exception 'vigencia_invalida' using errcode = '22023';
  end if;
  v_numero := public.fn_cotizacion_numero(p_org, v_q.branch_id);

  insert into public.quotations (
    organization_id, branch_id, number, customer_id, issue_date, valid_until, currency, status,
    payment_terms, payment_method, notes, terms_conditions, salesperson_id, opportunity_id, created_by, sections_json
  ) values (
    p_org, v_q.branch_id, v_numero, v_q.customer_id, v_hoy, v_vence, v_q.currency, 'draft',
    v_q.payment_terms, v_q.payment_method, v_q.notes, v_q.terms_conditions, v_q.salesperson_id, v_q.opportunity_id,
    v_uid, v_q.sections_json
  )
  returning id into v_id;

  insert into public.quotation_items (quotation_id, product_id, description, qty, unit_price, discount_amount, tax_code, tax_rate, tax_included, total_line)
  select v_id, qi.product_id, qi.description, qi.qty, qi.unit_price, qi.discount_amount, qi.tax_code, qi.tax_rate, qi.tax_included, qi.total_line
    from public.quotation_items qi
   where qi.quotation_id = v_q.id
   order by qi.created_at, qi.id;

  perform public.fn_cotizacion_recalcular(v_id);

  insert into public.finance_audit_log (organization_id, entity, entity_id, action, user_id, diff)
  values (p_org, 'quotations', v_id::text, 'insert', v_uid,
          jsonb_build_object('numero', v_numero, 'duplicada_de', v_q.id, 'numero_origen', v_q.number));
  return jsonb_build_object('id', v_id, 'numero', v_numero, 'valid_until', v_vence);
end;
$function$;

revoke all on function public.fn_cotizacion_duplicar(integer, uuid, date) from public, anon;
grant execute on function public.fn_cotizacion_duplicar(integer, uuid, date) to authenticated, service_role;

-- ── 8 ── Convertir a factura (borrador, por la lógica canónica) ────────────
create or replace function public.fn_cotizacion_convertir(
  p_org integer, p_id uuid, p_numero text, p_branch integer default null, p_opportunity uuid default null,
  p_commission_rate numeric default 0)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_q public.quotations%rowtype;
  v_branch integer;
  v_oportunidad uuid;
  v_incluido boolean;
  v_tasa numeric;
  v_datos jsonb;
  v_res jsonb;
  v_factura uuid;
  v_numero text;
begin
  if v_uid is null then
    raise exception 'no_autenticado' using errcode = '42501';
  end if;
  -- Convertir crea una factura: finance.create (fn_factura_venta_guardar lo vuelve a exigir).
  perform public.fn_finanzas_exigir_permiso(p_org, array['finance.create']);
  select * into v_q from public.quotations where id = p_id and organization_id = p_org for update;
  if not found then
    raise exception 'cotizacion_no_encontrada' using errcode = 'P0002';
  end if;

  -- Idempotente: una convertida devuelve su factura.
  if v_q.converted_invoice_id is not null then
    select i.id, i.number into v_factura, v_numero from public.invoice_sales i
     where i.id = v_q.converted_invoice_id and i.organization_id = p_org;
    if found then
      return jsonb_build_object('invoice_id', v_factura, 'numero', v_numero, 'ya_convertida', true);
    end if;
  end if;
  if v_q.status = 'rejected' then
    raise exception 'cotizacion_rechazada' using errcode = '22023';
  end if;
  if v_q.status not in ('draft', 'sent', 'accepted') then
    raise exception 'transicion_invalida' using errcode = '22023';
  end if;
  if public.fn_cotizacion_estado_vivo(v_q.status, v_q.valid_until, public.fn_today_for_org(p_org)) = 'expired' then
    raise exception 'cotizacion_vencida' using errcode = '22023';
  end if;
  if not exists (select 1 from public.quotation_items qi where qi.quotation_id = v_q.id) then
    raise exception 'cotizacion_sin_lineas' using errcode = '22023';
  end if;
  if coalesce(btrim(p_numero), '') = '' then
    raise exception 'datos_invalidos' using errcode = '22023';
  end if;

  -- Sucursal pedida (el cierre del CRM usa la del contexto) o la de la
  -- cotización; fn_factura_venta_guardar exige que sea de la organización y
  -- que el usuario tenga acceso.
  v_branch := coalesce(p_branch, v_q.branch_id);
  v_oportunidad := coalesce(v_q.opportunity_id, p_opportunity);
  if v_oportunidad is not null and not exists (
      select 1 from public.opportunities o where o.id = v_oportunidad and o.organization_id = p_org) then
    raise exception 'oportunidad_invalida' using errcode = '22023';
  end if;
  select coalesce(bool_or(qi.tax_included), false) into v_incluido from public.quotation_items qi where qi.quotation_id = v_q.id;
  v_tasa := case when v_q.salesperson_id is not null then greatest(coalesce(p_commission_rate, 0), 0) else 0 end;

  v_datos := jsonb_build_object(
    'number', nullif(btrim(coalesce(p_numero, '')), ''),
    'customer_id', v_q.customer_id,
    'branch_id', v_branch,
    'issue_date', now(),
    'due_date', now() + make_interval(days => coalesce(v_q.payment_terms, 0)),
    'currency', v_q.currency,
    'payment_terms', coalesce(v_q.payment_terms, 0),
    'payment_method', v_q.payment_method,
    'notes', v_q.notes,
    'tax_included', v_incluido,
    'salesperson_id', v_q.salesperson_id,
    'opportunity_id', v_oportunidad,
    'commission_rate', v_tasa,
    'commission_type', case when v_tasa > 0 then 'salesperson' else 'none' end,
    'commission_method', 'percentage',
    'include_in_cash_register', false,
    'applied_taxes', coalesce((
      select jsonb_agg(jsonb_build_object('tax_code', t.tax_code, 'tax_rate', t.tax_rate))
        from (select distinct qi.tax_code, qi.tax_rate from public.quotation_items qi
               where qi.quotation_id = v_q.id
                 and exists (select 1 from public.tax_templates tt where tt.code = qi.tax_code)) t), '[]'::jsonb),
    'items', (
      select jsonb_agg(jsonb_build_object(
               'product_id', qi.product_id, 'description', qi.description, 'qty', qi.qty,
               'unit_price', qi.unit_price,
               'tax_code', (select t.code from public.tax_templates t where t.code = qi.tax_code), 'tax_rate', qi.tax_rate,
               'tax_included', qi.tax_included, 'total_line', qi.total_line,
               'discount_amount', qi.discount_amount) order by qi.created_at, qi.id)
        from public.quotation_items qi where qi.quotation_id = v_q.id));

  -- La lógica canónica de facturas: borrador, venta ligada, impuestos, comisión.
  v_res := public.fn_factura_venta_guardar(p_org, null, v_datos);
  v_factura := (v_res->>'id')::uuid;

  update public.invoice_sales set quotation_id = v_q.id where id = v_factura;
  update public.quotations
     set status = 'converted', converted_invoice_id = v_factura, updated_at = now()
   where id = v_q.id;

  insert into public.finance_audit_log (organization_id, entity, entity_id, action, user_id, diff)
  values (p_org, 'quotations', v_q.id::text, 'update', v_uid,
          jsonb_build_object('numero', v_q.number, 'estado_anterior', v_q.status, 'estado', 'converted',
                             'factura', v_factura, 'total', v_res->'total'));

  return jsonb_build_object('invoice_id', v_factura, 'numero', v_res->>'numero', 'sale_id', v_res->'sale_id',
                            'total', v_res->'total', 'faltantes', coalesce(v_res->'faltantes', '[]'::jsonb),
                            'ya_convertida', false);
end;
$function$;

revoke all on function public.fn_cotizacion_convertir(integer, uuid, text, integer, uuid, numeric) from public, anon;
grant execute on function public.fn_cotizacion_convertir(integer, uuid, text, integer, uuid, numeric) to authenticated, service_role;

-- ── 9 ── Listado y detalle con el estado vivo ──────────────────────────────
create or replace function public.fn_cotizaciones_listado(p_org integer, p_filtros jsonb default '{}'::jsonb)
 returns table (
   id uuid, number text, status text, estado text, customer_id uuid, customer_name text, customer_email text,
   customer_phone text, branch_id integer, issue_date date, valid_until date, currency text,
   subtotal numeric, tax_total numeric, discount_total numeric, total numeric, payment_terms integer,
   payment_method text, salesperson_id uuid, converted_invoice_id uuid, opportunity_id uuid,
   created_at timestamptz, updated_at timestamptz)
 language plpgsql
 stable
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_hoy date;
  v_f jsonb := coalesce(p_filtros, '{}'::jsonb);
  v_busqueda text := nullif(btrim(coalesce(v_f->>'busqueda', '')), '');
begin
  perform public.fn_assert_acceso_org(p_org);
  v_hoy := public.fn_today_for_org(p_org);
  return query
  select q.id, q.number::text, q.status::text,
         public.fn_cotizacion_estado_vivo(q.status, q.valid_until, v_hoy),
         q.customer_id, c.full_name::text, c.email::text, c.phone::text, q.branch_id, q.issue_date, q.valid_until,
         q.currency::text, q.subtotal, q.tax_total, q.discount_total, q.total, q.payment_terms, q.payment_method::text,
         q.salesperson_id, q.converted_invoice_id, q.opportunity_id, q.created_at, q.updated_at
    from public.quotations q
    left join public.customers c on c.id = q.customer_id and c.organization_id = q.organization_id
   where q.organization_id = p_org
     and (v_f->>'id' is null or q.id = (v_f->>'id')::uuid)
     and (v_f->>'branch_id' is null or q.branch_id = (v_f->>'branch_id')::integer)
     and (v_f->>'customer_id' is null or q.customer_id = (v_f->>'customer_id')::uuid)
     and (v_f->>'opportunity_id' is null or q.opportunity_id = (v_f->>'opportunity_id')::uuid)
     and (v_f->>'desde' is null or q.issue_date >= (v_f->>'desde')::date)
     and (v_f->>'hasta' is null or q.issue_date <= (v_f->>'hasta')::date)
     and (v_f->>'estado' is null or public.fn_cotizacion_estado_vivo(q.status, q.valid_until, v_hoy) = v_f->>'estado')
     and (v_busqueda is null or q.number ilike '%' || v_busqueda || '%' or c.full_name ilike '%' || v_busqueda || '%')
   order by q.created_at desc
   limit least(greatest(coalesce((v_f->>'limite')::integer, 500), 1), 1000);
end;
$function$;

revoke all on function public.fn_cotizaciones_listado(integer, jsonb) from public, anon;
grant execute on function public.fn_cotizaciones_listado(integer, jsonb) to authenticated, service_role;

comment on function public.fn_cotizacion_convertir(integer, uuid, text, integer, uuid, numeric) is
  'Convierte una cotización en factura de venta BORRADOR por fn_factura_venta_guardar (finance.create). Idempotente.';
comment on function public.fn_cotizacion_guardar(integer, uuid, jsonb) is
  'Crea o edita una cotización (draft/sent) en una transacción; número y totales en la base. finance.create o sales_management.';
