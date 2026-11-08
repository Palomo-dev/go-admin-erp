-- Pruebas de escenario · Borrador del IVA (fn_tributario_borrador_iva)
-- Fecha: 2026-11-07 · Proyecto taqjemqjtumhwptchcxk · Organización de pruebas 374. NO DEJA DATOS (begin … rollback).
--
-- La org 374 no tiene movimientos: se crean DENTRO de la transacción, por las vías normales de la aplicación
-- (cada documento genera su asiento con sus propios disparadores), para el periodo 2026-11-01 a 2026-11-30:
--   FC  factura de compra recibida: 1.000.000 al 19 % (IVA 190.000) + 200.000 al 5 % (IVA 10.000)
--   FV  factura de venta emitida: 2 × 150.000 al 19 % (IVA 57.000)
--   V1  venta POS: 500.000 al 19 % (IVA 95.000) + 50.000 con tarifa 0 (IVA 0)
--   V2  venta POS: 100.000 con IVA 19.000 guardado en la línea pero tarifa 0 (el caso real del POS)
--   V3  venta POS: línea de 200.000 al 19 % (38.000) con IVA total de la venta 30.000 (líneas ≠ libros)
--   V4  venta POS: 100.000 al 19 % (19.000), cuyo asiento se revierte dentro del mismo mes
--   AJ  asiento manual: D 24080501 10.000 / C 1110 10.000 (p. ej. un ajuste o un pago del impuesto)
-- Luego un usuario miembro pide el borrador y se reconcilia con un SELECT directo sobre journal_lines.
-- Los disparadores de asiento del POS son diferidos (corren al confirmar): aquí se adelantan con SET CONSTRAINTS.

begin;

create temp table r (n serial primary key, escenario text, verificacion text, esperado text, obtenido text, ok boolean);
create temp table ctx (k text primary key, v text);
grant all on r, ctx to authenticated, anon;
grant usage on sequence r_n_seq to authenticated, anon;

insert into ctx select 'max_je', coalesce(max(id), 0)::text from public.journal_entries where organization_id = 374;
with s as (insert into public.suppliers (organization_id, name, nit, supplier_type) values (374, 'Proveedor de prueba A', '900000001', 'company') returning id)
insert into ctx select 'sup', id::text from s;
with c as (insert into public.customers (organization_id, first_name, last_name, identification_type, identification_number)
           values (374, 'Cliente', 'De prueba', 'CC', '1000000001') returning id)
insert into ctx select 'cli', id::text from c;

-- FC
with f as (insert into public.invoice_purchase (organization_id, branch_id, supplier_id, number_ext, status, currency, issue_date)
           values (374, 585, (select v::int from ctx where k = 'sup'), 'PRUEBA-FC-IVA', 'draft', 'COP', now()) returning id)
insert into ctx select 'fc', id::text from f;
insert into public.invoice_items (invoice_id, invoice_type, invoice_purchase_id, description, qty, unit_price, tax_rate, tax_code, total_line)
select v::uuid, 'purchase', v::uuid, 'Mercancía 19 %', 1, 1000000, 19, 'IVA_19', 1190000 from ctx where k = 'fc'
union all
select v::uuid, 'purchase', v::uuid, 'Mercancía 5 %', 1, 200000, 5, 'IVA_5', 210000 from ctx where k = 'fc';
update public.invoice_purchase set status = 'received' where id = (select v::uuid from ctx where k = 'fc');

-- FV
with f as (insert into public.invoice_sales (organization_id, branch_id, customer_id, number, status, currency, issue_date, document_type)
           values (374, 585, (select v::uuid from ctx where k = 'cli'), 'PRUEBA-FV-1', 'draft', 'COP', now(), 'invoice') returning id)
insert into ctx select 'fv', id::text from f;
insert into public.invoice_items (invoice_id, invoice_type, invoice_sales_id, description, qty, unit_price, tax_rate, tax_code, total_line)
select v::uuid, 'sale', v::uuid, 'Servicio 19 %', 2, 150000, 19, 'IVA_19', 357000 from ctx where k = 'fv';
update public.invoice_sales set status = 'issued' where id = (select v::uuid from ctx where k = 'fv');

-- V1..V4 (POS)
with s as (insert into public.sales (organization_id, branch_id, user_id, status, subtotal, tax_total, total, tax_included, sale_date, notes)
           values (374, 585, 'bb11d6d2-f647-49f7-9b29-aa4c4438abf1', 'paid', 550000, 95000, 645000, false, now(), 'V1') ,
                  (374, 585, 'bb11d6d2-f647-49f7-9b29-aa4c4438abf1', 'paid', 100000, 19000, 119000, false, now(), 'V2'),
                  (374, 585, 'bb11d6d2-f647-49f7-9b29-aa4c4438abf1', 'paid', 200000, 30000, 230000, false, now(), 'V3'),
                  (374, 585, 'bb11d6d2-f647-49f7-9b29-aa4c4438abf1', 'paid', 100000, 19000, 119000, false, now(), 'V4')
           returning id, notes)
insert into ctx select lower(notes), id::text from s;
insert into public.sale_items (sale_id, quantity, unit_price, total, tax_amount, tax_rate)
select (select v::uuid from ctx where k = 'v1'), 1, 500000, 500000, 95000, 19 union all
select (select v::uuid from ctx where k = 'v1'), 1, 50000, 50000, 0, 0 union all
select (select v::uuid from ctx where k = 'v2'), 1, 100000, 100000, 19000, 0 union all
select (select v::uuid from ctx where k = 'v3'), 1, 200000, 200000, 38000, 19 union all
select (select v::uuid from ctx where k = 'v4'), 1, 100000, 100000, 19000, 19;
set constraints trg_auto_journal_sale_pos immediate;

-- V4: contra-asiento en el mismo mes.
insert into ctx select 'je_v4', id::text from public.journal_entries
 where organization_id = 374 and source = 'sales' and source_id = (select v from ctx where k = 'v4');
insert into ctx select 'je_v4_rev',
  public.fn_revertir_asiento_en_fecha((select v::int from ctx where k = 'je_v4'), 'anulacion_pago', 'prueba-borrador-iva', now(), null)::text;

-- AJ: asiento manual que mueve 2408.
insert into ctx select 'je_aj', public.fn_create_journal_entry(
  p_organization_id := 374, p_branch_id := 585, p_entry_date := now(), p_memo := 'Ajuste manual de IVA (prueba)',
  p_source := 'manual', p_source_id := null, p_debit_account := '24080501', p_credit_account := '1110',
  p_amount := 10000, p_fact_key := 'prueba:ajuste-iva')::text;

-- Mapa asiento → documento, para leer el resultado.
insert into ctx
select 'doc_' || je.id, case je.source when 'invoice_purchase' then 'FC' when 'invoice_sales' then 'FV' when 'manual' then 'AJ' when 'reversal' then 'V4-contra'
                         else (select upper(c.k) from ctx c where c.v = je.source_id) end
  from public.journal_entries je where je.organization_id = 374 and je.id > (select v::int from ctx where k = 'max_je');

-- Los disparadores de cuadre de la base (también diferidos) se ejecutan ahora: si algún asiento no cuadra, todo falla aquí.
set constraints all immediate;

-- ── Reconciliación: SELECT directo sobre journal_lines (como administrador de la base) ──
insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'R', 'Libro 2408 por origen (crédito − débito), asientos publicados del 2026-11-01 al 2026-11-30',
       'sales 163.000 (V1 95.000 + V2 19.000 + V3 30.000 + V4 19.000) · reversal −19.000 · invoice_sales 57.000 · invoice_purchase −200.000 · manual −10.000',
       string_agg(t.source || ' ' || t.neto, ' · ' order by t.source),
       string_agg(t.source || ' ' || t.neto, ' · ' order by t.source) = 'invoice_purchase -200000 · invoice_sales 57000 · manual -10000 · reversal -19000 · sales 163000'
  from (select je.source, round(sum(l.credit - l.debit)) as neto
          from public.journal_entries je join public.journal_lines l on l.journal_entry_id = je.id
         where je.organization_id = 374 and je.posted and l.account_code like '2408%'
           and je.entry_date >= ('2026-11-01'::timestamp at time zone 'America/Bogota')
           and je.entry_date < ('2026-12-01'::timestamp at time zone 'America/Bogota')
         group by je.source) t;
insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'R', 'Subcuentas 2408 usadas por los documentos de prueba', 'informativo (ver Hallazgo H1)',
       string_agg(distinct l.account_code || ' ' || c.name, ' · '), true
  from public.journal_entries je join public.journal_lines l on l.journal_entry_id = je.id
  join public.chart_of_accounts c on c.organization_id = 374 and c.account_code = l.account_code
 where je.organization_id = 374 and je.id > (select v::int from ctx where k = 'max_je') and l.account_code like '2408%';
insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'R', format('Asiento %s (%s) · %s', je.id, (select v from ctx where k = 'doc_' || je.id), je.source),
       'Σ D = Σ C',
       format('D %s = C %s · %s', round(sum(l.debit)), round(sum(l.credit)),
              string_agg(l.account_code || case when l.debit > 0 then ' D ' || round(l.debit) else ' C ' || round(l.credit) end, ' | ' order by l.id)),
       sum(l.debit) = sum(l.credit)
  from public.journal_entries je join public.journal_lines l on l.journal_entry_id = je.id
 where je.organization_id = 374 and je.id > (select v::int from ctx where k = 'max_je')
 group by je.id, je.source order by je.id;

-- ── El borrador, pedido por un usuario miembro ──
select set_config('request.jwt.claims', '{"sub":"bb11d6d2-f647-49f7-9b29-aa4c4438abf1","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  v_b jsonb;
  v_r jsonb;
  v_t jsonb;
  v_esp text;
  v_obt text;
  v_docs text;
  v_libro numeric;
  v_err text;
begin
  v_b := public.fn_tributario_borrador_iva(374, '2026-11-01', '2026-11-30');
  insert into ctx values ('borrador', v_b::text);

  for v_r in select * from jsonb_array_elements(v_b -> 'renglones') loop
    select string_agg(coalesce((select c.v from ctx c where c.k = 'doc_' || a.id), a.id::text), ', ' order by a.id) into v_docs
      from jsonb_array_elements_text(v_r -> 'asientos') as a(id);
    v_obt := format('base %s · valor %s · %s · %s asiento(s): %s',
                    coalesce(v_r ->> 'base', '—'), v_r ->> 'valor', v_r ->> 'estado', v_r ->> 'total_asientos', coalesce(v_docs, '—'));
    v_esp := case (v_r ->> 'lado') || '/' || (v_r ->> 'clave') || '/' || coalesce(round((v_r ->> 'tarifa')::numeric)::text, '')
      when 'generado/gravadas/19'                 then 'base 800000 · valor 152000 · ok · FV + V1'
      when 'generado/sin_iva/'                    then 'base 50000 · valor 0 · revisar · V1 (línea con tarifa 0)'
      when 'generado/tarifa_sin_identificar/'     then 'valor 19000 (de los libros) · revisar · V2'
      when 'generado/no_cuadra/'                  then 'valor 30000 (de los libros) · revisar · V3'
      when 'descontable/gravadas/19'              then 'base 1000000 · valor 190000 · ok · FC'
      when 'descontable/gravadas/5'               then 'base 200000 · valor 10000 · ok · FC'
      when 'otros/otros_movimientos/'             then 'valor -10000 · revisar · AJ'
      else 'RENGLÓN NO ESPERADO' end;
    insert into r (escenario, verificacion, esperado, obtenido, ok) values
      ('B', format('Renglón %s / %s / tarifa %s', v_r ->> 'lado', v_r ->> 'clave', coalesce(v_r ->> 'tarifa', '—')), v_esp, v_obt,
       case (v_r ->> 'lado') || '/' || (v_r ->> 'clave') || '/' || coalesce(round((v_r ->> 'tarifa')::numeric)::text, '')
         when 'generado/gravadas/19' then (v_r ->> 'base')::numeric = 800000 and (v_r ->> 'valor')::numeric = 152000 and v_r ->> 'estado' = 'ok' and v_docs in ('FV, V1', 'V1, FV')
         when 'generado/sin_iva/' then (v_r ->> 'base')::numeric = 50000 and (v_r ->> 'valor')::numeric = 0 and v_r ->> 'estado' = 'revisar' and v_docs = 'V1'
         when 'generado/tarifa_sin_identificar/' then (v_r ->> 'valor')::numeric = 19000 and v_r ->> 'estado' = 'revisar' and v_docs = 'V2'
         when 'generado/no_cuadra/' then (v_r ->> 'valor')::numeric = 30000 and v_r ->> 'estado' = 'revisar' and v_docs = 'V3'
         when 'descontable/gravadas/19' then (v_r ->> 'base')::numeric = 1000000 and (v_r ->> 'valor')::numeric = 190000 and v_r ->> 'estado' = 'ok' and v_docs = 'FC'
         when 'descontable/gravadas/5' then (v_r ->> 'base')::numeric = 200000 and (v_r ->> 'valor')::numeric = 10000 and v_r ->> 'estado' = 'ok' and v_docs = 'FC'
         when 'otros/otros_movimientos/' then (v_r ->> 'valor')::numeric = -10000 and v_r ->> 'estado' = 'revisar' and v_docs = 'AJ'
         else false end);
  end loop;

  v_t := v_b -> 'totales';
  insert into r (escenario, verificacion, esperado, obtenido, ok) values
    ('B', 'Totales del borrador', 'IVA generado 201000 · descontable 200000 · saldo 1000 · otros -10000 · 5 documentos (V4 queda fuera por su contra-asiento) · 4 renglones por revisar',
     format('IVA generado %s · descontable %s · saldo %s · otros %s · %s documentos · %s por revisar',
            v_t ->> 'iva_generado', v_t ->> 'iva_descontable', v_t ->> 'saldo', v_t ->> 'otros_movimientos', v_t ->> 'documentos', v_t ->> 'por_revisar'),
     (v_t ->> 'iva_generado')::numeric = 201000 and (v_t ->> 'iva_descontable')::numeric = 200000 and (v_t ->> 'saldo')::numeric = 1000
       and (v_t ->> 'otros_movimientos')::numeric = -10000 and (v_t ->> 'documentos')::int = 5 and (v_t ->> 'por_revisar')::int = 4);
  insert into r (escenario, verificacion, esperado, obtenido, ok) values
    ('B', 'V4 y su contra-asiento (mismo mes)', 'no aparecen en ningún renglón',
     case when v_b::text like '%' || (select v from ctx where k = 'je_v4') || '%' then 'APARECE' else 'no aparecen' end,
     not exists (select 1 from jsonb_array_elements(v_b -> 'renglones') x, jsonb_array_elements_text(x -> 'asientos') a(id)
                  where a.id in ((select v from ctx where k = 'je_v4'), (select v from ctx where k = 'je_v4_rev'))));
  insert into r (escenario, verificacion, esperado, obtenido, ok) values
    ('B', 'Cuentas 2408 que reporta el borrador', 'las del libro (informativo)', v_b ->> 'cuentas', true);

  -- Reconciliación: neto del libro 2408 = generado − descontable + otros movimientos.
  select round(sum(l.credit - l.debit)) into v_libro
    from public.journal_entries je join public.journal_lines l on l.journal_entry_id = je.id
   where je.organization_id = 374 and je.posted and l.account_code like '2408%'
     and je.entry_date >= ('2026-11-01'::timestamp at time zone 'America/Bogota')
     and je.entry_date < ('2026-12-01'::timestamp at time zone 'America/Bogota');
  insert into r (escenario, verificacion, esperado, obtenido, ok) values
    ('R', 'Reconciliación: neto del libro 2408 (SELECT directo) = generado − descontable + otros', '-9000 = 201000 − 200000 + (−10000)',
     format('libro %s · borrador %s', v_libro, (v_t ->> 'iva_generado')::numeric - (v_t ->> 'iva_descontable')::numeric + (v_t ->> 'otros_movimientos')::numeric),
     v_libro = (v_t ->> 'iva_generado')::numeric - (v_t ->> 'iva_descontable')::numeric + (v_t ->> 'otros_movimientos')::numeric);
  insert into r (escenario, verificacion, esperado, obtenido, ok) values
    ('R', 'Reconciliación: la suma de los renglones de cada lado = su total', 'generado 201000 · descontable 200000',
     format('generado %s · descontable %s',
            (select sum((x ->> 'valor')::numeric) from jsonb_array_elements(v_b -> 'renglones') x where x ->> 'lado' = 'generado'),
            (select sum((x ->> 'valor')::numeric) from jsonb_array_elements(v_b -> 'renglones') x where x ->> 'lado' = 'descontable')),
     (select sum((x ->> 'valor')::numeric) from jsonb_array_elements(v_b -> 'renglones') x where x ->> 'lado' = 'generado') = (v_t ->> 'iva_generado')::numeric
       and (select sum((x ->> 'valor')::numeric) from jsonb_array_elements(v_b -> 'renglones') x where x ->> 'lado' = 'descontable') = (v_t ->> 'iva_descontable')::numeric);

  -- Periodo inválido.
  v_err := null;
  begin perform public.fn_tributario_borrador_iva(374, '2026-11-30', '2026-11-01');
  exception when others then v_err := sqlerrm; end;
  insert into r (escenario, verificacion, esperado, obtenido, ok) values ('P', 'Periodo con «hasta» antes de «desde»', 'rechaza: PERIODO_INVALIDO', coalesce(v_err, 'NO RECHAZÓ'), v_err = 'PERIODO_INVALIDO');
  v_err := null;
  begin perform public.fn_tributario_borrador_iva(374, '2025-01-01', '2026-11-30');
  exception when others then v_err := sqlerrm; end;
  insert into r (escenario, verificacion, esperado, obtenido, ok) values ('P', 'Periodo de más de 366 días', 'rechaza: PERIODO_INVALIDO', coalesce(v_err, 'NO RECHAZÓ'), v_err = 'PERIODO_INVALIDO');
  -- Solo lectura: el borrador no escribe.
  insert into r (escenario, verificacion, esperado, obtenido, ok) values
    ('P', 'La función es de solo lectura', 'declarada STABLE (no puede escribir en tablas)',
     (select case p.provolatile when 's' then 'STABLE' when 'i' then 'IMMUTABLE' else 'VOLATILE' end from pg_proc p where p.oid = 'public.fn_tributario_borrador_iva(integer,date,date)'::regprocedure),
     (select p.provolatile = 's' from pg_proc p where p.oid = 'public.fn_tributario_borrador_iva(integer,date,date)'::regprocedure));
end
$$;

-- ── Permisos: miembro sin finance.view, no miembro, anon ──
reset role;
select set_config('request.jwt.claims', '', true);
update public.organization_members set is_super_admin = false, role_id = 4
 where organization_id = 374 and user_id = 'bb11d6d2-f647-49f7-9b29-aa4c4438abf1';
select set_config('request.jwt.claims', '{"sub":"bb11d6d2-f647-49f7-9b29-aa4c4438abf1","role":"authenticated"}', true);
set local role authenticated;
do $$
declare v_err text;
begin
  v_err := null;
  begin perform public.fn_tributario_borrador_iva(374, '2026-11-01', '2026-11-30');
  exception when others then v_err := sqlerrm; end;
  insert into r (escenario, verificacion, esperado, obtenido, ok) values ('P', 'Miembro rol Empleado (sin finance.view)', 'rechaza: SIN_PERMISO', coalesce(v_err, 'NO RECHAZÓ'), v_err = 'SIN_PERMISO');
end
$$;
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
do $$
declare v_err text;
begin
  v_err := null;
  begin perform public.fn_tributario_borrador_iva(374, '2026-11-01', '2026-11-30');
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
  begin perform public.fn_tributario_borrador_iva(374, '2026-11-01', '2026-11-30');
  exception when others then v_err := sqlerrm; end;
  insert into r (escenario, verificacion, esperado, obtenido, ok) values ('P', 'anon', 'rechaza: permiso denegado sobre la función', coalesce(v_err, 'NO RECHAZÓ'), v_err like 'permission denied%');
end
$$;

reset role;
select n, escenario, verificacion, esperado, obtenido, ok from r
union all
select 999, 'JSON', 'Respuesta completa del borrador', null, (select v from ctx where k = 'borrador'), null
order by 1;

rollback;
