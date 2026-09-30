-- Pronósticos: categorías explícitas y ajustes auditados que conservan las oportunidades.
alter table public.opportunities add column if not exists forecast_category text
  check (forecast_category in ('commit','best_case','pipeline','omitted'));
insert into public.permissions(code,module,name,description,category)
select code,'crm',name,description,'crm' from (values
 ('crm.forecast.view_all','Ver pronósticos del equipo','Consultar pronósticos de otros vendedores'),
 ('crm.forecast.adjust','Ajustar pronósticos','Registrar ajustes con motivo y auditoría')
) v(code,name,description) where not exists(select 1 from public.permissions p where p.code=v.code);
create table if not exists public.forecast_adjustments (
  id uuid primary key default gen_random_uuid(),
  organization_id integer not null references public.organizations(id),
  period text not null check(period ~ '^[0-9]{4}-Q[1-4]$'),
  user_id uuid not null references public.profiles(id),
  amount_before numeric not null,
  amount_after numeric not null check(amount_after>=0 and amount_after<>'NaN'::numeric),
  currency text not null,
  reason_code text not null check(reason_code in('verbal_agreement','deal_risk','upside','correction','reversal')),
  reason_text text not null check(length(trim(reason_text)) between 3 and 2000),
  adjusted_by uuid not null references public.profiles(id),
  reverses_id uuid references public.forecast_adjustments(id),
  snapshot_token text not null,
  created_at timestamptz not null default clock_timestamp()
);
create index if not exists forecast_adjustments_org_period_user_idx
  on public.forecast_adjustments(organization_id,period,user_id,created_at desc,id);
alter table public.forecast_adjustments enable row level security;
create policy forecast_adjustments_select on public.forecast_adjustments for select to authenticated
using (exists(select 1 from public.organization_members m where m.organization_id=forecast_adjustments.organization_id and m.user_id=(select auth.uid()) and m.is_active)
  and (user_id=(select auth.uid()) or public.fn_crm_tiene_permiso(organization_id,'crm.forecast.view_all')));
revoke all on public.forecast_adjustments from anon,authenticated;
grant select on public.forecast_adjustments to authenticated;
grant all on public.forecast_adjustments to service_role;

-- Lectura consistente y estrecha: Node agrega con el conversor monetario canónico.
create or replace function public.crm_forecast_snapshot(p_org integer,p_period text,p_user uuid default null,p_team uuid default null)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_all boolean; v_start date; v_end date; v_tz text; v_day date; v_data jsonb;
begin
 perform public.fn_crm_exigir_permiso(p_org,array['crm.opportunities.view']);
 if p_period is null or p_period !~ '^[0-9]{4}-Q[1-4]$' then raise exception 'periodo_invalido' using errcode='22023';end if;
 v_start:=make_date(left(p_period,4)::int,(right(p_period,1)::int-1)*3+1,1);
 v_end:=(v_start+interval '3 months')::date;
 select coalesce(timezone,'America/Bogota') into v_tz from public.organizations where id=p_org;
 v_day:=(now() at time zone v_tz)::date;
 v_all:=auth.uid() is null or public.fn_crm_tiene_permiso(p_org,'crm.forecast.view_all');
 if not v_all then
   if p_user is not null and p_user<>auth.uid() then raise exception 'sin_permiso' using errcode='42501';end if;
   p_user:=auth.uid();
 end if;
 if p_user is not null and not exists(select 1 from public.organization_members where organization_id=p_org and user_id=p_user and is_active)
   then raise exception 'vendedor_no_encontrado' using errcode='P0002';end if;
 if p_team is not null and not exists(select 1 from public.sales_teams where organization_id=p_org and id=p_team and is_active)
   then raise exception 'equipo_no_encontrado' using errcode='P0002';end if;
 with opps as materialized (
  select o.id,o.name,o.salesperson_id,o.amount,o.currency,o.expected_close_date,o.closed_at,o.status,o.updated_at,o.forecast_category,
    s.probability,s.is_won,s.is_lost,s.name as stage_name
  from public.opportunities o join public.stages s on s.id=o.stage_id and s.pipeline_id=o.pipeline_id
    join public.pipelines p on p.id=o.pipeline_id and p.organization_id=p_org
  where o.organization_id=p_org and o.record_type='deal' and (p_user is null or o.salesperson_id=p_user)
    and (p_team is null or exists(select 1 from public.sales_team_members tm where tm.organization_id=p_org and tm.sales_team_id=p_team and tm.user_id=o.salesperson_id and tm.is_active))
    and ((o.status='open' and o.expected_close_date>=v_start and o.expected_close_date<v_end)
      or (o.status='won' and coalesce((o.closed_at at time zone v_tz)::date,o.expected_close_date)>=v_start
        and coalesce((o.closed_at at time zone v_tz)::date,o.expected_close_date)<v_end))
 ), users as (
  select distinct pr.id,pr.first_name,pr.last_name from public.organization_members m join public.profiles pr on pr.id=m.user_id
  where m.organization_id=p_org and m.is_active and (p_user is null or pr.id=p_user)
    and (p_team is null or exists(select 1 from public.sales_team_members tm where tm.organization_id=p_org and tm.sales_team_id=p_team and tm.user_id=pr.id and tm.is_active))
 ) select jsonb_build_object(
  'period',p_period,'start',v_start,'end',v_end,'date',v_day,'timezone',v_tz,'base',public.fn_moneda_base_organizacion(p_org),
  'users',coalesce((select jsonb_agg(to_jsonb(u) order by u.id) from users u),'[]'::jsonb),
  'opportunities',coalesce((select jsonb_agg(to_jsonb(o) order by o.id) from opps o),'[]'::jsonb),
  'targets',coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from public.sales_targets t where t.organization_id=p_org
    and t.target_type='revenue' and t.period in('monthly','quarterly') and t.period_start>=v_start and t.period_end<v_end
    and (p_user is null or t.user_id=p_user) and (p_team is null or t.user_id in(select id from users))),'[]'::jsonb),
  'teamQuotas',coalesce((select jsonb_agg(jsonb_build_object('id',tm.id,'user_id',tm.user_id,'amount',tm.quota_amount,'currency',tm.quota_currency) order by tm.id)
    from public.sales_team_members tm where tm.organization_id=p_org and tm.is_active and tm.quota_amount is not null
    and (p_user is null or tm.user_id=p_user) and (p_team is null or tm.sales_team_id=p_team)),'[]'::jsonb),
  'rates',coalesce((select jsonb_agg(jsonb_build_object('base_currency',r.base_currency,'target_currency',r.target_currency,'rate',r.rate,'effective_date',r.effective_date) order by r.effective_date,r.id)
    from public.exchange_rates r where r.organization_id=p_org and r.effective_date<=v_day),'[]'::jsonb),
  'adjustments',coalesce((select jsonb_agg(to_jsonb(a)||jsonb_build_object('author',concat_ws(' ',pr.first_name,pr.last_name)) order by a.created_at,a.id)
    from public.forecast_adjustments a left join public.profiles pr on pr.id=a.adjusted_by where a.organization_id=p_org and a.period=p_period
      and (p_user is null or a.user_id=p_user) and (p_team is null or a.user_id in(select id from users))),'[]'::jsonb)
 ) into v_data;
 return v_data||jsonb_build_object('snapshotToken',md5((v_data-'users')::text),'canViewAll',v_all,
  'canAdjust',public.fn_crm_tiene_permiso(p_org,'crm.forecast.adjust'),'canEditAny',public.fn_crm_tiene_permiso(p_org,'crm.opportunities.edit_any'),'currentUser',auth.uid());
end; $$;
revoke all on function public.crm_forecast_snapshot(integer,text,uuid,uuid) from public,anon;
grant execute on function public.crm_forecast_snapshot(integer,text,uuid,uuid) to authenticated,service_role;

create or replace function public.crm_set_forecast_category(p_org integer,p_id uuid,p_category text,p_expected_updated_at timestamptz)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_row public.opportunities;
begin
 perform public.fn_crm_exigir_permiso(p_org,array['crm.opportunities.edit','crm.opportunities.edit_any']);
 if p_category is null or p_category not in('commit','best_case','pipeline','omitted') then raise exception 'categoria_invalida' using errcode='22023';end if;
 select * into v_row from public.opportunities where id=p_id and organization_id=p_org for update;
 if not found then raise exception 'oportunidad_no_encontrada' using errcode='P0002';end if;
 if auth.uid() is not null and v_row.salesperson_id is distinct from auth.uid() and not public.fn_crm_tiene_permiso(p_org,'crm.opportunities.edit_any') then raise exception 'sin_permiso' using errcode='42501';end if;
 if v_row.status<>'open' or v_row.record_type<>'deal' then raise exception 'oportunidad_cerrada' using errcode='P0001';end if;
 if p_expected_updated_at is distinct from v_row.updated_at then raise exception 'registro_modificado' using errcode='40001';end if;
 if v_row.forecast_category is not distinct from p_category then return to_jsonb(v_row);end if;
 update public.opportunities set forecast_category=p_category where id=p_id and organization_id=p_org returning * into v_row;
 return to_jsonb(v_row);
end; $$;
revoke all on function public.crm_set_forecast_category(integer,uuid,text,timestamptz) from public,anon;
grant execute on function public.crm_set_forecast_category(integer,uuid,text,timestamptz) to authenticated,service_role;

-- El historial también cubre escrituras directas autorizadas y otros consumidores.
create or replace function public.fn_crm_forecast_category_audit()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if old.forecast_category is not distinct from new.forecast_category then return new;end if;
 perform public.fn_crm_exigir_permiso(old.organization_id,array['crm.opportunities.edit','crm.opportunities.edit_any']);
 if auth.uid() is not null and old.salesperson_id is distinct from auth.uid() and not public.fn_crm_tiene_permiso(old.organization_id,'crm.opportunities.edit_any') then raise exception 'sin_permiso' using errcode='42501';end if;
 if old.status<>'open' or old.record_type<>'deal' then raise exception 'oportunidad_cerrada' using errcode='P0001';end if;
 insert into public.crm_events(organization_id,event_type,entity_type,entity_id,payload,status,processed_at)
 values(old.organization_id,'forecast_category_changed','opportunity',old.id,jsonb_build_object('before',old.forecast_category,'after',new.forecast_category,'applied_by',auth.uid()),'processed',now());
 return new;
end; $$;
revoke all on function public.fn_crm_forecast_category_audit() from public,anon,authenticated;
create trigger trg_crm_forecast_category_audit after update of forecast_category on public.opportunities
for each row execute function public.fn_crm_forecast_category_audit();

-- Solo Node, después de autorizar al actor y calcular amount_before con sumarEnMonedaBase.
-- El token evita guardar una cifra calculada sobre oportunidades/tasas/cuotas que cambiaron.
create or replace function public.crm_record_forecast_adjustment(p_org integer,p_user uuid,p_period text,p_actor uuid,p_before numeric,p_after numeric,p_currency text,p_reason text,p_detail text,p_snapshot text,p_reverses uuid default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_snapshot jsonb; v_row public.forecast_adjustments; v_previous public.forecast_adjustments; v_member public.organization_members;
begin
 if coalesce(auth.role(),'') in('anon','authenticated') or auth.uid() is not null then raise exception 'solo_servidor' using errcode='42501';end if;
 select * into v_member from public.organization_members where organization_id=p_org and user_id=p_actor and is_active;
 if not found or not coalesce((coalesce(v_member.is_super_admin,false) or v_member.role_id in(1,2) or public.check_user_permission(p_actor,p_org,'crm.forecast.adjust')),false) then raise exception 'sin_permiso' using errcode='42501';end if;
 if p_user is null then raise exception 'vendedor_invalido' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_org::text||':'||p_user::text||':'||p_period,0));
 v_snapshot:=public.crm_forecast_snapshot(p_org,p_period,p_user,null);
 if v_snapshot->>'snapshotToken' is distinct from p_snapshot then raise exception 'registro_modificado' using errcode='40001';end if;
 if p_currency is distinct from v_snapshot->>'base' then raise exception 'moneda_invalida' using errcode='22023';end if;
 if p_reverses is not null then
  select * into v_previous from public.forecast_adjustments where organization_id=p_org and user_id=p_user and period=p_period order by created_at desc,id desc limit 1;
  if v_previous.id is distinct from p_reverses or p_reason<>'reversal' then raise exception 'ajuste_no_vigente' using errcode='40001';end if;
 end if;
 insert into public.forecast_adjustments(organization_id,period,user_id,amount_before,amount_after,currency,reason_code,reason_text,adjusted_by,snapshot_token,reverses_id)
 values(p_org,p_period,p_user,p_before,p_after,p_currency,p_reason,p_detail,p_actor,p_snapshot,p_reverses) returning * into v_row;
 return to_jsonb(v_row);
end; $$;
revoke all on function public.crm_record_forecast_adjustment(integer,uuid,text,uuid,numeric,numeric,text,text,text,text,uuid) from public,anon,authenticated;
grant execute on function public.crm_record_forecast_adjustment(integer,uuid,text,uuid,numeric,numeric,text,text,text,text,uuid) to service_role;
