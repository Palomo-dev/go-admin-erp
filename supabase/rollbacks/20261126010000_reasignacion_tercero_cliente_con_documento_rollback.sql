-- Reversión de 20261126010000_reasignacion_tercero_cliente_con_documento.sql
--
-- 1. Borra EXACTAMENTE los asientos de la reasignación (fact_key reasignacion_tercero:<factura>) y
--    sus líneas, con el interruptor de mantenimiento de asientos publicados. Los números de nota
--    contable (NA) que tomaron quedan saltados: el consecutivo no retrocede.
-- 2. Devuelve fn_tercero_cartera_factura y fn_tercero_cartera_venta a la versión de 20261126000000.
--
-- No toca facturas, recibos ni asientos originales (la migración tampoco los tocó).

DO $borrar$
declare
  v_l integer;
  v_e integer;
begin
  perform set_config('app.contabilidad_mantenimiento', 'on', true);
  delete from public.journal_lines l
   using public.journal_entries e
   where l.journal_entry_id = e.id
     and e.fact_key like 'reasignacion_tercero:%'
     and e.source = 'reasignacion_tercero';
  get diagnostics v_l = row_count;
  delete from public.journal_entries e
   where e.fact_key like 'reasignacion_tercero:%'
     and e.source = 'reasignacion_tercero';
  get diagnostics v_e = row_count;
  perform set_config('app.contabilidad_mantenimiento', '', true);
  raise notice 'Reasignación de tercero borrada: % asientos, % líneas', v_e, v_l;
end
$borrar$;

CREATE OR REPLACE FUNCTION public.fn_tercero_cartera_factura(p_invoice uuid, OUT nit text, OUT nombre text)
 RETURNS record
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_org integer;
  v_sale uuid;
begin
  nit := null;
  nombre := null;
  select i.organization_id, i.sale_id into v_org, v_sale
    from public.invoice_sales i where i.id = p_invoice;
  if v_org is null then
    return;
  end if;
  if v_sale is not null then
    select l.tercero_nit, l.tercero_nombre into nit, nombre
      from public.journal_entries e
      join public.journal_lines l on l.journal_entry_id = e.id
     where e.organization_id = v_org
       and e.fact_key = 'accrual:sale:' || v_sale::text
       and l.account_code like '1305%'
       and l.debit > 0
       and nullif(btrim(l.tercero_nit), '') is not null
     order by l.id
     limit 1;
  end if;
  if nit is null then
    select l.tercero_nit, l.tercero_nombre into nit, nombre
      from public.journal_entries e
      join public.journal_lines l on l.journal_entry_id = e.id
     where e.organization_id = v_org
       and e.source = 'invoice_sales'
       and e.source_id = p_invoice::text
       and e.fact_key like 'accrual:sale:%'
       and l.account_code like '1305%'
       and l.debit > 0
       and nullif(btrim(l.tercero_nit), '') is not null
     order by l.id
     limit 1;
  end if;
  if nit is null then
    select t.nit, t.nombre into nit, nombre from public.fn_tercero_de_documento('venta', p_invoice) t;
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.fn_tercero_cartera_venta(p_org integer, p_sale uuid, OUT nit text, OUT nombre text)
 RETURNS record
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  nit := null;
  nombre := null;
  if p_org is null or p_sale is null then
    return;
  end if;
  -- El tercero con el que la venta entró a la 1305 (devengo accrual:sale:<venta>).
  select l.tercero_nit, l.tercero_nombre
    into nit, nombre
    from public.journal_entries e
    join public.journal_lines l on l.journal_entry_id = e.id
   where e.organization_id = p_org
     and e.fact_key = 'accrual:sale:' || p_sale::text
     and l.account_code like '1305%'
     and l.debit > 0
     and nullif(btrim(l.tercero_nit), '') is not null
   order by l.id
   limit 1;
  -- Aún sin devengo (el recibo puede llegar antes): la misma regla con la que se devengará.
  if nit is null and exists (select 1 from public.sales s where s.id = p_sale and s.organization_id = p_org) then
    select t.nit, t.nombre into nit, nombre from public.fn_tercero_de_documento('venta', p_sale) t;
  end if;
end;
$function$;

REVOKE ALL ON FUNCTION public.fn_tercero_cartera_factura(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_tercero_cartera_venta(integer, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_tercero_cartera_factura(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_tercero_cartera_venta(integer, uuid) TO service_role;
