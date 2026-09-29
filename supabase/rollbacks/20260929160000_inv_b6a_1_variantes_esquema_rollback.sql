-- Reversión de 20260929160000_inv_b6a_1_variantes_esquema.sql
-- Vuelve a la RLS por pertenencia (FOR ALL) y quita las columnas nuevas.
-- Las columnas guardan orden, estilo, colores, códigos y traducciones: al
-- revertir se pierden (el catálogo y `variant_data` no cambian).

set local lock_timeout = '5s';

drop policy if exists variant_types_lectura on public.variant_types;
drop policy if exists variant_types_insercion on public.variant_types;
drop policy if exists variant_types_edicion on public.variant_types;
drop policy if exists variant_types_borrado on public.variant_types;
drop policy if exists variant_values_lectura on public.variant_values;
drop policy if exists variant_values_insercion on public.variant_values;
drop policy if exists variant_values_edicion on public.variant_values;
drop policy if exists variant_values_borrado on public.variant_values;

create policy variant_types_miembros on public.variant_types
  for all to authenticated
  using (organization_id in (
    select om.organization_id from public.organization_members om
     where om.user_id = (select auth.uid()) and om.is_active = true))
  with check (organization_id in (
    select om.organization_id from public.organization_members om
     where om.user_id = (select auth.uid()) and om.is_active = true));

create policy variant_values_miembros on public.variant_values
  for all to authenticated
  using (variant_type_id in (
    select vt.id from public.variant_types vt
      join public.organization_members om on om.organization_id = vt.organization_id
     where om.user_id = (select auth.uid()) and om.is_active = true))
  with check (variant_type_id in (
    select vt.id from public.variant_types vt
      join public.organization_members om on om.organization_id = vt.organization_id
     where om.user_id = (select auth.uid()) and om.is_active = true));

drop function if exists public.fn_inventario_puede(integer, text);

drop trigger if exists trg_variant_types_tocar on public.variant_types;
drop trigger if exists trg_variant_values_tocar on public.variant_values;
drop function if exists public.fn_variantes_int_tocar();

drop index if exists public.variant_values_tipo_sku_code;
drop index if exists public.variant_types_org_orden;

alter table public.variant_types
  drop constraint if exists variant_types_display_style_check,
  drop constraint if exists variant_types_meta_attribute_check,
  drop constraint if exists variant_types_translations_check,
  drop column if exists display_order,
  drop column if exists is_active,
  drop column if exists display_style,
  drop column if exists meta_attribute,
  drop column if exists translations,
  drop column if exists updated_at,
  drop column if exists created_by;

alter table public.variant_values
  drop constraint if exists variant_values_hex_color_check,
  drop constraint if exists variant_values_sku_code_check,
  drop constraint if exists variant_values_translations_check,
  drop column if exists hex_color,
  drop column if exists image_url,
  drop column if exists sku_code,
  drop column if exists is_active,
  drop column if exists translations,
  drop column if exists updated_at,
  drop column if exists created_by;
