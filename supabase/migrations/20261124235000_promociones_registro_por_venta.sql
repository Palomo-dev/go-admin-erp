-- Promociones V2 · qué promoción se usó en cada venta (Figma «05 POS y ventas», lista 2998:192942 y
-- detalle 3003:193974: «Ahorro del mes», «Ventas con la promoción», «Ahorro dado», «Unidades en
-- escalón», «Ventas recientes»). Aplicada con apply_migration (MCP). Todo aditivo.
--
--   1. sale_promotions: una fila por venta (o pedido web) y promoción, con el ahorro, las unidades
--      que recibieron el descuento, las unidades por escalón (precio por volumen) y un resumen
--      («12 × Gaseosa 400 ml»). Solo lectura para la sesión (RLS por pertenencia); se escribe con
--      las funciones de abajo.
--   2. fn_venta_registrar_promociones(sale_id): rehace las filas de una venta a partir de sus
--      sale_items. POS: notes.promociones_aplicadas = [{promotion_id, discount_amount, tier}] (lo
--      pone buildCheckoutEnvelope). Mesas: notes.promociones (ids) + notes.descuento_promocion (lo
--      pone pos_mesa_aplicar_promociones), repartido en partes iguales si hay varias.
--   3. pos_checkout_v1 la llama donde ya suma usage_count: venta nueva (paso 5) y cobro que salda la
--      mesa. Reemplazo textual de DOS líneas sobre la definición viva (conserva la de
--      register_promotion_customer_use de 20261124200000 y lo de listas de precios); si una ancla no
--      está exactamente una vez, la migración falla. Dentro del mismo begin … exception: un fallo
--      queda como aviso y no tumba la venta.
--   4. fn_pedido_web_promociones_guardar(order_id, filas): la tienda (/api/orders, service role) al
--      crear el pedido y el ERP al quitar o devolver la promoción de una línea. Rehace las filas del
--      pedido. Comprueba la organización (fn_assert_acceso_org) y que cada promoción sea de ella.
--   5. trg_web_orders_promociones_venta: cuando el pedido web queda con venta (web_orders.sale_id),
--      sus filas pasan a esa venta. Así cuentan solo los pedidos confirmados.
--   6. fn_promociones_resumen (lista: ahorro y ventas del periodo, por promoción) y
--      fn_promocion_estadisticas (detalle: ventas, ahorro, unidades por escalón, ventas recientes).
--      SECURITY INVOKER: la sesión solo ve lo de sus organizaciones. Una venta anulada no cuenta.
--
-- Idempotente. Rollback: supabase/rollbacks/20261124235000_promociones_registro_por_venta_rollback.sql

set lock_timeout = '10s';

-- 1. Tabla ----------------------------------------------------------------------------------------
create table if not exists public.sale_promotions (
  id uuid primary key default gen_random_uuid(),
  organization_id integer not null references public.organizations(id) on delete cascade,
  sale_id uuid null references public.sales(id) on delete cascade,
  web_order_id uuid null references public.web_orders(id) on delete cascade,
  promotion_id uuid not null references public.promotions(id) on delete cascade,
  channel text not null default 'pos' check (channel in ('pos', 'mesa', 'web')),
  discount_amount numeric(14,2) not null default 0 check (discount_amount >= 0),
  units numeric(14,3) not null default 0 check (units >= 0),
  units_by_tier jsonb null check (units_by_tier is null or jsonb_typeof(units_by_tier) = 'object'),
  summary text null check (summary is null or length(summary) <= 160),
  created_at timestamptz not null default now(),
  constraint sale_promotions_con_documento check (sale_id is not null or web_order_id is not null)
);
create unique index if not exists sale_promotions_venta_uk
  on public.sale_promotions(sale_id, promotion_id) where web_order_id is null;
create unique index if not exists sale_promotions_pedido_uk
  on public.sale_promotions(web_order_id, promotion_id) where web_order_id is not null;
create index if not exists sale_promotions_org_promo_idx
  on public.sale_promotions(organization_id, promotion_id, created_at desc);
create index if not exists sale_promotions_sale_idx on public.sale_promotions(sale_id) where sale_id is not null;
create index if not exists sale_promotions_promo_idx on public.sale_promotions(promotion_id);

comment on table public.sale_promotions is
  'Qué promoción se usó en cada venta o pedido web: ahorro, unidades con descuento, unidades por escalón (precio por volumen) y resumen. Lo escriben pos_checkout_v1 (fn_venta_registrar_promociones) y la tienda o el ERP (fn_pedido_web_promociones_guardar). Un pedido web cuenta cuando tiene venta (sale_id).';
comment on column public.sale_promotions.units_by_tier is
  'Precio por volumen: unidades por escalón alcanzado, {"6": 6, "12": 24} (clave = min_quantity del escalón).';

alter table public.sale_promotions enable row level security;
revoke all on public.sale_promotions from public, anon, authenticated;
grant select on public.sale_promotions to authenticated;
grant all on public.sale_promotions to service_role;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'sale_promotions'
                  and policyname = 'sale_promotions_org_select') then
    create policy sale_promotions_org_select on public.sale_promotions for select to authenticated
      using (organization_id in (select om.organization_id from public.organization_members om
                                  where om.user_id = (select auth.uid()) and om.is_active = true));
  end if;
end $$;

-- Cantidad sin ceros de sobra: 12.000 → «12», 1.500 → «1.5».
create or replace function public.fn_texto_cantidad(p numeric)
returns text language sql immutable set search_path = public, pg_temp as $$
  select case when p is null then '0'
              when p = trunc(p) then trunc(p)::bigint::text
              else rtrim(rtrim(p::text, '0'), '.') end;
$$;
revoke all on function public.fn_texto_cantidad(numeric) from public, anon;
grant execute on function public.fn_texto_cantidad(numeric) to authenticated, service_role;

-- 2. Registro de una venta ------------------------------------------------------------------------
create or replace function public.fn_venta_registrar_promociones(p_sale_id uuid)
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_org   integer;
  v_canal text;
  v_n     integer := 0;
begin
  select s.organization_id,
         case when exists (select 1 from public.table_sessions ts where ts.sale_id = s.id) then 'mesa'
              when s.web_order_id is not null then 'web'
              else 'pos' end
    into v_org, v_canal
    from public.sales s where s.id = p_sale_id;
  if v_org is null then
    return 0;
  end if;

  delete from public.sale_promotions where sale_id = p_sale_id;

  with lineas as (
    select si.id, si.quantity, coalesce(si.discount_amount, 0) as descuento_linea,
           case when jsonb_typeof(si.notes) = 'object' then si.notes else '{}'::jsonb end as notas,
           coalesce(nullif(si.notes->>'product_name', ''), p.name, '') as nombre
      from public.sale_items si
      left join public.products p on p.id = si.product_id
     where si.sale_id = p_sale_id and si.quantity > 0 and not coalesce(si.promo_excluded, false)
  ), detalle_pos as (
    select l.id as linea, l.quantity, l.nombre, l.descuento_linea,
           lower(x->>'promotion_id') as promo,
           case when coalesce(x->>'discount_amount', '') ~ '^[0-9]+(\.[0-9]+)?$'
                then (x->>'discount_amount')::numeric else 0 end as monto,
           case when coalesce(x->>'tier', '') ~ '^[0-9]{1,6}$' then (x->>'tier')::integer else null end as escalon
      from lineas l
      cross join lateral jsonb_array_elements(
        case when jsonb_typeof(l.notas->'promociones_aplicadas') = 'array' then l.notas->'promociones_aplicadas' else '[]'::jsonb end
      ) x
     where jsonb_typeof(x) = 'object'
  ), detalle_mesa as (
    select l.id as linea, l.quantity, l.nombre, l.descuento_linea,
           lower(x #>> '{}') as promo,
           round(case when coalesce(l.notas->>'descuento_promocion', '') ~ '^[0-9]+(\.[0-9]+)?$'
                      then (l.notas->>'descuento_promocion')::numeric else 0 end
                 / jsonb_array_length(l.notas->'promociones'), 2) as monto,
           null::integer as escalon
      from lineas l
      cross join lateral jsonb_array_elements(l.notas->'promociones') x
     where jsonb_typeof(l.notas->'promociones_aplicadas') is distinct from 'array'
       and jsonb_typeof(l.notas->'promociones') = 'array'
       and jsonb_array_length(l.notas->'promociones') > 0
       and jsonb_typeof(x) = 'string'
  ), detalle as (
    select d.*
      from (select * from detalle_pos union all select * from detalle_mesa) d
      join public.promotions pr on pr.id::text = d.promo and pr.organization_id = v_org
     where d.promo ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       -- Nunca más que el descuento que de verdad quedó en la línea.
       and least(d.monto, d.descuento_linea) > 0
  ), insertadas as (
    insert into public.sale_promotions
      (organization_id, sale_id, web_order_id, promotion_id, channel, discount_amount, units, units_by_tier, summary)
    select v_org, p_sale_id, null, d.promo::uuid, v_canal,
           round(sum(least(d.monto, d.descuento_linea)), 2),
           sum(d.quantity),
           (select jsonb_object_agg(t.escalon::text, t.unidades)
              from (select d2.escalon, sum(d2.quantity) as unidades from detalle d2
                     where d2.promo = d.promo and d2.escalon is not null group by d2.escalon) t),
           (select left(public.fn_texto_cantidad(d3.quantity) || ' × ' || d3.nombre, 160)
              from detalle d3 where d3.promo = d.promo
             order by least(d3.monto, d3.descuento_linea) desc, d3.linea limit 1)
      from detalle d
     group by d.promo
    returning 1
  )
  select count(*)::integer into v_n from insertadas;
  return v_n;
end;
$$;
revoke all on function public.fn_venta_registrar_promociones(uuid) from public, anon, authenticated;
grant execute on function public.fn_venta_registrar_promociones(uuid) to service_role;
comment on function public.fn_venta_registrar_promociones(uuid) is
  'Rehace sale_promotions de una venta desde sus sale_items (notes.promociones_aplicadas del POS o notes.promociones de mesas). La llama pos_checkout_v1; cerrada a la sesión.';

-- 3. pos_checkout_v1: dos llamadas nuevas (reemplazo textual) -----------------------------------
do $$
declare
  v_def text := pg_get_functiondef('public.pos_checkout_v1(jsonb)'::regprocedure);
  v_ancla_venta text := 'perform public.register_promotion_customer_use(v_org, v_promos, v_customer);';
  v_ancla_mesa  text := 'and si.notes->''promociones'' ? x::text)));';
begin
  if position('fn_venta_registrar_promociones' in v_def) > 0 then
    return; -- ya aplicada
  end if;
  if (length(v_def) - length(replace(v_def, v_ancla_venta, ''))) / length(v_ancla_venta) <> 1 then
    raise exception 'pos_checkout_v1 no tiene exactamente una llamada a register_promotion_customer_use';
  end if;
  if (length(v_def) - length(replace(v_def, v_ancla_mesa, ''))) / length(v_ancla_mesa) <> 1 then
    raise exception 'pos_checkout_v1 cambió: no se encontró el uso de promociones de la mesa';
  end if;
  v_def := replace(v_def, v_ancla_venta,
    v_ancla_venta || chr(10) || '      perform public.fn_venta_registrar_promociones(v_sale_id);');
  v_def := replace(v_def, v_ancla_mesa,
    v_ancla_mesa || chr(10) || '        perform public.fn_venta_registrar_promociones(v_sale_id);');
  execute v_def;
end $$;

-- 4. Pedido web -------------------------------------------------------------------------------------
create or replace function public.fn_pedido_web_promociones_guardar(p_order_id uuid, p_filas jsonb)
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_org   integer;
  v_sale  uuid;
  v_tope  numeric;
  v_f     jsonb;
  v_n     integer := 0;
begin
  select o.organization_id, o.sale_id, greatest(coalesce(o.subtotal, 0), 0)
    into v_org, v_sale, v_tope
    from public.web_orders o where o.id = p_order_id;
  if v_org is null then
    raise exception 'pedido_no_encontrado' using errcode = 'P0002';
  end if;
  perform public.fn_assert_acceso_org(v_org);
  if p_filas is null or jsonb_typeof(p_filas) <> 'array' or jsonb_array_length(p_filas) > 50 then
    raise exception 'filas_invalidas' using errcode = '22023';
  end if;
  for v_f in select value from jsonb_array_elements(p_filas) loop
    if jsonb_typeof(v_f) <> 'object'
       or coalesce(v_f->>'promotion_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       or coalesce(jsonb_typeof(v_f->'discount_amount'), '') <> 'number'
       or (v_f->>'discount_amount')::numeric < 0
       or (v_f->>'discount_amount')::numeric > v_tope
       or (v_f ? 'units' and coalesce(jsonb_typeof(v_f->'units'), '') <> 'number')
       or (v_f ? 'units_by_tier' and jsonb_typeof(v_f->'units_by_tier') not in ('object', 'null')) then
      raise exception 'filas_invalidas' using errcode = '22023';
    end if;
    if not exists (select 1 from public.promotions pr
                    where pr.id = (v_f->>'promotion_id')::uuid and pr.organization_id = v_org) then
      raise exception 'promocion_invalida' using errcode = '22023';
    end if;
  end loop;

  delete from public.sale_promotions where web_order_id = p_order_id;
  insert into public.sale_promotions
    (organization_id, sale_id, web_order_id, promotion_id, channel, discount_amount, units, units_by_tier, summary)
  select v_org, v_sale, p_order_id, (f->>'promotion_id')::uuid, 'web',
         round(max((f->>'discount_amount')::numeric), 2),
         greatest(0, coalesce(max((f->>'units')::numeric), 0)),
         (array_agg(case when jsonb_typeof(f->'units_by_tier') = 'object' and f->'units_by_tier' <> '{}'::jsonb
                         then f->'units_by_tier' end))[1],
         left(nullif(trim(max(f->>'summary')), ''), 160)
    from jsonb_array_elements(p_filas) f
   where (f->>'discount_amount')::numeric > 0
   group by lower(f->>'promotion_id'), (f->>'promotion_id')::uuid;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
revoke all on function public.fn_pedido_web_promociones_guardar(uuid, jsonb) from public, anon;
grant execute on function public.fn_pedido_web_promociones_guardar(uuid, jsonb) to authenticated, service_role;
comment on function public.fn_pedido_web_promociones_guardar(uuid, jsonb) is
  'Rehace sale_promotions de un pedido web: filas [{promotion_id, discount_amount, units, units_by_tier, summary}]. La tienda al crear el pedido y el ERP al quitar o devolver una promoción. Exige acceso a la organización del pedido.';

-- 5. Pedido confirmado → su venta -------------------------------------------------------------------
create or replace function public.fn_web_orders_promociones_venta()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.sale_id is not null and new.sale_id is distinct from old.sale_id then
    update public.sale_promotions sp set sale_id = new.sale_id
     where sp.web_order_id = new.id and sp.organization_id = new.organization_id
       and sp.sale_id is distinct from new.sale_id;
  end if;
  return new;
end;
$$;
revoke all on function public.fn_web_orders_promociones_venta() from public, anon, authenticated;
drop trigger if exists trg_web_orders_promociones_venta on public.web_orders;
create trigger trg_web_orders_promociones_venta after update of sale_id on public.web_orders
  for each row execute function public.fn_web_orders_promociones_venta();

-- 6. Lecturas -----------------------------------------------------------------------------------------
-- Lista: ahorro y ventas del periodo (toda la organización o una sucursal) y por promoción.
create or replace function public.fn_promociones_resumen(
  p_organization_id integer, p_desde timestamptz, p_hasta timestamptz, p_branch_id integer default null)
returns jsonb language sql stable security invoker set search_path = public, pg_temp as $$
  with filas as (
    select sp.promotion_id, sp.sale_id, sp.discount_amount, sp.units
      from public.sale_promotions sp
      join public.sales s on s.id = sp.sale_id
     where sp.organization_id = p_organization_id
       and s.organization_id = p_organization_id
       and coalesce(s.status, '') not in ('void', 'voided', 'cancelled')
       and coalesce(s.sale_date, s.created_at) >= p_desde
       and coalesce(s.sale_date, s.created_at) < p_hasta
       and (p_branch_id is null or s.branch_id = p_branch_id)
  )
  select jsonb_build_object(
    'ahorro', coalesce((select round(sum(discount_amount), 2) from filas), 0),
    'ventas', (select count(distinct sale_id) from filas),
    'por_promocion', coalesce((
      select jsonb_agg(jsonb_build_object('promotion_id', promotion_id, 'ventas', ventas, 'ahorro', ahorro, 'unidades', unidades))
        from (select promotion_id, count(distinct sale_id) as ventas, round(sum(discount_amount), 2) as ahorro,
                     sum(units) as unidades
                from filas group by promotion_id) x), '[]'::jsonb));
$$;
revoke all on function public.fn_promociones_resumen(integer, timestamptz, timestamptz, integer) from public, anon;
grant execute on function public.fn_promociones_resumen(integer, timestamptz, timestamptz, integer) to authenticated, service_role;

-- Detalle: ventas, ahorro y unidades del periodo; unidades y ventas por escalón; ventas recientes.
create or replace function public.fn_promocion_estadisticas(
  p_promotion_id uuid, p_desde timestamptz, p_hasta timestamptz, p_limite integer default 5)
returns jsonb language sql stable security invoker set search_path = public, pg_temp as $$
  with base as (
    select sp.*, s.branch_id, coalesce(s.sale_date, s.created_at) as fecha
      from public.sale_promotions sp
      join public.sales s on s.id = sp.sale_id and s.organization_id = sp.organization_id
     where sp.promotion_id = p_promotion_id
       and coalesce(s.status, '') not in ('void', 'voided', 'cancelled')
  ), periodo as (
    select * from base where fecha >= p_desde and fecha < p_hasta
  ), escalones as (
    select e.key as escalon, sum(case when e.value::text ~ '^[0-9]+(\.[0-9]+)?$' then e.value::text::numeric else 0 end) as unidades,
           count(distinct p.sale_id) as ventas
      from periodo p
      cross join lateral jsonb_each(coalesce(p.units_by_tier, '{}'::jsonb)) e
     group by e.key
  ), recientes as (
    select b.sale_id, b.fecha, b.channel, b.discount_amount, b.summary,
           br.name as sucursal,
           coalesce(
             (select i.number from public.invoice_sales i
               where i.sale_id = b.sale_id and coalesce(i.document_type, 'invoice') <> 'credit_note'
               order by (coalesce(i.status, '') in ('void', 'voided', 'cancelled')), i.created_at desc nulls last
               limit 1),
             (select o.order_number from public.web_orders o where o.id = b.web_order_id)) as numero
      from base b
      left join public.branches br on br.id = b.branch_id
     order by b.fecha desc nulls last, b.created_at desc
     limit greatest(1, least(coalesce(p_limite, 5), 50))
  )
  select jsonb_build_object(
    'ventas', (select count(distinct sale_id) from periodo),
    'ahorro', coalesce((select round(sum(discount_amount), 2) from periodo), 0),
    'unidades', coalesce((select sum(units) from periodo), 0),
    'por_escalon', coalesce((select jsonb_object_agg(escalon, jsonb_build_object('unidades', unidades, 'ventas', ventas)) from escalones), '{}'::jsonb),
    'recientes', coalesce((select jsonb_agg(jsonb_build_object(
        'sale_id', sale_id, 'fecha', fecha, 'canal', channel, 'descuento', discount_amount,
        'resumen', summary, 'sucursal', sucursal, 'numero', numero) order by fecha desc nulls last) from recientes), '[]'::jsonb));
$$;
revoke all on function public.fn_promocion_estadisticas(uuid, timestamptz, timestamptz, integer) from public, anon;
grant execute on function public.fn_promocion_estadisticas(uuid, timestamptz, timestamptz, integer) to authenticated, service_role;
