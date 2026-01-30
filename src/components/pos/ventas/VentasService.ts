import { supabase } from '@/lib/supabase/config';
import { getOrganizationId, getCurrentBranchId } from '@/lib/hooks/useOrganization';
import { SaleWithDetails, SalesFilter, DailySummary, CashSession, CashCount } from './types';

export class VentasService {
  // Obtener ventas con filtros y paginación
  static async getSales(
    filter: SalesFilter = {},
    page: number = 1,
    limit: number = 20
  ): Promise<{ data: SaleWithDetails[]; total: number }> {
    const organizationId = getOrganizationId();
    const branchId = getCurrentBranchId();
    const offset = (page - 1) * limit;

    try {
      // Consulta principal de ventas
      let query = supabase
        .from('sales')
        .select('*', { count: 'exact' })
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (branchId) {
        query = query.eq('branch_id', branchId);
      }

      if (filter.status && filter.status !== 'all') {
        query = query.eq('status', filter.status);
      }

      if (filter.payment_status && filter.payment_status !== 'all') {
        query = query.eq('payment_status', filter.payment_status);
      }

      if (filter.date_from) {
        query = query.gte('sale_date', filter.date_from);
      }

      if (filter.date_to) {
        query = query.lte('sale_date', filter.date_to);
      }

      if (filter.customer_id) {
        query = query.eq('customer_id', filter.customer_id);
      }

      if (filter.search) {
        query = query.or(`notes.ilike.%${filter.search}%`);
      }

      const { data, error, count } = await query;

      if (error) {
        console.error('Error fetching sales:', error.message, error.details, error.hint);
        throw error;
      }

      // Obtener clientes para las ventas que tienen customer_id
      const customerIds = Array.from(new Set((data || []).filter(s => s.customer_id).map(s => s.customer_id)));
      let customersMap: Record<string, any> = {};

      if (customerIds.length > 0) {
        const { data: customers } = await supabase
          .from('customers')
          .select('id, full_name, email, phone, doc_number')
          .in('id', customerIds);

        if (customers) {
          customers.forEach(c => { customersMap[c.id] = c; });
        }
      }

      // Obtener items para las ventas
      const saleIds = (data || []).map(s => s.id);
      let itemsMap: Record<string, any[]> = {};

      if (saleIds.length > 0) {
        const { data: items } = await supabase
          .from('sale_items')
          .select('id, sale_id, product_id, quantity, unit_price, total, tax_amount, discount_amount, notes')
          .in('sale_id', saleIds);

        if (items) {
          items.forEach(item => {
            if (!itemsMap[item.sale_id]) itemsMap[item.sale_id] = [];
            itemsMap[item.sale_id].push(item);
          });
        }
      }

      const sales: SaleWithDetails[] = (data || []).map(sale => ({
        ...sale,
        customer: sale.customer_id ? customersMap[sale.customer_id] : undefined,
        items: itemsMap[sale.id] || []
      }));

      return { data: sales, total: count || 0 };
    } catch (err: any) {
      console.error('Error in getSales:', err?.message || err);
      return { data: [], total: 0 };
    }
  }

  // Obtener venta por ID con detalles completos
  static async getSaleById(saleId: string): Promise<SaleWithDetails | null> {
    try {
      // Consulta principal de la venta
      const { data, error } = await supabase
        .from('sales')
        .select('*')
        .eq('id', saleId)
        .single();

      if (error) {
        console.error('Error fetching sale:', error.message, error.details);
        return null;
      }

      if (!data) return null;

      // Obtener cliente si existe
      let customer = undefined;
      if (data.customer_id) {
        const { data: customerData } = await supabase
          .from('customers')
          .select('id, full_name, email, phone, doc_number, address')
          .eq('id', data.customer_id)
          .single();
        customer = customerData;
      }

      // Obtener items de la venta
      const { data: saleItems } = await supabase
        .from('sale_items')
        .select('id, product_id, quantity, unit_price, total, tax_amount, tax_rate, discount_amount, notes')
        .eq('sale_id', saleId);

      // Obtener productos para los items
      const productIds = (saleItems || []).filter(i => i.product_id).map(i => i.product_id);
      let productsMap: Record<number, any> = {};

      if (productIds.length > 0) {
        const { data: products } = await supabase
          .from('products')
          .select('id, name, sku, barcode')
          .in('id', productIds);

        if (products) {
          products.forEach(p => { productsMap[p.id] = p; });
        }
      }

      // Combinar items con productos
      const itemsWithProducts = (saleItems || []).map(item => ({
        ...item,
        products: item.product_id ? productsMap[item.product_id] : undefined
      }));

      // Obtener pagos
      const { data: payments } = await supabase
        .from('payments')
        .select('*')
        .eq('source', 'sale')
        .eq('source_id', saleId);

      return {
        ...data,
        customer,
        items: itemsWithProducts,
        payments: payments || []
      };
    } catch (err: any) {
      console.error('Error in getSaleById:', err?.message || err);
      return null;
    }
  }

  // Obtener resumen del día
  static async getDailySummary(date?: string): Promise<DailySummary> {
    const organizationId = getOrganizationId();
    const branchId = getCurrentBranchId();
    const targetDate = date || new Date().toISOString().split('T')[0];

    const startOfDay = `${targetDate}T00:00:00`;
    const endOfDay = `${targetDate}T23:59:59`;

    let query = supabase
      .from('sales')
      .select('id, total, tax_total, discount_total, status, payment_status')
      .eq('organization_id', organizationId)
      .gte('sale_date', startOfDay)
      .lte('sale_date', endOfDay);

    if (branchId) {
      query = query.eq('branch_id', branchId);
    }

    const { data: sales, error } = await query;

    if (error) {
      console.error('Error fetching daily summary:', error);
      throw error;
    }

    const summary: DailySummary = {
      total_sales: sales?.length || 0,
      total_amount: 0,
      total_tax: 0,
      total_discount: 0,
      payment_methods: [],
      pending_count: 0,
      completed_count: 0,
      cancelled_count: 0
    };

    (sales || []).forEach(sale => {
      summary.total_amount += Number(sale.total) || 0;
      summary.total_tax += Number(sale.tax_total) || 0;
      summary.total_discount += Number(sale.discount_total) || 0;

      if (sale.status === 'pending') summary.pending_count++;
      if (sale.status === 'completed') summary.completed_count++;
      if (sale.status === 'cancelled') summary.cancelled_count++;
    });

    return summary;
  }

  // Sesión de caja actual
  static async getCurrentCashSession(): Promise<CashSession | null> {
    const organizationId = getOrganizationId();
    const branchId = getCurrentBranchId();

    const { data, error } = await supabase
      .from('cash_sessions')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('branch_id', branchId)
      .eq('status', 'open')
      .order('opened_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('Error fetching cash session:', error);
      return null;
    }

    return data;
  }

  // Abrir caja
  static async openCashSession(initialAmount: number, notes?: string): Promise<CashSession> {
    const organizationId = getOrganizationId();
    const branchId = getCurrentBranchId();
    
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) throw new Error('Usuario no autenticado');

    const { data, error } = await supabase
      .from('cash_sessions')
      .insert({
        organization_id: organizationId,
        branch_id: branchId,
        opened_by: userData.user.id,
        opened_at: new Date().toISOString(),
        initial_amount: initialAmount,
        status: 'open',
        notes
      })
      .select()
      .single();

    if (error) throw error;

    // Crear arqueo de apertura
    await supabase.from('cash_counts').insert({
      organization_id: organizationId,
      cash_session_id: data.id,
      count_type: 'opening',
      counted_amount: initialAmount,
      counted_by: userData.user.id
    });

    return data;
  }

  // Cerrar caja
  static async closeCashSession(
    sessionId: number,
    finalAmount: number,
    denominations?: CashCount['denominations'],
    notes?: string
  ): Promise<CashSession> {
    const organizationId = getOrganizationId();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) throw new Error('Usuario no autenticado');

    // Calcular monto esperado
    const { data: movements } = await supabase
      .from('cash_movements')
      .select('amount, type')
      .eq('cash_session_id', sessionId);

    const { data: session } = await supabase
      .from('cash_sessions')
      .select('initial_amount')
      .eq('id', sessionId)
      .single();

    let expectedAmount = Number(session?.initial_amount) || 0;
    (movements || []).forEach(m => {
      if (m.type === 'in') expectedAmount += Number(m.amount);
      else expectedAmount -= Number(m.amount);
    });

    const difference = finalAmount - expectedAmount;

    // Actualizar sesión
    const { data, error } = await supabase
      .from('cash_sessions')
      .update({
        closed_at: new Date().toISOString(),
        closed_by: userData.user.id,
        final_amount: finalAmount,
        difference,
        status: 'closed',
        notes
      })
      .eq('id', sessionId)
      .select()
      .single();

    if (error) throw error;

    // Crear arqueo de cierre
    await supabase.from('cash_counts').insert({
      organization_id: organizationId,
      cash_session_id: sessionId,
      count_type: 'closing',
      counted_amount: finalAmount,
      expected_amount: expectedAmount,
      denominations,
      counted_by: userData.user.id
    });

    return data;
  }

  // Anular venta
  static async cancelSale(saleId: string, reason?: string): Promise<boolean> {
    const { data: userData } = await supabase.auth.getUser();

    const { error } = await supabase
      .from('sales')
      .update({
        status: 'cancelled',
        notes: reason ? `[ANULADA] ${reason}` : '[ANULADA]',
        updated_at: new Date().toISOString()
      })
      .eq('id', saleId);

    if (error) {
      console.error('Error cancelling sale:', error);
      return false;
    }

    // TODO: Registrar en audit_log

    return true;
  }

  // Duplicar venta como base para nueva
  static async duplicateSale(saleId: string): Promise<{ items: any[] } | null> {
    const { data, error } = await supabase
      .from('sale_items')
      .select(`
        product_id,
        quantity,
        unit_price,
        tax_rate,
        discount_amount,
        products (id, name, sku, price)
      `)
      .eq('sale_id', saleId);

    if (error) {
      console.error('Error duplicating sale:', error);
      return null;
    }

    return { items: data || [] };
  }
}
