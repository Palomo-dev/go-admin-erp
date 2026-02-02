import { supabase } from '@/lib/supabase/config';
import { obtenerOrganizacionActiva } from '@/lib/hooks/useOrganization';
import { formatCurrency } from '@/utils/Utils';
import { CreditNoteNumberService } from '@/lib/services/creditNoteNumberService';
import { 
  Return,
  SaleForReturn, 
  RefundData,
  CreditNote,
  ReturnSearchFilters,
  SaleSearchFilters,
  PaginatedReturnResponse,
  PaginatedSaleResponse 
} from './types';

// Función helper para obtener URL pública de imagen
const getStorageImageUrl = (storagePath: string): string => {
  if (!storagePath) return '';
  const { data } = supabase.storage
    .from('organization_images')
    .getPublicUrl(storagePath);
  return data?.publicUrl || '';
};

export class DevolucionesService {
  private static getOrganizationId(): number {
    const org = obtenerOrganizacionActiva();
    return org.id;
  }

  /**
   * Buscar ventas para devolución
   */
  static async buscarVentas(filters: SaleSearchFilters = {}): Promise<PaginatedSaleResponse> {
    try {
      const organizationId = this.getOrganizationId();
      console.log('Buscando ventas para organización:', organizationId);
      
      const {
        search = '',
        dateFrom,
        dateTo,
        status,
        customerId,
        limit = 20,
        page = 1
      } = filters;

      // Consulta con JOIN para incluir información de factura y método de pago
      let baseQuery = supabase
        .from('sales')
        .select(`
          id, 
          organization_id, 
          branch_id, 
          customer_id, 
          user_id, 
          total, 
          subtotal, 
          tax_total, 
          status, 
          payment_status, 
          sale_date,
          invoice_sales!inner(
            id,
            payment_method,
            number
          )
        `)
        .eq('organization_id', organizationId)
        .eq('status', 'paid')
        .order('sale_date', { ascending: false });

      // Aplicar filtros básicos
      if (dateFrom) {
        baseQuery = baseQuery.gte('sale_date', dateFrom);
      }

      if (dateTo) {
        baseQuery = baseQuery.lte('sale_date', dateTo);
      }

      if (customerId) {
        baseQuery = baseQuery.eq('customer_id', customerId);
      }

      // Paginación
      const from = (page - 1) * limit;
      const to = from + limit - 1;
      baseQuery = baseQuery.range(from, to);

      console.log('Ejecutando consulta básica de ventas...');
      const { data: salesData, error: salesError, count } = await baseQuery;

      if (salesError) {
        console.error('Error en consulta básica de ventas:', salesError);
        throw new Error(`Error consultando ventas: ${salesError.message}`);
      }

      console.log(`Encontradas ${salesData?.length || 0} ventas`);

      if (!salesData || salesData.length === 0) {
        return {
          data: [],
          total: 0,
          page,
          limit,
          totalPages: 0
        };
      }

      // Filtrar ventas que ya tienen devoluciones procesadas
      const saleIds = salesData.map(sale => sale.id);
      
      // Obtener ventas que ya tienen devoluciones
      const { data: existingReturns, error: returnsError } = await supabase
        .from('returns')
        .select('sale_id')
        .in('sale_id', saleIds);
      
      if (returnsError) {
        console.warn('Error verificando devoluciones existentes:', returnsError);
      }
      
      const returnsedSaleIds = new Set((existingReturns || []).map(r => r.sale_id));
      console.log(`Se encontraron ${returnsedSaleIds.size} ventas con devoluciones existentes`);
      
      // Filtrar ventas que NO tienen devoluciones
      const availableSales = salesData.filter(sale => !returnsedSaleIds.has(sale.id));
      console.log(`Ventas disponibles para devolución: ${availableSales.length}`);
      
      if (availableSales.length === 0) {
        return {
          data: [],
          total: 0,
          page,
          limit,
          totalPages: 0
        };
      }
      
      // Usar solo ventas disponibles para el resto del proceso
      const availableSaleIds = availableSales.map(sale => sale.id);
      
      // Ahora obtener datos relacionados por separado para evitar problemas con JOINs complejos
      
      // Obtener customers
      const customerIds = availableSales.map(sale => sale.customer_id).filter(Boolean);
      let customersData: any[] = [];
      if (customerIds.length > 0) {
        const { data: customers, error: customersError } = await supabase
          .from('customers')
          .select('id, full_name, email, phone')
          .in('id', customerIds);
        
        if (customersError) {
          console.warn('Error obteniendo customers:', customersError);
        } else {
          customersData = customers || [];
        }
      }

      // Obtener sale_items
      const { data: saleItemsData, error: itemsError } = await supabase
        .from('sale_items')
        .select(`
          id,
          sale_id,
          product_id,
          quantity,
          unit_price,
          total,
          tax_amount,
          discount_amount
        `)
        .in('sale_id', availableSaleIds);

      if (itemsError) {
        console.warn('Error obteniendo sale_items:', itemsError);
      }

      // Obtener productos para los items
      const productIds = (saleItemsData || []).map(item => item.product_id).filter(Boolean);
      let productsData: any[] = [];
      let productImages: Record<string | number, string> = {};
      
      if (productIds.length > 0) {
        // Obtener datos básicos de productos
        const { data: products, error: productsError } = await supabase
          .from('products')
          .select('id, name, sku')
          .in('id', productIds);
        
        if (productsError) {
          console.warn('Error obteniendo products:', productsError);
        } else {
          productsData = products || [];
        }

        // Obtener imágenes de productos
        const { data: images, error: imagesError } = await supabase
          .from('product_images')
          .select('id, product_id, storage_path, is_primary')
          .in('product_id', productIds)
          .eq('is_primary', true);
          
        if (!imagesError && images) {
          images.forEach((img: any) => {
            if (img.storage_path) {
              productImages[img.product_id] = img.storage_path;
            }
          });
        }
      }

      // Obtener payments
      const { data: paymentsData, error: paymentsError } = await supabase
        .from('payments')
        .select('id, source_id, method, amount, status, reference')
        .eq('source', 'sale')
        .in('source_id', availableSaleIds);

      if (paymentsError) {
        console.warn('Error obteniendo payments:', paymentsError);
      }

      // Combinar todos los datos
      const transformedData: SaleForReturn[] = availableSales.map(sale => {
        // Encontrar customer
        const customer = customersData.find(c => c.id === sale.customer_id);
        
        // Encontrar items de esta venta
        const saleItems = (saleItemsData || []).filter(item => item.sale_id === sale.id);
        
        // Para cada item, encontrar su producto
        const itemsWithProducts = saleItems.map(item => {
          const product = productsData.find(p => p.id === item.product_id);
          return {
            id: item.id,
            sale_id: item.sale_id,
            product_id: item.product_id,
            quantity: parseInt(item.quantity),
            unit_price: parseFloat(item.unit_price),
            total: parseFloat(item.total),
            tax_amount: parseFloat(item.tax_amount || '0'),
            discount_amount: parseFloat(item.discount_amount || '0'),
            product: product ? {
              id: product.id,
              name: product.name,
              sku: product.sku,
              image: productImages[product.id] ? getStorageImageUrl(productImages[product.id]) : null
            } : {
              id: 0,
              name: 'Producto no encontrado',
              sku: '',
              image: null
            },
            returned_quantity: 0 // Se calculará en obtenerDetalleVenta
          };
        });
        
        // Extraer información de la factura (payment_method)
        const invoice = sale.invoice_sales?.[0];
        
        // Encontrar payments de esta venta
        const salePayments = (paymentsData || []).filter(payment => payment.source_id === sale.id);
        
        return {
          id: sale.id,
          organization_id: sale.organization_id,
          branch_id: sale.branch_id,
          customer_id: sale.customer_id,
          user_id: sale.user_id,
          total: parseFloat(sale.total || '0'),
          subtotal: parseFloat(sale.subtotal || sale.total || '0'),
          tax_total: parseFloat(sale.tax_total || '0'),
          status: sale.status,
          payment_status: sale.payment_status,
          payment_method: invoice?.payment_method || 'No especificado',
          invoice_number: invoice?.number || null,
          sale_date: sale.sale_date,
          customer: customer ? {
            id: customer.id,
            full_name: customer.full_name,
            email: customer.email,
            phone: customer.phone
          } : undefined,
          items: itemsWithProducts,
          payments: salePayments.map(payment => ({
            id: payment.id,
            method: payment.method,
            amount: parseFloat(payment.amount),
            status: payment.status,
            reference: payment.reference
          }))
        };
      });

      // Aplicar filtro de búsqueda por texto después de obtener los datos
      let filteredData = transformedData;
      if (search) {
        const searchLower = search.toLowerCase();
        filteredData = transformedData.filter(sale => {
          const matchId = sale.id.toLowerCase().includes(searchLower);
          const matchCustomer = sale.customer?.full_name?.toLowerCase().includes(searchLower) ||
                               sale.customer?.phone?.toLowerCase().includes(searchLower);
          return matchId || matchCustomer;
        });
      }

      const totalPages = Math.ceil((count || 0) / limit);

      return {
        data: filteredData,
        total: count || 0,
        page,
        limit,
        totalPages
      };

    } catch (error) {
      console.error('Error en buscarVentas:', error);
      throw error;
    }
  }

  /**
   * Obtener detalles de una venta específica
   */
  static async obtenerDetalleVenta(saleId: string): Promise<SaleForReturn> {
    try {
      const organizationId = this.getOrganizationId();

      // Obtener datos básicos de la venta con información de factura
      const { data: saleData, error: saleError } = await supabase
        .from('sales')
        .select(`
          id, 
          organization_id, 
          branch_id, 
          customer_id, 
          user_id, 
          total, 
          subtotal, 
          tax_total, 
          status, 
          payment_status, 
          sale_date,
          invoice_sales(
            id,
            payment_method,
            number
          )
        `)
        .eq('id', saleId)
        .eq('organization_id', organizationId)
        .single();

      if (saleError || !saleData) {
        console.error('Error obteniendo venta:', saleError);
        throw saleError || new Error('Venta no encontrada');
      }

      // Obtener customer si existe
      let customerData: any = null;
      if (saleData.customer_id) {
        const { data: customer } = await supabase
          .from('customers')
          .select('id, full_name, email, phone')
          .eq('id', saleData.customer_id)
          .single();
        customerData = customer;
      }

      // Obtener sale_items
      const { data: saleItems, error: itemsError } = await supabase
        .from('sale_items')
        .select('id, sale_id, product_id, quantity, unit_price, total, tax_amount, discount_amount')
        .eq('sale_id', saleId);

      if (itemsError) {
        console.error('Error obteniendo sale_items:', itemsError);
        throw itemsError;
      }

      // Obtener productos e imágenes
      const productIds = (saleItems || []).map(item => item.product_id).filter(Boolean);
      let productsData: any[] = [];
      let productImages: Record<string | number, string> = {};
      
      if (productIds.length > 0) {
        // Obtener productos
        const { data: products } = await supabase
          .from('products')
          .select('id, name, sku')
          .in('id', productIds);
        productsData = products || [];

        // Obtener imágenes de productos
        const { data: images } = await supabase
          .from('product_images')
          .select('id, product_id, storage_path, is_primary')
          .in('product_id', productIds)
          .eq('is_primary', true);
          
        if (images) {
          images.forEach((img: any) => {
            if (img.storage_path) {
              productImages[img.product_id] = img.storage_path;
            }
          });
        }
      }

      // Obtener payments
      const { data: payments } = await supabase
        .from('payments')
        .select('id, source_id, method, amount, status, reference')
        .eq('source', 'sale')
        .eq('source_id', saleId);

      // Obtener cantidad ya devuelta por item
      const returnedQuantities = await this.obtenerCantidadesDevueltas(saleId);

      // Extraer información de la factura
      const invoice = saleData.invoice_sales?.[0];

      const transformedData: SaleForReturn = {
        id: saleData.id,
        organization_id: saleData.organization_id,
        branch_id: saleData.branch_id,
        customer_id: saleData.customer_id,
        customer: customerData ? {
          id: customerData.id,
          full_name: customerData.full_name,
          email: customerData.email,
          phone: customerData.phone
        } : undefined,
        user_id: saleData.user_id,
        total: Number(saleData.total),
        subtotal: Number(saleData.subtotal),
        tax_total: Number(saleData.tax_total),
        status: saleData.status,
        payment_status: saleData.payment_status,
        payment_method: invoice?.payment_method || 'No especificado',
        invoice_number: invoice?.number || null,
        sale_date: saleData.sale_date,
        items: (saleItems || []).map((item: any) => {
          const product = productsData.find(p => p.id === item.product_id);
          return {
            id: item.id,
            sale_id: item.sale_id,
            product_id: item.product_id,
            product: product ? {
              id: product.id,
              name: product.name,
              sku: product.sku,
              image: productImages[product.id] ? getStorageImageUrl(productImages[product.id]) : null
            } : {
              id: 0,
              name: 'Producto no encontrado',
              sku: '',
              image: null
            },
            quantity: Number(item.quantity),
            unit_price: Number(item.unit_price),
            total: Number(item.total),
            tax_amount: item.tax_amount ? Number(item.tax_amount) : undefined,
            discount_amount: item.discount_amount ? Number(item.discount_amount) : undefined,
            returned_quantity: returnedQuantities[item.id] || 0
          };
        }),
        payments: (payments || []).map((payment: any) => ({
          id: payment.id,
          method: payment.method,
          amount: Number(payment.amount),
          status: payment.status,
          reference: payment.reference
        }))
      };

      return transformedData;

    } catch (error) {
      console.error('Error en obtenerDetalleVenta:', error);
      throw error;
    }
  }

  /**
   * Obtener cantidades ya devueltas por sale_item_id
   */
  private static async obtenerCantidadesDevueltas(saleId: string): Promise<Record<string, number>> {
    try {
      const { data, error } = await supabase
        .from('returns')
        .select('return_items')
        .eq('sale_id', saleId)
        .eq('status', 'processed');

      if (error) {
        console.error('Error obteniendo cantidades devueltas:', error);
        return {};
      }

      const quantities: Record<string, number> = {};

      data?.forEach(returnRecord => {
        if (returnRecord.return_items && Array.isArray(returnRecord.return_items)) {
          returnRecord.return_items.forEach(item => {
            const saleItemId = item.id || item.sale_item_id;
            if (saleItemId) {
              quantities[saleItemId] = (quantities[saleItemId] || 0) + (item.return_quantity || 0);
            }
          });
        }
      });

      return quantities;

    } catch (error) {
      console.error('Error en obtenerCantidadesDevueltas:', error);
      return {};
    }
  }

  /**
   * Procesar devolución
   */
  static async procesarDevolucion(saleId: string, refundData: RefundData): Promise<Return> {
    try {
      const organizationId = this.getOrganizationId();
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      
      if (authError || !user) {
        throw new Error('Usuario no autenticado');
      }

      // Obtener información completa de la venta original
      const { data: saleData, error: saleError } = await supabase
        .from('sales')
        .select('id, branch_id, total, balance, status, customer_id')
        .eq('id', saleId)
        .single();

      if (saleError || !saleData) {
        throw new Error('No se pudo encontrar la venta original');
      }

      console.log('Procesando devolución:', {
        type: refundData.type,
        saleTotal: saleData.total,
        refundAmount: refundData.total_refund,
        isFullRefund: Number(saleData.total) === Number(refundData.total_refund)
      });

      // ===============================
      // DEVOLUCIÓN TOTAL (usar nota de crédito completa)
      // ===============================
      if (refundData.type === 'full' || Number(saleData.total) === Number(refundData.total_refund)) {
        console.log('📝 Procesando devolución TOTAL - usando nota de crédito completa');
        
        // Para devoluciones totales, usar la funcionalidad de nota de crédito completa
        // que ya salda todos los balances a cero automáticamente
        await this.procesarDevolucionTotal(saleId, refundData);
      } 
      // ===============================
      // DEVOLUCIÓN PARCIAL (ajustar balances proporcionalmente)
      // ===============================
      else {
        console.log('📏 Procesando devolución PARCIAL - ajustando balances');
        
        // Para devoluciones parciales, ajustar balances proporcionalmente
        await this.procesarDevolucionParcial(saleId, refundData);
      }

      // Crear registro de devolución para historial
      const returnData = {
        organization_id: organizationId,
        branch_id: saleData.branch_id,
        sale_id: saleId,
        user_id: user.id,
        total_refund: refundData.total_refund,
        reason: refundData.reason,
        status: 'processed',
        return_items: refundData.items.map(item => ({
          id: item.sale_item_id,
          product_id: item.product_id,
          return_quantity: item.return_quantity,
          refund_amount: item.refund_amount,
          reason: item.reason
        }))
      };

      const { data: returnResult, error: returnError } = await supabase
        .from('returns')
        .insert([returnData])
        .select()
        .single();

      if (returnError) {
        console.error('Error creando devolución:', returnError);
        throw returnError;
      }

      // Actualizar stock si es necesario
      await this.actualizarStockDevolucion(refundData.items);

      console.log('✅ Devolución procesada exitosamente');
      return returnResult;

    } catch (error) {
      console.error('Error en procesarDevolucion:', error);
      throw error;
    }
  }

  /**
   * Crear movimiento de caja para el reembolso
   */
  private static async crearMovimientoCaja(branchId: number, amount: number, concept: string) {
    try {
      // Buscar sesión de caja activa
      const { data: session } = await supabase
        .from('cash_sessions')
        .select('id')
        .eq('branch_id', branchId)
        .eq('status', 'open')
        .single();

      if (session) {
        const { data: { user } } = await supabase.auth.getUser();
        
        await supabase
          .from('cash_movements')
          .insert([{
            cash_session_id: session.id,
            type: 'out',
            concept: `Devolución: ${concept}`,
            amount: amount,
            user_id: user?.id
          }]);
      }
    } catch (error) {
      console.error('Error creando movimiento de caja:', error);
      // No lanzar error para no interrumpir el proceso principal
    }
  }

  /**
   * Registrar pago de reembolso
   */
  private static async registrarPagoReembolso(saleId: string, amount: number, method: string) {
    try {
      const organizationId = this.getOrganizationId();
      const { data: { user } } = await supabase.auth.getUser();

      await supabase
        .from('payments')
        .insert([{
          organization_id: organizationId,
          source: 'sale',
          source_id: saleId,
          method: method === 'original_method' ? 'cash' : method, // Simplificar por ahora
          amount: -amount, // Negativo para indicar reembolso
          reference: `Reembolso-${saleId.slice(-8)}`,
          status: 'completed',
          created_by: user?.id
        }]);

    } catch (error) {
      console.error('Error registrando pago de reembolso:', error);
    }
  }

  /**
   * Crear nota de crédito
   */
  private static async crearNotaCredito(customerId: string, amount: number, notes?: string): Promise<string | null> {
    try {
      const organizationId = this.getOrganizationId();
      
      // Calcular fecha de expiración (por ejemplo, 1 año)
      const expiryDate = new Date();
      expiryDate.setFullYear(expiryDate.getFullYear() + 1);

      const { data, error } = await supabase
        .from('credit_notes')
        .insert([{
          organization_id: organizationId,
          customer_id: customerId,
          amount: amount,
          balance: amount,
          expiry_date: expiryDate.toISOString(),
          status: 'active',
          notes: notes || 'Nota de crédito por devolución'
        }])
        .select('id')
        .single();

      if (error) {
        console.error('Error creando nota de crédito:', error);
        return null;
      }
      
      return data.id;

    } catch (error) {
      console.error('Error creando nota de crédito:', error);
      return null;
    }
  }

  /**
   * Actualizar stock por devolución
   */
  private static async actualizarStockDevolucion(items: RefundData['items']) {
    try {
      // Este método se implementará cuando se defina la lógica de stock
      // Por ahora es un placeholder
      console.log('Actualizando stock para devolución:', items);
    } catch (error) {
      console.error('Error actualizando stock:', error);
    }
  }

  /**
   * Crear factura de nota de crédito
   */
  private static async crearFacturaNotaCredito(saleId: string, creditNoteId: string, totalRefund: number, saleDetail: SaleForReturn) {
    try {
      const organizationId = this.getOrganizationId();
      const { data: { user } } = await supabase.auth.getUser();
      
      // Buscar factura original
      const { data: originalInvoice } = await supabase
        .from('invoice_sales')
        .select('id')
        .eq('sale_id', saleId)
        .single();
      
      // Crear factura de nota de crédito
      const { data: invoice, error } = await supabase
        .from('invoice_sales')
        .insert([{
          organization_id: organizationId,
          branch_id: saleDetail.branch_id,
          customer_id: saleDetail.customer_id,
          number: `NC-${Date.now()}`,
          issue_date: new Date().toISOString(),
          currency: 'COP',
          subtotal: totalRefund / 1.19, // Asumiendo 19% de IVA
          tax_total: totalRefund - (totalRefund / 1.19),
          total: totalRefund,
          balance: totalRefund,
          status: 'issued',
          document_type: 'credit_note',
          related_invoice_id: originalInvoice?.id || null,
          created_by: user?.id,
          tax_included: true,
          description: `Nota de crédito por devolución - Venta ${saleId}`
        }])
        .select('id')
        .single();

      if (error) {
        console.error('Error creando factura de nota de crédito:', error);
      }

      return invoice?.id;
      
    } catch (error) {
      console.error('Error en crearFacturaNotaCredito:', error);
    }
  }

  /**
   * Actualizar balance de factura original
   */
  private static async actualizarBalanceFactura(saleId: string, refundAmount: number) {
    try {
      console.log(`Actualizando balance para venta ${saleId} con monto ${refundAmount}`);
      
      // Buscar factura relacionada con la venta
      const { data: invoice, error: findError } = await supabase
        .from('invoice_sales')
        .select('id, balance, total, status')
        .eq('sale_id', saleId)
        .single();

      if (findError) {
        console.error('Error buscando factura:', findError);
        console.warn('No se encontró factura para actualizar balance:', saleId);
        return;
      }
      
      if (!invoice) {
        console.warn('Factura no encontrada para venta:', saleId);
        return;
      }

      console.log('Factura encontrada:', {
        id: invoice.id,
        balance: invoice.balance,
        total: invoice.total,
        status: invoice.status
      });

      // Verificar si la factura ya fue procesada (balance negativo indica devolución previa)
      const currentBalance = Number(invoice.balance);
      const originalTotal = Number(invoice.total);
      
      // Si el balance ya es negativo, significa que ya se procesó una devolución
      if (currentBalance < 0) {
        console.log('Balance ya es negativo, posible devolución previa detectada');
        // Usar el total original como base para calcular el nuevo balance
        const newBalance = originalTotal - refundAmount;
        const newStatus = newBalance <= 0 ? 'void' : 'paid';
        
        console.log(`Recalculando desde total original: ${originalTotal} - ${refundAmount} = ${newBalance}`);
        console.log(`Nuevo estado: ${newStatus}`);
        
        // Actualizar con el balance correcto
        const { error: updateError } = await supabase
          .from('invoice_sales')
          .update({ 
            balance: newBalance,
            status: newStatus
          })
          .eq('id', invoice.id);

        if (updateError) {
          console.error('Error actualizando balance de factura:', updateError);
          throw new Error(`Error actualizando factura: ${updateError.message}`);
        } else {
          console.log(`Balance de factura corregido: ${currentBalance} -> ${newBalance}`);
        }
        return;
      }
      
      // Proceso normal para facturas sin devoluciones previas
      const newBalance = currentBalance - refundAmount;
      const newStatus = newBalance <= 0 ? 'void' : 'paid';
      
      console.log(`Calculando balance: ${currentBalance} - ${refundAmount} = ${newBalance}`);
      console.log(`Nuevo estado: ${newStatus}`);

      // Actualizar balance de la factura
      const { error: updateError } = await supabase
        .from('invoice_sales')
        .update({ 
          balance: newBalance,
          status: newStatus
        })
        .eq('id', invoice.id);

      if (updateError) {
        console.error('Error actualizando balance de factura:', updateError);
        throw new Error(`Error actualizando factura: ${updateError.message}`);
      } else {
        console.log(`Balance de factura actualizado exitosamente: ${currentBalance} -> ${newBalance}`);
      }

    } catch (error) {
      console.error('Error en actualizarBalanceFactura:', error);
      // No lanzar error para no interrumpir el proceso principal de devolución
    }
  }

  /**
   * Actualizar estado de venta
   */
  private static async actualizarEstadoVenta(saleId: string, newStatus: string) {
    try {
      console.log(`🔄 Actualizando estado de venta ${saleId} a: ${newStatus}`);
      
      const { error } = await supabase
        .from('sales')
        .update({ 
          status: newStatus,
          payment_status: 'refunded' // Valor válido según constraint: pending, paid, partial, refunded
        })
        .eq('id', saleId);

      if (error) {
        console.error('❌ Error actualizando estado de venta:', error);
        throw new Error(`Error al actualizar estado de venta: ${error.message || JSON.stringify(error)}`);
      }
      
      console.log(`✅ Estado de venta ${saleId} actualizado exitosamente a: ${newStatus}`);

    } catch (error) {
      console.error('❌ Error en actualizarEstadoVenta:', error);
      throw error; // Re-lanzar el error para que se propague
    }
  }

  /**
   * Obtener historial de devoluciones
   */
  static async obtenerHistorialDevoluciones(filters: ReturnSearchFilters = {}): Promise<PaginatedReturnResponse> {
    try {
      const organizationId = this.getOrganizationId();
      console.log('Obteniendo historial para organización:', organizationId);
      
      const {
        search = '',
        dateFrom,
        dateTo,
        status,
        refundMethod
      } = filters;

      // Primero obtener devoluciones básicas
      let query = supabase
        .from('returns')
        .select('id, organization_id, branch_id, sale_id, user_id, total_refund, reason, return_date, status, return_items, created_at, updated_at')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false });

      // Aplicar filtros
      if (dateFrom) {
        query = query.gte('return_date', dateFrom);
      }

      if (dateTo) {
        query = query.lte('return_date', dateTo);
      }

      if (status) {
        query = query.eq('status', status);
      }

      console.log('Ejecutando consulta de devoluciones...');
      const { data: returnsData, error: returnsError, count } = await query;

      if (returnsError) {
        console.error('Error obteniendo devoluciones:', returnsError);
        throw new Error(`Error consultando devoluciones: ${returnsError.message}`);
      }

      console.log(`Encontradas ${returnsData?.length || 0} devoluciones`);

      if (!returnsData || returnsData.length === 0) {
        return {
          data: [],
          total: 0,
          page: 1,
          limit: 50,
          totalPages: 0
        };
      }

      // Obtener información de ventas relacionadas con impuestos
      const saleIds = returnsData.map(ret => ret.sale_id).filter(Boolean);
      let salesData: any[] = [];
      let customersData: any[] = [];
      
      if (saleIds.length > 0) {
        const { data: sales, error: salesError } = await supabase
          .from('sales')
          .select('id, customer_id, total, subtotal, tax_total')
          .in('id', saleIds);
        
        if (!salesError && sales) {
          salesData = sales;
          
          // Obtener customers
          const customerIds = sales.map(s => s.customer_id).filter(Boolean);
          if (customerIds.length > 0) {
            const { data: customers } = await supabase
              .from('customers')
              .select('id, full_name, phone, email')
              .in('id', customerIds);
            customersData = customers || [];
          }
        }
      }

      const transformedData: Return[] = returnsData.map(returnItem => {
        // Encontrar venta relacionada
        const sale = salesData.find(s => s.id === returnItem.sale_id);
        
        // Encontrar customer si existe
        const customer = sale?.customer_id ? customersData.find(c => c.id === sale.customer_id) : null;
        
        // Calcular impuestos del reembolso proporcionalmente
        const originalTotal = sale ? Number(sale.total) : 0;
        const originalSubtotal = sale ? Number(sale.subtotal) : 0;
        const originalTaxTotal = sale ? Number(sale.tax_total) : 0;
        const refundAmount = Number(returnItem.total_refund);
        
        // Calcular impuestos proporcionales del reembolso
        let refundTaxAmount = 0;
        let refundTotalWithTax = refundAmount;
        
        if (originalTotal > 0 && originalTaxTotal > 0) {
          // Si el reembolso es igual al subtotal original, es probablemente un reembolso completo
          if (Math.abs(refundAmount - originalSubtotal) < 0.01) {
            // Reembolso completo - incluir todos los impuestos
            refundTaxAmount = originalTaxTotal;
            refundTotalWithTax = originalTotal;
          } else {
            // Reembolso parcial - calcular impuestos proporcionales
            const taxRate = originalTaxTotal / originalSubtotal;
            refundTaxAmount = refundAmount * taxRate;
            refundTotalWithTax = refundAmount + refundTaxAmount;
          }
        }
        
        return {
          id: returnItem.id,
          organization_id: returnItem.organization_id,
          branch_id: returnItem.branch_id,
          sale_id: returnItem.sale_id,
          user_id: returnItem.user_id,
          total_refund: refundAmount, // Subtotal del reembolso
          refund_tax_amount: refundTaxAmount, // Impuestos del reembolso
          refund_total_with_tax: refundTotalWithTax, // Total con impuestos
          reason: returnItem.reason,
          return_date: returnItem.return_date,
          status: returnItem.status,
          return_items: returnItem.return_items || [],
          created_at: returnItem.created_at,
          updated_at: returnItem.updated_at,
          // Datos de venta y cliente si existen
          sale: sale ? {
            id: sale.id,
            total: originalTotal,
            subtotal: originalSubtotal,
            tax_total: originalTaxTotal,
            customer: customer ? {
              full_name: customer.full_name,
              phone: customer.phone,
              email: customer.email
            } : null
          } : null
        };
      });

      return {
        data: transformedData,
        total: count || 0,
        page: 1,
        limit: 50,
        totalPages: Math.ceil((count || 0) / 50)
      };

    } catch (error) {
      console.error('Error en obtenerHistorialDevoluciones:', error);
      throw error;
    }
  }

  /**
   * Procesar devolución TOTAL - Crear nota de crédito completa
   * Usa la funcionalidad de POSService.cancelDebtWithCreditNote()
   */
  private static async procesarDevolucionTotal(saleId: string, refundData: RefundData) {
    try {
      console.log('📝 Iniciando devolución total con nota de crédito');
      
      // Procesar pagos/movimientos según el método de reembolso
      if (refundData.refund_method === 'cash' || refundData.refund_method === 'original_method') {
        const { data: saleData } = await supabase
          .from('sales')
          .select('branch_id')
          .eq('id', saleId)
          .single();
        
        if (saleData) {
          // Crear movimiento de caja (salida)
          await this.crearMovimientoCaja(saleData.branch_id, refundData.total_refund, refundData.reason);
          
          // Registrar pago de reembolso
          await this.registrarPagoReembolso(saleId, refundData.total_refund, refundData.refund_method);
        }
      }
      
      // Importar POSService dinámicamente para crear nota de crédito completa
      const { POSService } = await import('@/lib/services/posService');
      
      // Encontrar el carrito asociado (si existe) para usar cancelDebtWithCreditNote
      // Si no existe carrito, crear nota de crédito manualmente
      try {
        // Buscar si existe un carrito con hold_with_debt para esta venta
        const cartsData = localStorage.getItem(`pos_carts_${this.getOrganizationId()}`);
        if (cartsData) {
          const allCarts = JSON.parse(cartsData);
          const cart = allCarts.find((c: any) => c.status === 'hold_with_debt' && c.sale_id === saleId);
          
          if (cart) {
            console.log('📝 Usando POSService.cancelDebtWithCreditNote para carrito:', cart.id);
            await POSService.cancelDebtWithCreditNote(cart.id);
            return;
          }
        }
      } catch (error) {
        console.warn('No se pudo usar cancelDebtWithCreditNote, creando nota manualmente:', error);
      }
      
      // Si no hay carrito, crear nota de crédito manualmente
      console.log('📝 Creando nota de crédito manual para devolución total');
      await this.crearNotaCreditoCompleta(saleId, refundData.total_refund, refundData.reason);
      
      // Actualizar estado de venta a 'void' (anulado por devolución total)
      await this.actualizarEstadoVenta(saleId, 'void');
      
      console.log('✅ Devolución total procesada exitosamente');
      
    } catch (error) {
      console.error('Error en procesarDevolucionTotal:', error);
      throw error;
    }
  }

  /**
   * Procesar devolución PARCIAL - Ajustar balances proporcionalmente
   */
  private static async procesarDevolucionParcial(saleId: string, refundData: RefundData) {
    try {
      console.log('📏 Iniciando devolución parcial');
      
      // Procesar pagos/movimientos según el método de reembolso
      if (refundData.refund_method === 'cash' || refundData.refund_method === 'original_method') {
        const { data: saleData } = await supabase
          .from('sales')
          .select('branch_id')
          .eq('id', saleId)
          .single();
        
        if (saleData) {
          // Crear movimiento de caja (salida)
          await this.crearMovimientoCaja(saleData.branch_id, refundData.total_refund, refundData.reason);
          
          // Registrar pago de reembolso
          await this.registrarPagoReembolso(saleId, refundData.total_refund, refundData.refund_method);
        }
      } else if (refundData.refund_method === 'credit_note') {
        // Para devoluciones parciales con nota de crédito, crear nota parcial
        const saleDetail = await this.obtenerDetalleVenta(saleId);
        if (saleDetail.customer_id) {
          const creditNoteId = await this.crearNotaCredito(saleDetail.customer_id, refundData.total_refund, refundData.notes);
          if (creditNoteId) {
            await this.crearFacturaNotaCredito(saleId, creditNoteId, refundData.total_refund, saleDetail);
          }
        }
      }
      
      // Actualizar balances en TODAS las tablas proporcionalmente
      await this.actualizarBalancesDevolucionParcial(saleId, refundData.total_refund);
      
      console.log('✅ Devolución parcial procesada exitosamente');
      
    } catch (error) {
      console.error('Error en procesarDevolucionParcial:', error);
      throw error;
    }
  }

  /**
   * Crear nota de crédito completa para devolución total
   */
  private static async crearNotaCreditoCompleta(saleId: string, totalRefund: number, reason: string) {
    try {
      console.log('🔍 Buscando factura original para sale_id:', saleId);
      
      let { data: originalInvoice, error: invoiceError } = await supabase
        .from('invoice_sales')
        .select('*')
        .eq('sale_id', saleId)
        .eq('document_type', 'invoice')
        .single();

      // Si no se encuentra con document_type 'invoice', buscar con document_type null
      if (invoiceError || !originalInvoice) {
        console.log('📋 No se encontró factura con document_type="invoice", buscando con document_type=null');
        
        const { data: invoiceWithNullType, error: nullTypeError } = await supabase
          .from('invoice_sales')
          .select('*')
          .eq('sale_id', saleId)
          .is('document_type', null)
          .single();
          
        if (nullTypeError || !invoiceWithNullType) {
          console.error('❌ Error buscando factura:', { invoiceError, nullTypeError });
          throw new Error('No se encontró la factura original');
        }
        
        originalInvoice = invoiceWithNullType;
        console.log('✅ Factura encontrada con document_type=null:', originalInvoice.id);
      } else {
        console.log('✅ Factura encontrada con document_type="invoice":', originalInvoice.id);
      }

      // Obtener items de la factura original
      const { data: originalItems } = await supabase
        .from('invoice_items')
        .select('*')
        .eq('invoice_sales_id', originalInvoice.id);

      // Generar número de nota de crédito usando servicio centralizado
    const creditNoteNumber = await CreditNoteNumberService.generateNextCreditNoteNumber(
      String(this.getOrganizationId())
    );

      // Crear nota de crédito completa
      const currentDate = new Date().toISOString();
      const { data: creditNoteData, error: creditNoteError } = await supabase
        .from('invoice_sales')
        .insert({
          organization_id: this.getOrganizationId(),
          branch_id: originalInvoice.branch_id,
          customer_id: originalInvoice.customer_id,
          sale_id: originalInvoice.sale_id,
          number: creditNoteNumber,
          issue_date: currentDate,
          due_date: currentDate,
          currency: originalInvoice.currency,
          subtotal: -originalInvoice.subtotal,
          tax_total: -originalInvoice.tax_total,
          total: -originalInvoice.total,
          balance: 0,
          status: 'issued',
          document_type: 'credit_note',
          related_invoice_id: originalInvoice.id,
          tax_included: originalInvoice.tax_included,
          payment_method: originalInvoice.payment_method || 'credit',
          description: `Nota de crédito por devolución total - ${reason}`,
          created_by: (await supabase.auth.getUser()).data.user?.id
        })
        .select()
        .single();

      if (creditNoteError) {
        throw new Error('Error al crear la nota de crédito: ' + creditNoteError.message);
      }

      // Crear items de nota de crédito
      if (originalItems && originalItems.length > 0) {
        const creditNoteItems = originalItems.map(item => ({
          invoice_id: creditNoteData.id,
          invoice_sales_id: creditNoteData.id,
          invoice_type: 'sale',
          product_id: item.product_id,
          description: item.description || 'Item de nota de crédito',
          qty: -item.qty,
          unit_price: item.unit_price,
          total_line: -item.total_line,
          tax_rate: item.tax_rate || 0,
          discount_amount: item.discount_amount ? -item.discount_amount : 0,
          tax_included: item.tax_included || false
        }));

        const { error: itemsError } = await supabase
          .from('invoice_items')
          .insert(creditNoteItems);

        if (itemsError) {
          throw new Error('Error al crear items de nota de crédito: ' + itemsError.message);
        }
      }

      // Saldar todos los balances a cero (devolución total)
      await this.saldarBalancesCompletos(saleId, originalInvoice.id);
      
    } catch (error) {
      console.error('Error en crearNotaCreditoCompleta:', error);
      throw error;
    }
  }

  /**
   * Saldar todos los balances a cero para devolución total
   */
  private static async saldarBalancesCompletos(saleId: string, invoiceId: string) {
    try {
      // Actualizar factura original
      await supabase
        .from('invoice_sales')
        .update({
          balance: 0,
          status: 'paid',
          updated_at: new Date().toISOString()
        })
        .eq('id', invoiceId);

      // Actualizar venta original
      await supabase
        .from('sales')
        .update({
          balance: 0,
          status: 'paid',
          updated_at: new Date().toISOString()
        })
        .eq('id', saleId);

      // Actualizar cuentas por cobrar
      await supabase
        .from('accounts_receivable')
        .update({
          balance: 0,
          status: 'paid',
          updated_at: new Date().toISOString()
        })
        .eq('invoice_id', invoiceId);
        
      console.log('✅ Todos los balances saldados a cero');
      
    } catch (error) {
      console.error('Error saldando balances completos:', error);
      throw error;
    }
  }

  /**
   * Actualizar balances proporcionalmente para devolución parcial
   */
  private static async actualizarBalancesDevolucionParcial(saleId: string, refundAmount: number) {
    try {
      console.log(`📏 Actualizando balances para devolución parcial: $${refundAmount}`);
      
      // Actualizar balance en sales
      const { data: saleData, error: saleError } = await supabase
        .from('sales')
        .select('balance')
        .eq('id', saleId)
        .single();

      if (!saleError && saleData) {
        const newSaleBalance = Math.max(0, Number(saleData.balance) - refundAmount);
        await supabase
          .from('sales')
          .update({
            balance: newSaleBalance,
            updated_at: new Date().toISOString()
          })
          .eq('id', saleId);
        
        console.log(`✅ Balance de venta actualizado: ${saleData.balance} → ${newSaleBalance}`);
      }
      
      // Actualizar balance en invoice_sales
      const { data: invoiceData, error: invoiceError } = await supabase
        .from('invoice_sales')
        .select('id, balance')
        .eq('sale_id', saleId)
        .eq('document_type', 'invoice')
        .single();

      if (!invoiceError && invoiceData) {
        const newInvoiceBalance = Math.max(0, Number(invoiceData.balance) - refundAmount);
        const newStatus = newInvoiceBalance <= 0 ? 'paid' : 'partial';
        
        await supabase
          .from('invoice_sales')
          .update({
            balance: newInvoiceBalance,
            status: newStatus,
            updated_at: new Date().toISOString()
          })
          .eq('id', invoiceData.id);
        
        console.log(`✅ Balance de factura actualizado: ${invoiceData.balance} → ${newInvoiceBalance}`);
        
        // Actualizar balance en accounts_receivable
        const { data: arData, error: arError } = await supabase
          .from('accounts_receivable')
          .select('balance')
          .eq('invoice_id', invoiceData.id)
          .single();

        if (!arError && arData) {
          const newArBalance = Math.max(0, Number(arData.balance) - refundAmount);
          const newArStatus = newArBalance <= 0 ? 'paid' : 'current';
          
          await supabase
            .from('accounts_receivable')
            .update({
              balance: newArBalance,
              status: newArStatus,
              updated_at: new Date().toISOString()
            })
            .eq('invoice_id', invoiceData.id);
          
          console.log(`✅ Balance de cuenta por cobrar actualizado: ${arData.balance} → ${newArBalance}`);
        }
      }
      
    } catch (error) {
      console.error('Error actualizando balances de devolución parcial:', error);
      throw error;
    }
  }
}
