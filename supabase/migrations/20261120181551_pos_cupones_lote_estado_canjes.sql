-- POS · Cupones v2 (Figma 1088:714507 y sección 23 458:*): lote en el servidor,
-- estado del código, KPI de canje, historial de canjes, archivo y permiso.
--
-- 1. `archived_at`: «Archivar» reemplaza al borrado físico. El borrado se
--    llevaba por delante el historial (`coupon_redemptions` es ON DELETE
--    CASCADE). Archivado implica `is_active = false`: el POS
--    (`validarCupon`, motivo «inactivo») y la tienda web (`is_active`) ya lo
--    rechazan sin cambiar su validación.
-- 2. `batch_id`: los cupones creados juntos por «Crear lote».
-- 3. Unicidad del código por organización SIN distinguir mayúsculas: el POS y
--    la tienda buscan con `ilike` + `maybeSingle()/single()`; dos códigos que
--    solo difieren en mayúsculas rompían la búsqueda. El código se guarda en
--    mayúsculas (Figma 458:83786).
-- 4. Permiso `pos.cupones.gestionar` (Admin de organización 2 y Manager 5).
--    Lo exige el trigger guarda en INSERT, UPDATE y DELETE hechos con sesión
--    de usuario. Excepción: el UPDATE que solo suma `usage_count` (lo hace
--    `fn_coupon_redemption_increment` al canjear, con la sesión del cajero).
--    Sin sesión (service role de la tienda web, tareas internas) no se exige.
-- 5. Funciones:
--    - `fn_cupon_estado`: estado del código (activo, programado, agotado,
--      vencido, inactivo, archivado). Un único lugar.
--    - `pos_cupones_crear_lote`: genera N códigos PREFIJO-XXXXXX únicos por
--      organización en una sola transacción (SECURITY DEFINER, con permiso).
--    - `pos_cupones_listar`, `pos_cupones_resumen`, `pos_cupon_canjes`:
--      lectura paginada con estado, KPI de canje desde `coupon_redemptions`
--      e historial con la venta (SECURITY INVOKER: la RLS sigue mandando).
--
-- Aditiva: columnas NULL, índice nuevo (0 duplicados verificados), funciones nuevas.

-- ── 1-2. Columnas ───────────────────────────────────────────────────────────
alter table public.coupons add column if not exists archived_at timestamptz null;
alter table public.coupons add column if not exists batch_id uuid null;

comment on column public.coupons.archived_at is
  'Cupón archivado (reemplaza al borrado físico, que borraba su historial de canjes). Implica is_active = false.';
comment on column public.coupons.batch_id is
  'Lote de creación («Crear lote», pos_cupones_crear_lote). NULL = creado uno a uno.';

create index if not exists idx_coupons_org_batch on public.coupons (organization_id, batch_id) where batch_id is not null;
create index if not exists idx_coupon_redemptions_coupon_fecha on public.coupon_redemptions (coupon_id, created_at desc);

-- ── 3. Código único sin distinguir mayúsculas ──────────────────────────────
create unique index if not exists uk_coupons_org_code_ci on public.coupons (organization_id, lower(code));

-- ── 4. Permiso ─────────────────────────────────────────────────────────────
insert into public.permissions (code, name, description, module, category)
select 'pos.cupones.gestionar', 'Gestionar cupones',
       'Crear, editar, crear por lote, activar y archivar cupones', 'pos', 'pos'
where not exists (select 1 from public.permissions where code = 'pos.cupones.gestionar');

insert into public.role_permissions (role_id, permission_id, allowed)
select r.role_id, p.id, true
  from public.permissions p
  cross join (values (2), (5)) as r(role_id)
 where p.code = 'pos.cupones.gestionar'
   and not exists (select 1 from public.role_permissions rp
                    where rp.role_id = r.role_id and rp.permission_id = p.id);

-- ── Guarda de la tabla ─────────────────────────────────────────────────────
create or replace function public.fn_coupons_guarda()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org integer := case when tg_op = 'DELETE' then old.organization_id else new.organization_id end;
begin
  if tg_op = 'UPDATE' and new.organization_id is distinct from old.organization_id then
    raise exception 'La organización de un cupón no cambia' using errcode = '42501';
  end if;

  -- Canje: solo cambia el contador (fn_coupon_redemption_increment). Sin permiso.
  if tg_op = 'UPDATE'
     and (to_jsonb(new) - 'usage_count' - 'updated_at') = (to_jsonb(old) - 'usage_count' - 'updated_at') then
    return new;
  end if;

  if auth.uid() is not null and not public.fn_tiene_permiso(v_org, 'pos.cupones.gestionar') then
    raise exception 'Sin permiso para gestionar cupones' using errcode = '42501';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  if tg_op = 'INSERT' or new.code is distinct from old.code then
    new.code := upper(btrim(new.code));
  end if;
  if new.archived_at is not null then
    new.is_active := false;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_coupons_guarda on public.coupons;
create trigger trg_coupons_guarda
  before insert or update or delete on public.coupons
  for each row execute function public.fn_coupons_guarda();

-- ── 5a. Estado del código ──────────────────────────────────────────────────
create or replace function public.fn_cupon_estado(
  p_is_active boolean,
  p_archived_at timestamptz,
  p_usage_limit integer,
  p_usage_count integer,
  p_start_date timestamptz,
  p_end_date timestamptz
)
returns text
language sql
stable
set search_path = public, pg_temp
as $$
  select case
    when p_archived_at is not null then 'archivado'
    when not coalesce(p_is_active, false) then 'inactivo'
    when p_usage_limit is not null and coalesce(p_usage_count, 0) >= p_usage_limit then 'agotado'
    when p_end_date is not null and p_end_date < now() then 'vencido'
    when p_start_date is not null and p_start_date > now() then 'programado'
    else 'activo'
  end;
$$;

-- Un cupón aplica en la sucursal si no tiene promoción, o su promoción no
-- limita sucursales, o las incluye (misma regla que tenía la pantalla).
create or replace function public.fn_cupon_en_sucursal(p_promotion_branches jsonb, p_tiene_promocion boolean, p_branch_id integer)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select p_branch_id is null
      or not p_tiene_promocion
      or p_promotion_branches is null
      or p_promotion_branches = '[]'::jsonb
      or p_promotion_branches @> to_jsonb(p_branch_id);
$$;

create or replace function public.fn_cupones_assert_miembro(p_organization_id integer)
returns void
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or not exists (
       select 1 from public.organization_members om
        where om.user_id = auth.uid() and om.organization_id = p_organization_id and om.is_active
     ) then
    raise exception 'Sin acceso a la organización' using errcode = '42501';
  end if;
end;
$$;

-- ── 5b. Crear lote ─────────────────────────────────────────────────────────
-- p_datos: discount_type, discount_value, max_discount_amount, min_purchase_amount,
-- usage_limit, usage_limit_per_customer, start_date, end_date (instantes ya
-- convertidos desde los días de la organización), promotion_id, name.
create or replace function public.pos_cupones_crear_lote(
  p_organization_id integer,
  p_prefijo text,
  p_cantidad integer,
  p_datos jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_prefijo text := upper(btrim(coalesce(p_prefijo, '')));
  v_tipo text := p_datos->>'discount_type';
  v_valor numeric := nullif(p_datos->>'discount_value', '')::numeric;
  v_tope numeric := nullif(p_datos->>'max_discount_amount', '')::numeric;
  v_minimo numeric := nullif(p_datos->>'min_purchase_amount', '')::numeric;
  v_usos integer := nullif(p_datos->>'usage_limit', '')::integer;
  v_usos_cliente integer := nullif(p_datos->>'usage_limit_per_customer', '')::integer;
  v_inicio timestamptz := nullif(p_datos->>'start_date', '')::timestamptz;
  v_fin timestamptz := nullif(p_datos->>'end_date', '')::timestamptz;
  v_promocion uuid := nullif(p_datos->>'promotion_id', '')::uuid;
  v_nombre text := nullif(btrim(coalesce(p_datos->>'name', '')), '');
  v_lote uuid := gen_random_uuid();
  v_alfabeto constant text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  v_codigos text[] := '{}';
  v_codigo text;
  v_intentos integer := 0;
  v_insertado text;
  i integer;
begin
  if auth.uid() is null or not public.fn_tiene_permiso(p_organization_id, 'pos.cupones.gestionar') then
    raise exception 'Sin permiso para gestionar cupones' using errcode = '42501';
  end if;
  if v_prefijo !~ '^[A-Z0-9]{1,12}$' then
    raise exception 'prefijo_invalido' using errcode = '22023';
  end if;
  if p_cantidad is null or p_cantidad < 1 or p_cantidad > 5000 then
    raise exception 'cantidad_invalida' using errcode = '22023';
  end if;
  if v_tipo is null or v_tipo not in ('percentage', 'fixed_amount') then
    raise exception 'tipo_invalido' using errcode = '22023';
  end if;
  if v_valor is null or v_valor <= 0 or (v_tipo = 'percentage' and v_valor > 100) then
    raise exception 'valor_invalido' using errcode = '22023';
  end if;
  if v_inicio is not null and v_fin is not null and v_fin < v_inicio then
    raise exception 'vigencia_invalida' using errcode = '22023';
  end if;
  if v_promocion is not null and not exists (
       select 1 from public.promotions p where p.id = v_promocion and p.organization_id = p_organization_id
     ) then
    raise exception 'promocion_invalida' using errcode = '22023';
  end if;

  -- Serializa los lotes de la misma organización: dos lotes simultáneos no
  -- compiten por los mismos códigos.
  perform pg_advisory_xact_lock(hashtext('pos_cupones_crear_lote'), p_organization_id);

  while coalesce(array_length(v_codigos, 1), 0) < p_cantidad loop
    v_intentos := v_intentos + 1;
    if v_intentos > p_cantidad * 20 + 100 then
      raise exception 'sin_codigos_disponibles' using errcode = '22023';
    end if;
    v_codigo := v_prefijo || '-';
    for i in 1..6 loop
      v_codigo := v_codigo || substr(v_alfabeto, 1 + floor(random() * length(v_alfabeto))::integer, 1);
    end loop;

    v_insertado := null;
    insert into public.coupons (
      organization_id, code, name, discount_type, discount_value, min_purchase_amount,
      max_discount_amount, usage_limit, usage_limit_per_customer, start_date, end_date,
      is_active, promotion_id, created_by, batch_id
    ) values (
      p_organization_id, v_codigo, coalesce(v_nombre, v_prefijo), v_tipo, v_valor, v_minimo,
      case when v_tipo = 'percentage' then v_tope end, v_usos, v_usos_cliente, v_inicio, v_fin,
      true, v_promocion, auth.uid(), v_lote
    )
    on conflict (organization_id, lower(code)) do nothing
    returning code into v_insertado;

    if v_insertado is not null then
      v_codigos := v_codigos || v_insertado;
    end if;
  end loop;

  return jsonb_build_object('lote', v_lote, 'creados', array_length(v_codigos, 1), 'codigos', to_jsonb(v_codigos));
end;
$$;

-- ── 5c. Listado ────────────────────────────────────────────────────────────
-- p_estado: 'todos' (sin archivados), 'archivados', o un estado de fn_cupon_estado.
create or replace function public.pos_cupones_listar(
  p_organization_id integer,
  p_branch_id integer default null,
  p_busqueda text default null,
  p_estado text default 'todos',
  p_limite integer default 25,
  p_desplazamiento integer default 0
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
declare
  v_patron text := case when nullif(btrim(coalesce(p_busqueda, '')), '') is null then null
                        else '%' || replace(replace(replace(btrim(p_busqueda), '\', '\\'), '%', '\%'), '_', '\_') || '%' end;
  v_resultado jsonb;
begin
  perform public.fn_cupones_assert_miembro(p_organization_id);

  with base as (
    select c.*,
           public.fn_cupon_estado(c.is_active, c.archived_at, c.usage_limit, c.usage_count, c.start_date, c.end_date) as estado,
           cu.full_name as cliente_nombre,
           pr.name as promocion_nombre
      from public.coupons c
      left join public.customers cu on cu.id = c.customer_id
      left join public.promotions pr on pr.id = c.promotion_id
     where c.organization_id = p_organization_id
       and public.fn_cupon_en_sucursal(pr.branches, c.promotion_id is not null, p_branch_id)
       and (v_patron is null or c.code ilike v_patron or c.name ilike v_patron or cu.full_name ilike v_patron)
  ),
  filtrada as (
    select * from base
     where case coalesce(p_estado, 'todos')
             when 'todos' then estado <> 'archivado'
             when 'archivados' then estado = 'archivado'
             else estado = p_estado
           end
  ),
  pagina as (
    select f.*,
           (select count(*) from public.coupons l
             where l.organization_id = p_organization_id and l.batch_id = f.batch_id) as lote_total
      from filtrada f
     order by f.created_at desc, f.code
     limit greatest(1, least(coalesce(p_limite, 25), 200))
     offset greatest(0, coalesce(p_desplazamiento, 0))
  )
  select jsonb_build_object(
           'total', (select count(*) from filtrada),
           'filas', coalesce((select jsonb_agg(jsonb_build_object(
              'id', p.id, 'code', p.code, 'name', p.name, 'discount_type', p.discount_type,
              'discount_value', p.discount_value, 'min_purchase_amount', p.min_purchase_amount,
              'max_discount_amount', p.max_discount_amount, 'usage_limit', p.usage_limit,
              'usage_limit_per_customer', p.usage_limit_per_customer, 'usage_count', p.usage_count,
              'start_date', p.start_date, 'end_date', p.end_date, 'is_active', p.is_active,
              'archived_at', p.archived_at, 'applies_to_first_purchase', p.applies_to_first_purchase,
              'customer_id', p.customer_id, 'promotion_id', p.promotion_id, 'batch_id', p.batch_id,
              'created_at', p.created_at, 'estado', p.estado, 'cliente_nombre', p.cliente_nombre,
              'promocion_nombre', p.promocion_nombre,
              'lote_total', case when p.batch_id is null then null else p.lote_total end
            ) order by p.created_at desc, p.code) from pagina p), '[]'::jsonb)
         )
    into v_resultado;
  return v_resultado;
end;
$$;

-- ── 5d. KPI ────────────────────────────────────────────────────────────────
-- [p_desde, p_hasta): el mes de la organización, calculado por el cliente con su zona.
create or replace function public.pos_cupones_resumen(
  p_organization_id integer,
  p_branch_id integer default null,
  p_desde timestamptz default null,
  p_hasta timestamptz default null
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
declare
  v_resultado jsonb;
begin
  perform public.fn_cupones_assert_miembro(p_organization_id);

  with cupones as (
    select c.id, c.usage_count,
           public.fn_cupon_estado(c.is_active, c.archived_at, c.usage_limit, c.usage_count, c.start_date, c.end_date) as estado
      from public.coupons c
      left join public.promotions pr on pr.id = c.promotion_id
     where c.organization_id = p_organization_id
       and c.archived_at is null
       and public.fn_cupon_en_sucursal(pr.branches, c.promotion_id is not null, p_branch_id)
  ),
  canjes as (
    select r.discount_applied
      from public.coupon_redemptions r
      join public.coupons c on c.id = r.coupon_id and c.organization_id = p_organization_id
      join public.sales s on s.id = r.sale_id
     where (p_desde is null or r.created_at >= p_desde)
       and (p_hasta is null or r.created_at < p_hasta)
       and (p_branch_id is null or s.branch_id = p_branch_id)
  )
  select jsonb_build_object(
           'total', (select count(*) from cupones),
           'activos', (select count(*) from cupones where estado = 'activo'),
           'agotados_o_vencidos', (select count(*) from cupones where estado in ('agotado', 'vencido')),
           'con_canje', (select count(*) from cupones where usage_count > 0),
           'canjes', (select count(*) from canjes),
           'descuento', (select coalesce(sum(discount_applied), 0) from canjes)
         )
    into v_resultado;
  return v_resultado;
end;
$$;

-- ── 5e. Historial de canjes y estadísticas de un cupón ────────────────────
create or replace function public.pos_cupon_canjes(
  p_organization_id integer,
  p_coupon_id uuid,
  p_limite integer default 25,
  p_desplazamiento integer default 0
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
declare
  v_resultado jsonb;
begin
  perform public.fn_cupones_assert_miembro(p_organization_id);
  if not exists (select 1 from public.coupons c where c.id = p_coupon_id and c.organization_id = p_organization_id) then
    raise exception 'Cupón no encontrado' using errcode = 'P0002';
  end if;

  with canjes as (
    select r.id, r.created_at, r.discount_applied, r.sale_id, r.customer_id,
           s.total as venta_total, s.branch_id,
           (s.web_order_id is not null or s.source = 'web') as es_web,
           s.web_order_id
      from public.coupon_redemptions r
      join public.sales s on s.id = r.sale_id
     where r.coupon_id = p_coupon_id
  ),
  pagina as (
    select k.*,
           (select i.number from public.invoice_sales i
             where i.sale_id = k.sale_id and i.number is not null
             order by i.created_at limit 1) as factura,
           (select w.order_number from public.web_orders w where w.id = k.web_order_id) as pedido,
           cu.full_name as cliente,
           b.name as sucursal
      from canjes k
      left join public.customers cu on cu.id = k.customer_id
      left join public.branches b on b.id = k.branch_id
     order by k.created_at desc
     limit greatest(1, least(coalesce(p_limite, 25), 200))
     offset greatest(0, coalesce(p_desplazamiento, 0))
  )
  select jsonb_build_object(
           'estadisticas', (select jsonb_build_object(
               'canjes', count(*),
               'descuento', coalesce(sum(discount_applied), 0),
               'ticket_medio', coalesce(round(avg(venta_total), 2), 0),
               'web', count(*) filter (where es_web),
               'pos', count(*) filter (where not es_web),
               'ultimo', max(created_at)
             ) from canjes),
           'total', (select count(*) from canjes),
           'filas', coalesce((select jsonb_agg(jsonb_build_object(
               'id', p.id, 'created_at', p.created_at, 'discount_applied', p.discount_applied,
               'sale_id', p.sale_id, 'factura', p.factura, 'pedido', p.pedido,
               'cliente', p.cliente, 'sucursal', p.sucursal, 'branch_id', p.branch_id,
               'es_web', p.es_web, 'venta_total', p.venta_total
             ) order by p.created_at desc) from pagina p), '[]'::jsonb)
         )
    into v_resultado;
  return v_resultado;
end;
$$;

-- ── Permisos de ejecución ──────────────────────────────────────────────────
revoke all on function public.fn_coupons_guarda() from public, anon;
revoke all on function public.fn_cupones_assert_miembro(integer) from public, anon;
revoke all on function public.pos_cupones_crear_lote(integer, text, integer, jsonb) from public, anon;
revoke all on function public.pos_cupones_listar(integer, integer, text, text, integer, integer) from public, anon;
revoke all on function public.pos_cupones_resumen(integer, integer, timestamptz, timestamptz) from public, anon;
revoke all on function public.pos_cupon_canjes(integer, uuid, integer, integer) from public, anon;
grant execute on function public.fn_cupones_assert_miembro(integer) to authenticated, service_role;
grant execute on function public.pos_cupones_crear_lote(integer, text, integer, jsonb) to authenticated, service_role;
grant execute on function public.pos_cupones_listar(integer, integer, text, text, integer, integer) to authenticated, service_role;
grant execute on function public.pos_cupones_resumen(integer, integer, timestamptz, timestamptz) to authenticated, service_role;
grant execute on function public.pos_cupon_canjes(integer, uuid, integer, integer) to authenticated, service_role;
