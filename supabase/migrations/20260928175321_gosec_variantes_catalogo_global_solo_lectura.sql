-- GO-sec (2026-09-28) — El catálogo GLOBAL de variantes (organization_id = 0:
-- 4 tipos y 38 valores que leen todas las organizaciones) no lo escribe nadie
-- desde la API.
--
-- Verificado en la base viva antes de aplicar:
--   * crear_tipo_variante(text, integer, text[]) es SECURITY DEFINER, sin
--     search_path, con EXECUTE para authenticated, y con p_organization_id = 0
--     se salta la comprobación de pertenencia: cualquier usuario con sesión
--     insertaba tipos y valores en el catálogo global
--     (docs/design/INVENTARIO-PARIDAD-FIGMA.md, sección 2).
--   * Nadie la llama: ni el ERP (src, supabase/functions), ni goadmin-websites,
--     ni go-admin-super, ni go-admin-sellers, ni otra función de la base, ni
--     pg_cron. Se revoca en vez de borrarla (el rollback la reabre).
--   * RLS: variant_types_miembros / variant_values_miembros exigen ser miembro
--     activo de la organización de la fila y la organización 0 no existe ni
--     tiene miembros, así que hoy la API ya no escribe filas de la org 0. Se
--     añade una restrictiva explícita para que no dependa de que nunca exista
--     una organización con id 0.
--   * Las RPC que sí crean tipos y valores (fn_producto_int_asegurar_atributos,
--     fn_importar_productos_lote) escriben en la organización validada con
--     fn_assert_acceso_org, nunca en la 0; son SECURITY DEFINER del dueño de la
--     tabla y no les afecta la RLS.

revoke all on function public.crear_tipo_variante(text, integer, text[]) from public, anon, authenticated;
grant execute on function public.crear_tipo_variante(text, integer, text[]) to service_role;

drop policy if exists variant_types_global_solo_lectura on public.variant_types;
create policy variant_types_global_solo_lectura on public.variant_types
  as restrictive for all to authenticated
  using (true)
  with check (organization_id <> 0);

drop policy if exists variant_values_global_solo_lectura on public.variant_values;
create policy variant_values_global_solo_lectura on public.variant_values
  as restrictive for all to authenticated
  using (true)
  with check (variant_type_id not in (select vt.id from public.variant_types vt where vt.organization_id = 0));

revoke insert, update, delete, truncate on table public.variant_types, public.variant_values from anon;
