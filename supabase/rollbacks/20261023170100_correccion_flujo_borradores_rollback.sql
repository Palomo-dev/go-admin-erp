-- Quita los borradores de 20261023170100 y devuelve las líneas de los
-- comprobantes regla_contable a como estaban antes de quitar 5150 y el solape.
-- Si un borrador de esta corrección ya se publicó, primero
-- fn_revertir_asiento con el periodo abierto. No borra el respaldo de la
-- migración 20261023170000.

set lock_timeout = '15s';
set statement_timeout = '180s';

do $rb$
begin
  if exists (
    select 1 from public.journal_entries
    where (fact_key like 'correccion_reversion:%' or fact_key like 'correccion_reclasificacion:%')
      and posted is true
  ) then
    raise exception 'hay un comprobante de correccion publicado: reviertelo con fn_revertir_asiento antes';
  end if;

  if to_regclass('public.correccion_flujo_linea_respaldo') is not null and exists (
    select 1
    from public.correccion_flujo_linea_respaldo b
    join public.journal_entries je on je.id = b.journal_entry_id
    where je.posted is true
  ) then
    raise exception 'un comprobante regla_contable respaldado ya esta publicado: reviertelo antes';
  end if;
end
$rb$;

update public.journal_lines jl
   set debit = b.debit,
       credit = b.credit,
       debit_base = b.debit_base,
       credit_base = b.credit_base,
       description = b.description,
       updated_at = now()
  from public.correccion_flujo_linea_respaldo b
 where b.journal_line_id = jl.id
   and b.accion in ('debito_original', 'quitar_solape_6105');

insert into public.journal_lines (
  id, journal_entry_id, account_code, description, debit, credit,
  organization_id, debit_base, credit_base
)
select b.journal_line_id, b.journal_entry_id, b.account_code, b.description,
       b.debit, b.credit, b.organization_id, b.debit_base, b.credit_base
from public.correccion_flujo_linea_respaldo b
where b.accion in ('quitar_5150', 'quitar_solape_6105', 'debito_original')
  and b.journal_line_id is not null
  and not exists (
    select 1 from public.journal_lines jl where jl.id = b.journal_line_id
  )
  and exists (
    select 1 from public.journal_entries je
    where je.id = b.journal_entry_id and je.posted is false
  );

delete from public.journal_lines jl
 using public.journal_entries je
 where je.id = jl.journal_entry_id
   and je.posted is false
   and (je.fact_key like 'correccion_reversion:%' or je.fact_key like 'correccion_reclasificacion:%');

delete from public.journal_entries
 where posted is false
   and (fact_key like 'correccion_reversion:%' or fact_key like 'correccion_reclasificacion:%');

do $rb$
begin
  if to_regclass('public.correccion_flujo_linea_respaldo') is not null then
    delete from public.correccion_flujo_linea_respaldo;
  end if;
end
$rb$;

drop function if exists public.fn_correccion_flujo_borradores();
drop table if exists public.correccion_flujo_aviso;
drop table if exists public.correccion_flujo_sql_tmp;
