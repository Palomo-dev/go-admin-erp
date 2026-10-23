-- Revierte 20261023085017_centros_costo_disparadores.
-- Quita la siembra automática al crear organización o sucursal, la RPC pública
-- y los disparadores de ciclo y de borrado. No borra centros: eso está en el
-- rollback de 20261023085110.

drop trigger if exists trg_zzzz_sembrar_centros_org on public.organizations;
drop trigger if exists trg_zz_sembrar_centros_sucursal on public.branches;
drop trigger if exists trg_cost_centers_sin_ciclo on public.cost_centers;
drop trigger if exists trg_cost_centers_bloquear_borrado on public.cost_centers;

drop function if exists public.fn_sembrar_centros_costo(integer, text, boolean);
drop function if exists public.trg_fn_sembrar_centros_org();
drop function if exists public.trg_fn_sembrar_centros_sucursal();
drop function if exists public.fn_cost_centers_sin_ciclo();
drop function if exists public.fn_cost_centers_bloquear_borrado();
