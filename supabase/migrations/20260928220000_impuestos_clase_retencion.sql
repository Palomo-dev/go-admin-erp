-- Impuestos · las retenciones salen de «Impuestos de venta» a su propia clase (B-I2, 2026-09-28).
--
-- Decisión del dueño (pregunta 6 de docs/design/FINANZAS-TESORERIA-V2.md §9): SÍ se
-- reclasifican RETE 4 %, RETE 11 % e ICA, sin borrar filas.
--
-- Medido por MCP antes de aplicar (2026-09-28):
--   - organization_taxes: 456 filas en 76 organizaciones, todas con plantilla
--     (0 personalizadas). Cada organización tiene RETE_4, RETE_11 e ICA_0.966
--     activos, copiados de la plantilla de Colombia: 228 filas.
--   - Uso real como impuesto de esas 228: 0 relaciones con productos, 0 por
--     defecto, 0 productos con products.tax_id, 0 líneas de venta o de factura
--     con tarifa 4 / 11 / 0,97 ni con esos códigos (invoice_items solo tiene
--     IVA_19 e IVA_5). Nada se está cobrando con ellas.
--   - ICA_0.966 («ICA Bogotá 9.66x1000») se trata como ReteICA: el ICA no se
--     suma al precio de venta (lo declara el vendedor sobre sus ingresos); en
--     un documento solo aparece como ReteICA practicada por el comprador. Así
--     lo dibuja el diseño (frame 1012:87187, pestaña Retenciones: ReteICA) y
--     Factus no admite ICA como tributo de la línea (B8).
--   - fn_importar_productos_lote relacionaba el impuesto por NOMBRE o por TASA:
--     una columna «impuesto = 4 %» o «11» de un CSV se habría relacionado con
--     RETE_4 / RETE_11. product_tax_relations admitía por API un impuesto de
--     otra organización (0 filas cruzadas hoy de 3.548).
--
-- Qué hace (aditivo; no borra filas ni cambia tipos):
--   1. Columna kind ('tax' | 'withholding', NOT NULL DEFAULT 'tax') en
--      tax_templates y en organization_taxes.
--   2. Catálogo: RETE_4, RETE_11 e ICA_0.966 (y cualquier RETE*) → withholding.
--   3. Disparador: una fila con plantilla toma la clase de su plantilla
--      (setup_organization_defaults e initialize_organization_taxes siembran
--      bien sin reescribirse).
--   4. Reclasifica las filas de la organización que vienen de una plantilla de
--      retención, SALVO las que estén en uso como impuesto (relacionadas a un
--      producto o por defecto): esas se quedan como impuesto y se reportan.
--   5. Una retención no puede ser la tarifa por defecto (CHECK).
--   6. product_tax_relations: el impuesto debe ser de la organización del
--      producto y de clase 'tax' (disparador). Error 'impuesto_invalido', el
--      mismo que ya traduce el formulario de producto.
--   7. fn_importar_productos_lote: solo relaciona impuestos de clase 'tax'.
--   8. manage_organization_tax: nueva firma con p_kind (la de 9 argumentos se
--      sustituye: con las dos, PostgREST no sabría cuál elegir). Sin p_kind
--      conserva la clase actual; con plantilla manda la de la plantilla. Una
--      retención no es por defecto ni «incluida en el precio», y un impuesto
--      relacionado a productos no pasa a retención.
--   9. fn_impuesto_fijar_por_defecto rechaza una retención.
--  10. fn_codigo_impuesto_linea filtra por clase en vez de por el prefijo RETE.
--  11. get_tax_templates_by_organization_country devuelve la clase (cambia el
--      tipo de retorno: se recrea) y fija search_path.

-- ── 1. Columna de clase ─────────────────────────────────────────────────────
alter table public.tax_templates
  add column if not exists kind text not null default 'tax';
alter table public.organization_taxes
  add column if not exists kind text not null default 'tax';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'tax_templates_kind_check') then
    alter table public.tax_templates
      add constraint tax_templates_kind_check check (kind in ('tax', 'withholding'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'organization_taxes_kind_check') then
    alter table public.organization_taxes
      add constraint organization_taxes_kind_check check (kind in ('tax', 'withholding'));
  end if;
end;
$$;

comment on column public.tax_templates.kind is
  'Clase: tax = impuesto que se cobra en la venta o la compra (IVA, INC); withholding = retención que practica el comprador (ReteFuente, ReteIVA, ReteICA). Una retención nunca se suma al precio.';
comment on column public.organization_taxes.kind is
  'Clase: tax (impuesto de venta y compra) o withholding (retención). Con plantilla la copia de tax_templates.kind (disparador trg_organization_taxes_clase); sin plantilla la fija manage_organization_tax.';

-- ── 2. Catálogo ─────────────────────────────────────────────────────────────
update public.tax_templates
   set kind = 'withholding', updated_at = now()
 where kind <> 'withholding'
   and (code in ('RETE_4', 'RETE_11', 'ICA_0.966') or upper(code) like 'RETE%');

-- ── 3. La fila con plantilla toma la clase de su plantilla ─────────────────
create or replace function public.fn_organization_taxes_clase_de_plantilla()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_kind text;
begin
  if new.template_id is not null then
    select t.kind into v_kind from public.tax_templates t where t.id = new.template_id;
    if v_kind is not null then
      new.kind := v_kind;
    end if;
  end if;
  new.kind := coalesce(new.kind, 'tax');
  return new;
end;
$function$;

revoke all on function public.fn_organization_taxes_clase_de_plantilla() from public, anon, authenticated;

drop trigger if exists trg_organization_taxes_clase on public.organization_taxes;
create trigger trg_organization_taxes_clase
  before insert or update of template_id, kind on public.organization_taxes
  for each row execute function public.fn_organization_taxes_clase_de_plantilla();

-- ── 4. Reclasificar (sin borrar; se conserva lo que esté en uso) ───────────
-- updated_at se toca para que la réplica sin conexión (incremental por
-- updated_at) traiga la clase nueva.
update public.organization_taxes ot
   set kind = 'withholding', updated_at = now()
  from public.tax_templates tt
 where tt.id = ot.template_id
   and tt.kind = 'withholding'
   and ot.kind <> 'withholding'
   and not coalesce(ot.is_default, false)
   and not exists (select 1 from public.product_tax_relations r where r.tax_id = ot.id);

-- ── 5. Una retención no es la tarifa por defecto ────────────────────────────
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'organization_taxes_retencion_no_por_defecto') then
    alter table public.organization_taxes
      add constraint organization_taxes_retencion_no_por_defecto
      check (kind = 'tax' or not coalesce(is_default, false));
  end if;
end;
$$;

-- ── 6. Relación producto ↔ impuesto: misma organización y clase 'tax' ──────
create or replace function public.fn_product_tax_relations_validar()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_kind     text;
  v_org_imp  integer;
  v_org_prod integer;
begin
  select ot.kind, ot.organization_id into v_kind, v_org_imp
    from public.organization_taxes ot where ot.id = new.tax_id;
  select p.organization_id into v_org_prod
    from public.products p where p.id = new.product_id;

  if v_org_imp is null or v_org_prod is null or v_org_imp <> v_org_prod then
    raise exception 'impuesto_invalido' using errcode = '22023',
      detail = 'impuesto_de_otra_organizacion';
  end if;
  if v_kind = 'withholding' then
    raise exception 'impuesto_invalido' using errcode = '22023',
      detail = 'retencion_no_aplica_a_producto',
      hint = 'Las retenciones no se asignan a productos: las practica el comprador y no se suman al precio.';
  end if;
  return new;
end;
$function$;

revoke all on function public.fn_product_tax_relations_validar() from public, anon, authenticated;

drop trigger if exists trg_product_tax_relations_validar on public.product_tax_relations;
create trigger trg_product_tax_relations_validar
  before insert or update of tax_id, product_id on public.product_tax_relations
  for each row execute function public.fn_product_tax_relations_validar();

-- ── 7. Importar productos: solo impuestos de clase 'tax' ───────────────────
-- Se agrega UNA línea («and t.kind = 'tax'») al bloque «Impuesto (por nombre
-- o por tasa)» sobre el cuerpo vivo, que es el de
-- 20260924150000_importar_productos_lote.sql (md5 del prosrc verificado contra
-- la base antes de aplicar: f32d00ff792b63a956831020ac9c3a8f; después:
-- 94ee38a6d8b7e66fdf6327529ac790d0). Se parchea en la base en vez de copiar
-- las 470 líneas para que no pueda cambiar nada más; es idempotente (si la
-- línea ya está, no hace nada) y falla si el cuerpo no es el esperado.
do $parche$
declare
  v_def   text;
  v_linea constant text := E'             and coalesce(t.is_active, true)\n';
  v_nueva constant text := E'             and coalesce(t.is_active, true)\n             and t.kind = ''tax''\n';
begin
  v_def := pg_get_functiondef('public.fn_importar_productos_lote(integer, integer, text, jsonb, jsonb)'::regprocedure);
  if position(v_nueva in v_def) > 0 then
    return;
  end if;
  if (length(v_def) - length(replace(v_def, v_linea, ''))) / length(v_linea) <> 1 then
    raise exception 'fn_importar_productos_lote no tiene el cuerpo esperado: revisar antes de aplicar';
  end if;
  execute replace(v_def, v_linea, v_nueva);
end;
$parche$;

revoke all on function public.fn_importar_productos_lote(integer, integer, text, jsonb, jsonb) from public, anon;
grant execute on function public.fn_importar_productos_lote(integer, integer, text, jsonb, jsonb) to authenticated, service_role;

-- ── 8. Crear / editar con clase ────────────────────────────────────────────
drop function if exists public.manage_organization_tax(integer, text, numeric, text, boolean, boolean, integer, text, boolean);

create or replace function public.manage_organization_tax(
  p_organization_id integer, p_name text, p_rate numeric,
  p_description text default null, p_is_default boolean default false, p_is_active boolean default true,
  p_template_id integer default null, p_id text default null, p_tax_included boolean default false,
  p_kind text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_tax_id      uuid;
  v_id          uuid;
  v_now         timestamptz := now();
  v_kind_actual text;
  v_kind        text;
  v_incluido    boolean;
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
  if p_kind is not null and p_kind not in ('tax', 'withholding') then
    return jsonb_build_object('success', false, 'message', 'Clase de impuesto inválida', 'code', 'INVALID_KIND');
  end if;
  if p_template_id is not null and not exists (select 1 from public.tax_templates where id = p_template_id) then
    return jsonb_build_object('success', false, 'message', 'La plantilla de impuesto no existe', 'code', 'TEMPLATE_NOT_FOUND');
  end if;

  if v_id is not null then
    select kind into v_kind_actual from public.organization_taxes
     where id = v_id and organization_id = p_organization_id for update;
    if not found then
      return jsonb_build_object('success', false, 'message', 'El impuesto no existe o no pertenece a esta organización', 'code', 'TAX_NOT_FOUND');
    end if;
  end if;

  -- Clase: la de la plantilla si hay; si no, la pedida; si no, la actual.
  v_kind := coalesce(p_kind, v_kind_actual, 'tax');
  if p_template_id is not null then
    select kind into v_kind from public.tax_templates where id = p_template_id;
  end if;

  if v_kind = 'withholding' and coalesce(p_is_default, false) then
    return jsonb_build_object('success', false, 'code', 'WITHHOLDING_NOT_DEFAULT',
      'message', 'Una retención no puede ser la tarifa por defecto: no se cobra en la venta.');
  end if;
  if v_kind = 'withholding' and v_id is not null
     and exists (select 1 from public.product_tax_relations r where r.tax_id = v_id) then
    return jsonb_build_object('success', false, 'code', 'TAX_IN_USE_BY_PRODUCTS',
      'message', 'Este impuesto está asignado a productos: no puede pasar a ser una retención.');
  end if;
  -- Una retención no se suma ni se incluye en el precio.
  v_incluido := case when v_kind = 'withholding' then false else coalesce(p_tax_included, false) end;

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
           tax_included = v_incluido, kind = v_kind, updated_at = v_now
     where id = v_id and organization_id = p_organization_id
    returning id into v_tax_id;
  else
    insert into public.organization_taxes (
      organization_id, name, rate, description, is_default, is_active, template_id, tax_included, kind, created_at, updated_at)
    values (
      p_organization_id, p_name, p_rate, p_description, p_is_default, p_is_active, p_template_id,
      v_incluido, v_kind, v_now, v_now)
    returning id into v_tax_id;
  end if;

  return jsonb_build_object('success', true, 'id', v_tax_id::text, 'kind', v_kind,
    'message', case
      when v_id is not null and v_kind = 'withholding' then 'Retención actualizada correctamente'
      when v_kind = 'withholding' then 'Retención creada correctamente'
      when v_id is not null then 'Impuesto actualizado correctamente'
      else 'Impuesto creado correctamente' end);
end;
$function$;

revoke all on function public.manage_organization_tax(integer, text, numeric, text, boolean, boolean, integer, text, boolean, text) from public, anon;
grant execute on function public.manage_organization_tax(integer, text, numeric, text, boolean, boolean, integer, text, boolean, text) to authenticated, service_role;

-- ── 9. Una retención no se fija como tarifa por defecto ────────────────────
create or replace function public.fn_impuesto_fijar_por_defecto(p_organization_id integer, p_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_kind text;
begin
  perform public.fn_impuestos_exigir_gestion(p_organization_id);
  if p_id is not null then
    select kind into v_kind from public.organization_taxes
     where id = p_id and organization_id = p_organization_id;
    if not found then
      raise exception 'impuesto_no_encontrado' using errcode = 'P0002',
        hint = 'El impuesto no pertenece a esta organización';
    end if;
    if v_kind = 'withholding' then
      raise exception 'retencion_no_predeterminada' using errcode = '22023',
        hint = 'Una retención no puede ser la tarifa por defecto: no se cobra en la venta.';
    end if;
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

-- ── 10. Código DIAN de la línea: por clase, no por prefijo ─────────────────
create or replace function public.fn_codigo_impuesto_linea(p_organization_id integer, p_product_id integer, p_tax_rate numeric)
returns text
language plpgsql
stable security definer
set search_path to 'public', 'pg_temp'
as $function$
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
      and ot.kind = 'tax'
      and tt.kind = 'tax'
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
    and tt.kind = 'tax'
    and (tt.valid_to is null or tt.valid_to > now())
  order by tt.id
  limit 1;

  return v_code;
end;
$function$;

-- ── 11. Plantillas del país con su clase ───────────────────────────────────
drop function if exists public.get_tax_templates_by_organization_country(integer);

create function public.get_tax_templates_by_organization_country(org_id integer)
returns table(id integer, country character varying, code text, name character varying, rate numeric,
              description text, valid_from timestamp with time zone, valid_to timestamp with time zone,
              created_at timestamp with time zone, updated_at timestamp with time zone, kind text)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  org_country_code varchar(3);
begin
  perform public.fn_assert_acceso_org(org_id::integer);
  select o.country_code into org_country_code
    from public.organizations o
   where o.id = org_id
   limit 1;

  if org_country_code is null then
    return;
  end if;

  return query
  select tt.id, tt.country, tt.code, tt.name, tt.rate, tt.description,
         tt.valid_from, tt.valid_to, tt.created_at, tt.updated_at, tt.kind
    from public.tax_templates tt
   where tt.country = org_country_code
   order by tt.name;
end;
$function$;

revoke all on function public.get_tax_templates_by_organization_country(integer) from public, anon;
grant execute on function public.get_tax_templates_by_organization_country(integer) to authenticated, service_role;
