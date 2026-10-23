-- Rollback de 20261023143100_reglas_contables_juan_borradores.sql
--
-- Borra los comprobantes de reclasificación que siguen en borrador.
-- No toca los asientos históricos.
-- Si alguno ya está publicado, este script se detiene: primero
--   select public.fn_revertir_asiento(id, 'regla_contable', 'regla-contable');
-- con el periodo de ese asiento abierto. El contra-asiento se queda en el libro.

set lock_timeout = '8s';
set statement_timeout = '40s';

do $rb$
begin
  if exists (
    select 1
    from public.journal_entries
    where fact_key like 'regla_contable:%'
      and posted is true
  ) then
    raise exception 'hay comprobantes de reclasificación publicados: reviértelos con fn_revertir_asiento antes de este rollback';
  end if;
end
$rb$;

delete from public.journal_lines jl
using public.journal_entries je
where jl.journal_entry_id = je.id
  and je.fact_key like 'regla_contable:%'
  and je.posted is not true;

delete from public.journal_entries
where fact_key like 'regla_contable:%'
  and posted is not true;

do $rb$
begin
  if to_regclass('public.regla_contable_aviso') is null then
    return;
  end if;
  update public.regla_contable_aviso
     set journal_entry_id = null,
         monto = 0,
         nota = null;
end
$rb$;
