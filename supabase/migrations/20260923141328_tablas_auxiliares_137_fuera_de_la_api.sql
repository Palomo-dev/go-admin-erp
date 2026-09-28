-- Tablas auxiliares de la limpieza de tallas y variantes de la org 137: fuera
-- del alcance de anon y authenticated, sin borrar datos.
--
-- Hallazgo: get_advisors (rls_disabled_in_public, ERROR) y
-- docs/hallazgos/tablas-auxiliares-sin-rls-2026-09-19.md, que registró 9 de
-- ellas; después aparecieron _plan_sueltos_137 y _bkp_sueltos_nike_137 (21-09).
-- Las 11 estaban en public, sin RLS y con ALL para anon y authenticated:
-- cualquiera con la clave publicable podía leerlas o vaciarlas por PostgREST.
-- Guardan copias de products, variantes, existencias, costos y SKU.
--
-- Verificado antes de cerrar (2026-09-23): ninguna tiene función, vista,
-- clave foránea entrante, tarea de cron ni referencia en el código; no se
-- crearon por migración; la limpieza que las usó terminó (las 121 filas de
-- _plan_sueltos_137 tienen su nuevo producto creado).
--
-- RLS sin políticas: solo service_role y el dueño (postgres) las leen. Las
-- consultas por MCP siguen funcionando porque corren como postgres.

set local lock_timeout = '3s';

do $$
declare
  t text;
begin
  foreach t in array array[
    '_afectados_sufijos_137',
    '_bkp_sueltos_nike_137',
    '_bkp_tallas_co_137',
    '_bkp_tallas_co_137_padres',
    '_bkp_tallas_co_137_stock',
    '_bkp_variant_values_137',
    '_map_sufijos_137',
    '_map_tallas_co_137',
    '_nuevas_tallas_137',
    '_plan_ropa_137',
    '_plan_sueltos_137'
  ] loop
    if to_regclass('public.' || t) is not null then
      execute format('alter table public.%I enable row level security', t);
      execute format('revoke all on public.%I from anon, authenticated', t);
    end if;
  end loop;
end $$;
