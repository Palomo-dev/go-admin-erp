-- Reversión de 20261121001052_pos_promociones_permiso_gestionar.
-- El permiso se borra con sus asignaciones (role_permissions / job_position_permissions).
drop trigger if exists trg_promotion_rules_guarda on public.promotion_rules;
drop function if exists public.fn_promotion_rules_guarda();
drop trigger if exists trg_promotions_guarda on public.promotions;
drop function if exists public.fn_promotions_guarda();
delete from public.role_permissions where permission_id in (select id from public.permissions where code = 'pos.promociones.gestionar');
delete from public.job_position_permissions where permission_id in (select id from public.permissions where code = 'pos.promociones.gestionar');
delete from public.permissions where code = 'pos.promociones.gestionar';
