-- Aprobar un presupuesto. Hasta hoy budgets.status nacía en draft y ninguna pantalla lo cambiaba,
-- así que «solo aprobados» dejaba vacío el presupuesto contra lo real. Exige finance.approve.
create or replace function public.fn_presupuesto_aprobar(p_organization_id integer, p_budget_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
begin
  perform public.fn_assert_acceso_org(p_organization_id);
  if v_uid is not null and not public.fn_tiene_permiso(p_organization_id, 'finance.approve') then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  update public.budgets
     set status = 'approved', approved_by = v_uid, updated_at = now()
   where id = p_budget_id and organization_id = p_organization_id and status = 'draft'
  returning id into v_id;
  if v_id is null then
    raise exception 'presupuesto_no_aprobable' using errcode = '22023';
  end if;
  return jsonb_build_object('id', v_id, 'status', 'approved');
end;
$$;
revoke all on function public.fn_presupuesto_aprobar(integer, uuid) from public, anon;
grant execute on function public.fn_presupuesto_aprobar(integer, uuid) to authenticated, service_role;
