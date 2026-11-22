-- Columna calculada de PostgREST: `select=*,estado_codigo` en `coupons` trae el
-- estado del código con la misma regla única (`fn_cupon_estado`). La usa el
-- detalle del cupón, que lee la fila suelta y no la lista.
create or replace function public.estado_codigo(c public.coupons)
returns text
language sql
stable
set search_path = public, pg_temp
as $$
  select public.fn_cupon_estado(c.is_active, c.archived_at, c.usage_limit, c.usage_count, c.start_date, c.end_date);
$$;

revoke all on function public.estado_codigo(public.coupons) from public, anon;
grant execute on function public.estado_codigo(public.coupons) to authenticated, service_role;
