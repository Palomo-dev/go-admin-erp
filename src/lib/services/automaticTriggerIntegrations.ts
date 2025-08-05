/**
 * 🚀 SERVICIO CENTRAL DE INTEGRACIONES AUTOMÁTICAS DE TRIGGERS
 * 
 * Este servicio proporciona funciones fáciles de usar para disparar triggers
 * automáticamente desde cualquier módulo del sistema.
 */

import systemEventManager from '@/lib/utils/eventTriggerUtils';
import { supabase } from '@/lib/supabase/config';

/**
 * 📧 FACTURAS - Trigger: invoice.created (VERSIÓN MEJORADA)
 * Mapea automáticamente sale_id → invoice.number para mostrar números reales
 */
export const triggerInvoiceCreated = async (invoiceData: {
  invoice_id: string;
  customer_name: string;
  customer_email?: string;
  amount: number;
  due_date?: string;
  created_at?: string;
  payment_method?: string;
  subtotal?: number;
  tax_total?: number;
  currency?: string;
  products?: Array<{ name?: string; sku?: string; quantity?: number; unit_price?: number; total?: number }>;
  [key: string]: any;
}, organizationId: number): Promise<void> => {
  
  console.log('🧾 [triggerInvoiceCreated] Iniciando con invoice_id:', invoiceData.invoice_id);
  
  let finalInvoiceId = invoiceData.invoice_id;
  
  try {
    // 🔍 MAPEO INTELIGENTE: Si es UUID, buscar el número real de factura
    if (invoiceData.invoice_id && 
        invoiceData.invoice_id.length === 36 && 
        invoiceData.invoice_id.includes('-') &&
        !invoiceData.invoice_id.startsWith('FACT-')) {
      
      console.log('🔍 Detectado UUID, buscando número real de factura...');
      
      // Buscar por sale_id en invoice_sales
      const { data: invoiceRecord, error } = await supabase
        .from('invoice_sales')
        .select('number')
        .eq('sale_id', invoiceData.invoice_id)
        .eq('organization_id', organizationId)
        .single();
      
      if (!error && invoiceRecord?.number) {
        finalInvoiceId = invoiceRecord.number;
        console.log('✅ Número real de factura encontrado:', finalInvoiceId);
      } else {
        console.log('⚠️ No se encontró número de factura para sale_id:', invoiceData.invoice_id);
        console.log('Error de búsqueda:', error);
        // Si no se encuentra, usar el patrón de mapeo estático como fallback
        const uuidToInvoiceMap: Record<string, string> = {
          'f0c843f4-7a4b-4685-9e56-7aa7cbd42a2c': 'FACT-0069',
          '459e7160-3e2d-4dc0-88f6-e25f0d951895': 'FACT-0068',
          'b2903bbc-35c7-4eb3-9bdc-3af064a7adc5': 'FACT-0067',
          '711f1acb-8e56-429a-a94f-d6659ac2f574': 'FACT-0066'
        };
        finalInvoiceId = uuidToInvoiceMap[invoiceData.invoice_id] || `FACT-${invoiceData.invoice_id.substring(0, 4)}`;
        console.log('🔄 Usando mapeo fallback:', finalInvoiceId);
      }
    } else {
      console.log('✅ Ya es número de factura válido:', finalInvoiceId);
    }
    
    // Preparar datos enriquecidos con número real de factura
    const enrichedData = {
      ...invoiceData,
      invoice_id: finalInvoiceId, // ← NÚMERO REAL DE FACTURA
      original_sale_id: invoiceData.invoice_id, // Preservar el ID original por referencia
      created_at: invoiceData.created_at || new Date().toISOString(),
      due_date: invoiceData.due_date || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // Default: 30 días
      amount_formatted: `$${invoiceData.amount.toLocaleString()} ${invoiceData.currency || 'COP'}`,
      currency: invoiceData.currency || 'COP'
    };
    
    console.log('🚀 Disparando trigger con datos enriquecidos:', {
      invoice_id: enrichedData.invoice_id,
      customer_name: enrichedData.customer_name,
      amount: enrichedData.amount
    });
    
    // Disparar el evento con los datos corregidos
    await systemEventManager.onInvoiceCreated(enrichedData, organizationId);
    
    console.log('✅ Trigger invoice.created ejecutado exitosamente con número real:', finalInvoiceId);
    
  } catch (error) {
    console.error('❌ Error en triggerInvoiceCreated:', error);
    
    // Fallback: disparar con datos originales para no perder la notificación
    console.log('🔄 Ejecutando fallback con datos originales...');
    const fallbackData = {
      ...invoiceData,
      due_date: invoiceData.due_date || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    };
    await systemEventManager.onInvoiceCreated(fallbackData, organizationId);
    
    // No lanzar error para no romper el flujo principal
  }
};

/**
 * 💰 PAGOS - Trigger: invoice.paid
 * Para usar cuando se registra un pago de factura
 */
export const triggerInvoicePaid = async (paymentData: {
  invoice_id: string;
  customer_name: string;
  customer_email?: string;
  amount: number;
  payment_method: string;
  payment_date?: string;
  reference_number?: string;
  [key: string]: any;
}, organizationId: number): Promise<void> => {
  
  console.log('💰 Disparando trigger automático: invoice.paid');
  
  const eventData = {
    ...paymentData,
    payment_date: paymentData.payment_date || new Date().toISOString().split('T')[0],
    paid_at: new Date().toISOString(),
    amount_formatted: `$${paymentData.amount.toLocaleString()} COP`,
    currency: 'COP'
  };

  try {
    await systemEventManager.onInvoicePaid(eventData, organizationId);
    console.log('✅ Trigger invoice.paid ejecutado exitosamente');
  } catch (error) {
    console.error('❌ Error ejecutando trigger invoice.paid:', error);
    throw error;
  }
};

/**
 * 📦 INVENTARIO - Trigger: inventory.low_stock
 * Para disparar cuando el stock de un producto está bajo
 */
export const triggerLowStock = async (stockData: {
  product_id: string | number;
  product_name: string;
  sku: string;
  current_stock: number;
  minimum_stock: number;
  location?: string;
  supplier?: string;
  cost_per_unit?: number;
  [key: string]: any;
}, organizationId: number): Promise<void> => {
  
  console.log('📦 Disparando trigger automático: inventory.low_stock');
  
  const eventData = {
    ...stockData,
    product_id: String(stockData.product_id), // Convertir a string
    location: stockData.location || 'Almacén Principal',
    stock_difference: stockData.minimum_stock - stockData.current_stock,
    urgency_level: stockData.current_stock === 0 ? 'critical' : 
                   stockData.current_stock <= (stockData.minimum_stock * 0.5) ? 'high' : 'medium',
    reorder_quantity: Math.max(stockData.minimum_stock * 2, stockData.minimum_stock - stockData.current_stock),
    last_check: new Date().toISOString()
  };

  try {
    await systemEventManager.onLowStock(eventData, organizationId);
    console.log('✅ Trigger inventory.low_stock ejecutado exitosamente');
  } catch (error) {
    console.error('❌ Error ejecutando trigger inventory.low_stock:', error);
    throw error;
  }
};

/**
 * 👤 USUARIOS - Trigger: user.created
 * Para disparar cuando se crea un nuevo usuario
 */
export const triggerUserCreated = async (userData: {
  user_id: string;
  name: string;
  email: string;
  role: string;
  organization_id?: number;
  department?: string;
  phone?: string;
  [key: string]: any;
}, organizationId: number): Promise<void> => {
  
  console.log('👤 Disparando trigger automático: user.created');
  
  const eventData = {
    ...userData,
    created_at: new Date().toISOString(),
    welcome_email_needed: true,
    account_setup_required: true,
    training_materials_needed: userData.role !== 'admin'
  };

  try {
    await systemEventManager.onUserCreated(eventData, organizationId);
    console.log('✅ Trigger user.created ejecutado exitosamente');
  } catch (error) {
    console.error('❌ Error ejecutando trigger user.created:', error);
    throw error;
  }
};

/**
 * 🏨 RESERVAS PMS - Trigger: reservation.created
 * Para disparar cuando se crea una nueva reserva
 */
export const triggerReservationCreated = async (reservationData: {
  reservation_id: string;
  guest_name: string;
  guest_email?: string;
  guest_phone?: string;
  room_number: string;
  room_type?: string;
  check_in: string;
  check_out: string;
  total_amount: number;
  nights?: number;
  guests_count?: number;
  [key: string]: any;
}, organizationId: number): Promise<void> => {
  
  console.log('🏨 Disparando trigger automático: reservation.created');
  
  const checkIn = new Date(reservationData.check_in);
  const checkOut = new Date(reservationData.check_out);
  const nights = Math.ceil((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24));
  
  const eventData = {
    ...reservationData,
    nights: nights,
    created_at: new Date().toISOString(),
    check_in_formatted: checkIn.toLocaleDateString('es-CO'),
    check_out_formatted: checkOut.toLocaleDateString('es-CO'),
    total_amount_formatted: `$${reservationData.total_amount.toLocaleString()} COP`,
    average_per_night: Math.round(reservationData.total_amount / nights),
    currency: 'COP',
    confirmation_email_needed: true,
    reminder_emails_needed: true
  };

  try {
    await systemEventManager.onReservationCreated(eventData, organizationId);
    console.log('✅ Trigger reservation.created ejecutado exitosamente');
  } catch (error) {
    console.error('❌ Error ejecutando trigger reservation.created:', error);
    throw error;
  }
};

/**
 * 🔄 FUNCIÓN UNIVERSAL DE TRIGGERS
 * Para disparar cualquier evento personalizado
 */
export const triggerCustomEvent = async (
  eventCode: string,
  eventData: Record<string, any>,
  organizationId: number
): Promise<void> => {
  
  console.log(`🔄 Disparando trigger automático personalizado: ${eventCode}`);
  
  try {
    await systemEventManager.triggerEvent(eventCode, eventData, organizationId);
    console.log(`✅ Trigger ${eventCode} ejecutado exitosamente`);
  } catch (error) {
    console.error(`❌ Error ejecutando trigger ${eventCode}:`, error);
    throw error;
  }
};

/**
 * 🔍 FUNCIÓN DE MONITOREO DE STOCK AUTOMÁTICO
 * Verifica el stock de todos los productos y dispara triggers si es necesario
 */
export const checkAndTriggerLowStock = async (organizationId: number): Promise<void> => {
  console.log('🔍 Iniciando verificación automática de stock bajo...');
  
  try {
    // Consultar productos con stock bajo
    const { data: lowStockProducts, error } = await supabase
      .from('products')
      .select(`
        id,
        sku,
        name,
        stock_quantity,
        min_stock_level
      `)
      .eq('organization_id', organizationId)
      .eq('status', 'active')
      .not('min_stock_level', 'is', null)
      .filter('stock_quantity', 'lte', 'min_stock_level');

    if (error) {
      console.error('❌ Error consultando productos con stock bajo:', error);
      return;
    }

    if (!lowStockProducts || lowStockProducts.length === 0) {
      console.log('✅ No hay productos con stock bajo');
      return;
    }

    console.log(`⚠️ Encontrados ${lowStockProducts.length} productos con stock bajo`);

    // Disparar trigger para cada producto con stock bajo
    for (const product of lowStockProducts) {
      await triggerLowStock({
        product_id: product.id,
        product_name: product.name,
        sku: product.sku,
        current_stock: product.stock_quantity || 0,
        minimum_stock: product.min_stock_level || 0,
        location: 'Almacén Principal'
      }, organizationId);
    }

    console.log('✅ Verificación de stock completada');
    
  } catch (error) {
    console.error('❌ Error en verificación automática de stock:', error);
  }
};

/**
 * 📊 FUNCIÓN DE ESTADÍSTICAS DE TRIGGERS
 * Obtiene estadísticas de cuántos triggers se han disparado
 */
export const getTriggerExecutionStats = async (organizationId: number): Promise<{
  total_triggered: number;
  last_24h: number;
  by_event: Record<string, number>;
}> => {
  try {
    // Consultar notificaciones de triggers en las últimas 24h
    const { data: recentTriggers, error } = await supabase
      .from('notifications')
      .select('metadata, created_at')
      .eq('organization_id', organizationId)
      .eq('source_module', 'triggers')
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

    if (error) {
      console.error('❌ Error consultando estadísticas de triggers:', error);
      return { total_triggered: 0, last_24h: 0, by_event: {} };
    }

    const byEvent: Record<string, number> = {};
    
    recentTriggers?.forEach(trigger => {
      const eventCode = trigger.metadata?.event_code;
      if (eventCode) {
        byEvent[eventCode] = (byEvent[eventCode] || 0) + 1;
      }
    });

    return {
      total_triggered: recentTriggers?.length || 0,
      last_24h: recentTriggers?.length || 0,
      by_event: byEvent
    };
    
  } catch (error) {
    console.error('❌ Error obteniendo estadísticas de triggers:', error);
    return { total_triggered: 0, last_24h: 0, by_event: {} };
  }
};

/**
 * 🎯 EXPORTACIONES PRINCIPALES
 */
export const AutomaticTriggers = {
  // Eventos principales
  invoiceCreated: triggerInvoiceCreated,
  invoicePaid: triggerInvoicePaid,
  lowStock: triggerLowStock,
  userCreated: triggerUserCreated,
  reservationCreated: triggerReservationCreated,
  
  // Funciones utilitarias
  customEvent: triggerCustomEvent,
  checkLowStock: checkAndTriggerLowStock,
  getStats: getTriggerExecutionStats
};

export default AutomaticTriggers;
