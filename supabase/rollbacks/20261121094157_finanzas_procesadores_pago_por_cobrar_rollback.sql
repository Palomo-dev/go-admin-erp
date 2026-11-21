-- Reversión de 20261121094157_finanzas_procesadores_pago_por_cobrar.sql
--
-- Los cobros con tarjeta y por pasarela vuelven a debitar la caja o el banco, se
-- quitan los abonos de procesadores y las cuentas 138020xx. Se detiene si ya hay
-- abonos o movimientos en esas cuentas: primero hay que reclasificarlos.

do $$
begin
  if exists (select 1 from public.payment_processor_payouts)
     or exists (select 1 from public.journal_lines l where l.account_code like '138020%') then
    raise exception 'Hay abonos o movimientos en 138020xx: reclasificarlos antes de revertir';
  end if;
end $$;

-- Cobros: la cuenta del medio, como antes.
do $$
declare
  v_def text := pg_get_functiondef('public.fn_auto_journal_payment'::regproc);
  v_nuevo text := E'    -- Cobro con tarjeta o pasarela: a la cuenta por cobrar del procesador (138020xx),\n    -- que se salda con el abono. Contador 2026-11-21.\n    v_money_account := CASE WHEN v_es_cobro\n        THEN fn_cuenta_cobro(NEW.organization_id, NEW.branch_id, NEW.method, NEW.bank_account_id, NEW.processor)\n        ELSE fn_money_account_code_pago(NEW.organization_id, NEW.branch_id, NEW.method, NEW.bank_account_id)\n    END;';
begin
  if position(v_nuevo in v_def) > 0 then
    execute replace(v_def, v_nuevo, E'    v_money_account := fn_money_account_code_pago(\n        NEW.organization_id, NEW.branch_id, NEW.method, NEW.bank_account_id);');
  end if;
end $$;

do $$
declare
  v_f text;
  v_def text;
begin
  foreach v_f in array array['fn_auto_journal_tip', 'fn_reserva_cuenta_pago', 'fn_saldo_favor_crear', 'fn_registrar_pago'] loop
    v_def := pg_get_functiondef(('public.' || v_f)::regproc);
    if position('public.fn_cuenta_cobro(' in v_def) > 0 then
      execute replace(v_def, 'public.fn_cuenta_cobro(', 'public.fn_money_account_code_pago(');
    end if;
  end loop;
end $$;

-- Tercero de las líneas: sin el caso 138020xx.
do $$
declare
  v_def text := pg_get_functiondef('public.fn_trg_tercero_linea_asiento'::regproc);
  v_ini int;
  v_fin int;
  v_cierre text := E'      return new;\n    end if;\n  end if;\n';
begin
  v_ini := position('  -- Cuenta por cobrar a un procesador de pago (138020xx)' in v_def);
  if v_ini = 0 then
    return;
  end if;
  v_fin := position(v_cierre in substr(v_def, v_ini));
  execute left(v_def, v_ini - 1) || substr(v_def, v_ini + v_fin - 1 + length(v_cierre));
end $$;

drop function if exists public.fn_procesadores_pago_saldos(integer, integer);
drop function if exists public.fn_procesador_pago_configurar(integer, jsonb);
drop function if exists public.fn_procesador_abono_anular(uuid, text);
drop function if exists public.fn_procesador_abono_registrar(integer, jsonb);
drop function if exists public.fn_procesador_pago_saldo(integer, text, date);
drop table if exists public.payment_processor_payouts;
drop function if exists public.fn_cuenta_cobro(integer, integer, text, integer, text);
drop trigger if exists trg_01_payments_procesador on public.payments;
drop function if exists public.fn_trg_payments_procesador();
drop function if exists public.fn_procesador_de_pago(text, text, jsonb);
alter table public.payments drop column if exists processor;
drop function if exists public.fn_procesador_pago_por_cuenta(integer, text);
drop table if exists public.payment_processor_settings;
drop function if exists public.fn_procesadores_pago_catalogo();

delete from public.chart_of_accounts where account_code in ('13802001', '13802002', '13802003', '13802004');
delete from public.chart_of_accounts where account_code = '138020';
update public.chart_of_accounts set es_movimiento = true where account_code = '1380';
delete from public.puc_plantilla where codigo in ('13802001', '13802002', '13802003', '13802004');
delete from public.puc_plantilla where codigo = '138020';
update public.puc_plantilla set es_movimiento = true where codigo = '1380';
