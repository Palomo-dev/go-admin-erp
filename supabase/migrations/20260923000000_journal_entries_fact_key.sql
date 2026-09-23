-- Bloque 1, migración 1: clave natural del hecho económico en journal_entries.
--
-- Hoy la idempotencia del asiento depende de (source, source_id), y por eso una
-- misma venta se contabiliza hasta cuatro veces: cada disparador firma con un
-- `source` distinto —'sales', 'invoice_sales', 'payments'— y ninguno ve a los
-- otros. Verificado: 2.322 ventas tienen a la vez su asiento y el de su factura.
--
-- `fact_key` identifica el HECHO, no su origen:
--   accrual:sale:{sale_id} · accrual:invoice:{invoice_id} · cogs:sale:{sale_id}
--   settlement:payment:{id} · cash_diff:session:{id} · transfer:{grupo}
--
-- El índice único es PARCIAL: los asientos históricos sin `fact_key` no
-- estorban, y el segundo intento de contabilizar un hecho ya registrado choca
-- contra la base de datos venga del disparador que venga.
--
-- Aditiva: columna NULL-able e índice nuevo. No toca ningún asiento existente.
-- Reversión: supabase/rollbacks/20260923000000_journal_entries_fact_key_rollback.sql

alter table public.journal_entries
  add column if not exists fact_key text;

comment on column public.journal_entries.fact_key is
  'Clave natural del hecho económico (accrual:sale:{id}, cogs:sale:{id}, settlement:payment:{id}, cash_diff:session:{id}, transfer:{grupo}). La idempotencia se apoya aquí, no en (source, source_id).';

create unique index if not exists uq_journal_entries_fact_key
  on public.journal_entries (organization_id, fact_key)
  where fact_key is not null;

-- Relleno de los asientos ya existentes. Comprobado antes de aplicar: 7.926
-- asientos derivables producen 7.926 claves distintas, es decir CERO
-- colisiones. Los 5.700 restantes se quedan con `fact_key` nulo y se irán
-- rellenando al reescribir sus disparadores.
update public.journal_entries
set fact_key = case
    when source = 'sales' then 'accrual:sale:' || source_id
    when source = 'invoice_sales' then 'accrual:invoice:' || source_id
    when source = 'payments' then 'settlement:payment:' || source_id
    when source = 'cash_sessions' then 'cash_diff:session:' || source_id
  end
where fact_key is null
  and source in ('sales', 'invoice_sales', 'payments', 'cash_sessions')
  and source_id is not null;
