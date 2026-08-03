import { supabase } from '@/lib/supabase/config';
import { getOrganizationId, getCurrentBranchId, getBranchFilter, getCurrentUserId } from '@/lib/hooks/useOrganization';
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
  CreateCashMovementData,
  SessionPaymentDetail,
  SessionMovementType
} from './types';

export class CajasService {
  // Se leen en tiempo de llamada (no en import) para reflejar la organización/sucursal activa
  private static get organizationId(): number | null {
    return getOrganizationId();
  }
  private static get branchId(): number | null {
    return getCurrentBranchId();
  }

  /**
   * Obtiene la sesión de caja activa para la sucursal actual.
   * Busca primero una caja de la sucursal, si no hay, busca una caja global (branch_id = null).
   * No filtra por usuario: la caja es de la sucursal, todos los usuarios la comparten.
   */
  static async getActiveSession(): Promise<CashSession | null> {
    try {
      if (!this.organizationId) {
        return null;
      }

      // 1. Buscar caja abierta de la sucursal actual
      if (this.branchId) {
        const { data: branchSession, error: branchError } = await supabase
          .from('cash_sessions')
          .select('*')
          .eq('organization_id', this.organizationId)
          .eq('branch_id', this.branchId)
          .eq('status', 'open')
          .order('opened_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (branchError && branchError.code !== 'PGRST116') {
          throw branchError;
        }

        if (branchSession) {
          return this.enrichSession(branchSession);
        }
      }

      // 2. Buscar caja global (branch_id = null)
      const { data: globalSession, error: globalError } = await supabase
        .from('cash_sessions')
        .select('*')
        .eq('organization_id', this.organizationId)
        .is('branch_id', null)
        .eq('status', 'open')
        .order('opened_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (globalError && globalError.code !== 'PGRST116') {
        throw globalError;
      }

      if (globalSession) {
        return this.enrichSession(globalSession);
      }

      return null;
    } catch (error) {
      console.error('Error getting active session:', error);
      throw error;
    }
  }

  /**
   * Enriquece una sesión con nombres de cajero y sucursal
   */
  private static async enrichSession(session: any): Promise<CashSession> {
    // Obtener nombre del cajero
    if (session?.opened_by) {
      const { data: profileData } = await supabase
        .from('profiles')
        .select('first_name, last_name')
        .eq('id', session.opened_by)
        .single();
      if (profileData) {
        session.opened_by_name = `${profileData.first_name || ''} ${profileData.last_name || ''}`.trim() || 'Usuario';
      }
    }

    // Obtener nombre de la sucursal
    if (session?.branch_id) {
      const { data: branchData } = await supabase
        .from('branches')
        .select('name')
        .eq('id', session.branch_id)
        .single();
      if (branchData) {
        session.branch_name = branchData.name;
      }
    } else {
      session.branch_name = 'Todas las sucursales';
    }

    return session;
  }

  /**
   * Cuenta cuántas cajas abiertas hay en la organización (todas las sucursales)
   */
  static async getOpenSessionsCount(): Promise<number> {
    try {
      const { count, error } = await supabase
        .from('cash_sessions')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', this.organizationId)
        .eq('status', 'open');

      if (error) throw error;
      return count || 0;
    } catch (error) {
      console.error('Error counting open sessions:', error);
      return 0;
    }
  }

  /**
   * Obtiene todas las sesiones de caja abiertas en la organización
   */
  static async getActiveSessions(): Promise<CashSession[]> {
    try {
      if (!this.organizationId) {
        return [];
      }
      const { data, error } = await supabase
        .from('cash_sessions')
        .select('*')
        .eq('organization_id', this.organizationId)
        .eq('status', 'open')
        .order('opened_at', { ascending: false });

      if (error) throw error;

      // Obtener nombres de cajeros y sucursales
      const sessions = (data || []) as any[];
      const userIds = sessions.map(s => s.opened_by).filter(Boolean);
      if (userIds.length > 0) {
        const { data: profilesData } = await supabase
          .from('profiles')
          .select('id, first_name, last_name')
          .in('id', userIds);

        const profileMap = new Map((profilesData || []).map(p => [p.id, p]));
        for (const session of sessions) {
          const profile = profileMap.get(session.opened_by);
          session.opened_by_name = profile
            ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || 'Usuario'
            : 'Usuario';
        }
      }

      // Obtener nombres de sucursales (las que tienen branch_id)
      const branchIds = [...new Set(sessions.map(s => s.branch_id).filter(Boolean))];
      if (branchIds.length > 0) {
        const { data: branchesData } = await supabase
          .from('branches')
          .select('id, name')
          .in('id', branchIds);
        const branchMap = new Map((branchesData || []).map(b => [b.id, b.name]));
        for (const session of sessions) {
          if (session.branch_id) {
            session.branch_name = branchMap.get(session.branch_id) || `#${session.branch_id}`;
          } else {
            session.branch_name = 'Todas las sucursales';
          }
        }
      } else {
        // Todas son globales
        for (const session of sessions) {
          session.branch_name = 'Todas las sucursales';
        }
      }

      return sessions;
    } catch (error) {
      console.error('Error getting active sessions:', error);
      throw error;
    }
  }

  /**
   * Obtiene el historial de sesiones con paginación
   */
  static async getSessionHistoryPaginated(
    page: number = 1,
    pageSize: number = 10,
    filters?: { status?: 'open' | 'closed' | 'all'; branchId?: number }
  ): Promise<{ data: CashSession[]; total: number }> {
    try {
      const branchId = filters?.branchId ?? this.branchId;

      let query = supabase
        .from('cash_sessions')
        .select('*', { count: 'exact' })
        .eq('organization_id', this.organizationId);

      // Si hay branchId, filtrar por esa sucursal Y las globales (branch_id null)
      if (branchId) {
        query = query.or(`branch_id.eq.${branchId},branch_id.is.null`);
      }

      if (filters?.status && filters.status !== 'all') {
        query = query.eq('status', filters.status);
      }

      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      const { data, count, error } = await query
        .order('opened_at', { ascending: false })
        .range(from, to);

      if (error) throw error;

      // Obtener nombres de cajeros y sucursales
      const sessions = (data || []) as any[];
      const userIds = sessions.map(s => s.opened_by).filter(Boolean);
      if (userIds.length > 0) {
        const { data: profilesData } = await supabase
          .from('profiles')
          .select('id, first_name, last_name')
          .in('id', userIds);

        const profileMap = new Map((profilesData || []).map(p => [p.id, p]));
        for (const session of sessions) {
          const profile = profileMap.get(session.opened_by);
          session.opened_by_name = profile
            ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || 'Usuario'
            : 'Usuario';
        }
      }

      // Obtener nombres de sucursales
      const branchIds = [...new Set(sessions.map(s => s.branch_id).filter(Boolean))];
      if (branchIds.length > 0) {
        const { data: branchesData } = await supabase
          .from('branches')
          .select('id, name')
          .in('id', branchIds);
        const branchMap = new Map((branchesData || []).map(b => [b.id, b.name]));
        for (const session of sessions) {
          if (session.branch_id) {
            session.branch_name = branchMap.get(session.branch_id) || `#${session.branch_id}`;
          } else {
            session.branch_name = 'Todas las sucursales';
          }
        }
      } else {
        for (const session of sessions) {
          session.branch_name = 'Todas las sucursales';
        }
      }

      return { data: sessions, total: count || 0 };
    } catch (error) {
      console.error('Error getting paginated session history:', error);
      throw error;
    }
  }

  /**
   * Abre una nueva sesión de caja
   * scope: 'branch' (default) = caja de la sucursal actual, 'global' = caja para todas las sucursales
   */
  static async openSession(data: OpenCashSessionData): Promise<CashSession> {
    try {
      const userId = await getCurrentUserId();
      if (!userId) {
        throw new Error('Usuario no autenticado');
      }

      const scope = data.scope || 'branch';
      const targetBranchId = scope === 'global' ? null : this.branchId;

      if (scope === 'branch' && !this.branchId) {
        throw new Error('No se pudo obtener la sucursal. Seleccione una sucursal.');
      }

      // Verificar que no haya ya una caja abierta para el mismo alcance
      let checkQuery = supabase
        .from('cash_sessions')
        .select('id')
        .eq('organization_id', this.organizationId)
        .eq('status', 'open');

      if (scope === 'global') {
        checkQuery = checkQuery.is('branch_id', null);
      } else {
        checkQuery = checkQuery.eq('branch_id', this.branchId);
      }

      const { data: existingSession } = await checkQuery.maybeSingle();

      if (existingSession) {
        throw new Error(scope === 'global'
          ? 'Ya hay una caja global abierta. Ciérrala antes de abrir otra.'
          : 'Ya hay una caja abierta en esta sucursal. Ciérrala antes de abrir otra.');
      }

      const { data: session, error } = await supabase
        .from('cash_sessions')
        .insert({
          organization_id: this.organizationId,
          branch_id: targetBranchId,
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

      // Calcular pagos en efectivo del período (ventas vs compras a proveedores)
      let cashPaymentsQuery = supabase
        .from('payments')
        .select('amount, source, change_amount')
        .eq('organization_id', this.organizationId)
        .eq('method', 'cash')
        .eq('status', 'completed')
        .gte('created_at', session.opened_at)
        .lte('created_at', session.closed_at || new Date().toISOString());
      if (session.branch_id) {
        cashPaymentsQuery = cashPaymentsQuery.eq('branch_id', session.branch_id);
      }
      const { data: cashPayments, error: paymentsError } = await cashPaymentsQuery;

      if (paymentsError) throw paymentsError;

      const PURCHASE_SOURCES = ['invoice_purchase', 'account_payable'];
      // Sumar vuelto total entregado en ventas (no en compras)
      const changeTotal = (cashPayments || [])
        .filter(p => !PURCHASE_SOURCES.includes(p.source))
        .reduce((sum, payment) => sum + Number(payment.change_amount || 0), 0);
      // salesCash = efectivo recibido - vuelto entregado
      const salesCash = (cashPayments || [])
        .filter(p => !PURCHASE_SOURCES.includes(p.source))
        .reduce((sum, payment) => sum + Number(payment.amount), 0) - changeTotal;
      const purchasesCash = (cashPayments || [])
        .filter(p => PURCHASE_SOURCES.includes(p.source))
        .reduce((sum, payment) => sum + Number(payment.amount), 0);

      // Consultar devoluciones procesadas en el período
      let returnsQuery = supabase
        .from('returns')
        .select('total_refund')
        .eq('organization_id', this.organizationId)
        .eq('status', 'processed')
        .gte('created_at', session.opened_at)
        .lte('created_at', session.closed_at || new Date().toISOString());
      if (session.branch_id) {
        returnsQuery = returnsQuery.eq('branch_id', session.branch_id);
      }
      const { data: returnsData, error: returnsError } = await returnsQuery;

      if (returnsError) {
        console.warn('Error consultando devoluciones:', returnsError);
      }
      const returnsTotal = (returnsData || []).reduce((sum, r) => sum + Number(r.total_refund), 0);

      // Consultar consumos de habitaciones (folio_items) asociados a esta sesi\u00f3n de caja
      const { data: folioItems, error: folioError } = await supabase
        .from('folio_items')
        .select('amount')
        .eq('cash_session_id', sessionId);

      if (folioError) {
        console.warn('Error consultando folio_items de la sesi\u00f3n:', folioError);
      }
      const folioConsumptionsTotal = (folioItems || []).reduce((sum, item) => sum + Number(item.amount), 0);

      // Calcular movimientos manuales de caja
      const cashIn = movements
        .filter(m => m.type === 'in')
        .reduce((sum, m) => sum + Number(m.amount), 0);

      const cashOut = movements
        .filter(m => m.type === 'out')
        .reduce((sum, m) => sum + Number(m.amount), 0);

      const expectedAmount = Number(session.initial_amount) + salesCash + cashIn - cashOut - purchasesCash - returnsTotal;

      // Obtener pagos agrupados por metodo, separando ingresos (ventas) de egresos (compras)
      let allPaymentsQuery = supabase
        .from('payments')
        .select('method, amount, source')
        .eq('organization_id', this.organizationId)
        .eq('status', 'completed')
        .gte('created_at', session.opened_at)
        .lte('created_at', session.closed_at || new Date().toISOString());
      if (session.branch_id) {
        allPaymentsQuery = allPaymentsQuery.eq('branch_id', session.branch_id);
      }
      const { data: allPayments, error: allPaymentsError } = await allPaymentsQuery;

      if (allPaymentsError) throw allPaymentsError;

      const EXPENSE_SOURCES = ['invoice_purchase', 'account_payable'];

      const incomeByMethod: Record<string, number> = {};
      const expenseByMethod: Record<string, number> = {};
      (allPayments || []).forEach(p => {
        const method = p.method || 'other';
        if (EXPENSE_SOURCES.includes(p.source)) {
          expenseByMethod[method] = (expenseByMethod[method] || 0) + Number(p.amount);
        } else {
          incomeByMethod[method] = (incomeByMethod[method] || 0) + Number(p.amount);
        }
      });

      return {
        initial_amount: Number(session.initial_amount),
        sales_cash: salesCash,
        cash_in: cashIn,
        cash_out: cashOut,
        expected_amount: expectedAmount,
        counted_amount: session.final_amount ? Number(session.final_amount) : undefined,
        difference: session.difference ? Number(session.difference) : undefined,
        change_total: changeTotal,
        returns_total: returnsTotal,
        folio_consumptions_total: folioConsumptionsTotal,
        payments_by_method: incomeByMethod,
        income_by_method: incomeByMethod,
        expense_by_method: expenseByMethod,
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

      const session = data as any;

      // Obtener nombre del cajero
      if (session?.opened_by) {
        const { data: profileData } = await supabase
          .from('profiles')
          .select('first_name, last_name')
          .eq('id', session.opened_by)
          .single();
        if (profileData) {
          session.opened_by_name = `${profileData.first_name || ''} ${profileData.last_name || ''}`.trim() || 'Usuario';
        }
      }

      // Obtener nombre de la sucursal
      if (session?.branch_id) {
        const { data: branchData } = await supabase
          .from('branches')
          .select('name')
          .eq('id', session.branch_id)
          .single();
        if (branchData) {
          session.branch_name = branchData.name;
        }
      }

      return session;
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
      const branchFilter = getBranchFilter();
      let query = supabase
        .from('cash_sessions')
        .select('*')
        .eq('organization_id', this.organizationId)
        .order('opened_at', { ascending: false });

      // Filtrar por sucursal salvo en modo "Todas las sucursales"
      if (branchFilter) {
        query = query.eq('branch_id', branchFilter);
      }

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
      // Obtener sesión con nombre del cajero
      const { data: sessionData, error: sessionError } = await supabase
        .from('cash_sessions')
        .select('*')
        .eq('id', sessionId)
        .single();

      if (sessionError) throw sessionError;

      const session = sessionData as any;
      // Obtener nombre del cajero desde profiles (no hay FK directa)
      if (session?.opened_by) {
        const { data: profileData } = await supabase
          .from('profiles')
          .select('first_name, last_name')
          .eq('id', session.opened_by)
          .single();

        if (profileData) {
          session.opened_by_name = `${profileData.first_name || ''} ${profileData.last_name || ''}`.trim() || 'Usuario';
        } else {
          session.opened_by_name = 'Usuario';
        }
      }

      // Obtener nombre de la sucursal
      if (session?.branch_id) {
        const { data: branchData } = await supabase
          .from('branches')
          .select('name')
          .eq('id', session.branch_id)
          .single();
        if (branchData) {
          session.branch_name = branchData.name;
        } else {
          session.branch_name = `#${session.branch_id}`;
        }
      } else {
        session.branch_name = 'Todas las sucursales';
      }

      const movements = await this.getSessionMovements(sessionId);
      const summary = await this.getCashSummary(sessionId);

      // Obtener resumen de ventas con change_amount
      let salesQuery = supabase
        .from('payments')
        .select('amount, method, change_amount')
        .eq('organization_id', this.organizationId)
        .eq('status', 'completed')
        .gte('created_at', session.opened_at)
        .lte('created_at', session.closed_at || new Date().toISOString());
      if (session.branch_id) {
        salesQuery = salesQuery.eq('branch_id', session.branch_id);
      }
      const { data: salesData, error: salesError } = await salesQuery;

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
        .eq('branch_id', session.branch_id)
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
   * Obtiene el detalle de cada pago (movimiento) realizado durante la sesion:
   * ventas POS, ventas de mesa, facturas de venta y facturas de compra pagadas.
   */
  static async getSessionPaymentsDetail(sessionId: number): Promise<SessionPaymentDetail[]> {
    try {
      const session = await this.getSessionById(sessionId);

      const { data: payments, error } = await supabase
        .from('payments')
        .select('id, amount, method, source, source_id, created_at, reference')
        .eq('organization_id', this.organizationId)
        .eq('branch_id', session.branch_id)
        .eq('status', 'completed')
        .gte('created_at', session.opened_at)
        .lte('created_at', session.closed_at || new Date().toISOString())
        .order('created_at', { ascending: true });

      if (error) throw error;
      if (!payments || payments.length === 0) return [];

      const invoiceSaleIds = payments.filter(p => p.source === 'invoice_sales').map(p => p.source_id);
      const invoicePurchaseIds = payments.filter(p => p.source === 'invoice_purchase').map(p => p.source_id);
      const saleIds = payments.filter(p => p.source === 'sale').map(p => p.source_id);
      const arIds = payments.filter(p => p.source === 'account_receivable').map(p => p.source_id);
      const apIds = payments.filter(p => p.source === 'account_payable').map(p => p.source_id);

      const [invoiceSalesRes, invoicePurchaseRes, salesRes, arRes, apRes] = await Promise.all([
        invoiceSaleIds.length
          ? supabase.from('invoice_sales').select('id, number, customer_id').in('id', invoiceSaleIds)
          : Promise.resolve({ data: [] as any[] }),
        invoicePurchaseIds.length
          ? supabase.from('invoice_purchase').select('id, number_ext, supplier_id').in('id', invoicePurchaseIds)
          : Promise.resolve({ data: [] as any[] }),
        saleIds.length
          ? supabase.from('sales').select('id, table_session_id, customer_id').in('id', saleIds)
          : Promise.resolve({ data: [] as any[] }),
        arIds.length
          ? supabase.from('accounts_receivable').select('id, invoice_id, customer_id').in('id', arIds)
          : Promise.resolve({ data: [] as any[] }),
        apIds.length
          ? supabase.from('accounts_payable').select('id, invoice_id, supplier_id').in('id', apIds)
          : Promise.resolve({ data: [] as any[] }),
      ]);

      const invoiceSalesMap = new Map((invoiceSalesRes.data || []).map((i: any) => [i.id, i]));
      const invoicePurchaseMap = new Map((invoicePurchaseRes.data || []).map((i: any) => [i.id, i]));
      const salesMap = new Map((salesRes.data || []).map((s: any) => [s.id, s]));
      const arMap = new Map((arRes.data || []).map((a: any) => [a.id, a]));
      const apMap = new Map((apRes.data || []).map((a: any) => [a.id, a]));

      const customerIds = new Set<string>();
      (invoiceSalesRes.data || []).forEach((i: any) => i.customer_id && customerIds.add(i.customer_id));
      (salesRes.data || []).forEach((s: any) => s.customer_id && customerIds.add(s.customer_id));
      (arRes.data || []).forEach((a: any) => a.customer_id && customerIds.add(a.customer_id));

      const supplierIds = new Set<string>();
      (invoicePurchaseRes.data || []).forEach((i: any) => i.supplier_id && supplierIds.add(i.supplier_id));
      (apRes.data || []).forEach((a: any) => a.supplier_id && supplierIds.add(a.supplier_id));

      const [customersRes, suppliersRes] = await Promise.all([
        customerIds.size
          ? supabase.from('customers').select('id, full_name, company_name').in('id', Array.from(customerIds))
          : Promise.resolve({ data: [] as any[] }),
        supplierIds.size
          ? supabase.from('suppliers').select('id, name').in('id', Array.from(supplierIds))
          : Promise.resolve({ data: [] as any[] }),
      ]);

      const customersMap = new Map((customersRes.data || []).map((c: any) => [c.id, c.company_name || c.full_name]));
      const suppliersMap = new Map((suppliersRes.data || []).map((s: any) => [s.id, s.name]));

      const details: SessionPaymentDetail[] = payments.map(p => {
        let type: SessionMovementType = 'otro';
        let direction: 'in' | 'out' = 'in';
        let label = 'Movimiento';
        let reference: string | undefined;
        let counterparty: string | undefined;

        if (p.source === 'invoice_sales') {
          const inv = invoiceSalesMap.get(p.source_id);
          type = 'venta_factura';
          direction = 'in';
          label = 'Factura de Venta';
          reference = inv?.number;
          counterparty = inv?.customer_id ? customersMap.get(inv.customer_id) : undefined;
        } else if (p.source === 'invoice_purchase') {
          const inv = invoicePurchaseMap.get(p.source_id);
          type = 'compra_factura';
          direction = 'out';
          label = 'Factura de Compra';
          reference = inv?.number_ext;
          counterparty = inv?.supplier_id ? suppliersMap.get(inv.supplier_id) : undefined;
        } else if (p.source === 'sale') {
          const sale = salesMap.get(p.source_id);
          const esMesa = !!sale?.table_session_id;
          type = esMesa ? 'venta_mesa' : 'venta_pos';
          direction = 'in';
          label = esMesa ? 'Venta de Mesa' : 'Venta POS';
          reference = p.source_id?.slice(0, 8);
          counterparty = sale?.customer_id ? customersMap.get(sale.customer_id) : undefined;
        } else if (p.source === 'account_receivable') {
          const ar = arMap.get(p.source_id);
          type = 'cuenta_por_cobrar';
          direction = 'in';
          label = 'Cuenta por Cobrar';
          counterparty = ar?.customer_id ? customersMap.get(ar.customer_id) : undefined;
        } else if (p.source === 'account_payable') {
          const ap = apMap.get(p.source_id);
          type = 'cuenta_por_pagar';
          direction = 'out';
          label = 'Cuenta por Pagar';
          counterparty = ap?.supplier_id ? suppliersMap.get(ap.supplier_id) : undefined;
        }

        return {
          id: p.id,
          type,
          direction,
          label,
          reference,
          counterparty,
          method: p.method || 'other',
          amount: Number(p.amount),
          created_at: p.created_at,
        };
      });

      return details;
    } catch (error) {
      console.error('Error getting session payments detail:', error);
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
        .eq('branch_id', session.branch_id)
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
