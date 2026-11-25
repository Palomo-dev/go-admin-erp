-- Reversión de 20261126000000_recaudo_1305_tercero.sql
--
-- 1. Quita la restricción (zzz_trg_1305_exige_tercero y su función).
-- 2. Borra EXACTAMENTE los asientos de ajuste de la asignación de tercero (fact_key
--    recaudo_1305_tercero:<línea>) con el interruptor de mantenimiento de asientos publicados.
--    Los números de nota contable (NA) que tomaron quedan saltados: el consecutivo no retrocede.
-- 3. Devuelve fn_trg_tercero_linea_asiento a la versión anterior (20261125170000).
-- 4. Borra las funciones de resolución del tercero de la cartera.
--
-- Las líneas 1305 que se registraron con tercero mientras estuvo la migración lo conservan (no se
-- editan asientos por una reversión).

DROP TRIGGER IF EXISTS zzz_trg_1305_exige_tercero ON public.journal_lines;
DROP FUNCTION IF EXISTS public.fn_trg_1305_exige_tercero();

DO $borrar$
declare
  v_l integer;
  v_e integer;
begin
  perform set_config('app.contabilidad_mantenimiento', 'on', true);
  delete from public.journal_lines l
   using public.journal_entries e
   where l.journal_entry_id = e.id
     and e.fact_key like 'recaudo_1305_tercero:%';
  get diagnostics v_l = row_count;
  delete from public.journal_entries e
   where e.fact_key like 'recaudo_1305_tercero:%';
  get diagnostics v_e = row_count;
  perform set_config('app.contabilidad_mantenimiento', '', true);
  raise notice 'Ajustes de asignación de tercero borrados: % asientos, % líneas', v_e, v_l;
end
$borrar$;

CREATE OR REPLACE FUNCTION public.fn_trg_tercero_linea_asiento()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_source text;
  v_source_id text;
  v_org integer;
  v_fact text;
  v_nit text;
  v_nombre text;
  v_persona uuid;
  v_sale uuid;
  v_pedido uuid;
  v_pago uuid;
  v_factura uuid;
begin
  if new.tercero_nit is not null then
    return new;
  end if;
  select e.source, e.source_id, e.organization_id, e.fact_key
    into v_source, v_source_id, v_org, v_fact
    from public.journal_entries e
   where e.id = new.journal_entry_id;
  -- Cuenta por cobrar a un procesador de pago (138020xx): el tercero es el
  -- procesador, en cualquier asiento (cobro, abono, anulación). Contador 2026-11-21.
  if new.account_code like '138020%' and new.tercero_nombre is null then
    select p.nit, p.nombre into v_nit, v_nombre
      from public.fn_procesador_pago_por_cuenta(v_org, new.account_code) p;
    if v_nombre is not null then
      new.tercero_nit := v_nit;
      new.tercero_nombre := v_nombre;
      return new;
    end if;
  end if;
  -- Anticipo de contraentrega (20261125120000): 2805 y 1305 con el cliente del pedido, en el
  -- recibo (source payments), el ajuste, el cruce al facturar y la devolución (web_order_advance).
  if (new.account_code like '2805%' or new.account_code like '1305%')
     and (v_source = 'web_order_advance'
          or (v_source = 'payments' and new.account_code like '2805%')) then
    begin
      if v_source = 'web_order_advance' then
        v_pedido := v_source_id::uuid;
      else
        v_pedido := public.fn_anticipo_pedido_web_de_pago(v_source_id::uuid);
      end if;
    exception when others then
      v_pedido := null;
    end;
    -- Cruce y devolución del anticipo (20261125170000): 1305 con el tercero de la factura a la
    -- que se aplicó (el de su devengo) y 2805 con el tercero con el que se recibió el anticipo.
    if v_pedido is not null and v_source = 'web_order_advance' then
      if coalesce(v_fact, '') like 'web_order_advance:apply:%' then
        begin
          v_pago := split_part(v_fact, ':', 3)::uuid;
        exception when others then
          v_pago := null;
        end;
      else
        select p.id into v_pago
          from public.payments p
         where p.organization_id = v_org
           and p.source = 'web_order' and p.source_id = v_pedido::text
           and p.status = 'completed'
           and coalesce(p.processor_response->>'concepto', '') = 'anticipo_contraentrega'
         order by p.created_at
         limit 1;
      end if;
      if v_pago is not null and new.account_code like '1305%' then
        select i.id into v_factura
          from public.payments p
          join public.invoice_sales i on i.id::text = p.source_id and i.organization_id = p.organization_id
         where p.id = v_pago and p.source = 'invoice_sales';
        if v_factura is not null then
          select t.nit, t.nombre into v_nit, v_nombre
            from public.fn_tercero_de_documento('venta', v_factura) t;
        end if;
      elsif v_pago is not null and new.account_code like '2805%' then
        select l.tercero_nit, l.tercero_nombre into v_nit, v_nombre
          from public.journal_entries e
          join public.journal_lines l on l.journal_entry_id = e.id
         where e.organization_id = v_org
           and e.fact_key in ('settlement:payment:' || v_pago::text, 'web_order_advance:reclass:' || v_pago::text)
           and l.account_code like '2805%'
           and l.credit > 0
           and l.tercero_nit is not null
         order by l.id
         limit 1;
      end if;
    end if;
    if v_pedido is not null then
      if v_nit is null then
        select t.nit, t.nombre into v_nit, v_nombre
          from public.fn_tercero_de_documento('pedido_web', v_pedido) t;
      end if;
      if v_nit is not null then
        new.tercero_nit := v_nit;
        new.tercero_nombre := coalesce(new.tercero_nombre, v_nombre);
      end if;
    end if;
    return new;
  end if;
  -- sales: el devengo del POS. La factura, si llega después, reutiliza la misma clave.
  if v_source is null or v_source not in ('invoice_sales', 'invoice_purchase', 'credit_note', 'cash_movements', 'support_documents', 'sales',
                                          'supplier_advance', 'supplier_advance_application', 'supplier_advance_refund',
                                          'tips', 'tip_settlements') then
    return new;
  end if;

  if v_source = 'cash_movements' then
    select nullif(btrim(cm.tercero_nit), ''), nullif(btrim(cm.tercero_nombre), '')
      into v_nit, v_nombre
      from public.cash_movements cm
     where cm.id::text = v_source_id and cm.organization_id = v_org;
  elsif v_source = 'invoice_purchase' then
    select t.nit, t.nombre into v_nit, v_nombre
      from public.fn_tercero_de_documento('compra', v_source_id::uuid) t;
  elsif v_source = 'support_documents' then
    select t.nit, t.nombre into v_nit, v_nombre
      from public.fn_tercero_de_documento('documento_soporte', v_source_id::uuid) t;
  elsif v_source in ('supplier_advance', 'supplier_advance_application', 'supplier_advance_refund') then
    select t.nit, t.nombre into v_nit, v_nombre
      from public.fn_tercero_anticipo_proveedor(v_source, v_source_id) t;
  elsif v_source = 'tips' then
    select tp.sale_id into v_sale from public.tips tp
     where tp.id::text = v_source_id and tp.organization_id = v_org;
    if v_sale is not null then
      select t.nit, t.nombre into v_nit, v_nombre
        from public.fn_tercero_de_documento('venta', v_sale) t;
    end if;
  elsif v_source = 'tip_settlements' then
    -- fact_key 'tip_settlement:<liquidación>:<persona>'
    begin
      v_persona := split_part(coalesce(v_fact, ''), ':', 3)::uuid;
    exception when others then
      v_persona := null;
    end;
    if v_persona is not null then
      select nullif(btrim(i.doc_number), ''), public.fn_hr_nombre_persona(hp.id)
        into v_nit, v_nombre
        from public.hr_people hp
        left join public.hr_people_identification i on i.person_id = hp.id
       where hp.organization_id = v_org and hp.user_id = v_persona
       order by (i.doc_number is null), hp.created_at
       limit 1;
      if v_nombre is null then
        select nullif(btrim(concat_ws(' ', p.first_name, p.last_name)), '') into v_nombre
          from public.profiles p where p.id = v_persona;
      end if;
    end if;
    if v_nit is null then
      select nullif(btrim(coalesce(o.nit, o.tax_id)), ''),
             coalesce(nullif(btrim(o.legal_name), ''), o.name)
               || case when v_nombre is not null then ' · propinas de ' || v_nombre else '' end
        into v_nit, v_nombre
        from public.organizations o where o.id = v_org;
    end if;
  else
    select t.nit, t.nombre into v_nit, v_nombre
      from public.fn_tercero_de_documento('venta', v_source_id::uuid) t;
  end if;

  if v_nit is not null then
    new.tercero_nit := v_nit;
    new.tercero_nombre := coalesce(new.tercero_nombre, v_nombre);
  end if;
  return new;
exception when others then
  return new;
end;
$function$;

DROP FUNCTION IF EXISTS public.fn_tercero_cartera_de_asiento(text, text, integer, text, integer);
DROP FUNCTION IF EXISTS public.fn_tercero_de_pago(uuid);
DROP FUNCTION IF EXISTS public.fn_tercero_reserva(uuid);
DROP FUNCTION IF EXISTS public.fn_tercero_cartera_cxc(uuid);
DROP FUNCTION IF EXISTS public.fn_tercero_cartera_factura(uuid);
DROP FUNCTION IF EXISTS public.fn_tercero_cartera_venta(integer, uuid);
DROP FUNCTION IF EXISTS public.fn_tercero_cliente(integer, uuid);
