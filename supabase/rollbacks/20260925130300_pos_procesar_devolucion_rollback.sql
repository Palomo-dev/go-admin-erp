-- Reversión de 20260925130300_pos_procesar_devolucion.sql
--
-- ADVERTENCIA: no restaura datos. Borra return_lines (las líneas con motivo de
-- las devoluciones hechas con la RPC) y las columnas nuevas de returns y
-- cash_movements (método de reintegro, caja, NC, saldo a favor, clave de
-- idempotencia, vínculo de la salida de caja). Las devoluciones, salidas de
-- caja, notas crédito, saldos a favor, movimientos de stock y asientos ya
-- creados se quedan. Revertir también DevolucionesService (llama a la RPC).

drop function if exists public.procesar_devolucion(integer, uuid, jsonb, text, text, text, text);
drop function if exists public.fn_stock_entrada_devolucion(integer, integer, integer, numeric, numeric, text, text, uuid);

-- fn_auto_journal_cash_movement: cuerpo anterior (pg_get_functiondef, 2026-09-23).
CREATE OR REPLACE FUNCTION public.fn_auto_journal_cash_movement()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_rule RECORD;
    v_entry_id integer;
    v_session RECORD;
    v_es_entrada boolean;
    v_importe numeric;
    v_debito text;
    v_credito text;
BEGIN
    SELECT cs.organization_id, cs.branch_id
    INTO v_session
    FROM cash_sessions cs
    WHERE cs.id = NEW.cash_session_id;

    IF v_session IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT * INTO v_rule
    FROM accounting_rules
    WHERE organization_id = v_session.organization_id
      AND source_type = 'cash_movement'
      AND event_type = 'created'
      AND is_active = true
    ORDER BY priority
    LIMIT 1;

    IF v_rule IS NULL THEN
        PERFORM fn_log_journal_failure(
            v_session.organization_id, v_session.branch_id, NEW.created_at,
            'cash_movements', NEW.id::text, 'cash_move:' || NEW.id::text,
            NULL, NULL, NEW.amount,
            'no_rule', 'Sin regla contable activa de movimiento de caja');
        RETURN NEW;
    END IF;

    v_es_entrada := COALESCE(NEW.type, 'in') IN ('in', 'deposit', 'income');
    v_importe := ABS(COALESCE(NEW.amount, 0));

    IF COALESCE(NEW.amount, 0) < 0 THEN
        v_es_entrada := NOT v_es_entrada;
    END IF;

    IF v_es_entrada THEN
        v_debito  := v_rule.debit_account_code;
        v_credito := v_rule.credit_account_code;
    ELSE
        v_debito  := v_rule.credit_account_code;
        v_credito := v_rule.debit_account_code;
    END IF;

    v_entry_id := fn_create_journal_entry(
        p_organization_id := v_session.organization_id,
        p_branch_id := v_session.branch_id,
        p_entry_date := NEW.created_at,
        p_memo := 'Mov. Caja: ' || COALESCE(NEW.type, '') || ' - ' || COALESCE(NEW.concept, ''),
        p_source := 'cash_movements',
        p_source_id := NEW.id::text,
        p_debit_account := v_debito,
        p_credit_account := v_credito,
        p_amount := v_importe,
        p_fact_key := 'cash_move:' || NEW.id::text
    );

    RETURN NEW;
END;
$function$;

-- pos_caja_esperado: versión de 20260925130000 (resta todas las devoluciones
-- procesadas de la ventana, sin mirar refund_method).
create or replace function public.pos_caja_esperado(p_session_id integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  s public.cash_sessions%rowtype;
  v_hasta timestamptz;
  v_por_cajero boolean;
  v_ventas_ef numeric := 0;
  v_vuelto numeric := 0;
  v_abonos_ef numeric := 0;
  v_compras_ef numeric := 0;
  v_devoluciones numeric := 0;
  v_entradas numeric := 0;
  v_salidas numeric := 0;
  v_efectivo numeric := 0;
  v_por_metodo jsonb := '{}'::jsonb;
begin
  select * into s from public.cash_sessions where id = p_session_id;
  if not found then
    raise exception 'La caja no existe' using errcode = 'P0002';
  end if;
  perform public.fn_assert_acceso_org(s.organization_id);
  if auth.uid() is not null and not public.app_branch_access(s.branch_id) then
    raise exception 'Acceso denegado a la sucursal' using errcode = '42501';
  end if;

  v_hasta := coalesce(s.closed_at, now());
  v_por_cajero := coalesce(
    (select os.settings->>'mode' from public.organization_settings os
      where os.organization_id = s.organization_id and os.key = 'pos_cash_session_mode'),
    'branch') = 'user';

  with p as (
    select coalesce(pay.method, 'other') as metodo,
           coalesce(pay.amount, 0) as monto,
           coalesce(pay.change_amount, 0) as vuelto,
           coalesce(pay.source, '') as origen
      from public.payments pay
     where pay.organization_id = s.organization_id
       and pay.status = 'completed'
       and pay.created_at >= s.opened_at
       and pay.created_at <= v_hasta
       and (s.branch_id is null or pay.branch_id = s.branch_id)
       and (not v_por_cajero or pay.created_by = s.opened_by)
  )
  select
    coalesce(sum(monto)  filter (where metodo = 'cash' and origen not in ('invoice_purchase', 'account_payable', 'account_receivable')), 0),
    coalesce(sum(vuelto) filter (where metodo = 'cash' and origen not in ('invoice_purchase', 'account_payable', 'account_receivable')), 0),
    coalesce(sum(monto)  filter (where metodo = 'cash' and origen = 'account_receivable'), 0),
    coalesce(sum(monto)  filter (where metodo = 'cash' and origen in ('invoice_purchase', 'account_payable')), 0),
    coalesce(
      (select jsonb_object_agg(x.metodo, x.total)
         from (select metodo, sum(monto) as total from p
                where metodo <> 'cash' and origen not in ('invoice_purchase', 'account_payable')
                group by metodo) x),
      '{}'::jsonb)
    into v_ventas_ef, v_vuelto, v_abonos_ef, v_compras_ef, v_por_metodo
    from p;

  select coalesce(sum(r.total_refund), 0) into v_devoluciones
    from public.returns r
   where r.organization_id = s.organization_id
     and r.status = 'processed'
     and r.created_at >= s.opened_at
     and r.created_at <= v_hasta
     and (s.branch_id is null or r.branch_id = s.branch_id)
     and (not v_por_cajero or r.user_id = s.opened_by);

  select coalesce(sum(m.amount) filter (where m.type = 'in'), 0),
         coalesce(sum(m.amount) filter (where m.type = 'out'), 0)
    into v_entradas, v_salidas
    from public.cash_movements m
   where m.cash_session_id = s.id;

  v_efectivo := coalesce(s.initial_amount, 0)
              + (v_ventas_ef - v_vuelto)
              + v_abonos_ef
              + v_entradas - v_salidas
              - v_compras_ef
              - v_devoluciones;

  return jsonb_build_object(
    'session_id', s.id,
    'organization_id', s.organization_id,
    'status', s.status,
    'efectivo_esperado', round(v_efectivo, 2),
    'por_metodo', v_por_metodo || jsonb_build_object('cash', round(v_efectivo, 2)),
    'detalle', jsonb_build_object(
      'inicial', coalesce(s.initial_amount, 0),
      'ventas_efectivo', v_ventas_ef - v_vuelto,
      'vuelto', v_vuelto,
      'abonos_efectivo', v_abonos_ef,
      'entradas', v_entradas,
      'salidas', v_salidas,
      'compras_efectivo', v_compras_ef,
      'devoluciones', v_devoluciones
    ),
    'por_cajero', v_por_cajero,
    'hasta', v_hasta
  );
end;
$$;

drop index if exists public.idx_cash_movements_return;
alter table public.cash_movements drop column if exists return_id;

drop table if exists public.return_lines;

drop index if exists public.ux_returns_idempotencia;
alter table public.returns drop constraint if exists returns_refund_method_check;
alter table public.returns drop column if exists notes;
alter table public.returns drop column if exists idempotency_key;
alter table public.returns drop column if exists customer_credit_id;
alter table public.returns drop column if exists credit_note_invoice_id;
alter table public.returns drop column if exists cash_movement_id;
alter table public.returns drop column if exists cash_session_id;
alter table public.returns drop column if exists refund_method;
