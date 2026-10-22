-- Revierte el extracto y el bloqueo de periodos cerrados.
-- Las líneas de extracto importadas se pierden con las tablas.
-- Los movimientos de banco ya creados desde una línea NO se borran.

drop trigger if exists trg_fase6_periodo_journal on public.journal_entries;
drop trigger if exists trg_fase6_periodo_bank_tr on public.bank_transfers;
drop trigger if exists trg_fase6_periodo_bank_tx on public.bank_transactions;

drop function if exists public.fn_extracto_crear_movimiento(integer, uuid, text);
drop function if exists public.fn_extracto_emparejar(integer, uuid, integer);
drop function if exists public.fn_extracto_importar(integer, integer, uuid, text, text, jsonb);
drop function if exists public.fn_fase6_exigir_periodo_abierto();
drop function if exists public.fn_fase6_referencias_ok(text, text);
drop function if exists public.fn_fase6_norm_ref(text);

drop policy if exists extracto_lineas_lectura on public.extracto_lineas;
drop policy if exists extractos_bancarios_lectura on public.extractos_bancarios;
drop table if exists public.extracto_lineas;
drop table if exists public.extractos_bancarios;
