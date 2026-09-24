-- ============================================================================
-- POS · Liberar una mesa con saldo pendiente (decisión del dueño, 2026-09-23)
--
-- Antes: «Liberar mesa» cerraba la sesión, marcaba TODA la cocina como
-- entregada y dejaba la venta en `pending` para siempre (44 sesiones cerradas
-- así; docs/design/POS-MESAS-COMANDAS-RESERVAS.md, hallazgo D1).
--
-- Ahora la mesa solo se suelta después de resolver el saldo, en una sola
-- transacción:
--   · liberar  → solo si el saldo es 0.
--   · cartera  → la venta queda como cuenta por cobrar del cliente. Se
--                reutiliza `pos_checkout_v1` (el cobro del POS) con cero pagos:
--                crea la factura, descuenta stock y el disparador
--                `tr_create_account_receivable` crea la cartera. Nunca se
--                escribe `accounts_receivable` a mano.
--   · anular   → misma semántica que `VentasService.cancelSale` (estado `void`
--                y «[ANULADA] motivo» en las notas), solo si la venta no tiene
--                pagos ni factura; el permiso lo resuelve la ruta en el
--                servidor (`pos.void`) y llega como `p_puede_anular`.
-- La cocina deja de marcarse entregada a ciegas: lo `ready` pasa a `delivered`
-- (ya estaba cocinado); lo pendiente conserva su estado; al anular, lo que no
-- se entregó queda `cancelled` con el motivo.
--
-- Las tres funciones son SECURITY DEFINER y SOLO las ejecuta `service_role`:
-- la ruta `/api/pos/mesas/[id]/liberar` valida organización (sesión) y permiso
-- antes de llamarlas, y así nadie las invoca por PostgREST saltándose esa
-- comprobación. Aun así verifican que el actor sea miembro activo y que la
-- mesa sea de la organización.
-- ============================================================================

-- ── 1. Comandas canceladas ──────────────────────────────────────────────────
alter table public.kitchen_tickets add column if not exists cancelled_at timestamptz null;
alter table public.kitchen_tickets add column if not exists cancellation_reason text null;

comment on column public.kitchen_tickets.cancelled_at is
  'Cuándo se canceló la comanda (p. ej. al anular la venta de la mesa). NULL si no se canceló.';
comment on column public.kitchen_tickets.cancellation_reason is
  'Motivo de la cancelación, escrito por quien anuló la venta.';

-- Se amplía la lista de estados (no cambia el tipo ni ninguna fila existente).
alter table public.kitchen_tickets drop constraint if exists kitchen_tickets_status_check;
alter table public.kitchen_tickets add constraint kitchen_tickets_status_check
  check (status = any (array['new'::text, 'preparing'::text, 'ready'::text, 'delivered'::text, 'cancelled'::text]));

alter table public.kitchen_ticket_items drop constraint if exists kitchen_ticket_items_status_check;
alter table public.kitchen_ticket_items add constraint kitchen_ticket_items_status_check
  check (status = any (array['pending'::text, 'in_progress'::text, 'ready'::text, 'delivered'::text, 'cancelled'::text]));

-- ── 2. Saldo de la venta de una mesa (una sola definición) ───────────────────
-- total   : líneas de la venta (la fuente de verdad mientras no se cobra); si
--           ya se cobró sin división, el total que escribió el cobro.
-- pagado  : pagos completados de la venta (mesa: source 'sale') o de su factura
--           (POS: source 'invoice_sales'), netos del cambio.
-- saldo   : con división por ítems, lo que suman las líneas sin `paid_at`; si la
--           venta está `paid`, 0; si no, total − pagado.
create or replace function public.fn_pos_mesa_saldo(p_sale_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_sale             public.sales%rowtype;
  v_items_total      numeric;
  v_sin_pagar        numeric;
  v_division         boolean;
  v_pagado           numeric;
  v_total            numeric;
  v_saldo            numeric;
  v_facturas         integer;
  v_factura_saldo    numeric;
  v_factura_cliente  boolean;
begin
  select * into v_sale from public.sales s where s.id = p_sale_id;
  if not found then
    return null;
  end if;

  select coalesce(sum(si.total), 0),
         coalesce(sum(si.total) filter (where si.paid_at is null), 0),
         coalesce(bool_or(si.paid_by_split_id is not null), false)
    into v_items_total, v_sin_pagar, v_division
  from public.sale_items si
  where si.sale_id = p_sale_id;

  select coalesce(sum(p.amount - coalesce(p.change_amount, 0)), 0)
    into v_pagado
  from public.payments p
  where p.organization_id = v_sale.organization_id
    and p.status = 'completed'
    and (
      (p.source = 'sale' and p.source_id = p_sale_id::text)
      or (p.source = 'invoice_sales' and p.source_id in (
            select i.id::text from public.invoice_sales i
            where i.sale_id = p_sale_id and coalesce(i.document_type, 'invoice') = 'invoice'))
    );

  select count(*), coalesce(sum(i.balance), 0), coalesce(bool_and(i.customer_id is not null), false)
    into v_facturas, v_factura_saldo, v_factura_cliente
  from public.invoice_sales i
  where i.sale_id = p_sale_id
    and coalesce(i.document_type, 'invoice') = 'invoice'
    and i.status <> 'void';

  if v_sale.status = 'void' then
    v_total := coalesce(v_sale.total, 0);
    v_saldo := 0;
  elsif v_division then
    v_total := v_items_total;
    v_saldo := v_sin_pagar;
  elsif v_sale.status = 'paid' then
    v_total := coalesce(v_sale.total, v_items_total);
    v_saldo := 0;
  else
    v_total := v_items_total;
    v_saldo := greatest(0, v_items_total - v_pagado);
  end if;

  return jsonb_build_object(
    'sale_id', v_sale.id,
    'estado', v_sale.status,
    'customer_id', v_sale.customer_id,
    'branch_id', v_sale.branch_id,
    'total', round(v_total, 2),
    'pagado', round(v_pagado, 2),
    'saldo', round(v_saldo, 2),
    'division', v_division,
    'facturas', v_facturas,
    'factura_saldo', round(v_factura_saldo, 2),
    'factura_con_cliente', v_factura_cliente
  );
end;
$$;

comment on function public.fn_pos_mesa_saldo(uuid) is
  'Saldo de la venta de una mesa: total, pagado (pagos completados de la venta o de su factura, netos del cambio) y saldo. Única definición para el resumen y la liberación de la mesa.';

-- ── 3. Resumen para el diálogo «Liberar mesa» ───────────────────────────────
create or replace function public.pos_mesa_resumen_liberacion(p_organization_id integer, p_table_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_mesa     public.restaurant_tables%rowtype;
  v_ses      public.table_sessions%rowtype;
  v_sesiones uuid[];
  v_venta    jsonb;
  v_otras    integer := 0;
  v_mesero   text;
  v_cliente  jsonb;
  v_cocina   jsonb;
  v_s        record;
begin
  select * into v_mesa
  from public.restaurant_tables t
  where t.id = p_table_id and t.organization_id = p_organization_id;
  if not found then
    raise exception 'mesa_no_encontrada' using errcode = 'P0002';
  end if;

  select array_agg(ts.id) into v_sesiones
  from public.table_sessions ts
  where ts.restaurant_table_id = p_table_id
    and ts.organization_id = p_organization_id
    and ts.status in ('active', 'bill_requested');

  select * into v_ses
  from public.table_sessions ts
  where ts.restaurant_table_id = p_table_id
    and ts.organization_id = p_organization_id
    and ts.status in ('active', 'bill_requested')
  order by ts.opened_at desc nulls last
  limit 1;

  if v_ses.id is null then
    return jsonb_build_object(
      'mesa', jsonb_build_object('id', v_mesa.id, 'nombre', v_mesa.name, 'zona', v_mesa.zone, 'estado', v_mesa.state),
      'sesion', null, 'venta', null, 'cliente', null, 'cocina', '[]'::jsonb, 'otras_sesiones_con_saldo', 0
    );
  end if;

  select nullif(trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), '')
    into v_mesero
  from public.profiles p where p.id = v_ses.server_id;

  if v_ses.sale_id is not null then
    v_venta := public.fn_pos_mesa_saldo(v_ses.sale_id);
  end if;

  if v_venta is not null and v_venta->>'customer_id' is not null then
    select jsonb_build_object('id', c.id, 'nombre', c.full_name) into v_cliente
    from public.customers c
    where c.id = (v_venta->>'customer_id')::uuid and c.organization_id = p_organization_id;
  end if;

  -- Otras sesiones abiertas de la misma mesa (defecto M5) con saldo propio.
  for v_s in
    select ts.sale_id from public.table_sessions ts
    where ts.id = any(v_sesiones) and ts.id <> v_ses.id and ts.sale_id is not null
  loop
    if coalesce((public.fn_pos_mesa_saldo(v_s.sale_id)->>'saldo')::numeric, 0) > 0 then
      v_otras := v_otras + 1;
    end if;
  end loop;

  select coalesce(jsonb_agg(jsonb_build_object(
           'ticket_id', kt.id,
           'producto', coalesce(kti.product_name, 'Producto'),
           'cantidad', kti.quantity,
           'estado', kti.status
         ) order by kt.created_at, kti.id), '[]'::jsonb)
    into v_cocina
  from public.kitchen_tickets kt
  join public.kitchen_ticket_items kti on kti.kitchen_ticket_id = kt.id
  where kt.table_session_id = any(v_sesiones)
    and kt.organization_id = p_organization_id
    and kti.status not in ('delivered', 'cancelled');

  return jsonb_build_object(
    'mesa', jsonb_build_object('id', v_mesa.id, 'nombre', v_mesa.name, 'zona', v_mesa.zone, 'estado', v_mesa.state),
    'sesion', jsonb_build_object(
      'id', v_ses.id,
      'estado', v_ses.status,
      'abierta_en', v_ses.opened_at,
      'minutos_abierta', greatest(0, floor(extract(epoch from (now() - v_ses.opened_at)) / 60))::integer,
      'comensales', v_ses.customers,
      'mesero', v_mesero
    ),
    'venta', v_venta,
    'cliente', v_cliente,
    'cocina', v_cocina,
    'otras_sesiones_con_saldo', v_otras
  );
end;
$$;

comment on function public.pos_mesa_resumen_liberacion(integer, uuid) is
  'Información del diálogo «Liberar mesa»: mesa, sesión abierta, mesero, venta con total/pagado/saldo, cliente y cocina sin entregar. Solo service_role (la ruta valida organización).';

-- ── 4. Liberar la mesa resolviendo el saldo ─────────────────────────────────
create or replace function public.pos_mesa_liberar(
  p_organization_id integer,
  p_table_id        uuid,
  p_actor           uuid,
  p_accion          text,
  p_motivo          text default null,
  p_puede_anular    boolean default false
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_mesa          public.restaurant_tables%rowtype;
  v_sesiones      uuid[];
  v_motivo        text := nullif(btrim(coalesce(p_motivo, '')), '');
  v_s             record;
  v_saldo_s       jsonb;
  v_venta         jsonb;
  v_con_saldo     integer := 0;
  v_saldo         numeric := 0;
  v_sale          public.sales%rowtype;
  v_items         jsonb;
  v_envelope      jsonb;
  v_checkout      jsonb;
  v_invoice_id    uuid;
  v_invoice_num   text;
  v_warnings      jsonb := '[]'::jsonb;
  v_resolucion    text := 'sin_saldo';
  v_canceladas    integer := 0;
  v_entregadas    integer := 0;
  v_sin_cocinar   integer := 0;
begin
  if p_accion is null or p_accion not in ('liberar', 'cartera', 'anular') then
    raise exception 'accion_invalida' using errcode = '22023';
  end if;
  if v_motivo is not null and length(v_motivo) > 500 then
    raise exception 'motivo_invalido' using errcode = '22023';
  end if;

  -- Guarda de pertenencia: el actor es miembro activo de la organización.
  if p_actor is null or not exists (
    select 1 from public.organization_members om
    where om.user_id = p_actor and om.organization_id = p_organization_id and om.is_active
  ) then
    raise exception 'sin_membresia' using errcode = '42501';
  end if;

  select * into v_mesa
  from public.restaurant_tables t
  where t.id = p_table_id and t.organization_id = p_organization_id
  for update;
  if not found then
    raise exception 'mesa_no_encontrada' using errcode = 'P0002';
  end if;

  -- Sesiones abiertas de la mesa, bloqueadas hasta el final de la transacción.
  select array_agg(ts.id) into v_sesiones
  from (
    select ts.id from public.table_sessions ts
    where ts.restaurant_table_id = p_table_id
      and ts.organization_id = p_organization_id
      and ts.status in ('active', 'bill_requested')
    for update
  ) ts;
  v_sesiones := coalesce(v_sesiones, '{}'::uuid[]);

  -- ¿Qué venta tiene saldo? (una como mucho; con dos, se resuelve a mano).
  for v_s in
    select distinct ts.sale_id from public.table_sessions ts
    where ts.id = any(v_sesiones) and ts.sale_id is not null
  loop
    perform 1 from public.sales s where s.id = v_s.sale_id and s.organization_id = p_organization_id for update;
    if not found then
      raise exception 'venta_de_otra_organizacion' using errcode = '42501';
    end if;
    v_saldo_s := public.fn_pos_mesa_saldo(v_s.sale_id);
    if coalesce((v_saldo_s->>'saldo')::numeric, 0) > 0 then
      v_con_saldo := v_con_saldo + 1;
      v_venta := v_saldo_s;
    end if;
  end loop;

  if v_con_saldo > 1 then
    raise exception 'varias_ventas_con_saldo' using errcode = 'P0001';
  end if;

  if v_venta is null then
    if p_accion <> 'liberar' then
      raise exception 'sin_saldo' using errcode = 'P0001';
    end if;
  else
    v_saldo := (v_venta->>'saldo')::numeric;
    select * into v_sale from public.sales s where s.id = (v_venta->>'sale_id')::uuid;

    if p_accion = 'liberar' then
      raise exception 'saldo_pendiente' using errcode = 'P0001';

    elsif p_accion = 'cartera' then
      if v_sale.customer_id is null then
        raise exception 'sin_cliente' using errcode = 'P0001';
      end if;

      if (v_venta->>'facturas')::integer > 0 then
        -- Ya facturada (cobro parcial): la cartera la creó el disparador de la
        -- factura. Solo vale si esa factura lleva el saldo y el cliente.
        if (v_venta->>'factura_con_cliente')::boolean
           and abs((v_venta->>'factura_saldo')::numeric - v_saldo) <= 0.5 then
          v_resolucion := 'cartera_existente';
        else
          raise exception 'venta_con_factura' using errcode = 'P0001';
        end if;
      elsif (v_venta->>'pagado')::numeric > 0 then
        raise exception 'venta_con_pagos' using errcode = 'P0001';
      else
        -- La venta queda pendiente por su saldo; el cobro del POS la factura a
        -- crédito (0 pagos), descuenta stock y el disparador crea la cartera.
        update public.sales set
          total          = (v_venta->>'total')::numeric,
          balance        = v_saldo,
          status         = 'pending',
          payment_status = 'pending',
          notes          = case when v_motivo is null then notes
                                else coalesce(notes || E'\n', '') || '[CARTERA] ' || v_motivo end,
          updated_at     = now()
        where id = v_sale.id
        returning * into v_sale;

        select coalesce(jsonb_agg(jsonb_build_object(
                 'product_id', si.product_id,
                 'product_name', si.notes->>'product_name',
                 'quantity', si.quantity,
                 'unit_price', si.unit_price,
                 'total', si.total,
                 'tax_amount', coalesce(si.tax_amount, 0),
                 'tax_rate', coalesce(si.tax_rate, 0),
                 'discount_amount', coalesce(si.discount_amount, 0),
                 'serial_ids', '[]'::jsonb
               ) order by si.created_at, si.id), '[]'::jsonb)
          into v_items
        from public.sale_items si
        where si.sale_id = v_sale.id and si.quantity > 0;

        v_envelope := jsonb_build_object(
          'organization_id', p_organization_id,
          'branch_id', v_sale.branch_id,
          'sale_id', v_sale.id,
          'user_id', p_actor,
          'customer_id', v_sale.customer_id,
          'tax_included', v_sale.tax_included,
          'items', v_items,
          'payments', '[]'::jsonb,
          'totals', jsonb_build_object(
            'subtotal', coalesce(v_sale.subtotal, 0),
            'tax_total', coalesce(v_sale.tax_total, 0),
            'discount_total', coalesce(v_sale.discount_total, 0),
            'total', (select coalesce(sum((i->>'total')::numeric), 0) from jsonb_array_elements(v_items) i),
            'total_paid', 0,
            'change', 0
          )
        );

        v_checkout := public.pos_checkout_v1(v_envelope);
        v_invoice_id := nullif(v_checkout->'invoice'->>'id', '')::uuid;
        v_invoice_num := v_checkout->'invoice'->>'number';
        v_warnings := coalesce(v_checkout->'warnings', '[]'::jsonb);

        if v_invoice_id is null or not exists (
          select 1 from public.accounts_receivable ar where ar.invoice_id = v_invoice_id
        ) then
          raise exception 'cartera_fallida' using errcode = 'P0001';
        end if;
        v_resolucion := 'cartera_creada';
      end if;

    elsif p_accion = 'anular' then
      if not coalesce(p_puede_anular, false) then
        raise exception 'sin_permiso' using errcode = '42501';
      end if;
      if v_motivo is null or length(v_motivo) < 3 then
        raise exception 'motivo_requerido' using errcode = '22023';
      end if;
      if (v_venta->>'pagado')::numeric > 0 or (v_venta->>'facturas')::integer > 0 then
        -- Con dinero o factura de por medio se anula por devolución / nota
        -- crédito, que revierte pagos y contabilidad; aquí no.
        raise exception 'venta_con_pagos' using errcode = 'P0001';
      end if;

      -- Misma semántica que VentasService.cancelSale: `void` + motivo en notas.
      update public.sales set
        status     = 'void',
        balance    = 0,
        notes      = coalesce(notes || E'\n', '') || '[ANULADA] ' || v_motivo,
        updated_at = now()
      where id = v_sale.id;
      v_resolucion := 'anulada';
    end if;
  end if;

  -- ── Cocina: nada se marca entregado sin haberse cocinado ─────────────────
  if v_resolucion = 'anulada' then
    with c as (
      update public.kitchen_ticket_items kti set status = 'cancelled', updated_at = now()
      where kti.kitchen_ticket_id in (
              select kt.id from public.kitchen_tickets kt
              where kt.table_session_id = any(v_sesiones) and kt.organization_id = p_organization_id)
        and kti.status not in ('delivered', 'cancelled')
      returning 1
    ) select count(*) into v_canceladas from c;

    update public.kitchen_tickets kt set
      status = 'cancelled', cancelled_at = now(), cancellation_reason = v_motivo, updated_at = now()
    where kt.table_session_id = any(v_sesiones)
      and kt.organization_id = p_organization_id
      and kt.status not in ('delivered', 'cancelled');
  else
    with e as (
      update public.kitchen_ticket_items kti set status = 'delivered', updated_at = now()
      where kti.kitchen_ticket_id in (
              select kt.id from public.kitchen_tickets kt
              where kt.table_session_id = any(v_sesiones) and kt.organization_id = p_organization_id)
        and kti.status = 'ready'
      returning 1
    ) select count(*) into v_entregadas from e;

    update public.kitchen_tickets kt set status = 'delivered', updated_at = now()
    where kt.table_session_id = any(v_sesiones)
      and kt.organization_id = p_organization_id
      and kt.status = 'ready';

    select count(*) into v_sin_cocinar
    from public.kitchen_ticket_items kti
    join public.kitchen_tickets kt on kt.id = kti.kitchen_ticket_id
    where kt.table_session_id = any(v_sesiones)
      and kt.organization_id = p_organization_id
      and kti.status in ('pending', 'in_progress');
  end if;

  -- ── Rastro (antes de cerrar, con el estado real de cada sesión) ──────────
  insert into public.ops_audit_log (
    organization_id, branch_id, user_id, entity_type, entity_id, action, previous_data, metadata
  )
  select p_organization_id, ts.branch_id, p_actor, 'table_sessions', ts.id::text, 'RELEASE',
         jsonb_build_object('status', ts.status),
         jsonb_build_object(
           'table_id', p_table_id,
           'table_session_id', ts.id,
           'released_at', now(),
           'accion', p_accion,
           'resolucion', v_resolucion,
           'motivo', v_motivo,
           'sale_id', v_venta->>'sale_id',
           'saldo', v_saldo,
           'invoice_id', v_invoice_id,
           'items_cocina_cancelados', v_canceladas,
           'items_cocina_sin_cocinar', v_sin_cocinar
         )
  from public.table_sessions ts
  where ts.id = any(v_sesiones);

  -- ── Sesiones y mesa ──────────────────────────────────────────────────────
  update public.table_sessions set status = 'completed', closed_at = now(), updated_at = now()
  where id = any(v_sesiones);

  update public.restaurant_tables set state = 'free', updated_at = now()
  where id = p_table_id;

  return jsonb_build_object(
    'accion', p_accion,
    'resolucion', v_resolucion,
    'sale_id', v_venta->>'sale_id',
    'saldo', v_saldo,
    'invoice_id', v_invoice_id,
    'invoice_number', v_invoice_num,
    'sesiones_cerradas', coalesce(array_length(v_sesiones, 1), 0),
    'items_cocina_entregados', v_entregadas,
    'items_cocina_sin_cocinar', v_sin_cocinar,
    'items_cocina_cancelados', v_canceladas,
    'warnings', v_warnings
  );
end;
$$;

comment on function public.pos_mesa_liberar(integer, uuid, uuid, text, text, boolean) is
  'Libera una mesa resolviendo antes el saldo de su venta (liberar sin saldo · cartera del cliente vía pos_checkout_v1 · anular con motivo). Una transacción. Solo service_role: la ruta valida organización y permiso pos.void.';

-- ── 5. Solo service_role ────────────────────────────────────────────────────
revoke all on function public.fn_pos_mesa_saldo(uuid) from public, anon, authenticated;
revoke all on function public.pos_mesa_resumen_liberacion(integer, uuid) from public, anon, authenticated;
revoke all on function public.pos_mesa_liberar(integer, uuid, uuid, text, text, boolean) from public, anon, authenticated;
grant execute on function public.fn_pos_mesa_saldo(uuid) to service_role;
grant execute on function public.pos_mesa_resumen_liberacion(integer, uuid) to service_role;
grant execute on function public.pos_mesa_liberar(integer, uuid, uuid, text, text, boolean) to service_role;
