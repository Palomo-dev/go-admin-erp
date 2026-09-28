-- Reversión de 20260928160000_finanzas_saldo_bancario_por_movimientos.
--
-- Orden: revertir antes 20260928161000 (las RPC de transferencias), que
-- dependen de estos disparadores para mover los saldos y de que bank_transfers
-- no acepte escritura directa.
--
-- NO revierte datos: los saldos que los disparadores movieron mientras
-- estuvieron activos se quedan como están (son los correctos según la regla).
-- Tras revertir, el saldo vuelve a quedar sin dueño: ningún escritor lo mueve.

drop trigger if exists trg_bank_tx_saldo on public.bank_transactions;
drop trigger if exists trg_bank_transfer_saldo on public.bank_transfers;
drop trigger if exists trg_bank_accounts_saldo_guarda on public.bank_accounts;
drop trigger if exists trg_bank_tx_cuenta_misma_org on public.bank_transactions;
drop trigger if exists trg_bank_transfer_cuenta_misma_org on public.bank_transfers;

drop function if exists public.fn_trg_bank_tx_saldo();
drop function if exists public.fn_trg_bank_transfer_saldo();
drop function if exists public.fn_trg_bank_accounts_saldo_guarda();
drop function if exists public.fn_trg_bank_cuenta_misma_org();
drop function if exists public.fn_saldo_bancario_ajustar(integer, numeric);

-- Privilegios tal como estaban (GRANT por defecto de Supabase).
grant all on public.bank_accounts, public.bank_transactions, public.bank_transfers to anon;
grant insert, update, delete, truncate on public.bank_transfers to authenticated;
