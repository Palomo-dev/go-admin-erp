-- Revierte acceso y funciones. Conserva la tabla y los snapshots: eliminarlos
-- impediría auditar/restaurar fusiones ya ejecutadas. No deshace datos fusionados.
drop function if exists public.crm_merge_customers(integer,uuid,uuid[],jsonb);
drop function if exists public.crm_unmerge_customer(integer,uuid);
do $$ begin
  if to_regclass('public.customer_merges') is not null then
    revoke all on public.customer_merges from authenticated;
    drop policy if exists crm_merges_read on public.customer_merges;
  end if;
end $$;
-- El permiso se conserva por sus posibles asignaciones posteriores.
