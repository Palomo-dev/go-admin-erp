-- Impuestos de la organización · escritura solo por RPC con permiso de finanzas, en una transacción (2026-09-28).
--
-- Hallazgos verificados por MCP:
--   - El interruptor «Activo» (TaxesTable.tsx) hacía UPDATE directo a
--     organization_taxes por id, sin filtro de organización ni RPC; solo lo
--     frenaba la política organization_taxes_miembros (ALL para cualquier
--     miembro). anon y authenticated tenían INSERT/UPDATE/DELETE en la tabla.
--   - manage_organization_tax (las dos firmas) y delete_organization_tax solo
--     exigían ser miembro: un cajero podía crear, cambiar tarifas o borrar
--     impuestos. Sin search_path fijo.
--   - setOrganizationDefaultTax hacía dos UPDATE desde el cliente (desmarcar y
--     marcar), no atómicos; y manage_organization_tax marcaba el nuevo por
--     defecto ANTES de desmarcar los demás. Nada impedía dos «por defecto».
--   - Duplicados medidos: 0 organizaciones con más de un impuesto por defecto
--     (1 impuesto por defecto en toda la base).
--
-- Qué hace:
--   1. Índice único parcial: un solo impuesto por defecto por organización.
--   2. fn_impuestos_exigir_gestion: admin (roles 1/2) o permiso finance.create /
--      finance.approve (fn_finanzas_exigir_permiso).
--   3. manage_organization_tax: misma firma y mismo contrato JSON, con la guarda,
--      tarifa 0–100, y desmarca los demás ANTES de marcar el nuevo (una
--      transacción). La firma vieja de 8 argumentos delega en la de 9 y conserva
--      el tax_included actual.
--   4. delete_organization_tax con la misma guarda.
--   5. fn_impuesto_cambiar_activo y fn_impuesto_fijar_por_defecto (RPC nuevas).
--   6. authenticated queda con SELECT; anon sin nada.

-- ── 1. Un solo por defecto ──────────────────────────────────────────────────
create unique index if not exists uq_organization_taxes_un_por_defecto
  on public.organization_taxes (organization_id)
  where is_default;

-- ── 2. Guarda ───────────────────────────────────────────────────────────────
create or replace function public.fn_impuestos_exigir_gestion(p_org integer)
returns void
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  -- fn_finanzas_exigir_permiso: fn_assert_acceso_org rechaza anon y a quien no
  -- es miembro; admin (1/2) pasa; el resto necesita uno de los permisos.
  perform public.fn_finanzas_exigir_permiso(p_org, array['finance.create', 'finance.approve']);
end;
$function$;

revoke all on function public.fn_impuestos_exigir_gestion(integer) from public, anon, authenticated;

-- ── 3. Crear / editar ───────────────────────────────────────────────────────
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

-- Firma antigua (sin p_tax_included): delega y conserva el valor actual.
create or replace function public.manage_organization_tax(
  p_organization_id integer, p_name text, p_rate numeric, p_description text,
  p_is_default boolean, p_is_active boolean, p_template_id integer, p_id text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_incluido boolean := false;
begin
  if p_id is not null and p_id ~* '^[0-9a-f-]{36}$' then
    select coalesce(tax_included, false) into v_incluido
      from public.organization_taxes where id = p_id::uuid and organization_id = p_organization_id;
  end if;
  return public.manage_organization_tax(p_organization_id, p_name, p_rate, p_description,
    p_is_default, p_is_active, p_template_id, p_id, coalesce(v_incluido, false));
end;
$function$;

revoke all on function public.manage_organization_tax(integer, text, numeric, text, boolean, boolean, integer, text, boolean) from public, anon;
revoke all on function public.manage_organization_tax(integer, text, numeric, text, boolean, boolean, integer, text) from public, anon;
grant execute on function public.manage_organization_tax(integer, text, numeric, text, boolean, boolean, integer, text, boolean) to authenticated, service_role;
grant execute on function public.manage_organization_tax(integer, text, numeric, text, boolean, boolean, integer, text) to authenticated, service_role;

-- ── 4. Eliminar ─────────────────────────────────────────────────────────────
create or replace function public.delete_organization_tax(p_tax_id text, p_organization_id integer)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_id      uuid;
  v_default boolean;
  v_uso     integer;
begin
  begin
    v_id := p_tax_id::uuid;
  exception when others then
    return jsonb_build_object('success', false, 'message', 'ID de impuesto inválido', 'code', 'INVALID_ID');
  end;

  begin
    perform public.fn_impuestos_exigir_gestion(p_organization_id);
  exception when insufficient_privilege then
    return jsonb_build_object('success', false, 'code', 'PERMISSION_DENIED',
      'message', 'No tiene permisos para eliminar impuestos en esta organización');
  end;

  select is_default into v_default from public.organization_taxes
   where id = v_id and organization_id = p_organization_id for update;
  if not found then
    return jsonb_build_object('success', false, 'message', 'El impuesto no existe o no pertenece a esta organización', 'code', 'TAX_NOT_FOUND');
  end if;
  if v_default then
    return jsonb_build_object('success', false, 'code', 'DEFAULT_TAX_DELETION',
      'message', 'No se puede eliminar el impuesto predeterminado. Primero establezca otro impuesto como predeterminado.');
  end if;

  select count(*) into v_uso from public.product_tax_relations where tax_id = v_id;
  if v_uso > 0 then
    return jsonb_build_object('success', false, 'code', 'TAX_IN_USE',
      'message', 'No se puede eliminar el impuesto porque está siendo utilizado por ' || v_uso || ' producto(s).');
  end if;

  delete from public.organization_taxes where id = v_id and organization_id = p_organization_id;
  return jsonb_build_object('success', true, 'message', 'Impuesto eliminado correctamente');
end;
$function$;

revoke all on function public.delete_organization_tax(text, integer) from public, anon;
grant execute on function public.delete_organization_tax(text, integer) to authenticated, service_role;

-- ── 5a. Activar / desactivar ────────────────────────────────────────────────
create or replace function public.fn_impuesto_cambiar_activo(p_organization_id integer, p_id uuid, p_activo boolean)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_row public.organization_taxes%rowtype;
begin
  perform public.fn_impuestos_exigir_gestion(p_organization_id);
  if p_activo is null then
    raise exception 'activo_obligatorio' using errcode = '22023';
  end if;
  update public.organization_taxes
     set is_active = p_activo, updated_at = now()
   where id = p_id and organization_id = p_organization_id
  returning * into v_row;
  if not found then
    raise exception 'impuesto_no_encontrado' using errcode = 'P0002';
  end if;
  return jsonb_build_object('id', v_row.id, 'is_active', v_row.is_active);
end;
$function$;

revoke all on function public.fn_impuesto_cambiar_activo(integer, uuid, boolean) from public, anon;
grant execute on function public.fn_impuesto_cambiar_activo(integer, uuid, boolean) to authenticated, service_role;

-- ── 5b. Tarifa por defecto (una sola, atómica) ──────────────────────────────
create or replace function public.fn_impuesto_fijar_por_defecto(p_organization_id integer, p_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
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

revoke all on function public.fn_impuesto_fijar_por_defecto(integer, uuid) from public, anon;
grant execute on function public.fn_impuesto_fijar_por_defecto(integer, uuid) to authenticated, service_role;

-- ── 6. La API solo lee ──────────────────────────────────────────────────────
revoke all on table public.organization_taxes from anon;
revoke insert, update, delete, truncate, references, trigger on table public.organization_taxes from authenticated;
