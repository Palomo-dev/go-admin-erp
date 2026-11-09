-- Pruebas de escenario · H1: subcuenta de IVA por tarifa y lado
-- Ronda 4 (2026-11-09): reejecutada con el archivo EXACTO de H1 (sin cambios desde la ronda 3). Tres esperados de la
-- ronda 1 se actualizaron a las reglas A1/A2 de la ronda 2 (no se asume el 19 %; una nota crédito parcial sobre una
-- factura de varias tarifas no se reparte por la mezcla): NCP queda SIN asiento y con su pendiente visible, y
-- fn_cuenta_iva sin tarifa devuelve NULL.
-- Fecha: 2026-11-07 · Proyecto taqjemqjtumhwptchcxk · Organización de pruebas 374 (sede 585). NO DEJA DATOS (begin … rollback).
--
-- Requiere la migración supabase/migrations/20261108140000_iva_subcuenta_por_tarifa_y_lado.sql. Mientras no esté
-- aplicada, la prueba en seco se corre pegando el cuerpo de la migración donde dice «MIGRACIÓN» (dentro de la misma
-- transacción, que termina en rollback): así se obtuvo 07_iva_subcuenta_por_tarifa.resultado.txt.
--
-- Documentos creados DENTRO de la transacción, por las vías normales (cada uno genera su asiento con sus disparadores
-- o con la función que usa la aplicación):
--   FV19  factura de venta: 2 × 150.000 al 19 %                    → C 24080501 IVA generado 19 %   57.000
--   FV5   factura de venta: 1 × 100.000 al 5 %                     → C 24080502 IVA generado 5 %     5.000
--   POS19 venta POS: 119.000 con IVA 19.000 y tarifa 0 en la línea  → C 24080501                     19.000 (tarifa deducida)
--   POS5  venta POS: 105.000 con IVA 5.000 y tarifa 0 en la línea   → C 24080502                      5.000 (tarifa deducida)
--   FC19  compra: 1.000.000 al 19 %                                → D 24081001 IVA descontable 19 % 190.000
--   FC5   compra: 200.000 al 5 %                                   → D 24081002 IVA descontable 5 %   10.000
--   FCMX  compra: 1.000.000 al 19 % + 200.000 al 5 %               → D 24081001 190.000 + D 24081002 10.000
--   NC5   nota crédito total de FV5 (fn_nota_credito_emitir, como un usuario miembro con finance.void)
--                                                                  → D 24080502 5.000
--   NCP   nota crédito PARCIAL de FVMX2 (19 % + 5 %), solo la línea al 5 % (fn_nota_credito_emitir)
--                                                                  → D 24080502 5.000
--   FVMX  factura de venta: 100.000 al 19 % + 100.000 al 5 %       → C 24080501 19.000 + C 24080502 5.000
--   NCMX  nota crédito de devolución de FVMX (fn_nc_asiento_devolucion, el camino del POS/devoluciones)
--                                                                  → D 24080501 19.000 + D 24080502 5.000
--   DS    documento soporte: 300.000 al 19 % + 100.000 al 5 %      → D 24081001 57.000 + D 24081002 5.000
--         (precondición SOLO dentro de la transacción: en la org 374 la clave «inventario» de Configuración contable
--          apunta al título 1435 y el asiento por líneas del documento soporte se rechaza por eso, antes de llegar al
--          IVA; se apunta a 14350101, el auxiliar que ya usan las compras. Hallazgo aparte, no es de H1.)
--   FC16  compra al 16 % (tarifa sin subcuenta en el plan)         → SIN asiento; pendiente «cuenta_no_configurada»
-- Y el cuadre de todos los asientos (control de la base, diferido, adelantado con SET CONSTRAINTS ALL IMMEDIATE).

begin;

create temp table r (n serial primary key, escenario text, verificacion text, esperado text, obtenido text, ok boolean);
create temp table ctx (k text primary key, v text);
grant all on r, ctx to authenticated, anon;
grant usage on sequence r_n_seq to authenticated, anon;

-- ═══ MIGRACIÓN (solo en la prueba en seco, mientras no esté aplicada) ═══
-- En la prueba en seco, ANTES de pegar la migración se guardó lo que devolvía fn_cuenta_iva (fila «antes»):
--   insert into ctx select 'antes_compra_374', public.fn_cuenta_iva(374, 585, 'invoice_purchase', '24081001');
--   insert into ctx select 'antes_venta_374', public.fn_cuenta_iva(374, 585, 'sales', '24080501');

insert into ctx select 'max_je', coalesce(max(id), 0)::text from public.journal_entries where organization_id = 374;
insert into ctx select 'max_fallo', coalesce(max(id), 0)::text from public.journal_entry_failures where organization_id = 374;
with s as (insert into public.suppliers (organization_id, name, nit, supplier_type) values (374, 'Proveedor de prueba H1', '900000011', 'company') returning id)
insert into ctx select 'sup', id::text from s;
with c as (insert into public.customers (organization_id, first_name, last_name, identification_type, identification_number)
           values (374, 'Cliente', 'Prueba H1', 'CC', '1000000011') returning id)
insert into ctx select 'cli', id::text from c;

-- ── Facturas de venta ──
with f as (insert into public.invoice_sales (organization_id, branch_id, customer_id, number, status, currency, issue_date, document_type)
           values (374, 585, (select v::uuid from ctx where k = 'cli'), 'PRUEBA-H1-FV19', 'draft', 'COP', now(), 'invoice'),
                  (374, 585, (select v::uuid from ctx where k = 'cli'), 'PRUEBA-H1-FV5', 'draft', 'COP', now(), 'invoice'),
                  (374, 585, (select v::uuid from ctx where k = 'cli'), 'PRUEBA-H1-FVMX', 'draft', 'COP', now(), 'invoice'),
                  (374, 585, (select v::uuid from ctx where k = 'cli'), 'PRUEBA-H1-FVMX2', 'draft', 'COP', now(), 'invoice')
           returning id, number)
insert into ctx select lower(replace(number, 'PRUEBA-H1-', '')), id::text from f;
insert into public.invoice_items (invoice_id, invoice_type, invoice_sales_id, description, qty, unit_price, tax_rate, tax_code, total_line)
select v::uuid, 'sale', v::uuid, 'Servicio 19 %', 2, 150000, 19, 'IVA_19', 357000 from ctx where k = 'fv19' union all
select v::uuid, 'sale', v::uuid, 'Producto 5 %', 1, 100000, 5, 'IVA_5', 105000 from ctx where k = 'fv5' union all
select v::uuid, 'sale', v::uuid, 'Producto 19 %', 1, 100000, 19, 'IVA_19', 119000 from ctx where k = 'fvmx' union all
select v::uuid, 'sale', v::uuid, 'Producto 5 %', 1, 100000, 5, 'IVA_5', 105000 from ctx where k = 'fvmx' union all
select v::uuid, 'sale', v::uuid, 'Producto 19 %', 1, 100000, 19, 'IVA_19', 119000 from ctx where k = 'fvmx2' union all
select v::uuid, 'sale', v::uuid, 'Producto 5 %', 1, 100000, 5, 'IVA_5', 105000 from ctx where k = 'fvmx2';
update public.invoice_sales set status = 'issued' where id in (select v::uuid from ctx where k in ('fv19', 'fv5', 'fvmx', 'fvmx2'));

-- ── Ventas POS (la línea guarda el IVA con tarifa 0, como el POS real) ──
with s as (insert into public.sales (organization_id, branch_id, user_id, status, subtotal, tax_total, total, tax_included, sale_date, notes)
           values (374, 585, 'bb11d6d2-f647-49f7-9b29-aa4c4438abf1', 'paid', 100000, 19000, 119000, false, now(), 'POS19'),
                  (374, 585, 'bb11d6d2-f647-49f7-9b29-aa4c4438abf1', 'paid', 100000, 5000, 105000, false, now(), 'POS5')
           returning id, notes)
insert into ctx select lower(notes), id::text from s;
insert into public.sale_items (sale_id, quantity, unit_price, total, tax_amount, tax_rate)
select (select v::uuid from ctx where k = 'pos19'), 1, 119000, 119000, 19000, 0 union all
select (select v::uuid from ctx where k = 'pos5'), 1, 105000, 105000, 5000, 0;
set constraints trg_auto_journal_sale_pos immediate;

-- ── Compras ──
with f as (insert into public.invoice_purchase (organization_id, branch_id, supplier_id, number_ext, status, currency, issue_date)
           values (374, 585, (select v::int from ctx where k = 'sup'), 'PRUEBA-H1-FC19', 'draft', 'COP', now()),
                  (374, 585, (select v::int from ctx where k = 'sup'), 'PRUEBA-H1-FC5', 'draft', 'COP', now()),
                  (374, 585, (select v::int from ctx where k = 'sup'), 'PRUEBA-H1-FCMX', 'draft', 'COP', now()),
                  (374, 585, (select v::int from ctx where k = 'sup'), 'PRUEBA-H1-FC16', 'draft', 'COP', now())
           returning id, number_ext)
insert into ctx select lower(replace(number_ext, 'PRUEBA-H1-', '')), id::text from f;
insert into public.invoice_items (invoice_id, invoice_type, invoice_purchase_id, description, qty, unit_price, tax_rate, tax_code, total_line)
select v::uuid, 'purchase', v::uuid, 'Mercancía 19 %', 1, 1000000, 19, 'IVA_19', 1190000 from ctx where k = 'fc19' union all
select v::uuid, 'purchase', v::uuid, 'Mercancía 5 %', 1, 200000, 5, 'IVA_5', 210000 from ctx where k = 'fc5' union all
select v::uuid, 'purchase', v::uuid, 'Mercancía 19 %', 1, 1000000, 19, 'IVA_19', 1190000 from ctx where k = 'fcmx' union all
select v::uuid, 'purchase', v::uuid, 'Mercancía 5 %', 1, 200000, 5, 'IVA_5', 210000 from ctx where k = 'fcmx' union all
select v::uuid, 'purchase', v::uuid, 'Mercancía 16 %', 1, 100000, 16, null, 116000 from ctx where k = 'fc16';
update public.invoice_purchase set status = 'received' where id in (select v::uuid from ctx where k in ('fc19', 'fc5', 'fcmx', 'fc16'));

-- ── Nota crédito de devolución de FVMX por fn_nc_asiento_devolucion (las líneas existen antes del asiento) ──
select set_config('app.asiento_por_lineas', 'on', true);
with n as (insert into public.invoice_sales (organization_id, branch_id, customer_id, number, status, currency, issue_date,
                                             document_type, related_invoice_id, subtotal, tax_total, total)
           values (374, 585, (select v::uuid from ctx where k = 'cli'), 'PRUEBA-H1-NCMX', 'issued', 'COP', now(),
                   'credit_note', (select v::uuid from ctx where k = 'fvmx'), -200000, -24000, -224000) returning id)
insert into ctx select 'ncmx', id::text from n;
insert into public.invoice_items (invoice_id, invoice_type, invoice_sales_id, description, qty, unit_price, tax_rate, tax_code, total_line)
select v::uuid, 'sale', v::uuid, 'Devolución 19 %', 1, 100000, 19, 'IVA_19', -119000 from ctx where k = 'ncmx' union all
select v::uuid, 'sale', v::uuid, 'Devolución 5 %', 1, 100000, 5, 'IVA_5', -105000 from ctx where k = 'ncmx';
update public.invoice_sales set subtotal = -200000, tax_total = -24000, total = -224000 where id = (select v::uuid from ctx where k = 'ncmx');
select set_config('app.asiento_por_lineas', '', true);
select public.fn_nc_asiento_devolucion(374, (select v::uuid from ctx where k = 'ncmx'));

-- ── Documento soporte (la aplicación lo contabiliza por líneas) ──
update public.configuracion_contable set account_code = '14350101' where organization_id = 374 and clave = 'inventario';
with d as (insert into public.support_documents (organization_id, branch_id, supplier_id, reference_code, provider, issue_date,
                                                 subtotal, tax_total, total, currency, status, tax_included)
           values (374, 585, (select v::int from ctx where k = 'sup'), 'PRUEBA-H1-DS', '{"names":"Proveedor de prueba H1"}'::jsonb, now(),
                   400000, 62000, 462000, 'COP', 'draft', false) returning id)
insert into ctx select 'ds', id::text from d;
insert into public.invoice_items (invoice_id, invoice_type, support_document_id, description, qty, unit_price, tax_rate, tax_code, total_line)
select v::uuid, 'support_document', v::uuid, 'Servicio 19 %', 1, 300000, 19, 'IVA_19', 357000 from ctx where k = 'ds' union all
select v::uuid, 'support_document', v::uuid, 'Servicio 5 %', 1, 100000, 5, 'IVA_5', 105000 from ctx where k = 'ds';
insert into ctx select 'ds_vista', public.fn_armar_asiento_documento('documento_soporte', (select v::uuid from ctx where k = 'ds'), null)::text;
insert into ctx select 'je_ds', public.fn_asiento_documento_por_lineas((select v::uuid from ctx where k = 'ds'), 'documento_soporte', 'prueba:h1:ds')::text;

-- ── Nota crédito total de FV5, emitida como un usuario miembro (sesión simulada) ──
select set_config('request.jwt.claims', '{"sub":"bb11d6d2-f647-49f7-9b29-aa4c4438abf1","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  insert into ctx select 'nc5', (public.fn_nota_credito_emitir(
    (select v::uuid from ctx where k = 'fv5'), 'total', null, null, null, 'Devolución de prueba H1', false,
    'saldo_a_favor', null, null, 'prueba-h1-nc5') ->> 'id');
  insert into ctx select 'ncp', (public.fn_nota_credito_emitir(
    (select v::uuid from ctx where k = 'fvmx2'), 'lineas',
    (select jsonb_agg(jsonb_build_object('item_id', ii.id, 'cantidad', 1)) from public.invoice_items ii
      where ii.invoice_sales_id = (select v::uuid from ctx where k = 'fvmx2') and ii.tax_rate = 5),
    null, null, 'Devolución parcial de prueba H1', false, 'saldo_a_favor', null, null, 'prueba-h1-ncp') ->> 'id');
end $$;
reset role;

-- Los disparadores de cuadre (diferidos) se ejecutan ahora: si algún asiento no cuadra, todo falla aquí.
set constraints all immediate;

-- ═══ Verificaciones ═══
create temp view iva_doc as
select c.k as doc, je.id as asiento, l.account_code as cuenta,
       round(sum(l.debit)) as d, round(sum(l.credit)) as c
  from ctx c
  join public.journal_entries je on je.organization_id = 374 and je.source_id = c.v and je.id > (select v::int from ctx where k = 'max_je')
  join public.journal_lines l on l.journal_entry_id = je.id and l.account_code like '2408%'
 group by c.k, je.id, l.account_code;

insert into r (escenario, verificacion, esperado, obtenido, ok)
select x.doc, 'IVA del asiento por subcuenta', x.esperado, y.s, y.s = x.esperado
  from (values
    ('fv19',  '24080501 C 57000'), ('fv5',   '24080502 C 5000'), ('pos19', '24080501 C 19000'), ('pos5',  '24080502 C 5000'),
    ('fc19',  '24081001 D 190000'), ('fc5',   '24081002 D 10000'), ('fcmx',  '24081001 D 190000 + 24081002 D 10000'),
    ('fvmx',  '24080501 C 19000 + 24080502 C 5000'), ('ncmx',  '24080501 D 19000 + 24080502 D 5000'), ('nc5',   '24080502 D 5000'),
    ('fvmx2', '24080501 C 19000 + 24080502 C 5000'), ('ncp',   'SIN ASIENTO'),
    ('ds',    '24081001 D 57000 + 24081002 D 5000'), ('fc16',  'SIN ASIENTO')
  ) x(doc, esperado)
  cross join lateral (select coalesce((select string_agg(i.cuenta || case when i.d > 0 then ' D ' || i.d else ' C ' || i.c end, ' + ' order by i.cuenta)
                   from iva_doc i where i.doc = x.doc), 'SIN ASIENTO') as s) y;

insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'fc16', 'Pendiente contable de la compra al 16 %', 'cuenta_no_configurada · «Falta la subcuenta de IVA descontable al 16 %…»',
       coalesce(string_agg(f.reason || ' · ' || left(f.detail, 160), ' | '), 'SIN PENDIENTE'),
       count(*) = 1 and bool_and(f.reason = 'cuenta_no_configurada' and f.detail like 'Falta la subcuenta de IVA descontable al 16 %%')
  from public.journal_entry_failures f
 where f.organization_id = 374 and f.id > (select v::int from ctx where k = 'max_fallo')
   and f.source_id = (select v from ctx where k = 'fc16');

insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'otros', 'Pendientes contables nuevos de los demás documentos', 'ninguno',
       coalesce(string_agg(f.source || ' ' || f.reason || ' ' || left(coalesce(f.detail, ''), 100), ' | '), 'ninguno'), count(*) = 0
  from public.journal_entry_failures f
 where f.organization_id = 374 and f.id > (select v::int from ctx where k = 'max_fallo')
   and f.source_id is distinct from (select v from ctx where k = 'fc16')
   and f.source_id is distinct from (select v from ctx where k = 'ncp');

-- Ronda 2 (A2): la nota crédito parcial sobre FVMX2 (19 % + 5 %) se arma al insertar su cabecera, antes de sus líneas:
-- no se reparte por la mezcla de la factura; queda pendiente visible hasta reintentarla por sus líneas.
insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'ncp', 'Pendiente contable de la nota crédito parcial (A2)', 'cuenta_no_configurada · «Tarifa de IVA no identificada…»',
       coalesce(string_agg(f.reason || ' · ' || left(f.detail, 120), ' | '), 'SIN PENDIENTE'),
       count(*) >= 1 and bool_and(f.reason = 'cuenta_no_configurada' and f.detail like 'Tarifa de IVA no identificada%')
  from public.journal_entry_failures f
 where f.organization_id = 374 and f.id > (select v::int from ctx where k = 'max_fallo')
   and f.source_id = (select v from ctx where k = 'ncp');

insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'ds', 'Vista previa del documento soporte (fn_armar_asiento_documento)', 'ok · 24081001 D 57000 · 24081002 D 5000',
       (select v::jsonb ->> 'ok' from ctx where k = 'ds_vista') || ' · ' || coalesce(y.s, (select v::jsonb ->> 'fallo' from ctx where k = 'ds_vista')),
       (select v::jsonb ->> 'ok' from ctx where k = 'ds_vista') = 'true' and y.s = '24081001 D 57000 · 24081002 D 5000'
  from (select string_agg((l ->> 'cuenta') || ' D ' || round((l ->> 'debito')::numeric), ' · ' order by l ->> 'cuenta') as s
          from jsonb_array_elements((select v::jsonb -> 'lineas' from ctx where k = 'ds_vista')) l where l ->> 'cuenta' like '2408%') y;

insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'cuadre', format('Asiento %s (%s · %s)', je.id, coalesce((select upper(c.k) from ctx c where c.v = je.source_id limit 1), je.source), je.source),
       'Σ D = Σ C',
       format('D %s = C %s · %s', round(sum(l.debit)), round(sum(l.credit)),
              string_agg(l.account_code || case when l.debit > 0 then ' D ' || round(l.debit) else ' C ' || round(l.credit) end, ' | ' order by l.id)),
       sum(l.debit) = sum(l.credit)
  from public.journal_entries je join public.journal_lines l on l.journal_entry_id = je.id
 where je.organization_id = 374 and je.id > (select v::int from ctx where k = 'max_je')
 group by je.id, je.source order by je.id;

insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'funciones', 'fn_cuenta_iva_tarifa (org 374): generado 19/5, descontable 19/5, 16 %, fn_cuenta_iva venta / compra',
       '24080501 24080502 24081001 24081002 ∅ ∅ ∅', x.s, x.s = '24080501 24080502 24081001 24081002 ∅ ∅ ∅'
  from (select concat_ws(' ',
         public.fn_cuenta_iva_tarifa(374, 585, 'invoice_sales', null, 19, null),
         public.fn_cuenta_iva_tarifa(374, 585, 'invoice_sales', null, 5, null),
         public.fn_cuenta_iva_tarifa(374, 585, 'invoice_purchase', null, 19, null),
         public.fn_cuenta_iva_tarifa(374, 585, 'invoice_purchase', null, 5, null),
         coalesce(public.fn_cuenta_iva_tarifa(374, 585, 'invoice_purchase', null, 16, null), '∅'),
         coalesce(public.fn_cuenta_iva(374, 585, 'sales', '24080501'), '∅'),
         coalesce(public.fn_cuenta_iva(374, 585, 'invoice_purchase', '24081001'), '∅')) as s) x;

select n, escenario, verificacion, esperado, obtenido, ok from r order by n;

rollback;
