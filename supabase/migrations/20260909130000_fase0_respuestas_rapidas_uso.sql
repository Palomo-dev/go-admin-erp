-- =============================================================================
-- Fase 0.5 - Registro de uso de respuestas rapidas
--
-- Problema que resuelve:
--   1. ChatInput.tsx hacia `update({ usage_count: qr.usage_count + 1 || 1 })`.
--      Si usage_count venia undefined -> NaN || 1 -> reescribia el contador a 1.
--   2. conversationDetailService.useQuickReply() llamaba a la RPC con el
--      parametro `reply_id`, pero la firma real es `p_quick_reply_id`: la RPC
--      fallaba SIEMPRE y caia a un fallback invalido
--      (`update({ usage_count: supabase.rpc('usage_count') })`).
--   3. quick_replies_usage nunca se escribia (0 filas).
--
-- Esta RPC hace las tres cosas de una vez y resuelve el miembro desde la sesion,
-- nunca desde el cliente: quick_replies_usage.member_id es NOT NULL y no se
-- puede confiar en un id que venga del navegador.
-- =============================================================================

create or replace function public.register_quick_reply_use(
  p_quick_reply_id uuid,
  p_conversation_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_org integer;
  v_member bigint;
begin
  -- La organizacion sale de la respuesta rapida, no de un parametro.
  select organization_id into v_org
  from quick_replies
  where id = p_quick_reply_id;

  if v_org is null then
    raise exception 'Respuesta rapida no encontrada';
  end if;

  -- El miembro se resuelve desde auth.uid(): esto ademas actua como control de
  -- acceso, porque quien no pertenezca a la organizacion no puede registrar uso.
  select id into v_member
  from organization_members
  where user_id = auth.uid()
    and organization_id = v_org
    and is_active = true
  order by id
  limit 1;

  if v_member is null then
    raise exception 'El usuario no pertenece a la organizacion de la respuesta rapida';
  end if;

  update quick_replies
     set usage_count = coalesce(usage_count, 0) + 1,
         updated_at = now()
   where id = p_quick_reply_id;

  insert into quick_replies_usage (quick_reply_id, member_id, conversation_id)
  values (p_quick_reply_id, v_member, p_conversation_id);
end;
$fn$;

revoke all on function public.register_quick_reply_use(uuid, uuid) from public;
revoke all on function public.register_quick_reply_use(uuid, uuid) from anon;
grant execute on function public.register_quick_reply_use(uuid, uuid) to authenticated;

comment on function public.register_quick_reply_use(uuid, uuid) is
  'Incrementa quick_replies.usage_count y registra la fila en quick_replies_usage. El miembro se deduce de auth.uid().';

create index if not exists quick_replies_usage_reply_used_idx
  on public.quick_replies_usage (quick_reply_id, used_at desc);
