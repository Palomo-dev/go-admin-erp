-- Revierte los borradores del sobrante (20261023190100).
--
-- No publica nada. Si un borrador tocado ya está publicado (posted is true),
-- no reescribe sus líneas: primero fn_revertir_asiento y este script se detiene.
-- Restaura las líneas desde sobrante_linea_respaldo. No hace drop table de
-- ese respaldo ni de sobrante_funcion_respaldo.
--
-- Después corre el rollback 20261023190000, que devuelve las funciones.

do $datos$
begin
  if to_regclass('public.sobrante_linea_respaldo') is null then
    return;
  end if;
  if exists (
    select 1
    from public.journal_entries je
    join public.sobrante_linea_respaldo s on s.journal_entry_id = je.id
    where je.posted is true
  ) then
    raise exception 'sobrante_borrador_publicado: posted is true, primero fn_revertir_asiento';
  end if;

  delete from public.journal_lines jl
  using public.sobrante_linea_respaldo s
  where jl.journal_entry_id = s.journal_entry_id;

  insert into public.journal_lines (
    journal_entry_id, account_code, description, debit, credit,
    organization_id, debit_base, credit_base, cost_center_id
  )
  select s.journal_entry_id, s.account_code, s.description, s.debit, s.credit,
         s.organization_id, s.debit_base, s.credit_base, s.cost_center_id
  from public.sobrante_linea_respaldo s;
end
$datos$;

delete from public.sobrante_aviso where origen = 'historico';

drop function if exists public.fn_sobrante_borradores();
