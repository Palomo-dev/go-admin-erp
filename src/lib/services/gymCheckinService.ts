'use client';

import { supabase } from '@/lib/supabase/config';
import { getOrganizationId, getCurrentBranchId } from '@/lib/hooks/useOrganization';
import { MemberCheckin, Membership, MembershipPlan } from './gymService';
import { startOfDay, endOfDay, subDays, format } from 'date-fns';

// ==================== TIPOS ====================

export interface CheckinFilters {
  dateFrom?: string;
  dateTo?: string;
  branchId?: number;
  method?: string;
  status?: 'granted' | 'denied' | 'all';
}

export interface CheckinStats {
  total: number;
  granted: number;
  denied: number;
  manual: number;
  qr: number;
  uniqueMembers: number;
  expiringToday: number;
  expiredAccess: number;
}

export interface MemberWithMembership {
  customer: {
    id: string;
    first_name: string;
    last_name: string;
    email?: string;
    phone?: string;
    document_number?: string;
  };
  membership: Membership;
  membership_plan: MembershipPlan;
  isExpired: boolean;
  isExpiring: boolean;
  daysUntilExpiry: number;
  canAccess: boolean;
  accessReason?: string;
}

export type DateRangePreset = 'today' | 'yesterday' | '7days' | '20days' | '90days' | 'custom';

// ==================== FUNCIONES DE FECHA ====================

export function getDateRange(preset: DateRangePreset, customFrom?: Date, customTo?: Date): { from: Date; to: Date } {
  const now = new Date();
  
  switch (preset) {
    case 'today':
      return { from: startOfDay(now), to: endOfDay(now) };
    case 'yesterday':
      const yesterday = subDays(now, 1);
      return { from: startOfDay(yesterday), to: endOfDay(yesterday) };
    case '7days':
      return { from: startOfDay(subDays(now, 7)), to: endOfDay(now) };
    case '20days':
      return { from: startOfDay(subDays(now, 20)), to: endOfDay(now) };
    case '90days':
      return { from: startOfDay(subDays(now, 90)), to: endOfDay(now) };
    case 'custom':
      return {
        from: customFrom ? startOfDay(customFrom) : startOfDay(now),
        to: customTo ? endOfDay(customTo) : endOfDay(now),
      };
    default:
      return { from: startOfDay(now), to: endOfDay(now) };
  }
}

// ==================== SERVICIO ====================

export class GymCheckinService {
  private organizationId: number;
  private branchId?: number;

  constructor(organizationId?: number, branchId?: number) {
    this.organizationId = organizationId || getOrganizationId() || 0;
    this.branchId = branchId || getCurrentBranchId() || undefined;
  }

  async getCheckins(filters: CheckinFilters = {}): Promise<MemberCheckin[]> {
    if (!this.organizationId) {
      console.warn('No organization ID available');
      return [];
    }

    const { dateFrom, dateTo, branchId, method, status } = filters;
    
    let query = supabase
      .from('member_checkins')
      .select(`
        *,
        customers (id, first_name, last_name),
        memberships (
          id, 
          status, 
          end_date,
          access_code,
          membership_plans (id, name)
        )
      `)
      .eq('organization_id', this.organizationId)
      .order('checkin_at', { ascending: false })
      .limit(100);

    if (dateFrom) {
      query = query.gte('checkin_at', dateFrom);
    }
    if (dateTo) {
      query = query.lte('checkin_at', dateTo);
    }
    if (branchId || this.branchId) {
      query = query.eq('branch_id', branchId || this.branchId);
    }
    if (method && method !== 'all') {
      query = query.eq('method', method);
    }
    if (status === 'granted') {
      query = query.is('denied_reason', null);
    } else if (status === 'denied') {
      query = query.not('denied_reason', 'is', null);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching checkins:', error.message, error.details);
      return [];
    }

    return (data || []) as unknown as MemberCheckin[];
  }

  async getCheckinStats(filters: CheckinFilters = {}): Promise<CheckinStats> {
    const checkins = await this.getCheckins(filters);
    
    const granted = checkins.filter(c => !c.denied_reason);
    const denied = checkins.filter(c => !!c.denied_reason);
    const manual = checkins.filter(c => c.method === 'manual');
    const qr = checkins.filter(c => c.method === 'qr');
    
    const uniqueCustomerIds = new Set(granted.map(c => c.customer_id));

    // Obtener membresías que vencen hoy
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const { data: expiringToday } = await supabase
      .from('memberships')
      .select('id')
      .eq('organization_id', this.organizationId)
      .eq('status', 'active')
      .gte('end_date', today.toISOString())
      .lt('end_date', tomorrow.toISOString());

    // Membresías vencidas con intentos de acceso denegados
    const expiredAccess = denied.filter(c => 
      c.denied_reason?.toLowerCase().includes('vencid') || 
      c.denied_reason?.toLowerCase().includes('expirad')
    ).length;

    return {
      total: checkins.length,
      granted: granted.length,
      denied: denied.length,
      manual: manual.length,
      qr: qr.length,
      uniqueMembers: uniqueCustomerIds.size,
      expiringToday: expiringToday?.length || 0,
      expiredAccess,
    };
  }

  async searchMember(query: string): Promise<MemberWithMembership[]> {
    const searchTerm = query.trim().toLowerCase();
    
    // Buscar por código de acceso, documento, teléfono o nombre
    const { data: memberships, error } = await supabase
      .from('memberships')
      .select(`
        *,
        customers (id, first_name, last_name, email, phone, document_number),
        membership_plans (*)
      `)
      .eq('organization_id', this.organizationId)
      .or(`access_code.ilike.%${searchTerm}%`)
      .limit(10);

    let results = memberships || [];

    // Si no hay resultados por código, buscar por datos del cliente
    if (results.length === 0) {
      const { data: byCustomer } = await supabase
        .from('memberships')
        .select(`
          *,
          customers!inner (id, first_name, last_name, email, phone, document_number),
          membership_plans (*)
        `)
        .eq('organization_id', this.organizationId)
        .or(`
          customers.document_number.ilike.%${searchTerm}%,
          customers.phone.ilike.%${searchTerm}%,
          customers.first_name.ilike.%${searchTerm}%,
          customers.last_name.ilike.%${searchTerm}%,
          customers.email.ilike.%${searchTerm}%
        `)
        .limit(10);

      results = byCustomer || [];
    }

    const now = new Date();
    
    return results.map(m => {
      const endDate = new Date(m.end_date);
      const startDate = new Date(m.start_date);
      const daysUntilExpiry = Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      const isExpired = endDate < now;
      const isExpiring = daysUntilExpiry >= 0 && daysUntilExpiry <= 7;
      const isActive = m.status === 'active' && !isExpired;
      const notStarted = startDate > now;

      let canAccess = isActive;
      let accessReason: string | undefined;

      if (m.status === 'cancelled') {
        canAccess = false;
        accessReason = 'Membresía cancelada';
      } else if (m.status === 'frozen') {
        canAccess = false;
        accessReason = 'Membresía congelada';
      } else if (isExpired) {
        canAccess = false;
        accessReason = `Membresía vencida hace ${Math.abs(daysUntilExpiry)} días`;
      } else if (notStarted) {
        canAccess = false;
        accessReason = `Membresía inicia el ${format(startDate, 'dd/MM/yyyy')}`;
      }

      return {
        customer: m.customers,
        membership: m,
        membership_plan: m.membership_plans,
        isExpired,
        isExpiring,
        daysUntilExpiry,
        canAccess,
        accessReason,
      };
    });
  }

  async validateAccess(membershipId: number): Promise<{
    valid: boolean;
    reason?: string;
    membership?: Membership;
    isExpiring?: boolean;
    daysUntilExpiry?: number;
  }> {
    const { data: membership, error } = await supabase
      .from('memberships')
      .select(`
        *,
        customers (id, first_name, last_name),
        membership_plans (*)
      `)
      .eq('id', membershipId)
      .single();

    if (error || !membership) {
      return { valid: false, reason: 'Membresía no encontrada' };
    }

    const now = new Date();
    const endDate = new Date(membership.end_date);
    const startDate = new Date(membership.start_date);
    const daysUntilExpiry = Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    const isExpiring = daysUntilExpiry >= 0 && daysUntilExpiry <= 7;

    if (membership.status === 'cancelled') {
      return { valid: false, reason: 'Membresía cancelada', membership, isExpiring, daysUntilExpiry };
    }
    if (membership.status === 'frozen') {
      return { valid: false, reason: 'Membresía congelada', membership, isExpiring, daysUntilExpiry };
    }
    if (startDate > now) {
      return { 
        valid: false, 
        reason: `Membresía inicia el ${format(startDate, 'dd/MM/yyyy')}`, 
        membership, 
        isExpiring, 
        daysUntilExpiry 
      };
    }
    if (endDate < now) {
      return { 
        valid: false, 
        reason: `Membresía vencida hace ${Math.abs(daysUntilExpiry)} días`, 
        membership, 
        isExpiring: false, 
        daysUntilExpiry 
      };
    }

    // Validar reglas de acceso (sede, horario, check-ins diarios)
    const accessRules = membership.access_rules as {
      branches?: number[];
      schedule?: { start: string; end: string }[];
      max_daily_checkins?: number;
    } | null;

    if (accessRules?.branches?.length && this.branchId) {
      if (!accessRules.branches.includes(this.branchId)) {
        return { 
          valid: false, 
          reason: 'No tiene acceso a esta sede', 
          membership, 
          isExpiring, 
          daysUntilExpiry 
        };
      }
    }

    if (accessRules?.schedule?.length) {
      const currentHour = now.getHours();
      const currentMinutes = now.getMinutes();
      const currentTime = currentHour * 60 + currentMinutes;

      const hasValidSchedule = accessRules.schedule.some(slot => {
        const [startH, startM] = slot.start.split(':').map(Number);
        const [endH, endM] = slot.end.split(':').map(Number);
        const start = startH * 60 + startM;
        const end = endH * 60 + endM;
        return currentTime >= start && currentTime <= end;
      });

      if (!hasValidSchedule) {
        return { 
          valid: false, 
          reason: 'Fuera del horario permitido', 
          membership, 
          isExpiring, 
          daysUntilExpiry 
        };
      }
    }

    if (accessRules?.max_daily_checkins) {
      const today = startOfDay(now);
      const { data: todayCheckins } = await supabase
        .from('member_checkins')
        .select('id')
        .eq('membership_id', membershipId)
        .gte('checkin_at', today.toISOString())
        .is('denied_reason', null);

      if ((todayCheckins?.length || 0) >= accessRules.max_daily_checkins) {
        return { 
          valid: false, 
          reason: `Límite de ${accessRules.max_daily_checkins} acceso(s) diario(s) alcanzado`, 
          membership, 
          isExpiring, 
          daysUntilExpiry 
        };
      }
    }

    return { valid: true, membership, isExpiring, daysUntilExpiry };
  }

  async registerCheckin(
    membershipId: number,
    method: 'manual' | 'qr' | 'card' | 'biometric' = 'manual'
  ): Promise<MemberCheckin> {
    const { data: membership } = await supabase
      .from('memberships')
      .select('customer_id')
      .eq('id', membershipId)
      .single();

    if (!membership) throw new Error('Membresía no encontrada');

    const { data, error } = await supabase
      .from('member_checkins')
      .insert({
        organization_id: this.organizationId,
        customer_id: membership.customer_id,
        branch_id: this.branchId,
        membership_id: membershipId,
        checkin_at: new Date().toISOString(),
        method,
      })
      .select(`
        *,
        customers (id, first_name, last_name),
        memberships (id, status, membership_plans (name))
      `)
      .single();

    if (error) {
      console.error('Error registering checkin:', error);
      throw error;
    }

    // Registrar evento
    await this.logEvent(membershipId, 'access_granted', 'Check-in registrado', { 
      checkin_id: data.id, 
      method,
      branch_id: this.branchId 
    });

    return data;
  }

  async registerDeniedAccess(
    membershipId: number,
    reason: string
  ): Promise<MemberCheckin> {
    const { data: membership } = await supabase
      .from('memberships')
      .select('customer_id')
      .eq('id', membershipId)
      .single();

    if (!membership) throw new Error('Membresía no encontrada');

    const { data, error } = await supabase
      .from('member_checkins')
      .insert({
        organization_id: this.organizationId,
        customer_id: membership.customer_id,
        branch_id: this.branchId,
        membership_id: membershipId,
        checkin_at: new Date().toISOString(),
        method: 'manual',
        denied_reason: reason,
      })
      .select()
      .single();

    if (error) {
      console.error('Error registering denied access:', error);
      throw error;
    }

    await this.logEvent(membershipId, 'access_denied', `Acceso denegado: ${reason}`, { 
      checkin_id: data.id, 
      reason,
      branch_id: this.branchId 
    });

    return data;
  }

  async getExpiringToday(): Promise<Membership[]> {
    const today = startOfDay(new Date());
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const { data, error } = await supabase
      .from('memberships')
      .select(`
        *,
        customers (id, first_name, last_name, email, phone),
        membership_plans (id, name, price)
      `)
      .eq('organization_id', this.organizationId)
      .eq('status', 'active')
      .gte('end_date', today.toISOString())
      .lt('end_date', tomorrow.toISOString());

    if (error) {
      console.error('Error fetching expiring memberships:', error);
      return [];
    }

    return data || [];
  }

  async getBranches(): Promise<{ id: number; name: string }[]> {
    const { data, error } = await supabase
      .from('branches')
      .select('id, name')
      .eq('organization_id', this.organizationId)
      .eq('is_active', true)
      .order('name');

    if (error) {
      console.error('Error fetching branches:', error);
      return [];
    }

    return data || [];
  }

  private async logEvent(
    membershipId: number,
    eventType: string,
    description: string,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    try {
      await supabase.from('membership_events').insert({
        membership_id: membershipId,
        event_type: eventType,
        description,
        metadata,
        created_at: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Error logging event:', error);
    }
  }
}

export default GymCheckinService;
