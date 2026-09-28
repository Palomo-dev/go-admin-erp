-- Bloque 1 contable · migración 16 adelantada
--
-- `bank_accounts.account_code` y `cash_sessions.account_code`: la cuenta del
-- plan contable donde vive el dinero de esa cuenta bancaria o de esa caja.
--
-- La decisión 1 del dueño dice que «la cuenta contable del dinero sale del
-- sitio donde está el dinero, no de una regla genérica»
-- (docs/design/AUDITORIA-TESORERIA-CONTABILIDAD.md §P.3, decisión 1 regla 3).
-- En el plan de migraciones esto era la 16, del bloque 3, pero el asiento de
-- cobro del bloque 1 (migración 4) y el de la transferencia bancaria
-- (migración 6) no pueden escribirse sin ella: sin estas dos columnas
-- seguirían resolviendo la cuenta por una regla genérica, que es justo lo que
-- se quiere quitar. Por eso se adelanta.
--
-- Ambas son aditivas y NULL-ables. Mientras estén vacías, las funciones caen
-- al comportamiento por defecto (caja `1105`, bancos `1110`), así que nada
-- cambia hasta que una organización las rellene.

alter table public.bank_accounts  add column if not exists account_code text;
alter table public.cash_sessions  add column if not exists account_code text;

comment on column public.bank_accounts.account_code is
  'Cuenta del plan contable (chart_of_accounts.account_code) donde se refleja el saldo de esta cuenta bancaria. NULL = usar la cuenta de bancos por defecto de la organización.';
comment on column public.cash_sessions.account_code is
  'Cuenta del plan contable (chart_of_accounts.account_code) donde se refleja el efectivo de esta caja. NULL = usar la cuenta de caja por defecto de la organización.';

-- No hay FK: `chart_of_accounts` es por organización y su clave es (organization_id,
-- account_code); una FK compuesta obligaría a arrastrar organization_id en la
-- referencia. La validación vive en `fn_create_journal_entry`, que ya comprueba
-- que la cuenta exista en el plan de esa organización antes de escribir.
create index if not exists idx_bank_accounts_account_code
  on public.bank_accounts (organization_id, account_code) where account_code is not null;
create index if not exists idx_cash_sessions_account_code
  on public.cash_sessions (organization_id, account_code) where account_code is not null;
