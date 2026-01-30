import { createSupabaseClient } from '@/lib/supabase/config';

const createClient = () => createSupabaseClient();

export interface AttendanceEvent {
  id: string;
  organization_id: number;
  branch_id: number | null;
  employment_id: string;
  event_type: string; // 'check_in' | 'check_out' | 'break_start' | 'break_end'
  event_at: string;
  source: string; // 'qr' | 'geo' | 'manual' | 'biometric' | 'nfc'
  time_clock_id: string | null;
  geo: { lat: number; lng: number } | null;
  geo_validated: boolean | null;
  device_info: Record<string, unknown> | null;
  is_manual_entry: boolean;
  manual_reason: string | null;
  photo_path: string | null;
  created_by: string | null;
  created_at: string;
  // Joined fields
  employee_name?: string;
  employee_code?: string | null;
  branch_name?: string | null;
  time_clock_name?: string | null;
}

export interface AttendanceEventListItem extends AttendanceEvent {
  employee_name: string;
  employee_code: string | null;
  branch_name: string | null;
  time_clock_name: string | null;
}

export interface CreateAttendanceEventDTO {
  employment_id: string;
  event_type: string;
  event_at?: string;
  source: string;
  branch_id?: number;
  time_clock_id?: string;
  geo?: { lat: number; lng: number };
  geo_validated?: boolean;
  is_manual_entry?: boolean;
  manual_reason?: string;
}

export interface AttendanceFilters {
  branchId?: number;
  employmentId?: string;
  eventType?: string;
  source?: string;
  dateFrom?: string;
  dateTo?: string;
  hasAnomaly?: boolean;
}

export interface DailyAttendanceSummary {
  employment_id: string;
  employee_name: string;
  employee_code: string | null;
  branch_name: string | null;
  check_in: AttendanceEvent | null;
  check_out: AttendanceEvent | null;
  breaks: AttendanceEvent[];
  anomalies: string[];
  total_hours: number | null;
}

export class AttendanceService {
  private organizationId: number;

  constructor(organizationId: number) {
    this.organizationId = organizationId;
  }

  async getEvents(filters: AttendanceFilters = {}): Promise<AttendanceEventListItem[]> {
    const supabase = createClient();

    let query = supabase
      .from('attendance_events')
      .select(`
        *,
        employments!inner(
          id,
          employee_code,
          organization_members!inner(
            profiles!inner(first_name, last_name)
          )
        ),
        branches(id, name),
        time_clocks(id, name)
      `)
      .eq('organization_id', this.organizationId)
      .order('event_at', { ascending: false });

    if (filters.branchId) {
      query = query.eq('branch_id', filters.branchId);
    }

    if (filters.employmentId) {
      query = query.eq('employment_id', filters.employmentId);
    }

    if (filters.eventType) {
      query = query.eq('event_type', filters.eventType);
    }

    if (filters.source) {
      query = query.eq('source', filters.source);
    }

    if (filters.dateFrom) {
      query = query.gte('event_at', `${filters.dateFrom}T00:00:00`);
    }

    if (filters.dateTo) {
      query = query.lte('event_at', `${filters.dateTo}T23:59:59`);
    }

    const { data, error } = await query.limit(500);

    if (error) throw error;

    return (data || []).map((item: any) => ({
      ...item,
      employee_name: item.employments?.organization_members?.profiles
        ? `${item.employments.organization_members.profiles.first_name} ${item.employments.organization_members.profiles.last_name}`
        : 'Sin nombre',
      employee_code: item.employments?.employee_code || null,
      branch_name: item.branches?.name || null,
      time_clock_name: item.time_clocks?.name || null,
    }));
  }

  async getTodayEvents(branchId?: number): Promise<AttendanceEventListItem[]> {
    const today = new Date().toISOString().split('T')[0];
    return this.getEvents({
      dateFrom: today,
      dateTo: today,
      branchId,
    });
  }

  async getDailySummary(date: string, branchId?: number): Promise<DailyAttendanceSummary[]> {
    const events = await this.getEvents({
      dateFrom: date,
      dateTo: date,
      branchId,
    });

    // Group by employment_id
    const grouped: Record<string, AttendanceEvent[]> = {};
    events.forEach((e) => {
      if (!grouped[e.employment_id]) grouped[e.employment_id] = [];
      grouped[e.employment_id].push(e);
    });

    const summaries: DailyAttendanceSummary[] = [];

    for (const [employmentId, empEvents] of Object.entries(grouped)) {
      const checkIn = empEvents.find((e) => e.event_type === 'check_in') || null;
      const checkOut = empEvents.find((e) => e.event_type === 'check_out') || null;
      const breaks = empEvents.filter((e) => e.event_type.startsWith('break'));
      
      const anomalies: string[] = [];
      
      // Detect anomalies
      if (checkIn && !checkOut) {
        anomalies.push('Sin salida registrada');
      }
      
      if (empEvents.some((e) => e.geo_validated === false)) {
        anomalies.push('Fuera de geofence');
      }
      
      if (empEvents.some((e) => e.is_manual_entry)) {
        anomalies.push('Entrada manual');
      }

      // Calculate hours
      let totalHours: number | null = null;
      if (checkIn && checkOut) {
        const inTime = new Date(checkIn.event_at).getTime();
        const outTime = new Date(checkOut.event_at).getTime();
        totalHours = (outTime - inTime) / (1000 * 60 * 60);
      }

      const firstEvent = empEvents[0];
      summaries.push({
        employment_id: employmentId,
        employee_name: firstEvent.employee_name || 'Sin nombre',
        employee_code: firstEvent.employee_code || null,
        branch_name: firstEvent.branch_name || null,
        check_in: checkIn,
        check_out: checkOut,
        breaks,
        anomalies,
        total_hours: totalHours,
      });
    }

    return summaries;
  }

  async create(dto: CreateAttendanceEventDTO): Promise<AttendanceEvent> {
    const supabase = createClient();
    const { data: userData } = await supabase.auth.getUser();

    const { data, error } = await supabase
      .from('attendance_events')
      .insert({
        organization_id: this.organizationId,
        employment_id: dto.employment_id,
        event_type: dto.event_type,
        event_at: dto.event_at || new Date().toISOString(),
        source: dto.source,
        branch_id: dto.branch_id || null,
        time_clock_id: dto.time_clock_id || null,
        geo: dto.geo || null,
        geo_validated: dto.geo_validated ?? null,
        is_manual_entry: dto.is_manual_entry ?? false,
        manual_reason: dto.manual_reason || null,
        created_by: userData?.user?.id || null,
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async createManualEntry(
    employmentId: string,
    eventType: string,
    eventAt: string,
    reason: string,
    branchId?: number
  ): Promise<AttendanceEvent> {
    return this.create({
      employment_id: employmentId,
      event_type: eventType,
      event_at: eventAt,
      source: 'manual',
      branch_id: branchId,
      is_manual_entry: true,
      manual_reason: reason,
    });
  }

  async getById(id: string): Promise<AttendanceEvent | null> {
    const supabase = createClient();

    const { data, error } = await supabase
      .from('attendance_events')
      .select(`
        *,
        employments!inner(
          id,
          employee_code,
          organization_members!inner(
            profiles!inner(first_name, last_name)
          )
        ),
        branches(id, name),
        time_clocks(id, name)
      `)
      .eq('id', id)
      .eq('organization_id', this.organizationId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }

    return {
      ...data,
      employee_name: data.employments?.organization_members?.profiles
        ? `${data.employments.organization_members.profiles.first_name} ${data.employments.organization_members.profiles.last_name}`
        : 'Sin nombre',
      employee_code: data.employments?.employee_code || null,
      branch_name: data.branches?.name || null,
      time_clock_name: data.time_clocks?.name || null,
    };
  }

  async getAnomalies(date?: string): Promise<AttendanceEventListItem[]> {
    const targetDate = date || new Date().toISOString().split('T')[0];
    const events = await this.getEvents({
      dateFrom: targetDate,
      dateTo: targetDate,
    });

    return events.filter(
      (e) =>
        e.is_manual_entry ||
        e.geo_validated === false ||
        (e.event_type === 'check_in' && !events.some((o) => o.employment_id === e.employment_id && o.event_type === 'check_out'))
    );
  }

  async getStats(date?: string): Promise<{
    total: number;
    checkIns: number;
    checkOuts: number;
    manual: number;
    geoFailed: number;
    withoutCheckout: number;
  }> {
    const targetDate = date || new Date().toISOString().split('T')[0];
    const events = await this.getEvents({
      dateFrom: targetDate,
      dateTo: targetDate,
    });

    const checkIns = events.filter((e) => e.event_type === 'check_in');
    const checkOuts = events.filter((e) => e.event_type === 'check_out');
    const checkInIds = new Set(checkIns.map((e) => e.employment_id));
    const checkOutIds = new Set(checkOuts.map((e) => e.employment_id));

    return {
      total: events.length,
      checkIns: checkIns.length,
      checkOuts: checkOuts.length,
      manual: events.filter((e) => e.is_manual_entry).length,
      geoFailed: events.filter((e) => e.geo_validated === false).length,
      withoutCheckout: Array.from(checkInIds).filter((id) => !checkOutIds.has(id)).length,
    };
  }

  // Get employees for selector
  async getEmployees(): Promise<{ id: string; name: string; code: string | null }[]> {
    const supabase = createClient();

    const { data, error } = await supabase
      .from('employments')
      .select(`
        id,
        employee_code,
        organization_members!inner(
          organization_id,
          profiles!inner(first_name, last_name)
        )
      `)
      .eq('organization_members.organization_id', this.organizationId)
      .eq('status', 'active');

    if (error) throw error;

    return (data || []).map((item: any) => ({
      id: item.id,
      name: item.organization_members?.profiles
        ? `${item.organization_members.profiles.first_name} ${item.organization_members.profiles.last_name}`
        : 'Sin nombre',
      code: item.employee_code,
    }));
  }

  async getBranches(): Promise<{ id: number; name: string }[]> {
    const supabase = createClient();

    const { data, error } = await supabase
      .from('branches')
      .select('id, name')
      .eq('organization_id', this.organizationId)
      .eq('is_active', true)
      .order('name');

    if (error) throw error;
    return data || [];
  }
}

export default AttendanceService;
