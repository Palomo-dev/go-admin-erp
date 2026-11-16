-- HRM fase 0 · paso 9: RLS nuevas de todas las tablas de HRM (R2, R15). ADR-001 §9.
--
-- Antes: políticas «to public» con membresía anidada, sin (select auth.uid()) y
-- casi sin is_active: cualquier miembro leía y cambiaba salarios, colillas y
-- préstamos, y cualquiera se daba acceso a módulos y páginas por cargo.
-- Ahora: «to authenticated», membresía activa con (select auth.uid()) y permisos
-- por código con fn_hr_orgs_con_permiso (IN (SELECT …) sin correlación, nunca
-- EXISTS anidado). Lo propio (fn_hr_mis_empleos) y el equipo
-- (fn_hr_equipo_empleos) se resuelven con funciones de conjunto.
--
-- Se conserva lo que necesitan el panel del empleado en Inicio (turnoDeHoy),
-- TurnoInicio y /marcar: cada empleado ve lo suyo y marca lo suyo.
-- Los triggers que escriben por el empleado pasan a SECURITY DEFINER.

-- 0. Borra las políticas anteriores de estas tablas (el rollback las recrea tal cual).
do $$
declare
  r record;
begin
  for r in select tablename, policyname from pg_policies
            where schemaname = 'public'
              and tablename in ('employments','departments','job_positions','job_position_module_access','job_position_page_access',
                                'compensation_packages','compensation_components','employment_compensation',
                                'payroll_periods','payroll_runs','payroll_slips','payroll_items',
                                'employee_loans','loan_installments',
                                'attendance_events','timesheets','timesheet_adjustments','shift_assignments',
                                'shift_templates','shift_rotations','time_clocks',
                                'leave_types','leave_requests','leave_balances') loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- Membresía activa de la sesión (forma con JOIN y (select auth.uid())).
-- Se repite literal en cada política para que el planner la hashee una vez.

-- 1. employments: directorio para miembros; escritura con permiso; sin DELETE --------
create policy employments_select on public.employments for select to authenticated
  using (organization_id in (select om.organization_id from public.organization_members om
                              where om.user_id = (select auth.uid()) and om.is_active));
create policy employments_insert on public.employments for insert to authenticated
  with check (organization_id in (select public.fn_hr_orgs_con_permiso('hr.employees.create')));
create policy employments_update on public.employments for update to authenticated
  using (organization_id in (select public.fn_hr_orgs_con_permiso('hr.employees.edit')))
  with check (organization_id in (select public.fn_hr_orgs_con_permiso('hr.employees.edit')));

-- 2. Estructura -------------------------------------------------------------------------
create policy departments_select on public.departments for select to authenticated
  using (organization_id in (select om.organization_id from public.organization_members om
                              where om.user_id = (select auth.uid()) and om.is_active));
create policy departments_write on public.departments for all to authenticated
  using (organization_id in (select public.fn_hr_orgs_con_permiso('hr.departments.manage')))
  with check (organization_id in (select public.fn_hr_orgs_con_permiso('hr.departments.manage')));

create policy job_positions_select on public.job_positions for select to authenticated
  using (organization_id in (select om.organization_id from public.organization_members om
                              where om.user_id = (select auth.uid()) and om.is_active));
create policy job_positions_insert on public.job_positions for insert to authenticated
  with check (organization_id in (select public.fn_hr_orgs_con_permiso('hr.positions.create')));
create policy job_positions_update on public.job_positions for update to authenticated
  using (organization_id in (select public.fn_hr_orgs_con_permiso('hr.positions.edit')))
  with check (organization_id in (select public.fn_hr_orgs_con_permiso('hr.positions.edit')));
create policy job_positions_delete on public.job_positions for delete to authenticated
  using (organization_id in (select public.fn_hr_orgs_con_permiso('hr.positions.delete')));

create policy job_position_module_access_select on public.job_position_module_access for select to authenticated
  using (job_position_id in (select jp.id from public.job_positions jp
                               join public.organization_members om on om.organization_id = jp.organization_id
                              where om.user_id = (select auth.uid()) and om.is_active));
create policy job_position_module_access_write on public.job_position_module_access for all to authenticated
  using (job_position_id in (select jp.id from public.job_positions jp
                              where jp.organization_id in (select public.fn_hr_orgs_con_permiso('hr.positions.edit'))))
  with check (job_position_id in (select jp.id from public.job_positions jp
                              where jp.organization_id in (select public.fn_hr_orgs_con_permiso('hr.positions.edit'))));

create policy job_position_page_access_select on public.job_position_page_access for select to authenticated
  using (job_position_id in (select jp.id from public.job_positions jp
                               join public.organization_members om on om.organization_id = jp.organization_id
                              where om.user_id = (select auth.uid()) and om.is_active));
create policy job_position_page_access_write on public.job_position_page_access for all to authenticated
  using (job_position_id in (select jp.id from public.job_positions jp
                              where jp.organization_id in (select public.fn_hr_orgs_con_permiso('hr.positions.edit'))))
  with check (job_position_id in (select jp.id from public.job_positions jp
                              where jp.organization_id in (select public.fn_hr_orgs_con_permiso('hr.positions.edit'))));

-- 3. Compensación (grupo salario_pago) ----------------------------------------------------
create policy compensation_packages_select on public.compensation_packages for select to authenticated
  using (organization_id in (select public.fn_hr_orgs_con_permiso('hr.data.salario_pago.view')));
create policy compensation_packages_write on public.compensation_packages for all to authenticated
  using (organization_id in (select public.fn_hr_orgs_con_permiso('hr.data.salario_pago.edit')))
  with check (organization_id in (select public.fn_hr_orgs_con_permiso('hr.data.salario_pago.edit')));

create policy compensation_components_select on public.compensation_components for select to authenticated
  using (package_id in (select cp.id from public.compensation_packages cp
                         where cp.organization_id in (select public.fn_hr_orgs_con_permiso('hr.data.salario_pago.view'))));
create policy compensation_components_write on public.compensation_components for all to authenticated
  using (package_id in (select cp.id from public.compensation_packages cp
                         where cp.organization_id in (select public.fn_hr_orgs_con_permiso('hr.data.salario_pago.edit'))))
  with check (package_id in (select cp.id from public.compensation_packages cp
                         where cp.organization_id in (select public.fn_hr_orgs_con_permiso('hr.data.salario_pago.edit'))));

create policy employment_compensation_select on public.employment_compensation for select to authenticated
  using (employment_id in (select e.id from public.employments e
                            where e.organization_id in (select public.fn_hr_orgs_con_permiso('hr.data.salario_pago.view'))));
create policy employment_compensation_write on public.employment_compensation for all to authenticated
  using (employment_id in (select e.id from public.employments e
                            where e.organization_id in (select public.fn_hr_orgs_con_permiso('hr.data.salario_pago.edit'))))
  with check (employment_id in (select e.id from public.employments e
                            where e.organization_id in (select public.fn_hr_orgs_con_permiso('hr.data.salario_pago.edit'))));

-- 4. Nómina -------------------------------------------------------------------------------
create policy payroll_periods_select on public.payroll_periods for select to authenticated
  using (organization_id in (select public.fn_hr_orgs_con_permiso('hr.payroll.view')));
create policy payroll_periods_write on public.payroll_periods for all to authenticated
  using (organization_id in (select public.fn_hr_orgs_con_permiso('hr.payroll.process')))
  with check (organization_id in (select public.fn_hr_orgs_con_permiso('hr.payroll.process')));

create policy payroll_runs_select on public.payroll_runs for select to authenticated
  using (payroll_period_id in (select pp.id from public.payroll_periods pp
                                where pp.organization_id in (select public.fn_hr_orgs_con_permiso('hr.payroll.view'))));
create policy payroll_runs_write on public.payroll_runs for all to authenticated
  using (payroll_period_id in (select pp.id from public.payroll_periods pp
                                where pp.organization_id in (select public.fn_hr_orgs_con_permiso('hr.payroll.process'))))
  with check (payroll_period_id in (select pp.id from public.payroll_periods pp
                                where pp.organization_id in (select public.fn_hr_orgs_con_permiso('hr.payroll.process'))));

-- La colilla propia, solo cuando ya está aprobada o pagada.
create policy payroll_slips_select on public.payroll_slips for select to authenticated
  using (payroll_run_id in (select pr.id from public.payroll_runs pr
                              join public.payroll_periods pp on pp.id = pr.payroll_period_id
                             where pp.organization_id in (select public.fn_hr_orgs_con_permiso('hr.payroll.view')))
         or (status in ('approved','paid') and employment_id in (select public.fn_hr_mis_empleos())));
create policy payroll_slips_write on public.payroll_slips for all to authenticated
  using (payroll_run_id in (select pr.id from public.payroll_runs pr
                              join public.payroll_periods pp on pp.id = pr.payroll_period_id
                             where pp.organization_id in (select public.fn_hr_orgs_con_permiso('hr.payroll.process'))))
  with check (payroll_run_id in (select pr.id from public.payroll_runs pr
                              join public.payroll_periods pp on pp.id = pr.payroll_period_id
                             where pp.organization_id in (select public.fn_hr_orgs_con_permiso('hr.payroll.process'))));

create policy payroll_items_select on public.payroll_items for select to authenticated
  using (payroll_slip_id in (select ps.id from public.payroll_slips ps
                               join public.payroll_runs pr on pr.id = ps.payroll_run_id
                               join public.payroll_periods pp on pp.id = pr.payroll_period_id
                              where pp.organization_id in (select public.fn_hr_orgs_con_permiso('hr.payroll.view')))
         or payroll_slip_id in (select ps.id from public.payroll_slips ps
                                 where ps.status in ('approved','paid') and ps.employment_id in (select public.fn_hr_mis_empleos())));
create policy payroll_items_write on public.payroll_items for all to authenticated
  using (payroll_slip_id in (select ps.id from public.payroll_slips ps
                               join public.payroll_runs pr on pr.id = ps.payroll_run_id
                               join public.payroll_periods pp on pp.id = pr.payroll_period_id
                              where pp.organization_id in (select public.fn_hr_orgs_con_permiso('hr.payroll.process'))))
  with check (payroll_slip_id in (select ps.id from public.payroll_slips ps
                               join public.payroll_runs pr on pr.id = ps.payroll_run_id
                               join public.payroll_periods pp on pp.id = pr.payroll_period_id
                              where pp.organization_id in (select public.fn_hr_orgs_con_permiso('hr.payroll.process'))));

create policy employee_loans_select on public.employee_loans for select to authenticated
  using (organization_id in (select public.fn_hr_orgs_con_permiso('hr.payroll.view'))
         or employment_id in (select public.fn_hr_mis_empleos()));
create policy employee_loans_write on public.employee_loans for all to authenticated
  using (organization_id in (select public.fn_hr_orgs_con_permiso('hr.payroll.process')))
  with check (organization_id in (select public.fn_hr_orgs_con_permiso('hr.payroll.process')));

create policy loan_installments_select on public.loan_installments for select to authenticated
  using (loan_id in (select l.id from public.employee_loans l
                      where l.organization_id in (select public.fn_hr_orgs_con_permiso('hr.payroll.view'))
                         or l.employment_id in (select public.fn_hr_mis_empleos())));
create policy loan_installments_write on public.loan_installments for all to authenticated
  using (loan_id in (select l.id from public.employee_loans l
                      where l.organization_id in (select public.fn_hr_orgs_con_permiso('hr.payroll.process'))))
  with check (loan_id in (select l.id from public.employee_loans l
                      where l.organization_id in (select public.fn_hr_orgs_con_permiso('hr.payroll.process'))));

-- 5. Tiempo y asistencia -------------------------------------------------------------------
create policy attendance_events_select on public.attendance_events for select to authenticated
  using (employment_id in (select public.fn_hr_mis_empleos())
         or organization_id in (select public.fn_hr_orgs_con_permiso('hr.attendance.view'))
         or employment_id in (select public.fn_hr_equipo_empleos('hr.employees.view_team')));
-- /marcar: el empleado inserta SU marcación (el trigger fija organización y hora).
create policy attendance_events_insert on public.attendance_events for insert to authenticated
  with check (employment_id in (select public.fn_hr_mis_empleos())
              or organization_id in (select public.fn_hr_orgs_con_permiso('hr.attendance.manage')));
create policy attendance_events_update on public.attendance_events for update to authenticated
  using (organization_id in (select public.fn_hr_orgs_con_permiso('hr.attendance.manage')))
  with check (organization_id in (select public.fn_hr_orgs_con_permiso('hr.attendance.manage')));
create policy attendance_events_delete on public.attendance_events for delete to authenticated
  using (organization_id in (select public.fn_hr_orgs_con_permiso('hr.attendance.manage')));

create policy timesheets_select on public.timesheets for select to authenticated
  using (employment_id in (select public.fn_hr_mis_empleos())
         or organization_id in (select public.fn_hr_orgs_con_permiso('hr.attendance.view'))
         or employment_id in (select public.fn_hr_equipo_empleos('hr.employees.view_team')));
create policy timesheets_write on public.timesheets for all to authenticated
  using (organization_id in (select public.fn_hr_orgs_con_permiso('hr.attendance.manage')))
  with check (organization_id in (select public.fn_hr_orgs_con_permiso('hr.attendance.manage')));

create policy timesheet_adjustments_select on public.timesheet_adjustments for select to authenticated
  using (timesheet_id in (select t.id from public.timesheets t
                           where t.employment_id in (select public.fn_hr_mis_empleos())
                              or t.organization_id in (select public.fn_hr_orgs_con_permiso('hr.attendance.view'))
                              or t.employment_id in (select public.fn_hr_equipo_empleos('hr.employees.view_team'))));
create policy timesheet_adjustments_insert on public.timesheet_adjustments for insert to authenticated
  with check ((created_by = (select auth.uid())
               and timesheet_id in (select t.id from public.timesheets t where t.employment_id in (select public.fn_hr_mis_empleos())))
              or timesheet_id in (select t.id from public.timesheets t
                                   where t.organization_id in (select public.fn_hr_orgs_con_permiso('hr.attendance.manage'))));
create policy timesheet_adjustments_update on public.timesheet_adjustments for update to authenticated
  using (timesheet_id in (select t.id from public.timesheets t
                           where t.organization_id in (select public.fn_hr_orgs_con_permiso('hr.attendance.manage'))))
  with check (timesheet_id in (select t.id from public.timesheets t
                           where t.organization_id in (select public.fn_hr_orgs_con_permiso('hr.attendance.manage'))));
create policy timesheet_adjustments_delete on public.timesheet_adjustments for delete to authenticated
  using (timesheet_id in (select t.id from public.timesheets t
                           where t.organization_id in (select public.fn_hr_orgs_con_permiso('hr.attendance.manage'))));

create policy shift_assignments_select on public.shift_assignments for select to authenticated
  using (employment_id in (select public.fn_hr_mis_empleos())
         or organization_id in (select public.fn_hr_orgs_con_permiso('hr.attendance.view'))
         or employment_id in (select public.fn_hr_equipo_empleos('hr.employees.view_team')));
create policy shift_assignments_write on public.shift_assignments for all to authenticated
  using (organization_id in (select public.fn_hr_orgs_con_permiso('hr.attendance.manage')))
  with check (organization_id in (select public.fn_hr_orgs_con_permiso('hr.attendance.manage')));

create policy shift_templates_select on public.shift_templates for select to authenticated
  using (organization_id in (select om.organization_id from public.organization_members om
                              where om.user_id = (select auth.uid()) and om.is_active));
create policy shift_templates_write on public.shift_templates for all to authenticated
  using (organization_id in (select public.fn_hr_orgs_con_permiso('hr.attendance.manage')))
  with check (organization_id in (select public.fn_hr_orgs_con_permiso('hr.attendance.manage')));

create policy shift_rotations_select on public.shift_rotations for select to authenticated
  using (organization_id in (select om.organization_id from public.organization_members om
                              where om.user_id = (select auth.uid()) and om.is_active));
create policy shift_rotations_write on public.shift_rotations for all to authenticated
  using (organization_id in (select public.fn_hr_orgs_con_permiso('hr.attendance.manage')))
  with check (organization_id in (select public.fn_hr_orgs_con_permiso('hr.attendance.manage')));

-- /marcar lee el reloj (y hoy compara su token en el navegador: fase 2 lo pasa al servidor).
create policy time_clocks_select on public.time_clocks for select to authenticated
  using (organization_id in (select om.organization_id from public.organization_members om
                              where om.user_id = (select auth.uid()) and om.is_active));
create policy time_clocks_write on public.time_clocks for all to authenticated
  using (organization_id in (select public.fn_hr_orgs_con_permiso('hr.attendance.manage')))
  with check (organization_id in (select public.fn_hr_orgs_con_permiso('hr.attendance.manage')));

-- 6. Ausencias -------------------------------------------------------------------------------
create policy leave_types_select on public.leave_types for select to authenticated
  using (organization_id in (select om.organization_id from public.organization_members om
                              where om.user_id = (select auth.uid()) and om.is_active));
create policy leave_types_write on public.leave_types for all to authenticated
  using (organization_id in (select public.fn_hr_orgs_con_permiso('hr.leaves.approve')))
  with check (organization_id in (select public.fn_hr_orgs_con_permiso('hr.leaves.approve')));

create policy leave_requests_select on public.leave_requests for select to authenticated
  using (employment_id in (select public.fn_hr_mis_empleos())
         or organization_id in (select public.fn_hr_orgs_con_permiso('hr.leaves.view'))
         or organization_id in (select public.fn_hr_orgs_con_permiso('hr.leaves.approve'))
         or employment_id in (select public.fn_hr_equipo_empleos('hr.employees.view_team')));
create policy leave_requests_insert on public.leave_requests for insert to authenticated
  with check ((employment_id in (select public.fn_hr_mis_empleos()) and coalesce(status, 'requested') = 'requested')
              or organization_id in (select public.fn_hr_orgs_con_permiso('hr.leaves.approve')));
-- Lo propio: mientras esté solicitada, y solo para seguir solicitada o cancelarla.
create policy leave_requests_update_propia on public.leave_requests for update to authenticated
  using (employment_id in (select public.fn_hr_mis_empleos()) and status = 'requested')
  with check (employment_id in (select public.fn_hr_mis_empleos()) and status in ('requested','cancelled'));
create policy leave_requests_update_aprobador on public.leave_requests for update to authenticated
  using (organization_id in (select public.fn_hr_orgs_con_permiso('hr.leaves.approve')))
  with check (organization_id in (select public.fn_hr_orgs_con_permiso('hr.leaves.approve')));
create policy leave_requests_delete on public.leave_requests for delete to authenticated
  using (organization_id in (select public.fn_hr_orgs_con_permiso('hr.leaves.approve')));

create policy leave_balances_select on public.leave_balances for select to authenticated
  using (employment_id in (select public.fn_hr_mis_empleos())
         or organization_id in (select public.fn_hr_orgs_con_permiso('hr.leaves.view'))
         or organization_id in (select public.fn_hr_orgs_con_permiso('hr.leaves.approve'))
         or employment_id in (select public.fn_hr_equipo_empleos('hr.employees.view_team')));
create policy leave_balances_write on public.leave_balances for all to authenticated
  using (organization_id in (select public.fn_hr_orgs_con_permiso('hr.leaves.approve')))
  with check (organization_id in (select public.fn_hr_orgs_con_permiso('hr.leaves.approve')));

-- 7. Los triggers que escriben por el empleado ya no dependen de su RLS ---------------------
alter function public.hrm_update_leave_balance_on_request() security definer;
alter function public.hrm_update_leave_balance_on_request() set search_path = public, pg_temp;
revoke execute on function public.hrm_update_leave_balance_on_request() from public, anon, authenticated;

-- Los privilegios de anon no se tocan: con las políticas «to authenticated» anon no
-- ve ninguna fila, y calendar_unified / timeline_unified (security_invoker, con
-- SELECT para anon) siguen respondiendo vacío en vez de 42501.
