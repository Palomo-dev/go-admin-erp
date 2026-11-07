-- ============================================================================
-- Aplicada por el MCP el 2026-11-07 con orden del dueño.
--
-- «Fecha de corte del saldo inicial» de una cuenta bancaria (Tesorería v2,
-- «Nueva cuenta bancaria» 1009:85183): el saldo inicial es el del extracto a esa
-- fecha. Hoy `bank_accounts` guarda `initial_balance` sin fecha, así que la
-- conciliación no sabe desde cuándo vale ese saldo.
--
-- Aditiva: columna NULL-able, sin default ni relleno (las cuentas existentes
-- quedan sin fecha y la pantalla lo muestra como «—»). La pantalla la pide al
-- crear la cuenta en cuanto la columna exista.
-- ============================================================================

alter table public.bank_accounts
  add column if not exists initial_balance_date date;

comment on column public.bank_accounts.initial_balance_date is
  'Fecha de corte del saldo inicial (el saldo del extracto a este día). NULL en cuentas creadas antes de pedirla.';
