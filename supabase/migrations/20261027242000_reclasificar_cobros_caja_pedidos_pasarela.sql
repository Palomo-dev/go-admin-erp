-- 20261027242000 · Corrección de datos: pedidos web pagados por pasarela que además
-- quedaron con un pago de CAJA creado por fn_cobrar_pedido_web_en_caja (metodoDeCobroEnCaja
-- devolvía 'cash' para 'wompi'). SIN APLICAR. NO cambia montos de ventas, facturas ni pagos.
-- Aplicar con: psql -v ON_ERROR_STOP=1 -f <archivo> (directa o sesión 5432).
-- Rollback exacto: supabase/rollbacks/20261027242000_reclasificar_cobros_caja_pedidos_pasarela_rollback.sql
--
-- Por cada pago de la lista explícita:
--   payments.method            cash/transfer → método de la pasarela (wompi)
--   invoice_sales.payment_method              → wompi (solo la etiqueta; total/saldo igual)
--   sales.include_in_cash_register   true     → false (sale del esperado del arqueo, como
--                                               las 507 ventas web cobradas por Wompi en prod)
--   journal_lines (asiento del recibo)  1105  → cuenta de fn_money_account_code_pago(...,'wompi')
--                                               (1110 en orgs 333/335), con
--                                               app.contabilidad_mantenimiento=on (asiento publicado).
--   Movimiento de caja: no hay filas en cash_movements para estos cobros (verificado 27-oct);
--   el esperado del arqueo sale de los pagos/ventas de la sesión y no hay cash_counts en las
--   sesiones 280/281/296. Solo sesiones ABIERTAS: el guard aborta si la sesión ya cerró.
--
-- Identificación (SELECT en prod, 27-oct-2026 ~21:20 UTC-5): pedidos web paid con
-- payment_method de pasarela cuya factura tiene un pago completed de método de caja.
-- OJO: en la base TODOS pasaron a 'paid' en el mismo instante del cobro en caja (la
-- notificación web_order_created_pago tiene la hora exacta del pago), es decir, ningún
-- webhook de Wompi los había marcado pagados antes. Por eso la lista activa solo trae
-- el pedido que Juan confirmó pagado en Wompi. Los demás, abajo comentados, se activan
-- SOLO tras verificar el cobro en el panel de Wompi (y se sube v_esperados).
--
--  org | pedido               | monto     | venta    | factura   | pago     | método | sesión
--  335 | WO-335-MVRDVAGK-MRHJ | 101584.00 | 95f75d61 | FACT-0003 | bb694e50 | cash   | 281 abierta | asiento sí  ← ACTIVO
--  --- mismo patrón (casilla «Marcar como pagado», cash por defecto), POR VERIFICAR:
--  333 | WO-333-MVN3TBQC-HUCL |  29900.00 | 54d8534e | FACT-0002 | 0d51591c | cash   | 280 abierta | asiento sí
--  335 | WO-335-MVN3G5SY-HGGS |  27397.60 | cfb7134d | FACT-0001 | a46cc0da | cash   | 281 abierta | asiento sí
--  333 | WO-333-MVRERMBS-1F32 |  39434.40 | b7bdb4cb | FACT-0012 | 49e2925c | cash   | 280 abierta | asiento sí
--  335 | WO-335-MVRE8Q08-WJ7B |  69990.00 | 783ae725 | FACT-0004 | 6709df25 | cash   | 281 abierta | asiento sí
--  --- 'transfer' elegido a mano en el diálogo (probable pago en tienda), NO incluidos:
--      333 370H, UKHK, PRWN, 9WOZ, 0GA6, 79NO, Q2C9 · 335 UVS2 · 339 D2CA (sesiones 280/281/296 abiertas)
--  Sesiones CERRADAS afectadas: ninguna (los de 'mesa' en sesiones cerradas no son pasarela).

set lock_timeout = '3s';
set statement_timeout = '60s';

begin;

set local app.contabilidad_mantenimiento = 'on';

create table if not exists public._bk_20261027242000_cobros_pasarela (
  payment_id uuid primary key,
  web_order_id uuid not null,
  sale_id uuid not null,
  invoice_id uuid not null,
  old_payment_method text not null,
  new_payment_method text not null,
  old_invoice_payment_method text,
  old_include_in_cash_register boolean,
  journal_line_id integer,
  old_account_code text,
  new_account_code text,
  cash_session_id integer not null,
  aplicado_en timestamptz not null default now()
);
revoke all on public._bk_20261027242000_cobros_pasarela from public, anon, authenticated;

do $$
declare
  v_esperados constant integer := 1;  -- súbelo si activas filas de la lista
  v_n integer;
begin
  create temp table _lista (payment_id uuid, web_order_id uuid, metodo_pasarela text) on commit drop;
  insert into _lista values
    ('bb694e50-f8c7-4876-8b5a-a5d9bbbcc99f', '848ef597-e8ad-4f85-971f-d3403cca0600', 'wompi')   -- 335 MRHJ
    -- ,('0d51591c-b1b4-4100-a312-c519724921b3', '2d536b5a-f1be-407d-8f80-7a52eea728c6', 'wompi') -- 333 HUCL
    -- ,('a46cc0da-cec2-4091-8136-55f7f4145bc1', '68fb678d-d8df-4224-b586-96386afa7fa8', 'wompi') -- 335 HGGS
    -- ,('49e2925c-ff0b-4712-aef3-c570c59001f7', 'b86a9a76-d1b7-45a7-8486-383e242dd13e', 'wompi') -- 333 1F32
    -- ,('6709df25-8066-4b62-a46f-d5cdabc4c8aa', '11b2da24-5d08-4095-a187-92b62a7ce472', 'wompi') -- 335 WJ7B
  ;

  insert into public._bk_20261027242000_cobros_pasarela
    (payment_id, web_order_id, sale_id, invoice_id, old_payment_method, new_payment_method,
     old_invoice_payment_method, old_include_in_cash_register, journal_line_id, old_account_code,
     new_account_code, cash_session_id)
  select p.id, w.id, s.id, i.id, p.method, l.metodo_pasarela,
         i.payment_method, s.include_in_cash_register, jl.id, jl.account_code,
         coalesce(public.fn_money_account_code_pago(p.organization_id, p.branch_id, l.metodo_pasarela, null), jl.account_code),
         cs.id
    from _lista l
    join public.payments p on p.id = l.payment_id
    join public.web_orders w on w.id = l.web_order_id
    join public.invoice_sales i on i.id::text = p.source_id and i.sale_id = w.sale_id
    join public.sales s on s.id = w.sale_id
    join lateral (
      select c.id, c.status from public.cash_sessions c
       where c.organization_id = p.organization_id
         and (c.branch_id = p.branch_id or c.branch_id is null)
         and c.opened_at <= p.created_at and (c.closed_at is null or c.closed_at >= p.created_at)
       order by (c.branch_id is null), c.opened_at desc limit 1
    ) cs on cs.status = 'open'
    left join public.journal_entries je on je.source = 'payments' and je.source_id = p.id::text
    left join public.journal_lines jl on jl.journal_entry_id = je.id and jl.debit > 0
   where p.source = 'invoice_sales' and p.status = 'completed'
     and p.method in ('cash', 'card', 'transfer', 'qr')
     and w.payment_status = 'paid' and w.table_session_id is null
     and public.fn_metodo_es_pasarela(w.payment_method)
     and exists (select 1 from public.payment_methods pm where pm.code = l.metodo_pasarela and coalesce(pm.is_active, true))
     and not exists (select 1 from public._bk_20261027242000_cobros_pasarela b where b.payment_id = p.id);
  get diagnostics v_n = row_count;
  if v_n <> v_esperados then
    raise exception 'GUARD: % filas cumplen las condiciones (pago de caja, pedido pagado por pasarela, sesión abierta, un débito por asiento); se esperaban %', v_n, v_esperados;
  end if;

  update public.payments p set method = b.new_payment_method, updated_at = now()
    from public._bk_20261027242000_cobros_pasarela b
   where b.payment_id = p.id and p.method = b.old_payment_method;
  get diagnostics v_n = row_count;
  if v_n <> v_esperados then raise exception 'GUARD payments: % <> %', v_n, v_esperados; end if;

  update public.invoice_sales i set payment_method = b.new_payment_method
    from public._bk_20261027242000_cobros_pasarela b
   where b.invoice_id = i.id;

  update public.sales s set include_in_cash_register = false
    from public._bk_20261027242000_cobros_pasarela b
   where b.sale_id = s.id;

  update public.journal_lines jl set account_code = b.new_account_code
    from public._bk_20261027242000_cobros_pasarela b
   where b.journal_line_id = jl.id and b.new_account_code is distinct from b.old_account_code;
end $$;

commit;
