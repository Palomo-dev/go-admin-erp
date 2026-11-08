-- Pruebas de escenario · H1 en la RONDA 2 del Contador (A1 y A2): la tarifa no se asume y la nota crédito parcial
-- no se reparte por la mezcla de la factura.
-- Proyecto taqjemqjtumhwptchcxk · Organización de pruebas 374 (sede 585). NO DEJA DATOS (begin … rollback).
-- Requiere supabase/migrations/20261108140000_iva_subcuenta_por_tarifa_y_lado.sql (reescrita, SIN aplicar): se pega
-- donde dice «MIGRACIÓN», dentro de la misma transacción.
--
-- Casos (cada documento por su vía normal: sus propios disparadores de asiento):
--   POS19  venta POS 100.000 + IVA 19.000 con tarifa 0 en la línea → la tarifa se recupera (dato inequívoco) → 24080501
--   POSX   venta POS 100.000 + IVA 12.000 con tarifa 0 → no coincide con UNA tarifa → SIN asiento, pendiente (A1)
--   FOLIO  asiento de un origen sin líneas (folio) con IVA 19.000 → SIN asiento, pendiente (A1: no se asume 19 %)
--   FVMX   factura 100.000 al 19 % + 100.000 al 5 % → 24080501 C 19.000 + 24080502 C 5.000
--   NCT    nota crédito TOTAL de FVMX armada antes de sus líneas → reproduce la composición: D 19.000 + D 5.000 (A2)
--   FVMX2  factura igual a FVMX
--   NCP    nota crédito PARCIAL de FVMX2 (100.000 + IVA 19.000) antes de sus líneas → SIN asiento, pendiente (A2)
--   FV19   factura 2 × 150.000 al 19 % · NCU nota crédito parcial (100.000 + 19.000) → factura de una tarifa → 24080501
-- Y el cuadre de todos los asientos (control de la base, diferido, adelantado con SET CONSTRAINTS ALL IMMEDIATE).

begin;

-- ═══ MIGRACIÓN (solo en la prueba en seco, mientras no esté aplicada) ═══

create temp table r (n serial primary key, escenario text, verificacion text, esperado text, obtenido text, ok boolean);
create temp table ctx (k text primary key, v text);

insert into ctx select 'max_je', coalesce(max(id), 0)::text from public.journal_entries where organization_id = 374;
insert into ctx select 'max_fallo', coalesce(max(id), 0)::text from public.journal_entry_failures where organization_id = 374;
with c as (insert into public.customers (organization_id, first_name, last_name, identification_type, identification_number)
           values (374, 'Cliente', 'Prueba H1 R2', 'CC', '1000000031') returning id)
insert into ctx select 'cli', id::text from c;

-- Ventas POS
with s as (insert into public.sales (organization_id, branch_id, user_id, status, subtotal, tax_total, total, tax_included, sale_date, notes)
           select 374, 585, 'bb11d6d2-f647-49f7-9b29-aa4c4438abf1', 'paid', 100000, x.i, 100000 + x.i, false, now(), x.n
             from (values ('POS19', 19000), ('POSX', 12000)) x(n, i)
           returning id, notes)
insert into ctx select lower(notes), id::text from s;
insert into public.sale_items (sale_id, quantity, unit_price, total, tax_amount, tax_rate)
select (select v::uuid from ctx where k = x.k), 1, 100000, 100000, x.i, 0 from (values ('pos19', 19000), ('posx', 12000)) x(k, i);
set constraints trg_auto_journal_sale_pos immediate;

-- Origen sin líneas
insert into ctx select 'je_folio', coalesce(public.fn_create_journal_entry(
  p_organization_id := 374, p_branch_id := 585, p_entry_date := now(), p_memo := 'Folio de prueba H1 R2', p_source := 'folio_items',
  p_source_id := 'folio-prueba-h1r2', p_debit_account := '1305', p_credit_account := '41401501', p_amount := 119000,
  p_tax_account := '24080501', p_tax_amount := 19000, p_tax_is_credit := true, p_fact_key := 'prueba:h1r2:folio')::text, 'NULL');

-- Facturas de venta
with f as (insert into public.invoice_sales (organization_id, branch_id, customer_id, number, status, currency, issue_date, document_type)
           select 374, 585, (select v::uuid from ctx where k = 'cli'), 'PRUEBA-H1R2-' || x.n, 'draft', 'COP', now(), 'invoice'
             from (values ('FVMX'), ('FVMX2'), ('FV19')) x(n)
           returning id, number)
insert into ctx select lower(replace(number, 'PRUEBA-H1R2-', '')), id::text from f;
insert into public.invoice_items (invoice_id, invoice_type, invoice_sales_id, description, qty, unit_price, tax_rate, tax_code, total_line)
select (select v::uuid from ctx where k = x.d), 'sale', (select v::uuid from ctx where k = x.d), x.descr, x.q, x.p, x.t, x.c, x.tot
  from (values ('fvmx', 'Producto 19 %', 1, 100000, 19, 'IVA_19', 119000), ('fvmx', 'Producto 5 %', 1, 100000, 5, 'IVA_5', 105000),
               ('fvmx2', 'Producto 19 %', 1, 100000, 19, 'IVA_19', 119000), ('fvmx2', 'Producto 5 %', 1, 100000, 5, 'IVA_5', 105000),
               ('fv19', 'Servicio 19 %', 2, 150000, 19, 'IVA_19', 357000)) x(d, descr, q, p, t, c, tot);
update public.invoice_sales set status = 'issued' where id in (select v::uuid from ctx where k in ('fvmx', 'fvmx2', 'fv19'));

-- Notas crédito cuyo asiento se arma al insertar la cabecera (antes de sus líneas): fn_auto_journal_credit_note.
with n as (insert into public.invoice_sales (organization_id, branch_id, customer_id, number, status, currency, issue_date,
                                             document_type, related_invoice_id, subtotal, tax_total, total)
           select 374, 585, (select v::uuid from ctx where k = 'cli'), 'PRUEBA-H1R2-' || x.n, 'issued', 'COP', now(), 'credit_note',
                  (select v::uuid from ctx where k = x.fac), x.s, x.i, x.s + x.i
             from (values ('NCT', 'fvmx', -200000, -24000), ('NCP', 'fvmx2', -100000, -19000), ('NCU', 'fv19', -100000, -19000)) x(n, fac, s, i)
           returning id, number)
insert into ctx select lower(replace(number, 'PRUEBA-H1R2-', '')), id::text from n;

set constraints all immediate;

-- ═══ Verificaciones ═══
create temp view iva_doc as
select c.k as doc, je.id as asiento, l.account_code as cuenta, round(sum(l.debit)) as d, round(sum(l.credit)) as c
  from ctx c
  join public.journal_entries je on je.organization_id = 374 and je.source_id = c.v and je.id > (select v::int from ctx where k = 'max_je')
  join public.journal_lines l on l.journal_entry_id = je.id and l.account_code like '2408%'
 group by c.k, je.id, l.account_code;

insert into r (escenario, verificacion, esperado, obtenido, ok)
select x.doc, 'IVA del asiento por subcuenta', x.esperado, y.s, y.s = x.esperado
  from (values
    ('pos19', '24080501 C 19000'), ('posx', 'SIN ASIENTO'),
    ('fvmx', '24080501 C 19000 + 24080502 C 5000'), ('nct', '24080501 D 19000 + 24080502 D 5000'),
    ('fvmx2', '24080501 C 19000 + 24080502 C 5000'), ('ncp', 'SIN ASIENTO'),
    ('fv19', '24080501 C 57000'), ('ncu', '24080501 D 19000')
  ) x(doc, esperado)
  cross join lateral (select coalesce((select string_agg(i.cuenta || case when i.d > 0 then ' D ' || i.d else ' C ' || i.c end, ' + ' order by i.cuenta)
                   from iva_doc i where i.doc = x.doc), 'SIN ASIENTO') as s) y;

insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'folio', 'Asiento de un origen sin líneas con IVA', 'NULL (no se crea)', v, v = 'NULL' from ctx where k = 'je_folio';

insert into r (escenario, verificacion, esperado, obtenido, ok)
select x.doc, 'Pendiente contable visible', x.esperado,
       coalesce((select string_agg(f.reason || ' · ' || left(f.detail, 120), ' | ') from public.journal_entry_failures f
                  where f.organization_id = 374 and f.id > (select v::int from ctx where k = 'max_fallo')
                    and f.source_id = coalesce((select v from ctx where k = x.doc), x.doc)), 'SIN PENDIENTE'),
       exists (select 1 from public.journal_entry_failures f
                where f.organization_id = 374 and f.id > (select v::int from ctx where k = 'max_fallo')
                  and f.source_id = coalesce((select v from ctx where k = x.doc), x.doc) and f.detail like 'Tarifa de IVA no identificada%')
  from (values ('posx', 'Tarifa de IVA no identificada en 12000 de IVA generado…'),
               ('folio-prueba-h1r2', 'Tarifa de IVA no identificada: el documento no tiene líneas…'),
               ('ncp', 'Tarifa de IVA no identificada…')) x(doc, esperado);

insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'otros', 'Pendientes contables nuevos de los demás documentos', 'ninguno',
       coalesce(string_agg(f.source || ' ' || f.reason || ' ' || left(coalesce(f.detail, ''), 100), ' | '), 'ninguno'), count(*) = 0
  from public.journal_entry_failures f
 where f.organization_id = 374 and f.id > (select v::int from ctx where k = 'max_fallo')
   and f.source_id not in (select v from ctx where k in ('posx', 'ncp')) and f.source_id <> 'folio-prueba-h1r2';

insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'funciones', 'fn_cuenta_iva_tarifa sin tarifa (generado / descontable) y fn_cuenta_iva', '∅ ∅ ∅ · con 19 %: 24080501',
       x.s, x.s = '∅ ∅ ∅ · con 19 %: 24080501'
  from (select concat_ws(' ',
         coalesce(public.fn_cuenta_iva_tarifa(374, 585, 'invoice_sales', null, null, null), '∅'),
         coalesce(public.fn_cuenta_iva_tarifa(374, 585, 'invoice_purchase', null, null, null), '∅'),
         coalesce(public.fn_cuenta_iva(374, 585, 'sales', '24080501'), '∅')) || ' · con 19 %: '
         || public.fn_cuenta_iva_tarifa(374, 585, 'invoice_sales', null, 19, null) as s) x;

insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'cuadre', format('Asiento %s (%s)', je.id, coalesce((select upper(c.k) from ctx c where c.v = je.source_id limit 1), je.source)),
       'Σ D = Σ C', format('D %s = C %s', round(sum(l.debit)), round(sum(l.credit))), sum(l.debit) = sum(l.credit)
  from public.journal_entries je join public.journal_lines l on l.journal_entry_id = je.id
 where je.organization_id = 374 and je.id > (select v::int from ctx where k = 'max_je')
 group by je.id, je.source order by je.id;

select n, escenario, verificacion, esperado, obtenido, ok from r order by n;

rollback;
