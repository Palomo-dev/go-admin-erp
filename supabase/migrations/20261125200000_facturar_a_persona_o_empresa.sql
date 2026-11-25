-- Facturar a: persona o empresa (Figma «06 Clientes», sección 3201-21438, 2026-11-25), con el cambio
-- del dueño: el cobro NO se bloquea; arranca en la persona y la empresa se escoge con un toque.
--
-- Regla contable aprobada:
--   · Con empresa escogida, la venta y la factura quedan con customer_id = la EMPRESA (adquiriente):
--     datos fiscales, cartera (el insert de invoice_sales la crea) y retenciones a su nombre.
--   · La persona del carrito queda como CONTACTO (quien recibe) en la columna nueva
--     contact_customer_id de sales e invoice_sales; no va como adquiriente. Las membresías vendidas
--     siguen en la persona (fn_membresias_activar_venta lee primero el contacto).
--   · «Consumidor final» explícito con una persona que sí tiene documento: customer_id = null
--     (la cola de Factus factura a 222222222222) y contacto = la persona.
--   · La lista de precios es la del adquiriente (o la del contacto si no hay adquiriente).
--   · El servidor valida que la empresa esté ligada a la persona (customer_company_links o
--     parent_customer_id) y que ambas sean de la organización; si no: 'empresa_no_ligada' (42501).
--   · Sin contact_customer_id en el sobre / en los datos: exactamente el comportamiento de antes.
--
-- Aditiva: dos columnas NULL-ables, una función nueva y cambios de texto exacto en las funciones
-- VIGENTES (pg_get_functiondef + replace, cada fragmento debe aparecer exactamente una vez; si alguno
-- cambió de forma, la migración falla entera sin tocar nada). Así se conserva lo que otras migraciones
-- hicieron en ellas.

-- ── 1. Columnas: quien recibe ─────────────────────────────────────────────────
alter table public.sales
  add column if not exists contact_customer_id uuid references public.customers(id) on delete set null;
alter table public.invoice_sales
  add column if not exists contact_customer_id uuid references public.customers(id) on delete set null;

comment on column public.sales.contact_customer_id is
  'Facturar a (20261125200000): la persona que recibe cuando la factura sale a una empresa ligada o a consumidor final. customer_id es el adquiriente. NULL = el adquiriente es la misma persona (como siempre).';
comment on column public.invoice_sales.contact_customer_id is
  'Facturar a (20261125200000): la persona que recibe (contacto). No va como adquiriente en la factura electrónica: el adquiriente es customer_id.';

create index if not exists idx_sales_contact_customer
  on public.sales (contact_customer_id) where contact_customer_id is not null;
create index if not exists idx_invoice_sales_contact_customer
  on public.invoice_sales (contact_customer_id) where contact_customer_id is not null;

-- ── 2. ¿La persona puede facturar a nombre de esta empresa? ───────────────────
create or replace function public.fn_cliente_puede_facturar_a(p_org integer, p_persona uuid, p_empresa uuid)
returns boolean
language sql
stable
set search_path to 'public', 'pg_temp'
as $function$
  -- Las dos fichas de la organización y la empresa ligada a la persona: enlace de contacto
  -- (customer_company_links) o la empresa de su ficha (parent_customer_id, p. ej. la del pedido web).
  -- SECURITY INVOKER: desde pos_checkout_v1 y fn_factura_venta_guardar corre con sus permisos.
  select exists (
    select 1
      from public.customers p
      join public.customers e on e.id = p_empresa and e.organization_id = p_org and e.id <> p.id
     where p.id = p_persona
       and p.organization_id = p_org
       and (
         p.parent_customer_id = e.id
         or exists (
           select 1 from public.customer_company_links l
            where l.organization_id = p_org and l.person_id = p.id and l.company_id = e.id
         )
       )
  );
$function$;

revoke all on function public.fn_cliente_puede_facturar_a(integer, uuid, uuid) from public, anon;
grant execute on function public.fn_cliente_puede_facturar_a(integer, uuid, uuid) to authenticated, service_role;

-- ── 3. pos_checkout_v1, fn_factura_venta_guardar y fn_membresias_activar_venta ─
DO $migracion$
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
        -- pos_checkout_v1 ─────────────────────────────────────────────────────
        (1, 'public.pos_checkout_v1(jsonb)',
         $v$  v_membresias  jsonb;      -- Membresías (20260929001100): activadas o pendientes por esta venta$v$,
         $v$  v_membresias  jsonb;      -- Membresías (20260929001100): activadas o pendientes por esta venta
  v_contacto    uuid;       -- Facturar a (20261125200000): la persona que recibe (contact_customer_id)$v$),
        (2, 'public.pos_checkout_v1(jsonb)',
         $v$  if v_customer is not null and not exists (
    select 1 from public.customers c where c.id = v_customer and c.organization_id = v_org
  ) then$v$,
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
  ) then$v$),
        (3, 'public.pos_checkout_v1(jsonb)',
         $v$v_item || jsonb_build_object('_lista_cliente', v_customer)$v$,
         $v$v_item || jsonb_build_object('_lista_cliente', coalesce(v_customer, v_contacto))$v$),
        (4, 'public.pos_checkout_v1(jsonb)',
         $v$        device_created_at, clock_skew_seconds, time_review_reason, resale_of_return_id
      ) values ($v$,
         $v$        device_created_at, clock_skew_seconds, time_review_reason, resale_of_return_id,
        contact_customer_id
      ) values ($v$),
        (5, 'public.pos_checkout_v1(jsonb)',
         $v$        public.fn_venta_reventa_de(v_org, p_envelope)
      ) returning * into v_sale;$v$,
         $v$        public.fn_venta_reventa_de(v_org, p_envelope),
        v_contacto
      ) returning * into v_sale;$v$),
        (6, 'public.pos_checkout_v1(jsonb)',
         $v$      created_by, notes, salesperson_id, commission_rate, commission_type, commission_method, commission_amount
    ) values ($v$,
         $v$      created_by, notes, salesperson_id, commission_rate, commission_type, commission_method, commission_amount,
      contact_customer_id
    ) values ($v$),
        (7, 'public.pos_checkout_v1(jsonb)',
         $v$      coalesce((v_inv->>'commission_amount')::numeric, 0)
    ) returning * into v_invoice;$v$,
         $v$      coalesce((v_inv->>'commission_amount')::numeric, 0),
      v_contacto
    ) returning * into v_invoice;$v$),
        -- fn_factura_venta_guardar ────────────────────────────────────────────
        (11, 'public.fn_factura_venta_guardar(integer,uuid,jsonb)',
         $v$  v_nombre_vendedor text;
$v$,
         $v$  v_nombre_vendedor text;
  v_contacto uuid;  -- Facturar a (20261125200000): la persona que recibe
$v$),
        (12, 'public.fn_factura_venta_guardar(integer,uuid,jsonb)',
         $v$  v_customer := nullif(p_datos->>'customer_id', '')::uuid;
$v$,
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
$v$),
        (13, 'public.fn_factura_venta_guardar(integer,uuid,jsonb)',
         $v$      status, payment_status, source, include_in_cash_register, notes, discount_total, tax_included
    ) values ($v$,
         $v$      status, payment_status, source, include_in_cash_register, notes, discount_total, tax_included,
      contact_customer_id
    ) values ($v$),
        (14, 'public.fn_factura_venta_guardar(integer,uuid,jsonb)',
         $v$      nullif(p_datos->>'notes', ''), 0, v_incluido
    )
    returning id into v_sale_id;$v$,
         $v$      nullif(p_datos->>'notes', ''), 0, v_incluido,
      v_contacto
    )
    returning id into v_sale_id;$v$),
        (15, 'public.fn_factura_venta_guardar(integer,uuid,jsonb)',
         $v$      terms_conditions
    ) values ($v$,
         $v$      terms_conditions, contact_customer_id
    ) values ($v$),
        (16, 'public.fn_factura_venta_guardar(integer,uuid,jsonb)',
         $v$      nullif(btrim(coalesce(p_datos->>'terms_conditions', '')), '')
    )
    returning id into v_id;$v$,
         $v$      nullif(btrim(coalesce(p_datos->>'terms_conditions', '')), ''),
      v_contacto
    )
    returning id into v_id;$v$),
        (17, 'public.fn_factura_venta_guardar(integer,uuid,jsonb)',
         $v$      terms_conditions = nullif(btrim(coalesce(p_datos->>'terms_conditions', '')), ''), updated_at = now()
    where id = v_id;$v$,
         $v$      terms_conditions = nullif(btrim(coalesce(p_datos->>'terms_conditions', '')), ''),
      contact_customer_id = v_contacto, updated_at = now()
    where id = v_id;$v$),
        (18, 'public.fn_factura_venta_guardar(integer,uuid,jsonb)',
         $v$        notes = nullif(p_datos->>'notes', ''), tax_included = v_incluido, updated_at = now()
      where id = v_sale_id and organization_id = p_org and status = 'pending';$v$,
         $v$        notes = nullif(p_datos->>'notes', ''), tax_included = v_incluido,
        contact_customer_id = v_contacto, updated_at = now()
      where id = v_sale_id and organization_id = p_org and status = 'pending';$v$),
        -- fn_membresias_activar_venta ─────────────────────────────────────────
        (21, 'public.fn_membresias_activar_venta(uuid,uuid,text,boolean)',
         $v$  v_customer := coalesce(v_sale.customer_id, v_inv.customer_id);$v$,
         $v$  -- Facturar a (20261125200000): la membresía es de la persona que recibe, no de la empresa.
  v_customer := coalesce(v_sale.contact_customer_id, v_sale.customer_id, v_inv.customer_id);$v$)
      ) AS t(orden, fn, viejo, nuevo)
      WHERE t.fn = f
      ORDER BY orden
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
$migracion$;
