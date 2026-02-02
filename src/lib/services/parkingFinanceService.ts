import { supabase } from '@/lib/supabase/config';

export interface InvoiceData {
  id: string;
  number: string;
  organization_id: number;
  branch_id: number;
  customer_id?: string;
  total: number;
  status: string;
  issue_date: string;
  payment_method_code?: string;
}

export interface AccountReceivableData {
  id: string;
  organization_id: number;
  customer_id: string;
  invoice_id?: string;
  amount: number;
  balance: number;
  due_date: string;
  status: string;
}

export interface CreateInvoiceFromParkingData {
  organization_id: number;
  branch_id: number;
  customer_id?: string;
  amount: number;
  description: string;
  payment_method_code: string;
  vehicle_plate?: string;
  source_type: 'parking_session' | 'parking_pass';
  source_id: string;
}

export interface CreateReceivableFromParkingData {
  organization_id: number;
  customer_id: string;
  amount: number;
  due_date: string;
  invoice_id?: string;
  source_type: 'parking_session' | 'parking_pass';
  source_id: string;
}

class ParkingFinanceService {
  /**
   * Obtener el siguiente número de factura
   */
  private async getNextInvoiceNumber(
    organizationId: number,
    branchId: number
  ): Promise<{ number: string; sequenceId: number } | null> {
    try {
      // Buscar secuencia activa para facturas de venta
      const { data: sequence, error } = await supabase
        .from('invoice_sequences')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('branch_id', branchId)
        .eq('document_type', 'invoice')
        .eq('is_active', true)
        .single();

      if (error || !sequence) {
        console.warn('No hay secuencia de facturación configurada');
        return null;
      }

      // Verificar que no se exceda el rango
      const nextNumber = sequence.current_number + 1;
      if (nextNumber > sequence.range_end) {
        console.error('Se ha excedido el rango de numeración');
        return null;
      }

      // Actualizar el número actual
      await supabase
        .from('invoice_sequences')
        .update({ current_number: nextNumber, updated_at: new Date().toISOString() })
        .eq('id', sequence.id);

      return {
        number: `${sequence.prefix}${nextNumber}`,
        sequenceId: sequence.id,
      };
    } catch (error) {
      console.error('Error obteniendo número de factura:', error);
      return null;
    }
  }

  /**
   * Generar factura de venta desde pago de parking
   */
  async createInvoiceFromParking(data: CreateInvoiceFromParkingData): Promise<InvoiceData | null> {
    try {
      // Obtener siguiente número de factura
      const invoiceNumber = await this.getNextInvoiceNumber(data.organization_id, data.branch_id);
      
      if (!invoiceNumber) {
        // Si no hay secuencia, generar número temporal
        const tempNumber = `PKG-${Date.now()}`;
        console.warn('Usando número temporal:', tempNumber);
      }

      const now = new Date().toISOString();
      const invoiceData = {
        organization_id: data.organization_id,
        branch_id: data.branch_id,
        customer_id: data.customer_id || null,
        number: invoiceNumber?.number || `PKG-${Date.now()}`,
        issue_date: now,
        due_date: now,
        currency: 'COP',
        subtotal: data.amount,
        tax_total: 0,
        total: data.amount,
        balance: 0, // Pagado completamente
        status: 'paid',
        payment_method_code: data.payment_method_code,
        description: data.description,
        notes: `Parking - ${data.vehicle_plate || 'Pase'} - ${data.source_type === 'parking_session' ? 'Sesión' : 'Pase'}`,
        tax_included: true,
        document_type: 'invoice',
        operation_type: 'standard',
        payment_form: '1', // Contado
      };

      const { data: invoice, error } = await supabase
        .from('invoice_sales')
        .insert(invoiceData)
        .select()
        .single();

      if (error) {
        console.error('Error creando factura:', error);
        throw error;
      }

      // Crear item de factura
      await supabase.from('invoice_items').insert({
        invoice_id: invoice.id,
        description: data.description,
        quantity: 1,
        unit_price: data.amount,
        subtotal: data.amount,
        tax_amount: 0,
        total: data.amount,
      });

      // Vincular pago de parking con factura
      await this.linkParkingPaymentToInvoice(data.source_id, invoice.id);

      return invoice as InvoiceData;
    } catch (error) {
      console.error('Error generando factura desde parking:', error);
      return null;
    }
  }

  /**
   * Crear cuenta por cobrar desde parking (crédito)
   */
  async createReceivableFromParking(
    data: CreateReceivableFromParkingData
  ): Promise<AccountReceivableData | null> {
    try {
      const receivableData = {
        organization_id: data.organization_id,
        customer_id: data.customer_id,
        invoice_id: data.invoice_id || null,
        amount: data.amount,
        balance: data.amount, // Pendiente completo
        due_date: data.due_date,
        status: 'pending',
        days_overdue: 0,
      };

      const { data: receivable, error } = await supabase
        .from('accounts_receivable')
        .insert(receivableData)
        .select()
        .single();

      if (error) {
        console.error('Error creando cuenta por cobrar:', error);
        throw error;
      }

      return receivable as AccountReceivableData;
    } catch (error) {
      console.error('Error generando cuenta por cobrar:', error);
      return null;
    }
  }

  /**
   * Registrar pago de parking con factura automática
   */
  async registerParkingPaymentWithInvoice(params: {
    organization_id: number;
    branch_id: number;
    source_type: 'parking_session' | 'parking_pass';
    source_id: string;
    amount: number;
    payment_method_code: string;
    customer_id?: string;
    vehicle_plate?: string;
    description?: string;
    generate_invoice?: boolean;
    created_by?: string;
  }): Promise<{ payment_id: string; invoice_id?: string }> {
    const {
      organization_id,
      branch_id,
      source_type,
      source_id,
      amount,
      payment_method_code,
      customer_id,
      vehicle_plate,
      description,
      generate_invoice = true,
      created_by,
    } = params;

    // 1. Registrar el pago
    const { data: payment, error: paymentError } = await supabase
      .from('payments')
      .insert({
        organization_id,
        branch_id,
        source: source_type,
        source_id,
        method: payment_method_code,
        amount,
        currency: 'COP',
        status: 'completed',
        created_by,
      })
      .select()
      .single();

    if (paymentError) throw paymentError;

    // 2. Generar factura si está habilitado
    let invoice_id: string | undefined;
    if (generate_invoice) {
      const invoice = await this.createInvoiceFromParking({
        organization_id,
        branch_id,
        customer_id,
        amount,
        description: description || `Servicio de parqueadero - ${vehicle_plate || 'Pase'}`,
        payment_method_code,
        vehicle_plate,
        source_type,
        source_id,
      });
      invoice_id = invoice?.id;
    }

    // 3. Actualizar sesión/pase si aplica
    if (source_type === 'parking_session') {
      await supabase
        .from('parking_sessions')
        .update({
          status: 'closed',
          amount,
          exit_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', source_id);
    }

    return { payment_id: payment.id, invoice_id };
  }

  /**
   * Registrar salida con crédito (cuenta por cobrar)
   */
  async registerParkingExitOnCredit(params: {
    organization_id: number;
    branch_id: number;
    source_type: 'parking_session' | 'parking_pass';
    source_id: string;
    amount: number;
    customer_id: string;
    due_days?: number;
    vehicle_plate?: string;
    description?: string;
    generate_invoice?: boolean;
  }): Promise<{ receivable_id: string; invoice_id?: string }> {
    const {
      organization_id,
      branch_id,
      source_type,
      source_id,
      amount,
      customer_id,
      due_days = 30,
      vehicle_plate,
      description,
      generate_invoice = true,
    } = params;

    // Calcular fecha de vencimiento
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + due_days);

    // 1. Generar factura si está habilitado
    let invoice_id: string | undefined;
    if (generate_invoice) {
      const invoice = await this.createInvoiceFromParking({
        organization_id,
        branch_id,
        customer_id,
        amount,
        description: description || `Servicio de parqueadero - ${vehicle_plate || 'Pase'}`,
        payment_method_code: 'credit',
        vehicle_plate,
        source_type,
        source_id,
      });

      if (invoice) {
        // Actualizar factura como pendiente
        await supabase
          .from('invoice_sales')
          .update({ status: 'pending', balance: amount })
          .eq('id', invoice.id);
        invoice_id = invoice.id;
      }
    }

    // 2. Crear cuenta por cobrar
    const receivable = await this.createReceivableFromParking({
      organization_id,
      customer_id,
      amount,
      due_date: dueDate.toISOString(),
      invoice_id,
      source_type,
      source_id,
    });

    if (!receivable) {
      throw new Error('No se pudo crear la cuenta por cobrar');
    }

    // 3. Actualizar sesión si aplica
    if (source_type === 'parking_session') {
      await supabase
        .from('parking_sessions')
        .update({
          status: 'closed',
          amount,
          exit_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', source_id);
    }

    return { receivable_id: receivable.id, invoice_id };
  }

  /**
   * Vincular pago de parking con factura
   */
  private async linkParkingPaymentToInvoice(sourceId: string, invoiceId: string): Promise<void> {
    try {
      // Buscar si existe registro en parking_payments
      const { data: existingLink } = await supabase
        .from('parking_payments')
        .select('id')
        .or(`parking_session_id.eq.${sourceId},parking_pass_id.eq.${sourceId}`)
        .single();

      if (existingLink) {
        // Actualizar con el invoice_id (si la tabla lo soporta)
        // Por ahora solo registramos el vínculo en payments
      }

      // Actualizar el pago con referencia a la factura
      await supabase
        .from('payments')
        .update({ reference: `INV:${invoiceId}` })
        .eq('source_id', sourceId);
    } catch (error) {
      console.error('Error vinculando pago con factura:', error);
    }
  }

  /**
   * Obtener facturas generadas desde parking
   */
  async getParkingInvoices(
    organizationId: number,
    filters?: {
      startDate?: string;
      endDate?: string;
      status?: string;
    }
  ): Promise<InvoiceData[]> {
    try {
      let query = supabase
        .from('invoice_sales')
        .select('*')
        .eq('organization_id', organizationId)
        .like('notes', 'Parking%')
        .order('issue_date', { ascending: false });

      if (filters?.startDate) {
        query = query.gte('issue_date', filters.startDate);
      }
      if (filters?.endDate) {
        query = query.lte('issue_date', filters.endDate);
      }
      if (filters?.status) {
        query = query.eq('status', filters.status);
      }

      const { data, error } = await query;
      if (error) throw error;

      return (data || []) as InvoiceData[];
    } catch (error) {
      console.error('Error obteniendo facturas de parking:', error);
      return [];
    }
  }

  /**
   * Obtener cuentas por cobrar de parking
   */
  async getParkingReceivables(organizationId: number): Promise<AccountReceivableData[]> {
    try {
      const { data, error } = await supabase
        .from('accounts_receivable')
        .select(`
          *,
          invoice:invoice_sales(number, notes)
        `)
        .eq('organization_id', organizationId)
        .in('status', ['pending', 'overdue'])
        .order('due_date', { ascending: true });

      if (error) throw error;

      // Filtrar solo las que son de parking (por las notas de la factura)
      const parkingReceivables = (data || []).filter(
        (r) => r.invoice?.notes?.startsWith('Parking')
      );

      return parkingReceivables as AccountReceivableData[];
    } catch (error) {
      console.error('Error obteniendo cuentas por cobrar de parking:', error);
      return [];
    }
  }

  /**
   * Verificar si la organización tiene facturación configurada
   */
  async hasInvoicingEnabled(organizationId: number, branchId: number): Promise<boolean> {
    try {
      const { data, error } = await supabase
        .from('invoice_sequences')
        .select('id')
        .eq('organization_id', organizationId)
        .eq('branch_id', branchId)
        .eq('is_active', true)
        .limit(1);

      if (error) return false;
      return (data?.length || 0) > 0;
    } catch {
      return false;
    }
  }
}

const parkingFinanceService = new ParkingFinanceService();
export default parkingFinanceService;
