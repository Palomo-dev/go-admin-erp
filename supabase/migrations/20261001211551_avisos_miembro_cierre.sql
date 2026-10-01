create or replace function public.fn_avisos_miembro_oportunidad()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid;
  v_actor text;
  v_etapa text;
  v_id uuid;
  v_aviso boolean := false;
  v_titulo text;
  v_cuerpo text;
  v_evento text;
  v_motivo text;
begin
  if tg_op = 'INSERT' then
    if new.salesperson_id is not null then
      v_actor_id := auth.uid();
      v_actor := coalesce(public.fn_avisos_miembro_nombre(v_actor_id), 'Alguien de la organización');
      v_id := public.fn_avisos_miembro_poner(
        new.organization_id, new.salesperson_id, v_actor_id,
        'oportunidad.asignada', 'opportunity', new.id,
        'Te asignaron una oportunidad',
        v_actor || ' te asignó la oportunidad «' || new.name || '».',
        '/app/crm/oportunidades/' || new.id::text,
        'oportunidad.asignada:' || new.organization_id::text || ':' || new.id::text || ':' || new.salesperson_id::text || ':' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSUS')
      );
      v_aviso := v_aviso or v_id is not null;
    end if;
  elsif new.salesperson_id is distinct from old.salesperson_id and new.salesperson_id is not null then
    v_actor_id := auth.uid();
    v_actor := coalesce(public.fn_avisos_miembro_nombre(v_actor_id), 'Alguien de la organización');
    v_id := public.fn_avisos_miembro_poner(
      new.organization_id, new.salesperson_id, v_actor_id,
      'oportunidad.asignada', 'opportunity', new.id,
      'Te asignaron una oportunidad',
      v_actor || ' te asignó la oportunidad «' || new.name || '».',
      '/app/crm/oportunidades/' || new.id::text,
      'oportunidad.asignada:' || new.organization_id::text || ':' || new.id::text || ':' || new.salesperson_id::text || ':' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSUS')
    );
    v_aviso := v_aviso or v_id is not null;
  end if;

  if tg_op = 'UPDATE'
     and new.stage_id is distinct from old.stage_id
     and new.salesperson_id is not null
     and not (new.status is distinct from old.status and new.status in ('won', 'lost'))
  then
    v_actor_id := auth.uid();
    v_actor := coalesce(public.fn_avisos_miembro_nombre(v_actor_id), 'Alguien de la organización');
    select s.name into v_etapa from public.stages s where s.id = new.stage_id;
    if v_etapa is null or btrim(v_etapa) = '' then
      v_etapa := 'la nueva etapa';
    end if;
    v_id := public.fn_avisos_miembro_poner(
      new.organization_id, new.salesperson_id, v_actor_id,
      'oportunidad.etapa', 'opportunity', new.id,
      'La oportunidad cambió de etapa',
      '«' || new.name || '» pasó a ' || v_etapa || '. Lo movió ' || v_actor || '.',
      '/app/crm/oportunidades/' || new.id::text,
      'oportunidad.etapa:' || new.organization_id::text || ':' || new.id::text || ':' || new.salesperson_id::text || ':' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSUS')
    );
    v_aviso := v_aviso or v_id is not null;
  end if;

  if tg_op = 'UPDATE'
     and new.status is distinct from old.status
     and new.status in ('won', 'lost')
     and new.salesperson_id is not null
     and exists (
       select 1 from public.organization_modules m
       where m.organization_id = new.organization_id
         and m.module_code = 'crm'
         and m.is_active = true
     )
  then
    v_actor_id := auth.uid();
    v_actor := coalesce(public.fn_avisos_miembro_nombre(v_actor_id), 'Alguien de la organización');
    if new.status = 'won' then
      v_evento := 'oportunidad.ganada';
      v_titulo := 'Se ganó la oportunidad';
      v_cuerpo := v_actor || ' cerró como ganada la oportunidad «' || new.name || '».';
    else
      v_evento := 'oportunidad.perdida';
      v_titulo := 'Se perdió la oportunidad';
      v_cuerpo := v_actor || ' cerró como perdida la oportunidad «' || new.name || '».';
      v_motivo := nullif(btrim(coalesce(new.loss_reason, '')), '');
      if v_motivo is not null then
        v_cuerpo := v_cuerpo || ' Motivo: ' || v_motivo || '.';
      end if;
    end if;
    if new.amount is not null and nullif(btrim(coalesce(new.currency, '')), '') is not null then
      v_cuerpo := v_cuerpo || ' Importe: ' || trim(to_char(new.amount, 'FM999999999990.00')) || ' ' || upper(btrim(new.currency)) || '.';
    end if;
    v_id := public.fn_avisos_miembro_poner(
      new.organization_id, new.salesperson_id, v_actor_id,
      v_evento, 'opportunity', new.id,
      v_titulo, v_cuerpo,
      '/app/crm/oportunidades/' || new.id::text,
      v_evento || ':' || new.organization_id::text || ':' || new.id::text || ':' || new.salesperson_id::text || ':' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSUS')
    );
    v_aviso := v_aviso or v_id is not null;
  end if;

  if v_aviso then
    begin
      perform public.fn_crm_cron_post('/api/cron/avisos-miembro', '{"solo":"correo"}'::jsonb);
    exception when others then
      null;
    end;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_avisos_miembro_oportunidad on public.opportunities;
create trigger trg_avisos_miembro_oportunidad
  after insert or update of salesperson_id, stage_id, status on public.opportunities
  for each row execute function public.fn_avisos_miembro_oportunidad();
