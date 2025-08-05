/**
 * Utilidades para disparar eventos de triggers desde cualquier parte del sistema
 */

import triggerExecutionService from '@/lib/services/triggerExecutionService';

/**
 * Clase para gestionar eventos del sistema
 */
class SystemEventManager {
  
  /**
   * Disparar evento cuando se crea una factura
   */
  async onInvoiceCreated(invoiceData: {
    invoice_id: string;
    customer_name: string;
    amount: number;
    due_date: string;
    created_at?: string;
    [key: string]: any;
  }, organizationId: number): Promise<void> {
    
    const eventData = {
      ...invoiceData,
      created_at: invoiceData.created_at || new Date().toISOString(),
      amount_formatted: `$${invoiceData.amount.toFixed(2)}`
    };

    await this.triggerEvent('invoice.created', eventData, organizationId);
  }

  /**
   * Disparar evento cuando se paga una factura
   */
  async onInvoicePaid(invoiceData: {
    invoice_id: string;
    customer_name: string;
    amount: number;
    paid_at?: string;
    payment_method?: string;
    [key: string]: any;
  }, organizationId: number): Promise<void> {
    
    const eventData = {
      ...invoiceData,
      paid_at: invoiceData.paid_at || new Date().toISOString(),
      amount_formatted: `$${invoiceData.amount.toFixed(2)}`
    };

    await this.triggerEvent('invoice.paid', eventData, organizationId);
  }

  /**
   * Disparar evento cuando el stock está bajo
   */
  async onLowStock(stockData: {
    product_id: string;
    product_name: string;
    current_stock: number;
    minimum_stock: number;
    location?: string;
    [key: string]: any;
  }, organizationId: number): Promise<void> {
    
    const eventData = {
      ...stockData,
      location: stockData.location || 'Almacén Principal',
      stock_difference: stockData.minimum_stock - stockData.current_stock,
      checked_at: new Date().toISOString()
    };

    await this.triggerEvent('inventory.low_stock', eventData, organizationId);
  }



  /**
   * Disparar evento cuando se crea una reserva
   */
  async onReservationCreated(reservationData: {
    reservation_id: string;
    guest_name: string;
    room_number: string;
    check_in: string;
    check_out: string;
    total_amount: number;
    created_at?: string;
    [key: string]: any;
  }, organizationId: number): Promise<void> {
    
    const eventData = {
      ...reservationData,
      created_at: reservationData.created_at || new Date().toISOString(),
      total_amount_formatted: `$${reservationData.total_amount.toFixed(2)}`,
      nights: this.calculateNights(reservationData.check_in, reservationData.check_out)
    };

    await this.triggerEvent('reservation.created', eventData, organizationId);
  }

  /**
   * Disparar evento cuando se crea un nuevo usuario
   */
  async onUserCreated(userData: {
    user_id: string;
    name: string;
    email: string;
    role: string;
    created_at?: string;
    [key: string]: any;
  }, organizationId: number): Promise<void> {
    
    const eventData = {
      ...userData,
      created_at: userData.created_at || new Date().toISOString()
    };

    await this.triggerEvent('user.created', eventData, organizationId);
  }

  /**
   * Disparar evento cuando un usuario inicia sesión
   */
  async onUserLogin(loginData: {
    user_id: string;
    name: string;
    email: string;
    login_at?: string;
    ip_address?: string;
    user_agent?: string;
    [key: string]: any;
  }, organizationId: number): Promise<void> {
    
    const eventData = {
      ...loginData,
      login_at: loginData.login_at || new Date().toISOString()
    };

    await this.triggerEvent('user.login', eventData, organizationId);
  }

  /**
   * Método genérico para disparar cualquier evento
   */
  async triggerEvent(
    eventCode: string,
    eventData: Record<string, any>,
    organizationId: number
  ): Promise<void> {
    try {
      console.log(`🎯 Disparando evento del sistema: ${eventCode}`);
      
      const result = await triggerExecutionService.executeTriggersForEvent(
        eventCode,
        eventData,
        organizationId
      );

      if (result.success) {
        console.log(`✅ Evento ${eventCode} procesado: ${result.executedTriggers} triggers ejecutados`);
      } else {
        console.error(`❌ Error procesando evento ${eventCode}:`, result.errors);
      }

    } catch (error: any) {
      console.error(`❌ Error ejecutando evento ${eventCode}:`, error);
    }
  }

  /**
   * Calcular noches entre fechas
   */
  private calculateNights(checkIn: string, checkOut: string): number {
    const checkInDate = new Date(checkIn);
    const checkOutDate = new Date(checkOut);
    const timeDiff = checkOutDate.getTime() - checkInDate.getTime();
    return Math.ceil(timeDiff / (1000 * 3600 * 24));
  }

  /**
   * Verificar si un evento específico tiene triggers activos
   */
  async hasActiveTriggers(eventCode: string, organizationId: number): Promise<boolean> {
    try {
      // Solo verificar sin ejecutar
      const result = await triggerExecutionService.executeTriggersForEvent(
        eventCode,
        { _check_only: true },
        organizationId
      );
      
      return result.executedTriggers > 0;
    } catch {
      return false;
    }
  }
}

// Singleton para uso global
const systemEventManager = new SystemEventManager();

/**
 * Funciones de conveniencia para usar en cualquier parte del sistema
 */

// Exportar instancia principal
export default systemEventManager;

// Exportar funciones individuales para facilitar el uso
export const triggerInvoiceCreated = systemEventManager.onInvoiceCreated.bind(systemEventManager);
export const triggerInvoicePaid = systemEventManager.onInvoicePaid.bind(systemEventManager);
export const triggerLowStock = systemEventManager.onLowStock.bind(systemEventManager);
export const triggerReservationCreated = systemEventManager.onReservationCreated.bind(systemEventManager);
export const triggerUserCreated = systemEventManager.onUserCreated.bind(systemEventManager);
export const triggerUserLogin = systemEventManager.onUserLogin.bind(systemEventManager);
export const triggerCustomEvent = systemEventManager.triggerEvent.bind(systemEventManager);

/**
 * Helper para uso en componentes React
 */
export const useSystemEvents = () => ({
  triggerInvoiceCreated,
  triggerInvoicePaid,
  triggerLowStock,
  triggerReservationCreated,
  triggerUserCreated,
  triggerUserLogin,
  triggerCustomEvent,
  hasActiveTriggers: systemEventManager.hasActiveTriggers.bind(systemEventManager)
});
