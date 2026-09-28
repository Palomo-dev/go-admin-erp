-- Comisiones · lectura por pertenencia, escritura solo por RPC (2026-09-28).
--
-- Hallazgo (docs/hallazgos/comisiones-e-impuestos-2026-09-28.md, «vistos al
-- pasar»): la política commissions_org_member_all (ALL) dejaba a cualquier
-- miembro —un vendedor— cambiar por API el estado o el importe de sus
-- comisiones, y anon/authenticated tenían INSERT/UPDATE/DELETE/TRUNCATE. Las
-- rutas exigen admin/manager; la tabla no.
--
-- Escritores verificados por MCP (prosrc) y en el código antes de cerrar:
--   - SECURITY DEFINER (dueño postgres, no dependen de los GRANT ni de RLS):
--     pos_checkout_v1, pos_anular_venta_v1, fn_factura_venta_guardar,
--     fn_factura_venta_anular, fn_fc_guardar_int, fn_factura_compra_eliminar_borrador,
--     fn_create_commission_on_sale / _on_invoice_sale / _on_invoice_purchase /
--     _on_opportunity_won, fn_comision_oportunidad_devengar (20260928212000).
--     Ninguna función INVOKER ni vista escribe o lee commissions.
--   - Desde Node/navegador (sesión del usuario, dependían del GRANT):
--       · rutas /api/crm/commissions/[id]/pay|reject|clawback y bulk-pay
--         (commissionAdminService.transitionCommission) → fn_comision_aplicar_transicion;
--       · nómina (payrollService.updateSlipStatus, navegador) → fn_comisiones_pagar_por_nomina;
--       · FacturasCompraService.crearFactura (formulario viejo sin importadores;
--         la factura de compra ya devenga en fn_fc_guardar_int) → se quita el INSERT;
--       · paymentService / commissionService.accrueCommission → ya van por
--         fn_comision_oportunidad_devengar (20260928212000).
--   - Otros repositorios (go-admin-super, go-admin-sellers, goadmin-websites) y
--     Edge Functions: no tocan commissions.
--
-- Qué hace:
--   1. fn_comisiones_es_gestor(org): admin (1, 2), manager (5) o superadmin —
--      la misma regla que canManageCommissions de las rutas (por id de rol,
--      resuelta en la base con la sesión).
--   2. Lectura (SELECT, authenticated): miembro activo de la organización y,
--      si no gestiona comisiones, solo las suyas (payee_id = auth.uid()), como
--      ya hace GET /api/crm/commissions. Ven todas: gestores y quien tenga
--      hr.payroll.view / hr.payroll.process (la nómina suma las comisiones de
--      cada empleado) o finance.approve (paga). La restrictiva de sucursal se
--      mantiene.
--   3. Escritura: authenticated solo SELECT; anon nada. Transiciones por
--      fn_comision_aplicar_transicion (gestor; accrued→paid, accrued→cancelled,
--      paid→cancelled; solo status/paid_at/notes/metadata; motivo obligatorio
--      al cancelar; cuenta bancaria de la organización y activa; metadata se
--      fusiona y payroll_slip_id no se puede fijar por aquí — sin él el pago sí
--      genera asiento). Pago por nómina por fn_comisiones_pagar_por_nomina
--      (colilla pagada de la organización, gestor o hr.payroll.process /
--      finance.approve, solo comisiones devengadas del empleado de la colilla).
--
-- Datos medidos: 231 comisiones, todas 'accrued' (0 pagadas o canceladas); 1
-- con updated_at posterior a su alta (organización 132, sigue devengada); 0 de
-- empleados con rol 4; 0 colillas con commission_ids. Sin rastro de escrituras
-- indebidas. Ningún miembro sin rol de gestión tiene hr.payroll.* ni
-- finance.approve hoy.

-- ── 1. ¿Gestiona comisiones? ────────────────────────────────────────────────
create or replace function public.fn_comisiones_es_gestor(p_org integer)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  select exists (
    select 1 from public.organization_members om
     where om.user_id = auth.uid() and om.organization_id = p_org and om.is_active
       and (coalesce(om.is_super_admin, false) or om.role_id in (1, 2, 5)));
$function$;

revoke all on function public.fn_comisiones_es_gestor(integer) from public, anon;
grant execute on function public.fn_comisiones_es_gestor(integer) to authenticated, service_role;

-- Organizaciones donde la sesión ve TODAS las comisiones (para la política).
create or replace function public.fn_comisiones_orgs_ver_todas()
returns setof integer
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  select om.organization_id
    from public.organization_members om
   where om.user_id = auth.uid() and om.is_active
     and (coalesce(om.is_super_admin, false) or om.role_id in (1, 2, 5)
          or public.check_user_permission(om.user_id, om.organization_id, 'hr.payroll.view')
          or public.check_user_permission(om.user_id, om.organization_id, 'hr.payroll.process')
          or public.check_user_permission(om.user_id, om.organization_id, 'finance.approve'));
$function$;

revoke all on function public.fn_comisiones_orgs_ver_todas() from public, anon;
grant execute on function public.fn_comisiones_orgs_ver_todas() to authenticated, service_role;

-- ── 2. Lectura por pertenencia ──────────────────────────────────────────────
drop policy if exists commissions_org_member_all on public.commissions;
drop policy if exists commissions_select on public.commissions;
create policy commissions_select on public.commissions
  for select to authenticated
  using (
    organization_id in (select om.organization_id from public.organization_members om
                         where om.user_id = (select auth.uid()) and om.is_active)
    and (payee_id = (select auth.uid())
         or organization_id in (select public.fn_comisiones_orgs_ver_todas()))
  );

-- ── 3. Escritura solo por RPC ───────────────────────────────────────────────
revoke all on table public.commissions from anon;
revoke insert, update, delete, truncate, references, trigger on table public.commissions from authenticated;
grant select on table public.commissions to authenticated;

-- Transición de estado (rutas de gestión de comisiones). El parche lo arma el
-- servidor con buildTransitionPatch (una sola lógica de transiciones); la base
-- exige gestor, transición válida, campos permitidos y cuenta de la organización.
create or replace function public.fn_comision_aplicar_transicion(
  p_org integer, p_id uuid, p_desde text, p_cambios jsonb)
returns setof public.commissions
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_hacia text := p_cambios->>'status';
  v_clave text;
  v_cuenta text := nullif(btrim(coalesce(p_cambios->'metadata'->>'bank_account_id', '')), '');
begin
  if auth.uid() is null then
    raise exception 'no_autenticado' using errcode = '42501';
  end if;
  if not public.fn_comisiones_es_gestor(p_org) then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  if p_cambios is null or jsonb_typeof(p_cambios) <> 'object'
     or (p_cambios ? 'metadata' and jsonb_typeof(p_cambios->'metadata') <> 'object') then
    raise exception 'cambios_invalidos' using errcode = '22023';
  end if;
  for v_clave in select jsonb_object_keys(p_cambios) loop
    if v_clave not in ('status', 'paid_at', 'notes', 'metadata', 'updated_at') then
      raise exception 'campo_no_permitido' using errcode = '22023', detail = v_clave;
    end if;
  end loop;
  if not ((p_desde = 'accrued' and v_hacia in ('paid', 'cancelled')) or (p_desde = 'paid' and v_hacia = 'cancelled')) then
    raise exception 'transicion_invalida' using errcode = '22023';
  end if;
  if v_hacia = 'cancelled' and coalesce(btrim(p_cambios->>'notes'), '') = '' then
    raise exception 'motivo_obligatorio' using errcode = '22023';
  end if;
  if v_hacia = 'paid' and v_cuenta is not null and not exists (
       select 1 from public.bank_accounts b
        where b.id::text = v_cuenta and b.organization_id = p_org and b.is_active) then
    raise exception 'cuenta_bancaria_invalida' using errcode = '22023';
  end if;

  return query
  update public.commissions c
     set status = v_hacia,
         paid_at = case when p_cambios ? 'paid_at' then (p_cambios->>'paid_at')::timestamptz else c.paid_at end,
         notes = case when p_cambios ? 'notes' then p_cambios->>'notes' else c.notes end,
         metadata = case when p_cambios ? 'metadata'
                         then coalesce(c.metadata, '{}'::jsonb) || ((p_cambios->'metadata') - 'payroll_slip_id')
                         else c.metadata end,
         updated_at = now()
   where c.id = p_id and c.organization_id = p_org and c.status = p_desde
  returning c.*;
end;
$function$;

revoke all on function public.fn_comision_aplicar_transicion(integer, uuid, text, jsonb) from public, anon;
grant execute on function public.fn_comision_aplicar_transicion(integer, uuid, text, jsonb) to authenticated, service_role;

-- Pago por nómina: la colilla pagada marca pagadas sus comisiones devengadas.
create or replace function public.fn_comisiones_pagar_por_nomina(p_slip_id uuid)
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_org integer;
  v_estado text;
  v_ids jsonb;
  v_empleado uuid;
  v_n integer := 0;
begin
  if auth.uid() is null then
    raise exception 'no_autenticado' using errcode = '42501';
  end if;
  select pp.organization_id, s.status, s.metadata->'commission_ids', om.user_id
    into v_org, v_estado, v_ids, v_empleado
    from public.payroll_slips s
    join public.payroll_runs r on r.id = s.payroll_run_id
    join public.payroll_periods pp on pp.id = r.payroll_period_id
    left join public.employments e on e.id = s.employment_id
    left join public.organization_members om on om.id = e.organization_member_id
   where s.id = p_slip_id;
  if not found then
    raise exception 'colilla_no_encontrada' using errcode = 'P0002';
  end if;
  if not public.fn_comisiones_es_gestor(v_org) then
    perform public.fn_finanzas_exigir_permiso(v_org, array['hr.payroll.process', 'finance.approve']);
  end if;
  if v_estado is distinct from 'paid' then
    raise exception 'colilla_no_pagada' using errcode = '22023';
  end if;
  if v_ids is null or jsonb_typeof(v_ids) <> 'array' or v_empleado is null then
    return 0;
  end if;

  -- payroll_slip_id va en la misma escritura: fn_auto_journal_commission no
  -- asienta el pago de una comisión pagada por nómina (lo asienta la nómina).
  update public.commissions c
     set status = 'paid',
         paid_at = now(),
         updated_at = now(),
         metadata = coalesce(c.metadata, '{}'::jsonb) || jsonb_build_object('payroll_slip_id', p_slip_id)
   where c.organization_id = v_org
     and c.status = 'accrued'
     and c.payee_id = v_empleado
     and c.id::text in (select jsonb_array_elements_text(v_ids));
  get diagnostics v_n = row_count;
  return v_n;
end;
$function$;

revoke all on function public.fn_comisiones_pagar_por_nomina(uuid) from public, anon;
grant execute on function public.fn_comisiones_pagar_por_nomina(uuid) to authenticated, service_role;
