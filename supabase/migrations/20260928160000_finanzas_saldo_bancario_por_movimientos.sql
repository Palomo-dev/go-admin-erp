-- Finanzas · saldo de las cuentas bancarias mantenido por los movimientos (2026-09-28).
--
-- Regla única, igual que `payments` mantiene la cartera:
--
--   bank_accounts.balance = initial_balance
--                         + Σ bank_transactions.amount            (con signo: entra > 0, sale < 0)
--                         + Σ bank_transfers completadas que entran
--                         − Σ bank_transfers completadas que salen
--
-- Antes de esta migración nadie la cumplía: los ingresos/egresos por banco
-- (INSERT directo en bank_transactions) no movían el saldo, las transferencias
-- llamaban a una RPC inexistente (`update_bank_balance`) y el respaldo era un
-- UPDATE que nunca se esperaba; el movimiento manual del banco hacía
-- leer-y-escribir desde el navegador sin filtro de organización.
--
-- Lo que hace:
--   1. fn_saldo_bancario_ajustar: el ÚNICO escritor de bank_accounts.balance.
--      Abre una marca local de transacción que la guarda (3) reconoce.
--   2. Disparadores AFTER en bank_transactions y bank_transfers que aplican el
--      delta de cada INSERT/UPDATE/DELETE (una transferencia solo cuenta en
--      estado 'completed': pasar a 'cancelled' la revierte).
--   3. Guarda BEFORE en bank_accounts: un INSERT nace con balance = saldo
--      inicial; un UPDATE que cambie `balance` sin pasar por (1) se rechaza, y
--      si cambia `initial_balance` el saldo se corre en el mismo delta.
--   4. La cuenta de un movimiento o de una transferencia debe ser de la misma
--      organización que la fila (antes la FK aceptaba la cuenta de otro tenant).
--   5. bank_transfers deja de aceptar escritura directa de anon/authenticated:
--      se escribe solo por fn_transferencia_registrar / fn_transferencia_anular
--      (migración 20260928161000). anon pierde todo privilegio sobre las tres
--      tablas (ninguna política lo admitía; ahora tampoco el GRANT).
--
-- NO reescribe el saldo histórico ya desviado: la desviación por cuenta se
-- midió y quedó en docs/hallazgos/F-79.md para revisarla con el contador.

-- ── 1. Único escritor del saldo ─────────────────────────────────────────────
create or replace function public.fn_saldo_bancario_ajustar(p_cuenta integer, p_delta numeric)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  if p_cuenta is null or coalesce(p_delta, 0) = 0 then
    return;
  end if;
  perform set_config('app.saldo_bancario_por_movimiento', 'on', true);
  update public.bank_accounts
     set balance = coalesce(balance, 0) + p_delta,
         updated_at = now()
   where id = p_cuenta;
  perform set_config('app.saldo_bancario_por_movimiento', 'off', true);
end;
$function$;

comment on function public.fn_saldo_bancario_ajustar(integer, numeric) is
  'Único escritor de bank_accounts.balance: suma el delta de un movimiento. Solo lo llaman los disparadores de bank_transactions y bank_transfers.';

revoke all on function public.fn_saldo_bancario_ajustar(integer, numeric) from public, anon, authenticated;

-- ── 2a. Movimientos bancarios ───────────────────────────────────────────────
create or replace function public.fn_trg_bank_tx_saldo()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    perform public.fn_saldo_bancario_ajustar(old.bank_account_id, -coalesce(old.amount, 0));
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    perform public.fn_saldo_bancario_ajustar(new.bank_account_id, coalesce(new.amount, 0));
    return new;
  end if;
  return old;
end;
$function$;

revoke all on function public.fn_trg_bank_tx_saldo() from public, anon, authenticated;

drop trigger if exists trg_bank_tx_saldo on public.bank_transactions;
create trigger trg_bank_tx_saldo
  after insert or delete or update of amount, bank_account_id on public.bank_transactions
  for each row execute function public.fn_trg_bank_tx_saldo();

-- ── 2b. Transferencias entre cuentas ────────────────────────────────────────
create or replace function public.fn_trg_bank_transfer_saldo()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  if tg_op in ('UPDATE', 'DELETE') and old.status = 'completed' then
    perform public.fn_saldo_bancario_ajustar(old.from_account_id, old.amount);
    perform public.fn_saldo_bancario_ajustar(old.to_account_id, -old.amount);
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    if new.status = 'completed' then
      perform public.fn_saldo_bancario_ajustar(new.from_account_id, -new.amount);
      perform public.fn_saldo_bancario_ajustar(new.to_account_id, new.amount);
    end if;
    return new;
  end if;
  return old;
end;
$function$;

revoke all on function public.fn_trg_bank_transfer_saldo() from public, anon, authenticated;

drop trigger if exists trg_bank_transfer_saldo on public.bank_transfers;
create trigger trg_bank_transfer_saldo
  after insert or delete or update of status, amount, from_account_id, to_account_id on public.bank_transfers
  for each row execute function public.fn_trg_bank_transfer_saldo();

-- ── 3. Guarda del saldo ─────────────────────────────────────────────────────
create or replace function public.fn_trg_bank_accounts_saldo_guarda()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
begin
  if tg_op = 'INSERT' then
    new.initial_balance := coalesce(new.initial_balance, new.balance, 0);
    new.balance := new.initial_balance;
    return new;
  end if;

  if coalesce(current_setting('app.saldo_bancario_por_movimiento', true), 'off') = 'on' then
    return new;
  end if;

  if new.balance is distinct from old.balance then
    raise exception 'saldo_bancario_por_movimientos'
      using errcode = '42501',
            hint = 'El saldo de una cuenta bancaria lo mueven sus movimientos y transferencias; no se escribe directo.';
  end if;

  if new.initial_balance is distinct from old.initial_balance then
    new.balance := coalesce(old.balance, 0) + (coalesce(new.initial_balance, 0) - coalesce(old.initial_balance, 0));
  end if;
  return new;
end;
$function$;

revoke all on function public.fn_trg_bank_accounts_saldo_guarda() from public, anon, authenticated;

drop trigger if exists trg_bank_accounts_saldo_guarda on public.bank_accounts;
create trigger trg_bank_accounts_saldo_guarda
  before insert or update on public.bank_accounts
  for each row execute function public.fn_trg_bank_accounts_saldo_guarda();

-- ── 4. La cuenta es de la organización de la fila ───────────────────────────
create or replace function public.fn_trg_bank_cuenta_misma_org()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  if tg_table_name = 'bank_transactions' then
    if not exists (select 1 from public.bank_accounts b
                    where b.id = new.bank_account_id and b.organization_id = new.organization_id) then
      raise exception 'cuenta_no_encontrada' using errcode = '42501';
    end if;
  else
    if not exists (select 1 from public.bank_accounts b
                    where b.id = new.from_account_id and b.organization_id = new.organization_id)
       or not exists (select 1 from public.bank_accounts b
                    where b.id = new.to_account_id and b.organization_id = new.organization_id) then
      raise exception 'cuenta_no_encontrada' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$function$;

revoke all on function public.fn_trg_bank_cuenta_misma_org() from public, anon, authenticated;

drop trigger if exists trg_bank_tx_cuenta_misma_org on public.bank_transactions;
create trigger trg_bank_tx_cuenta_misma_org
  before insert or update of bank_account_id, organization_id on public.bank_transactions
  for each row execute function public.fn_trg_bank_cuenta_misma_org();

drop trigger if exists trg_bank_transfer_cuenta_misma_org on public.bank_transfers;
create trigger trg_bank_transfer_cuenta_misma_org
  before insert or update of from_account_id, to_account_id, organization_id on public.bank_transfers
  for each row execute function public.fn_trg_bank_cuenta_misma_org();

-- ── 5. Privilegios ──────────────────────────────────────────────────────────
revoke all on public.bank_accounts, public.bank_transactions, public.bank_transfers from anon;
revoke insert, update, delete, truncate on public.bank_transfers from authenticated;
