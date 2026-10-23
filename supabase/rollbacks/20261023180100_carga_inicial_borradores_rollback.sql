-- Borra los borradores de la carga inicial histórica si siguen sin publicar.
-- No llama a fn_revertir_asiento: ese contra-asiento es solo para un asiento
-- ya publicado (lo hace el rollback de 20261023180000).
-- Si un borrador ya se publicó, hay que revertirlo antes con
-- fn_revertir_asiento(id, 'carga_inicial', 'rollback') y el periodo abierto.
-- No borra la función ni el disparador: eso es el rollback anterior.

do $bloqueo$
begin
  if exists (
    select 1 from public.journal_entries
    where posted is true
      and fact_key like 'carga_inicial_borrador:%'
  ) then
    raise exception 'hay un borrador de carga inicial ya publicado: revertirlo con fn_revertir_asiento antes de borrar';
  end if;
end
$bloqueo$;

delete from public.journal_lines jl
using public.journal_entries je
where jl.journal_entry_id = je.id
  and je.posted is false
  and je.fact_key like 'carga_inicial_borrador:%';

delete from public.carga_inicial_cubierta c
using public.journal_entries je
where c.journal_entry_id = je.id
  and je.posted is false
  and je.fact_key like 'carga_inicial_borrador:%';

delete from public.journal_entries
where posted is false
  and fact_key like 'carga_inicial_borrador:%';

delete from public.carga_inicial_aviso
where clase in (
  'borrador', 'sin_costo', 'excluida_prueba', 'sin_sucursal',
  'ya_publicado', 'sin_cuenta', 'descuadrado'
);
