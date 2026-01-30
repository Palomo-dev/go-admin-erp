'use client';

import { createSupabaseClient } from '@/lib/supabase/config';

const createClient = () => createSupabaseClient();

/**
 * Servicio para consolidar eventos de asistencia en timesheets
 * Flujo: attendance_events → timesheets
 */

export interface ConsolidationResult {
  employment_id: string;
  employee_name: string;
  work_date: string;
  status: 'created' | 'updated' | 'skipped' | 'error';
  message?: string;
  timesheet_id?: string;
}

export interface ConsolidationSummary {
  total_employees: number;
  created: number;
  updated: number;
  skipped: number;
  errors: number;
  results: ConsolidationResult[];
}

interface AttendanceEvent {
  id: string;
  employment_id: string;
  event_type: string;
  event_at: string;
  is_manual_entry: boolean;
  geo_validated: boolean | null;
  employee_name?: string;
  employee_code?: string | null;
  branch_id?: number | null;
}

interface CountryRules {
  overtime_day_multiplier: number;
  overtime_night_multiplier: number;
  night_surcharge_multiplier: number;
}

interface ShiftAssignment {
  id: string;
  employment_id: string;
  shift_template_id: string;
  work_date: string;
  status: string;
  shift_templates?: {
    start_time: string;
    end_time: string;
    break_minutes: number;
    is_night_shift: boolean;
  };
}

export interface ShiftComparisonResult {
  employment_id: string;
  employee_name: string;
  work_date: string;
  shift_scheduled: boolean;
  shift_start_time: string | null;
  shift_end_time: string | null;
  actual_check_in: string | null;
  actual_check_out: string | null;
  scheduled_minutes: number;
  worked_minutes: number;
  late_minutes: number;
  early_departure_minutes: number;
  overtime_minutes: number;
  night_minutes: number;
  attendance_status: 'on_time' | 'late' | 'absent' | 'incomplete' | 'no_shift' | 'rest_day';
}

export class TimesheetConsolidationService {
  private organizationId: number;
  private standardDailyMinutes: number = 480; // 8 horas por defecto
  private nightStartHour: number = 21; // 9 PM
  private nightEndHour: number = 6; // 6 AM

  constructor(organizationId: number) {
    this.organizationId = organizationId;
  }

  /**
   * Consolida eventos de asistencia de un día específico en timesheets
   */
  async consolidateDay(date: string, branchId?: number): Promise<ConsolidationSummary> {
    const supabase = createClient();
    const results: ConsolidationResult[] = [];

    // 1. Obtener todos los eventos del día
    let query = supabase
      .from('attendance_events')
      .select(`
        *,
        employments!inner(
          id,
          employee_code,
          work_hours_per_week,
          branch_id,
          organization_members!inner(
            profiles!inner(first_name, last_name)
          )
        )
      `)
      .eq('organization_id', this.organizationId)
      .gte('event_at', `${date}T00:00:00`)
      .lte('event_at', `${date}T23:59:59`);

    if (branchId) {
      query = query.eq('branch_id', branchId);
    }

    const { data: events, error } = await query;

    if (error) throw error;

    // 2. Agrupar eventos por empleado
    const eventsByEmployee = this.groupEventsByEmployee(events || []);

    // 3. Procesar cada empleado
    for (const [employmentId, empEvents] of Object.entries(eventsByEmployee)) {
      try {
        const result = await this.processEmployeeDay(employmentId, date, empEvents);
        results.push(result);
      } catch (err: any) {
        const firstEvent = empEvents[0];
        results.push({
          employment_id: employmentId,
          employee_name: firstEvent?.employee_name || 'Desconocido',
          work_date: date,
          status: 'error',
          message: err.message,
        });
      }
    }

    return {
      total_employees: Object.keys(eventsByEmployee).length,
      created: results.filter(r => r.status === 'created').length,
      updated: results.filter(r => r.status === 'updated').length,
      skipped: results.filter(r => r.status === 'skipped').length,
      errors: results.filter(r => r.status === 'error').length,
      results,
    };
  }

  /**
   * Consolida eventos de un rango de fechas
   */
  async consolidateDateRange(
    dateFrom: string,
    dateTo: string,
    branchId?: number
  ): Promise<ConsolidationSummary> {
    const allResults: ConsolidationResult[] = [];
    const startDate = new Date(dateFrom);
    const endDate = new Date(dateTo);

    // Iterar día por día
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split('T')[0];
      const daySummary = await this.consolidateDay(dateStr, branchId);
      allResults.push(...daySummary.results);
    }

    return {
      total_employees: new Set(allResults.map(r => r.employment_id)).size,
      created: allResults.filter(r => r.status === 'created').length,
      updated: allResults.filter(r => r.status === 'updated').length,
      skipped: allResults.filter(r => r.status === 'skipped').length,
      errors: allResults.filter(r => r.status === 'error').length,
      results: allResults,
    };
  }

  /**
   * Procesa los eventos de un empleado para un día específico
   */
  private async processEmployeeDay(
    employmentId: string,
    date: string,
    events: any[]
  ): Promise<ConsolidationResult> {
    const supabase = createClient();

    // Extraer información del empleado
    const firstEvent = events[0];
    const profile = firstEvent?.employments?.organization_members?.profiles;
    const employeeName = profile
      ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim()
      : 'Sin nombre';
    const branchId = firstEvent?.employments?.branch_id || firstEvent?.branch_id;
    const workHoursPerWeek = firstEvent?.employments?.work_hours_per_week || 48;
    const scheduledMinutes = Math.round((workHoursPerWeek / 6) * 60); // Asumiendo 6 días laborales

    // Encontrar check-in y check-out
    const checkInEvent = events
      .filter(e => e.event_type === 'check_in')
      .sort((a, b) => new Date(a.event_at).getTime() - new Date(b.event_at).getTime())[0];

    const checkOutEvent = events
      .filter(e => e.event_type === 'check_out')
      .sort((a, b) => new Date(b.event_at).getTime() - new Date(a.event_at).getTime())[0];

    // Si no hay check-in, saltar
    if (!checkInEvent) {
      return {
        employment_id: employmentId,
        employee_name: employeeName,
        work_date: date,
        status: 'skipped',
        message: 'Sin registro de entrada',
      };
    }

    // Calcular minutos trabajados
    const checkInTime = new Date(checkInEvent.event_at);
    const checkOutTime = checkOutEvent ? new Date(checkOutEvent.event_at) : null;

    let workedMinutes = 0;
    let breakMinutes = 0;
    let nightMinutes = 0;
    let overtimeMinutes = 0;
    let lateMinutes = 0;

    if (checkOutTime) {
      workedMinutes = Math.round((checkOutTime.getTime() - checkInTime.getTime()) / (1000 * 60));

      // Calcular descansos
      breakMinutes = this.calculateBreakMinutes(events);

      // Calcular minutos nocturnos
      nightMinutes = this.calculateNightMinutes(checkInTime, checkOutTime);

      // Calcular horas extras (todo lo que exceda scheduledMinutes)
      const netWorked = workedMinutes - breakMinutes;
      if (netWorked > scheduledMinutes) {
        overtimeMinutes = netWorked - scheduledMinutes;
      }
    }

    const netWorkedMinutes = workedMinutes - breakMinutes;

    // Verificar si el timesheet ya existe
    const { data: existingTimesheet } = await supabase
      .from('timesheets')
      .select('id, status')
      .eq('organization_id', this.organizationId)
      .eq('employment_id', employmentId)
      .eq('work_date', date)
      .single();

    // No actualizar timesheets que ya están aprobados o bloqueados
    if (existingTimesheet && ['approved', 'locked'].includes(existingTimesheet.status)) {
      return {
        employment_id: employmentId,
        employee_name: employeeName,
        work_date: date,
        status: 'skipped',
        message: `Timesheet ya ${existingTimesheet.status === 'approved' ? 'aprobado' : 'bloqueado'}`,
        timesheet_id: existingTimesheet.id,
      };
    }

    const timesheetData = {
      organization_id: this.organizationId,
      branch_id: branchId,
      employment_id: employmentId,
      work_date: date,
      scheduled_minutes: scheduledMinutes,
      worked_minutes: workedMinutes,
      break_minutes: breakMinutes,
      net_worked_minutes: netWorkedMinutes,
      overtime_minutes: overtimeMinutes,
      night_minutes: nightMinutes,
      holiday_minutes: 0, // TODO: Verificar si es festivo
      late_minutes: lateMinutes,
      early_departure_minutes: 0,
      first_check_in: checkInEvent.event_at,
      last_check_out: checkOutEvent?.event_at || null,
      status: checkOutTime ? 'open' : 'open',
      updated_at: new Date().toISOString(),
    };

    if (existingTimesheet) {
      // Actualizar
      const { error: updateError } = await supabase
        .from('timesheets')
        .update(timesheetData)
        .eq('id', existingTimesheet.id);

      if (updateError) throw updateError;

      return {
        employment_id: employmentId,
        employee_name: employeeName,
        work_date: date,
        status: 'updated',
        timesheet_id: existingTimesheet.id,
      };
    } else {
      // Crear nuevo
      const { data: newTimesheet, error: insertError } = await supabase
        .from('timesheets')
        .insert(timesheetData)
        .select('id')
        .single();

      if (insertError) throw insertError;

      return {
        employment_id: employmentId,
        employee_name: employeeName,
        work_date: date,
        status: 'created',
        timesheet_id: newTimesheet.id,
      };
    }
  }

  /**
   * Agrupa eventos por employment_id
   */
  private groupEventsByEmployee(events: any[]): Record<string, any[]> {
    const grouped: Record<string, any[]> = {};

    events.forEach(event => {
      const empId = event.employment_id;
      if (!grouped[empId]) grouped[empId] = [];

      // Enriquecer con datos del empleado
      const profile = event.employments?.organization_members?.profiles;
      event.employee_name = profile
        ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim()
        : 'Sin nombre';
      event.employee_code = event.employments?.employee_code;

      grouped[empId].push(event);
    });

    return grouped;
  }

  /**
   * Calcula minutos de descanso basado en eventos break_start y break_end
   */
  private calculateBreakMinutes(events: any[]): number {
    const breakStarts = events
      .filter(e => e.event_type === 'break_start')
      .sort((a, b) => new Date(a.event_at).getTime() - new Date(b.event_at).getTime());

    const breakEnds = events
      .filter(e => e.event_type === 'break_end')
      .sort((a, b) => new Date(a.event_at).getTime() - new Date(b.event_at).getTime());

    let totalBreakMinutes = 0;

    // Emparejar break_start con break_end
    for (let i = 0; i < Math.min(breakStarts.length, breakEnds.length); i++) {
      const startTime = new Date(breakStarts[i].event_at).getTime();
      const endTime = new Date(breakEnds[i].event_at).getTime();

      if (endTime > startTime) {
        totalBreakMinutes += Math.round((endTime - startTime) / (1000 * 60));
      }
    }

    return totalBreakMinutes;
  }

  /**
   * Calcula minutos trabajados en horario nocturno (9PM - 6AM)
   */
  private calculateNightMinutes(checkIn: Date, checkOut: Date): number {
    let nightMinutes = 0;
    const current = new Date(checkIn);

    while (current < checkOut) {
      const hour = current.getHours();

      // Si está en horario nocturno (21:00 - 06:00)
      if (hour >= this.nightStartHour || hour < this.nightEndHour) {
        nightMinutes++;
      }

      current.setMinutes(current.getMinutes() + 1);
    }

    return nightMinutes;
  }

  /**
   * Obtiene empleados que tienen eventos sin timesheet consolidado
   */
  async getPendingConsolidation(date?: string): Promise<{
    date: string;
    employees_with_events: number;
    employees_with_timesheets: number;
    pending: number;
  }[]> {
    const supabase = createClient();
    const targetDate = date || new Date().toISOString().split('T')[0];

    // Contar empleados con eventos
    const { data: eventsCount } = await supabase
      .from('attendance_events')
      .select('employment_id')
      .eq('organization_id', this.organizationId)
      .gte('event_at', `${targetDate}T00:00:00`)
      .lte('event_at', `${targetDate}T23:59:59`);

    const uniqueEmployeesWithEvents = new Set((eventsCount || []).map(e => e.employment_id)).size;

    // Contar empleados con timesheets
    const { data: timesheetsCount } = await supabase
      .from('timesheets')
      .select('employment_id')
      .eq('organization_id', this.organizationId)
      .eq('work_date', targetDate);

    const uniqueEmployeesWithTimesheets = new Set((timesheetsCount || []).map(t => t.employment_id)).size;

    return [{
      date: targetDate,
      employees_with_events: uniqueEmployeesWithEvents,
      employees_with_timesheets: uniqueEmployeesWithTimesheets,
      pending: uniqueEmployeesWithEvents - uniqueEmployeesWithTimesheets,
    }];
  }

  /**
   * Compara turnos programados vs asistencia real para un día
   * Integra shift_assignments con attendance_events
   */
  async compareShiftsWithAttendance(date: string, branchId?: number): Promise<ShiftComparisonResult[]> {
    const supabase = createClient();
    const results: ShiftComparisonResult[] = [];

    // 1. Obtener turnos programados del día
    let shiftsQuery = supabase
      .from('shift_assignments')
      .select(`
        *,
        shift_templates(start_time, end_time, break_minutes, is_night_shift)
      `)
      .eq('organization_id', this.organizationId)
      .eq('work_date', date)
      .in('status', ['scheduled', 'completed', 'late', 'absent']);

    if (branchId) {
      shiftsQuery = shiftsQuery.eq('branch_id', branchId);
    }

    const { data: shifts, error: shiftsError } = await shiftsQuery;
    if (shiftsError) throw shiftsError;

    // 2. Obtener IDs de empleados con turnos
    const employmentIds = (shifts || []).map(s => s.employment_id);

    // 3. Obtener eventos de asistencia del día para esos empleados
    const { data: events } = await supabase
      .from('attendance_events')
      .select('*')
      .eq('organization_id', this.organizationId)
      .gte('event_at', `${date}T00:00:00`)
      .lte('event_at', `${date}T23:59:59`)
      .in('employment_id', employmentIds.length > 0 ? employmentIds : ['none']);

    // 4. Obtener nombres de empleados
    let employeeNames: Record<string, string> = {};
    if (employmentIds.length > 0) {
      const { data: employments } = await supabase
        .from('employments')
        .select('id, organization_member_id')
        .in('id', employmentIds);

      if (employments) {
        const orgMemberIds = employments.map(e => e.organization_member_id).filter(Boolean);
        const { data: members } = await supabase
          .from('organization_members')
          .select('id, profiles:user_id(first_name, last_name)')
          .in('id', orgMemberIds);

        if (members) {
          const memberNames: Record<number, string> = {};
          members.forEach((m: any) => {
            const profile = m.profiles as { first_name?: string; last_name?: string } | null;
            memberNames[m.id] = profile
              ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || 'Sin nombre'
              : 'Sin nombre';
          });

          employments.forEach(emp => {
            employeeNames[emp.id] = memberNames[emp.organization_member_id] || 'Sin nombre';
          });
        }
      }
    }

    // 5. Agrupar eventos por empleado
    const eventsByEmployee: Record<string, any[]> = {};
    (events || []).forEach(e => {
      if (!eventsByEmployee[e.employment_id]) eventsByEmployee[e.employment_id] = [];
      eventsByEmployee[e.employment_id].push(e);
    });

    // 6. Procesar cada turno
    for (const shift of (shifts || [])) {
      const empEvents = eventsByEmployee[shift.employment_id] || [];
      const template = shift.shift_templates;

      // Encontrar check-in y check-out
      const checkIn = empEvents
        .filter(e => e.event_type === 'check_in')
        .sort((a, b) => new Date(a.event_at).getTime() - new Date(b.event_at).getTime())[0];

      const checkOut = empEvents
        .filter(e => e.event_type === 'check_out')
        .sort((a, b) => new Date(b.event_at).getTime() - new Date(a.event_at).getTime())[0];

      // Calcular minutos programados
      let scheduledMinutes = this.standardDailyMinutes;
      if (template?.start_time && template?.end_time) {
        const [startH, startM] = template.start_time.split(':').map(Number);
        const [endH, endM] = template.end_time.split(':').map(Number);
        scheduledMinutes = (endH * 60 + endM) - (startH * 60 + startM);
        if (scheduledMinutes < 0) scheduledMinutes += 24 * 60; // Turno nocturno
        scheduledMinutes -= (template.break_minutes || 0);
      }

      // Calcular minutos trabajados
      let workedMinutes = 0;
      let lateMinutes = 0;
      let earlyDepartureMinutes = 0;
      let overtimeMinutes = 0;
      let attendanceStatus: ShiftComparisonResult['attendance_status'] = 'absent';

      if (checkIn) {
        const checkInTime = new Date(checkIn.event_at);
        const checkOutTime = checkOut ? new Date(checkOut.event_at) : null;

        if (checkOutTime) {
          workedMinutes = Math.round((checkOutTime.getTime() - checkInTime.getTime()) / (1000 * 60));
          workedMinutes -= (template?.break_minutes || 0);

          // Calcular tardanza
          if (template?.start_time) {
            const [schedH, schedM] = template.start_time.split(':').map(Number);
            const scheduledStart = new Date(checkInTime);
            scheduledStart.setHours(schedH, schedM, 0, 0);

            if (checkInTime > scheduledStart) {
              lateMinutes = Math.round((checkInTime.getTime() - scheduledStart.getTime()) / (1000 * 60));
            }
          }

          // Calcular salida temprana
          if (template?.end_time) {
            const [schedH, schedM] = template.end_time.split(':').map(Number);
            const scheduledEnd = new Date(checkOutTime);
            scheduledEnd.setHours(schedH, schedM, 0, 0);

            if (checkOutTime < scheduledEnd) {
              earlyDepartureMinutes = Math.round((scheduledEnd.getTime() - checkOutTime.getTime()) / (1000 * 60));
            }
          }

          // Calcular horas extras
          if (workedMinutes > scheduledMinutes) {
            overtimeMinutes = workedMinutes - scheduledMinutes;
          }

          // Determinar estado
          if (lateMinutes > 15) {
            attendanceStatus = 'late';
          } else {
            attendanceStatus = 'on_time';
          }
        } else {
          attendanceStatus = 'incomplete';
        }
      }

      // Calcular minutos nocturnos
      let nightMinutes = 0;
      if (checkIn && checkOut) {
        nightMinutes = this.calculateNightMinutes(new Date(checkIn.event_at), new Date(checkOut.event_at));
      }

      results.push({
        employment_id: shift.employment_id,
        employee_name: employeeNames[shift.employment_id] || 'Sin nombre',
        work_date: date,
        shift_scheduled: true,
        shift_start_time: template?.start_time || null,
        shift_end_time: template?.end_time || null,
        actual_check_in: checkIn?.event_at || null,
        actual_check_out: checkOut?.event_at || null,
        scheduled_minutes: scheduledMinutes,
        worked_minutes: workedMinutes,
        late_minutes: lateMinutes,
        early_departure_minutes: earlyDepartureMinutes,
        overtime_minutes: overtimeMinutes,
        night_minutes: nightMinutes,
        attendance_status: attendanceStatus,
      });
    }

    return results;
  }

  /**
   * Consolida un día usando turnos programados como referencia
   */
  async consolidateDayWithShifts(date: string, branchId?: number): Promise<ConsolidationSummary> {
    const supabase = createClient();
    const results: ConsolidationResult[] = [];

    // Obtener comparación de turnos vs asistencia
    const comparisons = await this.compareShiftsWithAttendance(date, branchId);

    for (const comparison of comparisons) {
      try {
        // Verificar si ya existe timesheet
        const { data: existing } = await supabase
          .from('timesheets')
          .select('id, status')
          .eq('organization_id', this.organizationId)
          .eq('employment_id', comparison.employment_id)
          .eq('work_date', date)
          .single();

        if (existing && ['approved', 'locked'].includes(existing.status)) {
          results.push({
            employment_id: comparison.employment_id,
            employee_name: comparison.employee_name,
            work_date: date,
            status: 'skipped',
            message: `Timesheet ya ${existing.status === 'approved' ? 'aprobado' : 'bloqueado'}`,
            timesheet_id: existing.id,
          });
          continue;
        }

        const timesheetData = {
          organization_id: this.organizationId,
          employment_id: comparison.employment_id,
          work_date: date,
          scheduled_minutes: comparison.scheduled_minutes,
          worked_minutes: comparison.worked_minutes,
          break_minutes: 0,
          net_worked_minutes: comparison.worked_minutes,
          overtime_minutes: comparison.overtime_minutes,
          night_minutes: comparison.night_minutes,
          holiday_minutes: 0,
          late_minutes: comparison.late_minutes,
          early_departure_minutes: comparison.early_departure_minutes,
          first_check_in: comparison.actual_check_in,
          last_check_out: comparison.actual_check_out,
          status: comparison.attendance_status === 'absent' ? 'absent' : 'open',
          updated_at: new Date().toISOString(),
        };

        if (existing) {
          await supabase.from('timesheets').update(timesheetData).eq('id', existing.id);
          results.push({
            employment_id: comparison.employment_id,
            employee_name: comparison.employee_name,
            work_date: date,
            status: 'updated',
            timesheet_id: existing.id,
          });
        } else {
          const { data: newTs } = await supabase.from('timesheets').insert(timesheetData).select('id').single();
          results.push({
            employment_id: comparison.employment_id,
            employee_name: comparison.employee_name,
            work_date: date,
            status: 'created',
            timesheet_id: newTs?.id,
          });
        }

        // Actualizar estado del turno
        const shiftStatus = comparison.attendance_status === 'on_time' ? 'completed' 
          : comparison.attendance_status === 'late' ? 'late'
          : comparison.attendance_status === 'absent' ? 'absent' 
          : 'scheduled';

        await supabase
          .from('shift_assignments')
          .update({ status: shiftStatus, updated_at: new Date().toISOString() })
          .eq('employment_id', comparison.employment_id)
          .eq('work_date', date)
          .eq('organization_id', this.organizationId);

      } catch (err: any) {
        results.push({
          employment_id: comparison.employment_id,
          employee_name: comparison.employee_name,
          work_date: date,
          status: 'error',
          message: err.message,
        });
      }
    }

    return {
      total_employees: comparisons.length,
      created: results.filter(r => r.status === 'created').length,
      updated: results.filter(r => r.status === 'updated').length,
      skipped: results.filter(r => r.status === 'skipped').length,
      errors: results.filter(r => r.status === 'error').length,
      results,
    };
  }
}

export default TimesheetConsolidationService;
