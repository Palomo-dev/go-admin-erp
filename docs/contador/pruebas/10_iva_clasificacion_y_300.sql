-- Pruebas de escenario · Clasificación de IVA por línea, procedencia del descontable y borrador del formulario 300 v2
-- Fecha: 2026-11-07 · Proyecto taqjemqjtumhwptchcxk · Organización de pruebas 374 (sede 585). NO DEJA DATOS (begin … rollback).
--
-- Requiere 20261108150000, 20261108150500 y 20261108151000 (escritas, SIN aplicar). En la prueba en seco se pegan sus
-- cuerpos donde dice «MIGRACIONES», dentro de la misma transacción que termina en rollback.
--
-- Documentos creados DENTRO de la transacción, por las vías normales (cada uno genera su asiento con sus disparadores
-- o con la función que usa la aplicación). Período del borrador: 2026-11-01 a 2026-11-30.
--   Productos: B19 (bien, IVA 19 %), B5 (bien, IVA 5 %), S19 (servicio, IVA 19 %), S5 (servicio, IVA 5 %),
--              EXC (bien, «Excluido de IVA»), EXP (bien, «Exento de IVA»).
--   FV1   factura de venta: 2 × 150.000 B19 · 1 × 100.000 S5 · 1 × 50.000 EXC (sin impuesto en la línea)
--   FVX   exportación: 1 × 400.000 EXP (exenta, SIN fundamento/soporte)
--   POS1  venta POS B19: 119.000 con IVA 19.000 y tarifa 0 en la línea (como el POS real)
--   POS2  venta POS B19: igual a POS1, y su asiento se REVIERTE en el mismo mes (reversa contable, sin nota crédito)
--   POS3  venta POS sin producto: 30.000 sin IVA (no hay de dónde sugerir: queda sin clasificar)
--   FVOCT factura de venta del 15-oct-2026: 1 × 200.000 B19; NC = nota crédito TOTAL emitida hoy (noviembre)
--   FCB   compra de bienes: 1 × 1.000.000 B19 + 1 × 200.000 B5   → evaluada «descontable»
--   FCS   compra de servicios: 1 × 500.000 S19 + 1 × 300.300 S5  → evaluada «descontable» (IVA 15.015: redondeo)
--   FCND  compra: 1 × 100.000 B19 evaluada «no descontable» (art. 488) + 1 × 50.000 B19 sin evaluar
--   DS    documento soporte: 1 × 100.000 «Servicio de aseo» al 19 %, sin producto → se clasifica a mano
--   FCOCT compra del 20-oct-2026: 1 × 100.000 B19, «descontable» en el período de noviembre (art. 496)
--   NCC1  devolución de compra (asiento: D 2205 119.000 · C 1435 100.000 · C 2408 19.000) de FCB → naturaleza registrada
--   NCC2  devolución de compra (asiento: D 2205 11.900 · C 1435 10.000 · C 2408 1.900) de FCND → naturaleza registrada
--   AJ    asiento manual sin soporte: D 24080501 10.000 · C 1110
--   PAGO  pago a la DIAN desde bancos: D 24080501 50.000 · C 1110 (origen bank_transactions)
--   Octubre se registra como DECLARADO (formulario de prueba, presentado el 5-nov-2026).

begin;

-- ═══ MIGRACIONES (solo en la prueba en seco, mientras no estén aplicadas) ═══

create temp table r (n serial primary key, escenario text, verificacion text, esperado text, obtenido text, ok boolean);
create temp table ctx (k text primary key, v text);
grant all on r, ctx to authenticated, anon;
grant usage on sequence r_n_seq to authenticated, anon;

insert into ctx select 'max_je', coalesce(max(id), 0)::text from public.journal_entries where organization_id = 374;
with s as (insert into public.suppliers (organization_id, name, nit, supplier_type) values (374, 'Proveedor de prueba IVA', '900000021', 'company') returning id)
insert into ctx select 'sup', id::text from s;
with c as (insert into public.customers (organization_id, first_name, last_name, identification_type, identification_number)
           values (374, 'Cliente', 'Prueba IVA', 'CC', '1000000021') returning id)
insert into ctx select 'cli', id::text from c;

-- Productos y sus impuestos (la sugerencia sale de aquí).
with p as (insert into public.products (organization_id, sku, name, product_type, track_stock)
           values (374, 'PRUEBA-IVA-B19', 'Bien 19', 'product', false), (374, 'PRUEBA-IVA-B5', 'Bien 5', 'product', false),
                  (374, 'PRUEBA-IVA-S19', 'Servicio 19', 'service', false), (374, 'PRUEBA-IVA-S5', 'Servicio 5', 'service', false),
                  (374, 'PRUEBA-IVA-EXC', 'Bien excluido', 'product', false), (374, 'PRUEBA-IVA-EXP', 'Bien exento', 'product', false)
           returning id, sku)
insert into ctx select lower(replace(sku, 'PRUEBA-IVA-', 'p_')), id::text from p;
insert into public.product_tax_relations (product_id, tax_id)
select (select v::int from ctx where k = x.k), ot.id
  from (values ('p_b19', 'IVA_19'), ('p_b5', 'IVA_5'), ('p_s19', 'IVA_19'), ('p_s5', 'IVA_5'), ('p_exc', 'IVA_EXCLUIDO'), ('p_exp', 'IVA_0')) x(k, code)
  join public.tax_templates t on t.code = x.code
  join public.organization_taxes ot on ot.organization_id = 374 and ot.template_id = t.id;

-- ── Ventas ──
with f as (insert into public.invoice_sales (organization_id, branch_id, customer_id, number, status, currency, issue_date, document_type)
           values (374, 585, (select v::uuid from ctx where k = 'cli'), 'PRUEBA-IVA-FV1', 'draft', 'COP', now(), 'invoice'),
                  (374, 585, (select v::uuid from ctx where k = 'cli'), 'PRUEBA-IVA-FVX', 'draft', 'COP', now(), 'invoice'),
                  (374, 585, (select v::uuid from ctx where k = 'cli'), 'PRUEBA-IVA-FVOCT', 'draft', 'COP', '2026-10-15 12:00-05', 'invoice')
           returning id, number)
insert into ctx select lower(replace(number, 'PRUEBA-IVA-', '')), id::text from f;
insert into public.invoice_items (invoice_id, invoice_type, invoice_sales_id, product_id, description, qty, unit_price, tax_rate, tax_code, total_line)
select (select v::uuid from ctx where k = 'fv1'), 'sale', (select v::uuid from ctx where k = 'fv1'), (select v::int from ctx where k = 'p_b19'), 'Bien 19', 2, 150000, 19, 'IVA_19', 357000 union all
select (select v::uuid from ctx where k = 'fv1'), 'sale', (select v::uuid from ctx where k = 'fv1'), (select v::int from ctx where k = 'p_s5'), 'Servicio 5', 1, 100000, 5, 'IVA_5', 105000 union all
select (select v::uuid from ctx where k = 'fv1'), 'sale', (select v::uuid from ctx where k = 'fv1'), (select v::int from ctx where k = 'p_exc'), 'Bien excluido', 1, 50000, 0, null, 50000 union all
select (select v::uuid from ctx where k = 'fvx'), 'sale', (select v::uuid from ctx where k = 'fvx'), (select v::int from ctx where k = 'p_exp'), 'Exportación', 1, 400000, 0, 'IVA_0', 400000 union all
select (select v::uuid from ctx where k = 'fvoct'), 'sale', (select v::uuid from ctx where k = 'fvoct'), (select v::int from ctx where k = 'p_b19'), 'Bien 19', 1, 200000, 19, 'IVA_19', 238000;
update public.invoice_sales set status = 'issued' where id in (select v::uuid from ctx where k in ('fv1', 'fvx', 'fvoct'));

with s as (insert into public.sales (organization_id, branch_id, user_id, status, subtotal, tax_total, total, tax_included, sale_date, notes)
           values (374, 585, 'bb11d6d2-f647-49f7-9b29-aa4c4438abf1', 'paid', 100000, 19000, 119000, false, now(), 'POS1'),
                  (374, 585, 'bb11d6d2-f647-49f7-9b29-aa4c4438abf1', 'paid', 100000, 19000, 119000, false, now(), 'POS2'),
                  (374, 585, 'bb11d6d2-f647-49f7-9b29-aa4c4438abf1', 'paid', 30000, 0, 30000, false, now(), 'POS3')
           returning id, notes)
insert into ctx select lower(notes), id::text from s;
insert into public.sale_items (sale_id, product_id, quantity, unit_price, total, tax_amount, tax_rate)
select (select v::uuid from ctx where k = 'pos1'), (select v::int from ctx where k = 'p_b19'), 1, 100000, 100000, 19000, 0 union all
select (select v::uuid from ctx where k = 'pos2'), (select v::int from ctx where k = 'p_b19'), 1, 100000, 100000, 19000, 0 union all
select (select v::uuid from ctx where k = 'pos3'), null, 1, 30000, 30000, 0, 0;
set constraints trg_auto_journal_sale_pos immediate;

insert into ctx select 'je_pos2', (select min(id) from public.journal_entries where organization_id = 374 and source = 'sales' and source_id = (select v from ctx where k = 'pos2'))::text;
insert into ctx select 'je_pos2_rev', public.fn_revertir_asiento_en_fecha((select v::int from ctx where k = 'je_pos2'), 'anulacion_pago', 'prueba-iva-300', now(), null)::text;

-- ── Compras y documento soporte ──
with f as (insert into public.invoice_purchase (organization_id, branch_id, supplier_id, number_ext, status, currency, issue_date)
           values (374, 585, (select v::int from ctx where k = 'sup'), 'PRUEBA-IVA-FCB', 'draft', 'COP', now()),
                  (374, 585, (select v::int from ctx where k = 'sup'), 'PRUEBA-IVA-FCS', 'draft', 'COP', now()),
                  (374, 585, (select v::int from ctx where k = 'sup'), 'PRUEBA-IVA-FCND', 'draft', 'COP', now()),
                  (374, 585, (select v::int from ctx where k = 'sup'), 'PRUEBA-IVA-FCOCT', 'draft', 'COP', '2026-10-20 12:00-05')
           returning id, number_ext)
insert into ctx select lower(replace(number_ext, 'PRUEBA-IVA-', '')), id::text from f;
insert into public.invoice_items (invoice_id, invoice_type, invoice_purchase_id, product_id, description, qty, unit_price, tax_rate, tax_code, total_line)
select (select v::uuid from ctx where k = 'fcb'), 'purchase', (select v::uuid from ctx where k = 'fcb'), (select v::int from ctx where k = 'p_b19'), 'Bien 19', 1, 1000000, 19, 'IVA_19', 1190000 union all
select (select v::uuid from ctx where k = 'fcb'), 'purchase', (select v::uuid from ctx where k = 'fcb'), (select v::int from ctx where k = 'p_b5'), 'Bien 5', 1, 200000, 5, 'IVA_5', 210000 union all
select (select v::uuid from ctx where k = 'fcs'), 'purchase', (select v::uuid from ctx where k = 'fcs'), (select v::int from ctx where k = 'p_s19'), 'Servicio 19', 1, 500000, 19, 'IVA_19', 595000 union all
select (select v::uuid from ctx where k = 'fcs'), 'purchase', (select v::uuid from ctx where k = 'fcs'), (select v::int from ctx where k = 'p_s5'), 'Servicio 5', 1, 300300, 5, 'IVA_5', 315315 union all
select (select v::uuid from ctx where k = 'fcnd'), 'purchase', (select v::uuid from ctx where k = 'fcnd'), (select v::int from ctx where k = 'p_b19'), 'Bien 19 no descontable', 1, 100000, 19, 'IVA_19', 119000 union all
select (select v::uuid from ctx where k = 'fcnd'), 'purchase', (select v::uuid from ctx where k = 'fcnd'), (select v::int from ctx where k = 'p_b19'), 'Bien 19 sin evaluar', 1, 50000, 19, 'IVA_19', 59500 union all
select (select v::uuid from ctx where k = 'fcoct'), 'purchase', (select v::uuid from ctx where k = 'fcoct'), (select v::int from ctx where k = 'p_b19'), 'Bien 19 de octubre', 1, 100000, 19, 'IVA_19', 119000;
update public.invoice_purchase set status = 'received' where id in (select v::uuid from ctx where k in ('fcb', 'fcs', 'fcnd', 'fcoct'));

update public.configuracion_contable set account_code = '14350101' where organization_id = 374 and clave = 'inventario';
with d as (insert into public.support_documents (organization_id, branch_id, supplier_id, reference_code, provider, issue_date,
                                                 subtotal, tax_total, total, currency, status, tax_included)
           values (374, 585, (select v::int from ctx where k = 'sup'), 'PRUEBA-IVA-DS', '{"names":"Proveedor de prueba IVA"}'::jsonb, now(),
                   100000, 19000, 119000, 'COP', 'draft', false) returning id)
insert into ctx select 'ds', id::text from d;
insert into public.invoice_items (invoice_id, invoice_type, support_document_id, description, qty, unit_price, tax_rate, tax_code, total_line)
select v::uuid, 'support_document', v::uuid, 'Servicio de aseo', 1, 100000, 19, 'IVA_19', 119000 from ctx where k = 'ds';
insert into ctx select 'je_ds', public.fn_asiento_documento_por_lineas((select v::uuid from ctx where k = 'ds'), 'documento_soporte', 'prueba:iva300:ds')::text;

-- ── Asientos sin documento con líneas ──
insert into ctx select 'je_ncc1', public.fn_create_journal_entry(
  p_organization_id := 374, p_branch_id := 585, p_entry_date := now(), p_memo := 'Devolución a proveedor (prueba)',
  p_source := 'manual', p_source_id := null, p_debit_account := '22050501', p_credit_account := '14350101',
  p_amount := 119000, p_tax_account := '24081001', p_tax_amount := 19000, p_tax_is_credit := true, p_fact_key := 'prueba:iva300:ncc1')::text;
insert into ctx select 'je_ncc2', public.fn_create_journal_entry(
  p_organization_id := 374, p_branch_id := 585, p_entry_date := now(), p_memo := 'Devolución a proveedor 2 (prueba)',
  p_source := 'manual', p_source_id := null, p_debit_account := '22050501', p_credit_account := '14350101',
  p_amount := 11900, p_tax_account := '24081001', p_tax_amount := 1900, p_tax_is_credit := true, p_fact_key := 'prueba:iva300:ncc2')::text;
insert into ctx select 'je_aj', public.fn_create_journal_entry(
  p_organization_id := 374, p_branch_id := 585, p_entry_date := now(), p_memo := 'Ajuste manual de IVA (prueba)',
  p_source := 'manual', p_source_id := null, p_debit_account := '24080501', p_credit_account := '1110',
  p_amount := 10000, p_fact_key := 'prueba:iva300:aj')::text;
insert into ctx select 'je_pago', public.fn_create_journal_entry(
  p_organization_id := 374, p_branch_id := 585, p_entry_date := now(), p_memo := 'Pago IVA a la DIAN (prueba)',
  p_source := 'bank_transactions', p_source_id := null, p_debit_account := '24080501', p_credit_account := '1110',
  p_amount := 50000, p_fact_key := 'prueba:iva300:pago')::text;

-- Los disparadores de cuadre (diferidos) se ejecutan ahora: si algún asiento no cuadra, todo falla aquí.
set constraints all immediate;

-- ── Sugerencias guardadas por el disparador (antes de cualquier acción de una persona) ──
insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'S', 'Sugerencia por línea al crearla: ' || x.doc || ' · ' || coalesce(it.description, ''),
       x.esperado,
       concat_ws(' / ', coalesce(it.iva_tratamiento, 'NULL'), coalesce(round(it.iva_tarifa)::text, 'NULL'), coalesce(it.iva_tipo_operacion, 'NULL'),
                 coalesce(it.iva_clasificacion_origen, 'NULL'), coalesce(it.iva_descontable, '—')),
       concat_ws(' / ', coalesce(it.iva_tratamiento, 'NULL'), coalesce(round(it.iva_tarifa)::text, 'NULL'), coalesce(it.iva_tipo_operacion, 'NULL'),
                 coalesce(it.iva_clasificacion_origen, 'NULL'), coalesce(it.iva_descontable, '—')) = x.esperado
  from (values ('fv1', 'Bien 19', 'gravada / 19 / bienes / sugerida / —'),
               ('fv1', 'Servicio 5', 'gravada / 5 / servicios / sugerida / —'),
               ('fv1', 'Bien excluido', 'excluida / 0 / bienes / sugerida / —'),
               ('fvx', 'Exportación', 'exenta / 0 / bienes / sugerida / —'),
               ('fcb', 'Bien 19', 'gravada / 19 / bienes / sugerida / por_evaluar'),
               ('fcs', 'Servicio 5', 'gravada / 5 / servicios / sugerida / por_evaluar'),
               ('ds', 'Servicio de aseo', 'gravada / 19 / NULL / sugerida / por_evaluar')) x(doc, descr, esperado)
  join public.invoice_items it on it.description = x.descr
   and (it.invoice_sales_id = (select v::uuid from ctx where k = x.doc) or it.invoice_purchase_id = (select v::uuid from ctx where k = x.doc)
        or it.support_document_id = (select v::uuid from ctx where k = x.doc));
insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'S', 'Sugerencia POS: ' || x.k, x.esperado,
       concat_ws(' / ', coalesce(si.iva_tratamiento, 'NULL'), coalesce(round(si.iva_tarifa)::text, 'NULL'), coalesce(si.iva_tipo_operacion, 'NULL')),
       concat_ws(' / ', coalesce(si.iva_tratamiento, 'NULL'), coalesce(round(si.iva_tarifa)::text, 'NULL'), coalesce(si.iva_tipo_operacion, 'NULL')) = x.esperado
  from (values ('pos1', 'gravada / 19 / bienes'), ('pos3', 'NULL / NULL / NULL')) x(k, esperado)
  join public.sale_items si on si.sale_id = (select v::uuid from ctx where k = x.k);
insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'S', 'Los totales del documento no cambian (FV1)', 'subtotal 450000 · IVA 62000 · total 512000',
       format('subtotal %s · IVA %s · total %s', round(f.subtotal), round(f.tax_total), round(f.total)),
       round(f.subtotal) = 450000 and round(f.tax_total) = 62000 and round(f.total) = 512000
  from public.invoice_sales f where f.id = (select v::uuid from ctx where k = 'fv1');

-- ── Acciones de una persona (usuario miembro, sesión simulada) ──
select set_config('request.jwt.claims', '{"sub":"bb11d6d2-f647-49f7-9b29-aa4c4438abf1","role":"authenticated"}', true);
set local role authenticated;
-- La nota crédito arma su asiento en varios pasos: el control de cuadre vuelve a diferido mientras se emite.
set constraints all deferred;
do $$
declare
  v_id uuid;
  v_err text;
begin
  -- Nota crédito total de la factura de octubre, emitida hoy.
  insert into ctx select 'nc', (public.fn_nota_credito_emitir(
    (select v::uuid from ctx where k = 'fvoct'), 'total', null, null, null, 'Devolución de prueba IVA 300', false,
    'saldo_a_favor', null, null, 'prueba-iva300-nc') ->> 'id');

  -- Procedencia del descontable.
  for v_id in select it.id from public.invoice_items it
               where it.invoice_purchase_id in (select v::uuid from ctx where k in ('fcb', 'fcs')) loop
    perform public.fn_iva_clasificar_linea(374, 'invoice_items', v_id, (
      select jsonb_build_object('tratamiento', it.iva_tratamiento, 'tarifa', it.iva_tarifa, 'tipo_operacion', it.iva_tipo_operacion,
                                'descontable', 'descontable', 'descontable_motivo', 'Soporte con factura electrónica; destinado a operaciones gravadas (arts. 485 y 488)')
        from public.invoice_items it where it.id = v_id));
  end loop;
  perform public.fn_iva_clasificar_linea(374, 'invoice_items',
    (select it.id from public.invoice_items it where it.invoice_purchase_id = (select v::uuid from ctx where k = 'fcnd') and it.unit_price = 100000),
    '{"tratamiento":"gravada","tarifa":19,"tipo_operacion":"bienes","descontable":"no_descontable","descontable_motivo":"Gasto no imputable a operaciones gravadas (art. 488): va al costo"}');
  perform public.fn_iva_clasificar_linea(374, 'invoice_items',
    (select it.id from public.invoice_items it where it.invoice_purchase_id = (select v::uuid from ctx where k = 'fcoct')),
    '{"tratamiento":"gravada","tarifa":19,"tipo_operacion":"bienes","descontable":"descontable","descontable_motivo":"Factura recibida tarde: se descuenta en el período siguiente (art. 496)","descontable_periodo":"2026-11-15"}');
  -- Documento soporte sin producto: la persona fija el tipo de operación.
  perform public.fn_iva_clasificar_linea(374, 'invoice_items',
    (select it.id from public.invoice_items it where it.support_document_id = (select v::uuid from ctx where k = 'ds')),
    '{"tratamiento":"gravada","tarifa":19,"tipo_operacion":"servicios","descontable":"descontable","descontable_motivo":"Servicio de aseo de la sede (art. 488)"}');

  -- Validaciones de la clasificación.
  v_err := null;
  begin perform public.fn_iva_clasificar_linea(374, 'invoice_items',
          (select it.id from public.invoice_items it where it.invoice_sales_id = (select v::uuid from ctx where k = 'fv1') limit 1),
          '{"tratamiento":"gravada","tarifa":19,"tipo_operacion":"bienes","descontable":"descontable","descontable_motivo":"x"}');
  exception when others then v_err := sqlerrm; end;
  insert into r (escenario, verificacion, esperado, obtenido, ok) values ('V', 'Descontable en una línea de VENTA', 'rechaza: DESCONTABLE_SOLO_COMPRAS', coalesce(v_err, 'NO RECHAZÓ'), v_err = 'DESCONTABLE_SOLO_COMPRAS');
  v_err := null;
  begin perform public.fn_iva_clasificar_linea(374, 'invoice_items',
          (select it.id from public.invoice_items it where it.invoice_purchase_id = (select v::uuid from ctx where k = 'fcnd') and it.unit_price = 50000),
          '{"tratamiento":"gravada","tarifa":19,"tipo_operacion":"bienes","descontable":"no_descontable"}');
  exception when others then v_err := sqlerrm; end;
  insert into r (escenario, verificacion, esperado, obtenido, ok) values ('V', 'No descontable sin motivo', 'rechaza: MOTIVO_REQUERIDO', coalesce(v_err, 'NO RECHAZÓ'), v_err = 'MOTIVO_REQUERIDO');
  v_err := null;
  begin perform public.fn_iva_clasificar_linea(374, 'invoice_items',
          (select it.id from public.invoice_items it where it.invoice_sales_id = (select v::uuid from ctx where k = 'fvx')),
          '{"tratamiento":"exenta","tarifa":19}');
  exception when others then v_err := sqlerrm; end;
  insert into r (escenario, verificacion, esperado, obtenido, ok) values ('V', 'Exenta con tarifa 19 %', 'rechaza: TARIFA_INVALIDA', coalesce(v_err, 'NO RECHAZÓ'), v_err = 'TARIFA_INVALIDA');

  -- Naturaleza de los asientos de devolución de compra.
  perform public.fn_iva_naturaleza_asiento_guardar(374, (select v::int from ctx where k = 'je_ncc1'),
    jsonb_build_object('naturaleza', 'devolucion_compra', 'invoice_purchase_id', (select v from ctx where k = 'fcb'), 'base', 100000,
                       'soporte', 'Nota crédito electrónica del proveedor NC-PRUEBA-1'));
  perform public.fn_iva_naturaleza_asiento_guardar(374, (select v::int from ctx where k = 'je_ncc2'),
    jsonb_build_object('naturaleza', 'devolucion_compra', 'invoice_purchase_id', (select v from ctx where k = 'fcnd'), 'base', 10000,
                       'soporte', 'Nota crédito electrónica del proveedor NC-PRUEBA-2'));
  -- Octubre ya declarado.
  perform public.fn_tributario_iva_declaracion_guardar(374, '2026-10-01', '2026-10-31',
    '{"numero_formulario":"PRUEBA-300-OCT","presentada_en":"2026-11-05"}');
end
$$;
set constraints all immediate;

-- Lectura de las líneas de un documento (lo que usa el panel «Datos fiscales de la línea»).
do $$
declare v_l jsonb;
begin
  v_l := public.fn_iva_lineas_documento(374, 'factura_compra', (select v::uuid from ctx where k = 'fcb'));
  insert into r (escenario, verificacion, esperado, obtenido, ok)
  select 'L', 'Líneas de FCB con clasificación, procedencia y sugerencia', '2 líneas · descontable · sugerencia gravada',
         format('%s líneas · %s · sugerencia %s', jsonb_array_length(v_l -> 'lineas'),
                string_agg(distinct x -> 'descontable' ->> 'estado', ','), string_agg(distinct x -> 'sugerencia' ->> 'tratamiento', ',')),
         jsonb_array_length(v_l -> 'lineas') = 2 and bool_and(x -> 'descontable' ->> 'estado' = 'descontable') and bool_and(x -> 'sugerencia' ->> 'tratamiento' = 'gravada')
    from jsonb_array_elements(v_l -> 'lineas') x;
end
$$;

-- Herencia de la nota crédito.
reset role;
insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'S', 'Línea de la nota crédito hereda la clasificación de la línea que acredita', 'gravada / 19 / bienes / heredada',
       concat_ws(' / ', it.iva_tratamiento, round(it.iva_tarifa)::text, it.iva_tipo_operacion, it.iva_clasificacion_origen),
       concat_ws(' / ', it.iva_tratamiento, round(it.iva_tarifa)::text, it.iva_tipo_operacion, it.iva_clasificacion_origen) = 'gravada / 19 / bienes / heredada'
  from public.invoice_items it where it.invoice_sales_id = (select v::uuid from ctx where k = 'nc');
insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'S', 'Bitácora de cambios de personas', '7 cambios (FCB×2, FCS×2, FCND, FCOCT, DS)', count(*)::text, count(*) = 7
  from public.iva_clasificacion_cambios where organization_id = 374;

-- Mapa asiento → documento, para leer el resultado.
insert into ctx
select 'doc_' || je.id, coalesce((select upper(c.k) from ctx c where c.v = je.source_id and left(c.k, 3) <> 'je_' and left(c.k, 2) <> 'p_'),
                                 (select upper(replace(c.k, 'je_', '')) from ctx c where left(c.k, 3) = 'je_' and c.v = je.id::text), je.source)
  from public.journal_entries je where je.organization_id = 374 and je.id > (select v::int from ctx where k = 'max_je');

-- ── El borrador por casillas, pedido por el usuario miembro ──
select set_config('request.jwt.claims', '{"sub":"bb11d6d2-f647-49f7-9b29-aa4c4438abf1","role":"authenticated"}', true);
set local role authenticated;
do $$
declare
  v_b jsonb;
  v_o jsonb;
  v_c record;
  v_obt numeric;
  v_libro numeric;
  v_txt text;
  v_err text;
begin
  v_b := public.fn_tributario_borrador_iva_300(374, '2026-11-01', '2026-11-30');
  insert into ctx values ('borrador', v_b::text);

  for v_c in select * from (values
      (27, 100000::numeric, 'FV1 servicio 5 %'), (58, 5000, 'FV1'),
      (28, 500000, 'FV1 bien 19 % 300.000 + POS1 100.000 + POS2 100.000 (la venta se conserva aunque se haya revertido)'),
      (59, 95000, '57.000 + 19.000 + 19.000'),
      (42, 200000, 'NC de la factura de octubre, en el período de la nota'), (79, 38000, 'NC'),
      (50, 200000, 'FCB bien 5 %'), (71, 10000, 'FCB'),
      (51, 1100000, 'FCB 1.000.000 + FCOCT 100.000 (de octubre, descontable en noviembre)'), (72, 209000, '190.000 + 19.000'),
      (52, 300300, 'FCS servicio 5 %'), (74, 15015, 'FCS (formulario 15.000)'),
      (53, 600000, 'FCS 500.000 + DS 100.000'), (75, 114000, '95.000 + 19.000'),
      (56, 100000, 'NCC1 (FCB evaluada descontable)'), (66, 19000, 'NCC1')) x(casilla, esperado, nota) loop
    select (c ->> 'valor')::numeric into v_obt from jsonb_array_elements(v_b -> 'casillas') c where (c ->> 'casilla')::int = v_c.casilla;
    insert into r (escenario, verificacion, esperado, obtenido, ok) values
      ('B', 'Casilla ' || v_c.casilla, v_c.esperado || ' · ' || v_c.nota, coalesce(v_obt::text, 'NO ESTÁ'), v_obt = v_c.esperado);
  end loop;

  select string_agg(format('%s %s→%s (dif %s)', c ->> 'casilla', round((c ->> 'valor')::numeric), round((c ->> 'valor_formulario')::numeric), round((c ->> 'diferencia_redondeo')::numeric)), ' · ')
    into v_txt from jsonb_array_elements(v_b -> 'casillas') c where (c ->> 'casilla')::int in (52, 74);
  insert into r (escenario, verificacion, esperado, obtenido, ok) values
    ('B', 'Redondeo a miles del formulario', '52 300300→300000 (dif -300) · 74 15015→15000 (dif -15)', v_txt,
     v_txt = '52 300300→300000 (dif -300) · 74 15015→15000 (dif -15)');

  insert into r (escenario, verificacion, esperado, obtenido, ok)
  select 'B', 'Casilla 79/42: la nota crédito se señala «entre períodos» con su factura de origen', 'entre_periodos true · factura PRUEBA-IVA-FVOCT',
         format('entre_periodos %s · factura %s', o -> 'origenes' -> 0 ->> 'entre_periodos', o -> 'origenes' -> 0 -> 'factura_origen' ->> 'numero'),
         (o -> 'origenes' -> 0 ->> 'entre_periodos')::boolean and o -> 'origenes' -> 0 -> 'factura_origen' ->> 'numero' = 'PRUEBA-IVA-FVOCT'
    from jsonb_array_elements(v_b -> 'casillas') o where (o ->> 'casilla')::int = 79;
  insert into r (escenario, verificacion, esperado, obtenido, ok)
  select 'B', 'Casilla 72: el IVA de FCOCT se marca «de otro período»', '1 origen de otro período (19.000)',
         string_agg(x ->> 'iva', ', ') filter (where (x ->> 'de_otro_periodo')::boolean),
         count(*) filter (where (x ->> 'de_otro_periodo')::boolean) = 1 and sum((x ->> 'iva')::numeric) filter (where (x ->> 'de_otro_periodo')::boolean) = 19000
    from jsonb_array_elements(v_b -> 'casillas') o, jsonb_array_elements(o -> 'origenes') x where (o ->> 'casilla')::int = 72;

  -- Pendientes (nunca se omiten).
  for v_c in select * from (values
      ('generado', 'casilla_por_confirmar', 50000::numeric, 0::numeric, 'FV1 línea excluida: el Contador no fijó casilla'),
      ('generado', 'exenta_sin_soporte', 400000, 0, 'FVX exportación sin fundamento'),
      ('generado', 'sin_clasificar', 30000, 0, 'POS3 sin producto ni impuesto'),
      ('descontable', 'no_descontable_en_2408', 100000, 19000, 'FCND línea no descontable (requiere ajuste contable)'),
      ('descontable', 'descontable_por_evaluar', 50000, 9500, 'FCND línea sin evaluar')) x(lado, motivo, base, iva, nota) loop
    select format('base %s · IVA %s · %s origen(es)', round((p ->> 'base')::numeric), round((p ->> 'iva')::numeric), p ->> 'total_origenes') into v_txt
      from jsonb_array_elements(v_b -> 'pendientes') p where p ->> 'lado' = v_c.lado and p ->> 'motivo' = v_c.motivo;
    insert into r (escenario, verificacion, esperado, obtenido, ok) values
      ('B', 'Pendiente ' || v_c.lado || ' / ' || v_c.motivo, format('base %s · IVA %s · %s', v_c.base, v_c.iva, v_c.nota), coalesce(v_txt, 'NO ESTÁ'),
       v_txt = format('base %s · IVA %s · 1 origen(es)', v_c.base, v_c.iva));
  end loop;
  insert into r (escenario, verificacion, esperado, obtenido, ok)
  select 'B', 'Pendientes por línea/documento (sin otros movimientos)', '5 grupos', count(*)::text, count(*) = 5
    from jsonb_array_elements(v_b -> 'pendientes');

  -- Otros movimientos por naturaleza.
  for v_c in select * from (values
      ('je_pago', 'pago_dian / no_afecta / -50000', 'Pago desde bancos: no es IVA generado ni descontable'),
      ('je_aj', 'sin_soporte / pendiente / -10000', 'Asiento manual sin soporte'),
      ('je_pos2_rev', 'reversa_contable / pendiente / -19000', 'Reversa de POS2: no sustituye una nota crédito'),
      ('je_ncc1', 'devolucion_compra / casilla / 19000', 'Devolución de FCB (IVA evaluado descontable) → 56/66'),
      ('je_ncc2', 'devolucion_compra / pendiente / 1900', 'Devolución de FCND (IVA no descontado) → pendiente')) x(k, esperado, nota) loop
    select format('%s / %s / %s', o ->> 'naturaleza', o ->> 'destino', round((o ->> 'valor')::numeric)) into v_txt
      from jsonb_array_elements(v_b -> 'otros_movimientos') o where (o ->> 'asiento') = (select v from ctx where k = v_c.k);
    insert into r (escenario, verificacion, esperado, obtenido, ok) values
      ('B', 'Otro movimiento ' || upper(replace(v_c.k, 'je_', '')), v_c.esperado || ' · ' || v_c.nota, coalesce(v_txt, 'NO ESTÁ'), v_txt = v_c.esperado);
  end loop;

  -- Resumen, estado y conciliación.
  insert into r (escenario, verificacion, esperado, obtenido, ok) values
    ('B', 'Resumen preliminar (no es saldo a pagar)',
     'generado 58+59+66 = 119000 · descontable 71+72+74+75+79 = 386015 · diferencia -267015 · formulario 119000 / 386000 / -267000',
     format('generado %s · descontable %s · diferencia %s · formulario %s / %s / %s',
            v_b -> 'resumen' ->> 'iva_generado', v_b -> 'resumen' ->> 'iva_descontable', v_b -> 'resumen' ->> 'diferencia_preliminar',
            v_b -> 'resumen' ->> 'iva_generado_formulario', v_b -> 'resumen' ->> 'iva_descontable_formulario', v_b -> 'resumen' ->> 'diferencia_preliminar_formulario'),
     (v_b -> 'resumen' ->> 'iva_generado')::numeric = 119000 and (v_b -> 'resumen' ->> 'iva_descontable')::numeric = 386015
       and (v_b -> 'resumen' ->> 'iva_generado_formulario')::numeric = 119000 and (v_b -> 'resumen' ->> 'iva_descontable_formulario')::numeric = 386000);
  insert into r (escenario, verificacion, esperado, obtenido, ok) values
    ('B', 'Estado del borrador', 'conciliado · aprobado_fiscalmente false · liquidacion_completa false · 4 casillas por diligenciar',
     format('%s · aprobado_fiscalmente %s · liquidacion_completa %s · %s casillas por diligenciar',
            v_b ->> 'estado', v_b ->> 'aprobado_fiscalmente', v_b ->> 'liquidacion_completa', jsonb_array_length(v_b -> 'por_diligenciar')),
     v_b ->> 'estado' = 'conciliado' and not (v_b ->> 'aprobado_fiscalmente')::boolean and not (v_b ->> 'liquidacion_completa')::boolean
       and jsonb_array_length(v_b -> 'por_diligenciar') = 4);

  select round(sum(l.credit - l.debit), 2) into v_libro
    from public.journal_entries je join public.journal_lines l on l.journal_entry_id = je.id
   where je.organization_id = 374 and je.posted and l.account_code like '2408%'
     and je.entry_date >= ('2026-11-01'::timestamp at time zone 'America/Bogota')
     and je.entry_date < ('2026-12-01'::timestamp at time zone 'America/Bogota');
  insert into r (escenario, verificacion, esperado, obtenido, ok) values
    ('R', 'Conciliación: neto 2408 (SELECT directo) = casillas + pendientes + otros + redondeo', 'libro -353615 · diferencia 0',
     format('libro %s · borrador libro %s · casillas %s · pendientes %s · otros %s · redondeo %s · diferencia %s', v_libro,
            v_b -> 'conciliacion' ->> 'libro_2408', v_b -> 'conciliacion' ->> 'casillas', v_b -> 'conciliacion' ->> 'pendientes',
            v_b -> 'conciliacion' ->> 'otros_no_afectan_o_por_diligenciar', v_b -> 'conciliacion' ->> 'redondeo_lineas_libros',
            v_b -> 'conciliacion' ->> 'diferencia'),
     v_libro = -353615 and (v_b -> 'conciliacion' ->> 'libro_2408')::numeric = v_libro and abs((v_b -> 'conciliacion' ->> 'diferencia')::numeric) <= 1);

  insert into r (escenario, verificacion, esperado, obtenido, ok) values
    ('D', 'Asientos de octubre grabados después de declarar octubre', 'FVOCT y FCOCT señalados (2)',
     (select string_agg(coalesce((select c.v from ctx c where c.k = 'doc_' || (a ->> 'asiento')), a ->> 'asiento'), ', ')
        from jsonb_array_elements(v_b -> 'alertas' -> 'grabados_despues_de_declarar') a),
     jsonb_array_length(v_b -> 'alertas' -> 'grabados_despues_de_declarar') = 2);

  -- Octubre: FCOCT queda «se descuenta en otro período»; el período figura declarado.
  v_o := public.fn_tributario_borrador_iva_300(374, '2026-10-01', '2026-10-31');
  insert into ctx values ('borrador_oct', v_o::text);
  insert into r (escenario, verificacion, esperado, obtenido, ok) values
    ('D', 'Octubre: período declarado, FVOCT en 28/59, FCOCT pendiente «descontable_en_otro_periodo»',
     'declarado PRUEBA-300-OCT · 28 = 200000 · 59 = 38000 · pendiente 19000',
     format('declarado %s · 28 = %s · 59 = %s · pendiente %s', v_o -> 'periodo_declarado' ->> 'numero_formulario',
            (select c ->> 'valor' from jsonb_array_elements(v_o -> 'casillas') c where (c ->> 'casilla')::int = 28),
            (select c ->> 'valor' from jsonb_array_elements(v_o -> 'casillas') c where (c ->> 'casilla')::int = 59),
            (select p ->> 'iva' from jsonb_array_elements(v_o -> 'pendientes') p where p ->> 'motivo' = 'descontable_en_otro_periodo')),
     v_o -> 'periodo_declarado' ->> 'numero_formulario' = 'PRUEBA-300-OCT'
       and (select (c ->> 'valor')::numeric from jsonb_array_elements(v_o -> 'casillas') c where (c ->> 'casilla')::int = 28) = 200000
       and (select (p ->> 'iva')::numeric from jsonb_array_elements(v_o -> 'pendientes') p where p ->> 'motivo' = 'descontable_en_otro_periodo') = 19000);

  -- Solo lectura y periodo inválido.
  insert into r (escenario, verificacion, esperado, obtenido, ok) values
    ('P', 'La función es de solo lectura', 'STABLE',
     (select case p.provolatile when 's' then 'STABLE' else 'NO' end from pg_proc p where p.oid = 'public.fn_tributario_borrador_iva_300(integer,date,date)'::regprocedure),
     (select p.provolatile = 's' from pg_proc p where p.oid = 'public.fn_tributario_borrador_iva_300(integer,date,date)'::regprocedure));
  v_err := null;
  begin perform public.fn_tributario_borrador_iva_300(374, '2026-11-30', '2026-11-01');
  exception when others then v_err := sqlerrm; end;
  insert into r (escenario, verificacion, esperado, obtenido, ok) values ('P', 'Periodo con «hasta» antes de «desde»', 'rechaza: PERIODO_INVALIDO', coalesce(v_err, 'NO RECHAZÓ'), v_err = 'PERIODO_INVALIDO');
end
$$;

-- ── Cambiar el producto después no cambia las líneas guardadas ──
reset role;
update public.products set product_type = 'service' where id = (select v::int from ctx where k = 'p_b19');
delete from public.product_tax_relations where product_id = (select v::int from ctx where k = 'p_b19');
insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'S', 'El producto B19 pasa a servicio y sin impuestos: la línea de FV1 sigue igual', 'gravada / 19 / bienes / sugerida',
       concat_ws(' / ', it.iva_tratamiento, round(it.iva_tarifa)::text, it.iva_tipo_operacion, it.iva_clasificacion_origen),
       concat_ws(' / ', it.iva_tratamiento, round(it.iva_tarifa)::text, it.iva_tipo_operacion, it.iva_clasificacion_origen) = 'gravada / 19 / bienes / sugerida'
  from public.invoice_items it where it.invoice_sales_id = (select v::uuid from ctx where k = 'fv1') and it.description = 'Bien 19';

-- ── Permisos: miembro sin finance.view / finance.create, no miembro, anon ──
update public.organization_members set is_super_admin = false, role_id = 4
 where organization_id = 374 and user_id = 'bb11d6d2-f647-49f7-9b29-aa4c4438abf1';
select set_config('request.jwt.claims', '{"sub":"bb11d6d2-f647-49f7-9b29-aa4c4438abf1","role":"authenticated"}', true);
set local role authenticated;
do $$
declare v_err text;
begin
  v_err := null;
  begin perform public.fn_tributario_borrador_iva_300(374, '2026-11-01', '2026-11-30');
  exception when others then v_err := sqlerrm; end;
  insert into r (escenario, verificacion, esperado, obtenido, ok) values ('P', 'Borrador: miembro rol Empleado (sin finance.view)', 'rechaza: SIN_PERMISO', coalesce(v_err, 'NO RECHAZÓ'), v_err = 'SIN_PERMISO');
  v_err := null;
  begin perform public.fn_iva_clasificar_linea(374, 'invoice_items',
          (select it.id from public.invoice_items it where it.invoice_sales_id = (select v::uuid from ctx where k = 'fvx')),
          '{"tratamiento":"exenta","tarifa":0,"fundamento":"x"}');
  exception when others then v_err := sqlerrm; end;
  insert into r (escenario, verificacion, esperado, obtenido, ok) values ('P', 'Clasificar: miembro rol Empleado (sin finance.create)', 'rechaza: SIN_PERMISO', coalesce(v_err, 'NO RECHAZÓ'), v_err = 'SIN_PERMISO');
  v_err := null;
  begin perform public.fn_tributario_iva_declaracion_guardar(374, '2026-11-01', '2026-11-30', '{"presentada_en":"2026-12-10"}');
  exception when others then v_err := sqlerrm; end;
  insert into r (escenario, verificacion, esperado, obtenido, ok) values ('P', 'Registrar declarado: rol Empleado (sin finance.approve)', 'rechaza: SIN_PERMISO', coalesce(v_err, 'NO RECHAZÓ'), v_err = 'SIN_PERMISO');
end
$$;
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
do $$
declare v_err text;
begin
  v_err := null;
  begin perform public.fn_tributario_borrador_iva_300(374, '2026-11-01', '2026-11-30');
  exception when others then v_err := sqlerrm; end;
  insert into r (escenario, verificacion, esperado, obtenido, ok) values ('P', 'No miembro de la 374', 'rechaza: Acceso denegado a la organización', coalesce(v_err, 'NO RECHAZÓ'), v_err = 'Acceso denegado a la organización');
end
$$;
reset role;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
do $$
declare v_err text;
begin
  v_err := null;
  begin perform public.fn_tributario_borrador_iva_300(374, '2026-11-01', '2026-11-30');
  exception when others then v_err := sqlerrm; end;
  insert into r (escenario, verificacion, esperado, obtenido, ok) values ('P', 'anon: borrador', 'rechaza: permiso denegado', coalesce(v_err, 'NO RECHAZÓ'), v_err like 'permission denied%');
  v_err := null;
  begin perform public.fn_iva_clasificar_linea(374, 'invoice_items', gen_random_uuid(), '{}');
  exception when others then v_err := sqlerrm; end;
  insert into r (escenario, verificacion, esperado, obtenido, ok) values ('P', 'anon: clasificar', 'rechaza: permiso denegado', coalesce(v_err, 'NO RECHAZÓ'), v_err like 'permission denied%');
end
$$;

reset role;
select n, escenario, verificacion, esperado, obtenido, ok from r
union all
select 999, 'JSON', 'Respuesta del borrador de noviembre', null, (select v from ctx where k = 'borrador'), null
order by 1;

rollback;
