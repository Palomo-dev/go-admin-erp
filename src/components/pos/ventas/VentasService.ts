import { supabase } from '@/lib/supabase/config';
import { getOrganizationId, getCurrentBranchId } from '@/lib/hooks/useOrganization';
import { SaleWithDetails, SalesFilter, DailySummary, CashSession, CashCount } from './types';

export class VentasService {
  // Obtener ventas con filtros y paginación (POS + Web)
  static async getSales(
    filter: SalesFilter = {},
    page: number = 1,
    limit: number = 20
  ): Promise<{ data: SaleWithDetails[]; total: number }> {
    const organizationId = getOrganizationId();
    const branchId = getCurrentBranchId();
    const sourceType = filter.source_type || 'all';

    try {
      let posSales: any[] = [];
      let posCount = 0;
      let webSales: any[] = [];
      let webCount = 0;

      // ── Ventas POS (tabla sales) ──
      if (sourceType === 'all' || sourceType === 'pos') {
        let query = supabase
          .from('sales')
          .select('*', { count: 'exact' })
          .eq('organization_id', organizationId)
          .order('created_at', { ascending: false });

        if (branchId) query = query.eq('branch_id', branchId);
        if (filter.status && filter.status !== 'all') query = query.eq('status', filter.status);
        if (filter.payment_status && filter.payment_status !== 'all') query = query.eq('payment_status', filter.payment_status);
        if (filter.date_from) query = query.gte('sale_date', filter.date_from);
        if (filter.date_to) query = query.lte('sale_date', filter.date_to);
        if (filter.customer_id) query = query.eq('customer_id', filter.customer_id);
        if (filter.search) query = query.or(`notes.ilike.%${filter.search}%`);

        const { data, error, count } = await query;
        if (error) console.error('Error fetching POS sales:', error.message);
        posSales = (data || []).map(s => ({ ...s, _source: 'pos' as const }));
        posCount = count || 0;
      }

      // ── Ventas Web (tabla web_orders) ──
      if (sourceType === 'all' || sourceType === 'web') {
        let wQuery = supabase
          .from('web_orders')
          .select('*', { count: 'exact' })
          .eq('organization_id', organizationId)
          .order('created_at', { ascending: false });

        if (filter.status && filter.status !== 'all') {
          const statusMap: Record<string, string> = { completed: 'confirmed', pending: 'pending', cancelled: 'cancelled' };
          wQuery = wQuery.eq('status', statusMap[filter.status] || filter.status);
        }
        if (filter.payment_status && filter.payment_status !== 'all') wQuery = wQuery.eq('payment_status', filter.payment_status);
        if (filter.date_from) wQuery = wQuery.gte('created_at', `${filter.date_from}T00:00:00`);
        if (filter.date_to) wQuery = wQuery.lte('created_at', `${filter.date_to}T23:59:59`);
        if (filter.customer_id) wQuery = wQuery.eq('customer_id', filter.customer_id);
        if (filter.search) wQuery = wQuery.or(`order_number.ilike.%${filter.search}%,customer_name.ilike.%${filter.search}%,customer_notes.ilike.%${filter.search}%`);

        const { data: wData, error: wError, count: wCount } = await wQuery;
        if (wError) console.error('Error fetching web orders:', wError.message);
        webSales = (wData || []).map(wo => ({
          id: wo.id,
          organization_id: wo.organization_id,
          branch_id: wo.branch_id,
          customer_id: wo.customer_id,
          sale_date: wo.created_at,
          invoice_number: wo.order_number,
          subtotal: Number(wo.subtotal) || 0,
          tax_total: Number(wo.tax_total) || 0,
          discount_total: Number(wo.discount_total) || 0,
          total: Number(wo.total) || 0,
          status: wo.status === 'confirmed' || wo.status === 'delivered' ? 'completed' : wo.status,
          payment_status: wo.payment_status,
          payment_method: wo.payment_method,
          notes: wo.customer_notes || wo.internal_notes,
          created_at: wo.created_at,
          updated_at: wo.updated_at,
          _source: 'web' as const,
          _customer_name: wo.customer_name,
          _customer_email: wo.customer_email,
          _customer_phone: wo.customer_phone,
        }));
        webCount = wCount || 0;
      }

      // ── Combinar, ordenar y paginar ──
      const combined = [...posSales, ...webSales]
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      const totalCount = posCount + webCount;
      const offset = (page - 1) * limit;
      const paginated = combined.slice(offset, offset + limit);

      // ── Obtener clientes de BD (solo para POS que tienen customer_id) ──
      const posCustomerIds = Array.from(new Set(paginated.filter(s => s.customer_id && s._source === 'pos').map(s => s.customer_id)));
      let customersMap: Record<string, any> = {};

      if (posCustomerIds.length > 0) {
        const { data: customers } = await supabase
          .from('customers')
          .select('id, full_name, email, phone, doc_number')
          .in('id', posCustomerIds);
        if (customers) customers.forEach(c => { customersMap[c.id] = c; });
      }

      // ── Obtener items POS ──
      const posSaleIds = paginated.filter(s => s._source === 'pos').map(s => s.id);
      let itemsMap: Record<string, any[]> = {};

      if (posSaleIds.length > 0) {
        const { data: items } = await supabase
          .from('sale_items')
          .select('id, sale_id, product_id, quantity, unit_price, total, tax_amount, discount_amount, notes')
          .in('sale_id', posSaleIds);
        if (items) items.forEach(item => {
          if (!itemsMap[item.sale_id]) itemsMap[item.sale_id] = [];
          itemsMap[item.sale_id].push(item);
        });
      }

      // ── Obtener items Web ──
      const webOrderIds = paginated.filter(s => s._source === 'web').map(s => s.id);
      if (webOrderIds.length > 0) {
        const { data: webItems } = await supabase
          .from('web_order_items')
          .select('id, web_order_id, product_id, product_name, quantity, unit_price, total')
          .in('web_order_id', webOrderIds);
        if (webItems) webItems.forEach(item => {
          const key = item.web_order_id;
          if (!itemsMap[key]) itemsMap[key] = [];
          itemsMap[key].push({ ...item, sale_id: key });
        });
      }

      const sales: SaleWithDetails[] = paginated.map(sale => ({
        ...sale,
        customer: sale._source === 'web'
          ? { full_name: sale._customer_name, email: sale._customer_email, phone: sale._customer_phone }
          : (sale.customer_id ? customersMap[sale.customer_id] : undefined),
        items: itemsMap[sale.id] || [],
      }));

      return { data: sales, total: totalCount };
    } catch (err: any) {
      console.error('Error in getSales:', err?.message || err);
      return { data: [], total: 0 };
    }
  }

  // Obtener venta por ID con detalles completos (POS o Web)
  static async getSaleById(saleId: string): Promise<SaleWithDetails | null> {
    try {
      // 1. Intentar buscar en tabla sales (POS)
      const { data, error } = await supabase
        .from('sales')
        .select('*')
        .eq('id', saleId)
        .maybeSingle();

      if (data) {
        // ── Venta POS encontrada ──
        let customer = undefined;
        if (data.customer_id) {
          const { data: customerData } = await supabase
            .from('customers')
            .select('id, full_name, email, phone, doc_number, address')
            .eq('id', data.customer_id)
            .maybeSingle();
          customer = customerData;
        }

        const { data: saleItems } = await supabase
          .from('sale_items')
          .select('id, product_id, quantity, unit_price, total, tax_amount, tax_rate, discount_amount, notes')
          .eq('sale_id', saleId);

        const productIds = (saleItems || []).filter(i => i.product_id).map(i => i.product_id);
        let productsMap: Record<number, any> = {};
        if (productIds.length > 0) {
          const { data: products } = await supabase
            .from('products')
            .select('id, name, sku, barcode')
            .in('id', productIds);
          if (products) products.forEach(p => { productsMap[p.id] = p; });
        }

        const itemsWithProducts = (saleItems || []).map(item => ({
          ...item,
          products: item.product_id ? productsMap[item.product_id] : undefined
        }));

        const { data: payments } = await supabase
          .from('payments')
          .select('*')
          .eq('source', 'sale')
          .eq('source_id', saleId);

        return {
          ...data,
          _source: 'pos' as const,
          customer,
          items: itemsWithProducts,
          payments: payments || []
        };
      }

      // 2. Si no está en sales, buscar en web_orders
      const { data: wo, error: woError } = await supabase
        .from('web_orders')
        .select('*')
        .eq('id', saleId)
        .maybeSingle();

      if (!wo) return null;

      // Obtener items de web_order
      const { data: webItems } = await supabase
        .from('web_order_items')
        .select('id, web_order_id, product_id, product_name, product_sku, quantity, unit_price, tax_amount, discount_amount, total, notes')
        .eq('web_order_id', saleId);

      const wProductIds = (webItems || []).filter(i => i.product_id).map(i => i.product_id);
      let wProductsMap: Record<number, any> = {};
      if (wProductIds.length > 0) {
        const { data: products } = await supabase
          .from('products')
          .select('id, name, sku, barcode')
          .in('id', wProductIds);
        if (products) products.forEach(p => { wProductsMap[p.id] = p; });
      }

      const itemsMapped = (webItems || []).map(item => ({
        id: item.id,
        sale_id: saleId,
        product_id: item.product_id,
        quantity: item.quantity,
        unit_price: Number(item.unit_price) || 0,
        total: Number(item.total) || 0,
        tax_amount: Number(item.tax_amount) || 0,
        discount_amount: Number(item.discount_amount) || 0,
        notes: item.notes,
        products: item.product_id ? wProductsMap[item.product_id] : { name: item.product_name, sku: item.product_sku },
      }));

      return {
        id: wo.id,
        organization_id: wo.organization_id,
        branch_id: wo.branch_id,
        customer_id: wo.customer_id,
        user_id: wo.confirmed_by || '',
        total: Number(wo.total) || 0,
        subtotal: Number(wo.subtotal) || 0,
        tax_total: Number(wo.tax_total) || 0,
        discount_total: Number(wo.discount_total) || 0,
        balance: 0,
        status: (wo.status === 'confirmed' || wo.status === 'delivered') ? 'completed' : wo.status,
        payment_status: wo.payment_status,
        payment_method: wo.payment_method,
        sale_date: wo.created_at,
        invoice_number: wo.order_number,
        notes: wo.customer_notes || wo.internal_notes,
        created_at: wo.created_at,
        updated_at: wo.updated_at,
        _source: 'web' as const,
        delivery_fee: Number(wo.delivery_fee) || 0,
        tip_amount: Number(wo.tip_amount) || 0,
        delivery_type: wo.delivery_type,
        delivery_address: wo.delivery_address,
        coupon_code: wo.coupon_code,
        customer: {
          full_name: wo.customer_name,
          email: wo.customer_email,
          phone: wo.customer_phone,
        },
        items: itemsMapped,
        payments: [],
      } as SaleWithDetails;
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
