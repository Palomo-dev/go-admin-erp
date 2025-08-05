/**
 * 🎯 SERVICIO INTERCEPTOR UNIVERSAL DE TRIGGERS DE FACTURAS
 * 
 * Este servicio garantiza que CUALQUIER método de creación de facturas
 * dispare automáticamente el trigger invoice.created, sin importar dónde
 * o cómo se cree la factura en el sistema.
 */

import { supabase } from '@/lib/supabase/config';
import { AutomaticTriggers } from '@/lib/services/automaticTriggerIntegrations';

/**
 * 🔍 INTERCEPTOR DE BASE DE DATOS
 * 
 * Esta función se conecta a los cambios en tiempo real de Supabase
 * para detectar automáticamente CUALQUIER inserción en invoice_sales
 * y disparar el trigger correspondiente.
 */
export class UniversalInvoiceTriggerService {
  private static subscription: any = null;
  private static isActive = false;

  /**
   * 🚀 INICIALIZAR INTERCEPTOR UNIVERSAL
   * 
   * Configura la escucha en tiempo real para todas las inserciones
   * de facturas, sin importar el método de creación.
   */
  static async initialize(): Promise<void> {
    if (this.isActive) {
      console.log('🎯 Interceptor universal ya está activo');
      return;
    }

    console.log('🚀 Inicializando interceptor universal de facturas...');

    try {
      // Suscribirse a todos los INSERTs en invoice_sales
      this.subscription = supabase
        .channel('universal-invoice-trigger')
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'invoice_sales'
          },
          async (payload) => {
            console.log('🔔 Nueva factura detectada por interceptor:', payload.new);
            await this.handleNewInvoice(payload.new);
          }
        )
        .subscribe();

      this.isActive = true;
      console.log('✅ Interceptor universal de facturas activado');

    } catch (error) {
      console.error('❌ Error inicializando interceptor universal:', error);
      throw error;
    }
  }

  /**
   * 🛑 DETENER INTERCEPTOR
   */
  static async stop(): Promise<void> {
    if (this.subscription) {
      await supabase.removeChannel(this.subscription);
      this.subscription = null;
      this.isActive = false;
      console.log('🛑 Interceptor universal de facturas detenido');
    }
  }

  /**
   * 📧 MANEJAR NUEVA FACTURA DETECTADA
   * 
   * Procesa automáticamente cualquier factura nueva y dispara el trigger
   */
  private static async handleNewInvoice(invoiceData: any): Promise<void> {
    try {
      console.log('📧 Procesando nueva factura para trigger automático...');

      // Obtener datos adicionales necesarios para el trigger
      const enrichedData = await this.enrichInvoiceData(invoiceData);

      // Verificar si ya se disparó el trigger desde el método original
      const skipTrigger = await this.shouldSkipTrigger(invoiceData.id);
      
      if (skipTrigger) {
        console.log('⏭️ Trigger ya disparado por método original, omitiendo interceptor');
        return;
      }

      // Disparar trigger automático
      await AutomaticTriggers.invoiceCreated(enrichedData, invoiceData.organization_id);
      
      // Marcar como procesado
      await this.markTriggerProcessed(invoiceData.id);
      
      console.log('✅ Trigger universal ejecutado exitosamente para factura:', invoiceData.number);

    } catch (error) {
      console.error('❌ Error en interceptor universal:', error);
      // No re-lanzar el error para evitar afectar otras operaciones
    }
  }

  /**
   * 🔍 ENRIQUECER DATOS DE FACTURA
   * 
   * Obtiene información adicional necesaria para el trigger
   */
  private static async enrichInvoiceData(invoiceData: any): Promise<any> {
    try {
      // Obtener datos del cliente
      let customerData = null;
      if (invoiceData.customer_id) {
        const { data } = await supabase
          .from('customers')
          .select('name, email, phone')
          .eq('id', invoiceData.customer_id)
          .single();
        customerData = data;
      }

      // Obtener items de la factura
      const { data: items } = await supabase
        .from('invoice_items')
        .select(`
          *,
          products (name, sku)
        `)
        .eq('invoice_sales_id', invoiceData.id);

      // Construir datos enriquecidos para el trigger
      return {
        invoice_id: invoiceData.number || invoiceData.id.toString(),
        customer_name: customerData?.name || 'Cliente no especificado',
        customer_email: customerData?.email || '',
        customer_phone: customerData?.phone || '',
        amount: invoiceData.total || 0,
        subtotal: invoiceData.subtotal || 0,
        tax_total: invoiceData.tax_total || 0,
        due_date: invoiceData.due_date || '',
        created_at: invoiceData.created_at || new Date().toISOString(),
        payment_method: invoiceData.payment_method || 'No especificado',
        currency: invoiceData.currency || 'COP',
        status: invoiceData.status || 'draft',
        products: items?.map(item => ({
          name: item.products?.name || item.description || 'Producto',
          sku: item.products?.sku || `ITEM-${item.product_id}`,
          description: item.description || '',
          quantity: item.qty || 0,
          unit_price: item.unit_price || 0,
          total: item.total_line || 0,
          tax_rate: item.tax_rate || 0
        })) || [],
        invoice_type: 'universal_intercept',
        created_from: 'universal_interceptor',
        organization_id: invoiceData.organization_id,
        branch_id: invoiceData.branch_id,
        sale_id: invoiceData.sale_id,
        balance: invoiceData.balance || invoiceData.total || 0
      };

    } catch (error) {
      console.error('❌ Error enriqueciendo datos de factura:', error);
      
      // Retornar datos básicos si falla el enriquecimiento
      return {
        invoice_id: invoiceData.number || invoiceData.id.toString(),
        customer_name: 'Cliente no especificado',
        customer_email: '',
        amount: invoiceData.total || 0,
        due_date: invoiceData.due_date || '',
        created_at: invoiceData.created_at || new Date().toISOString(),
        invoice_type: 'universal_intercept_fallback',
        created_from: 'universal_interceptor'
      };
    }
  }

  /**
   * 🔍 VERIFICAR SI DEBE OMITIR TRIGGER
   * 
   * Evita disparar el trigger dos veces si ya se disparó desde el método original
   */
  private static async shouldSkipTrigger(invoiceId: string): Promise<boolean> {
    try {
      // Verificar si existe una notificación reciente para esta factura
      const { data } = await supabase
        .from('notifications')
        .select('id')
        .eq('source_module', 'triggers')
        .ilike('title', `%${invoiceId}%`)
        .gte('created_at', new Date(Date.now() - 5 * 60 * 1000).toISOString()) // Últimos 5 minutos
        .limit(1);

      return !!(data && data.length > 0);

    } catch (error) {
      console.error('❌ Error verificando si omitir trigger:', error);
      return false; // En caso de error, proceder con el trigger
    }
  }

  /**
   * ✅ MARCAR TRIGGER COMO PROCESADO
   */
  private static async markTriggerProcessed(invoiceId: string): Promise<void> {
    try {
      // Crear una marca temporal en la base de datos para evitar duplicados
      await supabase
        .from('notifications')
        .insert({
          title: `Trigger procesado para factura ${invoiceId}`,
          message: 'Marcador interno para evitar triggers duplicados',
          type: 'system',
          source_module: 'universal_interceptor',
          metadata: {
            invoice_id: invoiceId,
            processed_at: new Date().toISOString(),
            type: 'trigger_marker'
          }
        });

    } catch (error) {
      console.error('❌ Error marcando trigger como procesado:', error);
      // No es crítico si falla
    }
  }

  /**
   * 📊 ESTADÍSTICAS DEL INTERCEPTOR
   */
  static async getStats(): Promise<{
    isActive: boolean;
    interceptedToday: number;
    lastProcessed: string | null;
  }> {
    try {
      const today = new Date().toISOString().split('T')[0];
      
      const { data } = await supabase
        .from('notifications')
        .select('created_at')
        .eq('source_module', 'universal_interceptor')
        .gte('created_at', `${today}T00:00:00.000Z`)
        .order('created_at', { ascending: false });

      return {
        isActive: this.isActive,
        interceptedToday: data?.length || 0,
        lastProcessed: data?.[0]?.created_at || null
      };

    } catch (error) {
      console.error('❌ Error obteniendo estadísticas del interceptor:', error);
      return {
        isActive: this.isActive,
        interceptedToday: 0,
        lastProcessed: null
      };
    }
  }

  /**
   * 🧪 PROBAR INTERCEPTOR
   */
  static async testInterceptor(organizationId: number): Promise<void> {
    console.log('🧪 Probando interceptor universal...');
    
    try {
      // Crear una factura de prueba
      const testInvoice = {
        organization_id: organizationId,
        branch_id: 1,
        customer_id: null,
        number: `TEST-INTERCEPT-${Date.now()}`,
        issue_date: new Date().toISOString(),
        due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        currency: 'COP',
        subtotal: 100000,
        tax_total: 19000,
        total: 119000,
        balance: 119000,
        status: 'draft',
        payment_method: 'test',
        notes: 'Factura de prueba para interceptor universal'
      };

      const { data, error } = await supabase
        .from('invoice_sales')
        .insert(testInvoice)
        .select()
        .single();

      if (error) {
        throw error;
      }

      console.log('✅ Factura de prueba creada, interceptor debería procesarla automáticamente');
      console.log('📋 Factura creada:', data.number);

      // Esperar un momento para que el interceptor procese
      setTimeout(() => {
        console.log('⏰ El interceptor debería haber procesado la factura de prueba');
      }, 2000);

    } catch (error) {
      console.error('❌ Error probando interceptor:', error);
      throw error;
    }
  }
}

/**
 * 🔧 FUNCIÓN PARA INICIALIZAR EN EL ARRANQUE DE LA APP
 */
export const initializeUniversalInvoiceTriggers = async () => {
  try {
    await UniversalInvoiceTriggerService.initialize();
    console.log('🎯 Sistema universal de triggers de facturas inicializado');
  } catch (error) {
    console.error('❌ Error inicializando sistema universal de triggers:', error);
  }
};

export default UniversalInvoiceTriggerService;
