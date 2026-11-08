-- Prueba complementaria · Anticipos a proveedores: el control de cuadre PROPIO de la base
-- Fecha: 2026-11-07 · Proyecto taqjemqjtumhwptchcxk · Org 374. NO DEJA DATOS (begin … rollback).
--
-- La base tiene un control que rechaza cualquier asiento descuadrado (disparador trg_zz_asiento_cuadrado). Es
-- «diferido»: corre al confirmar la transacción. Como las pruebas terminan en rollback, en 01 el cuadre se comprobó con
-- una consulta propia (escenario h). Aquí se repiten las cuatro operaciones y se fuerza ese control con
-- SET CONSTRAINTS ALL IMMEDIATE: si un solo asiento no cuadrara, la sentencia fallaría con «asiento_descuadrado».

begin;

create temp table ctx (k text primary key, v text);
grant all on ctx to authenticated;
with s as (insert into public.suppliers (organization_id, name, nit, supplier_type) values (374, 'Proveedor de prueba A', '900000001', 'company') returning id)
insert into ctx select 'sup', id::text from s;
with f as (insert into public.invoice_purchase (organization_id, branch_id, supplier_id, number_ext, status, currency, issue_date)
           values (374, 585, (select v::int from ctx where k = 'sup'), 'PRUEBA-FC-001', 'draft', 'COP', now()) returning id)
insert into ctx select 'fc', id::text from f;
insert into public.invoice_items (invoice_id, invoice_type, invoice_purchase_id, description, qty, unit_price, tax_rate, tax_code, total_line)
select v::uuid, 'purchase', v::uuid, 'Mercancía de prueba', 1, 1000000, 19, 'IVA_19', 1190000 from ctx where k = 'fc';
update public.invoice_purchase set status = 'received' where id = (select v::uuid from ctx where k = 'fc');
insert into ctx select 'ap', id::text from public.accounts_payable where invoice_id = (select v::uuid from ctx where k = 'fc');
insert into ctx select 'max_je', coalesce(max(id), 0)::text from public.journal_entries where organization_id = 374;

select set_config('request.jwt.claims', '{"sub":"bb11d6d2-f647-49f7-9b29-aa4c4438abf1","role":"authenticated"}', true);
set local role authenticated;
do $$
declare v1 uuid; v2 uuid;
begin
  v1 := (public.fn_anticipo_proveedor_crear((select v::int from ctx where k = 'sup'), 585, 1000000, 'transfer', 'cuadre-1', 374, null, 'TRF-1') ->> 'anticipo_id')::uuid;
  perform public.fn_anticipo_proveedor_aplicar(v1, (select v::uuid from ctx where k = 'ap'), 400000, 'cuadre-apl-1', 374);
  perform public.fn_anticipo_proveedor_devolver(v1, 600000, 'transfer', 'Devolución de prueba', 'cuadre-dev-1', 374, null, 'TRF-2');
  v2 := (public.fn_anticipo_proveedor_crear((select v::int from ctx where k = 'sup'), 585, 900000, 'transfer', 'cuadre-2', 374, null, 'TRF-3') ->> 'anticipo_id')::uuid;
  perform public.fn_anticipo_proveedor_anular(v2, 'Anulación de prueba', 374);
end
$$;
reset role;

-- El control de cuadre de la base corre aquí, sobre todos los asientos de la transacción.
set constraints all immediate;

select count(*) as asientos_de_anticipo_validados_por_la_base,
       string_agg(distinct je.source, ', ') as origenes,
       bool_and(t.d = t.c) as todos_cuadran
  from public.journal_entries je
  join (select journal_entry_id, sum(debit) d, sum(credit) c from public.journal_lines group by 1) t on t.journal_entry_id = je.id
 where je.organization_id = 374 and je.id > (select v::int from ctx where k = 'max_je');

rollback;
