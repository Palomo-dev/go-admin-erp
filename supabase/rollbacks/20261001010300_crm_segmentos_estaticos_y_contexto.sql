-- Revertir primero las migraciones posteriores que dependan de estas RPC.
-- Reversión de acceso: conserva snapshots, auditoría, tabla y columna nuevas.
-- No borra datos ni vuelve a evaluar miembros de segmentos estáticos.
-- Restauración exacta del trigger caracterizado antes de esta migración.
create or replace trigger set_segments_updated_at before update on public.segments
for each row execute function public.set_updated_at();
revoke execute on function public.crm_segment_context_page(integer,uuid,integer,uuid,timestamptz,uuid[]) from authenticated,service_role;
revoke execute on function public.crm_segment_excluded_phones(integer,text[]) from authenticated,service_role;
revoke execute on function public.crm_save_segment(integer,uuid,uuid,text,text,jsonb,boolean,integer,uuid[],timestamptz) from service_role;
revoke execute on function public.fn_crm_exigir_permiso_actor(integer,uuid,text) from service_role;
revoke all on public.segment_members from authenticated;
update public.role_permissions set allowed=false where permission_id in(select id from public.permissions where code='crm.segments.manage');
