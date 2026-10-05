-- Restituye el comportamiento previo; conserva el catálogo de permisos.
create or replace function public.fn_stop_voice_campaign(p_org integer,p_campaign uuid,p_reason text)
returns boolean language plpgsql security definer set search_path=public as $$
begin
 if (select auth.uid()) is not null and not exists(
  select 1 from public.organization_members m where m.organization_id=p_org and m.user_id=(select auth.uid()) and m.is_active
 ) then raise exception 'no pertenece a la organizacion %',p_org using errcode='42501';end if;
 update public.voice_agent_campaigns set emergency_stop=true,status='paused',stopped_reason=p_reason,stopped_at=now(),updated_at=now()
 where id=p_campaign and organization_id=p_org;
 return found;
end;
$$;
