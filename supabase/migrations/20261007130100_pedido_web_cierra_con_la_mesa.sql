-- ============================================================================
-- Pedido web «Comer aquí» · se cierra con la cuenta de la mesa
--
-- pos_mesa_agregar_pedido_web mete las líneas del pedido en la venta de la
-- table_session y deja el pedido en 'confirmed', pero nada lo actualizaba
-- después: cobrada la mesa y liberada, el pedido seguía en confirmed/ready y
-- payment_status 'pending' para siempre (/pedido/<n>, Pedidos online y la
-- analítica de pedidos web).
--
-- Ahora, dos disparadores y una función común:
-- 1. sales: al pasar payment_status a 'paid' una venta con table_session_id,
--    sus pedidos web de esa sesión quedan payment_status 'paid'.
-- 2. table_sessions: al pasar a 'completed' (pos_mesa_liberar, dividir mesa…):
--    - venta anulada ('void'/'cancelled') → pedidos 'cancelled' con motivo;
--    - si no → 'delivered' (+ 'paid' si la venta está pagada) y, en un
--      segundo UPDATE, sale_id = venta de la sesión.
--    El sale_id va en un UPDATE aparte y sin cambio de estado a propósito:
--    trg_auto_journal_web_order solo actúa cuando cambia el estado y hay
--    sale_id; así nunca crea una factura «WEB-…» para un pedido cuya venta
--    ya facturó pos_checkout_v1 (la factura es de la mesa entera).
-- Solo toca pedidos de esa sesión, de esa organización y no terminales.
--
-- Aditiva: función + dos disparadores nuevos. No toca filas existentes (los
-- pedidos que ya quedaron colgados no se reparan: ver nota al final).
--
-- Ensayo (do $$ … raise exception 'ENSAYO_OK' $$, org 140, Mesa 1): pedido
-- dine_in 'card' → pos_mesa_agregar_pedido_web → pos_checkout_v1 no se
-- invoca (necesita caja abierta); se simula el cobro con UPDATE de la venta y
-- el cierre con UPDATE de la sesión, como hacen pos_checkout_v1 y
-- pos_mesa_liberar.
--   antes:   status=confirmed pago=pending sale=false
--   después: al pagar → pago=paid; al cerrar → status=delivered pago=paid
--            sale=true, facturas WEB- nuevas=0.
-- ============================================================================

set lock_timeout = '5s';

create or replace function public.fn_web_orders_sync_cuenta_mesa(p_session_id uuid, p_cerrada boolean)
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_ses public.table_sessions%rowtype;
  v_status text;
  v_pago text;
  v_n integer := 0;
begin
  select * into v_ses from public.table_sessions where id = p_session_id;
  if not found then
    return 0;
  end if;
  if v_ses.sale_id is not null then
    select s.status, s.payment_status into v_status, v_pago
      from public.sales s
     where s.id = v_ses.sale_id and s.organization_id = v_ses.organization_id;
  end if;

  if not p_cerrada then
    if v_pago = 'paid' then
      update public.web_orders w
         set payment_status = 'paid', updated_at = now()
       where w.table_session_id = p_session_id
         and w.organization_id = v_ses.organization_id
         and w.payment_status in ('pending', 'partial')
         and w.status not in ('cancelled', 'rejected', 'refunded', 'expired');
      get diagnostics v_n = row_count;
    end if;
    return v_n;
  end if;

  if v_status in ('void', 'cancelled') then
    update public.web_orders w
       set status = 'cancelled',
           cancelled_at = coalesce(w.cancelled_at, now()),
           cancellation_reason = coalesce(w.cancellation_reason, 'Cuenta de la mesa anulada'),
           updated_at = now()
     where w.table_session_id = p_session_id
       and w.organization_id = v_ses.organization_id
       and w.status not in ('delivered', 'cancelled', 'rejected', 'refunded', 'expired');
    get diagnostics v_n = row_count;
    return v_n;
  end if;

  update public.web_orders w
     set status = 'delivered',
         ready_at = coalesce(w.ready_at, now()),
         delivered_at = coalesce(w.delivered_at, now()),
         payment_status = case when v_pago = 'paid' then 'paid' else w.payment_status end,
         updated_at = now()
   where w.table_session_id = p_session_id
     and w.organization_id = v_ses.organization_id
     and w.status not in ('delivered', 'cancelled', 'rejected', 'refunded', 'expired');
  get diagnostics v_n = row_count;

  if v_ses.sale_id is not null then
    update public.web_orders w
       set sale_id = v_ses.sale_id
     where w.table_session_id = p_session_id
       and w.organization_id = v_ses.organization_id
       and w.sale_id is null;
  end if;
  return v_n;
end;
$$;

comment on function public.fn_web_orders_sync_cuenta_mesa(uuid, boolean) is
  'Lleva el estado de la cuenta de una mesa a los pedidos web «Comer aquí» de esa sesión: pagada → payment_status paid; cerrada → delivered (o cancelled si la venta se anuló) y sale_id. La llaman los disparadores de sales y table_sessions.';

revoke all on function public.fn_web_orders_sync_cuenta_mesa(uuid, boolean) from public, anon, authenticated;
grant execute on function public.fn_web_orders_sync_cuenta_mesa(uuid, boolean) to service_role;

create or replace function public.fn_trg_web_orders_mesa_cerrada()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  perform public.fn_web_orders_sync_cuenta_mesa(new.id, true);
  return new;
end;
$$;

create or replace function public.fn_trg_web_orders_mesa_pagada()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  perform public.fn_web_orders_sync_cuenta_mesa(new.table_session_id, false);
  return new;
end;
$$;

revoke all on function public.fn_trg_web_orders_mesa_cerrada() from public, anon, authenticated;
revoke all on function public.fn_trg_web_orders_mesa_pagada() from public, anon, authenticated;

create or replace trigger trg_web_orders_mesa_cerrada
  after update of status on public.table_sessions
  for each row
  when (new.status = 'completed' and old.status is distinct from 'completed')
  execute function public.fn_trg_web_orders_mesa_cerrada();

create or replace trigger trg_web_orders_mesa_pagada
  after update of payment_status on public.sales
  for each row
  when (new.payment_status = 'paid' and old.payment_status is distinct from 'paid'
        and new.table_session_id is not null)
  execute function public.fn_trg_web_orders_mesa_pagada();

-- Nota: pedidos anteriores ya colgados (table_session_id de una sesión
-- 'completed' y pedido no terminal) se pueden reparar a mano con
--   select public.fn_web_orders_sync_cuenta_mesa(ts.id, true)
--     from public.table_sessions ts
--    where ts.status = 'completed'
--      and exists (select 1 from public.web_orders w where w.table_session_id = ts.id
--                   and w.status not in ('delivered','cancelled','rejected','refunded','expired'));
-- No se ejecuta aquí: es un cambio de datos y la migración es solo de esquema.
