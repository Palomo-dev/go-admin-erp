-- Rollback de 20261027210000_impuestos_mapeo_y_tesoreria.sql (usa public.bitacora_impuestos_20261027).
-- No toca asientos ni saldos. Las cuentas creadas solo se borran si no tienen movimientos (trg_puc_no_borrar_con_movimientos).
begin;
-- 1. Siembra y trigger de categorías como estaban.
do $do$
declare v_def text := pg_get_functiondef('public.fn_sembrar_categorias_tesoreria'::regproc);
begin
  v_def := replace(v_def, E'  perform public.fn_tesoreria_sembrar_impuestos(p_org);\n', '');
  execute v_def;
end;
$do$;
-- (fn_categorias_tesoreria_guardar: restaurar la versión de 20261022004418_categorias_tesoreria.sql, que no exige cuenta.)
create or replace function public.fn_categorias_tesoreria_guardar()
 returns trigger language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
declare v_org integer; v_tipo text; v_siguiente bigint; v_visto integer := 0;
begin
  if tg_op = 'DELETE' then
    if old.es_predefinida then raise exception 'categoria_invalida' using errcode = '22023'; end if;
    return old;
  end if;
  new.nombre := btrim(new.nombre);
  new.icono := coalesce(nullif(btrim(new.icono), ''), 'circle');
  new.cuenta_sugerida := nullif(btrim(new.cuenta_sugerida), '');
  new.clave := nullif(btrim(new.clave), '');
  if new.nombre is null or new.nombre = '' or new.tipo not in ('ingreso', 'egreso') then
    raise exception 'categoria_invalida' using errcode = '22023';
  end if;
  if tg_op = 'INSERT' and new.es_predefinida and current_setting('app.sembrar_categorias', true) is distinct from '1' then
    new.es_predefinida := false; new.clave := null;
  end if;
  if tg_op = 'UPDATE' and old.es_predefinida then
    new.tipo := old.tipo; new.clave := old.clave; new.es_predefinida := true; new.organization_id := old.organization_id;
  end if;
  if not new.es_predefinida then new.clave := null; end if;
  if tg_op = 'UPDATE' and new.tipo is distinct from old.tipo then
    if exists (select 1 from public.categorias_tesoreria where padre_id = new.id) then
      raise exception 'categoria_invalida' using errcode = '22023';
    end if;
  end if;
  if new.padre_id is not null then
    if new.padre_id = new.id then raise exception 'categoria_invalida' using errcode = '22023'; end if;
    select organization_id, tipo, padre_id into v_org, v_tipo, v_siguiente from public.categorias_tesoreria where id = new.padre_id;
    if not found or v_org is distinct from new.organization_id or v_tipo is distinct from new.tipo then
      raise exception 'categoria_invalida' using errcode = '22023';
    end if;
    while v_siguiente is not null and v_visto < 20 loop
      if v_siguiente = new.id then raise exception 'categoria_invalida' using errcode = '22023'; end if;
      select padre_id into v_siguiente from public.categorias_tesoreria where id = v_siguiente;
      v_visto := v_visto + 1;
    end loop;
  end if;
  if new.cuenta_sugerida is not null and not exists (
    select 1 from public.chart_of_accounts c where c.organization_id = new.organization_id
       and c.account_code = new.cuenta_sugerida and c.is_active is distinct from false and c.es_movimiento is distinct from false
  ) then raise exception 'cuenta_no_es_de_movimiento' using errcode = '22023'; end if;
  new.updated_at := now();
  return new;
end;
$function$;

-- 2. Tesorería: subcategorías (los movimientos que ya las usen impiden borrarlas: se desactivan en ese caso).
update public.categorias_tesoreria c set cuenta_sugerida = null
  from public.bitacora_impuestos_20261027 b
 where b.objeto = 'categoria_cuenta' and c.organization_id = b.organization_id and c.clave = 'impuestos';
set local app.sembrar_categorias = '1';
alter table public.categorias_tesoreria disable trigger trg_categorias_tesoreria_guardar;
delete from public.categorias_tesoreria c using public.bitacora_impuestos_20261027 b
 where b.objeto = 'subcategoria_nueva' and c.organization_id = b.organization_id and c.clave = b.clave;
alter table public.categorias_tesoreria enable trigger trg_categorias_tesoreria_guardar;

-- 3. Mapeo.
delete from public.tax_account_mapping m using public.bitacora_impuestos_20261027 b
 where b.objeto = 'mapeo_nuevo' and m.id::text = b.clave;
insert into public.tax_account_mapping
select (json_populate_record(null::public.tax_account_mapping, b.valor_anterior::json)).*
  from public.bitacora_impuestos_20261027 b where b.objeto = 'mapeo_borrado'
on conflict (id) do nothing;
alter table public.tax_account_mapping disable trigger trg_tax_account_mapping_validar;
update public.tax_account_mapping m set account_code = b.valor_anterior, updated_at = now()
  from public.bitacora_impuestos_20261027 b where b.objeto = 'mapeo_repunte' and m.id::text = b.clave;
alter table public.tax_account_mapping enable trigger trg_tax_account_mapping_validar;
delete from public.tax_templates t using public.bitacora_impuestos_20261027 b
 where b.objeto = 'plantilla_nueva' and t.code = b.clave
   and not exists (select 1 from public.tax_account_mapping x where x.tax_template_id = t.id);

-- 4. Cuentas creadas (de la más profunda a la más alta; falla si alguna ya tiene movimientos, a propósito).
delete from public.chart_of_accounts a using public.bitacora_impuestos_20261027 b
 where b.objeto = 'cuenta_nueva' and a.organization_id = b.organization_id and a.account_code = b.clave
   and not exists (select 1 from public.chart_of_accounts h where h.organization_id = a.organization_id and h.parent_code = a.account_code);
-- Los niveles intermedios (236525, 240405, …) que creó fn_puc_asegurar_cuenta y quedaron sin hijos:
delete from public.chart_of_accounts a
 where a.account_code in ('236515','236520','236525','236705','236805','240405','241205','249505')
   and a.created_at >= (select min(creado) from public.bitacora_impuestos_20261027)
   and not exists (select 1 from public.chart_of_accounts h where h.organization_id = a.organization_id and h.parent_code = a.account_code);

drop function if exists public.fn_tesoreria_sembrar_impuestos(integer);
delete from supabase_migrations.schema_migrations where version = '20261027210000';
-- La bitácora se conserva: drop table public.bitacora_impuestos_20261027; cuando ya no se necesite.
commit;
