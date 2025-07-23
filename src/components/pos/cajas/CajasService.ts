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
  CashSessionFilter
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
   * Obtiene una sesión por ID
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
}
