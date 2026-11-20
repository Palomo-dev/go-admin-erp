-- Reversión de 20261120181551_pos_cupones_lote_estado_canjes.sql.
-- Los cupones archivados quedan como inactivos; el lote al que pertenecía cada cupón se pierde.
-- El permiso se borra con sus asignaciones (role_permissions / job_position_permissions).
drop function if exists public.pos_cupon_canjes(integer, uuid, integer, integer);
drop function if exists public.pos_cupones_resumen(integer, integer, timestamptz, timestamptz);
drop function if exists public.pos_cupones_listar(integer, integer, text, text, integer, integer);
drop function if exists public.pos_cupones_crear_lote(integer, text, integer, jsonb);
drop function if exists public.fn_cupones_assert_miembro(integer);
drop function if exists public.fn_cupon_en_sucursal(jsonb, boolean, integer);
drop function if exists public.fn_cupon_estado(boolean, timestamptz, integer, integer, timestamptz, timestamptz);
drop trigger if exists trg_coupons_guarda on public.coupons;
drop function if exists public.fn_coupons_guarda();
delete from public.role_permissions where permission_id in (select id from public.permissions where code = 'pos.cupones.gestionar');
delete from public.job_position_permissions where permission_id in (select id from public.permissions where code = 'pos.cupones.gestionar');
delete from public.permissions where code = 'pos.cupones.gestionar';
drop index if exists public.uk_coupons_org_code_ci;
drop index if exists public.idx_coupon_redemptions_coupon_fecha;
drop index if exists public.idx_coupons_org_batch;
alter table public.coupons drop column if exists batch_id;
alter table public.coupons drop column if exists archived_at;
