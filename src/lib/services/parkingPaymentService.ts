import { supabase } from '@/lib/supabase/config';
import { resolveOrgCurrency } from '@/lib/services/monedaOrganizacion';
import { resolveTimezone } from '@/lib/services/timezoneResolver';
import { getDayRange } from '@/lib/utils/dateRanges';
import parkingService from '@/lib/services/parkingService';

export interface ParkingSession {
  id: string;
  branch_id: number;
  vehicle_plate: string;
  vehicle_type: string;
  entry_at: string;
  exit_at?: string;
  duration_min?: number;
  amount?: number;
  status: 'open' | 'closed';
}

export interface ParkingPassWithRelations {
  id: string;
  organization_id: number;
  plan_name: string;
  price: number;
  status: string;
  customer?: {
    id: string;
    full_name: string;
    email?: string;
    phone?: string;
  };
  pass_type?: {
    name: string;
    price: number;
  };
}

export interface ParkingPayment {
  id: string;
  organization_id: number;
  branch_id: number;
  source: 'parking_session' | 'parking_pass';
  source_id: string;
  method: string;
  amount: number;
  currency: string;
  reference?: string;
  processor_response?: Record<string, unknown>;
  status: 'pending' | 'completed' | 'reversed' | 'failed';
  created_by?: string;
  created_at: string;
  updated_at: string;
  // Relaciones
  session?: {
    id: string;
    vehicle_plate: string;
    vehicle_type: string;
    entry_at: string;
    exit_at?: string;
    amount?: number;
  };
  pass?: {
    id: string;
    plan_name: string;
    customer?: {
      full_name: string;
      email?: string;
    };
  };
  payment_method?: {
    code: string;
    name: string;
  };
}

export interface PaymentMethod {
  code: string;
  name: string;
  requires_reference: boolean;
  is_active: boolean;
}

export interface OrganizationPaymentMethod {
  id: number;
  organization_id: number;
  payment_method_code: string;
  is_active: boolean;
  payment_method?: PaymentMethod;
}

export interface PaymentStats {
  total_payments: number;
  total_amount: number;
  sessions_paid: number;
  passes_paid: number;
  pending_amount: number;
  reversed_amount: number;
}

export interface CreatePaymentData {
  organization_id: number;
  branch_id: number;
  source: 'parking_session' | 'parking_pass';
  source_id: string;
  method: string;
  amount: number;
  currency?: string;
  reference?: string;
  created_by?: string;
}

class ParkingPaymentService {
  /**
   * Obtener métodos de pago activos de la organización
   */
  async getPaymentMethods(organizationId: number): Promise<OrganizationPaymentMethod[]> {
    try {
      const { data, error } = await supabase
        .from('organization_payment_methods')
        .select(`
          *,
          payment_method:payment_methods!payment_method_code(code, name, requires_reference, is_active)
        `)
        .eq('organization_id', organizationId)
        .eq('is_active', true);

      if (error) throw error;
      return (data || []) as OrganizationPaymentMethod[];
    } catch (error) {
      console.error('Error obteniendo métodos de pago:', error);
      throw error;
    }
  }

  /**
   * Obtener pagos de parking con filtros
   */
  async getPayments(
    organizationId: number,
    filters?: {
      startDate?: string;
      endDate?: string;
      source?: 'parking_session' | 'parking_pass' | 'all';
      status?: 'pending' | 'completed' | 'reversed' | 'all';
      method?: string;
      search?: string;
    },
    branchId?: number | null
  ): Promise<ParkingPayment[]> {
    try {
      let query = supabase
        .from('payments')
        .select('*')
        .eq('organization_id', organizationId)
        .in('source', ['parking_session', 'parking_pass'])
        .order('created_at', { ascending: false });

      if (branchId != null) {
        query = query.eq('branch_id', branchId);
      }

      const rango = await this.rangoDeDias(organizationId, branchId ?? null, filters?.startDate, filters?.endDate);
      if (rango.desde) query = query.gte('created_at', rango.desde);
      if (rango.hasta) query = query.lte('created_at', rango.hasta);

      if (filters?.source && filters.source !== 'all') {
        query = query.eq('source', filters.source);
      }

      if (filters?.status && filters.status !== 'all') {
        query = query.eq('status', filters.status);
      }

      if (filters?.method) {
        query = query.eq('method', filters.method);
      }

      const { data, error } = await query;
      if (error) throw error;

      // Enriquecer con datos de sesión o pase
      const enrichedData = await Promise.all(
        (data || []).map(async (payment) => {
          if (payment.source === 'parking_session') {
            const { data: session } = await supabase
              .from('parking_sessions')
              .select('id, vehicle_plate, vehicle_type, entry_at, exit_at, amount')
              .eq('id', payment.source_id)
              .single();
            return { ...payment, session };
          } else if (payment.source === 'parking_pass') {
            const { data: pass } = await supabase
              .from('parking_passes')
              .select('id, plan_name, customer:customers(full_name, email)')
              .eq('id', payment.source_id)
              .single();
            return { ...payment, pass };
          }
          return payment;
        })
      );

      // Filtrar por búsqueda si se especifica
      if (filters?.search) {
        const searchLower = filters.search.toLowerCase();
        return enrichedData.filter((p) => {
          const plate = p.session?.vehicle_plate?.toLowerCase() || '';
          const planName = p.pass?.plan_name?.toLowerCase() || '';
          const customerName = p.pass?.customer?.full_name?.toLowerCase() || '';
          const reference = p.reference?.toLowerCase() || '';
          return (
            plate.includes(searchLower) ||
            planName.includes(searchLower) ||
            customerName.includes(searchLower) ||
            reference.includes(searchLower)
          );
        });
      }

      return enrichedData as ParkingPayment[];
    } catch (error) {
      console.error('Error obteniendo pagos:', error);
      throw error;
    }
  }

  /**
   * Obtener estadísticas de pagos
   */
  async getPaymentStats(
    organizationId: number,
    startDate?: string,
    endDate?: string,
    branchId?: number | null
  ): Promise<PaymentStats> {
    try {
      let query = supabase
        .from('payments')
        .select('*')
        .eq('organization_id', organizationId)
        .in('source', ['parking_session', 'parking_pass']);

      if (branchId != null) {
        query = query.eq('branch_id', branchId);
      }

      const rango = await this.rangoDeDias(organizationId, branchId ?? null, startDate, endDate);
      if (rango.desde) query = query.gte('created_at', rango.desde);
      if (rango.hasta) query = query.lte('created_at', rango.hasta);

      const { data, error } = await query;
      if (error) throw error;

      const payments = data || [];
      const completed = payments.filter((p) => p.status === 'completed');
      const pending = payments.filter((p) => p.status === 'pending');
      const reversed = payments.filter((p) => p.status === 'reversed');

      return {
        total_payments: completed.length,
        total_amount: completed.reduce((sum, p) => sum + Number(p.amount || 0), 0),
        sessions_paid: completed.filter((p) => p.source === 'parking_session').length,
        passes_paid: completed.filter((p) => p.source === 'parking_pass').length,
        pending_amount: pending.reduce((sum, p) => sum + Number(p.amount || 0), 0),
        reversed_amount: reversed.reduce((sum, p) => sum + Number(p.amount || 0), 0),
      };
    } catch (error) {
      console.error('Error obteniendo estadísticas:', error);
      throw error;
    }
  }

  /**
   * Registra un cobro de parqueadero: la fila en `payments` y su vínculo en
   * `parking_payments` (el detalle de la sesión lee los pagos por ese vínculo).
   * Es el ÚNICO lugar del módulo que inserta pagos: operación, mapa, detalle de
   * sesión, pantalla de Pagos y factura pasan por aquí.
   *
   * `source` es 'parking_session' o 'parking_pass': con cualquier otro valor
   * (p. ej. 'parking') el pago no aparece en Pagos ni lo asienta
   * `trg_auto_journal_parking_payment`.
   */
  async registrarPago(data: CreatePaymentData): Promise<ParkingPayment> {
    // `payments.currency` es NOT NULL y no tiene trigger: la que traiga el
    // pago o, si no, la moneda base de la organización.
    const currency = data.currency || (await resolveOrgCurrency(supabase, data.organization_id)).code;
    const { data: payment, error } = await supabase
      .from('payments')
      .insert({
        organization_id: data.organization_id,
        branch_id: data.branch_id,
        source: data.source,
        source_id: data.source_id,
        method: data.method,
        amount: data.amount,
        currency,
        reference: data.reference ?? null,
        created_by: data.created_by ?? null,
        status: 'completed',
      })
      .select()
      .single();

    if (error) throw error;

    const { error: linkError } = await supabase.from('parking_payments').insert({
      payment_id: payment.id,
      branch_id: data.branch_id,
      parking_session_id: data.source === 'parking_session' ? data.source_id : null,
      parking_pass_id: data.source === 'parking_pass' ? data.source_id : null,
    });
    if (linkError) throw linkError;

    return payment as ParkingPayment;
  }

  /**
   * Registrar un pago manual (pantalla Pagos). Si es de una sesión abierta, la
   * cierra con el monto cobrado.
   */
  async createPayment(data: CreatePaymentData): Promise<ParkingPayment> {
    try {
      const payment = await this.registrarPago(data);

      if (data.source === 'parking_session') {
        // Antes se cerraba solo con `status`: sin `exit_at` ni `amount`, la
        // sesión quedaba con 0 y sin hora de salida.
        await parkingService.registerExit(data.source_id, data.amount);
      }

      return payment;
    } catch (error) {
      console.error('Error registrando pago:', error);
      throw error;
    }
  }

  /**
   * Días calendario (YYYY-MM-DD) de los filtros → instantes en la zona de la
   * organización. `payments.created_at` es timestamptz: comparar contra
   * '2026-10-06' es comparar contra la medianoche UTC, y un rango de un solo
   * día salía vacío.
   */
  private async rangoDeDias(
    organizationId: number,
    branchId: number | null,
    desde?: string,
    hasta?: string,
  ): Promise<{ desde?: string; hasta?: string }> {
    if (!desde && !hasta) return {};
    const zona = await resolveTimezone(organizationId, branchId);
    return {
      desde: desde ? getDayRange(desde, zona).start : undefined,
      hasta: hasta ? getDayRange(hasta, zona).end : undefined,
    };
  }

  /**
   * Reversar un pago (requiere permisos)
   */
  async reversePayment(paymentId: string, reason?: string): Promise<ParkingPayment> {
    try {
      const { data: payment, error } = await supabase
        .from('payments')
        .update({
          status: 'reversed',
          processor_response: { reversal_reason: reason, reversed_at: new Date().toISOString() },
          updated_at: new Date().toISOString(),
        })
        .eq('id', paymentId)
        .select()
        .single();

      if (error) throw error;
      return payment as ParkingPayment;
    } catch (error) {
      console.error('Error reversando pago:', error);
      throw error;
    }
  }

  /**
   * Obtener sesiones pendientes de pago
   */
  async getPendingSessions(branchId: number): Promise<ParkingSession[]> {
    try {
      const { data, error } = await supabase
        .from('parking_sessions')
        .select('*')
        .eq('branch_id', branchId)
        .eq('status', 'open')
        .order('entry_at', { ascending: false });

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error obteniendo sesiones pendientes:', error);
      throw error;
    }
  }

  /**
   * Obtener pases pendientes de pago
   */
  async getPendingPasses(organizationId: number): Promise<ParkingPassWithRelations[]> {
    try {
      const { data, error } = await supabase
        .from('parking_passes')
        .select(`
          *,
          customer:customers(id, full_name, email, phone),
          pass_type:parking_pass_types(name, price)
        `)
        .eq('organization_id', organizationId)
        .eq('status', 'active')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error obteniendo pases pendientes:', error);
      throw error;
    }
  }
}

const parkingPaymentService = new ParkingPaymentService();
export default parkingPaymentService;
