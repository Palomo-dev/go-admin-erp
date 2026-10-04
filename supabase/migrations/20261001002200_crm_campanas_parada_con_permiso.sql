-- Permiso específico para gestionar campañas y parada con motivo dentro de la RPC canónica.
insert into public.permissions(code,module,name,description,category)
select 'crm.campaigns.manage','crm','Gestionar campañas','Crear, modificar, activar y detener campañas','crm'
where not exists(select 1 from public.permissions where code='crm.campaigns.manage');
create or replace function public.fn_stop_voice_campaign(p_org integer,p_campaign uuid,p_reason text)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
begin
 perform public.fn_crm_exigir_permiso(p_org,array['crm.campaigns.manage']);
 if p_reason is null or length(trim(p_reason)) not between 3 and 2000 then
  raise exception 'motivo_invalido' using errcode='22023';
 end if;
 update public.voice_agent_campaigns set emergency_stop=true,status='paused',
  stopped_reason=trim(p_reason),stopped_at=now(),updated_at=now()
 where id=p_campaign and organization_id=p_org;
 return found;
end;
$$;
revoke all on function public.fn_stop_voice_campaign(integer,uuid,text) from public,anon;
grant execute on function public.fn_stop_voice_campaign(integer,uuid,text) to authenticated,service_role;
