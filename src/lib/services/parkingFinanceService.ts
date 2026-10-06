import { supabase } from '@/lib/supabase/config';
import { HORA_DEL_SERVIDOR } from '@/lib/pos/reloj/horaOficial';
import parkingPaymentService from '@/lib/services/parkingPaymentService';
import parkingService from '@/lib/services/parkingService';

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
  branch_id?: number;
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

      const invoiceData = {
        organization_id: data.organization_id,
        branch_id: data.branch_id,
        customer_id: data.customer_id || null,
        number: invoiceNumber?.number || `PKG-${Date.now()}`,
        // Emisión y vencimiento: hora del servidor, nunca el reloj del equipo.
        issue_date: HORA_DEL_SERVIDOR,
        due_date: HORA_DEL_SERVIDOR,
        // Sin `currency`: el trigger `trg_00_moneda_base_por_defecto` pone la
        // moneda base de la organización (parking no tiene moneda propia).
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

      // Línea de la factura. `invoice_items` no tiene quantity/subtotal/total:
      // son `qty` y `total_line`, y el CHECK `chk_invoice_items_type_sales`
      // exige `invoice_type='sale'` con `invoice_sales_id`. Antes el insert
      // fallaba (42703) sin que nadie mirara el error: facturas sin líneas.
      const { error: itemError } = await supabase.from('invoice_items').insert({
        invoice_id: invoice.id,
        invoice_sales_id: invoice.id,
        invoice_type: 'sale',
        description: data.description,
        qty: 1,
        unit_price: data.amount,
        tax_rate: 0,
        tax_included: true,
        total_line: data.amount,
      });
      if (itemError) throw itemError;

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
        branch_id: data.branch_id ?? null,
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

    // 1. Registrar el pago (payments + parking_payments), con el servicio único.
    const payment = await parkingPaymentService.registrarPago({
      organization_id,
      branch_id,
      source: source_type,
      source_id,
      method: payment_method_code,
      amount,
      created_by,
    });

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

    // 3. Cerrar la sesión con el monto cobrado
    if (source_type === 'parking_session') {
      await parkingService.registerExit(source_id, amount);
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
        // Factura emitida con saldo pendiente. `invoice_sales.status` no admite
        // 'pending' (CHECK: draft, issued, paid, partial, void): antes el update
        // fallaba en silencio y la factura a crédito quedaba como pagada.
        const { error: estadoError } = await supabase
          .from('invoice_sales')
          .update({ status: 'issued', balance: amount })
          .eq('id', invoice.id);
        if (estadoError) throw estadoError;
        invoice_id = invoice.id;
      }
    }

    // 2. Crear cuenta por cobrar
    const receivable = await this.createReceivableFromParking({
      organization_id,
      branch_id,
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

    // 3. Cerrar la sesión con el monto a crédito
    if (source_type === 'parking_session') {
      await parkingService.registerExit(source_id, amount);
    }

    return { receivable_id: receivable.id, invoice_id };
  }

  /**
   * Vincular pago de parking con factura
   */
  private async linkParkingPaymentToInvoice(sourceId: string, invoiceId: string): Promise<void> {
    try {
      // Actualizar el pago con referencia a la factura
      // `INV:` hace que trg_auto_journal_parking_payment no asiente el pago
      // (el ingreso ya lo asienta la factura).
      await supabase
        .from('payments')
        .update({ reference: `INV:${invoiceId}` })
        .in('source', ['parking_session', 'parking_pass'])
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
