import { supabase } from '@/lib/supabase/config';
import { getOrganizationId, getCurrentBranchId } from '@/lib/hooks/useOrganization';

// ==================== TIPOS ====================

export interface GymClass {
  id: number;
  organization_id: number;
  branch_id: number;
  title: string;
  description?: string;
  class_type: 'spinning' | 'yoga' | 'pilates' | 'crossfit' | 'zumba' | 'boxing' | 'functional' | 'stretching' | 'aerobics' | 'swimming' | 'other';
  instructor_id?: string;
  capacity: number;
  duration_minutes: number;
  start_at: string;
  end_at: string;
  recurrence?: {
    type: 'daily' | 'weekly' | 'monthly';
    days?: number[];
    until?: string;
  };
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
  cancellation_reason?: string;
  notify_on_cancel?: boolean;
  room?: string;
  location?: string;
  equipment_needed?: string;
  difficulty_level?: 'beginner' | 'intermediate' | 'advanced' | 'all_levels';
  created_at: string;
  updated_at: string;
  branches?: { id: number; name: string };
  instructor?: { 
    id: string; 
    user_id: string;
    profiles?: { first_name: string; last_name: string; avatar_url?: string };
  };
  reservations_count?: number;
}

export interface ClassReservation {
  id: number;
  organization_id: number;
  gym_class_id: number;
  customer_id: string;
  membership_id?: number;
  status: 'booked' | 'attended' | 'no_show' | 'cancelled';
  booked_at: string;
  checkin_time?: string;
  cancelled_at?: string;
  cancellation_reason?: string;
  reservation_source?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
  customers?: {
    id: string;
    first_name: string;
    last_name: string;
    email?: string;
    phone?: string;
  };
  gym_classes?: GymClass;
  memberships?: Membership;
}

export interface Instructor {
  id: string;
  user_id: string;
  organization_id: number;
  employment_id?: string;
  employee_code?: string;
  is_active: boolean;
  // Datos de perfil (de profiles)
  profiles?: {
    first_name: string;
    last_name: string;
    email?: string;
    phone?: string;
    avatar_url?: string;
  };
  // Datos de HRM
  position?: {
    id: string;
    code: string;
    name: string;
    requirements?: {
      specialties?: string[];
      certifications?: string[];
      hourly_rate_suggested?: number;
    };
  };
  department?: {
    id: string;
    code: string;
    name: string;
  };
  // Configuración de pago
  salary_period?: 'monthly' | 'biweekly' | 'weekly' | 'daily' | 'hourly';
  base_salary?: number;
  hourly_rate?: number;
  // Estadísticas
  classes_count?: number;
  total_attendance?: number;
  avg_attendance?: number;
}

export interface GymReportStats {
  totalMemberships: number;
  activeMemberships: number;
  renewedThisMonth: number;
  cancelledThisMonth: number;
  churnRate: number;
  retentionRate: number;
  revenueByPlan: { plan_name: string; revenue: number; count: number }[];
  peakHours: { hour: number; checkins: number }[];
  classAttendance: { class_type: string; total: number; attended: number; rate: number }[];
}

export interface GymReportFilters {
  dateFrom: Date;
  dateTo: Date;
  branchId?: number | 'all';
}

export interface MembershipPlan {
  id: number;
  organization_id: number;
  name: string;
  description?: string;
  duration_days: number;
  price: number;
  access_rules?: {
    branches?: number[];
    schedule?: { start: string; end: string }[];
    max_daily_checkins?: number;
  };
  frequency?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Membership {
  id: number;
  organization_id: number;
  customer_id: string;
  membership_plan_id: number;
  start_date: string;
  end_date: string;
  status: 'active' | 'frozen' | 'expired' | 'cancelled';
  sale_id?: string;
  freeze_history?: any[];
  access_code?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
  customers?: {
    id: string;
    first_name: string;
    last_name: string;
    email?: string;
    phone?: string;
    identification_number?: string;
  };
  membership_plans?: MembershipPlan;
}

export interface MemberCheckin {
  id: number;
  organization_id: number;
  customer_id: string;
  branch_id: number;
  membership_id?: number;
  checkin_at: string;
  method?: 'manual' | 'qr' | 'card' | 'biometric';
  denied_reason?: string;
  staff_id?: string;
  class_reservation_id?: number;
  created_at: string;
  updated_at: string;
  customers?: {
    id: string;
    first_name: string;
    last_name: string;
  };
  memberships?: Membership;
}

export interface MembershipFreeze {
  id: string;
  membership_id: number;
  start_date: string;
  end_date?: string;
  reason?: string;
  approved_by?: string;
  status: 'active' | 'ended' | 'cancelled';
  days_frozen: number;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface MembershipEvent {
  id: string;
  membership_id: number;
  event_type: string;
  description?: string;
  old_value?: any;
  new_value?: any;
  performed_by?: string;
  ip_address?: string;
  user_agent?: string;
  metadata?: any;
  created_at: string;
}

export interface GymAccessDevice {
  id: string;
  branch_id: number;
  device_name: string;
  device_type: 'turnstile' | 'scanner' | 'tablet' | 'kiosk' | 'door_lock';
  serial_number?: string;
  location_description?: string;
  ip_address?: string;
  is_active: boolean;
  last_sync_at?: string;
  configuration?: any;
  created_at: string;
  updated_at: string;
}

export interface GymStats {
  activeMemberships: number;
  expiringIn7Days: number;
  expiredMemberships: number;
  todayCheckins: number;
  todayRevenue: number;
  weekRevenue: number;
}

// ==================== PLANES ====================

export async function getPlans(organizationId?: number): Promise<MembershipPlan[]> {
  const orgId = organizationId || getOrganizationId();
  
  const { data, error } = await supabase
    .from('membership_plans')
    .select('*')
    .eq('organization_id', orgId)
    .order('name');

  if (error) {
    console.error('Error obteniendo planes:', error);
    throw error;
  }

  return data || [];
}

export async function getPlanById(planId: number): Promise<MembershipPlan | null> {
  const { data, error } = await supabase
    .from('membership_plans')
    .select('*')
    .eq('id', planId)
    .single();

  if (error) {
    console.error('Error obteniendo plan:', error);
    return null;
  }

  return data;
}

export async function createPlan(plan: Partial<MembershipPlan>): Promise<MembershipPlan> {
  const orgId = getOrganizationId();
  
  const { data, error } = await supabase
    .from('membership_plans')
    .insert({
      ...plan,
      organization_id: orgId,
      is_active: plan.is_active ?? true
    })
    .select()
    .single();

  if (error) {
    console.error('Error creando plan:', error);
    throw error;
  }

  return data;
}

export async function updatePlan(planId: number, updates: Partial<MembershipPlan>): Promise<MembershipPlan> {
  const { data, error } = await supabase
    .from('membership_plans')
    .update({
      ...updates,
      updated_at: new Date().toISOString()
    })
    .eq('id', planId)
    .select()
    .single();

  if (error) {
    console.error('Error actualizando plan:', error);
    throw error;
  }

  return data;
}

export async function togglePlanStatus(planId: number, isActive: boolean): Promise<void> {
  const { error } = await supabase
    .from('membership_plans')
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq('id', planId);

  if (error) {
    console.error('Error cambiando estado del plan:', error);
    throw error;
  }
}

// ==================== MEMBRESÍAS ====================

export async function getMemberships(
  organizationId?: number,
  filters?: {
    status?: string;
    search?: string;
    expiringIn?: number;
  }
): Promise<Membership[]> {
  const orgId = organizationId || getOrganizationId();
  
  let query = supabase
    .from('memberships')
    .select(`
      *,
      customers (id, first_name, last_name, email, phone, identification_number),
      membership_plans (id, name, duration_days, price)
    `)
    .eq('organization_id', orgId)
    .order('end_date', { ascending: true });

  if (filters?.status && filters.status !== 'all') {
    query = query.eq('status', filters.status);
  }

  if (filters?.expiringIn) {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + filters.expiringIn);
    query = query
      .gte('end_date', new Date().toISOString())
      .lte('end_date', futureDate.toISOString())
      .eq('status', 'active');
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error obteniendo membresías:', error);
    throw error;
  }

  let result = data || [];

  if (filters?.search) {
    const search = filters.search.toLowerCase();
    result = result.filter(m => 
      m.customers?.first_name?.toLowerCase().includes(search) ||
      m.customers?.last_name?.toLowerCase().includes(search) ||
      m.customers?.email?.toLowerCase().includes(search) ||
      m.customers?.identification_number?.toLowerCase().includes(search) ||
      m.access_code?.toLowerCase().includes(search)
    );
  }

  return result;
}

export async function getMembershipById(membershipId: number): Promise<Membership | null> {
  const { data, error } = await supabase
    .from('memberships')
    .select(`
      *,
      customers (id, first_name, last_name, email, phone, identification_number),
      membership_plans (*)
    `)
    .eq('id', membershipId)
    .single();

  if (error) {
    console.error('Error obteniendo membresía:', error);
    return null;
  }

  return data;
}

export async function createMembership(membership: Partial<Membership>): Promise<Membership> {
  const orgId = getOrganizationId();
  const accessCode = generateAccessCode();
  
  const { data, error } = await supabase
    .from('memberships')
    .insert({
      ...membership,
      organization_id: orgId,
      status: membership.status || 'active',
      access_code: accessCode
    })
    .select(`
      *,
      customers (id, first_name, last_name, email, phone),
      membership_plans (id, name, duration_days, price)
    `)
    .single();

  if (error) {
    console.error('Error creando membresía:', error);
    throw error;
  }

  await logMembershipEvent(data.id, 'created', 'Membresía creada', null, data);

  return data;
}

export async function updateMembership(membershipId: number, updates: Partial<Membership>): Promise<Membership> {
  const oldData = await getMembershipById(membershipId);
  
  const { data, error } = await supabase
    .from('memberships')
    .update({
      ...updates,
      updated_at: new Date().toISOString()
    })
    .eq('id', membershipId)
    .select(`
      *,
      customers (id, first_name, last_name, email, phone),
      membership_plans (id, name, duration_days, price)
    `)
    .single();

  if (error) {
    console.error('Error actualizando membresía:', error);
    throw error;
  }

  await logMembershipEvent(membershipId, 'notes_updated', 'Membresía actualizada', oldData, data);

  return data;
}

export async function freezeMembership(
  membershipId: number, 
  reason: string, 
  endDate?: string
): Promise<MembershipFreeze> {
  const membership = await getMembershipById(membershipId);
  if (!membership) throw new Error('Membresía no encontrada');

  const { data: freeze, error: freezeError } = await supabase
    .from('membership_freezes')
    .insert({
      membership_id: membershipId,
      start_date: new Date().toISOString().split('T')[0],
      end_date: endDate || null,
      reason,
      status: 'active',
      days_frozen: 0
    })
    .select()
    .single();

  if (freezeError) {
    console.error('Error creando congelamiento:', freezeError);
    throw freezeError;
  }

  const { error: updateError } = await supabase
    .from('memberships')
    .update({ 
      status: 'frozen',
      updated_at: new Date().toISOString()
    })
    .eq('id', membershipId);

  if (updateError) {
    console.error('Error actualizando membresía:', updateError);
    throw updateError;
  }

  await logMembershipEvent(membershipId, 'frozen', `Membresía congelada: ${reason}`, 
    { status: 'active' }, { status: 'frozen', freeze_id: freeze.id });

  return freeze;
}

export async function unfreezeMembership(membershipId: number): Promise<void> {
  const { data: activeFreeze } = await supabase
    .from('membership_freezes')
    .select('*')
    .eq('membership_id', membershipId)
    .eq('status', 'active')
    .single();

  if (activeFreeze) {
    const startDate = new Date(activeFreeze.start_date);
    const endDate = new Date();
    const daysFrozen = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));

    await supabase
      .from('membership_freezes')
      .update({ 
        status: 'ended',
        end_date: endDate.toISOString().split('T')[0],
        days_frozen: daysFrozen,
        updated_at: new Date().toISOString()
      })
      .eq('id', activeFreeze.id);

    const membership = await getMembershipById(membershipId);
    if (membership) {
      const newEndDate = new Date(membership.end_date);
      newEndDate.setDate(newEndDate.getDate() + daysFrozen);

      await supabase
        .from('memberships')
        .update({ 
          status: 'active',
          end_date: newEndDate.toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', membershipId);
    }
  }

  await logMembershipEvent(membershipId, 'unfrozen', 'Membresía descongelada', 
    { status: 'frozen' }, { status: 'active' });
}

export async function cancelMembership(membershipId: number, reason?: string): Promise<void> {
  const { error } = await supabase
    .from('memberships')
    .update({ 
      status: 'cancelled',
      notes: reason,
      updated_at: new Date().toISOString()
    })
    .eq('id', membershipId);

  if (error) {
    console.error('Error cancelando membresía:', error);
    throw error;
  }

  await logMembershipEvent(membershipId, 'cancelled', `Membresía cancelada: ${reason || 'Sin razón'}`, 
    null, { status: 'cancelled' });
}

export async function renewMembership(membershipId: number, planId?: number): Promise<Membership> {
  const membership = await getMembershipById(membershipId);
  if (!membership) throw new Error('Membresía no encontrada');

  const targetPlanId = planId || membership.membership_plan_id;
  const plan = await getPlanById(targetPlanId);
  if (!plan) throw new Error('Plan no encontrado');

  const startDate = new Date();
  const endDate = new Date();
  endDate.setDate(endDate.getDate() + plan.duration_days);

  const { data, error } = await supabase
    .from('memberships')
    .update({
      membership_plan_id: targetPlanId,
      start_date: startDate.toISOString(),
      end_date: endDate.toISOString(),
      status: 'active',
      updated_at: new Date().toISOString()
    })
    .eq('id', membershipId)
    .select(`
      *,
      customers (id, first_name, last_name, email, phone),
      membership_plans (id, name, duration_days, price)
    `)
    .single();

  if (error) {
    console.error('Error renovando membresía:', error);
    throw error;
  }

  await logMembershipEvent(membershipId, 'renewed', 'Membresía renovada', 
    { end_date: membership.end_date }, { end_date: data.end_date });

  return data;
}

// ==================== CHECK-IN ====================

export async function searchMemberForCheckin(
  query: string,
  organizationId?: number
): Promise<Membership[]> {
  const orgId = organizationId || getOrganizationId();
  const search = query.toLowerCase().trim();

  const { data: byCode } = await supabase
    .from('memberships')
    .select(`
      *,
      customers (id, first_name, last_name, email, phone, identification_number),
      membership_plans (id, name, duration_days, price, access_rules)
    `)
    .eq('organization_id', orgId)
    .ilike('access_code', `%${search}%`);

  if (byCode && byCode.length > 0) return byCode;

  const { data: byCustomer } = await supabase
    .from('memberships')
    .select(`
      *,
      customers!inner (id, first_name, last_name, email, phone, identification_number),
      membership_plans (id, name, duration_days, price, access_rules)
    `)
    .eq('organization_id', orgId)
    .or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%,identification_number.ilike.%${search}%`, { foreignTable: 'customers' });

  return byCustomer || [];
}

export async function validateCheckin(
  membershipId: number,
  branchId?: number
): Promise<{ valid: boolean; reason?: string; membership?: Membership }> {
  const membership = await getMembershipById(membershipId);
  if (!membership) {
    return { valid: false, reason: 'Membresía no encontrada' };
  }

  if (membership.status === 'cancelled') {
    return { valid: false, reason: 'Membresía cancelada', membership };
  }

  if (membership.status === 'frozen') {
    return { valid: false, reason: 'Membresía congelada', membership };
  }

  const now = new Date();
  const endDate = new Date(membership.end_date);
  if (now > endDate) {
    return { valid: false, reason: 'Membresía vencida', membership };
  }

  const plan = membership.membership_plans;
  if (plan?.access_rules?.branches && branchId) {
    if (!plan.access_rules.branches.includes(branchId)) {
      return { valid: false, reason: 'Acceso no permitido en esta sede', membership };
    }
  }

  if (plan?.access_rules?.schedule) {
    const currentHour = now.getHours();
    const currentMinutes = now.getMinutes();
    const currentTime = currentHour * 60 + currentMinutes;
    
    const inSchedule = plan.access_rules.schedule.some((slot: { start: string; end: string }) => {
      const [startH, startM] = slot.start.split(':').map(Number);
      const [endH, endM] = slot.end.split(':').map(Number);
      const startTime = startH * 60 + startM;
      const endTime = endH * 60 + endM;
      return currentTime >= startTime && currentTime <= endTime;
    });

    if (!inSchedule) {
      return { valid: false, reason: 'Fuera del horario permitido', membership };
    }
  }

  return { valid: true, membership };
}

export async function registerCheckin(
  membershipId: number,
  method: 'manual' | 'qr' | 'card' | 'biometric' = 'manual',
  branchId?: number
): Promise<MemberCheckin> {
  const orgId = getOrganizationId();
  const branch = branchId || getCurrentBranchId();
  
  const membership = await getMembershipById(membershipId);
  if (!membership) throw new Error('Membresía no encontrada');

  const { data, error } = await supabase
    .from('member_checkins')
    .insert({
      organization_id: orgId,
      customer_id: membership.customer_id,
      branch_id: branch,
      membership_id: membershipId,
      checkin_at: new Date().toISOString(),
      method
    })
    .select(`
      *,
      customers (id, first_name, last_name)
    `)
    .single();

  if (error) {
    console.error('Error registrando check-in:', error);
    throw error;
  }

  await logMembershipEvent(membershipId, 'access_granted', 'Check-in registrado', null, { 
    checkin_id: data.id, 
    method,
    branch_id: branch 
  });

  return data;
}

export async function registerDeniedCheckin(
  membershipId: number,
  reason: string,
  branchId?: number
): Promise<MemberCheckin> {
  const orgId = getOrganizationId();
  const branch = branchId || getCurrentBranchId();
  
  const membership = await getMembershipById(membershipId);
  if (!membership) throw new Error('Membresía no encontrada');

  const { data, error } = await supabase
    .from('member_checkins')
    .insert({
      organization_id: orgId,
      customer_id: membership.customer_id,
      branch_id: branch,
      membership_id: membershipId,
      checkin_at: new Date().toISOString(),
      method: 'manual',
      denied_reason: reason
    })
    .select()
    .single();

  if (error) {
    console.error('Error registrando denegación:', error);
    throw error;
  }

  await logMembershipEvent(membershipId, 'access_denied', `Acceso denegado: ${reason}`, null, { 
    checkin_id: data.id, 
    reason,
    branch_id: branch 
  });

  return data;
}

export async function getTodayCheckins(
  organizationId?: number,
  branchId?: number
): Promise<MemberCheckin[]> {
  const orgId = organizationId || getOrganizationId();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  let query = supabase
    .from('member_checkins')
    .select(`
      *,
      customers (id, first_name, last_name),
      memberships (id, status, membership_plans (name))
    `)
    .eq('organization_id', orgId)
    .gte('checkin_at', today.toISOString())
    .order('checkin_at', { ascending: false });

  if (branchId) {
    query = query.eq('branch_id', branchId);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error obteniendo check-ins de hoy:', error);
    throw error;
  }

  return data || [];
}

// ==================== ESTADÍSTICAS ====================

export async function getGymStats(organizationId?: number): Promise<GymStats> {
  const orgId = organizationId || getOrganizationId();
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const in7Days = new Date(today);
  in7Days.setDate(in7Days.getDate() + 7);
  const weekAgo = new Date(today);
  weekAgo.setDate(weekAgo.getDate() - 7);

  const { data: activeMemberships } = await supabase
    .from('memberships')
    .select('id', { count: 'exact' })
    .eq('organization_id', orgId)
    .eq('status', 'active')
    .gte('end_date', now.toISOString());

  const { data: expiringMemberships } = await supabase
    .from('memberships')
    .select('id', { count: 'exact' })
    .eq('organization_id', orgId)
    .eq('status', 'active')
    .gte('end_date', today.toISOString())
    .lte('end_date', in7Days.toISOString());

  const { data: expiredMemberships } = await supabase
    .from('memberships')
    .select('id', { count: 'exact' })
    .eq('organization_id', orgId)
    .lt('end_date', now.toISOString())
    .neq('status', 'cancelled');

  const { data: todayCheckins } = await supabase
    .from('member_checkins')
    .select('id', { count: 'exact' })
    .eq('organization_id', orgId)
    .gte('checkin_at', today.toISOString())
    .is('denied_reason', null);

  const { data: todayPayments } = await supabase
    .from('payments')
    .select('amount')
    .eq('source', 'membership')
    .gte('created_at', today.toISOString())
    .eq('status', 'completed');

  const { data: weekPayments } = await supabase
    .from('payments')
    .select('amount')
    .eq('source', 'membership')
    .gte('created_at', weekAgo.toISOString())
    .eq('status', 'completed');

  return {
    activeMemberships: activeMemberships?.length || 0,
    expiringIn7Days: expiringMemberships?.length || 0,
    expiredMemberships: expiredMemberships?.length || 0,
    todayCheckins: todayCheckins?.length || 0,
    todayRevenue: todayPayments?.reduce((sum, p) => sum + (p.amount || 0), 0) || 0,
    weekRevenue: weekPayments?.reduce((sum, p) => sum + (p.amount || 0), 0) || 0
  };
}

// ==================== EVENTOS ====================

export async function logMembershipEvent(
  membershipId: number,
  eventType: string,
  description?: string,
  oldValue?: any,
  newValue?: any
): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();

    await supabase
      .from('membership_events')
      .insert({
        membership_id: membershipId,
        event_type: eventType,
        description,
        old_value: oldValue,
        new_value: newValue,
        performed_by: user?.id,
        metadata: {}
      });
  } catch (error) {
    console.error('Error registrando evento:', error);
  }
}

export async function getMembershipEvents(membershipId: number): Promise<MembershipEvent[]> {
  const { data, error } = await supabase
    .from('membership_events')
    .select('*')
    .eq('membership_id', membershipId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error obteniendo eventos:', error);
    return [];
  }

  return data || [];
}

// ==================== CONGELAMIENTOS ====================

export async function getMembershipFreezes(membershipId: number): Promise<MembershipFreeze[]> {
  const { data, error } = await supabase
    .from('membership_freezes')
    .select('*')
    .eq('membership_id', membershipId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error obteniendo congelamientos:', error);
    return [];
  }

  return data || [];
}

// ==================== DISPOSITIVOS ====================

export async function getAccessDevices(branchId?: number): Promise<GymAccessDevice[]> {
  let query = supabase
    .from('gym_access_devices')
    .select('*')
    .order('device_name');

  if (branchId) {
    query = query.eq('branch_id', branchId);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error obteniendo dispositivos:', error);
    return [];
  }

  return data || [];
}

export async function createAccessDevice(device: Partial<GymAccessDevice>): Promise<GymAccessDevice> {
  const { data, error } = await supabase
    .from('gym_access_devices')
    .insert(device)
    .select()
    .single();

  if (error) {
    console.error('Error creando dispositivo:', error);
    throw error;
  }

  return data;
}

// ==================== UTILIDADES ====================

function generateAccessCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export function getDaysRemaining(endDate: string): number {
  const end = new Date(endDate);
  const now = new Date();
  const diff = end.getTime() - now.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

export function getMembershipStatusColor(status: string): string {
  switch (status) {
    case 'active': return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400';
    case 'frozen': return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400';
    case 'expired': return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
    case 'cancelled': return 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400';
    default: return 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400';
  }
}

export function getMembershipStatusLabel(status: string): string {
  switch (status) {
    case 'active': return 'Activa';
    case 'frozen': return 'Congelada';
    case 'expired': return 'Vencida';
    case 'cancelled': return 'Cancelada';
    default: return status;
  }
}

// ==================== CLASES ====================

export async function getClasses(
  organizationId?: number,
  filters?: {
    branchId?: number;
    status?: string;
    classType?: string;
    instructorId?: string;
    dateFrom?: string;
    dateTo?: string;
  }
): Promise<GymClass[]> {
  const orgId = organizationId || getOrganizationId();
  
  let query = supabase
    .from('gym_classes')
    .select(`
      *,
      branches (id, name)
    `)
    .eq('organization_id', orgId)
    .order('start_at', { ascending: true });

  if (filters?.branchId) {
    query = query.eq('branch_id', filters.branchId);
  }

  if (filters?.status && filters.status !== 'all') {
    query = query.eq('status', filters.status);
  }

  if (filters?.classType && filters.classType !== 'all') {
    query = query.eq('class_type', filters.classType);
  }

  if (filters?.instructorId) {
    query = query.eq('instructor_id', filters.instructorId);
  }

  if (filters?.dateFrom) {
    query = query.gte('start_at', filters.dateFrom);
  }

  if (filters?.dateTo) {
    query = query.lte('start_at', filters.dateTo);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error obteniendo clases:', error);
    throw error;
  }

  return data || [];
}

export async function getClassById(classId: number): Promise<GymClass | null> {
  const { data, error } = await supabase
    .from('gym_classes')
    .select(`
      *,
      branches (id, name)
    `)
    .eq('id', classId)
    .single();

  if (error) {
    console.error('Error obteniendo clase:', error);
    return null;
  }

  return data;
}

export async function createClass(gymClass: Partial<GymClass>): Promise<GymClass> {
  const orgId = getOrganizationId();
  const branchId = gymClass.branch_id || getCurrentBranchId();
  
  const { data, error } = await supabase
    .from('gym_classes')
    .insert({
      ...gymClass,
      organization_id: orgId,
      branch_id: branchId,
      status: gymClass.status || 'scheduled'
    })
    .select(`
      *,
      branches (id, name)
    `)
    .single();

  if (error) {
    console.error('Error creando clase:', error);
    throw error;
  }

  return data;
}

export async function updateClass(classId: number, updates: Partial<GymClass>): Promise<GymClass> {
  const { data, error } = await supabase
    .from('gym_classes')
    .update({
      ...updates,
      updated_at: new Date().toISOString()
    })
    .eq('id', classId)
    .select(`
      *,
      branches (id, name)
    `)
    .single();

  if (error) {
    console.error('Error actualizando clase:', error);
    throw error;
  }

  return data;
}

export async function deleteClass(classId: number): Promise<void> {
  const { error } = await supabase
    .from('gym_classes')
    .delete()
    .eq('id', classId);

  if (error) {
    console.error('Error eliminando clase:', error);
    throw error;
  }
}

export async function cancelClass(classId: number, reason: string, notifyMembers: boolean = false): Promise<void> {
  const { error } = await supabase
    .from('gym_classes')
    .update({ 
      status: 'cancelled',
      cancellation_reason: reason,
      notify_on_cancel: notifyMembers,
      updated_at: new Date().toISOString()
    })
    .eq('id', classId);

  if (error) {
    console.error('Error cancelando clase:', error);
    throw error;
  }
}

export async function duplicateClass(classId: number, newDate: string): Promise<GymClass> {
  const original = await getClassById(classId);
  if (!original) throw new Error('Clase no encontrada');

  const startAt = new Date(newDate);
  const originalStart = new Date(original.start_at);
  startAt.setHours(originalStart.getHours(), originalStart.getMinutes());

  const endAt = new Date(startAt);
  endAt.setMinutes(endAt.getMinutes() + (original.duration_minutes || 60));

  const { id, created_at, updated_at, branches, instructor, reservations_count, ...classData } = original;
  
  return createClass({
    ...classData,
    start_at: startAt.toISOString(),
    end_at: endAt.toISOString(),
    status: 'scheduled'
  });
}

// ==================== RESERVACIONES ====================

export async function getReservations(
  organizationId?: number,
  filters?: {
    classId?: number;
    customerId?: string;
    status?: string;
    dateFrom?: string;
    dateTo?: string;
  }
): Promise<ClassReservation[]> {
  const orgId = organizationId || getOrganizationId();
  
  let query = supabase
    .from('class_reservations')
    .select(`
      *,
      customers (id, first_name, last_name, email, phone),
      gym_classes (id, title, class_type, start_at, end_at, capacity, branch_id, branches (name))
    `)
    .eq('organization_id', orgId)
    .order('booked_at', { ascending: false });

  if (filters?.classId) {
    query = query.eq('gym_class_id', filters.classId);
  }

  if (filters?.customerId) {
    query = query.eq('customer_id', filters.customerId);
  }

  if (filters?.status && filters.status !== 'all') {
    query = query.eq('status', filters.status);
  }

  if (filters?.dateFrom) {
    query = query.gte('booked_at', filters.dateFrom);
  }

  if (filters?.dateTo) {
    query = query.lte('booked_at', filters.dateTo);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error obteniendo reservaciones:', error);
    throw error;
  }

  return data || [];
}

export async function getReservationsByClass(classId: number): Promise<ClassReservation[]> {
  const { data, error } = await supabase
    .from('class_reservations')
    .select(`
      *,
      customers (id, first_name, last_name, email, phone)
    `)
    .eq('gym_class_id', classId)
    .neq('status', 'cancelled')
    .order('booked_at', { ascending: true });

  if (error) {
    console.error('Error obteniendo reservaciones de clase:', error);
    throw error;
  }

  return data || [];
}

export async function createReservation(reservation: Partial<ClassReservation>): Promise<ClassReservation> {
  const orgId = getOrganizationId();
  
  const { data, error } = await supabase
    .from('class_reservations')
    .insert({
      ...reservation,
      organization_id: orgId,
      status: reservation.status || 'booked',
      booked_at: new Date().toISOString()
    })
    .select(`
      *,
      customers (id, first_name, last_name, email, phone),
      gym_classes (id, title, class_type, start_at, end_at)
    `)
    .single();

  if (error) {
    console.error('Error creando reservación:', error);
    throw error;
  }

  return data;
}

export async function updateReservation(reservationId: number, updates: Partial<ClassReservation>): Promise<ClassReservation> {
  const { data, error } = await supabase
    .from('class_reservations')
    .update({
      ...updates,
      updated_at: new Date().toISOString()
    })
    .eq('id', reservationId)
    .select(`
      *,
      customers (id, first_name, last_name, email, phone),
      gym_classes (id, title, class_type, start_at, end_at)
    `)
    .single();

  if (error) {
    console.error('Error actualizando reservación:', error);
    throw error;
  }

  return data;
}

export async function cancelReservation(reservationId: number, reason?: string): Promise<void> {
  const { error } = await supabase
    .from('class_reservations')
    .update({ 
      status: 'cancelled',
      cancelled_at: new Date().toISOString(),
      cancellation_reason: reason,
      updated_at: new Date().toISOString()
    })
    .eq('id', reservationId);

  if (error) {
    console.error('Error cancelando reservación:', error);
    throw error;
  }
}

export async function markAttendance(reservationId: number, attended: boolean): Promise<void> {
  const { error } = await supabase
    .from('class_reservations')
    .update({ 
      status: attended ? 'attended' : 'no_show',
      checkin_time: attended ? new Date().toISOString() : null,
      updated_at: new Date().toISOString()
    })
    .eq('id', reservationId);

  if (error) {
    console.error('Error marcando asistencia:', error);
    throw error;
  }
}

export async function getClassOccupancy(classId: number): Promise<{ reserved: number; capacity: number; available: number }> {
  const gymClass = await getClassById(classId);
  if (!gymClass) throw new Error('Clase no encontrada');

  const { count, error } = await supabase
    .from('class_reservations')
    .select('id', { count: 'exact' })
    .eq('gym_class_id', classId)
    .neq('status', 'cancelled');

  if (error) {
    console.error('Error obteniendo ocupación:', error);
    throw error;
  }

  const reserved = count || 0;
  return {
    reserved,
    capacity: gymClass.capacity,
    available: gymClass.capacity - reserved
  };
}

// ==================== INSTRUCTORES ====================

/**
 * Obtiene instructores del gimnasio usando HRM.
 * Filtra empleados que pertenecen al departamento GYM o tienen posición de instructor (INST-*).
 * Incluye datos de perfil, posición, departamento y configuración de pago.
 */
export async function getInstructors(organizationId?: number): Promise<Instructor[]> {
  const orgId = organizationId || getOrganizationId();
  
  // 1. Obtener el departamento GYM (puede no existir)
  const { data: gymDept } = await supabase
    .from('departments')
    .select('id')
    .eq('organization_id', orgId)
    .eq('code', 'GYM')
    .maybeSingle();

  // 2. Obtener todos los empleados activos con sus relaciones
  // Nota: Usamos !employments_department_id_fkey porque hay múltiples FKs entre employments y departments
  const { data: employments, error } = await supabase
    .from('employments')
    .select(`
      id,
      employee_code,
      status,
      base_salary,
      salary_period,
      work_hours_per_week,
      metadata,
      department_id,
      position_id,
      organization_members!inner (
        id,
        user_id,
        organization_id,
        is_active
      ),
      job_positions (
        id,
        code,
        name,
        requirements
      ),
      departments!employments_department_id_fkey (
        id,
        code,
        name
      )
    `)
    .eq('status', 'active');

  if (error) {
    console.error('Error obteniendo empleados desde HRM:', error);
    throw error;
  }

  // 3. Filtrar en código: departamento GYM o posición INST-*
  const filteredEmployments = (employments || []).filter(emp => {
    const position = emp.job_positions as any;
    const department = emp.departments as any;
    
    // Es instructor si: está en departamento GYM O tiene código de posición INST-*
    const isInGymDept = gymDept?.id && emp.department_id === gymDept.id;
    const isInstructorPosition = position?.code?.startsWith('INST-');
    const isInGymDeptByCode = department?.code === 'GYM';
    
    return isInGymDept || isInstructorPosition || isInGymDeptByCode;
  });

  const instructors: Instructor[] = [];
  
  for (const emp of filteredEmployments) {
    const member = emp.organization_members as any;
    if (!member || !member.is_active) continue;

    // Verificar que pertenece a la organización correcta
    if (member.organization_id !== orgId) continue;

    // Obtener perfil del usuario
    const { data: profileData } = await supabase
      .from('profiles')
      .select('first_name, last_name, email, phone, avatar_url')
      .eq('id', member.user_id)
      .single();

    // Contar clases asignadas
    const { count: classesCount } = await supabase
      .from('gym_classes')
      .select('id', { count: 'exact' })
      .eq('instructor_id', member.user_id)
      .eq('organization_id', orgId);

    // Calcular tarifa por hora
    const position = emp.job_positions as any;
    const hourlyRateSuggested = position?.requirements?.hourly_rate_suggested;
    let hourlyRate: number | undefined;
    
    if (emp.salary_period === 'hourly') {
      hourlyRate = emp.base_salary || hourlyRateSuggested;
    } else if (hourlyRateSuggested) {
      hourlyRate = hourlyRateSuggested;
    }

    instructors.push({
      id: member.id,
      user_id: member.user_id,
      organization_id: member.organization_id,
      employment_id: emp.id,
      employee_code: emp.employee_code || undefined,
      is_active: member.is_active,
      profiles: profileData || undefined,
      position: position ? {
        id: position.id,
        code: position.code,
        name: position.name,
        requirements: position.requirements
      } : undefined,
      department: emp.departments ? {
        id: (emp.departments as any).id,
        code: (emp.departments as any).code,
        name: (emp.departments as any).name
      } : undefined,
      salary_period: emp.salary_period as any,
      base_salary: emp.base_salary || undefined,
      hourly_rate: hourlyRate,
      classes_count: classesCount || 0
    });
  }

  return instructors;
}

/**
 * Obtiene todos los cargos de instructor disponibles para asignar.
 */
export async function getInstructorPositions(organizationId?: number) {
  const orgId = organizationId || getOrganizationId();
  
  // Obtener todas las posiciones activas con sus departamentos
  const { data, error } = await supabase
    .from('job_positions')
    .select(`
      id,
      code,
      name,
      description,
      min_salary,
      max_salary,
      requirements,
      departments (
        id,
        code,
        name
      )
    `)
    .eq('organization_id', orgId)
    .eq('is_active', true)
    .order('name');

  if (error) {
    console.error('Error obteniendo posiciones de instructor:', error);
    throw error;
  }

  // Filtrar en código: posiciones INST-* o del departamento GYM
  const filtered = (data || []).filter(pos => {
    const dept = pos.departments as any;
    return pos.code?.startsWith('INST-') || dept?.code === 'GYM';
  });

  return filtered;
}

export async function getInstructorStats(instructorId: string, organizationId?: number): Promise<{
  totalClasses: number;
  completedClasses: number;
  cancelledClasses: number;
  totalReservations: number;
  totalAttendance: number;
  avgAttendanceRate: number;
}> {
  const orgId = organizationId || getOrganizationId();

  const { data: classes } = await supabase
    .from('gym_classes')
    .select('id, status, capacity')
    .eq('instructor_id', instructorId)
    .eq('organization_id', orgId);

  const classIds = classes?.map(c => c.id) || [];
  
  let totalReservations = 0;
  let totalAttendance = 0;

  if (classIds.length > 0) {
    const { count: reservationsCount } = await supabase
      .from('class_reservations')
      .select('id', { count: 'exact' })
      .in('gym_class_id', classIds);

    const { count: attendanceCount } = await supabase
      .from('class_reservations')
      .select('id', { count: 'exact' })
      .in('gym_class_id', classIds)
      .eq('status', 'attended');

    totalReservations = reservationsCount || 0;
    totalAttendance = attendanceCount || 0;
  }

  return {
    totalClasses: classes?.length || 0,
    completedClasses: classes?.filter(c => c.status === 'completed').length || 0,
    cancelledClasses: classes?.filter(c => c.status === 'cancelled').length || 0,
    totalReservations,
    totalAttendance,
    avgAttendanceRate: totalReservations > 0 ? (totalAttendance / totalReservations) * 100 : 0
  };
}

// ==================== REPORTES ====================

export async function getGymReportStats(organizationId?: number, filters?: GymReportFilters): Promise<GymReportStats> {
  const orgId = organizationId || getOrganizationId();
  const now = new Date();
  
  // Usar filtros de fecha o defaults
  const dateFrom = filters?.dateFrom || new Date(now.getFullYear(), now.getMonth(), 1);
  const dateTo = filters?.dateTo || now;
  const branchId = filters?.branchId;

  const { data: allMemberships } = await supabase
    .from('memberships')
    .select('id, status, created_at, updated_at, membership_plan_id')
    .eq('organization_id', orgId);

  const { data: activeMemberships } = await supabase
    .from('memberships')
    .select('id')
    .eq('organization_id', orgId)
    .eq('status', 'active')
    .gte('end_date', now.toISOString());

  const { data: renewedInPeriod } = await supabase
    .from('membership_events')
    .select('id')
    .eq('event_type', 'renewed')
    .gte('created_at', dateFrom.toISOString())
    .lte('created_at', dateTo.toISOString());

  const { data: cancelledInPeriod } = await supabase
    .from('memberships')
    .select('id')
    .eq('organization_id', orgId)
    .eq('status', 'cancelled')
    .gte('updated_at', dateFrom.toISOString())
    .lte('updated_at', dateTo.toISOString());

  const { data: plans } = await supabase
    .from('membership_plans')
    .select('id, name, price')
    .eq('organization_id', orgId);

  const revenueByPlan: { plan_name: string; revenue: number; count: number }[] = [];
  for (const plan of plans || []) {
    const { count } = await supabase
      .from('memberships')
      .select('id', { count: 'exact' })
      .eq('membership_plan_id', plan.id)
      .eq('status', 'active');

    revenueByPlan.push({
      plan_name: plan.name,
      revenue: (count || 0) * plan.price,
      count: count || 0
    });
  }

  let checkinsQuery = supabase
    .from('member_checkins')
    .select('checkin_at, branch_id')
    .eq('organization_id', orgId)
    .is('denied_reason', null)
    .gte('checkin_at', dateFrom.toISOString())
    .lte('checkin_at', dateTo.toISOString());

  if (branchId && branchId !== 'all') {
    checkinsQuery = checkinsQuery.eq('branch_id', branchId);
  }

  const { data: checkins } = await checkinsQuery;

  const peakHours: { hour: number; checkins: number }[] = [];
  for (let h = 5; h <= 22; h++) {
    const count = checkins?.filter(c => new Date(c.checkin_at).getHours() === h).length || 0;
    peakHours.push({ hour: h, checkins: count });
  }

  const { data: classTypes } = await supabase
    .from('gym_classes')
    .select('class_type')
    .eq('organization_id', orgId);

  const uniqueTypes = Array.from(new Set(classTypes?.map(c => c.class_type) || []));
  const classAttendance: { class_type: string; total: number; attended: number; rate: number }[] = [];

  for (const type of uniqueTypes) {
    const { data: classesOfType } = await supabase
      .from('gym_classes')
      .select('id')
      .eq('organization_id', orgId)
      .eq('class_type', type);

    const classIds = classesOfType?.map(c => c.id) || [];
    
    if (classIds.length > 0) {
      const { count: totalRes } = await supabase
        .from('class_reservations')
        .select('id', { count: 'exact' })
        .in('gym_class_id', classIds);

      const { count: attendedRes } = await supabase
        .from('class_reservations')
        .select('id', { count: 'exact' })
        .in('gym_class_id', classIds)
        .eq('status', 'attended');

      classAttendance.push({
        class_type: type,
        total: totalRes || 0,
        attended: attendedRes || 0,
        rate: (totalRes || 0) > 0 ? ((attendedRes || 0) / (totalRes || 1)) * 100 : 0
      });
    }
  }

  const total = allMemberships?.length || 1;
  const cancelled = cancelledInPeriod?.length || 0;

  return {
    totalMemberships: allMemberships?.length || 0,
    activeMemberships: activeMemberships?.length || 0,
    renewedThisMonth: renewedInPeriod?.length || 0,
    cancelledThisMonth: cancelled,
    churnRate: (cancelled / total) * 100,
    retentionRate: 100 - (cancelled / total) * 100,
    revenueByPlan,
    peakHours,
    classAttendance
  };
}

// ==================== UTILIDADES CLASES ====================

export function getClassTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    spinning: 'Spinning',
    yoga: 'Yoga',
    pilates: 'Pilates',
    crossfit: 'CrossFit',
    zumba: 'Zumba',
    boxing: 'Boxeo',
    functional: 'Funcional',
    stretching: 'Estiramiento',
    aerobics: 'Aeróbicos',
    swimming: 'Natación',
    other: 'Otro'
  };
  return labels[type] || type;
}

export function getClassStatusColor(status: string): string {
  switch (status) {
    case 'scheduled': return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400';
    case 'in_progress': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400';
    case 'completed': return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400';
    case 'cancelled': return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
    default: return 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400';
  }
}

export function getClassStatusLabel(status: string): string {
  switch (status) {
    case 'scheduled': return 'Programada';
    case 'in_progress': return 'En Progreso';
    case 'completed': return 'Completada';
    case 'cancelled': return 'Cancelada';
    default: return status;
  }
}

export function getReservationStatusColor(status: string): string {
  switch (status) {
    case 'booked': return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400';
    case 'attended': return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400';
    case 'no_show': return 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400';
    case 'cancelled': return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
    default: return 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400';
  }
}

export function getReservationStatusLabel(status: string): string {
  switch (status) {
    case 'booked': return 'Reservado';
    case 'attended': return 'Asistió';
    case 'no_show': return 'No Asistió';
    case 'cancelled': return 'Cancelado';
    default: return status;
  }
}

export function getDifficultyLabel(level: string): string {
  switch (level) {
    case 'beginner': return 'Principiante';
    case 'intermediate': return 'Intermedio';
    case 'advanced': return 'Avanzado';
    case 'all_levels': return 'Todos los niveles';
    default: return level;
  }
}

export default {
  getPlans,
  getPlanById,
  createPlan,
  updatePlan,
  togglePlanStatus,
  getMemberships,
  getMembershipById,
  createMembership,
  updateMembership,
  freezeMembership,
  unfreezeMembership,
  cancelMembership,
  renewMembership,
  searchMemberForCheckin,
  validateCheckin,
  registerCheckin,
  registerDeniedCheckin,
  getTodayCheckins,
  getGymStats,
  logMembershipEvent,
  getMembershipEvents,
  getMembershipFreezes,
  getAccessDevices,
  createAccessDevice,
  getDaysRemaining,
  getMembershipStatusColor,
  getMembershipStatusLabel,
  getClasses,
  getClassById,
  createClass,
  updateClass,
  deleteClass,
  cancelClass,
  duplicateClass,
  getReservations,
  getReservationsByClass,
  createReservation,
  updateReservation,
  cancelReservation,
  markAttendance,
  getClassOccupancy,
  getInstructors,
  getInstructorPositions,
  getInstructorStats,
  getGymReportStats,
  getClassTypeLabel,
  getClassStatusColor,
  getClassStatusLabel,
  getReservationStatusColor,
  getReservationStatusLabel,
  getDifficultyLabel
};
