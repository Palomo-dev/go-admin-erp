-- NO APLICAR.
--
-- Propuesta para sembrar las 38 categorías predefinidas en las
-- organizaciones que todavía no las tienen. No está en supabase/migrations
-- y no se ejecutó. No toca asientos, planes ni movimientos.
--
-- ON CONFLICT no pisa una categoría ya editada: solo inserta la clave
-- que falte. Si el nombre ya existe, esa fila se omite.
--
-- La parte 2 aborta sola. Hay que borrar el raise exception para correrla,
-- dentro de una transacción.

-- ---------------------------------------------------------------------------
-- Parte 1. Diagnóstico. Solo lee.
-- ---------------------------------------------------------------------------

select count(*) as organizaciones_sin_categorias
from organizations o
where not exists (
  select 1 from categorias_tesoreria c where c.organization_id = o.id
);

-- ---------------------------------------------------------------------------
-- Parte 2. No se ejecuta mientras esté el raise.
-- ---------------------------------------------------------------------------

do $propuesta$
declare
  org record;
  v_filas integer;
begin
  raise exception 'Propuesta sin aplicar. Borre este raise para sembrar las categorias de tesoreria.';

  for org in
    select o.id
      from public.organizations o
     where not exists (
       select 1 from public.categorias_tesoreria c where c.organization_id = o.id
     )
     order by o.id
  loop
    v_filas := public.fn_sembrar_categorias_tesoreria(org.id);
    raise notice 'org % categorias insertadas %', org.id, v_filas;
  end loop;
end
$propuesta$;
