-- Inventario B6a · Variantes: columnas del catálogo de tipos y valores, y
-- escritura del catálogo solo con permiso de catálogo.
--
-- Plan: docs/implementacion/INVENTARIO-PLAN.md §5.7 (B6a) y
-- docs/design/INVENTARIO-PARIDAD-FIGMA.md §3.2 (Figma `969:595070`).
--
-- Todo aditivo: columnas con DEFAULT o NULL-ables. No se crea el índice único
-- sin mayúsculas ni espacios: hoy chocaría con los repetidos que existen
-- («Diseño» / «Diseño ») y fusionarlos es decisión de cada organización (la
-- pantalla los marca como «Repetido» y ofrece «Fusionar»). Las RPC de B6a
-- impiden crear repetidos nuevos.
--
-- RLS: la lectura sigue por pertenencia (y el catálogo global de la org 0).
-- Antes cualquier miembro activo podía renombrar o borrar el catálogo por API;
-- desde aquí insertar, cambiar o borrar exige además el permiso de catálogo
-- de inventario (`editar_catalogo`, el mismo de `fn_inventario_permisos`). El
-- alta directa desde el detalle del producto («Guardar este valor en el
-- catálogo», archivo de B7) sigue funcionando para quien tiene ese permiso.
-- `fn_producto_int_asegurar_atributos` (guardado del producto) es SECURITY
-- DEFINER y no pasa por la RLS.

set local lock_timeout = '5s';

-- Tipos ----------------------------------------------------------------------
alter table public.variant_types
  add column if not exists display_order integer not null default 0,
  add column if not exists is_active boolean not null default true,
  add column if not exists display_style text not null default 'texto',
  add column if not exists meta_attribute text,
  add column if not exists translations jsonb not null default '{}'::jsonb,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists created_by uuid default auth.uid();

alter table public.variant_types drop constraint if exists variant_types_display_style_check;
alter table public.variant_types add constraint variant_types_display_style_check
  check (display_style in ('texto', 'color', 'imagen'));
alter table public.variant_types drop constraint if exists variant_types_meta_attribute_check;
alter table public.variant_types add constraint variant_types_meta_attribute_check
  check (meta_attribute is null or meta_attribute in ('color', 'size', 'material', 'pattern', 'gender', 'age_group'));
alter table public.variant_types drop constraint if exists variant_types_translations_check;
alter table public.variant_types add constraint variant_types_translations_check
  check (jsonb_typeof(translations) = 'object');

comment on column public.variant_types.display_order is 'Orden del tipo en el selector del POS, la tienda y el formulario del producto (0 = primero).';
comment on column public.variant_types.is_active is 'false: el tipo deja de ofrecerse al crear variantes; las variantes existentes no cambian.';
comment on column public.variant_types.display_style is 'Cómo se muestran sus valores: texto, muestra de color (hex por valor) o imagen.';
comment on column public.variant_types.meta_attribute is 'Campo del catálogo de Facebook al que va el tipo (color, size, material, pattern, gender, age_group). NULL: se deduce por el nombre.';
comment on column public.variant_types.translations is 'Nombre en otros idiomas: {"en": "...", "fr": "...", "pt": "..."}.';

-- Valores --------------------------------------------------------------------
alter table public.variant_values
  add column if not exists hex_color text,
  add column if not exists image_url text,
  add column if not exists sku_code text,
  add column if not exists is_active boolean not null default true,
  add column if not exists translations jsonb not null default '{}'::jsonb,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists created_by uuid default auth.uid();

alter table public.variant_values drop constraint if exists variant_values_hex_color_check;
alter table public.variant_values add constraint variant_values_hex_color_check
  check (hex_color is null or hex_color ~ '^#[0-9A-Fa-f]{6}$');
alter table public.variant_values drop constraint if exists variant_values_sku_code_check;
alter table public.variant_values add constraint variant_values_sku_code_check
  check (sku_code is null or sku_code ~ '^[A-Za-z0-9]{1,8}$');
alter table public.variant_values drop constraint if exists variant_values_translations_check;
alter table public.variant_values add constraint variant_values_translations_check
  check (jsonb_typeof(translations) = 'object');

comment on column public.variant_values.hex_color is 'Muestra de color (#RRGGBB) cuando el tipo se muestra como color.';
comment on column public.variant_values.sku_code is 'Código corto del valor para el SKU de la variante (CAM-001-NEG-M). Único dentro del tipo.';
comment on column public.variant_values.is_active is 'false: el valor deja de ofrecerse al crear variantes; las variantes existentes no cambian.';
comment on column public.variant_values.translations is 'Valor en otros idiomas: {"en": "...", "fr": "...", "pt": "..."}.';

create unique index if not exists variant_values_tipo_sku_code
  on public.variant_values (variant_type_id, upper(sku_code))
  where sku_code is not null;

create index if not exists variant_types_org_orden
  on public.variant_types (organization_id, display_order, id);

-- updated_at -----------------------------------------------------------------
create or replace function public.fn_variantes_int_tocar()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  NEW.updated_at := now();
  return NEW;
end;
$$;
revoke all on function public.fn_variantes_int_tocar() from public, anon, authenticated;

drop trigger if exists trg_variant_types_tocar on public.variant_types;
create trigger trg_variant_types_tocar before update on public.variant_types
  for each row execute function public.fn_variantes_int_tocar();
drop trigger if exists trg_variant_values_tocar on public.variant_values;
create trigger trg_variant_values_tocar before update on public.variant_values
  for each row execute function public.fn_variantes_int_tocar();

-- Permiso en booleano para la RLS --------------------------------------------
-- `fn_inventario_permisos` lanza 42501 si no hay pertenencia; dentro de una
-- política eso rompería la consulta entera. Esta envoltura responde false.
create or replace function public.fn_inventario_puede(p_org integer, p_accion text)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if p_org is null or auth.uid() is null then
    return false;
  end if;
  return coalesce((public.fn_inventario_permisos(p_org) ->> p_accion)::boolean, false);
exception when others then
  return false;
end;
$$;
comment on function public.fn_inventario_puede(integer, text) is
  'true si la sesión tiene la acción de inventario (fn_inventario_permisos) en la organización; false ante cualquier error. Para políticas RLS.';
revoke all on function public.fn_inventario_puede(integer, text) from public, anon;
grant execute on function public.fn_inventario_puede(integer, text) to authenticated;

-- RLS de variant_types -------------------------------------------------------
drop policy if exists variant_types_miembros on public.variant_types;
drop policy if exists variant_types_lectura on public.variant_types;
drop policy if exists variant_types_insercion on public.variant_types;
drop policy if exists variant_types_edicion on public.variant_types;
drop policy if exists variant_types_borrado on public.variant_types;

create policy variant_types_lectura on public.variant_types
  for select to authenticated
  using (organization_id in (
    select om.organization_id from public.organization_members om
     where om.user_id = (select auth.uid()) and om.is_active = true));

create policy variant_types_insercion on public.variant_types
  for insert to authenticated
  with check (
    organization_id in (
      select om.organization_id from public.organization_members om
       where om.user_id = (select auth.uid()) and om.is_active = true)
    and public.fn_inventario_puede(organization_id, 'editar_catalogo'));

create policy variant_types_edicion on public.variant_types
  for update to authenticated
  using (
    organization_id in (
      select om.organization_id from public.organization_members om
       where om.user_id = (select auth.uid()) and om.is_active = true)
    and public.fn_inventario_puede(organization_id, 'editar_catalogo'))
  with check (
    organization_id in (
      select om.organization_id from public.organization_members om
       where om.user_id = (select auth.uid()) and om.is_active = true)
    and public.fn_inventario_puede(organization_id, 'editar_catalogo'));

create policy variant_types_borrado on public.variant_types
  for delete to authenticated
  using (
    organization_id in (
      select om.organization_id from public.organization_members om
       where om.user_id = (select auth.uid()) and om.is_active = true)
    and public.fn_inventario_puede(organization_id, 'eliminar'));

-- RLS de variant_values ------------------------------------------------------
drop policy if exists variant_values_miembros on public.variant_values;
drop policy if exists variant_values_lectura on public.variant_values;
drop policy if exists variant_values_insercion on public.variant_values;
drop policy if exists variant_values_edicion on public.variant_values;
drop policy if exists variant_values_borrado on public.variant_values;

create policy variant_values_lectura on public.variant_values
  for select to authenticated
  using (variant_type_id in (
    select vt.id from public.variant_types vt
      join public.organization_members om on om.organization_id = vt.organization_id
     where om.user_id = (select auth.uid()) and om.is_active = true));

create policy variant_values_insercion on public.variant_values
  for insert to authenticated
  with check (variant_type_id in (
    select vt.id from public.variant_types vt
      join public.organization_members om on om.organization_id = vt.organization_id
     where om.user_id = (select auth.uid()) and om.is_active = true
       and public.fn_inventario_puede(vt.organization_id, 'editar_catalogo')));

create policy variant_values_edicion on public.variant_values
  for update to authenticated
  using (variant_type_id in (
    select vt.id from public.variant_types vt
      join public.organization_members om on om.organization_id = vt.organization_id
     where om.user_id = (select auth.uid()) and om.is_active = true
       and public.fn_inventario_puede(vt.organization_id, 'editar_catalogo')))
  with check (variant_type_id in (
    select vt.id from public.variant_types vt
      join public.organization_members om on om.organization_id = vt.organization_id
     where om.user_id = (select auth.uid()) and om.is_active = true
       and public.fn_inventario_puede(vt.organization_id, 'editar_catalogo')));

create policy variant_values_borrado on public.variant_values
  for delete to authenticated
  using (variant_type_id in (
    select vt.id from public.variant_types vt
      join public.organization_members om on om.organization_id = vt.organization_id
     where om.user_id = (select auth.uid()) and om.is_active = true
       and public.fn_inventario_puede(vt.organization_id, 'eliminar')));

revoke all on public.variant_types from anon;
revoke all on public.variant_values from anon;
