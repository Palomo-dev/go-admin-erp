-- Reversión de 20261125170000_factura_pedido_web_a_nombre_de_empresa.
--
-- Devuelve las cinco funciones a como estaban (reemplazo inverso de cada fragmento, con la misma
-- comprobación de que aparece una sola vez; en el trigger, primero el bloque y luego las variables que
-- usa, porque plpgsql valida el cuerpo al recrearlo) y quita fn_web_order_cliente_factura. NO cambia las
-- facturas, carteras ni asientos ya creados a nombre de la empresa: son documentos emitidos.
-- Antes de aplicarla, retirar del ERP las llamadas a la RPC fn_web_order_cliente_factura
-- (src/lib/pos/pedidosWeb/adquirientePedido.ts): sin la función, el ERP vuelve a facturar a la
-- persona del pedido (respaldo del helper), pero deja un error en el log en cada confirmación.

DO $reversion$
DECLARE
  r record;
  v_def text;
  v_n integer;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      (1, 'public.fn_cobrar_pedido_web_en_caja(uuid,text,jsonb,text,numeric)',
       $v$v_wo.branch_id, public.fn_web_order_cliente_factura(v_wo.id), v_wo.sale_id$v$,
       $v$v_wo.branch_id, v_wo.customer_id, v_wo.sale_id$v$),
      (2, 'public.fn_marcar_pedido_web_pagado_pasarela(uuid,jsonb)',
       $v$v_wo.branch_id, public.fn_web_order_cliente_factura(v_wo.id), v_wo.sale_id$v$,
       $v$v_wo.branch_id, v_wo.customer_id, v_wo.sale_id$v$),
      (3, 'public.fn_auto_journal_web_order()',
       $v$new.organization_id, new.branch_id, nullif(public.fn_web_order_cliente_factura(new.id), new.customer_id), new.sale_id$v$,
       $v$new.organization_id, new.branch_id, null, new.sale_id$v$),
      (4, 'public.fn_tercero_de_documento(text,uuid)',
       $v$-- Anticipo de contraentrega (20261125120000): el adquiriente del pedido web (20261125170000:
    -- la empresa del NIT o el cliente del pedido, fn_web_order_cliente_factura).$v$,
       $v$-- Anticipo de contraentrega (20261125120000): el cliente del pedido web.$v$),
      (5, 'public.fn_tercero_de_documento(text,uuid)',
       $v$on c.id = public.fn_web_order_cliente_factura(w.id)$v$,
       $v$on c.id = w.customer_id$v$),
      (6, 'public.fn_tercero_de_documento(text,uuid)',
       $v$on c.id = coalesce(
               -- Venta de un pedido web (20261125170000): el adquiriente de su factura.
               (select public.fn_web_order_cliente_factura(w.id)
                  from public.web_orders w
                 where w.sale_id = s.id and w.organization_id = s.organization_id
                 order by w.created_at
                 limit 1),
               s.customer_id)$v$,
       $v$on c.id = s.customer_id$v$),
      (8, 'public.fn_trg_tercero_linea_asiento()',
       $v$  v_pedido uuid;
  v_pago uuid;
  v_factura uuid;
begin$v$,
       $v$  v_pedido uuid;
begin$v$),
      (7, 'public.fn_trg_tercero_linea_asiento()',
       $v$    -- Cruce y devolución del anticipo (20261125170000): 1305 con el tercero de la factura a la
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
      end if;$v$,
       $v$    if v_pedido is not null then
      select t.nit, t.nombre into v_nit, v_nombre
        from public.fn_tercero_de_documento('pedido_web', v_pedido) t;$v$)
    ) AS t(orden, fn, viejo, nuevo)
    ORDER BY orden
  LOOP
    v_def := pg_get_functiondef(r.fn::regprocedure);
    v_n := (length(v_def) - length(replace(v_def, r.viejo, ''))) / length(r.viejo);
    IF v_n <> 1 THEN
      RAISE EXCEPTION 'Paso %: en % el fragmento aparece % veces (se esperaba 1). No se cambió nada.',
        r.orden, r.fn, v_n;
    END IF;
    EXECUTE replace(v_def, r.viejo, r.nuevo);
  END LOOP;
END;
$reversion$;

DROP FUNCTION IF EXISTS public.fn_web_order_cliente_factura(uuid);
