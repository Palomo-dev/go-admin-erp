-- Mantiene tablas, snapshots y eventos. El guard de referencias permanece
-- para impedir audiencias huérfanas incluso al revertir las API nuevas.
revoke execute on function public.crm_duplicate_segment(integer,uuid,uuid,text) from service_role;
revoke execute on function public.crm_delete_segment(integer,uuid,uuid,timestamptz) from service_role;
-- ACL anterior caracterizada: authenticated tenía las siete operaciones.
-- No restaura acceso anónimo a mutaciones de clientes.
grant insert,update,delete,truncate,references,trigger on public.segments to authenticated;
