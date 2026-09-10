-- Reversión de 20260910210000_go_assistant_f4_adjuntos_y_vision.sql
--
-- AVISO: esto BORRA DATOS. `drop table ai_attachments` se lleva las filas de
-- adjuntos y sus extracciones. Los objetos del bucket NO se borran aquí a
-- propósito: pueden estar enlazados a facturas, y un adjunto de factura tiene
-- obligación fiscal de conservarse (§8.4). Si de verdad hay que vaciar el
-- bucket, hazlo a mano y con la lista de `linked_entity_type is null` delante.

drop policy if exists "Authors and org admins can delete attachments" on public.ai_attachments;
drop policy if exists "Authors can update their own attachments" on public.ai_attachments;
drop policy if exists "Members can create attachments in their organization" on public.ai_attachments;
drop policy if exists "Authors and org admins can view attachments" on public.ai_attachments;

drop index if exists public.ai_attachments_linked_entity_idx;
drop index if exists public.ai_attachments_conversation_idx;
drop index if exists public.ai_attachments_org_created_idx;
drop index if exists public.ai_attachments_storage_path_key;

drop table if exists public.ai_attachments;

drop policy if exists ai_attachments_storage_delete on storage.objects;
drop policy if exists ai_attachments_storage_update on storage.objects;
drop policy if exists ai_attachments_storage_insert on storage.objects;
drop policy if exists ai_attachments_storage_select on storage.objects;

-- El bucket solo se elimina si está vacío; si tiene objetos, `delete` falla por
-- la clave foránea de storage.objects y eso es lo correcto.
delete from storage.buckets where id = 'ai-attachments';
