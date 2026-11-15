-- Revierte HRM fase 0 · paso 9: devuelve las políticas anteriores, tal como
-- estaban el 2026-11-14 antes de aplicar (copiadas de pg_policies).
-- ADVERTENCIA: las políticas anteriores dejan a CUALQUIER miembro leer y cambiar
-- salarios, colillas y préstamos (riesgo R2) y darse acceso a módulos y páginas.
-- Revertir solo si hay una caída; no deshace datos.

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

alter function public.hrm_update_leave_balance_on_request() security invoker;
alter function public.hrm_update_leave_balance_on_request() reset search_path;

create policy attendance_events_delete on public.attendance_events as PERMISSIVE for DELETE to public
  using ((organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = auth.uid()))));
create policy attendance_events_insert on public.attendance_events as PERMISSIVE for INSERT to public
  with check ((organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = auth.uid()))));
create policy attendance_events_select on public.attendance_events as PERMISSIVE for SELECT to public
  using ((organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = auth.uid()))));
create policy attendance_events_update on public.attendance_events as PERMISSIVE for UPDATE to public
  using ((organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = auth.uid()))));
create policy compensation_components_delete on public.compensation_components as PERMISSIVE for DELETE to public
  using ((package_id IN ( SELECT compensation_packages.id
   FROM compensation_packages
  WHERE (compensation_packages.organization_id IN ( SELECT organization_members.organization_id
           FROM organization_members
          WHERE (organization_members.user_id = auth.uid()))))));
create policy compensation_components_insert on public.compensation_components as PERMISSIVE for INSERT to public
  with check ((package_id IN ( SELECT compensation_packages.id
   FROM compensation_packages
  WHERE (compensation_packages.organization_id IN ( SELECT organization_members.organization_id
           FROM organization_members
          WHERE (organization_members.user_id = auth.uid()))))));
create policy compensation_components_select on public.compensation_components as PERMISSIVE for SELECT to public
  using ((package_id IN ( SELECT compensation_packages.id
   FROM compensation_packages
  WHERE (compensation_packages.organization_id IN ( SELECT organization_members.organization_id
           FROM organization_members
          WHERE (organization_members.user_id = auth.uid()))))));
create policy compensation_components_update on public.compensation_components as PERMISSIVE for UPDATE to public
  using ((package_id IN ( SELECT compensation_packages.id
   FROM compensation_packages
  WHERE (compensation_packages.organization_id IN ( SELECT organization_members.organization_id
           FROM organization_members
          WHERE (organization_members.user_id = auth.uid()))))));
create policy compensation_packages_delete on public.compensation_packages as PERMISSIVE for DELETE to public
  using ((organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = auth.uid()))));
create policy compensation_packages_insert on public.compensation_packages as PERMISSIVE for INSERT to public
  with check ((organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = auth.uid()))));
create policy compensation_packages_select on public.compensation_packages as PERMISSIVE for SELECT to public
  using ((organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = auth.uid()))));
create policy compensation_packages_update on public.compensation_packages as PERMISSIVE for UPDATE to public
  using ((organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = auth.uid()))));
create policy departments_delete on public.departments as PERMISSIVE for DELETE to public
  using ((organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = auth.uid()))));
create policy departments_insert on public.departments as PERMISSIVE for INSERT to public
  with check ((organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = auth.uid()))));
create policy departments_select on public.departments as PERMISSIVE for SELECT to public
  using ((organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = auth.uid()))));
create policy departments_update on public.departments as PERMISSIVE for UPDATE to public
  using ((organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = auth.uid()))));
create policy employee_loans_delete on public.employee_loans as PERMISSIVE for DELETE to public
  using ((organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = auth.uid()))));
create policy employee_loans_insert on public.employee_loans as PERMISSIVE for INSERT to public
  with check ((organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = auth.uid()))));
create policy employee_loans_select on public.employee_loans as PERMISSIVE for SELECT to public
  using ((organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = auth.uid()))));
create policy employee_loans_update on public.employee_loans as PERMISSIVE for UPDATE to public
  using ((organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = auth.uid()))));
create policy employment_compensation_delete on public.employment_compensation as PERMISSIVE for DELETE to public
  using ((employment_id IN ( SELECT e.id
   FROM (employments e
     JOIN organization_members om ON ((e.organization_member_id = om.id)))
  WHERE (om.organization_id IN ( SELECT organization_members.organization_id
           FROM organization_members
          WHERE (organization_members.user_id = auth.uid()))))));
create policy employment_compensation_insert on public.employment_compensation as PERMISSIVE for INSERT to public
  with check ((employment_id IN ( SELECT e.id
   FROM (employments e
     JOIN organization_members om ON ((e.organization_member_id = om.id)))
  WHERE (om.organization_id IN ( SELECT organization_members.organization_id
           FROM organization_members
          WHERE (organization_members.user_id = auth.uid()))))));
create policy employment_compensation_select on public.employment_compensation as PERMISSIVE for SELECT to public
  using ((employment_id IN ( SELECT e.id
   FROM (employments e
     JOIN organization_members om ON ((e.organization_member_id = om.id)))
  WHERE (om.organization_id IN ( SELECT organization_members.organization_id
           FROM organization_members
          WHERE (organization_members.user_id = auth.uid()))))));
create policy employment_compensation_update on public.employment_compensation as PERMISSIVE for UPDATE to public
  using ((employment_id IN ( SELECT e.id
   FROM (employments e
     JOIN organization_members om ON ((e.organization_member_id = om.id)))
  WHERE (om.organization_id IN ( SELECT organization_members.organization_id
           FROM organization_members
          WHERE (organization_members.user_id = auth.uid()))))));
create policy employments_delete on public.employments as PERMISSIVE for DELETE to public
  using ((organization_member_id IN ( SELECT om.id
   FROM organization_members om
  WHERE (om.organization_id IN ( SELECT organization_members.organization_id
           FROM organization_members
          WHERE (organization_members.user_id = auth.uid()))))));
create policy employments_insert on public.employments as PERMISSIVE for INSERT to public
  with check ((organization_member_id IN ( SELECT om.id
   FROM organization_members om
  WHERE (om.organization_id IN ( SELECT organization_members.organization_id
           FROM organization_members
          WHERE (organization_members.user_id = auth.uid()))))));
create policy employments_select on public.employments as PERMISSIVE for SELECT to public
  using ((organization_member_id IN ( SELECT om.id
   FROM organization_members om
  WHERE (om.organization_id IN ( SELECT organization_members.organization_id
           FROM organization_members
          WHERE (organization_members.user_id = auth.uid()))))));
create policy employments_update on public.employments as PERMISSIVE for UPDATE to public
  using ((organization_member_id IN ( SELECT om.id
   FROM organization_members om
  WHERE (om.organization_id IN ( SELECT organization_members.organization_id
           FROM organization_members
          WHERE (organization_members.user_id = auth.uid()))))));
create policy job_position_module_access_org_isolation on public.job_position_module_access as PERMISSIVE for ALL to public
  using ((job_position_id IN ( SELECT job_positions.id
   FROM job_positions
  WHERE (job_positions.organization_id IN ( SELECT organization_members.organization_id
           FROM organization_members
          WHERE ((organization_members.user_id = auth.uid()) AND (organization_members.is_active = true)))))));
create policy job_position_page_access_org_isolation on public.job_position_page_access as PERMISSIVE for ALL to public
  using ((job_position_id IN ( SELECT job_positions.id
   FROM job_positions
  WHERE (job_positions.organization_id IN ( SELECT organization_members.organization_id
           FROM organization_members
          WHERE ((organization_members.user_id = auth.uid()) AND (organization_members.is_active = true)))))));
create policy job_positions_delete on public.job_positions as PERMISSIVE for DELETE to public
  using ((organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = auth.uid()))));
create policy job_positions_insert on public.job_positions as PERMISSIVE for INSERT to public
  with check ((organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = auth.uid()))));
create policy job_positions_select on public.job_positions as PERMISSIVE for SELECT to public
  using ((organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = auth.uid()))));
create policy job_positions_update on public.job_positions as PERMISSIVE for UPDATE to public
  using ((organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = auth.uid()))));
create policy leave_balances_delete on public.leave_balances as PERMISSIVE for DELETE to public
  using ((organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = auth.uid()))));
create policy leave_balances_insert on public.leave_balances as PERMISSIVE for INSERT to public
  with check ((organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = auth.uid()))));
create policy leave_balances_select on public.leave_balances as PERMISSIVE for SELECT to public
  using ((organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = auth.uid()))));
create policy leave_balances_update on public.leave_balances as PERMISSIVE for UPDATE to public
  using ((organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = auth.uid()))));
create policy leave_requests_delete on public.leave_requests as PERMISSIVE for DELETE to public
  using ((organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = auth.uid()))));
create policy leave_requests_insert on public.leave_requests as PERMISSIVE for INSERT to public
  with check ((organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = auth.uid()))));
create policy leave_requests_select on public.leave_requests as PERMISSIVE for SELECT to public
  using ((organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = auth.uid()))));
create policy leave_requests_update on public.leave_requests as PERMISSIVE for UPDATE to public
  using ((organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = auth.uid()))));
create policy leave_types_delete on public.leave_types as PERMISSIVE for DELETE to public
  using ((organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = auth.uid()))));
create policy leave_types_insert on public.leave_types as PERMISSIVE for INSERT to public
  with check ((organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = auth.uid()))));
create policy leave_types_select on public.leave_types as PERMISSIVE for SELECT to public
  using ((organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = auth.uid()))));
create policy leave_types_update on public.leave_types as PERMISSIVE for UPDATE to public
  using ((organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = auth.uid()))));
create policy loan_installments_delete on public.loan_installments as PERMISSIVE for DELETE to public
  using ((loan_id IN ( SELECT employee_loans.id
   FROM employee_loans
  WHERE (employee_loans.organization_id IN ( SELECT organization_members.organization_id
           FROM organization_members
          WHERE (organization_members.user_id = auth.uid()))))));
create policy loan_installments_insert on public.loan_installments as PERMISSIVE for INSERT to public
  with check ((loan_id IN ( SELECT employee_loans.id
   FROM employee_loans
  WHERE (employee_loans.organization_id IN ( SELECT organization_members.organization_id
           FROM organization_members
          WHERE (organization_members.user_id = auth.uid()))))));
create policy loan_installments_select on public.loan_installments as PERMISSIVE for SELECT to public
  using ((loan_id IN ( SELECT employee_loans.id
   FROM employee_loans
  WHERE (employee_loans.organization_id IN ( SELECT organization_members.organization_id
           FROM organization_members
          WHERE (organization_members.user_id = auth.uid()))))));
create policy loan_installments_update on public.loan_installments as PERMISSIVE for UPDATE to public
  using ((loan_id IN ( SELECT employee_loans.id
   FROM employee_loans
  WHERE (employee_loans.organization_id IN ( SELECT organization_members.organization_id
           FROM organization_members
          WHERE (organization_members.user_id = auth.uid()))))));
create policy payroll_items_delete on public.payroll_items as PERMISSIVE for DELETE to public
  using ((payroll_slip_id IN ( SELECT ps.id
   FROM ((payroll_slips ps
     JOIN payroll_runs pr ON ((ps.payroll_run_id = pr.id)))
     JOIN payroll_periods pp ON ((pr.payroll_period_id = pp.id)))
  WHERE (pp.organization_id IN ( SELECT organization_members.organization_id
           FROM organization_members
          WHERE (organization_members.user_id = auth.uid()))))));
create policy payroll_items_insert on public.payroll_items as PERMISSIVE for INSERT to public
  with check ((payroll_slip_id IN ( SELECT ps.id
   FROM ((payroll_slips ps
     JOIN payroll_runs pr ON ((ps.payroll_run_id = pr.id)))
     JOIN payroll_periods pp ON ((pr.payroll_period_id = pp.id)))
  WHERE (pp.organization_id IN ( SELECT organization_members.organization_id
           FROM organization_members
          WHERE (organization_members.user_id = auth.uid()))))));
create policy payroll_items_select on public.payroll_items as PERMISSIVE for SELECT to public
  using ((payroll_slip_id IN ( SELECT ps.id
   FROM ((payroll_slips ps
     JOIN payroll_runs pr ON ((ps.payroll_run_id = pr.id)))
     JOIN payroll_periods pp ON ((pr.payroll_period_id = pp.id)))
  WHERE (pp.organization_id IN ( SELECT organization_members.organization_id
           FROM organization_members
          WHERE (organization_members.user_id = auth.uid()))))));
create policy payroll_items_update on public.payroll_items as PERMISSIVE for UPDATE to public
  using ((payroll_slip_id IN ( SELECT ps.id
   FROM ((payroll_slips ps
     JOIN payroll_runs pr ON ((ps.payroll_run_id = pr.id)))
     JOIN payroll_periods pp ON ((pr.payroll_period_id = pp.id)))
  WHERE (pp.organization_id IN ( SELECT organization_members.organization_id
           FROM organization_members
          WHERE (organization_members.user_id = auth.uid()))))));
create policy payroll_periods_delete on public.payroll_periods as PERMISSIVE for DELETE to public
  using ((organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = auth.uid()))));
create policy payroll_periods_insert on public.payroll_periods as PERMISSIVE for INSERT to public
  with check ((organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = auth.uid()))));
create policy payroll_periods_select on public.payroll_periods as PERMISSIVE for SELECT to public
  using ((organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = auth.uid()))));
create policy payroll_periods_update on public.payroll_periods as PERMISSIVE for UPDATE to public
  using ((organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = auth.uid()))));
create policy payroll_runs_delete on public.payroll_runs as PERMISSIVE for DELETE to public
  using ((payroll_period_id IN ( SELECT payroll_periods.id
   FROM payroll_periods
  WHERE (payroll_periods.organization_id IN ( SELECT organization_members.organization_id
           FROM organization_members
          WHERE (organization_members.user_id = auth.uid()))))));
create policy payroll_runs_insert on public.payroll_runs as PERMISSIVE for INSERT to public
  with check ((payroll_period_id IN ( SELECT payroll_periods.id
   FROM payroll_periods
  WHERE (payroll_periods.organization_id IN ( SELECT organization_members.organization_id
           FROM organization_members
          WHERE (organization_members.user_id = auth.uid()))))));
create policy payroll_runs_select on public.payroll_runs as PERMISSIVE for SELECT to public
  using ((payroll_period_id IN ( SELECT payroll_periods.id
   FROM payroll_periods
  WHERE (payroll_periods.organization_id IN ( SELECT organization_members.organization_id
           FROM organization_members
          WHERE (organization_members.user_id = auth.uid()))))));
create policy payroll_runs_update on public.payroll_runs as PERMISSIVE for UPDATE to public
  using ((payroll_period_id IN ( SELECT payroll_periods.id
   FROM payroll_periods
  WHERE (payroll_periods.organization_id IN ( SELECT organization_members.organization_id
           FROM organization_members
          WHERE (organization_members.user_id = auth.uid()))))));
create policy payroll_slips_delete on public.payroll_slips as PERMISSIVE for DELETE to public
  using ((payroll_run_id IN ( SELECT pr.id
   FROM (payroll_runs pr
     JOIN payroll_periods pp ON ((pr.payroll_period_id = pp.id)))
  WHERE (pp.organization_id IN ( SELECT organization_members.organization_id
           FROM organization_members
          WHERE (organization_members.user_id = auth.uid()))))));
create policy payroll_slips_insert on public.payroll_slips as PERMISSIVE for INSERT to public
  with check ((payroll_run_id IN ( SELECT pr.id
   FROM (payroll_runs pr
     JOIN payroll_periods pp ON ((pr.payroll_period_id = pp.id)))
  WHERE (pp.organization_id IN ( SELECT organization_members.organization_id
           FROM organization_members
          WHERE (organization_members.user_id = auth.uid()))))));
create policy payroll_slips_select on public.payroll_slips as PERMISSIVE for SELECT to public
  using ((payroll_run_id IN ( SELECT pr.id
   FROM (payroll_runs pr
     JOIN payroll_periods pp ON ((pr.payroll_period_id = pp.id)))
  WHERE (pp.organization_id IN ( SELECT organization_members.organization_id
           FROM organization_members
          WHERE (organization_members.user_id = auth.uid()))))));
create policy payroll_slips_update on public.payroll_slips as PERMISSIVE for UPDATE to public
  using ((payroll_run_id IN ( SELECT pr.id
   FROM (payroll_runs pr
     JOIN payroll_periods pp ON ((pr.payroll_period_id = pp.id)))
  WHERE (pp.organization_id IN ( SELECT organization_members.organization_id
           FROM organization_members
          WHERE (organization_members.user_id = auth.uid()))))));
create policy shift_assignments_delete on public.shift_assignments as PERMISSIVE for DELETE to public
  using ((organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = auth.uid()))));
create policy shift_assignments_insert on public.shift_assignments as PERMISSIVE for INSERT to public
  with check ((organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = auth.uid()))));
create policy shift_assignments_select on public.shift_assignments as PERMISSIVE for SELECT to public
  using ((organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = auth.uid()))));
create policy shift_assignments_update on public.shift_assignments as PERMISSIVE for UPDATE to public
  using ((organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = auth.uid()))));
create policy shift_rotations_delete on public.shift_rotations as PERMISSIVE for DELETE to public
  using ((organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = auth.uid()))));
create policy shift_rotations_insert on public.shift_rotations as PERMISSIVE for INSERT to public
  with check ((organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = auth.uid()))));
create policy shift_rotations_select on public.shift_rotations as PERMISSIVE for SELECT to public
  using ((organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = auth.uid()))));
create policy shift_rotations_update on public.shift_rotations as PERMISSIVE for UPDATE to public
  using ((organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = auth.uid()))));
create policy shift_templates_delete on public.shift_templates as PERMISSIVE for DELETE to public
  using ((organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = auth.uid()))));
create policy shift_templates_insert on public.shift_templates as PERMISSIVE for INSERT to public
  with check ((organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = auth.uid()))));
create policy shift_templates_select on public.shift_templates as PERMISSIVE for SELECT to public
  using ((organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = auth.uid()))));
create policy shift_templates_update on public.shift_templates as PERMISSIVE for UPDATE to public
  using ((organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = auth.uid()))));
create policy time_clocks_delete on public.time_clocks as PERMISSIVE for DELETE to public
  using ((organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = auth.uid()))));
create policy time_clocks_insert on public.time_clocks as PERMISSIVE for INSERT to public
  with check ((organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = auth.uid()))));
create policy time_clocks_select on public.time_clocks as PERMISSIVE for SELECT to public
  using ((organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = auth.uid()))));
create policy time_clocks_update on public.time_clocks as PERMISSIVE for UPDATE to public
  using ((organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = auth.uid()))));
create policy timesheet_adjustments_delete on public.timesheet_adjustments as PERMISSIVE for DELETE to public
  using ((timesheet_id IN ( SELECT timesheets.id
   FROM timesheets
  WHERE (timesheets.organization_id IN ( SELECT organization_members.organization_id
           FROM organization_members
          WHERE (organization_members.user_id = auth.uid()))))));
create policy timesheet_adjustments_insert on public.timesheet_adjustments as PERMISSIVE for INSERT to public
  with check ((timesheet_id IN ( SELECT timesheets.id
   FROM timesheets
  WHERE (timesheets.organization_id IN ( SELECT organization_members.organization_id
           FROM organization_members
          WHERE (organization_members.user_id = auth.uid()))))));
create policy timesheet_adjustments_select on public.timesheet_adjustments as PERMISSIVE for SELECT to public
  using ((timesheet_id IN ( SELECT timesheets.id
   FROM timesheets
  WHERE (timesheets.organization_id IN ( SELECT organization_members.organization_id
           FROM organization_members
          WHERE (organization_members.user_id = auth.uid()))))));
create policy timesheet_adjustments_update on public.timesheet_adjustments as PERMISSIVE for UPDATE to public
  using ((timesheet_id IN ( SELECT timesheets.id
   FROM timesheets
  WHERE (timesheets.organization_id IN ( SELECT organization_members.organization_id
           FROM organization_members
          WHERE (organization_members.user_id = auth.uid()))))));
create policy timesheets_delete on public.timesheets as PERMISSIVE for DELETE to public
  using ((organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = auth.uid()))));
create policy timesheets_insert on public.timesheets as PERMISSIVE for INSERT to public
  with check ((organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = auth.uid()))));
create policy timesheets_select on public.timesheets as PERMISSIVE for SELECT to public
  using ((organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = auth.uid()))));
create policy timesheets_update on public.timesheets as PERMISSIVE for UPDATE to public
  using ((organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = auth.uid()))));
