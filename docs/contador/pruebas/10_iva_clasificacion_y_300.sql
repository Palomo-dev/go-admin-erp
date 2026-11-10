-- Pruebas de escenario · Clasificación de IVA por línea, procedencia del descontable y borrador del formulario 300
-- RONDA 2 del Contador (2026-11-07): B1–B7, tres correcciones indispensables y «otros movimientos» como señales.
-- RONDA 3 (2026-11-08): la corrección de error solo saca la venta de las casillas si está COMPLETA (POS4 incompleta,
-- POS5 completa y marcada «corrige una declaración anterior» → alerta), y el borrador reconoce la compra contabilizada
-- con el IVA no descontable en el costo (B5, FCAC; el asiento se graba aquí como lo arma 20261108152000).
-- RONDA 5 (2026-11-09): se vuelve a correr con las migraciones reescritas. Solo cambian DATOS de POS5 para cumplir lo
-- nuevo de «nunca transmitida» (constancia de que no hay soporte de contingencia, consulta del CUFE/CUDE sin resultado y
-- venta de hace 3 días, para que la consulta quede pasadas las 48 horas). Ningún esperado cambia.
-- RONDA 4 (2026-11-09): completar el expediente ya no basta; POS5 lleva el expediente completo (explicación, factura,
-- estado electrónico «nunca transmitida» con la contingencia descartada, entrega y cobro con soporte) Y la decisión
-- «retirar_venta» del período 2026-11-01 a 2026-12-31 (fn_iva_correccion_error_decidir). Las cifras no cambian.
-- Proyecto taqjemqjtumhwptchcxk · Organización de pruebas 374 (sede 585). NO DEJA DATOS (begin … rollback).
--
-- Requiere 20261108150000, 20261108150500 y 20261108151000 (escritas, SIN aplicar). En la prueba en seco se pegan sus
-- cuerpos donde dice «MIGRACIONES», dentro de la misma transacción que termina en rollback. No usa H1 (14:00).
--
-- Documentos creados DENTRO de la transacción por las vías normales (cada uno con su asiento). Período 2026-11-01 a 30.
--   Productos: B19, B5 (bienes), S19, S5 (servicios), EXC («Excluido de IVA»), EXP («Exento de IVA»).
--   VENTAS
--   FV1   2 × 150.000 B19 · 1 × 100.000 S5 · 1 × 50.000 EXC (la persona añade el fundamento: excluida → 39)
--   FVX   exportación 400.000 SIN soporte (exenta + tipo exportación de bienes) → pendiente
--   FVX2  exportación 300.000 CON soporte (declaración de exportación, número y fecha) → 30
--   FVN   exenta nacional 70.000 con fundamento → 35 · ingreso no gravado 20.000 (no sujeta, con fundamento) → 40
--   POS1  100.000 + IVA 19.000 (tarifa 0 en la línea) → 28/59
--   POS2  igual, su asiento se REVIERTE sin registrar nada → la venta queda en 28/59 y la reversa, pendiente (B6)
--   POS3  30.000 sin producto ni IVA → sin clasificar
--   POS4  100.000 + IVA 19.000, revertida; la reversa se registra «corrección de error» SOLO con su soporte (ronda 3:
--         incompleta) → la venta SIGUE en 28/59 y la reversa queda pendiente «corrección de error incompleta»
--   POS5  igual, con el expediente COMPLETO (ronda 4: soporte, explicación, factura, estado electrónico, contingencia,
--         entrega, cobro, constancia con referencia y fecha, «sí corresponde corregir una declaración anterior») y la
--         DECISIÓN «retirar_venta» → sale de las casillas y alerta de declaración
--   FVOCT factura del 15-oct: 200.000 B19 · NC total emitida hoy → 42/79 «entre períodos»
--         · ND (nota débito) de hoy sobre FVOCT: 50.000 al 19 % → 28/59 señalada «corrige otro período» (B2)
--   COMPRAS
--   FCB   1.000.000 B19 + 200.000 B5, evaluadas «descontable»
--   FCS   500.000 S19 + 300.300 S5, «descontable»
--   FCND  100.000 B19 «no descontable» + 50.000 B19 «por evaluar» → bases en 51 aunque el IVA no se descuente (corr. a)
--   FCP   200.000 B19 «proporcional 60 %» (art. 490) → base completa en 51; IVA 22.800 a 72, 15.200 pendiente (B3)
--   FCX   40.000 de un bien excluido, con fundamento → 54
--   FCOCT compra del 20-oct grabada hoy → su asiento es de octubre: no se mueve a noviembre (corrección b)
--   DS    documento soporte 100.000 + IVA 19 %: marcarlo «descontable» se rechaza; queda «supuesto especial» (corr. c)
--   FCAC  compra 100.000 B19 «no descontable» + 50.000 B19 «descontable», evaluadas ANTES de contabilizar; su asiento
--         lleva el IVA no descontable al costo (B5): D costo 169.000 · D 24081001 9.500 · C proveedor 178.500 → bases en 51,
--         9.500 en 72 y el IVA del costo NO queda pendiente (resumen.iva_no_descontable_al_costo 19.000)
--   ASIENTOS SIN DOCUMENTO CON LÍNEAS
--   NCC1  devolución de FCB (línea B19: base 100.000, IVA 19.000) registrada con soporte y líneas → 56/66
--   NCC2  devolución de FCND (línea no descontable: base 10.000, IVA 1.900) → base a 56, IVA pendiente
--   NCC3  devolución (base 5.000, IVA 950) sin líneas: el registro se rechaza → queda pendiente sin soporte (B4)
--   AJ    manual D 24080501 10.000 sin soporte → pendiente
--   PAGO  banco D 24080501 50.000 sin registrar → «sugerido: pago a la DIAN · por confirmar» (pendiente)
--   PAGO2 banco D 24080501 30.000 registrado con su recibo → no afecta
--   TRAS  D 24080501 / C 24080502 20.000 sin registrar → «sugerido: traslado · por confirmar» (pendiente)
--   Octubre se registra como DECLARADO (presentado el 5-nov-2026).

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
           select 374, 585, (select v::uuid from ctx where k = 'cli'), 'PRUEBA-IVA-' || x.n, 'draft', 'COP', x.f, 'invoice'
             from (values ('FV1', now()), ('FVX', now()), ('FVX2', now()), ('FVN', now()), ('FVOCT', '2026-10-15 12:00-05'::timestamptz)) x(n, f)
           returning id, number)
insert into ctx select lower(replace(number, 'PRUEBA-IVA-', '')), id::text from f;
insert into public.invoice_items (invoice_id, invoice_type, invoice_sales_id, product_id, description, qty, unit_price, tax_rate, tax_code, total_line)
select (select v::uuid from ctx where k = x.d), 'sale', (select v::uuid from ctx where k = x.d), (select v::int from ctx where k = x.p), x.descr, x.q, x.pr, x.t, x.c, x.tot
  from (values ('fv1', 'p_b19', 'Bien 19', 2, 150000, 19, 'IVA_19', 357000), ('fv1', 'p_s5', 'Servicio 5', 1, 100000, 5, 'IVA_5', 105000),
               ('fv1', 'p_exc', 'Bien excluido', 1, 50000, 0, null, 50000), ('fvx', 'p_exp', 'Exportación sin soporte', 1, 400000, 0, 'IVA_0', 400000),
               ('fvx2', 'p_exp', 'Exportación con soporte', 1, 300000, 0, 'IVA_0', 300000), ('fvn', 'p_exp', 'Exenta nacional', 1, 70000, 0, 'IVA_0', 70000),
               ('fvn', null, 'Ingreso no gravado', 1, 20000, 0, null, 20000), ('fvoct', 'p_b19', 'Bien 19', 1, 200000, 19, 'IVA_19', 238000)
       ) x(d, p, descr, q, pr, t, c, tot);
update public.invoice_sales set status = 'issued' where id in (select v::uuid from ctx where k in ('fv1', 'fvx', 'fvx2', 'fvn', 'fvoct'));
-- Nota débito de hoy sobre la factura de octubre (B2).
with n as (insert into public.invoice_sales (organization_id, branch_id, customer_id, number, status, currency, issue_date, document_type, related_invoice_id)
           values (374, 585, (select v::uuid from ctx where k = 'cli'), 'PRUEBA-IVA-ND', 'draft', 'COP', now(), 'debit_note', (select v::uuid from ctx where k = 'fvoct'))
           returning id)
insert into ctx select 'nd', id::text from n;
insert into public.invoice_items (invoice_id, invoice_type, invoice_sales_id, product_id, description, qty, unit_price, tax_rate, tax_code, total_line)
select v::uuid, 'sale', v::uuid, null, 'Mayor valor facturado', 1, 50000, 19, 'IVA_19', 59500 from ctx where k = 'nd';
update public.invoice_sales set status = 'issued' where id = (select v::uuid from ctx where k = 'nd');

with s as (insert into public.sales (organization_id, branch_id, user_id, status, subtotal, tax_total, total, tax_included, sale_date, notes)
           -- Ronda 5: POS5 es de hace 3 días, para que la consulta del CUFE/CUDE de hoy quede pasadas las 48 horas.
           select 374, 585, 'bb11d6d2-f647-49f7-9b29-aa4c4438abf1', 'paid', x.b, x.i, x.b + x.i, false,
                  case when x.n = 'POS5' then now() - interval '3 days' else now() end, x.n
             from (values ('POS1', 100000, 19000), ('POS2', 100000, 19000), ('POS3', 30000, 0), ('POS4', 100000, 19000), ('POS5', 100000, 19000)) x(n, b, i)
           returning id, notes)
insert into ctx select lower(notes), id::text from s;
insert into public.sale_items (sale_id, product_id, quantity, unit_price, total, tax_amount, tax_rate)
select (select v::uuid from ctx where k = x.k), (select v::int from ctx where k = x.p), 1, x.b, x.b, x.i, 0
  from (values ('pos1', 'p_b19', 100000, 19000), ('pos2', 'p_b19', 100000, 19000), ('pos3', null, 30000, 0), ('pos4', 'p_b19', 100000, 19000),
               ('pos5', 'p_b19', 100000, 19000)) x(k, p, b, i);
set constraints trg_auto_journal_sale_pos immediate;
insert into ctx select 'je_' || x.k, (select min(id) from public.journal_entries where organization_id = 374 and source = 'sales' and source_id = (select v from ctx where k = x.k))::text
  from (values ('pos2'), ('pos4'), ('pos5')) x(k);
insert into ctx select 'je_pos2_rev', public.fn_revertir_asiento_en_fecha((select v::int from ctx where k = 'je_pos2'), 'anulacion_pago', 'prueba-iva-300', now(), null)::text;
insert into ctx select 'je_pos4_rev', public.fn_revertir_asiento_en_fecha((select v::int from ctx where k = 'je_pos4'), 'anulacion_pago', 'prueba-iva-300b', now(), null)::text;
insert into ctx select 'je_pos5_rev', public.fn_revertir_asiento_en_fecha((select v::int from ctx where k = 'je_pos5'), 'anulacion_pago', 'prueba-iva-300c', now(), null)::text;

-- ── Compras y documento soporte ──
with f as (insert into public.invoice_purchase (organization_id, branch_id, supplier_id, number_ext, status, currency, issue_date)
           select 374, 585, (select v::int from ctx where k = 'sup'), 'PRUEBA-IVA-' || x.n, 'draft', 'COP', x.f
             from (values ('FCB', now()), ('FCS', now()), ('FCND', now()), ('FCP', now()), ('FCX', now()), ('FCOCT', '2026-10-20 12:00-05'::timestamptz)) x(n, f)
           returning id, number_ext)
insert into ctx select lower(replace(number_ext, 'PRUEBA-IVA-', '')), id::text from f;
insert into public.invoice_items (invoice_id, invoice_type, invoice_purchase_id, product_id, description, qty, unit_price, tax_rate, tax_code, total_line)
select (select v::uuid from ctx where k = x.d), 'purchase', (select v::uuid from ctx where k = x.d), (select v::int from ctx where k = x.p), x.descr, 1, x.pr, x.t, x.c, x.tot
  from (values ('fcb', 'p_b19', 'Bien 19', 1000000, 19, 'IVA_19', 1190000), ('fcb', 'p_b5', 'Bien 5', 200000, 5, 'IVA_5', 210000),
               ('fcs', 'p_s19', 'Servicio 19', 500000, 19, 'IVA_19', 595000), ('fcs', 'p_s5', 'Servicio 5', 300300, 5, 'IVA_5', 315315),
               ('fcnd', 'p_b19', 'Bien 19 no descontable', 100000, 19, 'IVA_19', 119000), ('fcnd', 'p_b19', 'Bien 19 sin evaluar', 50000, 19, 'IVA_19', 59500),
               ('fcp', 'p_b19', 'Bien 19 proporcional', 200000, 19, 'IVA_19', 238000), ('fcx', 'p_exc', 'Bien excluido comprado', 40000, 0, null, 40000),
               ('fcoct', 'p_b19', 'Bien 19 de octubre', 100000, 19, 'IVA_19', 119000)) x(d, p, descr, pr, t, c, tot);
update public.invoice_purchase set status = 'received' where id in (select v::uuid from ctx where k in ('fcb', 'fcs', 'fcnd', 'fcp', 'fcx', 'fcoct'));
-- FCAC (B5): queda en borrador; se evalúa y luego se graba su asiento con el IVA no descontable en el costo.
with f as (insert into public.invoice_purchase (organization_id, branch_id, supplier_id, number_ext, status, currency, issue_date)
           values (374, 585, (select v::int from ctx where k = 'sup'), 'PRUEBA-IVA-FCAC', 'draft', 'COP', now()) returning id)
insert into ctx select 'fcac', id::text from f;
insert into public.invoice_items (invoice_id, invoice_type, invoice_purchase_id, product_id, description, qty, unit_price, tax_rate, tax_code, total_line)
select (select v::uuid from ctx where k = 'fcac'), 'purchase', (select v::uuid from ctx where k = 'fcac'), (select v::int from ctx where k = 'p_b19'), x.descr, 1, x.pr, 19, 'IVA_19', x.tot
  from (values ('Bien 19 al costo', 100000, 119000), ('Bien 19 descontable', 50000, 59500)) x(descr, pr, tot);

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
insert into ctx select 'je_' || x.k, public.fn_create_journal_entry(
  p_organization_id := 374, p_branch_id := 585, p_entry_date := now(), p_memo := x.memo, p_source := x.src, p_source_id := null,
  p_debit_account := x.d, p_credit_account := x.c, p_amount := x.a, p_tax_account := x.ta, p_tax_amount := x.ti,
  p_tax_is_credit := x.ti is not null, p_fact_key := 'prueba:iva300:' || x.k)::text
  from (values ('ncc1', 'Devolución a proveedor 1 (prueba)', 'manual', '22050501', '14350101', 119000::numeric, '24081001', 19000::numeric),
               ('ncc2', 'Devolución a proveedor 2 (prueba)', 'manual', '22050501', '14350101', 11900, '24081001', 1900),
               ('ncc3', 'Devolución a proveedor 3 (prueba)', 'manual', '22050501', '14350101', 5950, '24081001', 950),
               ('aj', 'Ajuste manual de IVA (prueba)', 'manual', '24080501', '1110', 10000, null, null),
               ('pago', 'Pago IVA a la DIAN (prueba)', 'bank_transactions', '24080501', '1110', 50000, null, null),
               ('pago2', 'Pago IVA a la DIAN 2 (prueba)', 'bank_transactions', '24080501', '1110', 30000, null, null)) x(k, memo, src, d, c, a, ta, ti);
-- Traslado entre dos auxiliares de la 2408 (fn_create_journal_entry no admite dos cuentas 2408): asiento manual directo.
with e as (insert into public.journal_entries (organization_id, branch_id, entry_date, memo, posted, source, fact_key)
           values (374, 585, now(), 'Traslado entre auxiliares (prueba)', true, 'manual', 'prueba:iva300:tras') returning id)
insert into ctx select 'je_tras', id::text from e;
insert into public.journal_lines (journal_entry_id, account_code, description, debit, credit)
select v::int, '24080501', 'Traslado (prueba)', 20000, 0 from ctx where k = 'je_tras'
union all select v::int, '24080502', 'Traslado (prueba)', 0, 20000 from ctx where k = 'je_tras';

set constraints all immediate;

-- ── Sugerencias del disparador ──
insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'S', 'Sugerencia al crear la línea: ' || x.doc || ' · ' || it.description, x.esperado,
       concat_ws(' / ', coalesce(it.iva_tratamiento, 'NULL'), coalesce(round(it.iva_tarifa)::text, 'NULL'), coalesce(it.iva_tipo_operacion, 'NULL'),
                 coalesce(it.iva_clasificacion_origen, 'NULL'), coalesce(it.iva_descontable, '—')),
       concat_ws(' / ', coalesce(it.iva_tratamiento, 'NULL'), coalesce(round(it.iva_tarifa)::text, 'NULL'), coalesce(it.iva_tipo_operacion, 'NULL'),
                 coalesce(it.iva_clasificacion_origen, 'NULL'), coalesce(it.iva_descontable, '—')) = x.esperado
  from (values ('fv1', 'Bien 19', 'gravada / 19 / bienes / sugerida / —'), ('fv1', 'Bien excluido', 'excluida / 0 / bienes / sugerida / —'),
               ('fvx', 'Exportación sin soporte', 'exenta / 0 / bienes / sugerida / —'),
               ('fcb', 'Bien 19', 'gravada / 19 / bienes / sugerida / por_evaluar'), ('ds', 'Servicio de aseo', 'gravada / 19 / NULL / sugerida / por_evaluar')) x(doc, descr, esperado)
  join public.invoice_items it on it.description = x.descr
   and (it.invoice_sales_id = (select v::uuid from ctx where k = x.doc) or it.invoice_purchase_id = (select v::uuid from ctx where k = x.doc)
        or it.support_document_id = (select v::uuid from ctx where k = x.doc));
insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'S', 'Los totales del documento no cambian (FV1)', 'subtotal 450000 · IVA 62000 · total 512000',
       format('subtotal %s · IVA %s · total %s', round(f.subtotal), round(f.tax_total), round(f.total)),
       round(f.subtotal) = 450000 and round(f.tax_total) = 62000 and round(f.total) = 512000
  from public.invoice_sales f where f.id = (select v::uuid from ctx where k = 'fv1');

-- ── Acciones de una persona (usuario miembro, sesión simulada) ──
select set_config('request.jwt.claims', '{"sub":"bb11d6d2-f647-49f7-9b29-aa4c4438abf1","role":"authenticated"}', true);
set local role authenticated;
set constraints all deferred;
do $$
declare
  v_id uuid;
  v_err text;
  v_l jsonb;
begin
  insert into ctx select 'nc', (public.fn_nota_credito_emitir(
    (select v::uuid from ctx where k = 'fvoct'), 'total', null, null, null, 'Devolución de prueba IVA 300', false,
    'saldo_a_favor', null, null, 'prueba-iva300-nc') ->> 'id');

  -- Procedencia del descontable.
  for v_id in select it.id from public.invoice_items it
               where it.invoice_purchase_id in (select v::uuid from ctx where k in ('fcb', 'fcs', 'fcoct')) loop
    perform public.fn_iva_clasificar_linea(374, 'invoice_items', v_id, (
      select jsonb_build_object('tratamiento', it.iva_tratamiento, 'tarifa', it.iva_tarifa, 'tipo_operacion', it.iva_tipo_operacion,
                                'descontable', 'descontable', 'descontable_motivo', 'Factura electrónica; destinado a operaciones gravadas (arts. 485 y 488)')
        from public.invoice_items it where it.id = v_id));
  end loop;
  perform public.fn_iva_clasificar_linea(374, 'invoice_items',
    (select it.id from public.invoice_items it where it.invoice_purchase_id = (select v::uuid from ctx where k = 'fcnd') and it.unit_price = 100000),
    '{"tratamiento":"gravada","tarifa":19,"tipo_operacion":"bienes","descontable":"no_descontable","descontable_motivo":"Gasto no imputable a operaciones gravadas (art. 488)"}');
  perform public.fn_iva_clasificar_linea(374, 'invoice_items',
    (select it.id from public.invoice_items it where it.invoice_purchase_id = (select v::uuid from ctx where k = 'fcp')),
    '{"tratamiento":"gravada","tarifa":19,"tipo_operacion":"bienes","descontable":"proporcional","descontable_porcentaje":60,"descontable_motivo":"Art. 490: 60 % de ingresos gravados del período, según el cálculo adjunto"}');
  perform public.fn_iva_clasificar_linea(374, 'invoice_items',
    (select it.id from public.invoice_items it where it.invoice_purchase_id = (select v::uuid from ctx where k = 'fcac') and it.unit_price = 100000),
    '{"tratamiento":"gravada","tarifa":19,"tipo_operacion":"bienes","descontable":"no_descontable","descontable_motivo":"Bien para una operación excluida (art. 488): no procede el descuento"}');
  perform public.fn_iva_clasificar_linea(374, 'invoice_items',
    (select it.id from public.invoice_items it where it.invoice_purchase_id = (select v::uuid from ctx where k = 'fcac') and it.unit_price = 50000),
    '{"tratamiento":"gravada","tarifa":19,"tipo_operacion":"bienes","descontable":"descontable","descontable_motivo":"Destinado a operaciones gravadas (arts. 485 y 488)"}');
  perform public.fn_iva_clasificar_linea(374, 'invoice_items',
    (select it.id from public.invoice_items it where it.invoice_purchase_id = (select v::uuid from ctx where k = 'fcx')),
    '{"tratamiento":"excluida","tarifa":0,"tipo_operacion":"bienes","fundamento":"Art. 424 ET (bien excluido)"}');
  -- Ventas: fundamentos y soportes (B1).
  perform public.fn_iva_clasificar_linea(374, 'invoice_items',
    (select it.id from public.invoice_items it where it.invoice_sales_id = (select v::uuid from ctx where k = 'fv1') and it.description = 'Bien excluido'),
    '{"tratamiento":"excluida","tarifa":0,"tipo_operacion":"bienes","fundamento":"Art. 424 ET (bien excluido)"}');
  perform public.fn_iva_clasificar_linea(374, 'invoice_items',
    (select it.id from public.invoice_items it where it.invoice_sales_id = (select v::uuid from ctx where k = 'fvx')),
    '{"tratamiento":"exenta","tarifa":0,"tipo_operacion":"exportacion_bienes","fundamento":"Art. 481 lit. a) ET"}');
  perform public.fn_iva_clasificar_linea(374, 'invoice_items',
    (select it.id from public.invoice_items it where it.invoice_sales_id = (select v::uuid from ctx where k = 'fvx2')),
    '{"tratamiento":"exenta","tarifa":0,"tipo_operacion":"exportacion_bienes","fundamento":"Art. 481 lit. a) ET","soporte_tipo":"declaracion_exportacion","soporte_numero":"DEX-PRUEBA-0001","soporte_fecha":"2026-11-06"}');
  perform public.fn_iva_clasificar_linea(374, 'invoice_items',
    (select it.id from public.invoice_items it where it.invoice_sales_id = (select v::uuid from ctx where k = 'fvn') and it.description = 'Exenta nacional'),
    '{"tratamiento":"exenta","tarifa":0,"tipo_operacion":"bienes","fundamento":"Art. 477 ET"}');
  perform public.fn_iva_clasificar_linea(374, 'invoice_items',
    (select it.id from public.invoice_items it where it.invoice_sales_id = (select v::uuid from ctx where k = 'fvn') and it.description = 'Ingreso no gravado'),
    '{"tratamiento":"no_sujeta","tarifa":0,"tipo_operacion":"servicios","fundamento":"Ingreso no constitutivo de venta (no sujeto)"}');
  perform public.fn_iva_clasificar_linea(374, 'invoice_items',
    (select it.id from public.invoice_items it where it.invoice_sales_id = (select v::uuid from ctx where k = 'nd')),
    '{"tratamiento":"gravada","tarifa":19,"tipo_operacion":"bienes"}');

  -- Validaciones.
  v_err := null;
  begin perform public.fn_iva_clasificar_linea(374, 'invoice_items',
          (select it.id from public.invoice_items it where it.support_document_id = (select v::uuid from ctx where k = 'ds')),
          '{"tratamiento":"gravada","tarifa":19,"tipo_operacion":"servicios","descontable":"descontable","descontable_motivo":"marca manual"}');
  exception when others then v_err := sqlerrm; end;
  insert into r values (default, 'V', 'Documento soporte marcado «descontable» a mano (corrección c)', 'rechaza: SOPORTE_NO_DESCONTABLE', coalesce(v_err, 'NO RECHAZÓ'), v_err = 'SOPORTE_NO_DESCONTABLE');
  perform public.fn_iva_clasificar_linea(374, 'invoice_items',
    (select it.id from public.invoice_items it where it.support_document_id = (select v::uuid from ctx where k = 'ds')),
    '{"tratamiento":"gravada","tarifa":19,"tipo_operacion":"servicios"}');
  v_err := null;
  begin perform public.fn_iva_clasificar_linea(374, 'invoice_items',
          (select it.id from public.invoice_items it where it.invoice_sales_id = (select v::uuid from ctx where k = 'fvx')),
          '{"tratamiento":"gravada","tarifa":19,"tipo_operacion":"exportacion_bienes"}');
  exception when others then v_err := sqlerrm; end;
  insert into r values (default, 'V', 'Exportación clasificada «gravada»', 'rechaza: EXPORTACION_DEBE_SER_EXENTA', coalesce(v_err, 'NO RECHAZÓ'), v_err = 'EXPORTACION_DEBE_SER_EXENTA');
  v_err := null;
  begin perform public.fn_iva_clasificar_linea(374, 'invoice_items',
          (select it.id from public.invoice_items it where it.invoice_sales_id = (select v::uuid from ctx where k = 'fv1') limit 1),
          '{"tratamiento":"gravada","tarifa":19,"tipo_operacion":"bienes","descontable":"descontable","descontable_motivo":"x"}');
  exception when others then v_err := sqlerrm; end;
  insert into r values (default, 'V', 'Descontable en una línea de VENTA', 'rechaza: DESCONTABLE_SOLO_COMPRAS', coalesce(v_err, 'NO RECHAZÓ'), v_err = 'DESCONTABLE_SOLO_COMPRAS');
  v_err := null;
  begin perform public.fn_iva_clasificar_linea(374, 'invoice_items',
          (select it.id from public.invoice_items it where it.invoice_purchase_id = (select v::uuid from ctx where k = 'fcnd') and it.unit_price = 50000),
          '{"tratamiento":"gravada","tarifa":19,"tipo_operacion":"bienes","descontable":"no_descontable"}');
  exception when others then v_err := sqlerrm; end;
  insert into r values (default, 'V', 'No descontable sin motivo', 'rechaza: MOTIVO_REQUERIDO', coalesce(v_err, 'NO RECHAZÓ'), v_err = 'MOTIVO_REQUERIDO');

  -- Naturalezas con soporte (P4 · B4 · B6).
  perform public.fn_iva_naturaleza_asiento_guardar(374, (select v::int from ctx where k = 'je_ncc1'), jsonb_build_object(
    'naturaleza', 'devolucion_compra', 'soporte_tipo', 'nota_credito_proveedor', 'soporte', 'NC electrónica del proveedor NC-PRUEBA-1', 'soporte_fecha', '2026-11-06',
    'invoice_purchase_id', (select v from ctx where k = 'fcb'), 'base', 100000, 'iva', 19000,
    'lineas', jsonb_build_array(jsonb_build_object('invoice_item_id',
       (select it.id from public.invoice_items it where it.invoice_purchase_id = (select v::uuid from ctx where k = 'fcb') and it.description = 'Bien 19'),
       'base', 100000, 'iva', 19000))));
  perform public.fn_iva_naturaleza_asiento_guardar(374, (select v::int from ctx where k = 'je_ncc2'), jsonb_build_object(
    'naturaleza', 'devolucion_compra', 'soporte_tipo', 'nota_credito_proveedor', 'soporte', 'NC electrónica del proveedor NC-PRUEBA-2', 'soporte_fecha', '2026-11-06',
    'invoice_purchase_id', (select v from ctx where k = 'fcnd'), 'base', 10000, 'iva', 1900,
    'lineas', jsonb_build_array(jsonb_build_object('invoice_item_id',
       (select it.id from public.invoice_items it where it.invoice_purchase_id = (select v::uuid from ctx where k = 'fcnd') and it.unit_price = 100000),
       'base', 10000, 'iva', 1900))));
  v_err := null;
  begin perform public.fn_iva_naturaleza_asiento_guardar(374, (select v::int from ctx where k = 'je_ncc3'), jsonb_build_object(
    'naturaleza', 'devolucion_compra', 'soporte_tipo', 'nota_credito_proveedor', 'soporte', 'NC-PRUEBA-3', 'soporte_fecha', '2026-11-06',
    'invoice_purchase_id', (select v from ctx where k = 'fcb'), 'base', 5000, 'iva', 950));
  exception when others then v_err := sqlerrm; end;
  insert into r values (default, 'V', 'Devolución de compra sin líneas (B4: asiento + naturaleza no basta)', 'rechaza: DEVOLUCION_INCOMPLETA', coalesce(v_err, 'NO RECHAZÓ'), v_err = 'DEVOLUCION_INCOMPLETA');
  v_err := null;
  begin perform public.fn_iva_naturaleza_asiento_guardar(374, (select v::int from ctx where k = 'je_pago'), '{"naturaleza":"pago_dian"}');
  exception when others then v_err := sqlerrm; end;
  insert into r values (default, 'V', 'Pago a la DIAN sin soporte', 'rechaza: SOPORTE_REQUERIDO', coalesce(v_err, 'NO RECHAZÓ'), v_err = 'SOPORTE_REQUERIDO');
  v_err := null;
  begin perform public.fn_iva_naturaleza_asiento_guardar(374, (select v::int from ctx where k = 'je_aj'),
          '{"naturaleza":"correccion_error","soporte":"Acta 1","soporte_fecha":"2026-11-07"}');
  exception when others then v_err := sqlerrm; end;
  insert into r values (default, 'V', 'Corrección de error sobre un asiento que no es una reversa', 'rechaza: CORRECCION_SOLO_REVERSAS', coalesce(v_err, 'NO RECHAZÓ'), v_err = 'CORRECCION_SOLO_REVERSAS');
  perform public.fn_iva_naturaleza_asiento_guardar(374, (select v::int from ctx where k = 'je_pago2'),
    '{"naturaleza":"pago_dian","soporte_tipo":"recibo_pago_dian","soporte":"Recibo 490 PRUEBA-0002","soporte_fecha":"2026-11-07"}');
  perform public.fn_iva_naturaleza_asiento_guardar(374, (select v::int from ctx where k = 'je_pos4_rev'),
    '{"naturaleza":"correccion_error","soporte_tipo":"comprobante_interno","soporte":"Acta: venta digitada dos veces, la operación no existió","soporte_fecha":"2026-11-07"}');
  perform public.fn_iva_naturaleza_asiento_guardar(374, (select v::int from ctx where k = 'je_pos5_rev'),
    '{"naturaleza":"correccion_error","soporte_tipo":"comprobante_interno","soporte":"Acta: venta de prueba registrada por error","soporte_fecha":"2026-11-07","doc_electronico_resolucion":"constancia","doc_electronico_referencia":"CONSTANCIA-PRUEBA-0005","doc_electronico_fecha":"2026-11-07","corrige_declaracion_anterior":true,"expediente_explicacion":"Venta de prueba registrada por error en la caja: no hubo cliente, mercancía ni dinero.","factura_referencia":"POS5","estado_electronico":"nunca_transmitida","contingencia_verificada":true,"contingencia_nota":"Sin documentos de contingencia ese día","entrega_prestacion":"no_hubo","entrega_soporte":"Kárdex sin salida de mercancía","cobro":"no_hubo","cobro_soporte":"Arqueo de caja sin el recaudo","contingencia_soporte_tipo":"sin_soporte_contingencia","consulta_cufe_resultado":"sin_resultado","consulta_cufe_soporte":"Consulta del CUFE en el catálogo de la DIAN, sin resultado"}'::jsonb
    || jsonb_build_object('consulta_cufe_en', now()));
  -- Ronda 4: el expediente completo no retira la venta; la decisión explícita de tratamiento y período sí.
  perform public.fn_iva_correccion_error_decidir(374, (select v::int from ctx where k = 'je_pos5_rev'),
    '{"tratamiento":"retirar_venta","periodo_desde":"2026-11-01","periodo_hasta":"2026-12-31","fundamento":"La operación no existió: expediente completo y sin documento válido"}');
  v_err := null;
  begin perform public.fn_iva_naturaleza_asiento_guardar(374, (select v::int from ctx where k = 'je_pos2_rev'),
          '{"naturaleza":"correccion_error","soporte":"Acta 2","soporte_fecha":"2026-11-07"}');
  exception when others then v_err := sqlerrm; end;
  insert into r values (default, 'V', 'Corrección de error sin el tipo de soporte que acredita el error (ronda 3)', 'rechaza: SOPORTE_REQUERIDO', coalesce(v_err, 'NO RECHAZÓ'), v_err = 'SOPORTE_REQUERIDO');
  v_err := null;
  begin perform public.fn_iva_naturaleza_asiento_guardar(374, (select v::int from ctx where k = 'je_pos2_rev'),
          '{"naturaleza":"correccion_error","soporte_tipo":"otro","soporte":"Acta 2","soporte_fecha":"2026-11-07","doc_electronico_resolucion":"borrada"}');
  exception when others then v_err := sqlerrm; end;
  insert into r values (default, 'V', 'Corrección de error con una resolución del documento electrónico que no existe', 'rechaza: RESOLUCION_INVALIDA', coalesce(v_err, 'NO RECHAZÓ'), v_err = 'RESOLUCION_INVALIDA');
  perform public.fn_tributario_iva_declaracion_guardar(374, '2026-10-01', '2026-10-31', '{"numero_formulario":"PRUEBA-300-OCT","presentada_en":"2026-11-05"}');

  v_l := public.fn_iva_lineas_documento(374, 'venta_pos', (select v::uuid from ctx where k = 'pos1'));
  insert into r values (default, 'L', 'Líneas de POS1 (lectura del panel)', '1 línea · gravada 19 · soporte_doc false',
    format('%s línea · %s %s · soporte_doc %s', jsonb_array_length(v_l -> 'lineas'), v_l -> 'lineas' -> 0 -> 'clasificacion' ->> 'tratamiento',
           round((v_l -> 'lineas' -> 0 -> 'clasificacion' ->> 'tarifa')::numeric), v_l -> 'lineas' -> 0 ->> 'soporte_doc'),
    jsonb_array_length(v_l -> 'lineas') = 1 and v_l -> 'lineas' -> 0 -> 'clasificacion' ->> 'tratamiento' = 'gravada');
end
$$;
set constraints all immediate;
reset role;

-- FCAC: asiento de compra tal como lo arma 20261108152000 (B5) con la evaluación previa: el IVA no descontable al costo.
set constraints all deferred;
with e as (insert into public.journal_entries (organization_id, branch_id, entry_date, memo, posted, source, source_id, fact_key)
           values (374, 585, now(), 'Compra PRUEBA-IVA-FCAC', true, 'invoice_purchase', (select v from ctx where k = 'fcac'), 'accrual:purchase:' || (select v from ctx where k = 'fcac'))
           returning id)
insert into ctx select 'je_fcac', id::text from e;
insert into public.journal_lines (journal_entry_id, account_code, description, debit, credit)
select v::int, '14350101', 'Compra (costo + IVA no descontable 19.000)', 169000, 0 from ctx where k = 'je_fcac'
union all select v::int, '24081001', 'IVA descontable 19 %', 9500, 0 from ctx where k = 'je_fcac'
union all select v::int, '22050501', 'Proveedor', 0, 178500 from ctx where k = 'je_fcac';
set constraints all immediate;

insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'S', 'Línea de la nota crédito hereda la clasificación de la línea que acredita', 'gravada / 19 / bienes / heredada',
       concat_ws(' / ', it.iva_tratamiento, round(it.iva_tarifa)::text, it.iva_tipo_operacion, it.iva_clasificacion_origen),
       concat_ws(' / ', it.iva_tratamiento, round(it.iva_tarifa)::text, it.iva_tipo_operacion, it.iva_clasificacion_origen) = 'gravada / 19 / bienes / heredada'
  from public.invoice_items it where it.invoice_sales_id = (select v::uuid from ctx where k = 'nc');

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
      (28, 650000, 'FV1 300.000 + POS1 + POS2 (revertida sin NC) + POS4 (corrección INCOMPLETA: sigue) + ND 50.000; POS5 corregida NO'),
      (59, 123500, '57.000 + 19.000 + 19.000 + 19.000 + 9.500'),
      (30, 300000, 'FVX2 exportación con soporte'), (31, 0, 'sin exportaciones de servicios'),
      (35, 70000, 'FVN exenta nacional con fundamento'), (39, 50000, 'FV1 excluida con fundamento'), (40, 20000, 'FVN no sujeta'),
      (42, 200000, 'NC de la factura de octubre'), (79, 38000, 'NC'), (47, 0, 'sin importaciones'),
      (50, 200000, 'FCB bien 5 %'), (71, 10000, 'FCB'),
      (51, 1500000, 'FCB 1.000.000 + FCND 150.000 + FCP 200.000 + FCAC 150.000: las bases de compras gravadas no dependen del descontable'),
      (72, 222300, 'FCB 190.000 + FCP 60 % de 38.000 = 22.800 + FCAC 9.500 (su IVA no descontable se fue al costo)'),
      (52, 300300, 'FCS servicio 5 %'), (74, 15015, 'FCS'), (53, 500000, 'FCS servicio 19 % (el documento soporte ya no entra)'), (75, 95000, 'FCS'),
      (54, 40000, 'FCX compra excluida con fundamento'),
      (56, 110000, 'NCC1 100.000 + NCC2 10.000: la base de la devolución va a 56 aunque no haya IVA recuperable'),
      (66, 19000, 'Solo NCC1 (IVA de FCB evaluado descontable)')) x(casilla, esperado, nota) loop
    select (c ->> 'valor')::numeric into v_obt from jsonb_array_elements(v_b -> 'casillas') c where (c ->> 'casilla')::int = v_c.casilla;
    insert into r values (default, 'B', 'Casilla ' || v_c.casilla, v_c.esperado || ' · ' || v_c.nota, coalesce(round(v_obt)::text, 'NO ESTÁ'), v_obt = v_c.esperado);
  end loop;

  select string_agg(format('%s %s→%s (dif %s)', c ->> 'casilla', round((c ->> 'valor')::numeric), round((c ->> 'valor_formulario')::numeric),
                           round((c ->> 'diferencia_redondeo')::numeric)), ' · ' order by (c ->> 'casilla')::int)
    into v_txt from jsonb_array_elements(v_b -> 'casillas') c where (c ->> 'casilla')::int in (59, 72, 74);
  insert into r values (default, 'B', 'Redondeo a miles del formulario', '59 123500→124000 (dif 500) · 72 222300→222000 (dif -300) · 74 15015→15000 (dif -15)', v_txt,
    v_txt = '59 123500→124000 (dif 500) · 72 222300→222000 (dif -300) · 74 15015→15000 (dif -15)');

  insert into r (escenario, verificacion, esperado, obtenido, ok)
  select 'B', 'Señales: NC «entre períodos» (79) y ND «corrige otro período» (59)', 'NC true · ND true',
         format('NC %s · ND %s',
           (select bool_or((x ->> 'entre_periodos')::boolean) from jsonb_array_elements(v_b -> 'casillas') o, jsonb_array_elements(o -> 'origenes') x where (o ->> 'casilla')::int = 79),
           (select bool_or((x ->> 'corrige_otro_periodo')::boolean) from jsonb_array_elements(v_b -> 'casillas') o, jsonb_array_elements(o -> 'origenes') x where (o ->> 'casilla')::int = 59)),
         (select bool_or((x ->> 'entre_periodos')::boolean) from jsonb_array_elements(v_b -> 'casillas') o, jsonb_array_elements(o -> 'origenes') x where (o ->> 'casilla')::int = 79)
         and (select bool_or((x ->> 'corrige_otro_periodo')::boolean) from jsonb_array_elements(v_b -> 'casillas') o, jsonb_array_elements(o -> 'origenes') x where (o ->> 'casilla')::int = 59);

  for v_c in select * from (values
      ('generado', 'exportacion_sin_soporte', 400000::numeric, 0::numeric, 'FVX: exenta + texto no prueba la exportación'),
      ('generado', 'sin_clasificar', 30000, 0, 'POS3'),
      ('descontable', 'no_descontable_en_2408', 0, 34200, 'FCND 19.000 + resto de FCP 15.200 (su base ya está en 51)'),
      ('descontable', 'descontable_por_evaluar', 0, 9500, 'FCND línea sin evaluar (base en 51)'),
      ('descontable', 'soporte_supuesto_especial', 100000, 19000, 'Documento soporte con IVA'),
      ('otros', 'devolucion_iva_no_descontado', 0, 1900, 'NCC2: IVA de una línea no descontable')) x(lado, motivo, base, iva, nota) loop
    select format('base %s · IVA %s', round((p ->> 'base')::numeric), round((p ->> 'iva')::numeric)) into v_txt
      from jsonb_array_elements(v_b -> 'pendientes') p where p ->> 'lado' = v_c.lado and p ->> 'motivo' = v_c.motivo;
    insert into r values (default, 'B', 'Pendiente ' || v_c.lado || ' / ' || v_c.motivo, format('base %s · IVA %s · %s', v_c.base, v_c.iva, v_c.nota),
      coalesce(v_txt, 'NO ESTÁ'), v_txt = format('base %s · IVA %s', v_c.base, v_c.iva));
  end loop;
  insert into r (escenario, verificacion, esperado, obtenido, ok)
  select 'B', 'Grupos de pendientes por línea/documento', '6', count(*)::text, count(*) = 6 from jsonb_array_elements(v_b -> 'pendientes');
  insert into r values (default, 'B', 'POS4: motivo del pendiente de la reversa', 'correccion_incompleta',
     coalesce((select o ->> 'motivo' from jsonb_array_elements(v_b -> 'otros_movimientos') o where (o ->> 'asiento') = (select v from ctx where k = 'je_pos4_rev')), 'NO ESTÁ'),
     (select o ->> 'motivo' from jsonb_array_elements(v_b -> 'otros_movimientos') o where (o ->> 'asiento') = (select v from ctx where k = 'je_pos4_rev')) = 'correccion_incompleta');
  insert into r values (default, 'B', 'Alerta: corrección marcada «corrige una declaración anterior»', '1 · la reversa de POS5 · completa',
     format('%s · %s · %s', jsonb_array_length(v_b -> 'alertas' -> 'correcciones_declaracion_anterior'),
            coalesce((select c.v from ctx c where c.k = 'doc_' || (v_b -> 'alertas' -> 'correcciones_declaracion_anterior' -> 0 ->> 'asiento')), '—'),
            case when (v_b -> 'alertas' -> 'correcciones_declaracion_anterior' -> 0 ->> 'completa')::boolean then 'completa' else 'incompleta' end),
     jsonb_array_length(v_b -> 'alertas' -> 'correcciones_declaracion_anterior') = 1
       and (v_b -> 'alertas' -> 'correcciones_declaracion_anterior' -> 0 ->> 'asiento') = (select v from ctx where k = 'je_pos5_rev'));
  insert into r values (default, 'B', 'B5: FCAC sin pendientes; IVA no descontable llevado al costo informado', 'FCAC sin pendiente · al costo 19000',
     format('FCAC %s · al costo %s',
            case when exists (select 1 from jsonb_array_elements(v_b -> 'pendientes') p, jsonb_array_elements(p -> 'origenes') x
                               where x ->> 'documento_id' = (select v from ctx where k = 'fcac')) then 'CON pendiente' else 'sin pendiente' end,
            round((v_b -> 'resumen' ->> 'iva_no_descontable_al_costo')::numeric)),
     not exists (select 1 from jsonb_array_elements(v_b -> 'pendientes') p, jsonb_array_elements(p -> 'origenes') x
                  where x ->> 'documento_id' = (select v from ctx where k = 'fcac'))
       and (v_b -> 'resumen' ->> 'iva_no_descontable_al_costo')::numeric = 19000);

  for v_c in select * from (values
      ('je_pago', 'sin_registro / sugerida pago_dian / pendiente / -50000', 'Señal, no clasificación (ronda 2)'),
      ('je_tras', 'sin_registro / sugerida traslado_auxiliares / pendiente / 0', 'Suma cero en 2408: señal, no clasificación'),
      ('je_pago2', 'pago_dian / sugerida — / no_afecta / -30000', 'Registrado con su recibo'),
      ('je_aj', 'sin_registro / sugerida — / pendiente / -10000', 'Manual sin soporte'),
      ('je_pos2_rev', 'reversa_contable / sugerida — / pendiente / -19000', 'B6: control provisional'),
      ('je_pos4_rev', 'correccion_error / sugerida — / pendiente / -19000', 'Ronda 3: corrección incompleta → la reversa pendiente y la venta en 28/59'),
      ('je_pos5', 'correccion_error / sugerida — / no_afecta / 19000', 'Expediente completo + decisión «retirar_venta»: la venta que nunca existió sale de 28/59'),
      ('je_pos5_rev', 'correccion_error / sugerida — / no_afecta / -19000', 'y su reversa también'),
      ('je_ncc1', 'devolucion_compra / sugerida — / casilla / 19000', 'B4 completa'),
      ('je_ncc2', 'devolucion_compra / sugerida — / casilla / 1900', 'B4 completa; IVA no recuperable a pendientes'),
      ('je_ncc3', 'sin_registro / sugerida — / pendiente / 950', 'Registro rechazado: queda sin soporte')) x(k, esperado, nota) loop
    select format('%s / sugerida %s / %s / %s', o ->> 'naturaleza', coalesce(o ->> 'sugerida', '—'), o ->> 'destino', round((o ->> 'valor')::numeric)) into v_txt
      from jsonb_array_elements(v_b -> 'otros_movimientos') o where (o ->> 'asiento') = (select v from ctx where k = v_c.k);
    insert into r values (default, 'B', 'Otro movimiento ' || upper(replace(v_c.k, 'je_', '')), v_c.esperado || ' · ' || v_c.nota, coalesce(v_txt, 'NO ESTÁ'), v_txt = v_c.esperado);
  end loop;

  insert into r values (default, 'B', 'Resumen preliminar (no es saldo a pagar)',
     'generado 147500 · descontable 380315 · formulario 148000 / 380000',
     format('generado %s · descontable %s · formulario %s / %s', round((v_b -> 'resumen' ->> 'iva_generado')::numeric), round((v_b -> 'resumen' ->> 'iva_descontable')::numeric),
            v_b -> 'resumen' ->> 'iva_generado_formulario', v_b -> 'resumen' ->> 'iva_descontable_formulario'),
     (v_b -> 'resumen' ->> 'iva_generado')::numeric = 147500 and (v_b -> 'resumen' ->> 'iva_descontable')::numeric = 380315
       and (v_b -> 'resumen' ->> 'iva_generado_formulario')::numeric = 148000 and (v_b -> 'resumen' ->> 'iva_descontable_formulario')::numeric = 380000);
  insert into r values (default, 'B', 'Estado del borrador', 'conciliado · aprobado_fiscalmente false · liquidacion_completa false',
     format('%s · aprobado_fiscalmente %s · liquidacion_completa %s', v_b ->> 'estado', v_b ->> 'aprobado_fiscalmente', v_b ->> 'liquidacion_completa'),
     v_b ->> 'estado' = 'conciliado' and not (v_b ->> 'aprobado_fiscalmente')::boolean and not (v_b ->> 'liquidacion_completa')::boolean);

  select round(sum(l.credit - l.debit), 2) into v_libro
    from public.journal_entries je join public.journal_lines l on l.journal_entry_id = je.id
   where je.organization_id = 374 and je.posted and l.account_code like '2408%'
     and je.entry_date >= ('2026-11-01'::timestamp at time zone 'America/Bogota')
     and je.entry_date < ('2026-12-01'::timestamp at time zone 'America/Bogota');
  insert into r values (default, 'R', 'Conciliación: neto 2408 (SELECT directo) = casillas + pendientes + otros + redondeo', 'libro -420665 · casillas -232815 · pendientes -157850 · otros -30000 · diferencia 0',
     format('libro %s · casillas %s · pendientes %s · otros %s · redondeo %s · diferencia %s', v_libro,
            v_b -> 'conciliacion' ->> 'casillas', v_b -> 'conciliacion' ->> 'pendientes', v_b -> 'conciliacion' ->> 'otros_no_afectan_o_por_diligenciar',
            v_b -> 'conciliacion' ->> 'redondeo_lineas_libros', v_b -> 'conciliacion' ->> 'diferencia'),
     v_libro = -420665 and (v_b -> 'conciliacion' ->> 'libro_2408')::numeric = v_libro and abs((v_b -> 'conciliacion' ->> 'diferencia')::numeric) <= 1
       and (v_b -> 'conciliacion' ->> 'casillas')::numeric = -232815 and (v_b -> 'conciliacion' ->> 'pendientes')::numeric = -157850
       and (v_b -> 'conciliacion' ->> 'otros_no_afectan_o_por_diligenciar')::numeric = -30000);

  -- Corrección (b): la compra de octubre grabada hoy queda en octubre; noviembre no la incluye.
  v_o := public.fn_tributario_borrador_iva_300(374, '2026-10-01', '2026-10-31');
  insert into ctx values ('borrador_oct', v_o::text);
  insert into r values (default, 'D', 'Octubre: declarado; FVOCT 28/59; FCOCT 51/72 en su período de contabilización',
     'declarado PRUEBA-300-OCT · 28 200000 · 59 38000 · 51 100000 · 72 19000',
     format('declarado %s · 28 %s · 59 %s · 51 %s · 72 %s', v_o -> 'periodo_declarado' ->> 'numero_formulario',
            (select round((c ->> 'valor')::numeric) from jsonb_array_elements(v_o -> 'casillas') c where (c ->> 'casilla')::int = 28),
            (select round((c ->> 'valor')::numeric) from jsonb_array_elements(v_o -> 'casillas') c where (c ->> 'casilla')::int = 59),
            (select round((c ->> 'valor')::numeric) from jsonb_array_elements(v_o -> 'casillas') c where (c ->> 'casilla')::int = 51),
            (select round((c ->> 'valor')::numeric) from jsonb_array_elements(v_o -> 'casillas') c where (c ->> 'casilla')::int = 72)),
     v_o -> 'periodo_declarado' ->> 'numero_formulario' = 'PRUEBA-300-OCT'
       and (select (c ->> 'valor')::numeric from jsonb_array_elements(v_o -> 'casillas') c where (c ->> 'casilla')::int = 28) = 200000
       and (select (c ->> 'valor')::numeric from jsonb_array_elements(v_o -> 'casillas') c where (c ->> 'casilla')::int = 51) = 100000
       and (select (c ->> 'valor')::numeric from jsonb_array_elements(v_o -> 'casillas') c where (c ->> 'casilla')::int = 72) = 19000);
  insert into r values (default, 'D', 'Asientos de octubre grabados después de declarar octubre', 'FVOCT y FCOCT (2)',
     (select string_agg(coalesce((select c.v from ctx c where c.k = 'doc_' || (a ->> 'asiento')), a ->> 'asiento'), ', ' order by a ->> 'asiento')
        from jsonb_array_elements(v_b -> 'alertas' -> 'grabados_despues_de_declarar') a),
     jsonb_array_length(v_b -> 'alertas' -> 'grabados_despues_de_declarar') = 2);
  insert into r values (default, 'D', 'Alertas de noviembre: NC entre períodos, ND de otro período', '1 · 1',
     format('%s · %s', v_b -> 'alertas' ->> 'documentos_entre_periodos', v_b -> 'alertas' ->> 'notas_debito_otro_periodo'),
     (v_b -> 'alertas' ->> 'documentos_entre_periodos')::int = 1 and (v_b -> 'alertas' ->> 'notas_debito_otro_periodo')::int = 1);

  insert into r values (default, 'P', 'La función es de solo lectura', 'STABLE',
     (select case p.provolatile when 's' then 'STABLE' else 'NO' end from pg_proc p where p.oid = 'public.fn_tributario_borrador_iva_300(integer,date,date)'::regprocedure),
     (select p.provolatile = 's' from pg_proc p where p.oid = 'public.fn_tributario_borrador_iva_300(integer,date,date)'::regprocedure));
  v_err := null;
  begin perform public.fn_tributario_borrador_iva_300(374, '2026-11-30', '2026-11-01');
  exception when others then v_err := sqlerrm; end;
  insert into r values (default, 'P', 'Periodo con «hasta» antes de «desde»', 'rechaza: PERIODO_INVALIDO', coalesce(v_err, 'NO RECHAZÓ'), v_err = 'PERIODO_INVALIDO');
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

-- ── Permisos ──
update public.organization_members set is_super_admin = false, role_id = 4
 where organization_id = 374 and user_id = 'bb11d6d2-f647-49f7-9b29-aa4c4438abf1';
select set_config('request.jwt.claims', '{"sub":"bb11d6d2-f647-49f7-9b29-aa4c4438abf1","role":"authenticated"}', true);
set local role authenticated;
do $$
declare v_err text;
begin
  v_err := null;
  begin perform public.fn_tributario_borrador_iva_300(374, '2026-11-01', '2026-11-30'); exception when others then v_err := sqlerrm; end;
  insert into r values (default, 'P', 'Borrador: rol Empleado (sin finance.view)', 'rechaza: SIN_PERMISO', coalesce(v_err, 'NO RECHAZÓ'), v_err = 'SIN_PERMISO');
  v_err := null;
  begin perform public.fn_iva_naturaleza_asiento_guardar(374, (select v::int from ctx where k = 'je_aj'), '{"naturaleza":"otro","soporte":"x","soporte_fecha":"2026-11-07"}');
  exception when others then v_err := sqlerrm; end;
  insert into r values (default, 'P', 'Naturaleza: rol Empleado (sin finance.approve)', 'rechaza: SIN_PERMISO', coalesce(v_err, 'NO RECHAZÓ'), v_err = 'SIN_PERMISO');
end
$$;
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
do $$
declare v_err text;
begin
  v_err := null;
  begin perform public.fn_tributario_borrador_iva_300(374, '2026-11-01', '2026-11-30'); exception when others then v_err := sqlerrm; end;
  insert into r values (default, 'P', 'No miembro de la 374', 'rechaza: Acceso denegado a la organización', coalesce(v_err, 'NO RECHAZÓ'), v_err = 'Acceso denegado a la organización');
end
$$;
reset role;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
do $$
declare v_err text;
begin
  v_err := null;
  begin perform public.fn_tributario_borrador_iva_300(374, '2026-11-01', '2026-11-30'); exception when others then v_err := sqlerrm; end;
  insert into r values (default, 'P', 'anon: borrador', 'rechaza: permiso denegado', coalesce(v_err, 'NO RECHAZÓ'), v_err like 'permission denied%');
end
$$;

reset role;
select n, escenario, verificacion, esperado, obtenido, ok from r order by n;

rollback;
