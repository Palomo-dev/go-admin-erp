-- RR. HH., fase 3 (nómina): fusión de fn_hr_nomina_embargo_guardar.
-- 20261116223357_hrm_f3_05_nomina_ronda_contador (P20: «incluye_prestaciones») y
-- 20261116223758_hrm_f3_05_nomina_cuentas_contador (C3: documento del demandante o del juzgado) la redefinieron
-- en paralelo; la segunda pisó a la primera. Esta versión lleva las dos cosas.
-- Reversión: supabase/rollbacks/<mismo timestamp>_hrm_f3_06_nomina_embargo_fusion_rollback.sql

create or replace function public.fn_hr_nomina_embargo_guardar(p_actor uuid, p_org integer, p_datos jsonb, p_ip text, p_ua text, p_ruta text)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  e public.employments;
  v_id uuid := nullif(p_datos->>'id', '')::uuid;
  v_prest boolean := coalesce((p_datos->>'incluye_prestaciones')::boolean, false);
begin
  select * into e from public.employments where id = (p_datos->>'vinculo_id')::uuid and organization_id = p_org;
  if not found then
    raise exception 'vinculo_no_existe' using errcode = 'P0002';
  end if;
  if not (public.fn_hr_puede_actor(p_actor, p_org, 'hr.payroll.process')
          and public.fn_hr_actor_puede_grupo(p_actor, p_org, e.person_id, 'salario_pago', 'editar')) then
    perform public.fn_hr_registrar_intento(p_actor, p_org, e.person_id, e.id, 'salario_pago', p_ip, p_ua, p_ruta, '{"accion":"embargo"}'::jsonb);
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  -- Solo un oficio de alimentos o de cooperativa puede incluir las prestaciones (CST 344; P20).
  if v_prest and coalesce(p_datos->>'tipo', '') not in ('alimentos', 'cooperativa') then
    raise exception 'embargo_prestaciones_solo_alimentos_o_cooperativa' using errcode = '22023';
  end if;
  if v_id is null then
    insert into public.hr_garnishments (organization_id, employment_id, kind, received_on, mode, value, total_amount,
                                        starts_on, ends_on, court_reference, beneficiary, beneficiary_doc, base_incluye_prestaciones, created_by)
    values (p_org, e.id, p_datos->>'tipo', (p_datos->>'recibido')::date, p_datos->>'modo', (p_datos->>'valor')::numeric,
            nullif(p_datos->>'total', '')::numeric, coalesce((p_datos->>'desde')::date, (p_datos->>'recibido')::date),
            nullif(p_datos->>'hasta', '')::date, nullif(btrim(p_datos->>'oficio'), ''), nullif(btrim(p_datos->>'beneficiario'), ''),
            nullif(btrim(p_datos->>'beneficiario_doc'), ''), v_prest, p_actor)
    returning id into v_id;
  else
    -- El oficio, el demandante y su documento se pueden completar después (C3: tercero del asiento).
    update public.hr_garnishments
       set status = coalesce(p_datos->>'estado', status), ends_on = coalesce(nullif(p_datos->>'hasta', '')::date, ends_on),
           court_reference = coalesce(nullif(btrim(p_datos->>'oficio'), ''), court_reference),
           beneficiary = coalesce(nullif(btrim(p_datos->>'beneficiario'), ''), beneficiary),
           beneficiary_doc = coalesce(nullif(btrim(p_datos->>'beneficiario_doc'), ''), beneficiary_doc),
           updated_at = now()
     where id = v_id and organization_id = p_org and employment_id = e.id;
    if not found then
      raise exception 'embargo_no_existe' using errcode = 'P0002';
    end if;
  end if;
  perform public.fn_hr_registrar_acceso_interno(p_actor, p_org, e.person_id, e.id, 'salario_pago', 'editar', p_ip, p_ua,
    coalesce(p_ruta, 'rpc:fn_hr_nomina_embargo_guardar'), jsonb_build_object('embargo', v_id));
  return jsonb_build_object('id', v_id);
end;
$$;
revoke execute on function public.fn_hr_nomina_embargo_guardar(uuid, integer, jsonb, text, text, text) from public, anon, authenticated;
