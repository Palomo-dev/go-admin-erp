-- Membresías — fase 3, P9: el precio del plan es el del producto (docs/design/MEMBRESIAS-FASE-1-2.md §11.1).
--
-- Desde la fase 1 el precio de una membresía vive en product_prices (con vigencia). El código de main ya
-- no lee membership_plans.price, pero la columna NO se borra todavía porque la leen:
--   · la rama master del ERP (módulo gym viejo: planes, membresías, reportes);
--   · goadmin-websites (secciones de planes del sitio, compra de membresía, correo de confirmación).
-- Por eso se deja como COPIA de solo lectura del precio vigente del producto, mantenida por la base:
--   1. fn_membresias_int_precio_vigente(product_id): el precio vigente (misma regla que el POS).
--   2. fn_membresias_sincronizar_precio_legado(product_id|null): copia ese precio a los planes ligados.
--   3. trg_membresias_precio_legado (product_prices): cada precio nuevo o editado se copia al plan.
--   4. trg_membership_plans_precio_legado (membership_plans, BEFORE): un plan con producto siempre lleva
--      el precio del producto, aunque alguien (master) intente escribir otro.
--   5. pg_cron membresias-precio-legado (cada hora, minuto 17): un precio PROGRAMADO (effective_from
--      futuro) entra en vigencia sin que nadie escriba; la tarea lo copia.
--   6. fn_producto_guardar deja de nombrar la columna en sus insert (escribía null): así el DROP futuro
--      no rompe el guardado del producto.
-- Todo es aditivo. El DROP de la columna es una migración POSTERIOR, propuesta en el §11.1 del doc.

-- 1. Precio vigente de un producto ─────────────────────────────────────────────
create or replace function public.fn_membresias_int_precio_vigente(p_product_id integer)
returns numeric
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select pp.price
    from public.product_prices pp
   where pp.product_id = p_product_id
     and pp.effective_from <= now()
     and (pp.effective_to is null or pp.effective_to > now())
   order by pp.effective_from desc, pp.id desc
   limit 1
$$;
revoke all on function public.fn_membresias_int_precio_vigente(integer) from public, anon, authenticated;
comment on function public.fn_membresias_int_precio_vigente(integer) is
  'Membresías (P9): precio vigente del producto en product_prices. Interna: solo la llaman funciones SECURITY DEFINER.';

-- 2. Copia del precio a los planes ligados ────────────────────────────────────
create or replace function public.fn_membresias_sincronizar_precio_legado(p_product_id integer default null)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_n integer;
begin
  update public.membership_plans mp
     set price = v.precio
    from (select p.id, public.fn_membresias_int_precio_vigente(p.product_id) as precio
            from public.membership_plans p
           where p.product_id is not null
             and (p_product_id is null or p.product_id = p_product_id)) v
   where mp.id = v.id
     and v.precio is not null
     and mp.price is distinct from v.precio;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
revoke all on function public.fn_membresias_sincronizar_precio_legado(integer) from public, anon, authenticated;
comment on function public.fn_membresias_sincronizar_precio_legado(integer) is
  'Membresías (P9): copia el precio vigente del producto (product_prices) a membership_plans.price, que solo '
  'existe para master y goadmin-websites. Se retira con el DROP de la columna.';

-- 3. Disparador en product_prices ─────────────────────────────────────────────
create or replace function public.fn_membresias_tg_precio_producto()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op <> 'DELETE'
     and exists (select 1 from public.membership_plans where product_id = new.product_id) then
    perform public.fn_membresias_sincronizar_precio_legado(new.product_id);
  end if;
  if tg_op <> 'INSERT'
     and (tg_op = 'DELETE' or old.product_id is distinct from new.product_id)
     and exists (select 1 from public.membership_plans where product_id = old.product_id) then
    perform public.fn_membresias_sincronizar_precio_legado(old.product_id);
  end if;
  return null;
end;
$$;
revoke all on function public.fn_membresias_tg_precio_producto() from public, anon, authenticated;

drop trigger if exists trg_membresias_precio_legado on public.product_prices;
create trigger trg_membresias_precio_legado
  after insert or update or delete on public.product_prices
  for each row execute function public.fn_membresias_tg_precio_producto();

-- 4. Disparador en membership_plans (corre después de trg_membership_plans_coherencia) ──
create or replace function public.fn_membresias_tg_plan_precio_legado()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.product_id is not null then
    new.price := coalesce(public.fn_membresias_int_precio_vigente(new.product_id), new.price);
  end if;
  return new;
end;
$$;
revoke all on function public.fn_membresias_tg_plan_precio_legado() from public, anon, authenticated;

drop trigger if exists trg_membership_plans_precio_legado on public.membership_plans;
create trigger trg_membership_plans_precio_legado
  before insert or update on public.membership_plans
  for each row execute function public.fn_membresias_tg_plan_precio_legado();

-- 5. Tarea horaria para precios programados ────────────────────────────────────
do $$
begin
  if exists (select 1 from cron.job where jobname = 'membresias-precio-legado') then
    perform cron.unschedule('membresias-precio-legado');
  end if;
  perform cron.schedule('membresias-precio-legado', '17 * * * *',
    'select public.fn_membresias_sincronizar_precio_legado()');
end $$;

-- 6. fn_producto_guardar: no nombra membership_plans.price (definición VIVA + reemplazo verificado) ──
do $$
declare
  v_def text := pg_get_functiondef('public.fn_producto_guardar(integer,jsonb)'::regprocedure);
  v_frag text[] := array[
    E'membership_plans (organization_id, product_id, name, description, duration_days, price,\n',
    E'nullif(v_pr->>''description'', ''''), 30, null,'
  ];
  v_repl text[] := array[
    E'membership_plans (organization_id, product_id, name, description, duration_days,\n',
    E'nullif(v_pr->>''description'', ''''), 30,'
  ];
  v_n integer;
  i integer;
begin
  v_n := (length(v_def) - length(replace(v_def, v_frag[1], ''))) / length(v_frag[1]);
  if v_n = 0 then
    raise notice 'fn_producto_guardar ya no nombra membership_plans.price: nada que hacer';
    return;
  end if;
  for i in 1 .. 2 loop
    if (length(v_def) - length(replace(v_def, v_frag[i], ''))) / length(v_frag[i]) <> 2 then
      raise exception 'fn_producto_guardar: el fragmento % no aparece exactamente 2 veces', i;
    end if;
  end loop;
  for i in 1 .. 2 loop
    v_def := replace(v_def, v_frag[i], v_repl[i]);
  end loop;
  execute v_def;
end $$;

-- 7. Copia inicial y comentario ───────────────────────────────────────────────
select public.fn_membresias_sincronizar_precio_legado();

comment on column public.membership_plans.price is
  'Obsoleto (P9). Copia de solo lectura del precio vigente del producto (product_prices), mantenida por '
  'trg_membresias_precio_legado y trg_membership_plans_precio_legado para master y goadmin-websites. '
  'El código de main no la lee. Se retira tras el despliegue main→master y la migración de goadmin-websites '
  '(docs/design/MEMBRESIAS-FASE-1-2.md §11.1).';
