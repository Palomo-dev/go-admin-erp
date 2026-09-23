-- Rollback de 20260923083206_reversion_historica_infraestructura.sql
--
-- Retira las funciones de la reversión histórica. NO borra las bitácoras
-- (journal_reversals, journal_reversal_runs) si ya se ejecutó la reversión:
-- son el rastro de qué contra-asiento neutralizó qué asiento. Si la reversión
-- nunca se ejecutó (0 filas), se pueden borrar también.
--
-- Para deshacer una reversión YA ejecutada no se borra nada: se revierte cada
-- contra-asiento y cada devengo corregido con fn_revertir_asiento (ver
-- docs/procedimientos/reversion-asientos-duplicados.md, «Rollback»), así que
-- este archivo solo debe aplicarse después de eso, o nunca.

drop function if exists public.fn_reversion_historica_org(integer, text, boolean);
drop function if exists public.fn_cuadre_contable_org(integer);

do $$
begin
  if not exists (select 1 from public.journal_reversals) then
    drop function if exists public.fn_revertir_asiento(integer, text, text);
    drop table if exists public.journal_reversals;
    drop table if exists public.journal_reversal_runs;
  end if;
end $$;
