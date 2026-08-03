import { supabase } from '@/lib/supabase/config';
import { stockMovementService } from './stockMovementService';
import { getOrganizationId, getCurrentBranchId } from '@/lib/hooks/useOrganization';

export interface Folio {
  id: string;
  reservation_id?: string;
  balance: number;
  status: 'open' | 'closed';
  created_at: string;
  updated_at: string;
  // Relaciones
  reservations?: {
    id: string;
    checkin: string;
    checkout: string;
    customer_id: string;
    customers?: {
      first_name: string;
      last_name: string;
      email: string;
    };
  };
  items?: FolioItem[];
  payments?: Payment[];
}

export interface FolioItemModifier {
  groupId: number;
  groupName: string;
  modifierId: number;
  name: string;
  extraPrice: number;
}

export interface FolioItem {
  id: string;
  folio_id: string;
  source: string;
  description: string;
  amount: number;
  tax_code?: string;
  product_id?: number | null;
  quantity?: number | null;
  unit_price?: number | null;
  variant_data?: Record<string, string> | null;
  modifiers?: FolioItemModifier[] | null;
  cash_session_id?: number | null;
  payment_status?: 'pending' | 'paid';
  charge_type?: 'room_charge' | 'direct_payment';
  paid_at?: string | null;
  payment_method?: string | null;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export interface Payment {
  id: string;
  organization_id?: number;
  branch_id?: number;
  source?: string;
  source_id?: string;
  method?: string;
  amount?: number;
  currency: string;
  reference?: string;
  processor_response?: any;
  status?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export interface CreateFolioItemData {
  folio_id: string;
  source: string;
  description: string;
  amount: number;
  tax_code?: string;
  product_id?: number | null;
  quantity?: number | null;
  unit_price?: number | null;
  variant_data?: Record<string, string> | null;
  modifiers?: FolioItemModifier[] | null;
  cash_session_id?: number | null;
  payment_status?: 'pending' | 'paid';
  charge_type?: 'room_charge' | 'direct_payment';
  paid_at?: string | null;
  payment_method?: string | null;
  created_by?: string;
}

export interface CreatePaymentData {
  organization_id?: number;
  branch_id?: number;
  source: string;
  source_id: string;
  method: string;
  amount: number;
  currency?: string;
  reference?: string;
  status?: string;
  created_by?: string;
}

class FoliosService {
  /**
   * Obtener todos los folios con filtros
   */
  async getFolios(filters?: {
    status?: 'open' | 'closed' | 'all';
    reservation_id?: string;
    organizationId?: number;
    branchId?: number | null;
  }): Promise<Folio[]> {
    try {
      let query = supabase
        .from('folios')
        .select(`
          id,
          reservation_id,
          balance,
          status,
          created_at,
          updated_at,
          reservations (
            id,
            checkin,
            checkout,
            customer_id,
            organization_id,
            branch_id,
            customers (
              first_name,
              last_name,
              email
            )
          )
        `)
        .order('created_at', { ascending: false });

      if (filters?.status && filters.status !== 'all') {
        query = query.eq('status', filters.status);
      }

      if (filters?.reservation_id) {
        query = query.eq('reservation_id', filters.reservation_id);
      }

      if (filters?.branchId) {
        query = query.eq('reservations.branch_id', filters.branchId);
      } else if (filters?.organizationId) {
        query = query.eq('reservations.organization_id', filters.organizationId);
      }

      const { data, error } = await query;

      if (error) throw error;

      // Transformar datos
      return ((data || []) as any[]).map(folio => {
        const reservations = folio.reservations?.[0] || folio.reservations;
        return {
          ...folio,
          reservations: reservations ? {
            ...reservations,
            customers: reservations.customers?.[0] || reservations.customers
          } : undefined
        };
      }) as Folio[];
    } catch (error) {
      console.error('Error obteniendo folios:', error);
      throw error;
    }
  }

  /**
   * Obtener folio por ID con items y pagos
   */
  async getFolioById(folioId: string): Promise<Folio | null> {
    try {
      const { data: folio, error } = await supabase
        .from('folios')
        .select(`
          id,
          reservation_id,
          balance,
          status,
          created_at,
          updated_at,
          reservations (
            id,
            checkin,
            checkout,
            customer_id,
            customers (
              first_name,
              last_name,
              email
            )
          )
        `)
        .eq('id', folioId)
        .single();

      if (error) throw error;
      if (!folio) return null;

      // Obtener items del folio
      const { data: items } = await supabase
        .from('folio_items')
        .select('*')
        .eq('folio_id', folioId)
        .order('created_at', { ascending: true });

      // Obtener pagos del folio
      const { data: payments } = await supabase
        .from('payments')
        .select('*')
        .eq('source', 'folio')
        .eq('source_id', folioId)
        .order('created_at', { ascending: true});

      const reservations = folio.reservations?.[0] || folio.reservations;
      return {
        ...folio,
        reservations: reservations ? {
          ...reservations,
          customers: reservations.customers?.[0] || reservations.customers
        } : undefined,
        items: items || [],
        payments: payments || [],
      } as Folio;
    } catch (error) {
      console.error('Error obteniendo folio:', error);
      throw error;
    }
  }

  /**
   * Agregar item al folio
   */
  async addFolioItem(data: CreateFolioItemData): Promise<FolioItem> {
    try {
      console.log('addFolioItem - Datos a insertar:', data);
      
      const { data: item, error } = await supabase
        .from('folio_items')
        .insert(data)
        .select()
        .single();

      if (error) {
        console.error('Error insertando item en folio_items:', {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code,
        });
        throw error;
      }

      if (!item) {
        throw new Error('No se pudo crear el item - data es null');
      }

      console.log('Item creado exitosamente:', item.id);

      // Descontar stock si el item tiene product_id
      if (data.product_id && data.quantity && data.quantity > 0) {
        try {
          const orgId = getOrganizationId();
          const branchId = getCurrentBranchId();
          if (!branchId) {
            console.warn('⚠️ No se pudo obtener branch_id para descontar stock del folio item');
            return;
          }
          const stockResult = await stockMovementService.decrementOnSale(
            orgId,
            branchId,
            data.folio_id,
            [{ product_id: data.product_id, quantity: Number(data.quantity), unit_price: Number(data.unit_price || 0) }],
            'folio_item',
            data.created_by
          );
          if (stockResult.errors.length > 0) {
            console.warn('⚠️ Folio item no descontó stock:', stockResult.errors);
          }
        } catch (stockError) {
          console.warn('⚠️ Error descontando stock (no bloquea el item):', stockError);
        }
      }

      // Actualizar balance del folio
      await this.updateFolioBalance(data.folio_id);

      return item as FolioItem;
    } catch (error: any) {
      console.error('Error completo agregando item:', {
        message: error.message,
        name: error.name,
        stack: error.stack,
      });
      throw error;
    }
  }

  /**
   * Eliminar item del folio
   */
  async deleteFolioItem(itemId: string, folioId: string): Promise<void> {
    try {
      // Obtener el item antes de eliminarlo para saber si hay que revertir stock
      const { data: item } = await supabase
        .from('folio_items')
        .select('product_id, quantity, unit_price')
        .eq('id', itemId)
        .maybeSingle();

      const { error } = await supabase
        .from('folio_items')
        .delete()
        .eq('id', itemId);

      if (error) throw error;

      // Revertir stock si el item tenía product_id
      if (item?.product_id && item?.quantity && Number(item.quantity) > 0) {
        try {
          const orgId = getOrganizationId();
          const branchId = getCurrentBranchId();
          if (!branchId) {
            console.warn('⚠️ No se pudo obtener branch_id para revertir stock del folio item');
            return;
          }
          await stockMovementService.incrementOnPurchase(
            orgId,
            branchId,
            folioId,
            [{ product_id: item.product_id, quantity: Number(item.quantity), unit_price: Number(item.unit_price || 0) }],
            'folio_item_reversal'
          );
          console.log(`📦 Stock revertido (folio item eliminado): producto ${item.product_id}`);
        } catch (stockError) {
          console.warn('⚠️ Error revirtiendo stock (no bloquea eliminación):', stockError);
        }
      }

      // Actualizar balance del folio
      await this.updateFolioBalance(folioId);
    } catch (error) {
      console.error('Error eliminando item:', error);
      throw error;
    }
  }

  /**
   * Mover item entre folios
   */
  async moveFolioItem(itemId: string, fromFolioId: string, toFolioId: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('folio_items')
        .update({ folio_id: toFolioId })
        .eq('id', itemId);

      if (error) throw error;

      // Actualizar balance de ambos folios
      await Promise.all([
        this.updateFolioBalance(fromFolioId),
        this.updateFolioBalance(toFolioId),
      ]);
    } catch (error) {
      console.error('Error moviendo item:', error);
      throw error;
    }
  }

  /**
   * Agregar pago al folio
   */
  async addPayment(data: CreatePaymentData): Promise<Payment> {
    try {
      const { data: payment, error } = await supabase
        .from('payments')
        .insert({
          ...data,
          currency: data.currency || 'USD',
          status: data.status || 'completed',
        })
        .select()
        .single();

      if (error) throw error;

      // Actualizar balance del folio
      await this.updateFolioBalance(data.source_id);

      return payment as Payment;
    } catch (error) {
      console.error('Error agregando pago:', error);
      throw error;
    }
  }

  /**
   * Marcar items del folio como pagados y registrar pago en payments
   */
  async payFolioItems(
    folioId: string,
    amount: number,
    paymentMethod: string,
    cashSessionId?: number | null,
    createdBy?: string
  ): Promise<void> {
    try {
      // 1. Registrar el pago en payments
      const { error: paymentError } = await supabase
        .from('payments')
        .insert({
          source: 'folio',
          source_id: folioId,
          method: paymentMethod,
          amount,
          currency: 'USD',
          status: 'completed',
          created_by: createdBy || null,
        });

      if (paymentError) throw paymentError;

      // 2. Obtener items pendientes ordenados por fecha (FIFO)
      const { data: pendingItems, error: itemsError } = await supabase
        .from('folio_items')
        .select('id, amount')
        .eq('folio_id', folioId)
        .eq('payment_status', 'pending')
        .order('created_at', { ascending: true });

      if (itemsError) throw itemsError;

      // 3. Marcar items como pagados hasta cubrir el monto del pago
      let remaining = amount;
      const now = new Date().toISOString();

      for (const item of pendingItems || []) {
        if (remaining <= 0) break;
        remaining -= Number(item.amount);

        const { error: updateError } = await supabase
          .from('folio_items')
          .update({
            payment_status: 'paid',
            paid_at: now,
            payment_method: paymentMethod,
          })
          .eq('id', item.id);

        if (updateError) {
          console.error('Error marcando item como pagado:', updateError);
        }
      }

      // 4. Actualizar balance del folio
      await this.updateFolioBalance(folioId);
    } catch (error) {
      console.error('Error pagando items del folio:', error);
      throw error;
    }
  }

  /**
   * Aplicar descuento al folio
   */
  async applyDiscount(folioId: string, amount: number, description: string, createdBy?: string): Promise<FolioItem> {
    return this.addFolioItem({
      folio_id: folioId,
      source: 'manual',
      description: `Descuento: ${description}`,
      amount: -Math.abs(amount), // Negativo para descuento
      created_by: createdBy,
    });
  }

  /**
   * Cerrar folio
   */
  async closeFolio(folioId: string): Promise<Folio> {
    try {
      const { data, error } = await supabase
        .from('folios')
        .update({
          status: 'closed',
          updated_at: new Date().toISOString(),
        })
        .eq('id', folioId)
        .select()
        .single();

      if (error) throw error;

      return data as Folio;
    } catch (error) {
      console.error('Error cerrando folio:', error);
      throw error;
    }
  }

  /**
   * Reabrir folio
   */
  async reopenFolio(folioId: string): Promise<Folio> {
    try {
      const { data, error } = await supabase
        .from('folios')
        .update({
          status: 'open',
          updated_at: new Date().toISOString(),
        })
        .eq('id', folioId)
        .select()
        .single();

      if (error) throw error;

      return data as Folio;
    } catch (error) {
      console.error('Error reabriendo folio:', error);
      throw error;
    }
  }

  /**
   * Actualizar balance del folio
   */
  private async updateFolioBalance(folioId: string): Promise<void> {
    try {
      console.log('updateFolioBalance - folioId:', folioId);
      
      // Obtener todos los items
      const { data: items, error: itemsError } = await supabase
        .from('folio_items')
        .select('amount')
        .eq('folio_id', folioId);

      if (itemsError) {
        console.error('Error obteniendo items:', itemsError);
      }

      // Obtener todos los pagos (convertir folioId a text para la comparación)
      const { data: payments, error: paymentsError } = await supabase
        .from('payments')
        .select('amount')
        .eq('source', 'folio')
        .eq('source_id', folioId) // folioId es string, source_id es text
        .eq('status', 'completed');

      if (paymentsError) {
        console.error('Error obteniendo pagos:', paymentsError);
      }

      const itemsTotal = items?.reduce((sum, item) => sum + Number(item.amount), 0) || 0;
      const paymentsTotal = payments?.reduce((sum, payment) => sum + Number(payment.amount || 0), 0) || 0;
      const balance = itemsTotal - paymentsTotal;

      console.log('Balance calculado:', {
        itemsTotal,
        paymentsTotal,
        balance,
        itemsCount: items?.length || 0,
        paymentsCount: payments?.length || 0,
      });

      // Actualizar balance
      const { error: updateError } = await supabase
        .from('folios')
        .update({
          balance,
          updated_at: new Date().toISOString(),
        })
        .eq('id', folioId);

      if (updateError) {
        console.error('Error actualizando balance en BD:', updateError);
        throw updateError;
      }

      console.log('Balance actualizado exitosamente');
    } catch (error) {
      console.error('Error actualizando balance:', error);
      throw error;
    }
  }

  /**
   * Recalcular balance de un folio (público)
   */
  async recalculateFolioBalance(folioId: string): Promise<void> {
    return this.updateFolioBalance(folioId);
  }

  /**
   * Obtener resumen del folio
   */
  async getFolioSummary(folioId: string): Promise<{
    subtotal: number;
    payments: number;
    balance: number;
    itemCount: number;
    paymentCount: number;
    totalPending: number;
    totalPaid: number;
    pendingCount: number;
    paidCount: number;
  }> {
    try {
      const folio = await this.getFolioById(folioId);
      
      if (!folio) {
        return {
          subtotal: 0,
          payments: 0,
          balance: 0,
          itemCount: 0,
          paymentCount: 0,
          totalPending: 0,
          totalPaid: 0,
          pendingCount: 0,
          paidCount: 0,
        };
      }

      const subtotal = folio.items?.reduce((sum, item) => sum + Number(item.amount), 0) || 0;
      const payments = folio.payments?.reduce((sum, payment) => sum + Number(payment.amount || 0), 0) || 0;

      const totalPending = folio.items
        ?.filter(item => item.payment_status === 'pending')
        .reduce((sum, item) => sum + Number(item.amount), 0) || 0;
      const totalPaid = folio.items
        ?.filter(item => item.payment_status === 'paid')
        .reduce((sum, item) => sum + Number(item.amount), 0) || 0;
      const pendingCount = folio.items?.filter(item => item.payment_status === 'pending').length || 0;
      const paidCount = folio.items?.filter(item => item.payment_status === 'paid').length || 0;

      return {
        subtotal,
        payments,
        balance: folio.balance,
        itemCount: folio.items?.length || 0,
        paymentCount: folio.payments?.length || 0,
        totalPending,
        totalPaid,
        pendingCount,
        paidCount,
      };
    } catch (error) {
      console.error('Error obteniendo resumen:', error);
      throw error;
    }
  }
}

export default new FoliosService();
