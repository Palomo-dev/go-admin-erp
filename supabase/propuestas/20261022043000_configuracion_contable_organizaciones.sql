-- NO APLICAR.
--
-- Propuesta para dejar, en las organizaciones que todavía no tienen
-- configuración contable, las cuentas de la plantilla PUC según su sector.
-- No está en supabase/migrations y no se ejecutó.
--
-- No reescribe planes, reglas ni asientos. A partir de correrla, un documento
-- nuevo usa la cuenta propuesta cuando la regla trae el código canónico
-- (1105, 1110, 4135, 2408…). Si el sector propone una cuenta distinta de la
-- regla —un restaurante pasa el 4135 de la regla a 4110—, los asientos
-- siguientes cambian de cuenta. Las organizaciones que ya guardaron una fila
-- no se tocan.
--
-- La parte 2 aborta sola. Hay que borrar el raise exception para correrla,
-- dentro de una transacción.

-- ---------------------------------------------------------------------------
-- Parte 1. Diagnóstico. Solo lee.
-- ---------------------------------------------------------------------------

select count(*) as organizaciones_sin_configuracion
from organizations o
where not exists (
  select 1 from configuracion_contable c where c.organization_id = o.id
);

select o.type_id, count(*) as organizaciones
from organizations o
where not exists (
  select 1 from configuracion_contable c where c.organization_id = o.id
)
group by o.type_id
order by o.type_id;

-- ---------------------------------------------------------------------------
-- Parte 2. No se ejecuta mientras esté el raise.
-- ---------------------------------------------------------------------------

do $propuesta$
declare
  v_org record;
  v_insertadas integer := 0;
begin
  raise exception 'NO APLICAR: revisa la parte 1 y borra esta línea para sembrar la configuración';

  for v_org in
    select o.id
    from organizations o
    where not exists (
      select 1 from configuracion_contable c where c.organization_id = o.id
    )
    order by o.id
  loop
    perform fn_sembrar_configuracion_contable(v_org.id);
    v_insertadas := v_insertadas + 1;
  end loop;

  raise notice 'organizaciones revisadas: %', v_insertadas;
end
$propuesta$;
