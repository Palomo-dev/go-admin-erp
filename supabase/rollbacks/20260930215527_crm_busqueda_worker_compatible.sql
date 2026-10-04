create or replace function public.crm_start_duplicate_scan(p_org integer) returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_id uuid; v_job uuid;
begin
  perform public.fn_crm_exigir_permiso(p_org,array['crm.customers.merge']);
  if auth.uid() is null then raise exception using errcode='42501',message='sin_sesion'; end if;
  perform pg_advisory_xact_lock(71001,p_org);
  select s.id into v_id from public.customer_duplicate_scans s join public.outbound_jobs j on j.id=s.job_id
    where s.organization_id=p_org and j.organization_id=p_org and j.status in('queued','running') order by s.created_at desc limit 1;
  if v_id is not null then return v_id; end if;
  insert into public.customer_duplicate_scans(organization_id,requested_by) values(p_org,auth.uid()) returning id into v_id;
  v_job:=public.fn_enqueue_job(p_org,'maintenance',jsonb_build_object('operation','crm_duplicate_scan','scan_id',v_id),now(),'crm_duplicate_scan:'||p_org,3);
  update public.customer_duplicate_scans set job_id=v_job where id=v_id and organization_id=p_org;
  return v_id;
end; $$;
revoke all on function public.crm_start_duplicate_scan(integer) from public,anon;
grant execute on function public.crm_start_duplicate_scan(integer) to authenticated;
