-- Inventario B6a · Unidades propias de la organización y conversiones por
-- producto (Figma `593:333686`; PRODUCTO-RECETAS-Y-SUBSECCIONES §2.5 B2 y §3.5).
--
-- Todo aditivo:
-- - `units.organization_id` (NULL = unidad del sistema, la de siempre),
--   `is_active`, `created_by`. El código sigue siendo la clave primaria (lo
--   referencian productos, recetas, consumos y conversiones): una unidad
--   propia no puede usar un código que ya exista, del sistema o de otra
--   organización. Las 14 del sistema no cambian.
-- - Lectura de `units`: las del sistema y las propias (antes todas para todo
--   usuario autenticado, `using (true)`). Sigue sin escritura para
--   `authenticated`: se crean y editan con `fn_unidad_guardar` (B6a).
-- - `unit_conversions.product_id` (NULL = para toda la organización o del
--   sistema), `created_by`, `updated_at`; UNIQUE por alcance
--   (organización, producto, de, a) sin distinguir mayúsculas ni espacios
--   (0 duplicados hoy).
-- - Validación por disparador: factor > 0, de ≠ a, unidades visibles para la
--   organización, producto de la misma organización, y el mismo tipo de unidad
--   salvo en una conversión de UN producto (1 BUL de arroz = 25 KG).
-- - Escritura de `unit_conversions` solo por RPC (`fn_conversion_guardar`,
--   `fn_conversiones_eliminar`, con permiso de catálogo en el servidor): se
--   quitan las políticas de escritura por pertenencia y el GRANT de escritura
--   a `authenticated`. La lectura no cambia (globales + de la organización).

set local lock_timeout = '5s';

-- units -----------------------------------------------------------------------
alter table public.units
  add column if not exists organization_id integer references public.organizations(id) on delete cascade,
  add column if not exists is_active boolean not null default true,
  add column if not exists created_by uuid default auth.uid();

comment on column public.units.organization_id is 'NULL: unidad del sistema (para todas las organizaciones). Con valor: unidad propia de esa organización (bulto, atado).';
comment on column public.units.is_active is 'false: la unidad no se ofrece en formularios nuevos; lo que ya la usa no cambia.';

create index if not exists units_organization_id on public.units (organization_id) where organization_id is not null;

drop policy if exists units_lectura on public.units;
create policy units_lectura on public.units
  for select to authenticated
  using (
    organization_id is null
    or organization_id in (
      select om.organization_id from public.organization_members om
      where om.user_id = (select auth.uid()) and om.is_active = true
    )
  );

revoke all on public.units from anon;
revoke insert, update, delete, truncate on public.units from authenticated;

-- unit_conversions ---------------------------------------------------------------
alter table public.unit_conversions
  add column if not exists product_id integer references public.products(id) on delete cascade,
  add column if not exists created_by uuid default auth.uid(),
  add column if not exists updated_at timestamptz not null default now();

comment on column public.unit_conversions.product_id is 'Con valor: la conversión vale solo para ese producto (PAQ = 6 UN del pan). NULL: para toda la organización (organization_id) o del sistema (ambos NULL).';

create unique index if not exists unit_conversions_alcance_unico
  on public.unit_conversions (coalesce(organization_id, 0), coalesce(product_id, 0),
                              upper(btrim(from_unit_code)), upper(btrim(to_unit_code)));
create index if not exists unit_conversions_producto on public.unit_conversions (product_id) where product_id is not null;

create or replace function public.fn_unit_conversions_validar()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_de public.units;
  v_a public.units;
  v_org_producto integer;
begin
  if NEW.factor is null or NEW.factor <= 0 then
    raise exception 'factor_invalido' using errcode = '23514', detail = 'El factor debe ser mayor que cero.';
  end if;
  if upper(btrim(NEW.from_unit_code)) = upper(btrim(NEW.to_unit_code)) then
    raise exception 'misma_unidad' using errcode = '23514', detail = 'La conversión necesita dos unidades distintas.';
  end if;
  select * into v_de from public.units where upper(btrim(code)) = upper(btrim(NEW.from_unit_code));
  select * into v_a from public.units where upper(btrim(code)) = upper(btrim(NEW.to_unit_code));
  if (v_de.organization_id is not null and v_de.organization_id is distinct from NEW.organization_id)
     or (v_a.organization_id is not null and v_a.organization_id is distinct from NEW.organization_id) then
    raise exception 'unidad_ajena' using errcode = '23514', detail = 'La unidad es de otra organización.';
  end if;
  if NEW.product_id is not null then
    if NEW.organization_id is null then
      raise exception 'producto_sin_organizacion' using errcode = '23514';
    end if;
    select organization_id into v_org_producto from public.products where id = NEW.product_id;
    if v_org_producto is distinct from NEW.organization_id then
      raise exception 'producto_ajeno' using errcode = '23514', detail = 'El producto es de otra organización.';
    end if;
  elsif v_de.unit_type is not null and v_a.unit_type is not null and v_de.unit_type <> v_a.unit_type then
    raise exception 'tipos_distintos' using errcode = '23514',
      detail = 'Solo una conversión de un producto puede pasar entre tipos de unidad (1 BUL de arroz = 25 KG).';
  end if;
  NEW.updated_at := now();
  return NEW;
end;
$$;
revoke all on function public.fn_unit_conversions_validar() from public, anon, authenticated;

drop trigger if exists trg_unit_conversions_validar on public.unit_conversions;
create trigger trg_unit_conversions_validar
  before insert or update on public.unit_conversions
  for each row execute function public.fn_unit_conversions_validar();

drop policy if exists unit_conversions_insercion on public.unit_conversions;
drop policy if exists unit_conversions_edicion on public.unit_conversions;
drop policy if exists unit_conversions_borrado on public.unit_conversions;

revoke all on public.unit_conversions from anon;
revoke insert, update, delete, truncate on public.unit_conversions from authenticated;
