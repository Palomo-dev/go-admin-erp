-- 20261028220000 · Tope de reembolsos de pedidos web (web_order_refunds)
-- SIN APLICAR. Requiere el OK de Juan. Aplicar con: psql -v ON_ERROR_STOP=1 -f <archivo>
-- Rollback: supabase/rollbacks/20261028220000_web_order_refunds_rollback.sql
--
-- Problema (QA R2): /api/web-orders/[id]/refund aceptaba parciales sin tope; cada uno creaba su
-- nota crédito y su ajuste de cartera.
-- Qué hace:
--   1. Tabla web_order_refunds: un registro por reembolso (reserved → done | failed).
--   2. fn_web_order_reembolso_reservar(p_order_id, p_monto, p_motivo, p_reference):
--      bloquea la fila del pedido (FOR UPDATE: dos peticiones simultáneas se serializan), suma lo ya
--      reembolsado (reserved + done), rechaza si p_monto > total − reembolsado (EXCEDE_SALDO) y
--      registra el reembolso. p_monto 0/null = el saldo restante. Si el saldo queda en 0, el pedido
--      pasa a payment_status 'refunded' (y status 'cancelled') en la misma transacción.
--      p_reference (id del reembolso en la pasarela) hace idempotentes los reintentos.
--   3. fn_web_order_reembolso_cerrar(p_refund_id, p_ok, p_credit_note_id): done o failed (failed
--      devuelve el saldo y, si había dejado el pedido en refunded, lo vuelve a 'paid').
-- El total que se usa es web_orders.total vigente: un cambio de productos con diferencia a favor ya
-- baja ese total (y emite su propia nota), así que no se cuenta dos veces.

set lock_timeout = '3s';
set statement_timeout = '60s';

begin;

create table if not exists public.web_order_refunds (
  id uuid primary key default gen_random_uuid(),
  web_order_id uuid not null references public.web_orders(id) on delete cascade,
  organization_id integer not null references public.organizations(id),
  amount numeric(14,2) not null check (amount > 0),
  estado text not null default 'reserved' check (estado in ('reserved', 'done', 'failed')),
  completo boolean not null default false,
  estado_previo text,
  reason text,
  reference text,
  credit_note_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_web_order_refunds_order on public.web_order_refunds (web_order_id);
create unique index if not exists uq_web_order_refunds_reference on public.web_order_refunds (web_order_id, reference)
  where reference is not null;

alter table public.web_order_refunds enable row level security;
drop policy if exists web_order_refunds_select_org on public.web_order_refunds;
create policy web_order_refunds_select_org on public.web_order_refunds
  for select to authenticated
  using (organization_id in (select om.organization_id from public.organization_members om
                              where om.user_id = (select auth.uid()) and om.is_active = true));
revoke all on public.web_order_refunds from anon;
revoke all on public.web_order_refunds from authenticated;
grant select on public.web_order_refunds to authenticated;
grant all on public.web_order_refunds to service_role;

create or replace function public.fn_web_order_reembolso_reservar(
  p_order_id uuid, p_monto numeric default null, p_motivo text default null, p_reference text default null
)
returns jsonb
language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
declare
  v_wo public.web_orders%rowtype;
  v_prev numeric;
  v_disp numeric;
  v_monto numeric;
  v_completo boolean;
  v_r public.web_order_refunds%rowtype;
begin
  -- Serializa: la segunda petición espera aquí hasta que la primera confirme.
  select * into v_wo from public.web_orders where id = p_order_id for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'PEDIDO_NO_ENCONTRADO'); end if;

  if p_reference is not null then
    select * into v_r from public.web_order_refunds
     where web_order_id = p_order_id and reference = p_reference and estado <> 'failed';
    if found then
      return jsonb_build_object('ok', true, 'ya_registrado', true, 'refund_id', v_r.id, 'monto', v_r.amount,
                                'completo', v_r.completo, 'estado', v_r.estado);
    end if;
  end if;

  if v_wo.payment_status = 'refunded' then
    return jsonb_build_object('ok', false, 'error', 'YA_REEMBOLSADO', 'disponible', 0);
  end if;
  if v_wo.payment_status <> 'paid' then
    return jsonb_build_object('ok', false, 'error', 'PEDIDO_NO_PAGADO', 'payment_status', v_wo.payment_status);
  end if;

  select coalesce(sum(amount), 0) into v_prev
    from public.web_order_refunds where web_order_id = p_order_id and estado in ('reserved', 'done');
  v_disp := round(greatest(coalesce(v_wo.total, 0) - v_prev, 0), 2);
  if v_disp <= 0 then
    return jsonb_build_object('ok', false, 'error', 'SIN_SALDO', 'disponible', 0, 'reembolsado', v_prev);
  end if;

  v_monto := case when coalesce(p_monto, 0) <= 0 then v_disp else round(p_monto, 2) end;
  if v_monto > v_disp + 0.004 then
    return jsonb_build_object('ok', false, 'error', 'EXCEDE_SALDO', 'disponible', v_disp, 'reembolsado', v_prev,
                              'solicitado', v_monto);
  end if;
  v_completo := v_disp - v_monto <= 0.004;

  insert into public.web_order_refunds (web_order_id, organization_id, amount, completo, estado_previo, reason, reference)
  values (p_order_id, v_wo.organization_id, v_monto, v_completo, v_wo.status, left(p_motivo, 500), p_reference)
  returning * into v_r;

  if v_completo then
    update public.web_orders
       set payment_status = 'refunded', status = 'cancelled', cancelled_at = now(),
           cancellation_reason = left('Reembolso: ' || coalesce(p_motivo, ''), 500), updated_at = now()
     where id = p_order_id;
  end if;

  return jsonb_build_object('ok', true, 'ya_registrado', false, 'refund_id', v_r.id, 'monto', v_monto,
                            'completo', v_completo, 'reembolsado_antes', v_prev, 'restante', round(v_disp - v_monto, 2));
end;
$function$;

create or replace function public.fn_web_order_reembolso_cerrar(
  p_refund_id uuid, p_ok boolean, p_credit_note_id uuid default null
)
returns jsonb
language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
declare
  v_r public.web_order_refunds%rowtype;
begin
  select * into v_r from public.web_order_refunds where id = p_refund_id for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'NO_ENCONTRADO'); end if;
  if v_r.estado <> 'reserved' then return jsonb_build_object('ok', true, 'estado', v_r.estado); end if;
  update public.web_order_refunds
     set estado = case when p_ok then 'done' else 'failed' end,
         credit_note_id = coalesce(p_credit_note_id, credit_note_id), updated_at = now()
   where id = p_refund_id;
  if not p_ok and v_r.completo then
    update public.web_orders
       set payment_status = 'paid', status = coalesce(v_r.estado_previo, status), cancelled_at = null,
           cancellation_reason = null, updated_at = now()
     where id = v_r.web_order_id and payment_status = 'refunded';
  end if;
  return jsonb_build_object('ok', true, 'estado', case when p_ok then 'done' else 'failed' end);
end;
$function$;

revoke all on function public.fn_web_order_reembolso_reservar(uuid, numeric, text, text) from public, anon, authenticated;
revoke all on function public.fn_web_order_reembolso_cerrar(uuid, boolean, uuid) from public, anon, authenticated;
grant execute on function public.fn_web_order_reembolso_reservar(uuid, numeric, text, text) to service_role;
grant execute on function public.fn_web_order_reembolso_cerrar(uuid, boolean, uuid) to service_role;

commit;
