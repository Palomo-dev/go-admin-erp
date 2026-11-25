-- Reversión de 20261125200000_facturar_a_persona_o_empresa.
--
-- Devuelve pos_checkout_v1, fn_factura_venta_guardar y fn_membresias_activar_venta a como estaban
-- (reemplazo inverso de cada fragmento, con la misma comprobación de que aparece una sola vez; todos
-- los de una función se aplican juntos y se recrea una sola vez, así plpgsql nunca ve una variable
-- usada sin declarar), quita fn_cliente_puede_facturar_a y las columnas contact_customer_id.
--
-- ADVERTENCIA: NO revierte datos. Las ventas y facturas ya emitidas a nombre de una empresa siguen a
-- su nombre (son documentos emitidos, con su cartera y asientos). Al quitar las columnas se pierde
-- quién recibió cada una (contact_customer_id). Antes de aplicarla, retirar del ERP el envío de
-- contact_customer_id (src/lib/clientes/facturarA.ts): sin las columnas, pos_checkout_v1 ignora el
-- campo y la venta sale a nombre del customer_id del sobre.

DO $reversion$
DECLARE
  f text;
  r record;
  v_def text;
  v_n integer;
BEGIN
  FOREACH f IN ARRAY array[
    'public.pos_checkout_v1(jsonb)',
    'public.fn_factura_venta_guardar(integer,uuid,jsonb)',
    'public.fn_membresias_activar_venta(uuid,uuid,text,boolean)'
  ] LOOP
    v_def := pg_get_functiondef(f::regprocedure);
    FOR r IN
      SELECT * FROM (VALUES
        -- pos_checkout_v1 (orden inverso: primero los usos, al final la declaración) ──
        (7, 'public.pos_checkout_v1(jsonb)',
         $v$      coalesce((v_inv->>'commission_amount')::numeric, 0),
      v_contacto
    ) returning * into v_invoice;$v$,
         $v$      coalesce((v_inv->>'commission_amount')::numeric, 0)
    ) returning * into v_invoice;$v$),
        (6, 'public.pos_checkout_v1(jsonb)',
         $v$      created_by, notes, salesperson_id, commission_rate, commission_type, commission_method, commission_amount,
      contact_customer_id
    ) values ($v$,
         $v$      created_by, notes, salesperson_id, commission_rate, commission_type, commission_method, commission_amount
    ) values ($v$),
        (5, 'public.pos_checkout_v1(jsonb)',
         $v$        public.fn_venta_reventa_de(v_org, p_envelope),
        v_contacto
      ) returning * into v_sale;$v$,
         $v$        public.fn_venta_reventa_de(v_org, p_envelope)
      ) returning * into v_sale;$v$),
        (4, 'public.pos_checkout_v1(jsonb)',
         $v$        device_created_at, clock_skew_seconds, time_review_reason, resale_of_return_id,
        contact_customer_id
      ) values ($v$,
         $v$        device_created_at, clock_skew_seconds, time_review_reason, resale_of_return_id
      ) values ($v$),
        (3, 'public.pos_checkout_v1(jsonb)',
         $v$v_item || jsonb_build_object('_lista_cliente', coalesce(v_customer, v_contacto))$v$,
         $v$v_item || jsonb_build_object('_lista_cliente', v_customer)$v$),
        (2, 'public.pos_checkout_v1(jsonb)',
         $v$  -- Facturar a (20261125200000): con contact_customer_id el sobre trae como customer_id al
  -- ADQUIRIENTE (la empresa escogida; null = consumidor final) y como contacto a la persona del
  -- carrito. La empresa debe estar ligada a la persona y las dos ser de la organización.
  -- Sin el campo: exactamente como antes.
  v_contacto := nullif(p_envelope->>'contact_customer_id', '')::uuid;
  if v_contacto is not null then
    if v_mode = 'settle' then
      raise exception 'facturar_a_no_aplica' using errcode = '22023',
        detail = 'El cobro de una venta existente conserva el cliente de su factura.';
    end if;
    if not exists (select 1 from public.customers c where c.id = v_contacto and c.organization_id = v_org) then
      raise exception 'empresa_no_ligada' using errcode = '42501',
        detail = 'La persona que recibe no es de la organización.';
    end if;
    if v_customer is not null and not public.fn_cliente_puede_facturar_a(v_org, v_contacto, v_customer) then
      raise exception 'empresa_no_ligada' using errcode = '42501',
        detail = 'La empresa no está ligada a la persona del carrito o no es de la organización.';
    end if;
  end if;
  if v_customer is not null and not exists (
    select 1 from public.customers c where c.id = v_customer and c.organization_id = v_org
  ) then$v$,
         $v$  if v_customer is not null and not exists (
    select 1 from public.customers c where c.id = v_customer and c.organization_id = v_org
  ) then$v$),
        (1, 'public.pos_checkout_v1(jsonb)',
         $v$  v_membresias  jsonb;      -- Membresías (20260929001100): activadas o pendientes por esta venta
  v_contacto    uuid;       -- Facturar a (20261125200000): la persona que recibe (contact_customer_id)$v$,
         $v$  v_membresias  jsonb;      -- Membresías (20260929001100): activadas o pendientes por esta venta$v$),
        -- fn_factura_venta_guardar ────────────────────────────────────────────
        (18, 'public.fn_factura_venta_guardar(integer,uuid,jsonb)',
         $v$        notes = nullif(p_datos->>'notes', ''), tax_included = v_incluido,
        contact_customer_id = v_contacto, updated_at = now()
      where id = v_sale_id and organization_id = p_org and status = 'pending';$v$,
         $v$        notes = nullif(p_datos->>'notes', ''), tax_included = v_incluido, updated_at = now()
      where id = v_sale_id and organization_id = p_org and status = 'pending';$v$),
        (17, 'public.fn_factura_venta_guardar(integer,uuid,jsonb)',
         $v$      terms_conditions = nullif(btrim(coalesce(p_datos->>'terms_conditions', '')), ''),
      contact_customer_id = v_contacto, updated_at = now()
    where id = v_id;$v$,
         $v$      terms_conditions = nullif(btrim(coalesce(p_datos->>'terms_conditions', '')), ''), updated_at = now()
    where id = v_id;$v$),
        (16, 'public.fn_factura_venta_guardar(integer,uuid,jsonb)',
         $v$      nullif(btrim(coalesce(p_datos->>'terms_conditions', '')), ''),
      v_contacto
    )
    returning id into v_id;$v$,
         $v$      nullif(btrim(coalesce(p_datos->>'terms_conditions', '')), '')
    )
    returning id into v_id;$v$),
        (15, 'public.fn_factura_venta_guardar(integer,uuid,jsonb)',
         $v$      terms_conditions, contact_customer_id
    ) values ($v$,
         $v$      terms_conditions
    ) values ($v$),
        (14, 'public.fn_factura_venta_guardar(integer,uuid,jsonb)',
         $v$      nullif(p_datos->>'notes', ''), 0, v_incluido,
      v_contacto
    )
    returning id into v_sale_id;$v$,
         $v$      nullif(p_datos->>'notes', ''), 0, v_incluido
    )
    returning id into v_sale_id;$v$),
        (13, 'public.fn_factura_venta_guardar(integer,uuid,jsonb)',
         $v$      status, payment_status, source, include_in_cash_register, notes, discount_total, tax_included,
      contact_customer_id
    ) values ($v$,
         $v$      status, payment_status, source, include_in_cash_register, notes, discount_total, tax_included
    ) values ($v$),
        (12, 'public.fn_factura_venta_guardar(integer,uuid,jsonb)',
         $v$  v_customer := nullif(p_datos->>'customer_id', '')::uuid;
  -- Facturar a (20261125200000): customer_id es el adquiriente (empresa escogida o null = consumidor
  -- final) y contact_customer_id la persona que recibe. La empresa debe estar ligada a la persona.
  v_contacto := nullif(p_datos->>'contact_customer_id', '')::uuid;
  if v_contacto is not null then
    if not exists (select 1 from public.customers c where c.id = v_contacto and c.organization_id = p_org) then
      raise exception 'empresa_no_ligada' using errcode = '42501';
    end if;
    if v_customer is not null and not public.fn_cliente_puede_facturar_a(p_org, v_contacto, v_customer) then
      raise exception 'empresa_no_ligada' using errcode = '42501';
    end if;
  end if;
$v$,
         $v$  v_customer := nullif(p_datos->>'customer_id', '')::uuid;
$v$),
        (11, 'public.fn_factura_venta_guardar(integer,uuid,jsonb)',
         $v$  v_nombre_vendedor text;
  v_contacto uuid;  -- Facturar a (20261125200000): la persona que recibe
$v$,
         $v$  v_nombre_vendedor text;
$v$),
        -- fn_membresias_activar_venta ─────────────────────────────────────────
        (21, 'public.fn_membresias_activar_venta(uuid,uuid,text,boolean)',
         $v$  -- Facturar a (20261125200000): la membresía es de la persona que recibe, no de la empresa.
  v_customer := coalesce(v_sale.contact_customer_id, v_sale.customer_id, v_inv.customer_id);$v$,
         $v$  v_customer := coalesce(v_sale.customer_id, v_inv.customer_id);$v$)
      ) AS t(orden, fn, viejo, nuevo)
      WHERE t.fn = f
      ORDER BY orden DESC
    LOOP
      v_n := (length(v_def) - length(replace(v_def, r.viejo, ''))) / length(r.viejo);
      IF v_n <> 1 THEN
        RAISE EXCEPTION 'Paso %: en % el fragmento aparece % veces (se esperaba 1). No se cambió nada.',
          r.orden, r.fn, v_n;
      END IF;
      v_def := replace(v_def, r.viejo, r.nuevo);
    END LOOP;
    EXECUTE v_def;
  END LOOP;
END;
$reversion$;

drop function if exists public.fn_cliente_puede_facturar_a(integer, uuid, uuid);

drop index if exists public.idx_sales_contact_customer;
drop index if exists public.idx_invoice_sales_contact_customer;
alter table public.sales drop column if exists contact_customer_id;
alter table public.invoice_sales drop column if exists contact_customer_id;
