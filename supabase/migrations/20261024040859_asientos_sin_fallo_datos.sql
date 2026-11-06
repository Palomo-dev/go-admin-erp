update public.regla_contable_aviso a
   set journal_entry_id = null,
       nota = coalesce(a.nota, 'sin_movimiento')
 where a.journal_entry_id is not null
   and not exists (
     select 1 from public.journal_lines jl where jl.journal_entry_id = a.journal_entry_id
   );

update public.correccion_flujo_aviso a
   set journal_entry_id = null
 where a.journal_entry_id is not null
   and not exists (
     select 1 from public.journal_lines jl where jl.journal_entry_id = a.journal_entry_id
   );

update public.correccion_flujo_linea_respaldo a
   set journal_entry_id = null
 where a.journal_entry_id is not null
   and not exists (
     select 1 from public.journal_lines jl where jl.journal_entry_id = a.journal_entry_id
   );

select set_config('app.contabilidad_mantenimiento', 'on', true);
delete from public.journal_entries je
 where not exists (
   select 1 from public.journal_lines jl where jl.journal_entry_id = je.id
 );
select set_config('app.contabilidad_mantenimiento', '', true);

update public.journal_entry_failures
   set resolved_at = now(),
       resolution = 'importe_cero'
 where resolved_at is null
   and reason = 'amount_invalid'
   and round(coalesce(amount, 0), 0) <= 0;

select public.fn_reintentar_fallos_asiento();
