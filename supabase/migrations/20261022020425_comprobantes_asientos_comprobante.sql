create or replace function public.fn_vista_previa_asiento_documento(
  p_tipo text,
  p_id uuid,
  p_lineas jsonb default null
) returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_org integer;
  v_armado jsonb;
begin
  if auth.uid() is null then
    raise exception 'SESION_REQUERIDA' using errcode = '42501';
  end if;
  if p_tipo = 'compra' then
    select organization_id into v_org from public.invoice_purchase where id = p_id;
  elsif p_tipo = 'documento_soporte' then
    select organization_id into v_org from public.support_documents where id = p_id;
  else
    select organization_id into v_org from public.invoice_sales where id = p_id;
  end if;
  if v_org is null then
    return jsonb_build_object('ok', false, 'fallo', 'Documento no encontrado', 'lineas', '[]'::jsonb);
  end if;
  perform public.fn_assert_acceso_org(v_org);
  perform public.fn_finanzas_exigir_permiso(v_org, array['finance.view', 'finance.create']);
  v_armado := public.fn_armar_asiento_documento(p_tipo, p_id, p_lineas);
  return v_armado;
end;
$fn$;

create or replace function public.fn_cuentas_catalogo_guardar(
  p_organization_id integer,
  p_tipo text,
  p_id integer,
  p_ingreso text,
  p_costo text,
  p_inventario text,
  p_devolucion text
) returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_fallo text;
  v_cuenta text;
begin
  if auth.uid() is null then
    raise exception 'SESION_REQUERIDA' using errcode = '42501';
  end if;
  perform public.fn_assert_acceso_org(p_organization_id);
  if not (
    public.fn_tiene_permiso(p_organization_id, 'finance.create')
    or public.fn_tiene_permiso(p_organization_id, 'inventory.edit')
    or public.fn_tiene_permiso(p_organization_id, 'inventory.create')
    or public.fn_tiene_permiso(p_organization_id, 'product_management')
    or public.fn_tiene_permiso(p_organization_id, 'inventory_management')
  ) then
    raise exception 'SIN_PERMISO: guardar las cuentas del catálogo' using errcode = '42501';
  end if;
  if p_tipo not in ('producto', 'categoria') then
    raise exception 'TIPO_INVALIDO' using errcode = '22023';
  end if;

  foreach v_cuenta in array array[p_ingreso, p_costo, p_inventario, p_devolucion] loop
    if nullif(btrim(v_cuenta), '') is null then
      continue;
    end if;
    v_fallo := public.fn_validar_cuenta_movimiento(p_organization_id, v_cuenta);
    if v_fallo is not null then
      raise exception '%', v_fallo using errcode = '22023';
    end if;
  end loop;

  if p_tipo = 'producto' then
    update public.products
       set cuenta_ingreso = nullif(btrim(p_ingreso), ''),
           cuenta_costo = nullif(btrim(p_costo), ''),
           cuenta_inventario = nullif(btrim(p_inventario), ''),
           cuenta_devolucion = nullif(btrim(p_devolucion), ''),
           updated_at = now()
     where id = p_id and organization_id = p_organization_id;
  else
    update public.categories
       set cuenta_ingreso = nullif(btrim(p_ingreso), ''),
           cuenta_costo = nullif(btrim(p_costo), ''),
           cuenta_inventario = nullif(btrim(p_inventario), ''),
           cuenta_devolucion = nullif(btrim(p_devolucion), ''),
           updated_at = now()
     where id = p_id and organization_id = p_organization_id;
  end if;
  if not found then
    raise exception 'NO_ENCONTRADO' using errcode = 'P0002';
  end if;
end;
$fn$;

create or replace function public.fn_validar_cuentas_catalogo()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_cuenta text;
  v_fallo text;
begin
  new.cuenta_ingreso := nullif(btrim(new.cuenta_ingreso), '');
  new.cuenta_costo := nullif(btrim(new.cuenta_costo), '');
  new.cuenta_inventario := nullif(btrim(new.cuenta_inventario), '');
  new.cuenta_devolucion := nullif(btrim(new.cuenta_devolucion), '');
  foreach v_cuenta in array array[new.cuenta_ingreso, new.cuenta_costo, new.cuenta_inventario, new.cuenta_devolucion] loop
    if v_cuenta is null then
      continue;
    end if;
    v_fallo := public.fn_validar_cuenta_movimiento(new.organization_id, v_cuenta);
    if v_fallo is not null then
      raise exception '%', v_fallo using errcode = '22023';
    end if;
  end loop;
  return new;
end;
$fn$;

drop trigger if exists trg_products_cuentas_catalogo on public.products;
create trigger trg_products_cuentas_catalogo
  before insert or update of cuenta_ingreso, cuenta_costo, cuenta_inventario, cuenta_devolucion
  on public.products
  for each row execute function public.fn_validar_cuentas_catalogo();

drop trigger if exists trg_categories_cuentas_catalogo on public.categories;
create trigger trg_categories_cuentas_catalogo
  before insert or update of cuenta_ingreso, cuenta_costo, cuenta_inventario, cuenta_devolucion
  on public.categories
  for each row execute function public.fn_validar_cuentas_catalogo();

create or replace function public.fn_validar_cuenta_linea_documento()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_org integer;
  v_fallo text;
begin
  new.cuenta_contable := nullif(btrim(new.cuenta_contable), '');
  if new.cuenta_contable is null then
    return new;
  end if;
  if new.invoice_sales_id is not null then
    select organization_id into v_org from public.invoice_sales where id = new.invoice_sales_id;
  elsif new.invoice_purchase_id is not null then
    select organization_id into v_org from public.invoice_purchase where id = new.invoice_purchase_id;
  elsif new.support_document_id is not null then
    select organization_id into v_org from public.support_documents where id = new.support_document_id;
  end if;
  if v_org is null then
    return new;
  end if;
  v_fallo := public.fn_validar_cuenta_movimiento(v_org, new.cuenta_contable);
  if v_fallo is not null then
    raise exception '%', v_fallo using errcode = '22023';
  end if;
  return new;
end;
$fn$;

drop trigger if exists trg_invoice_items_cuenta_contable on public.invoice_items;
create trigger trg_invoice_items_cuenta_contable
  before insert or update of cuenta_contable
  on public.invoice_items
  for each row execute function public.fn_validar_cuenta_linea_documento();

create or replace function public.fn_tomar_consecutivo_comprobante(
  p_organization_id integer,
  p_tipo text,
  p_prefijo text,
  out numero integer,
  out prefijo text
) returns record
language plpgsql
set search_path to 'public', 'pg_temp'
as $fn$
begin
  insert into public.comprobante_consecutivos (organization_id, tipo, prefijo, siguiente)
  values (p_organization_id, p_tipo, coalesce(p_prefijo, ''), 2)
  on conflict (organization_id, tipo) do update
    set siguiente = public.comprobante_consecutivos.siguiente + 1
  returning public.comprobante_consecutivos.prefijo, public.comprobante_consecutivos.siguiente - 1
    into prefijo, numero;
end;
$fn$;

create or replace function public.fn_trg_comprobante_al_insertar()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_tipo text;
  v_prefijo text;
  v_mov text;
  v_num integer;
  v_pref text;
begin
  if new.comprobante_numero is not null or coalesce(new.posted, false) is not true then
    return new;
  end if;

  if new.source in ('invoice_sales', 'invoice_purchase', 'credit_note', 'support_documents') then
    v_tipo := 'factura';
    v_prefijo := 'FV';
  elsif new.source = 'manual' then
    v_tipo := 'nota_contable';
    v_prefijo := 'NA';
  elsif new.source = 'cash_movements' and new.source_id is not null then
    select cm.type into v_mov
      from public.cash_movements cm
     where cm.id::text = new.source_id
       and cm.organization_id = new.organization_id;
    if v_mov = 'in' then
      v_tipo := 'recibo_caja';
      v_prefijo := 'RC';
    elsif v_mov = 'out' then
      v_tipo := 'comprobante_egreso';
      v_prefijo := 'CE';
    end if;
  end if;

  if v_tipo is null then
    return new;
  end if;

  select c.numero, c.prefijo into v_num, v_pref
    from public.fn_tomar_consecutivo_comprobante(new.organization_id, v_tipo, v_prefijo) c;
  new.comprobante_tipo := v_tipo;
  new.comprobante_prefijo := v_pref;
  new.comprobante_numero := v_num;
  return new;
end;
$fn$;

drop trigger if exists trg_comprobante_al_insertar on public.journal_entries;
create trigger trg_comprobante_al_insertar
  before insert on public.journal_entries
  for each row execute function public.fn_trg_comprobante_al_insertar();

create or replace function public.fn_trg_tercero_linea_asiento()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_source text;
  v_source_id text;
  v_org integer;
  v_nit text;
  v_nombre text;
begin
  if new.tercero_nit is not null then
    return new;
  end if;
  select e.source, e.source_id, e.organization_id
    into v_source, v_source_id, v_org
    from public.journal_entries e
   where e.id = new.journal_entry_id;
  if v_source is null or v_source not in ('invoice_sales', 'invoice_purchase', 'credit_note', 'cash_movements', 'support_documents') then
    return new;
  end if;

  if v_source = 'cash_movements' then
    select nullif(btrim(cm.tercero_nit), ''), nullif(btrim(cm.tercero_nombre), '')
      into v_nit, v_nombre
      from public.cash_movements cm
     where cm.id::text = v_source_id and cm.organization_id = v_org;
  elsif v_source = 'invoice_purchase' then
    select t.nit, t.nombre into v_nit, v_nombre
      from public.fn_tercero_de_documento('compra', v_source_id::uuid) t;
  elsif v_source = 'support_documents' then
    select t.nit, t.nombre into v_nit, v_nombre
      from public.fn_tercero_de_documento('documento_soporte', v_source_id::uuid) t;
  else
    select t.nit, t.nombre into v_nit, v_nombre
      from public.fn_tercero_de_documento('venta', v_source_id::uuid) t;
  end if;

  if v_nit is not null then
    new.tercero_nit := v_nit;
    new.tercero_nombre := coalesce(new.tercero_nombre, v_nombre);
  end if;
  return new;
exception when others then
  return new;
end;
$fn$;

drop trigger if exists trg_tercero_linea_asiento on public.journal_lines;
create trigger trg_tercero_linea_asiento
  before insert on public.journal_lines
  for each row execute function public.fn_trg_tercero_linea_asiento();

create or replace function public.fn_exigir_cuenta_movimiento(
  p_organization_id integer,
  p_cuenta text
) returns void
language plpgsql
stable
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_cuenta text := nullif(btrim(p_cuenta), '');
begin
  if public.fn_validar_cuenta_movimiento(p_organization_id, p_cuenta) is null then
    return;
  end if;
  if v_cuenta is null or not exists (
    select 1 from public.chart_of_accounts a
     where a.organization_id = p_organization_id and a.account_code = v_cuenta
  ) or exists (
    select 1 from public.chart_of_accounts a
     where a.organization_id = p_organization_id
       and a.account_code = v_cuenta
       and a.is_active is false
  ) then
    raise exception 'CUENTA_INEXISTENTE: %', coalesce(v_cuenta, '(sin cuenta)') using errcode = '22023';
  end if;
  raise exception 'CUENTA_DE_TITULO: % no es una cuenta de movimiento', v_cuenta using errcode = '22023';
end;
$fn$;

revoke all on function public.fn_vista_previa_asiento_documento(text, uuid, jsonb) from public, anon;
grant execute on function public.fn_vista_previa_asiento_documento(text, uuid, jsonb) to authenticated, service_role;
revoke all on function public.fn_cuentas_catalogo_guardar(integer, text, integer, text, text, text, text) from public, anon;
grant execute on function public.fn_cuentas_catalogo_guardar(integer, text, integer, text, text, text, text) to authenticated, service_role;
revoke all on function public.fn_validar_cuentas_catalogo() from public, anon;
grant execute on function public.fn_validar_cuentas_catalogo() to authenticated, service_role;
revoke all on function public.fn_validar_cuenta_linea_documento() from public, anon;
grant execute on function public.fn_validar_cuenta_linea_documento() to authenticated, service_role;
revoke all on function public.fn_tomar_consecutivo_comprobante(integer, text, text) from public, anon, authenticated;
revoke all on function public.fn_trg_comprobante_al_insertar() from public, anon, authenticated;
revoke all on function public.fn_trg_tercero_linea_asiento() from public, anon, authenticated;
revoke all on function public.fn_exigir_cuenta_movimiento(integer, text) from public, anon, authenticated;
