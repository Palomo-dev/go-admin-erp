-- Rollback de 20260929001300_membresias_revoke_internas.sql
-- Devuelve EXECUTE a authenticated (anon sigue cerrado, como estaba el 2026-09-28).

grant execute on function public.fn_membresias_int_exigir(integer, text[]) to authenticated;

do $$
declare
  v_fn regprocedure;
begin
  for v_fn in
    select p.oid::regprocedure from pg_proc p
     where p.pronamespace = 'public'::regnamespace
       and p.proname in ('registrar_pago_membresia', 'obtener_pagos_membresia')
  loop
    execute format('grant execute on function %s to authenticated', v_fn);
  end loop;
end $$;
