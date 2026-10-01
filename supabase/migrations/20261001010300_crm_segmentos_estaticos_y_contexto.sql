-- Segmentos: snapshot estático y contexto paginado para el DSL canónico de Node.
-- No cambia filtros existentes ni materializa audiencias al migrar.
set lock_timeout='2s';
-- Volumen comprobado antes de migrar: ~38.400 clientes y ~4.309 ventas.
-- El lock timeout limita la espera; estos índices sostienen las páginas por id.
create index if not exists crm_customers_segment_cursor on public.customers(organization_id,id);
create index if not exists crm_sales_segment_purchases on public.sales(organization_id,customer_id,sale_date desc)
 where status in('paid','partial','pending');

alter table public.segments add column if not exists members_snapshotted_at timestamptz;
-- now() era constante en toda la transacción: dos guardados podían conservar
-- el mismo token. Solo cambia el trigger de segments, no el helper global.
create or replace function public.fn_crm_touch_updated_at()
returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
 new.updated_at:=greatest(clock_timestamp(),old.updated_at+interval '1 microsecond');
 return new;
end;
$$;
revoke all on function public.fn_crm_touch_updated_at() from public,anon,authenticated;
create or replace trigger set_segments_updated_at before update on public.segments
for each row execute function public.fn_crm_touch_updated_at();

create table if not exists public.segment_members (
 id uuid primary key default gen_random_uuid(),
 organization_id integer not null references public.organizations(id) on delete cascade,
 segment_id uuid not null references public.segments(id) on delete cascade,
 customer_id uuid not null references public.customers(id) on delete cascade,
 created_at timestamptz not null default now(),
 created_by uuid references auth.users(id) on delete set null,
 unique(segment_id,customer_id)
);
create index if not exists crm_segment_members_org_segment on public.segment_members(organization_id,segment_id);
create index if not exists crm_segment_members_customer on public.segment_members(customer_id);
create index if not exists crm_segment_members_author on public.segment_members(created_by) where created_by is not null;
alter table public.segment_members enable row level security;
revoke all on public.segment_members from public,anon,authenticated;
grant select on public.segment_members to authenticated;
grant all on public.segment_members to service_role;
do $$ begin
 if not exists(select 1 from pg_policies where schemaname='public' and tablename='segment_members' and policyname='crm_segment_members_read') then
  create policy crm_segment_members_read on public.segment_members for select to authenticated
  using(public.fn_crm_tiene_permiso(organization_id,'crm.customers.view'));
 end if;
end $$;

insert into public.permissions(code,name,description,module,category)
values('crm.segments.manage','Gestionar segmentos','Crear, editar y guardar miembros estáticos del CRM','crm','segments')
on conflict(code) do nothing;
insert into public.role_permissions(role_id,permission_id,allowed)
select r.id,p.id,true from (values(1),(2),(5)) r(id)
join public.permissions p on p.code='crm.segments.manage'
where not exists(select 1 from public.role_permissions rp where rp.role_id=r.id and rp.permission_id=p.id);

-- Solo el servidor puede aportar el actor; el código de permiso sigue siendo
-- el catálogo canónico (rol/cargo), con pertenencia activa y atajo por id.
create or replace function public.fn_crm_exigir_permiso_actor(p_org integer,p_actor uuid,p_code text)
returns void language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_member public.organization_members;
begin
 perform public.fn_assert_acceso_org(p_org);
 select * into v_member from public.organization_members where organization_id=p_org and user_id=p_actor and is_active;
 if not found or not coalesce(coalesce(v_member.is_super_admin,false) or v_member.role_id in(1,2)
  or public.check_user_permission(p_actor,p_org,p_code),false) then
  raise exception 'sin_permiso' using errcode='42501';
 end if;
end;
$$;
revoke all on function public.fn_crm_exigir_permiso_actor(integer,uuid,text) from public,anon,authenticated;
grant execute on function public.fn_crm_exigir_permiso_actor(integer,uuid,text) to service_role;

create or replace function public.crm_segment_members_guard()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if not exists(select 1 from public.segments s where s.id=new.segment_id and s.organization_id=new.organization_id and s.is_dynamic=false)
  or not exists(select 1 from public.customers c where c.id=new.customer_id and c.organization_id=new.organization_id) then
  raise exception 'miembro_segmento_invalido' using errcode='23514';
 end if;
 return new;
end;
$$;
revoke all on function public.crm_segment_members_guard() from public,anon,authenticated;
do $$ begin
 if not exists(select 1 from pg_trigger where tgname='crm_segment_members_scope' and tgrelid='public.segment_members'::regclass) then
  create trigger crm_segment_members_scope before insert or update on public.segment_members
  for each row execute function public.crm_segment_members_guard();
 end if;
end $$;

-- JSON completo por página evita el límite de filas de PostgREST. Las ventas
-- y categorías se unen con su propia organización, no solo por cliente.
create or replace function public.crm_segment_context_page(
 p_org integer,p_after uuid default null,p_limit integer default 500,
 p_segment uuid default null,p_as_of timestamptz default now(),p_customers uuid[] default null
) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_rows jsonb;
begin
 perform public.fn_crm_exigir_permiso(p_org,array['crm.customers.view']);
 if p_limit is null or p_limit<1 or p_limit>1000 or p_as_of is null or coalesce(cardinality(p_customers),0)>1000 then
  raise exception 'pagina_invalida' using errcode='22023';
 end if;
 if p_segment is not null and not exists(select 1 from public.segments where id=p_segment and organization_id=p_org and is_dynamic=false) then
  raise exception 'segmento_no_encontrado' using errcode='P0002';
 end if;
 with members as materialized (
  select distinct case when original.status='merged' then principal.id else original.id end as id
  from public.segment_members sm
  join public.customers original on original.id=sm.customer_id and original.organization_id=p_org
  left join public.customers principal on principal.organization_id=p_org and principal.status<>'merged'
   and principal.id::text=original.metadata->>'merged_into'
  where sm.organization_id=p_org and sm.segment_id=p_segment
 ), page as materialized (
  select c.* from public.customers c
  where c.organization_id=p_org and c.status<>'merged' and (p_after is null or c.id>p_after)
   and (c.created_at is null or c.created_at<=p_as_of)
   and (p_customers is null or c.id=any(p_customers))
   and (p_segment is null or c.id in(select id from members))
  order by c.id limit p_limit
 ), rows as (
  select c.id,c.full_name,c.email,c.phone,c.city,c.tags,c.status,c.created_at,c.updated_at,
   c.customer_type,c.lifecycle_stage,c.health_score,c.company_size,c.vertical_id,
   c.last_contact_at,c.last_seen_at,c.do_not_call,
   purchase.last_purchase_at,coalesce(purchase.category_ids,'[]'::jsonb) as purchased_category_ids,
   coalesce(consents.states,'{}'::jsonb) as consent,
   coalesce(consents.email_bounced,false) as email_bounced,
   public.fn_can_contact(p_org,c.id,'email','marketing') as can_email,
   public.fn_can_contact(p_org,c.id,'voice','marketing') as can_voice,
   public.fn_can_contact(p_org,c.id,'whatsapp','marketing') as can_whatsapp
  from page c
  left join lateral (
   select max(s.sale_date) as last_purchase_at,
    jsonb_agg(distinct cat.id) filter(where cat.id is not null) as category_ids
   from public.sales s
   left join public.sale_items si on si.sale_id=s.id
   left join public.products p on p.id=si.product_id and p.organization_id=p_org
   left join public.categories cat on cat.id=p.category_id and cat.organization_id=p_org
   where s.organization_id=p_org and s.customer_id=c.id and s.status in('paid','partial','pending') and s.sale_date<=p_as_of
  ) purchase on true
  left join lateral (
   select jsonb_object_agg(cc.channel,cc.status) as states,
    bool_or(cc.channel='email' and cc.status='opted_out' and cc.source='hard_bounce') as email_bounced
   from public.contact_consents cc where cc.organization_id=p_org and cc.customer_id=c.id
  ) consents on true
 ) select coalesce(jsonb_agg(to_jsonb(r) order by r.id),'[]'::jsonb) into v_rows from rows r;
 return v_rows;
end;
$$;
revoke all on function public.crm_segment_context_page(integer,uuid,integer,uuid,timestamptz,uuid[]) from public,anon;
grant execute on function public.crm_segment_context_page(integer,uuid,integer,uuid,timestamptz,uuid[]) to authenticated,service_role;

-- Los teléfonos los normaliza normalizarNumeroRne en Node, una sola lógica.
create or replace function public.crm_segment_excluded_phones(p_org integer,p_phones text[])
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_rows jsonb;
begin
 perform public.fn_crm_exigir_permiso(p_org,array['crm.customers.view']);
 if coalesce(cardinality(p_phones),0)>1000 then raise exception 'lote_invalido' using errcode='22023'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('phone',phone_e164,'source',source)),'[]'::jsonb) into v_rows
 from public.crm_excluded_numbers where organization_id=p_org and phone_e164=any(p_phones);
 return v_rows;
end;
$$;
revoke all on function public.crm_segment_excluded_phones(integer,text[]) from public,anon;
grant execute on function public.crm_segment_excluded_phones(integer,text[]) to authenticated,service_role;

-- Node valida/evalúa el DSL compartido. El RPC privado guarda filtros,
-- conteo y snapshot/auditoría juntos; no acepta el actor desde el navegador.
create or replace function public.crm_save_segment(
 p_org integer,p_actor uuid,p_id uuid,p_name text,p_description text,p_filter jsonb,
 p_dynamic boolean,p_count integer,p_members uuid[],p_expected timestamptz default null
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_old public.segments; v_row public.segments; v_count integer;
begin
 perform public.fn_crm_exigir_permiso_actor(p_org,p_actor,'crm.segments.manage');
 if p_name is null or length(btrim(p_name)) not between 1 and 120 or length(coalesce(p_description,''))>1000
  or p_dynamic is null or p_count is null or p_count<0 or jsonb_typeof(p_filter) not in('object','array')
  or p_filter is null or coalesce(cardinality(p_members),0)>100000 then
  raise exception 'segmento_invalido' using errcode='22023';
 end if;
 if p_id is not null then
  select * into v_old from public.segments where id=p_id and organization_id=p_org for update;
  if not found then raise exception 'segmento_no_encontrado' using errcode='P0002'; end if;
  if v_old.updated_at is distinct from p_expected then raise exception 'registro_cambio' using errcode='40001'; end if;
 end if;
 if not p_dynamic and p_members is null and (v_old.id is null or v_old.is_dynamic is distinct from false) then
  raise exception 'snapshot_requerido' using errcode='22023';
 end if;
 if not p_dynamic and p_members is not null then
  perform id from public.customers where organization_id=p_org and id=any(p_members) order by id for key share;
  select count(distinct c.id) into v_count from unnest(p_members) member(customer_id)
   join public.customers c on c.id=member.customer_id and c.organization_id=p_org and c.status<>'merged';
  if v_count<>cardinality(p_members) then raise exception 'miembro_segmento_invalido' using errcode='23514'; end if;
 elsif not p_dynamic then
  select count(*) into v_count from public.segment_members where segment_id=p_id and organization_id=p_org;
 else v_count:=p_count;
 end if;
 if p_id is null then
  insert into public.segments(organization_id,name,description,filter_json,is_dynamic,customer_count,last_run_at,created_by,members_snapshotted_at)
  values(p_org,btrim(p_name),nullif(btrim(p_description),''),p_filter,p_dynamic,v_count,now(),p_actor,case when not p_dynamic then now() end)
  returning * into v_row;
 else
  update public.segments set name=btrim(p_name),description=nullif(btrim(p_description),''),filter_json=p_filter,
   is_dynamic=p_dynamic,customer_count=v_count,last_run_at=now(),updated_at=clock_timestamp(),
   members_snapshotted_at=case when p_dynamic then null when p_members is not null then now() else members_snapshotted_at end
  where id=p_id and organization_id=p_org returning * into v_row;
 end if;
 if p_dynamic or p_members is not null then
  delete from public.segment_members where segment_id=v_row.id and organization_id=p_org;
  if not p_dynamic then
   insert into public.segment_members(organization_id,segment_id,customer_id,created_by)
   select p_org,v_row.id,member.customer_id,p_actor from unnest(p_members) member(customer_id);
  end if;
 end if;
 insert into public.crm_events(organization_id,event_type,entity_type,entity_id,payload,status,processed_at)
 values(p_org,'segment.saved','segment',v_row.id,jsonb_build_object('actor',p_actor,'dynamic',p_dynamic,'members',v_count,
  'previous_updated_at',v_old.updated_at,'updated_at',v_row.updated_at),'processed',now());
 return to_jsonb(v_row);
end;
$$;
revoke all on function public.crm_save_segment(integer,uuid,uuid,text,text,jsonb,boolean,integer,uuid[],timestamptz) from public,anon,authenticated;
grant execute on function public.crm_save_segment(integer,uuid,uuid,text,text,jsonb,boolean,integer,uuid[],timestamptz) to service_role;
