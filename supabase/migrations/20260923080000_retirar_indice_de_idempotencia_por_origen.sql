-- Bloque 1 contable · migración 8
--
-- `idx_journal_entries_unique_source` era UNIQUE sobre `(source, source_id)`
-- **sin `organization_id`**. Dos cosas malas a la vez
-- (docs/design/AUDITORIA-TESORERIA-CONTABILIDAD.md §D.4):
--
-- - Es un cerrojo entre inquilinos: dos organizaciones con el mismo par
--   origen/id —por ejemplo un `source_id` que venga de un contador propio— se
--   bloquean entre sí.
-- - Y no evita el duplicado real, porque el duplicado venía de DOS orígenes
--   distintos para el mismo hecho: `sales` e `invoice_sales`.
--
-- Lo sustituye `uq_journal_entries_fact_key`, UNIQUE sobre
-- `(organization_id, fact_key)`, que sí es por inquilino y sí ancla el hecho.
--
-- `source` y `source_id` se conservan como trazabilidad hacia el origen; solo
-- dejan de ser la clave de unicidad. Se deja un índice NO único sobre ellos
-- para que las consultas por origen sigan siendo rápidas.

drop index if exists public.idx_journal_entries_unique_source;

create index if not exists idx_journal_entries_source
  on public.journal_entries (organization_id, source, source_id)
  where source is not null;

-- Los comentarios de esquema de las dos migraciones anteriores se aplicaron sin
-- acentos por el camino de la herramienta; se dejan aquí en su forma correcta,
-- que es la que viaja a los tipos generados.
comment on column public.bank_accounts.account_code is
  'Cuenta del plan contable (chart_of_accounts.account_code) donde se refleja el saldo de esta cuenta bancaria. NULL = usar la cuenta de bancos por defecto de la organización.';
comment on column public.cash_sessions.account_code is
  'Cuenta del plan contable (chart_of_accounts.account_code) donde se refleja el efectivo de esta caja. NULL = usar la cuenta de caja por defecto de la organización.';
comment on table public.journal_entry_failures is
  'Asientos que fn_create_journal_entry rechazó y por qué. Antes eran RAISE NOTICE que nadie leía: un hecho sin asiento era indistinguible de un hecho que no ocurrió.';
comment on column public.journal_entry_failures.reason is
  'Código del rechazo: amount_invalid | account_null | same_account | no_rule | debit_account_missing | credit_account_missing | tax_account_missing | period_closed.';
