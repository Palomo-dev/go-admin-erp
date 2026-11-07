-- Rollback de 20261108020500_bank_accounts_fecha_saldo_inicial (PROPUESTA, sin aplicar).
-- Borra la columna y con ella las fechas de corte que se hayan escrito (no se recuperan).
alter table public.bank_accounts drop column if exists initial_balance_date;
