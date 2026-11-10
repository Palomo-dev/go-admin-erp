-- Pruebas de escenario · RONDA 3 del Contador (2026-11-08): B5 (IVA no descontable determinado antes de contabilizar
-- → al activo, costo o gasto de la línea) y nota crédito sin líneas sobre una factura con conceptos sin IVA.
-- Proyecto taqjemqjtumhwptchcxk · Organización de pruebas 374 (sede 585). NO DEJA DATOS (begin … rollback).
-- Requiere, en este orden y SIN aplicar: 20261108140000 (H1), 20261108150000 (procedencia por línea) y
-- 20261108152000 (B5). Se pegan donde dice «MIGRACIONES», dentro de la misma transacción.
--
-- Casos (cada documento por su vía normal; la evaluación del IVA la hace un usuario miembro, ANTES de contabilizar):
--   FCH   compra sin cuenta propia por línea (asiento de cabecera):
--           100.000 al 19 % «no descontable» · 200.000 al 19 % «proporcional 60 %» · 100.000 al 5 % «descontable»
--           → 2408: D 24081001 22.800 + D 24081002 5.000 · el resto del IVA (19.000 + 15.200) queda en la cuenta débito
--   FCL   compra con cuenta propia por línea (asiento por líneas): 100.000 al 19 % «no descontable» a 519525 ·
--           50.000 al 19 % «descontable» a 513595 → D 519525 119.000 · D 513595 50.000 · D 24081001 9.500
--   DS    documento soporte 100.000 al 19 % «no descontable» → sin 2408; el IVA va con la línea
--   FCG   compra contabilizada «por evaluar» y evaluada DESPUÉS (no se reescribe): la evaluación no cambia su asiento
--   FV19  factura de venta 2 × 150.000 al 19 % → C 24080501 57.000 (las ventas no cambian)
--   FVEX  factura 100.000 al 19 % + 50.000 EXCLUIDA · NCX nota crédito parcial (100.000 + 19.000) antes de sus líneas →
--           SIN asiento y pendiente (ronda 3: una sola tarifa no basta si hay conceptos sin IVA)
--   FVU   factura 200.000 al 19 % (sin conceptos sin IVA) · NCU2 parcial (100.000 + 19.000) → D 24080501 19.000
-- Y el cuadre de todos los asientos (control de la base, adelantado con SET CONSTRAINTS ALL IMMEDIATE).
--
-- RONDA 5 (2026-11-09, respuesta 5 del Contador): la cuenta por línea es obligatoria cuando el IVA de las líneas tiene
-- deducibilidad distinta. FCH (no descontable + proporcional 60 % + descontable, SIN cuenta por línea) ya no se
-- contabiliza con la cuenta de cabecera: queda SIN asiento y pendiente «iva_no_descontable_por_corregir». Cambian, por
-- eso, tres esperados de FCH (su IVA del asiento, su cuenta débito y su cuadre) y la fila «otros» deja aparte a FCH. Los
-- datos no cambian. El mismo ejemplo con cuenta por línea (34.200 al costo, 27.800 descontables) está en la prueba 23.

begin;

-- ═══ MIGRACIONES (solo en la prueba en seco, mientras no estén aplicadas) ═══

create temp table r (n serial primary key, escenario text, verificacion text, esperado text, obtenido text, ok boolean);
create temp table ctx (k text primary key, v text);
grant all on r, ctx to authenticated;
grant usage on sequence r_n_seq to authenticated;

insert into ctx select 'max_je', coalesce(max(id), 0)::text from public.journal_entries where organization_id = 374;
insert into ctx select 'max_fallo', coalesce(max(id), 0)::text from public.journal_entry_failures where organization_id = 374;
with s as (insert into public.suppliers (organization_id, name, nit, supplier_type) values (374, 'Proveedor de prueba B5', '900000041', 'company') returning id)
insert into ctx select 'sup', id::text from s;
with c as (insert into public.customers (organization_id, first_name, last_name, identification_type, identification_number)
           values (374, 'Cliente', 'Prueba B5', 'CC', '1000000041') returning id)
insert into ctx select 'cli', id::text from c;
-- La org 374 solo tiene la título 1435: se crea el auxiliar dentro de la transacción (se revierte).
insert into public.chart_of_accounts (account_code, organization_id, name, type, parent_code, is_active, naturaleza, es_movimiento, requiere_tercero, requiere_centro_costo)
select x.code, 374, x.name, c.type, x.parent, true, c.naturaleza, x.mov, false, c.requiere_centro_costo
  from public.chart_of_accounts c,
       (values ('143501', 'Mercancías no fabricadas por la empresa', '1435', false), ('14350101', 'Mercancías de prueba', '143501', true)) x(code, name, parent, mov)
 where c.organization_id = 374 and c.account_code = '1435'
   and not exists (select 1 from public.chart_of_accounts e where e.organization_id = 374 and e.account_code = x.code);
update public.configuracion_contable set account_code = '14350101' where organization_id = 374 and clave = 'inventario';

-- Compras en borrador con sus líneas
with f as (insert into public.invoice_purchase (organization_id, branch_id, supplier_id, number_ext, status, currency, issue_date)
           select 374, 585, (select v::int from ctx where k = 'sup'), 'PRUEBA-B5-' || x.n, 'draft', 'COP', now()
             from (values ('FCH'), ('FCL'), ('FCG')) x(n)
           returning id, number_ext)
insert into ctx select lower(replace(number_ext, 'PRUEBA-B5-', '')), id::text from f;
insert into public.invoice_items (invoice_id, invoice_type, invoice_purchase_id, description, qty, unit_price, tax_rate, tax_code, total_line, cuenta_contable)
select (select v::uuid from ctx where k = x.d), 'purchase', (select v::uuid from ctx where k = x.d), x.descr, 1, x.pr, x.t, x.c, x.tot, x.cta
  from (values ('fch', 'No descontable 19', 100000, 19, 'IVA_19', 119000, null), ('fch', 'Proporcional 19', 200000, 19, 'IVA_19', 238000, null),
               ('fch', 'Descontable 5', 100000, 5, 'IVA_5', 105000, null),
               ('fcl', 'Aseo no descontable', 100000, 19, 'IVA_19', 119000, '519525'), ('fcl', 'Servicio descontable', 50000, 19, 'IVA_19', 59500, '513595'),
               ('fcg', 'Bien evaluado después', 100000, 19, 'IVA_19', 119000, null)) x(d, descr, pr, t, c, tot, cta);
with d as (insert into public.support_documents (organization_id, branch_id, supplier_id, reference_code, provider, issue_date,
                                                 subtotal, tax_total, total, currency, status, tax_included)
           values (374, 585, (select v::int from ctx where k = 'sup'), 'PRUEBA-B5-DS', '{"names":"Proveedor de prueba B5"}'::jsonb, now(),
                   100000, 19000, 119000, 'COP', 'draft', false) returning id)
insert into ctx select 'ds', id::text from d;
insert into public.invoice_items (invoice_id, invoice_type, support_document_id, description, qty, unit_price, tax_rate, tax_code, total_line)
select v::uuid, 'support_document', v::uuid, 'Servicio sin IVA descontable', 1, 100000, 19, 'IVA_19', 119000 from ctx where k = 'ds';

-- FCG se contabiliza ANTES de evaluar (queda «por evaluar»: todo su IVA a la 2408).
update public.invoice_purchase set status = 'received' where id = (select v::uuid from ctx where k = 'fcg');

-- Evaluación por un usuario miembro (sesión simulada), antes de contabilizar FCH, FCL y DS.
select set_config('request.jwt.claims', '{"sub":"bb11d6d2-f647-49f7-9b29-aa4c4438abf1","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  perform public.fn_iva_clasificar_linea(374, 'invoice_items', it.id, x.datos::jsonb)
     from public.invoice_items it
     join (values
       ('fch', 'No descontable 19', '{"tratamiento":"gravada","tarifa":19,"tipo_operacion":"bienes","descontable":"no_descontable","descontable_motivo":"Destinado a una operación excluida (art. 488)"}'),
       ('fch', 'Proporcional 19', '{"tratamiento":"gravada","tarifa":19,"tipo_operacion":"bienes","descontable":"proporcional","descontable_porcentaje":60,"descontable_motivo":"Art. 490: 60 % de ingresos gravados, según el cálculo adjunto"}'),
       ('fch', 'Descontable 5', '{"tratamiento":"gravada","tarifa":5,"tipo_operacion":"bienes","descontable":"descontable","descontable_motivo":"Destinado a operaciones gravadas (arts. 485 y 488)"}'),
       ('fcl', 'Aseo no descontable', '{"tratamiento":"gravada","tarifa":19,"tipo_operacion":"servicios","descontable":"no_descontable","descontable_motivo":"Gasto no imputable a operaciones gravadas (art. 488)"}'),
       ('fcl', 'Servicio descontable', '{"tratamiento":"gravada","tarifa":19,"tipo_operacion":"servicios","descontable":"descontable","descontable_motivo":"Destinado a operaciones gravadas"}'),
       ('ds', 'Servicio sin IVA descontable', '{"tratamiento":"gravada","tarifa":19,"tipo_operacion":"servicios","descontable":"no_descontable","descontable_motivo":"Compra a un no responsable: no genera IVA descontable"}'),
       ('fcg', 'Bien evaluado después', '{"tratamiento":"gravada","tarifa":19,"tipo_operacion":"bienes","descontable":"no_descontable","descontable_motivo":"Evaluado después de contabilizar"}')
     ) x(doc, descr, datos) on it.description = x.descr
       and (it.invoice_purchase_id = (select v::uuid from ctx where k = x.doc) or it.support_document_id = (select v::uuid from ctx where k = x.doc));
end
$$;
reset role;
-- FCG: la evaluación es POSTERIOR a su asiento (en la misma transacción now() no avanza: se fecha un minuto después).
update public.invoice_items set iva_descontable_evaluado_en = now() + interval '1 minute'
 where invoice_purchase_id = (select v::uuid from ctx where k = 'fcg');

-- Contabilización de FCH y FCL (al recibir) y del documento soporte (asiento por líneas).
update public.invoice_purchase set status = 'received' where id in (select v::uuid from ctx where k in ('fch', 'fcl'));
insert into ctx select 'je_ds', public.fn_asiento_documento_por_lineas((select v::uuid from ctx where k = 'ds'), 'documento_soporte', 'prueba:b5:ds')::text;

-- Ventas y notas crédito armadas antes de sus líneas (ronda 3)
with f as (insert into public.invoice_sales (organization_id, branch_id, customer_id, number, status, currency, issue_date, document_type)
           select 374, 585, (select v::uuid from ctx where k = 'cli'), 'PRUEBA-B5-' || x.n, 'draft', 'COP', now(), 'invoice'
             from (values ('FV19'), ('FVEX'), ('FVU')) x(n)
           returning id, number)
insert into ctx select lower(replace(number, 'PRUEBA-B5-', '')), id::text from f;
insert into public.invoice_items (invoice_id, invoice_type, invoice_sales_id, description, qty, unit_price, tax_rate, tax_code, total_line)
select (select v::uuid from ctx where k = x.d), 'sale', (select v::uuid from ctx where k = x.d), x.descr, x.q, x.p, x.t, x.c, x.tot
  from (values ('fv19', 'Servicio 19 %', 2, 150000, 19, 'IVA_19', 357000),
               ('fvex', 'Producto 19 %', 1, 100000, 19, 'IVA_19', 119000), ('fvex', 'Producto excluido', 1, 50000, 0, null, 50000),
               ('fvu', 'Producto 19 %', 2, 100000, 19, 'IVA_19', 238000)) x(d, descr, q, p, t, c, tot);
update public.invoice_sales set status = 'issued' where id in (select v::uuid from ctx where k in ('fv19', 'fvex', 'fvu'));
with n as (insert into public.invoice_sales (organization_id, branch_id, customer_id, number, status, currency, issue_date,
                                             document_type, related_invoice_id, subtotal, tax_total, total)
           select 374, 585, (select v::uuid from ctx where k = 'cli'), 'PRUEBA-B5-' || x.n, 'issued', 'COP', now(), 'credit_note',
                  (select v::uuid from ctx where k = x.fac), x.s, x.i, x.s + x.i
             from (values ('NCX', 'fvex', -100000, -19000), ('NCU2', 'fvu', -100000, -19000)) x(n, fac, s, i)
           returning id, number)
insert into ctx select lower(replace(number, 'PRUEBA-B5-', '')), id::text from n;

set constraints all immediate;

-- ═══ Verificaciones ═══
create temp view lineas_doc as
select c.k as doc, je.id as asiento, l.account_code as cuenta, round(sum(l.debit)) as d, round(sum(l.credit)) as c
  from ctx c
  join public.journal_entries je on je.organization_id = 374 and je.source_id = c.v and je.id > (select v::int from ctx where k = 'max_je')
  join public.journal_lines l on l.journal_entry_id = je.id
 where c.k in ('fch', 'fcl', 'fcg', 'ds', 'fv19', 'ncx', 'ncu2')
 group by c.k, je.id, l.account_code;

insert into r (escenario, verificacion, esperado, obtenido, ok)
select x.doc, 'IVA del asiento (2408)', x.esperado, y.s, y.s = x.esperado
  from (values
    ('fch', 'SIN ASIENTO'),
    ('fcl', '24081001 D 9500'),
    ('ds', 'SIN 2408'),
    ('fcg', '24081001 D 19000'),
    ('fv19', '24080501 C 57000'),
    ('ncx', 'SIN ASIENTO'),
    ('ncu2', '24080501 D 19000')
  ) x(doc, esperado)
  cross join lateral (select case
           when not exists (select 1 from lineas_doc i where i.doc = x.doc) then 'SIN ASIENTO'
           else coalesce((select string_agg(i.cuenta || case when i.d > 0 then ' D ' || i.d else ' C ' || i.c end, ' + ' order by i.cuenta)
                            from lineas_doc i where i.doc = x.doc and i.cuenta like '2408%'), 'SIN 2408') end as s) y;

insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'fch', 'Ronda 5: deducibilidad distinta con cuenta de cabecera → pendiente de corregir (asigne la cuenta de cada línea)',
       'iva_no_descontable_por_corregir · deducibilidad distinta',
       coalesce(max(f.reason), 'SIN PENDIENTE') || ' · ' || case when bool_or(f.detail like '%deducibilidad distinta%') then 'deducibilidad distinta' else 'otro motivo' end,
       max(f.reason) = 'iva_no_descontable_por_corregir' and bool_or(f.detail like '%deducibilidad distinta%')
  from public.journal_entry_failures f
 where f.organization_id = 374 and f.id > (select v::int from ctx where k = 'max_fallo') and f.source_id = (select v from ctx where k = 'fch');

insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'fcl', 'El IVA no descontable va a la cuenta de SU línea', '513595 D 50000 · 519525 D 119000',
       string_agg(i.cuenta || ' D ' || i.d, ' · ' order by i.cuenta) filter (where i.cuenta in ('519525', '513595')),
       string_agg(i.cuenta || ' D ' || i.d, ' · ' order by i.cuenta) filter (where i.cuenta in ('519525', '513595')) = '513595 D 50000 · 519525 D 119000'
  from lineas_doc i where i.doc = 'fcl';

insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'ds', 'Documento soporte: el IVA va con la línea', 'Σ D 119000 sin 2408',
       format('Σ D %s · 2408 %s', sum(i.d), coalesce(sum(i.d) filter (where i.cuenta like '2408%'), 0)),
       sum(i.d) = 119000 and not bool_or(i.cuenta like '2408%')
  from lineas_doc i where i.doc = 'ds';

insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'fcg', 'Evaluación posterior al asiento: no cambia su contabilidad (factor 1, no descontable 0, vista previa con IVA 19.000)',
       '1 · 0 · 19000',
       format('%s · %s · %s', public.fn_iva_factor_descontable_linea(it.id), public.fn_iva_no_descontable_documento('invoice_purchase', it.invoice_purchase_id),
              (select round(sum((l ->> 'debito')::numeric)) from jsonb_array_elements(public.fn_armar_asiento_documento('compra', it.invoice_purchase_id) -> 'lineas') l
                where l ->> 'cuenta' like '2408%')),
       public.fn_iva_factor_descontable_linea(it.id) = 1 and public.fn_iva_no_descontable_documento('invoice_purchase', it.invoice_purchase_id) = 0
         and (select sum((l ->> 'debito')::numeric) from jsonb_array_elements(public.fn_armar_asiento_documento('compra', it.invoice_purchase_id) -> 'lineas') l
               where l ->> 'cuenta' like '2408%') = 19000
  from public.invoice_items it where it.invoice_purchase_id = (select v::uuid from ctx where k = 'fcg');

insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'funciones', 'Factor y no descontable por línea de FCH', 'Descontable 5 1/0 · No descontable 19 0/19000 · Proporcional 19 0.6/15200',
       string_agg(format('%s %s/%s', it.description, public.fn_iva_factor_descontable_linea(it.id)::float8,
                         round(public.fn_iva_no_descontable_linea(it.id))), ' · ' order by it.description),
       string_agg(format('%s %s/%s', it.description, public.fn_iva_factor_descontable_linea(it.id)::float8,
                         round(public.fn_iva_no_descontable_linea(it.id))), ' · ' order by it.description)
         = 'Descontable 5 1/0 · No descontable 19 0/19000 · Proporcional 19 0.6/15200'
  from public.invoice_items it where it.invoice_purchase_id = (select v::uuid from ctx where k = 'fch');

insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'ncx', 'Pendiente contable visible (ronda 3: conceptos sin IVA en la factura)', 'Tarifa de IVA no identificada…',
       coalesce((select string_agg(f.reason || ' · ' || left(f.detail, 100), ' | ') from public.journal_entry_failures f
                  where f.organization_id = 374 and f.id > (select v::int from ctx where k = 'max_fallo') and f.source_id = (select v from ctx where k = 'ncx')), 'SIN PENDIENTE'),
       exists (select 1 from public.journal_entry_failures f
                where f.organization_id = 374 and f.id > (select v::int from ctx where k = 'max_fallo')
                  and f.source_id = (select v from ctx where k = 'ncx') and f.detail like 'Tarifa de IVA no identificada%');

insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'otros', 'Pendientes contables nuevos de los demás documentos', 'ninguno',
       coalesce(string_agg(f.source || ' ' || f.reason || ' ' || left(coalesce(f.detail, ''), 100), ' | '), 'ninguno'), count(*) = 0
  from public.journal_entry_failures f
 where f.organization_id = 374 and f.id > (select v::int from ctx where k = 'max_fallo')
   and f.source_id is distinct from (select v from ctx where k = 'ncx')
   and f.source_id is distinct from (select v from ctx where k = 'fch');

insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'cuadre', format('Asiento %s (%s)', je.id, coalesce((select upper(c.k) from ctx c where c.v = je.source_id limit 1), je.source)),
       'Σ D = Σ C', format('D %s = C %s', round(sum(l.debit)), round(sum(l.credit))), sum(l.debit) = sum(l.credit)
  from public.journal_entries je join public.journal_lines l on l.journal_entry_id = je.id
 where je.organization_id = 374 and je.id > (select v::int from ctx where k = 'max_je')
 group by je.id, je.source order by je.id;

insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'historicos', 'Asientos anteriores a la prueba intactos (ninguna línea nueva en asientos viejos)', '0',
       count(*)::text, count(*) = 0
  from public.journal_lines l join public.journal_entries je on je.id = l.journal_entry_id
 where je.organization_id = 374 and je.id <= (select v::int from ctx where k = 'max_je') and l.created_at >= now();

select n, escenario, verificacion, esperado, obtenido, ok from r order by n;

rollback;
