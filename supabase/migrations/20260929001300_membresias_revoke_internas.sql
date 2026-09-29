-- Membresías — cierre de privilegios (get_advisors, 2026-09-29).
--
-- fn_membresias_int_exigir solo la llaman otras funciones SECURITY DEFINER (que corren con los
-- privilegios de su dueño): no necesita EXECUTE para authenticated.
-- registrar_pago_membresia y obtener_pagos_membresia (del módulo gym viejo) son SECURITY DEFINER,
-- NO validan la organización y ningún código del ERP las llama (docs/design/MEMBRESIAS-FASE-1-2.md
-- §1.2). Se cierran para sesiones; el service role las conserva por si un repositorio externo las usa.

revoke execute on function public.fn_membresias_int_exigir(integer, text[]) from authenticated;

do $$
declare
  v_fn regprocedure;
begin
  for v_fn in
    select p.oid::regprocedure from pg_proc p
     where p.pronamespace = 'public'::regnamespace
       and p.proname in ('registrar_pago_membresia', 'obtener_pagos_membresia')
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', v_fn);
    execute format('grant execute on function %s to service_role', v_fn);
  end loop;
end $$;
