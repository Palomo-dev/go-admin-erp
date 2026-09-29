import { supabase } from '@/lib/supabase/config';
import { buscarClientes } from '@/lib/services/customers/busquedaClientesService';
import { getOrganizationId, getCurrentBranchId } from '@/lib/hooks/useOrganization';
import { resolveTimezone } from '@/lib/services/timezoneResolver';
import { todayInTz, toPlainDate, plainDateToInstant } from '@/lib/utils/dateCore';
import { horarioDuplicado } from '@/lib/services/membresias/operacion';
import { getDayRange } from '@/lib/utils/dateRanges';
import { sumarDiasAlDia, diasEntreDias } from '@/lib/services/fiscalCalendar';

// ============================================================
// Zona horaria en este servicio (Fase B, tanda 4 - vigencias).
//
// `memberships.start_date` y `.end_date` son **timestamptz**, no `date`
// (verificado en `information_schema.columns`). El formulario manda
// 'YYYY-MM-DD' y Postgres lo interpreta a medianoche del `TimeZone` de la
// sesion (UTC): una membresia "hasta el 30" se guardaba como el 30 a las
// 00:00Z, que en Madrid son las 02:00 del 30. A partir de esa hora el socio
// ya constaba como vencido: perdia el ultimo dia que habia pagado.
//
// Regla adoptada aqui, y la misma en la lectura para que los dos errores no
// se sigan cancelando: el dia de INICIO empieza a las 00:00 de la zona de la
// organizacion, y el dia de FIN termina a las 23:59:59.999 de esa misma zona.
// Una vigencia "hasta el dia X" cubre el dia X entero, que es lo que entiende
// quien paga.
//
// `membership_freezes.start_date` / `.end_date` si son `date`: ahi se escribe
// el dia, sin instante.
//
// De donde sale la organizacion: `memberships.organization_id` existe y es la
// fila que se esta tocando. No se anade un parametro a las firmas porque eso
// permitiria que el llamador pasara una organizacion distinta de la dueña del
// dato; `membership_freezes` no tiene `organization_id`, y se llega a el por
// `membership_id`, que es el salto que documenta el ADR-001.
// ============================================================

/** Zona horaria de la organizacion dueña de una membresia. */
async function zonaDeLaMembresia(membershipId: number): Promise<string> {
  const { data } = await supabase
    .from('memberships')
    .select('organization_id')
    .eq('id', membershipId)
    .maybeSingle();
  return resolveTimezone(Number(data?.organization_id) || 0);
}

/** Dia calendario 'YYYY-MM-DD' de un valor que puede ser dia o instante. */
function diaDe(valor: string, timezone: string): string {
  return valor.length <= 10 ? valor : toPlainDate(new Date(valor), timezone);
}

/** Inicio de vigencia: 00:00 del dia, en la zona de la organizacion. */
function inicioDeVigencia(dia: string, timezone: string): string {
  return plainDateToInstant(dia, timezone, '00:00');
}

/** Fin de vigencia: el dia entero, hasta su ultimo milisegundo. */
function finDeVigencia(dia: string, timezone: string): string {
  return getDayRange(dia, timezone).end;
}

// ==================== TIPOS ====================

export interface GymClass {
  id: number;
  organization_id: number;
  branch_id: number;
  title: string;
  description?: string;
  /** Texto libre en la base; la interfaz sugiere tipos (membresias/operacion/logica.ts). */
  class_type: string;
  /** NOT NULL en la base (FK a auth.users). */
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
  /** `gym_classes_status_check`: active (programada) | completed | cancelled. */
  status: 'active' | 'completed' | 'cancelled';
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
  /** `class_reservations_status_check`: «asistió» es checked_in. */
  status: 'booked' | 'checked_in' | 'no_show' | 'cancelled';
  booked_at: string;
  checkin_time?: string;
  cancelled_at?: string;
  cancellation_reason?: string;
  /** `class_reservations_reservation_source_check`. */
  reservation_source?: 'app' | 'web' | 'staff' | 'kiosk';
  branch_id?: number | null;
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
  freeze_history?: unknown[];
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
  /** `member_checkins_method_check`. */
  method?: 'manual' | 'qr' | 'rfid' | 'fingerprint' | 'facial';
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
  old_value?: unknown;
  new_value?: unknown;
  performed_by?: string;
  ip_address?: string;
  user_agent?: string;
  metadata?: Record<string, unknown>;
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
  configuration?: Record<string, unknown>;
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
  const zona = await resolveTimezone(orgId);

  // El formulario entrega dias calendario; la columna es timestamptz.
  const inicio = membership.start_date
    ? inicioDeVigencia(diaDe(membership.start_date, zona), zona)
    : undefined;
  const fin = membership.end_date
    ? finDeVigencia(diaDe(membership.end_date, zona), zona)
    : undefined;

  const { data, error } = await supabase
    .from('memberships')
    .insert({
      ...membership,
      ...(inicio ? { start_date: inicio } : {}),
      ...(fin ? { end_date: fin } : {}),
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

  // `membership_freezes` no tiene `organization_id`: la organizacion sale de la
  // membresia que se congela, que ya esta cargada aqui.
  const zona = await resolveTimezone(Number(membership.organization_id) || 0);

  const { data: freeze, error: freezeError } = await supabase
    .from('membership_freezes')
    .insert({
      membership_id: membershipId,
      start_date: todayInTz(zona),
      end_date: endDate ? diaDe(endDate, zona) : null,
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
    const zona = await zonaDeLaMembresia(membershipId);
    const hoy = todayInTz(zona);
    // Dias de congelamiento = dias CALENDARIO, no `(ahora - inicio) / 24 h`:
    // en la semana del cambio de horario esa division da un dia de mas o de
    // menos, y ese dia se le regala (o se le quita) al socio.
    const daysFrozen = diasEntreDias(String(activeFreeze.start_date).slice(0, 10), hoy);

    await supabase
      .from('membership_freezes')
      .update({
        status: 'ended',
        end_date: hoy,
        days_frozen: daysFrozen,
        updated_at: new Date().toISOString()
      })
      .eq('id', activeFreeze.id);

    const membership = await getMembershipById(membershipId);
    if (membership) {
      // `end_date` es timestamptz: se corre el DIA de vencimiento y se vuelve a
      // cerrar al final de ese dia en la zona de la organizacion.
      const diaFin = sumarDiasAlDia(diaDe(membership.end_date, zona), daysFrozen);

      await supabase
        .from('memberships')
        .update({
          status: 'active',
          end_date: finDeVigencia(diaFin, zona),
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

  const zona = await resolveTimezone(Number(membership.organization_id) || 0);
  const diaInicio = todayInTz(zona);
  // `duration_days` son dias de calendario: 30 dias no son 30 x 24 h cuando el
  // rango cruza un cambio de horario.
  const diaFin = sumarDiasAlDia(diaInicio, plan.duration_days);

  const { data, error } = await supabase
    .from('memberships')
    .update({
      membership_plan_id: targetPlanId,
      start_date: inicioDeVigencia(diaInicio, zona),
      end_date: finDeVigencia(diaFin, zona),
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

// El check-in se registra con fn_membresia_registrar_checkin (apiMembresias.registrarEntrada):
// la base valida vigencia, gracia, sede, horario y tope diario. Aquí solo queda la lectura.

export async function getTodayCheckins(
  organizationId?: number,
  branchId?: number | null
): Promise<MemberCheckin[]> {
  const orgId = organizationId || getOrganizationId();
  // `setHours(0,0,0,0)` es medianoche del NAVEGADOR: desde Madrid, "los
  // check-ins de hoy" de una sede de Bogota empezaban a las 17:00 de ayer.
  const zona = await resolveTimezone(orgId, branchId ?? null);
  const inicioDeHoy = getDayRange(todayInTz(zona), zona).start;

  let query = supabase
    .from('member_checkins')
    .select(`
      *,
      customers (id, first_name, last_name),
      memberships (id, status, membership_plans (name))
    `)
    .eq('organization_id', orgId)
    .gte('checkin_at', inicioDeHoy)
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

export async function getGymStats(
  organizationId?: number,
  branchId?: number | null
): Promise<GymStats> {
  const orgId = organizationId || getOrganizationId();
  // Los limites del dia salen de la zona de la organizacion (o de la sucursal
  // filtrada), no de `new Date(y, m, d)`, que es medianoche del NAVEGADOR: en
  // Madrid ese instante cae en el dia anterior y el corte de "vencen esta
  // semana" se desplazaba una jornada entera.
  const zona = await resolveTimezone(orgId, branchId ?? null);
  const hoy = todayInTz(zona);
  const now = new Date();
  const inicioDeHoy = getDayRange(hoy, zona).start;
  const finDe7Dias = getDayRange(sumarDiasAlDia(hoy, 7), zona).end;
  const inicioDeHace7Dias = getDayRange(sumarDiasAlDia(hoy, -7), zona).start;

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
    .gte('end_date', inicioDeHoy)
    .lte('end_date', finDe7Dias);

  const { data: expiredMemberships } = await supabase
    .from('memberships')
    .select('id', { count: 'exact' })
    .eq('organization_id', orgId)
    .lt('end_date', now.toISOString())
    .neq('status', 'cancelled');

  let todayCheckinsQuery = supabase
    .from('member_checkins')
    .select('id', { count: 'exact' })
    .eq('organization_id', orgId)
    .gte('checkin_at', inicioDeHoy)
    .is('denied_reason', null);

  if (branchId != null) {
    todayCheckinsQuery = todayCheckinsQuery.eq('branch_id', branchId);
  }

  const { data: todayCheckins } = await todayCheckinsQuery;

  const { data: todayPayments } = await supabase
    .from('payments')
    .select('amount')
    .eq('source', 'membership')
    .gte('created_at', inicioDeHoy)
    .eq('status', 'completed');

  const { data: weekPayments } = await supabase
    .from('payments')
    .select('amount')
    .eq('source', 'membership')
    .gte('created_at', inicioDeHace7Dias)
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
  oldValue?: unknown,
  newValue?: unknown
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

/**
 * Dias que le quedan a una membresia, contados en DIAS CALENDARIO de la zona
 * de la organizacion. Vence hoy -> 0. Vencio ayer -> -1.
 *
 * `timezone` es obligatorio a proposito: `memberships.end_date` es un
 * timestamptz, y restar instantes y dividir por 86 400 000 mezcla la hora del
 * vencimiento con la del navegador. Con el fin de vigencia a las 23:59 de la
 * organizacion, esa cuenta devolvia "1 dia" a las once de la noche del ultimo
 * dia y "0" a las nueve de la mañana del mismo dia: dos respuestas distintas
 * para la misma membresia segun la hora a la que se mirara la pantalla.
 */
export function getDaysRemaining(endDate: string, timezone: string): number {
  if (!endDate) return 0;
  const fin = new Date(endDate);
  if (isNaN(fin.getTime())) return 0;
  return diasEntreDias(todayInTz(timezone), toPlainDate(fin, timezone));
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
//
// Escrituras desde el navegador con RLS por pertenencia a la organización. La
// organización llega del llamador (useOrganization en la página); los estados
// son los que acepta la CHECK de la base: active | completed | cancelled.

const SELECT_CLASE = `
      *,
      branches (id, name)
    `;

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
    .select(SELECT_CLASE)
    .eq('organization_id', orgId)
    .order('start_at', { ascending: true });

  if (filters?.branchId) query = query.eq('branch_id', filters.branchId);
  if (filters?.status && filters.status !== 'all') query = query.eq('status', filters.status);
  if (filters?.classType && filters.classType !== 'all') query = query.eq('class_type', filters.classType);
  if (filters?.instructorId) query = query.eq('instructor_id', filters.instructorId);
  if (filters?.dateFrom) query = query.gte('start_at', filters.dateFrom);
  if (filters?.dateTo) query = query.lt('start_at', filters.dateTo);

  const { data, error } = await query;
  if (error) {
    console.error('Error obteniendo clases:', error);
    throw error;
  }
  return (data || []) as GymClass[];
}

export async function getClassById(classId: number, organizationId?: number): Promise<GymClass | null> {
  const orgId = organizationId || getOrganizationId();
  const { data, error } = await supabase
    .from('gym_classes')
    .select(SELECT_CLASE)
    .eq('id', classId)
    .eq('organization_id', orgId)
    .maybeSingle();

  if (error) {
    console.error('Error obteniendo clase:', error);
    return null;
  }
  return (data as GymClass | null) ?? null;
}

/** Campos que se escriben en `gym_classes` (sin relaciones ni contadores). */
type DatosClase = Pick<
  GymClass,
  | 'title'
  | 'description'
  | 'class_type'
  | 'instructor_id'
  | 'capacity'
  | 'duration_minutes'
  | 'start_at'
  | 'end_at'
  | 'recurrence'
  | 'status'
  | 'room'
  | 'location'
  | 'equipment_needed'
  | 'difficulty_level'
  | 'branch_id'
  | 'cancellation_reason'
  | 'notify_on_cancel'
>;

function soloCampos(datos: Partial<GymClass>): Partial<DatosClase> {
  const {
    title,
    description,
    class_type,
    instructor_id,
    capacity,
    duration_minutes,
    start_at,
    end_at,
    recurrence,
    status,
    room,
    location,
    equipment_needed,
    difficulty_level,
    branch_id,
    cancellation_reason,
    notify_on_cancel,
  } = datos;
  const limpio: Partial<DatosClase> = {
    title,
    description,
    class_type,
    instructor_id,
    capacity,
    duration_minutes,
    start_at,
    end_at,
    recurrence,
    status,
    room,
    location,
    equipment_needed,
    difficulty_level,
    branch_id,
    cancellation_reason,
    notify_on_cancel,
  };
  for (const k of Object.keys(limpio) as (keyof DatosClase)[]) {
    if (limpio[k] === undefined) delete limpio[k];
  }
  return limpio;
}

export async function createClass(gymClass: Partial<GymClass>, organizationId?: number): Promise<GymClass> {
  const orgId = organizationId || getOrganizationId();
  const branchId = gymClass.branch_id || getCurrentBranchId();

  const { data, error } = await supabase
    .from('gym_classes')
    .insert({
      ...soloCampos(gymClass),
      organization_id: orgId,
      branch_id: branchId,
      status: gymClass.status || 'active',
    })
    .select(SELECT_CLASE)
    .single();

  if (error) {
    console.error('Error creando clase:', error);
    throw error;
  }
  return data as GymClass;
}

export async function updateClass(classId: number, updates: Partial<GymClass>, organizationId?: number): Promise<GymClass> {
  const orgId = organizationId || getOrganizationId();
  const { data, error } = await supabase
    .from('gym_classes')
    .update({
      ...soloCampos(updates),
      updated_at: new Date().toISOString(),
    })
    .eq('id', classId)
    .eq('organization_id', orgId)
    .select(SELECT_CLASE)
    .single();

  if (error) {
    console.error('Error actualizando clase:', error);
    throw error;
  }
  return data as GymClass;
}

/** Solo clases sin reservas: con reservas se cancela (conserva el historial). */
export async function deleteClass(classId: number, organizationId?: number): Promise<void> {
  const orgId = organizationId || getOrganizationId();
  const { count } = await supabase
    .from('class_reservations')
    .select('id', { count: 'exact', head: true })
    .eq('gym_class_id', classId)
    .eq('organization_id', orgId);
  if ((count ?? 0) > 0) throw new Error('clase_con_reservas');

  const { error } = await supabase.from('gym_classes').delete().eq('id', classId).eq('organization_id', orgId);
  if (error) {
    console.error('Error eliminando clase:', error);
    throw error;
  }
}

export async function cancelClass(
  classId: number,
  reason: string,
  notifyMembers: boolean = false,
  organizationId?: number
): Promise<void> {
  const orgId = organizationId || getOrganizationId();
  const { error } = await supabase
    .from('gym_classes')
    .update({
      status: 'cancelled',
      cancellation_reason: reason,
      notify_on_cancel: notifyMembers,
      updated_at: new Date().toISOString(),
    })
    .eq('id', classId)
    .eq('organization_id', orgId);

  if (error) {
    console.error('Error cancelando clase:', error);
    throw error;
  }
}

/**
 * Copia la clase en `newDate` (día `YYYY-MM-DD`) con la misma hora de pared y
 * duración, en la zona de la organización. Antes se hacía con `new Date(dia)`
 * (medianoche UTC) + `setHours` del navegador: en América la copia caía un día
 * antes.
 */
export async function duplicateClass(classId: number, newDate: string, organizationId?: number): Promise<GymClass> {
  const orgId = organizationId || getOrganizationId();
  const original = await getClassById(classId, orgId);
  if (!original) throw new Error('clase_no_encontrada');

  const zona = await resolveTimezone(orgId, original.branch_id);
  const { inicio, fin } = horarioDuplicado(original, newDate, zona);

  return createClass(
    {
      ...soloCampos(original),
      branch_id: original.branch_id,
      start_at: inicio,
      end_at: fin,
      status: 'active',
      cancellation_reason: undefined,
      notify_on_cancel: false,
    },
    orgId
  );
}

/** Reservas que ocupan cupo (todas menos canceladas) por clase. */
export async function getOccupancyByClass(classIds: number[], organizationId?: number): Promise<Map<number, number>> {
  const orgId = organizationId || getOrganizationId();
  const mapa = new Map<number, number>();
  // En tandas: una lista `in.(...)` muy larga no cabe en la URL de PostgREST.
  for (let i = 0; i < classIds.length; i += 150) {
    const { data, error } = await supabase
      .from('class_reservations')
      .select('gym_class_id')
      .eq('organization_id', orgId)
      .in('gym_class_id', classIds.slice(i, i + 150))
      .neq('status', 'cancelled');
    if (error) {
      console.error('Error obteniendo ocupación:', error);
      throw error;
    }
    for (const r of (data || []) as { gym_class_id: number }[]) {
      mapa.set(r.gym_class_id, (mapa.get(r.gym_class_id) ?? 0) + 1);
    }
  }
  return mapa;
}

// ==================== RESERVACIONES ====================

const SELECT_RESERVA = `
      *,
      customers (id, first_name, last_name, email, phone, identification_number),
      gym_classes!inner (id, title, class_type, start_at, end_at, capacity, branch_id, status, branches (name))
    `;

export async function getReservations(
  organizationId?: number,
  filters?: {
    classId?: number;
    customerId?: string;
    status?: string;
    /** Rango por la fecha de la CLASE (no por `booked_at`). */
    classFrom?: string;
    classTo?: string;
    limit?: number;
  }
): Promise<ClassReservation[]> {
  const orgId = organizationId || getOrganizationId();

  let query = supabase
    .from('class_reservations')
    .select(SELECT_RESERVA)
    .eq('organization_id', orgId)
    .order('booked_at', { ascending: false })
    .limit(filters?.limit ?? 1000);

  if (filters?.classId) query = query.eq('gym_class_id', filters.classId);
  if (filters?.customerId) query = query.eq('customer_id', filters.customerId);
  if (filters?.status && filters.status !== 'all') query = query.eq('status', filters.status);
  if (filters?.classFrom) query = query.gte('gym_classes.start_at', filters.classFrom);
  if (filters?.classTo) query = query.lt('gym_classes.start_at', filters.classTo);

  const { data, error } = await query;
  if (error) {
    console.error('Error obteniendo reservaciones:', error);
    throw error;
  }
  return (data || []) as unknown as ClassReservation[];
}

/**
 * Crea la reserva si la clase está programada y le queda cupo. El cupo se
 * valida aquí porque no hay RPC; la UNIQUE(clase, cliente) de la base evita
 * la reserva doble.
 */
export async function createReservation(
  reservation: Pick<ClassReservation, 'gym_class_id' | 'customer_id'> &
    Partial<Pick<ClassReservation, 'notes' | 'reservation_source' | 'membership_id'>>,
  organizationId?: number
): Promise<ClassReservation> {
  const orgId = organizationId || getOrganizationId();
  const clase = await getClassById(reservation.gym_class_id, orgId);
  if (!clase) throw new Error('clase_no_encontrada');
  if (clase.status !== 'active') throw new Error('clase_no_programada');
  const ocupacion = await getOccupancyByClass([clase.id], orgId);
  if ((ocupacion.get(clase.id) ?? 0) >= clase.capacity) throw new Error('clase_sin_cupo');

  const { data, error } = await supabase
    .from('class_reservations')
    .insert({
      organization_id: orgId,
      gym_class_id: reservation.gym_class_id,
      customer_id: reservation.customer_id,
      notes: reservation.notes ?? null,
      membership_id: reservation.membership_id ?? null,
      reservation_source: reservation.reservation_source ?? 'staff',
      branch_id: clase.branch_id,
      status: 'booked',
      booked_at: new Date().toISOString(),
    })
    .select(SELECT_RESERVA)
    .single();

  if (error) {
    console.error('Error creando reservación:', error);
    if (error.code === '23505') throw new Error('reserva_duplicada');
    throw error;
  }
  return data as unknown as ClassReservation;
}

export async function updateReservation(
  reservationId: number,
  updates: Partial<Pick<ClassReservation, 'notes' | 'reservation_source'>>,
  organizationId?: number
): Promise<ClassReservation> {
  const orgId = organizationId || getOrganizationId();
  const { data, error } = await supabase
    .from('class_reservations')
    .update({
      ...(updates.notes !== undefined ? { notes: updates.notes } : {}),
      ...(updates.reservation_source ? { reservation_source: updates.reservation_source } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq('id', reservationId)
    .eq('organization_id', orgId)
    .select(SELECT_RESERVA)
    .single();

  if (error) {
    console.error('Error actualizando reservación:', error);
    throw error;
  }
  return data as unknown as ClassReservation;
}

export async function cancelReservation(reservationId: number, reason?: string, organizationId?: number): Promise<void> {
  const orgId = organizationId || getOrganizationId();
  const { error } = await supabase
    .from('class_reservations')
    .update({
      status: 'cancelled',
      cancelled_at: new Date().toISOString(),
      cancellation_reason: reason,
      updated_at: new Date().toISOString(),
    })
    .eq('id', reservationId)
    .eq('organization_id', orgId);

  if (error) {
    console.error('Error cancelando reservación:', error);
    throw error;
  }
}

/** Asistencia: `checked_in` (asistió) o `no_show`. La CHECK rechaza `attended`. */
export async function markAttendance(reservationId: number, attended: boolean, organizationId?: number): Promise<void> {
  const orgId = organizationId || getOrganizationId();
  const { error } = await supabase
    .from('class_reservations')
    .update({
      status: attended ? 'checked_in' : 'no_show',
      checkin_time: attended ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', reservationId)
    .eq('organization_id', orgId);

  if (error) {
    console.error('Error marcando asistencia:', error);
    throw error;
  }
}

/** Clientes de la organización para el selector de la reserva (RLS + filtro explícito). */
export async function searchCustomersForReservation(
  term: string,
  organizationId?: number
): Promise<Array<{ id: string; nombre: string; documento: string | null; correo: string | null; telefono: string | null }>> {
  const orgId = organizationId || getOrganizationId();
  if (term.trim().length < 2) return [];
  // Búsqueda única de clientes (RPC): el texto nunca va dentro de un `.or()`.
  const { filas: data } = await buscarClientes(supabase, { organizationId: orgId, texto: term, limite: 20 });
  return ((data || []) as Array<{
    id: string;
    full_name: string | null;
    first_name: string | null;
    last_name: string | null;
    identification_number: string | null;
    email: string | null;
    phone: string | null;
  }>).map((c) => ({
    id: c.id,
    nombre: c.full_name || [c.first_name, c.last_name].filter(Boolean).join(' ') || c.email || c.id,
    documento: c.identification_number,
    correo: c.email,
    telefono: c.phone,
  }));
}

// ==================== INSTRUCTORES ====================

interface FilaEmpleo {
  id: string;
  employee_code: string | null;
  status: string | null;
  base_salary: number | null;
  salary_period: Instructor['salary_period'] | null;
  department_id: string | null;
  organization_members: { id: number; user_id: string; organization_id: number; is_active: boolean | null } | null;
  job_positions: { id: string; code: string | null; name: string; requirements: { specialties?: string[]; certifications?: string[]; hourly_rate_suggested?: number } | null } | null;
  departments: { id: string; code: string | null; name: string } | null;
}

/**
 * Instructores desde HRM: empleos activos de la organización en el
 * departamento GYM o con cargo INST-*. Filtra por organización en la consulta
 * (antes traía empleos de todas) y trae perfiles y conteo de clases en dos
 * consultas en lugar de dos por instructor.
 */
export async function getInstructors(organizationId?: number): Promise<Instructor[]> {
  const orgId = organizationId || getOrganizationId();

  // Hay dos FK entre employments y departments: se nombra la del departamento del empleo.
  const { data: employments, error } = await supabase
    .from('employments')
    .select(`
      id,
      employee_code,
      status,
      base_salary,
      salary_period,
      department_id,
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
    .eq('status', 'active')
    .eq('organization_members.organization_id', orgId);

  if (error) {
    console.error('Error obteniendo empleados desde HRM:', error);
    throw error;
  }

  const filas = ((employments || []) as unknown as FilaEmpleo[]).filter((emp) => {
    const miembro = emp.organization_members;
    if (!miembro || miembro.organization_id !== orgId) return false;
    return emp.departments?.code === 'GYM' || (emp.job_positions?.code ?? '').startsWith('INST-');
  });
  if (filas.length === 0) return [];

  const userIds = Array.from(new Set(filas.map((f) => f.organization_members!.user_id)));
  const [{ data: perfiles }, { data: clases }] = await Promise.all([
    supabase.from('profiles').select('id, first_name, last_name, email, phone, avatar_url').in('id', userIds),
    supabase.from('gym_classes').select('instructor_id').eq('organization_id', orgId).in('instructor_id', userIds),
  ]);
  const perfilPorId = new Map(
    ((perfiles || []) as Array<{ id: string; first_name: string | null; last_name: string | null; email: string | null; phone: string | null; avatar_url: string | null }>).map(
      (p) => [p.id, p]
    )
  );
  const clasesPorInstructor = new Map<string, number>();
  for (const c of (clases || []) as { instructor_id: string }[]) {
    clasesPorInstructor.set(c.instructor_id, (clasesPorInstructor.get(c.instructor_id) ?? 0) + 1);
  }

  return filas.map((emp) => {
    const miembro = emp.organization_members!;
    const perfil = perfilPorId.get(miembro.user_id);
    const sugerida = emp.job_positions?.requirements?.hourly_rate_suggested;
    const hourlyRate = emp.salary_period === 'hourly' ? emp.base_salary || sugerida : sugerida;
    return {
      id: String(miembro.id),
      user_id: miembro.user_id,
      organization_id: miembro.organization_id,
      employment_id: emp.id,
      employee_code: emp.employee_code || undefined,
      is_active: miembro.is_active !== false,
      profiles: perfil
        ? {
            first_name: perfil.first_name ?? '',
            last_name: perfil.last_name ?? '',
            email: perfil.email ?? undefined,
            phone: perfil.phone ?? undefined,
            avatar_url: perfil.avatar_url ?? undefined,
          }
        : undefined,
      position: emp.job_positions
        ? {
            id: emp.job_positions.id,
            code: emp.job_positions.code ?? '',
            name: emp.job_positions.name,
            requirements: emp.job_positions.requirements ?? undefined,
          }
        : undefined,
      department: emp.departments
        ? { id: emp.departments.id, code: emp.departments.code ?? '', name: emp.departments.name }
        : undefined,
      salary_period: emp.salary_period ?? undefined,
      base_salary: emp.base_salary ?? undefined,
      hourly_rate: hourlyRate ?? undefined,
      classes_count: clasesPorInstructor.get(miembro.user_id) ?? 0,
    };
  });
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

  const classIds = (classes || []).map((c) => c.id);
  let totalReservations = 0;
  let totalAttendance = 0;

  if (classIds.length > 0) {
    const { data: reservas } = await supabase
      .from('class_reservations')
      .select('status')
      .eq('organization_id', orgId)
      .in('gym_class_id', classIds)
      .neq('status', 'cancelled');
    totalReservations = (reservas || []).length;
    totalAttendance = (reservas || []).filter((r) => r.status === 'checked_in').length;
  }

  return {
    totalClasses: classes?.length || 0,
    completedClasses: classes?.filter((c) => c.status === 'completed').length || 0,
    cancelledClasses: classes?.filter((c) => c.status === 'cancelled').length || 0,
    totalReservations,
    totalAttendance,
    avgAttendanceRate: totalReservations > 0 ? (totalAttendance / totalReservations) * 100 : 0,
  };
}

/**
 * Asistencia real por instructor (reservas que asistieron / reservas no
 * canceladas) en las clases ya empezadas. Sustituye el 75 % fijo.
 */
export async function getAttendanceByInstructor(organizationId?: number): Promise<Map<string, { reservas: number; asistencias: number }>> {
  const orgId = organizationId || getOrganizationId();
  const mapa = new Map<string, { reservas: number; asistencias: number }>();
  const { data, error } = await supabase
    .from('class_reservations')
    .select('status, gym_classes!inner (instructor_id, start_at)')
    .eq('organization_id', orgId)
    .neq('status', 'cancelled')
    .lt('gym_classes.start_at', new Date().toISOString())
    .limit(5000);
  if (error) {
    console.error('Error obteniendo asistencia:', error);
    throw error;
  }
  for (const r of (data || []) as unknown as Array<{ status: string; gym_classes: { instructor_id: string } | null }>) {
    const id = r.gym_classes?.instructor_id;
    if (!id) continue;
    const v = mapa.get(id) ?? { reservas: 0, asistencias: 0 };
    v.reservas += 1;
    if (r.status === 'checked_in') v.asistencias += 1;
    mapa.set(id, v);
  }
  return mapa;
}

/** Disponibilidad semanal del instructor (`settings`, clave `instructor_availability_<user>`). */
export interface FranjaDisponible {
  desde: string;
  hasta: string;
}
export type DisponibilidadSemanal = Record<1 | 2 | 3 | 4 | 5 | 6 | 7, FranjaDisponible[]>;

const DIAS_INGLES = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;

export function disponibilidadPorDefecto(): DisponibilidadSemanal {
  const laboral = [{ desde: '06:00', hasta: '22:00' }];
  return { 1: laboral, 2: laboral, 3: laboral, 4: laboral, 5: laboral, 6: [], 7: [] };
}

/** Lee el formato guardado por la pantalla anterior ({monday: {enabled, slots:[{start,end}]}}) o el nuevo. */
function leerDisponibilidad(valor: unknown): DisponibilidadSemanal {
  const base = disponibilidadPorDefecto();
  if (!valor || typeof valor !== 'object') return base;
  const v = valor as Record<string, unknown>;
  const salida = { ...base };
  DIAS_INGLES.forEach((nombre, i) => {
    const dia = (i + 1) as keyof DisponibilidadSemanal;
    const crudo = (v[String(dia)] ?? v[nombre]) as unknown;
    if (Array.isArray(crudo)) {
      salida[dia] = crudo
        .map((f) => f as { desde?: string; hasta?: string })
        .filter((f) => typeof f.desde === 'string' && typeof f.hasta === 'string')
        .map((f) => ({ desde: f.desde as string, hasta: f.hasta as string }));
    } else if (crudo && typeof crudo === 'object') {
      const d = crudo as { enabled?: boolean; slots?: Array<{ start?: string; end?: string }> };
      salida[dia] = d.enabled
        ? (d.slots ?? [])
            .filter((s) => typeof s.start === 'string' && typeof s.end === 'string')
            .map((s) => ({ desde: s.start as string, hasta: s.end as string }))
        : [];
    }
  });
  return salida;
}

export async function getInstructorAvailability(userId: string, organizationId?: number): Promise<DisponibilidadSemanal> {
  const orgId = organizationId || getOrganizationId();
  const { data, error } = await supabase
    .from('settings')
    .select('settings')
    .eq('organization_id', orgId)
    .eq('key', `instructor_availability_${userId}`)
    .maybeSingle();
  if (error) throw error;
  return leerDisponibilidad(data?.settings);
}

export async function saveInstructorAvailability(
  userId: string,
  disponibilidad: DisponibilidadSemanal,
  organizationId?: number
): Promise<void> {
  const orgId = organizationId || getOrganizationId();
  const key = `instructor_availability_${userId}`;
  const { data: existente, error: errorLectura } = await supabase
    .from('settings')
    .select('id')
    .eq('organization_id', orgId)
    .eq('key', key)
    .maybeSingle();
  if (errorLectura) throw errorLectura;
  const { error } = existente
    ? await supabase
        .from('settings')
        .update({ settings: disponibilidad, updated_at: new Date().toISOString() })
        .eq('organization_id', orgId)
        .eq('key', key)
    : await supabase.from('settings').insert({ organization_id: orgId, key, settings: disponibilidad });
  if (error) throw error;
}

const gymService = {
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
  getOccupancyByClass,
  getReservations,
  createReservation,
  updateReservation,
  cancelReservation,
  markAttendance,
  searchCustomersForReservation,
  getInstructors,
  getInstructorStats,
  getAttendanceByInstructor,
  getInstructorAvailability,
  saveInstructorAvailability,
};

export default gymService;
