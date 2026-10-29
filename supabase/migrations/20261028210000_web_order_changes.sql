-- 20261028210000 · Cambios de productos en pedidos web pagados (web_order_changes)
-- SIN APLICAR. Requiere el OK de Juan. Aplicar con: psql -v ON_ERROR_STOP=1 -f <archivo>
-- Rollback: supabase/rollbacks/20261028210000_web_order_changes_rollback.sql
--
-- Qué hace:
--   1. Tabla web_order_changes (cotización → link/reembolso → aplicado), RLS de lectura por org.
--      Escritura SOLO por service_role a través de las funciones (las rutas del ERP validan sesión,
--      org y permiso pos.web_order.change antes de llamarlas).
--   2. web_order_items.change_id: último cambio que tocó la línea (las líneas quitadas se borran;
--      su foto queda en web_order_changes.items_before). Ver nota "por qué no replaced_by_change_id".
--   3. Permiso pos.web_order.change (matriz de cargos lee de permissions) para Admin de organización y Manager.
--   4. Funciones (SECURITY DEFINER, solo service_role):
--      fn_web_order_change_crear     cotización + reserva del stock ADICIONAL (ref CHG-<id>), todo o nada.
--      fn_web_order_change_aplicar   atómica e idempotente: reemplaza ítems, mueve inventario,
--                                    actualiza totales, saldo a favor opcional, auditoría.
--      fn_web_order_change_cancelar  libera la reserva CHG-<id> (cancelado o vencido).
--      fn_web_order_changes_expirar  cron: vence los links sin pagar y libera reservas.
--
-- Por qué no replaced_by_change_id: ninguna lectura de web_order_items (tienda, confirmación de stock,
-- refund, totales, comandas) filtra líneas reemplazadas; marcar y conservar duplicaría cantidades.
-- No hay FKs hacia web_order_items (verificado 28-oct-2026), así que borrar la línea quitada es seguro.
--
-- Inventario:
--   · Pedido SIN venta (stock solo reservado con ref = id del pedido): se libera la reserva del pedido
--     y se vuelve a reservar con los ítems nuevos (sin exigir: lo adicional ya estaba en CHG-<id>).
--   · Pedido CON venta (stock ya descontado por fn_pedido_web_confirmar_stock): sale lo nuevo
--     (fn_inv_int_mover 'out', source 'web_sale', source_id 'CHG-<id>') y entra lo viejo
--     (fn_stock_entrada_al_costo, source 'web_refund', source_id 'CHG-<id>').

set lock_timeout = '3s';
set statement_timeout = '60s';

begin;

create table if not exists public.web_order_changes (
  id uuid primary key default gen_random_uuid(),
  web_order_id uuid not null references public.web_orders(id) on delete cascade,
  organization_id integer not null references public.organizations(id),
  branch_id integer references public.branches(id),
  estado text not null default 'draft'
    check (estado in ('draft', 'pending_payment', 'pending_refund', 'applied', 'cancelled', 'expired')),
  items_before jsonb not null default '[]'::jsonb,
  items_after jsonb not null default '[]'::jsonb,
  subtotal_delta numeric(14,2) not null default 0,
  tax_delta numeric(14,2) not null default 0,
  shipping_delta numeric(14,2) not null default 0,
  delta_total numeric(14,2) not null default 0,
  totales_after jsonb not null default '{}'::jsonb,
  motivo text,
  payment_link_url text,
  provider_code text,
  integration_connection_id uuid,
  provider_reference text,
  qr_session_id uuid,
  payment_id uuid,
  expires_at timestamptz,
  paid_at timestamptz,
  refund_mode text check (refund_mode in ('gateway', 'manual', 'customer_credit')),
  refund_status text check (refund_status in ('pending', 'manual_pending', 'done', 'failed')),
  credit_note_id uuid,
  customer_credit_id uuid,
  factus_document jsonb,
  created_by uuid,
  applied_by uuid,
  applied_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_web_order_changes_order on public.web_order_changes (web_order_id, created_at desc);
create index if not exists idx_web_order_changes_org_estado on public.web_order_changes (organization_id, estado);
create index if not exists idx_web_order_changes_vence on public.web_order_changes (expires_at)
  where estado = 'pending_payment';
-- Un solo cambio abierto por pedido.
create unique index if not exists uq_web_order_changes_abierto on public.web_order_changes (web_order_id)
  where estado in ('draft', 'pending_payment', 'pending_refund');

alter table public.web_order_changes enable row level security;
drop policy if exists web_order_changes_select_org on public.web_order_changes;
create policy web_order_changes_select_org on public.web_order_changes
  for select to authenticated
  using (organization_id in (select om.organization_id from public.organization_members om
                              where om.user_id = (select auth.uid()) and om.is_active = true));
revoke insert, update, delete on public.web_order_changes from anon, authenticated;
grant select on public.web_order_changes to authenticated;
grant all on public.web_order_changes to service_role;

alter table public.web_order_items add column if not exists change_id uuid;

insert into public.permissions (code, module, name, description, category)
values ('pos.web_order.change', 'pos', 'Cambiar productos de un pedido online',
        'Cambiar o agregar productos a un pedido web pagado; cobra la diferencia con link de pago o la devuelve', 'pos')
on conflict (code) do nothing;

insert into public.role_permissions (role_id, permission_id, allowed)
select r.id, p.id, true
  from public.roles r cross join public.permissions p
 where p.code = 'pos.web_order.change'
   and r.organization_id is null and r.name in ('Admin de organización', 'Manager')
   and not exists (select 1 from public.role_permissions x where x.role_id = r.id and x.permission_id = p.id);

-- ─── Crear (cotización ya calculada en el servidor con precios vigentes) ───────────────────
-- p_items: [{product_id, product_name, product_sku, quantity, unit_price, tax_amount, discount_amount, total}]
-- p_totales: {subtotal, tax_total, delivery_fee, discount_total, total}
create or replace function public.fn_web_order_change_crear(
  p_order_id uuid, p_user uuid, p_items jsonb, p_totales jsonb, p_motivo text default null
) returns jsonb
language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
declare
  v_wo public.web_orders%rowtype;
  v_id uuid := gen_random_uuid();
  v_before jsonb;
  v_extra jsonb;
  v_res jsonb;
  v_delta numeric;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'SIN_ITEMS' using errcode = '22023';
  end if;
  select * into v_wo from public.web_orders where id = p_order_id for update;
  if not found then raise exception 'WEB_ORDER_NOT_FOUND' using errcode = 'P0002'; end if;
  if v_wo.payment_status <> 'paid' then
    raise exception 'PEDIDO_NO_PAGADO' using errcode = '22023';
  end if;
  if v_wo.status in ('in_delivery', 'delivered') then
    raise exception 'PEDIDO_DESPACHADO' using errcode = '22023', hint = 'Usa una devolución (returns).';
  end if;
  if v_wo.status in ('cancelled', 'rejected', 'refunded', 'expired') then
    raise exception 'PEDIDO_CERRADO' using errcode = '22023';
  end if;
  if v_wo.table_session_id is not null then
    raise exception 'PEDIDO_DE_MESA' using errcode = '22023';
  end if;
  if exists (select 1 from public.web_order_changes c where c.web_order_id = p_order_id
              and c.estado in ('draft', 'pending_payment', 'pending_refund')) then
    raise exception 'CAMBIO_ABIERTO' using errcode = '23505';
  end if;
  if exists (select 1 from jsonb_array_elements(p_items) i
              where coalesce((i->>'quantity')::numeric, 0) <= 0 or coalesce((i->>'unit_price')::numeric, -1) < 0
                 or nullif(i->>'product_id', '') is null
                 or not exists (select 1 from public.products p where p.id = (i->>'product_id')::integer
                                  and p.organization_id = v_wo.organization_id)) then
    raise exception 'ITEM_INVALIDO' using errcode = '22023';
  end if;

  select coalesce(jsonb_agg(to_jsonb(i) order by i.created_at, i.id), '[]'::jsonb) into v_before
    from public.web_order_items i where i.web_order_id = p_order_id;

  -- Lo ADICIONAL por producto (después - antes) se reserva ya, todo o nada.
  select coalesce(jsonb_agg(jsonb_build_object('product_id', d.product_id, 'quantity', d.extra)), '[]'::jsonb)
    into v_extra
    from (select a.product_id, a.qty - coalesce(b.qty, 0) as extra
            from (select (x->>'product_id')::integer product_id, sum((x->>'quantity')::numeric) qty
                    from jsonb_array_elements(p_items) x group by 1) a
            left join (select product_id, sum(quantity) qty from public.web_order_items
                        where web_order_id = p_order_id and product_id is not null group by 1) b
              on b.product_id = a.product_id) d
   where d.extra > 0;

  if jsonb_array_length(v_extra) > 0 then
    v_res := public.fn_inv_int_reservar(v_wo.organization_id, v_wo.branch_id, 'otro', 'CHG-' || v_id, v_extra, true);
    if not coalesce((v_res->>'ok')::boolean, false) then
      return jsonb_build_object('ok', false, 'error', 'STOCK_INSUFICIENTE',
                                'shortages', coalesce(v_res->'shortages', '[]'::jsonb));
    end if;
  end if;

  v_delta := round(coalesce((p_totales->>'total')::numeric, 0) - coalesce(v_wo.total, 0), 2);

  insert into public.web_order_changes (
    id, web_order_id, organization_id, branch_id, estado, items_before, items_after,
    subtotal_delta, tax_delta, shipping_delta, delta_total, totales_after, motivo, created_by
  ) values (
    v_id, p_order_id, v_wo.organization_id, v_wo.branch_id, 'draft', v_before, p_items,
    round(coalesce((p_totales->>'subtotal')::numeric, 0) - coalesce(v_wo.subtotal, 0), 2),
    round(coalesce((p_totales->>'tax_total')::numeric, 0) - coalesce(v_wo.tax_total, 0), 2),
    round(coalesce((p_totales->>'delivery_fee')::numeric, 0) - coalesce(v_wo.delivery_fee, 0), 2),
    v_delta, p_totales, left(p_motivo, 500), p_user
  );

  return jsonb_build_object('ok', true, 'change_id', v_id, 'delta_total', v_delta, 'reserva', v_res);
end;
$function$;

-- ─── Aplicar (atómica e idempotente) ─────────────────────────────────────────────────────
-- p_payment_id: pago de la diferencia (webhook). p_refund_mode: null | 'gateway' | 'manual' | 'customer_credit'.
create or replace function public.fn_web_order_change_aplicar(
  p_change_id uuid, p_user uuid default null, p_payment_id uuid default null,
  p_refund_mode text default null, p_provider_reference text default null
) returns jsonb
language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
declare
  v_c public.web_order_changes%rowtype;
  v_wo public.web_orders%rowtype;
  v_d record;
  v_items jsonb;
  v_credit uuid;
  v_t jsonb;
  v_movs integer := 0;
begin
  select * into v_c from public.web_order_changes where id = p_change_id for update;
  if not found then raise exception 'CAMBIO_NO_ENCONTRADO' using errcode = 'P0002'; end if;
  -- Desde el webhook no hay usuario: se atribuye a quien creó el cambio.
  p_user := coalesce(p_user, v_c.created_by);
  if v_c.estado = 'applied' then
    return jsonb_build_object('ok', true, 'ya_aplicado', true, 'change_id', v_c.id);
  end if;
  if v_c.estado in ('cancelled', 'expired') then
    raise exception 'CAMBIO_CERRADO' using errcode = '22023', detail = v_c.estado;
  end if;
  if v_c.delta_total > 0 and p_payment_id is null and v_c.payment_id is null then
    raise exception 'FALTA_PAGO_DIFERENCIA' using errcode = '22023';
  end if;
  if v_c.delta_total < 0 and coalesce(p_refund_mode, v_c.refund_mode) is null then
    raise exception 'FALTA_MODO_REEMBOLSO' using errcode = '22023';
  end if;

  select * into v_wo from public.web_orders where id = v_c.web_order_id for update;
  if v_wo.status in ('in_delivery', 'delivered', 'cancelled', 'rejected', 'refunded', 'expired') then
    raise exception 'PEDIDO_NO_MODIFICABLE' using errcode = '22023', detail = v_wo.status;
  end if;
  if coalesce(p_refund_mode, v_c.refund_mode) = 'customer_credit' and v_wo.customer_id is null then
    raise exception 'SALDO_SIN_CLIENTE' using errcode = '22023';
  end if;

  -- Reserva propia del cambio: se libera (lo adicional pasa a la reserva del pedido o sale del stock).
  perform public.fn_inv_int_liberar(v_c.organization_id, 'CHG-' || v_c.id, 'web_order_change_aplicado');

  if v_wo.sale_id is null then
    if v_wo.stock_released_at is null then
      perform public.fn_inv_int_liberar(v_c.organization_id, v_wo.id::text, 'web_order_change_reemplazo');
    end if;
    select coalesce(jsonb_agg(jsonb_build_object('product_id', x->>'product_id', 'quantity', x->>'quantity')), '[]'::jsonb)
      into v_items from jsonb_array_elements(v_c.items_after) x;
    perform public.fn_inv_int_reservar(v_c.organization_id, v_wo.branch_id, 'web_order', v_wo.id::text, v_items, false);
    update public.web_orders set stock_released_at = null where id = v_wo.id;
  else
    for v_d in
      select coalesce(a.product_id, b.product_id) product_id, coalesce(a.qty, 0) - coalesce(b.qty, 0) diff
        from (select (x->>'product_id')::integer product_id, sum((x->>'quantity')::numeric) qty
                from jsonb_array_elements(v_c.items_after) x group by 1) a
        full join (select (x->>'product_id')::integer product_id, sum((x->>'quantity')::numeric) qty
                     from jsonb_array_elements(v_c.items_before) x
                    where nullif(x->>'product_id', '') is not null group by 1) b
          on a.product_id = b.product_id
       order by 1
    loop
      if v_d.diff > 0 then
        perform public.fn_inv_int_mover(v_c.organization_id, v_wo.branch_id, v_d.product_id, null, 'out', v_d.diff,
          null, 'web_sale', 'CHG-' || v_c.id, 'Cambio de productos - Pedido ' || v_wo.order_number, p_user, '{}'::jsonb);
        v_movs := v_movs + 1;
      elsif v_d.diff < 0 then
        perform public.fn_stock_entrada_al_costo(v_c.organization_id, v_wo.branch_id, v_d.product_id, -v_d.diff,
          'web_refund', 'CHG-' || v_c.id, 'Cambio de productos - Pedido ' || v_wo.order_number, p_user);
        v_movs := v_movs + 1;
      end if;
    end loop;
  end if;

  -- Ítems: se reemplazan por los de la cotización (la foto anterior queda en items_before).
  delete from public.web_order_items where web_order_id = v_wo.id;
  insert into public.web_order_items (web_order_id, product_id, product_name, product_sku, quantity, unit_price,
                                      tax_amount, discount_amount, total, modifiers, notes, status, change_id)
  select v_wo.id, (x->>'product_id')::integer, coalesce(x->>'product_name', ''), x->>'product_sku',
         (x->>'quantity')::numeric, (x->>'unit_price')::numeric, coalesce((x->>'tax_amount')::numeric, 0),
         coalesce((x->>'discount_amount')::numeric, 0), coalesce((x->>'total')::numeric, 0),
         coalesce(x->'modifiers', '[]'::jsonb), x->>'notes', 'pending', v_c.id
    from jsonb_array_elements(v_c.items_after) x;

  v_t := v_c.totales_after;
  update public.web_orders set
    subtotal = coalesce((v_t->>'subtotal')::numeric, subtotal),
    tax_total = coalesce((v_t->>'tax_total')::numeric, tax_total),
    delivery_fee = coalesce((v_t->>'delivery_fee')::numeric, delivery_fee),
    discount_total = coalesce((v_t->>'discount_total')::numeric, discount_total),
    total = coalesce((v_t->>'total')::numeric, total),
    internal_notes = concat_ws(E'\n', nullif(internal_notes, ''),
      '[CAMBIO ' || to_char(now() at time zone 'America/Bogota', 'YYYY-MM-DD HH24:MI') || ' COT] '
      || 'diferencia ' || v_c.delta_total::text || coalesce(' · ' || v_c.motivo, '')),
    updated_at = now()
  where id = v_wo.id;

  if v_c.delta_total < 0 and coalesce(p_refund_mode, v_c.refund_mode) = 'customer_credit' then
    insert into public.credit_notes (organization_id, customer_id, branch_id, amount, balance, status, notes, created_by)
    values (v_c.organization_id, v_wo.customer_id, v_wo.branch_id, -v_c.delta_total, -v_c.delta_total, 'active',
            'Saldo a favor por cambio de productos - Pedido ' || v_wo.order_number, p_user)
    returning id into v_credit;
  end if;

  update public.web_order_changes set
    estado = 'applied',
    payment_id = coalesce(p_payment_id, payment_id),
    provider_reference = coalesce(p_provider_reference, provider_reference),
    paid_at = case when v_c.delta_total > 0 then coalesce(paid_at, now()) else paid_at end,
    refund_mode = coalesce(p_refund_mode, refund_mode),
    refund_status = case when v_c.delta_total >= 0 then null
                         when coalesce(p_refund_mode, refund_mode) = 'customer_credit' then 'done'
                         when coalesce(p_refund_mode, refund_mode) = 'manual' then 'manual_pending'
                         else 'pending' end,
    customer_credit_id = v_credit,
    applied_by = p_user, applied_at = now(), updated_at = now()
  where id = v_c.id;

  insert into public.ops_audit_log (organization_id, branch_id, user_id, entity_type, entity_id, action,
                                    previous_data, new_data, metadata)
  values (v_c.organization_id, v_wo.branch_id, p_user, 'web_orders', v_wo.id::text, 'WEB_ORDER_CHANGE_APPLIED',
          jsonb_build_object('total', v_wo.total, 'items', v_c.items_before),
          jsonb_build_object('total', v_t->>'total', 'items', v_c.items_after),
          jsonb_build_object('change_id', v_c.id, 'delta_total', v_c.delta_total, 'payment_id', p_payment_id,
                             'refund_mode', coalesce(p_refund_mode, v_c.refund_mode), 'movimientos', v_movs,
                             'con_venta', v_wo.sale_id is not null));

  return jsonb_build_object('ok', true, 'ya_aplicado', false, 'change_id', v_c.id, 'delta_total', v_c.delta_total,
                            'customer_credit_id', v_credit, 'movimientos', v_movs, 'sale_id', v_wo.sale_id);
end;
$function$;

-- ─── Cancelar / vencer ───────────────────────────────────────────────────────────────────
create or replace function public.fn_web_order_change_cancelar(
  p_change_id uuid, p_user uuid default null, p_estado text default 'cancelled'
) returns jsonb
language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
declare
  v_c public.web_order_changes%rowtype;
begin
  if p_estado not in ('cancelled', 'expired') then raise exception 'ESTADO_INVALIDO' using errcode = '22023'; end if;
  select * into v_c from public.web_order_changes where id = p_change_id for update;
  if not found then raise exception 'CAMBIO_NO_ENCONTRADO' using errcode = 'P0002'; end if;
  if v_c.estado in ('applied', 'cancelled', 'expired') then
    return jsonb_build_object('ok', true, 'sin_cambios', true, 'estado', v_c.estado);
  end if;
  perform public.fn_inv_int_liberar(v_c.organization_id, 'CHG-' || v_c.id, 'web_order_change_' || p_estado);
  update public.web_order_changes set estado = p_estado, cancelled_at = now(), updated_at = now() where id = v_c.id;
  if v_c.qr_session_id is not null then
    update public.payment_qr_sessions set status = case when p_estado = 'expired' then 'expired' else 'cancelled' end,
           updated_at = now()
     where id = v_c.qr_session_id and status = 'pending';
  end if;
  insert into public.ops_audit_log (organization_id, branch_id, user_id, entity_type, entity_id, action, metadata)
  values (v_c.organization_id, v_c.branch_id, p_user, 'web_orders', v_c.web_order_id::text,
          'WEB_ORDER_CHANGE_' || upper(p_estado), jsonb_build_object('change_id', v_c.id));
  return jsonb_build_object('ok', true, 'estado', p_estado);
end;
$function$;

create or replace function public.fn_web_order_changes_expirar()
returns jsonb
language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
declare
  v_id uuid;
  v_n integer := 0;
begin
  for v_id in select id from public.web_order_changes
               where estado in ('pending_payment', 'draft')
                 and coalesce(expires_at, created_at + interval '24 hours') < now()
               order by created_at limit 500
  loop
    perform public.fn_web_order_change_cancelar(v_id, null, 'expired');
    v_n := v_n + 1;
  end loop;
  return jsonb_build_object('ok', true, 'vencidos', v_n);
end;
$function$;

revoke all on function public.fn_web_order_change_crear(uuid, uuid, jsonb, jsonb, text) from public, anon, authenticated;
revoke all on function public.fn_web_order_change_aplicar(uuid, uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.fn_web_order_change_cancelar(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.fn_web_order_changes_expirar() from public, anon, authenticated;
grant execute on function public.fn_web_order_change_crear(uuid, uuid, jsonb, jsonb, text) to service_role;
grant execute on function public.fn_web_order_change_aplicar(uuid, uuid, uuid, text, text) to service_role;
grant execute on function public.fn_web_order_change_cancelar(uuid, uuid, text) to service_role;
grant execute on function public.fn_web_order_changes_expirar() to service_role;

commit;
