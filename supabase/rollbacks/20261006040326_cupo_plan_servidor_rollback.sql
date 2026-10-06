-- Reversión de 20261006150000_cupo_plan_servidor.
-- Solo estructura: la migración no transforma datos.
-- Si ya se aplicó 20261006150100_pruebas_vencidas, revertir esa primero (su get_current_plan y
-- validate_module_activation usan fn_plan_vigente).
drop trigger if exists trg_cupo_plan_miembro on public.organization_members;
drop trigger if exists trg_cupo_plan_invitacion on public.invitations;
drop trigger if exists trg_cupo_plan_sucursal on public.branches;
drop function if exists public.fn_cupo_plan_miembro();
drop function if exists public.fn_cupo_plan_invitacion();
drop function if exists public.fn_cupo_plan_sucursal();
drop function if exists public.fn_cupo_plan(integer);
drop function if exists public.fn_plan_vigente(integer);
