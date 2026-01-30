import { supabase } from '@/lib/supabase/config';
import { getOrganizationId, getCurrentBranchId, getCurrentUserId } from '@/lib/hooks/useOrganization';
import type {
  CashSession,
  CashMovement,
  CashSummary,
  OpenCashSessionData,
  CloseCashSessionData,
  CashMovementData,
  CashSessionReport,
  CashSessionFilter,
  CashCount,
  CreateCashCountData,
  CreateCashMovementData
} from './types';

export class CajasService {
  private static organizationId = getOrganizationId();
  private static branchId = getCurrentBranchId();

  /**
   * Obtiene la sesión de caja activa para la sucursal actual
   */
  static async getActiveSession(): Promise<CashSession | null> {
    try {
      const { data, error } = await supabase
        .from('cash_sessions')
        .select('*')
        .eq('organization_id', this.organizationId)
        .eq('branch_id', this.branchId)
        .eq('status', 'open')
        .order('opened_at', { ascending: false })
        .limit(1)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          // No hay sesión activa
          return null;
        }
        throw error;
      }

      return data;
    } catch (error) {
      console.error('Error getting active session:', error);
      throw error;
    }
  }

  /**
   * Abre una nueva sesión de caja
   */
  static async openSession(data: OpenCashSessionData): Promise<CashSession> {
    try {
      const userId = await getCurrentUserId();
      if (!userId) {
        throw new Error('Usuario no autenticado');
      }

      // Verificar que no hay sesión abierta
      const activeSession = await this.getActiveSession();
      if (activeSession) {
        throw new Error('Ya existe una sesión de caja abierta');
      }

      const { data: session, error } = await supabase
        .from('cash_sessions')
        .insert({
          organization_id: this.organizationId,
          branch_id: this.branchId,
          opened_by: userId,
          initial_amount: data.initial_amount,
          notes: data.notes || 'Apertura de caja',
          status: 'open'
        })
        .select()
        .single();

      if (error) throw error;

      console.log('Sesión de caja abierta:', session.id);
      return session;
    } catch (error) {
      console.error('Error opening cash session:', error);
      throw error;
    }
  }

  /**
   * Cierra la sesión de caja activa
   */
  static async closeSession(data: CloseCashSessionData): Promise<CashSession> {
    try {
      const userId = await getCurrentUserId();
      if (!userId) {
        throw new Error('Usuario no autenticado');
      }

      const activeSession = await this.getActiveSession();
      if (!activeSession) {
        throw new Error('No hay sesión de caja abierta');
      }

      // Calcular la diferencia
      const summary = await this.getCashSummary(activeSession.id);
      const difference = data.final_amount - summary.expected_amount;

      const { data: session, error } = await supabase
        .from('cash_sessions')
        .update({
          closed_at: new Date().toISOString(),
          closed_by: userId,
          final_amount: data.final_amount,
          difference: difference,
          notes: data.notes || activeSession.notes,
          status: 'closed'
        })
        .eq('id', activeSession.id)
        .select()
        .single();

      if (error) throw error;

      console.log('Sesión de caja cerrada:', session.id);
      return session;
    } catch (error) {
      console.error('Error closing cash session:', error);
      throw error;
    }
  }

  /**
   * Registra un movimiento de caja (ingreso o egreso)
   */
  static async addMovement(data: CashMovementData): Promise<CashMovement> {
    try {
      const userId = await getCurrentUserId();
      if (!userId) {
        throw new Error('Usuario no autenticado');
      }

      const activeSession = await this.getActiveSession();
      if (!activeSession) {
        throw new Error('No hay sesión de caja abierta');
      }

      const { data: movement, error } = await supabase
        .from('cash_movements')
        .insert({
          organization_id: this.organizationId,
          cash_session_id: activeSession.id,
          type: data.type,
          concept: data.concept,
          amount: data.amount,
          user_id: userId,
          notes: data.notes
        })
        .select()
        .single();

      if (error) throw error;

      console.log('Movimiento registrado:', movement.id);
      return movement;
    } catch (error) {
      console.error('Error adding cash movement:', error);
      throw error;
    }
  }

  /**
   * Obtiene los movimientos de una sesión de caja
   */
  static async getSessionMovements(sessionId: number): Promise<CashMovement[]> {
    try {
      const { data, error } = await supabase
        .from('cash_movements')
        .select('*')
        .eq('cash_session_id', sessionId)
        .order('created_at', { ascending: true });

      if (error) throw error;

      return data || [];
    } catch (error) {
      console.error('Error getting session movements:', error);
      throw error;
    }
  }

  /**
   * Calcula el resumen de efectivo para una sesión
   */
  static async getCashSummary(sessionId: number): Promise<CashSummary> {
    try {
      const session = await this.getSessionById(sessionId);
      const movements = await this.getSessionMovements(sessionId);

      // Calcular ventas en efectivo del período
      const { data: cashPayments, error: paymentsError } = await supabase
        .from('payments')
        .select('amount')
        .eq('organization_id', this.organizationId)
        .eq('branch_id', this.branchId)
        .eq('method', 'cash')
        .eq('status', 'completed')
        .gte('created_at', session.opened_at)
        .lte('created_at', session.closed_at || new Date().toISOString());

      if (paymentsError) throw paymentsError;

      const salesCash = (cashPayments || []).reduce((sum, payment) => sum + Number(payment.amount), 0);

      // Calcular movimientos
      const cashIn = movements
        .filter(m => m.type === 'in')
        .reduce((sum, m) => sum + Number(m.amount), 0);

      const cashOut = movements
        .filter(m => m.type === 'out')
        .reduce((sum, m) => sum + Number(m.amount), 0);

      const expectedAmount = Number(session.initial_amount) + salesCash + cashIn - cashOut;

      return {
        initial_amount: Number(session.initial_amount),
        sales_cash: salesCash,
        cash_in: cashIn,
        cash_out: cashOut,
        expected_amount: expectedAmount,
        counted_amount: session.final_amount ? Number(session.final_amount) : undefined,
        difference: session.difference ? Number(session.difference) : undefined
      };
    } catch (error) {
      console.error('Error calculating cash summary:', error);
      throw error;
    }
  }

  /**
   * Obtiene una sesión por ID numérico
   */
  static async getSessionById(sessionId: number): Promise<CashSession> {
    try {
      const { data, error } = await supabase
        .from('cash_sessions')
        .select('*')
        .eq('id', sessionId)
        .single();

      if (error) throw error;

      return data;
    } catch (error) {
      console.error('Error getting session by ID:', error);
      throw error;
    }
  }

  /**
   * Obtiene una sesión por UUID
   */
  static async getSessionByUuid(uuid: string): Promise<CashSession> {
    try {
      const { data, error } = await supabase
        .from('cash_sessions')
        .select('*')
        .eq('uuid', uuid)
        .single();

      if (error) throw error;

      return data;
    } catch (error) {
      console.error('Error getting session by UUID:', error);
      throw error;
    }
  }

  /**
   * Obtiene el historial de sesiones con filtros
   */
  static async getSessionHistory(filter?: CashSessionFilter): Promise<CashSession[]> {
    try {
      let query = supabase
        .from('cash_sessions')
        .select('*')
        .eq('organization_id', this.organizationId)
        .eq('branch_id', this.branchId)
        .order('opened_at', { ascending: false });

      if (filter?.status && filter.status !== 'all') {
        query = query.eq('status', filter.status);
      }

      if (filter?.date_from) {
        query = query.gte('opened_at', filter.date_from);
      }

      if (filter?.date_to) {
        query = query.lte('opened_at', filter.date_to);
      }

      const { data, error } = await query;

      if (error) throw error;

      return data || [];
    } catch (error) {
      console.error('Error getting session history:', error);
      throw error;
    }
  }

  /**
   * Genera reporte completo de una sesión para PDF
   */
  static async generateSessionReport(sessionId: number): Promise<CashSessionReport> {
    try {
      const session = await this.getSessionById(sessionId);
      const movements = await this.getSessionMovements(sessionId);
      const summary = await this.getCashSummary(sessionId);

      // Obtener resumen de ventas
      const { data: salesData, error: salesError } = await supabase
        .from('payments')
        .select('amount, method')
        .eq('organization_id', this.organizationId)
        .eq('branch_id', this.branchId)
        .eq('status', 'completed')
        .gte('created_at', session.opened_at)
        .lte('created_at', session.closed_at || new Date().toISOString());

      if (salesError) throw salesError;

      const salesSummary = {
        total_sales: (salesData || []).reduce((sum, p) => sum + Number(p.amount), 0),
        cash_sales: (salesData || []).filter(p => p.method === 'cash').reduce((sum, p) => sum + Number(p.amount), 0),
        card_sales: (salesData || []).filter(p => p.method === 'card').reduce((sum, p) => sum + Number(p.amount), 0),
        other_sales: (salesData || []).filter(p => p.method !== 'cash' && p.method !== 'card').reduce((sum, p) => sum + Number(p.amount), 0)
      };

      return {
        session,
        movements,
        summary,
        sales_summary: salesSummary
      };
    } catch (error) {
      console.error('Error generating session report:', error);
      throw error;
    }
  }

  // ===============================
  // ARQUEOS DE CAJA
  // ===============================

  /**
   * Obtiene los arqueos de una sesión de caja
   */
  static async getSessionCounts(sessionId: number): Promise<CashCount[]> {
    try {
      const { data, error } = await supabase
        .from('cash_counts')
        .select('*')
        .eq('cash_session_id', sessionId)
        .order('created_at', { ascending: true });

      if (error) throw error;

      return data || [];
    } catch (error) {
      console.error('Error getting session counts:', error);
      throw error;
    }
  }

  /**
   * Crea un arqueo de caja
   */
  static async createCashCount(sessionId: number, data: CreateCashCountData): Promise<CashCount> {
    try {
      const userId = await getCurrentUserId();
      if (!userId) {
        throw new Error('Usuario no autenticado');
      }

      // Obtener monto esperado
      const summary = await this.getCashSummary(sessionId);

      const { data: count, error } = await supabase
        .from('cash_counts')
        .insert({
          organization_id: this.organizationId,
          cash_session_id: sessionId,
          count_type: data.count_type,
          counted_amount: data.counted_amount,
          expected_amount: data.expected_amount || summary.expected_amount,
          difference: data.counted_amount - (data.expected_amount || summary.expected_amount),
          denominations: data.denominations,
          counted_by: userId,
          notes: data.notes
        })
        .select()
        .single();

      if (error) throw error;

      console.log('Arqueo registrado:', count.id);
      return count;
    } catch (error) {
      console.error('Error creating cash count:', error);
      throw error;
    }
  }

  /**
   * Registra un movimiento en una sesión específica
   */
  static async addMovementToSession(sessionId: number, data: CreateCashMovementData): Promise<CashMovement> {
    try {
      const userId = await getCurrentUserId();
      if (!userId) {
        throw new Error('Usuario no autenticado');
      }

      const { data: movement, error } = await supabase
        .from('cash_movements')
        .insert({
          organization_id: this.organizationId,
          cash_session_id: sessionId,
          type: data.type,
          concept: data.concept,
          amount: data.amount,
          user_id: userId,
          notes: data.notes
        })
        .select()
        .single();

      if (error) throw error;

      console.log('Movimiento registrado en sesión:', movement.id);
      return movement;
    } catch (error) {
      console.error('Error adding movement to session:', error);
      throw error;
    }
  }

  /**
   * Obtiene detalle completo de una sesión con movimientos y arqueos (por ID numérico)
   */
  static async getSessionDetail(sessionId: number): Promise<{
    session: CashSession;
    movements: CashMovement[];
    counts: CashCount[];
    summary: CashSummary;
  }> {
    try {
      const [session, movements, counts, summary] = await Promise.all([
        this.getSessionById(sessionId),
        this.getSessionMovements(sessionId),
        this.getSessionCounts(sessionId),
        this.getCashSummary(sessionId)
      ]);

      return { session, movements, counts, summary };
    } catch (error) {
      console.error('Error getting session detail:', error);
      throw error;
    }
  }

  /**
   * Obtiene detalle completo de una sesión por UUID
   */
  static async getSessionDetailByUuid(uuid: string): Promise<{
    session: CashSession;
    movements: CashMovement[];
    counts: CashCount[];
    summary: CashSummary;
  }> {
    try {
      const session = await this.getSessionByUuid(uuid);
      const [movements, counts, summary] = await Promise.all([
        this.getSessionMovements(session.id),
        this.getSessionCounts(session.id),
        this.getCashSummary(session.id)
      ]);

      return { session, movements, counts, summary };
    } catch (error) {
      console.error('Error getting session detail by UUID:', error);
      throw error;
    }
  }

  /**
   * Obtiene resumen de caja por UUID
   */
  static async getCashSummaryByUuid(uuid: string): Promise<CashSummary> {
    const session = await this.getSessionByUuid(uuid);
    return this.getCashSummary(session.id);
  }

  /**
   * Crea arqueo por UUID de sesión
   */
  static async createCashCountByUuid(uuid: string, data: CreateCashCountData): Promise<CashCount> {
    const session = await this.getSessionByUuid(uuid);
    return this.createCashCount(session.id, data);
  }

  /**
   * Registra movimiento por UUID de sesión
   */
  static async addMovementToSessionByUuid(uuid: string, data: CreateCashMovementData): Promise<CashMovement> {
    const session = await this.getSessionByUuid(uuid);
    return this.addMovementToSession(session.id, data);
  }

  /**
   * Obtiene ventas por UUID de sesión
   */
  static async getSessionSalesByUuid(uuid: string): Promise<any[]> {
    const session = await this.getSessionByUuid(uuid);
    return this.getSessionSales(session.id);
  }

  /**
   * Obtiene pagos por método por UUID de sesión
   */
  static async getSessionPaymentsByMethodByUuid(uuid: string): Promise<Record<string, number>> {
    const session = await this.getSessionByUuid(uuid);
    return this.getSessionPaymentsByMethod(session.id);
  }

  /**
   * Obtiene las ventas de una sesión de caja
   */
  static async getSessionSales(sessionId: number): Promise<any[]> {
    try {
      const session = await this.getSessionById(sessionId);

      const { data, error } = await supabase
        .from('sales')
        .select('id, total, status, payment_status, created_at, customer_id')
        .eq('organization_id', this.organizationId)
        .eq('branch_id', this.branchId)
        .gte('created_at', session.opened_at)
        .lte('created_at', session.closed_at || new Date().toISOString())
        .order('created_at', { ascending: false });

      if (error) throw error;

      return data || [];
    } catch (error) {
      console.error('Error getting session sales:', error);
      throw error;
    }
  }

  /**
   * Obtiene los pagos de una sesión de caja agrupados por método
   */
  static async getSessionPaymentsByMethod(sessionId: number): Promise<Record<string, number>> {
    try {
      const session = await this.getSessionById(sessionId);

      const { data, error } = await supabase
        .from('payments')
        .select('method, amount')
        .eq('organization_id', this.organizationId)
        .eq('branch_id', this.branchId)
        .eq('status', 'completed')
        .gte('created_at', session.opened_at)
        .lte('created_at', session.closed_at || new Date().toISOString());

      if (error) throw error;

      const paymentsByMethod: Record<string, number> = {};
      (data || []).forEach(p => {
        const method = p.method || 'other';
        paymentsByMethod[method] = (paymentsByMethod[method] || 0) + Number(p.amount);
      });

      return paymentsByMethod;
    } catch (error) {
      console.error('Error getting session payments by method:', error);
      throw error;
    }
  }
}
