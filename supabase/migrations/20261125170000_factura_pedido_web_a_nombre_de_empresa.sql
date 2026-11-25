-- Pedido web con factura a nombre de una empresa (NIT): factura, cartera y retenciones a nombre de
-- la EMPRESA, no de la persona que compró (criterio contable del dueño, 2026-11-25).
--
-- El adquiriente es quien paga y pide la factura. Con NIT: la empresa de ese NIT (la ficha que
-- dejó fn_web_order_documento_cliente en web_orders.billing_data.customer_id, o la que ligó la
-- revisión «Ligar»/«Usar este» de fn_web_order_revisar_factura). La persona queda como contacto:
-- sigue en web_orders.customer_id y en sales.customer_id (la venta no cambia). Sin NIT: persona
-- natural con su cédula o consumidor final, como hasta hoy.
--
-- Una sola regla en la base: fn_web_order_cliente_factura(pedido) → customer_id del adquiriente.
-- La usan todas las vías que crean invoice_sales desde un pedido web:
--   · fn_cobrar_pedido_web_en_caja (cobro en caja, contraentrega al facturar y el cuadre del
--     domiciliario, que la llama por logistica_cuadre_recibir_linea);
--   · fn_marcar_pedido_web_pagado_pasarela («Marcar como pagado» de un pedido de pasarela);
--   · fn_auto_journal_web_order (respaldo al confirmar un pedido pagado sin factura: hoy crea la
--     factura sin cliente; ahora lleva la empresa cuando la hay y sigue sin cliente si no);
--   · y el ERP (webOrderServerConfirmation / webOrderConfirmationService) la llama por RPC.
-- La cartera (accounts_receivable) nace del trigger de invoice_sales con el customer_id de la
-- factura: queda a nombre de la empresa sin escribirla a mano.
--
-- Terceros contables (fn_tercero_de_documento / fn_trg_tercero_linea_asiento):
--   · 'pedido_web' (recibo del anticipo de contraentrega, 2805): el adquiriente, no la persona.
--   · 'venta' por la venta (devengo POS accrual:sale, que la factura reutiliza): si la venta es de un
--     pedido web, el adquiriente del pedido; si no, el cliente de la venta como siempre.
--   · Cruce del anticipo al facturar (web_order_advance:apply): 1305 con el tercero de la FACTURA a
--     la que se aplicó el anticipo (el mismo del devengo, para que la cartera cuadre) y 2805 con el
--     tercero con el que se RECIBIÓ el anticipo (para que 2805 cierre en cero aunque la revisión haya
--     ligado la empresa después del recibo). Devolución del anticipo: 2805 con el tercero del recibo.
--
-- Retenciones: las ventas no calculan retenciones en la base (invoice_sales no tiene retenciones;
-- solo las compras: invoice_purchase_withholdings). Las de cada línea que viajan a Factus salen de la
-- línea, y el adquiriente del documento electrónico ya es la empresa (colaFacturacion.server.ts,
-- adquirienteFactura). Con la factura a nombre de la empresa, cualquier perfil tributario que se lea
-- por invoice_sales.customer_id es el de la empresa.
--
-- Se modifican las funciones VIGENTES por reemplazo de texto exacto (pg_get_functiondef + replace),
-- con la comprobación de que cada fragmento aparece exactamente una vez: así se conserva todo lo que
-- otras migraciones cambiaron en ellas (20261125120000 y siguientes) y, si alguna cambió de forma, la
-- migración falla entera sin tocar nada. Aditiva: una función nueva y cambios de una línea.

CREATE OR REPLACE FUNCTION public.fn_web_order_cliente_factura(p_order_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SET search_path TO 'public', 'pg_temp'
AS $function$
  -- Con NIT y empresa resuelta (billing_data.customer_id de una ficha de la misma organización): la
  -- empresa. Si no: el cliente del pedido, como siempre. SECURITY INVOKER: desde el navegador lee con
  -- la RLS del usuario; desde las funciones y triggers, con los permisos de quien la llama.
  select coalesce(
    (select c.id
       from public.customers c
      where upper(btrim(coalesce(w.billing_data->>'tipo', ''))) = 'NIT'
        and c.organization_id = w.organization_id
        and c.id = case
              when coalesce(w.billing_data->>'customer_id', '')
                   ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then (w.billing_data->>'customer_id')::uuid
            end),
    w.customer_id)
    from public.web_orders w
   where w.id = p_order_id;
$function$;

COMMENT ON FUNCTION public.fn_web_order_cliente_factura(uuid) IS
  'Adquiriente de la factura de un pedido web: la empresa del NIT (billing_data.customer_id) o el cliente del pedido. Regla única para factura, cartera y terceros.';

REVOKE ALL ON FUNCTION public.fn_web_order_cliente_factura(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_web_order_cliente_factura(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_web_order_cliente_factura(uuid) TO authenticated, service_role;

DO $migracion$
DECLARE
  r record;
  v_def text;
  v_n integer;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      (1, 'public.fn_cobrar_pedido_web_en_caja(uuid,text,jsonb,text,numeric)',
       $v$v_wo.branch_id, v_wo.customer_id, v_wo.sale_id$v$,
       $v$v_wo.branch_id, public.fn_web_order_cliente_factura(v_wo.id), v_wo.sale_id$v$),
      (2, 'public.fn_marcar_pedido_web_pagado_pasarela(uuid,jsonb)',
       $v$v_wo.branch_id, v_wo.customer_id, v_wo.sale_id$v$,
       $v$v_wo.branch_id, public.fn_web_order_cliente_factura(v_wo.id), v_wo.sale_id$v$),
      (3, 'public.fn_auto_journal_web_order()',
       $v$new.organization_id, new.branch_id, null, new.sale_id$v$,
       $v$new.organization_id, new.branch_id, nullif(public.fn_web_order_cliente_factura(new.id), new.customer_id), new.sale_id$v$),
      (4, 'public.fn_tercero_de_documento(text,uuid)',
       $v$-- Anticipo de contraentrega (20261125120000): el cliente del pedido web.$v$,
       $v$-- Anticipo de contraentrega (20261125120000): el adquiriente del pedido web (20261125170000:
    -- la empresa del NIT o el cliente del pedido, fn_web_order_cliente_factura).$v$),
      (5, 'public.fn_tercero_de_documento(text,uuid)',
       $v$on c.id = w.customer_id$v$,
       $v$on c.id = public.fn_web_order_cliente_factura(w.id)$v$),
      (6, 'public.fn_tercero_de_documento(text,uuid)',
       $v$on c.id = s.customer_id$v$,
       $v$on c.id = coalesce(
               -- Venta de un pedido web (20261125170000): el adquiriente de su factura.
               (select public.fn_web_order_cliente_factura(w.id)
                  from public.web_orders w
                 where w.sale_id = s.id and w.organization_id = s.organization_id
                 order by w.created_at
                 limit 1),
               s.customer_id)$v$),
      (7, 'public.fn_trg_tercero_linea_asiento()',
       $v$  v_pedido uuid;
begin$v$,
       $v$  v_pedido uuid;
  v_pago uuid;
  v_factura uuid;
begin$v$),
      (8, 'public.fn_trg_tercero_linea_asiento()',
       $v$    if v_pedido is not null then
      select t.nit, t.nombre into v_nit, v_nombre
        from public.fn_tercero_de_documento('pedido_web', v_pedido) t;$v$,
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
      end if;$v$)
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
$migracion$;
