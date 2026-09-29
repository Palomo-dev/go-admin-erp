-- Rollback de 20260929235000_membresias_f3_precio_plan_legado.sql
-- Quita la sincronización del precio del plan y devuelve a fn_producto_guardar sus insert con
-- `price` (null). NO restaura valores de membership_plans.price: la migración solo copió en ellos el
-- precio vigente del producto (el 2026-09-29 los 4 planes ya coincidían, 0 filas cambiadas).

do $$
begin
  if exists (select 1 from cron.job where jobname = 'membresias-precio-legado') then
    perform cron.unschedule('membresias-precio-legado');
  end if;
end $$;

drop trigger if exists trg_membership_plans_precio_legado on public.membership_plans;
drop trigger if exists trg_membresias_precio_legado on public.product_prices;
drop function if exists public.fn_membresias_tg_plan_precio_legado();
drop function if exists public.fn_membresias_tg_precio_producto();
drop function if exists public.fn_membresias_sincronizar_precio_legado(integer);
drop function if exists public.fn_membresias_int_precio_vigente(integer);

do $$
declare
  v_def text := pg_get_functiondef('public.fn_producto_guardar(integer,jsonb)'::regprocedure);
  v_frag text[] := array[
    E'membership_plans (organization_id, product_id, name, description, duration_days,\n',
    E'nullif(v_pr->>''description'', ''''), 30,'
  ];
  v_repl text[] := array[
    E'membership_plans (organization_id, product_id, name, description, duration_days, price,\n',
    E'nullif(v_pr->>''description'', ''''), 30, null,'
  ];
  i integer;
begin
  if position('duration_days, price,' in v_def) > 0 then
    raise notice 'fn_producto_guardar ya nombra membership_plans.price: nada que revertir';
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

comment on column public.membership_plans.price is
  'Obsoleto: el precio es el del producto (product_prices). Se retira en la fase 3.';
