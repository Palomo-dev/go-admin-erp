-- Rollback de 20260928220000_impuestos_clase_retencion.sql
--
-- Restaura las funciones como estaban y retira la clase. ADVIERTE: quitar la
-- columna kind borra la clasificación (228 filas de retención vuelven a verse
-- como impuestos de venta en los selectores). No restaura el updated_at que la
-- migración tocó en esas filas ni en las 3 plantillas. No borra filas.

-- 11. Plantillas del país (firma y cuerpo anteriores).
drop function if exists public.get_tax_templates_by_organization_country(integer);
create function public.get_tax_templates_by_organization_country(org_id integer)
 RETURNS TABLE(id integer, country character varying, code text, name character varying, rate numeric, description text, valid_from timestamp with time zone, valid_to timestamp with time zone, created_at timestamp with time zone, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE 
  org_country_code varchar(3);
BEGIN
  perform public.fn_assert_acceso_org(org_id::integer);
  -- Obtener el código de país de la organización
  SELECT country_code INTO org_country_code
  FROM organizations 
  WHERE organizations.id = org_id
  LIMIT 1;
  
  -- Si no se encuentra la organización o no tiene país, devolver vacío
  IF org_country_code IS NULL THEN
    RETURN;
  END IF;
  
  -- Retornar plantillas del país de la organización
  RETURN QUERY
  SELECT 
    tt.id,
    tt.country,
    tt.code,
    tt.name,
    tt.rate,
    tt.description,
    tt.valid_from,
    tt.valid_to,
    tt.created_at,
    tt.updated_at
  FROM 
    tax_templates tt
  WHERE 
    tt.country = org_country_code
  ORDER BY 
    tt.name;
END;
$function$;
revoke all on function public.get_tax_templates_by_organization_country(integer) from public, anon;
grant execute on function public.get_tax_templates_by_organization_country(integer) to authenticated, service_role;

-- 10. Código DIAN de la línea (prefijo RETE).
CREATE OR REPLACE FUNCTION public.fn_codigo_impuesto_linea(p_organization_id integer, p_product_id integer, p_tax_rate numeric)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_code text;
begin
  if p_tax_rate is null or p_organization_id is null then
    return null;
  end if;

  if p_product_id is not null then
    select tt.code into v_code
    from product_tax_relations r
    join organization_taxes ot on ot.id = r.tax_id
    join tax_templates tt on tt.id = ot.template_id
    where r.product_id = p_product_id
      and ot.organization_id = p_organization_id
      and ot.is_active
      and ot.rate = p_tax_rate
      and tt.code not ilike '%RETE%'
    order by tt.id
    limit 1;
    if v_code is not null then
      return v_code;
    end if;
  end if;

  if p_tax_rate = 0 then
    return null;
  end if;

  select tt.code into v_code
  from organizations o
  join tax_templates tt on tt.country = o.country_code
  where o.id = p_organization_id
    and tt.rate = p_tax_rate
    and tt.code not ilike '%RETE%'
    and (tt.valid_to is null or tt.valid_to > now())
  order by tt.id
  limit 1;

  return v_code;
end;
$function$;

-- 9. Tarifa por defecto (sin la guarda de retención).
CREATE OR REPLACE FUNCTION public.fn_impuesto_fijar_por_defecto(p_organization_id integer, p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  perform public.fn_impuestos_exigir_gestion(p_organization_id);
  if p_id is not null and not exists (
      select 1 from public.organization_taxes where id = p_id and organization_id = p_organization_id) then
    raise exception 'impuesto_no_encontrado' using errcode = 'P0002',
      hint = 'El impuesto no pertenece a esta organización';
  end if;
  update public.organization_taxes
     set is_default = false, updated_at = now()
   where organization_id = p_organization_id and is_default
     and (p_id is null or id <> p_id);
  if p_id is not null then
    update public.organization_taxes
       set is_default = true, updated_at = now()
     where id = p_id and organization_id = p_organization_id and not is_default;
  end if;
end;
$function$;

-- 8. manage_organization_tax: vuelve la firma de 9 argumentos (20260928200000).
drop function if exists public.manage_organization_tax(integer, text, numeric, text, boolean, boolean, integer, text, boolean, text);
create or replace function public.manage_organization_tax(
  p_organization_id integer, p_name text, p_rate numeric,
  p_description text default null, p_is_default boolean default false, p_is_active boolean default true,
  p_template_id integer default null, p_id text default null, p_tax_included boolean default false)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_tax_id uuid;
  v_id     uuid;
  v_now    timestamptz := now();
begin
  begin
    perform public.fn_impuestos_exigir_gestion(p_organization_id);
  exception when insufficient_privilege then
    return jsonb_build_object('success', false, 'code', 'PERMISSION_DENIED',
      'message', 'No tiene permisos para administrar impuestos en esta organización');
  end;

  if p_id is not null then
    begin
      v_id := p_id::uuid;
    exception when others then
      return jsonb_build_object('success', false, 'message', 'ID de impuesto inválido', 'code', 'INVALID_ID');
    end;
  end if;

  if p_rate is null or p_rate < 0 or p_rate > 100 then
    return jsonb_build_object('success', false, 'message', 'La tasa debe estar entre 0 y 100%.', 'code', 'INVALID_RATE');
  end if;
  if p_template_id is not null and not exists (select 1 from public.tax_templates where id = p_template_id) then
    return jsonb_build_object('success', false, 'message', 'La plantilla de impuesto no existe', 'code', 'TEMPLATE_NOT_FOUND');
  end if;

  if v_id is not null then
    perform 1 from public.organization_taxes
     where id = v_id and organization_id = p_organization_id for update;
    if not found then
      return jsonb_build_object('success', false, 'message', 'El impuesto no existe o no pertenece a esta organización', 'code', 'TAX_NOT_FOUND');
    end if;
  end if;

  -- Primero se desmarcan los demás: con el índice único nunca hay dos.
  if p_is_default then
    update public.organization_taxes
       set is_default = false, updated_at = v_now
     where organization_id = p_organization_id and is_default
       and (v_id is null or id <> v_id);
  end if;

  if v_id is not null then
    update public.organization_taxes
       set name = p_name, rate = p_rate, description = p_description,
           is_default = p_is_default, is_active = p_is_active, template_id = p_template_id,
           tax_included = coalesce(p_tax_included, false), updated_at = v_now
     where id = v_id and organization_id = p_organization_id
    returning id into v_tax_id;
  else
    insert into public.organization_taxes (
      organization_id, name, rate, description, is_default, is_active, template_id, tax_included, created_at, updated_at)
    values (
      p_organization_id, p_name, p_rate, p_description, p_is_default, p_is_active, p_template_id,
      coalesce(p_tax_included, false), v_now, v_now)
    returning id into v_tax_id;
  end if;

  return jsonb_build_object('success', true, 'id', v_tax_id::text,
    'message', case when v_id is not null then 'Impuesto actualizado correctamente' else 'Impuesto creado correctamente' end);
end;
$function$;

revoke all on function public.manage_organization_tax(integer, text, numeric, text, boolean, boolean, integer, text, boolean) from public, anon;
grant execute on function public.manage_organization_tax(integer, text, numeric, text, boolean, boolean, integer, text, boolean) to authenticated, service_role;

-- 7. Importar productos: se quita la línea «and t.kind = 'tax'» (vuelve al
-- cuerpo de 20260924150000, md5 del prosrc f32d00ff792b63a956831020ac9c3a8f).
do $parche$
declare
  v_def   text;
  v_nueva constant text := E'             and coalesce(t.is_active, true)\n             and t.kind = ''tax''\n';
  v_linea constant text := E'             and coalesce(t.is_active, true)\n';
begin
  v_def := pg_get_functiondef('public.fn_importar_productos_lote(integer, integer, text, jsonb, jsonb)'::regprocedure);
  if position(v_nueva in v_def) = 0 then
    return;
  end if;
  execute replace(v_def, v_nueva, v_linea);
end;
$parche$;

-- 6. Validación de product_tax_relations.
drop trigger if exists trg_product_tax_relations_validar on public.product_tax_relations;
drop function if exists public.fn_product_tax_relations_validar();

-- 5. y 3. Restricción y disparador de clase.
alter table public.organization_taxes drop constraint if exists organization_taxes_retencion_no_por_defecto;
drop trigger if exists trg_organization_taxes_clase on public.organization_taxes;
drop function if exists public.fn_organization_taxes_clase_de_plantilla();

-- 1. Columnas (borra la clasificación: ver advertencia arriba).
alter table public.organization_taxes drop constraint if exists organization_taxes_kind_check;
alter table public.tax_templates drop constraint if exists tax_templates_kind_check;
alter table public.organization_taxes drop column if exists kind;
alter table public.tax_templates drop column if exists kind;
