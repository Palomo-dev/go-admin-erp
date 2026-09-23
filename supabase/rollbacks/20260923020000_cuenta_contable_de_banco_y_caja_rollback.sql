-- Rollback de 20260923020000_cuenta_contable_de_banco_y_caja.sql
--
-- Retira las dos columnas y sus índices. Solo es seguro si antes se han
-- revertido las migraciones 4 y 6 del bloque 1, que las leen.
-- Si alguna organización ya rellenó `account_code`, ese dato se pierde.

drop index if exists public.idx_bank_accounts_account_code;
drop index if exists public.idx_cash_sessions_account_code;

alter table public.bank_accounts  drop column if exists account_code;
alter table public.cash_sessions  drop column if exists account_code;
