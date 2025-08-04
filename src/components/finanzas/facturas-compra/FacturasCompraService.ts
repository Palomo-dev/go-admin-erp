import { supabase } from '@/lib/supabase/config';
import { obtenerOrganizacionActiva, getOrganizationId, getCurrentBranchId, getCurrentUserId } from '@/lib/hooks/useOrganization';
import { 
  InvoicePurchase, 
  SupplierBase, 
  FiltrosFacturasCompra, 
  NuevaFacturaCompraForm,
  OrganizationPaymentMethod,
  OrganizationCurrency,
  CurrencyRate,
  AccountPayable
} from './types';

export class FacturasCompraService {
  private static organizationId = getOrganizationId();
  private static branchId = getCurrentBranchId();

  /**
   * Obtiene todas las facturas de compra con filtros aplicados
   */
  static async obtenerFacturas(
    filtros: FiltrosFacturasCompra,
    page: number = 1,
    pageSize: number = 10
  ): Promise<{
    facturas: InvoicePurchase[];
    total: number;
    totalPages: number;
  }> {
    try {
      let query = supabase
        .from('invoice_purchase')
        .select(`
          *,
          supplier:suppliers(
            id,
            name,
            nit,
            contact,
            phone,
            email
          )
        `, { count: 'exact' })
        .eq('organization_id', this.organizationId);

      // Aplicar filtros
      if (filtros.estado !== 'todos') {
        query = query.eq('status', filtros.estado);
      }

      if (filtros.proveedor !== 'todos') {
        query = query.eq('supplier_id', parseInt(filtros.proveedor));
      }

      if (filtros.busqueda) {
        query = query.or(`number_ext.ilike.%${filtros.busqueda}%,notes.ilike.%${filtros.busqueda}%`);
      }

      if (filtros.fechaDesde) {
        query = query.gte('issue_date', filtros.fechaDesde);
      }

      if (filtros.fechaHasta) {
        query = query.lte('issue_date', filtros.fechaHasta);
      }

      // Paginación
      const from = (page - 1) * pageSize;
      query = query
        .order('created_at', { ascending: false })
        .range(from, from + pageSize - 1);

      const { data, error, count } = await query;

      if (error) {
        console.error('Error obteniendo facturas de compra:', error);
        throw error;
      }

      const totalPages = Math.ceil((count || 0) / pageSize);

      return {
        facturas: data || [],
        total: count || 0,
        totalPages
      };
    } catch (error) {
      console.error('Error en obtenerFacturas:', error);
      throw error;
    }
  }

  /**
   * Obtiene una factura de compra por ID
   */
  static async obtenerFacturaPorId(id: string): Promise<InvoicePurchase | null> {
    try {
      // Usar getOrganizationId() que es más confiable en el frontend
      const organizationId = getOrganizationId();
      
      if (!organizationId) {
        console.error('No se pudo obtener organization_id');
        return null;
      }
      
      console.log('Buscando factura:', { id, organizationId });
      
      const { data, error } = await supabase
        .from('invoice_purchase')
        .select(`
          *,
          supplier:suppliers(*),
          accounts_payable(*)
        `)
        .eq('id', id)
        .eq('organization_id', organizationId)
        .single();
        
      if (error) {
        console.error('Error obteniendo factura:', {
          error,
          id,
          organizationId,
          errorCode: error.code,
          errorMessage: error.message
        });
        return null;
      }
      
      // Obtener items por separado usando invoice_purchase_id
      const { data: items, error: itemsError } = await supabase
        .from('invoice_items')
        .select(`
          id,
          product_id,
          description,
          qty,
          unit_price,
          total_line,
          tax_rate,
          discount_amount
        `)
        .eq('invoice_purchase_id', id);
        
      if (itemsError) {
        console.error('Error obteniendo items de factura:', itemsError);
        // No retornar null, solo log del error
      }
      
      // Agregar items a la factura
      const facturaCompleta = {
        ...data,
        items: items || []
      };

      console.log('Factura encontrada:', facturaCompleta);
      return facturaCompleta;
    } catch (error) {
      console.error('Error en obtenerFacturaPorId:', error);
      return null;
    }
  }

  /**
   * Crea una nueva factura de compra
   */
  static async crearFactura(formData: NuevaFacturaCompraForm): Promise<InvoicePurchase> {
    try {
      const currentUserId = await getCurrentUserId();
      
      // Calcular totales
      const subtotal = formData.items.reduce((sum, item) => 
        sum + (item.qty * item.unit_price - (item.discount_amount || 0)), 0
      );
      
      const taxTotal = formData.items.reduce((sum, item) => {
        const lineSubtotal = item.qty * item.unit_price - (item.discount_amount || 0);
        return sum + (lineSubtotal * (item.tax_rate || 0) / 100);
      }, 0);

      const total = formData.tax_included ? subtotal : subtotal + taxTotal;

      // Crear la factura principal
      const { data: factura, error: facturaError } = await supabase
        .from('invoice_purchase')
        .insert({
          organization_id: this.organizationId,
          branch_id: this.branchId,
          supplier_id: formData.supplier_id,
          number_ext: formData.number_ext,
          issue_date: formData.issue_date,
          due_date: formData.due_date,
          currency: formData.currency,
          subtotal,
          tax_total: taxTotal,
          total,
          balance: total, // Inicialmente el balance es igual al total
          status: 'draft',
          created_by: currentUserId,
          notes: formData.notes,
          payment_terms: formData.payment_terms,
          tax_included: formData.tax_included
        })
        .select()
        .single();

      if (facturaError) {
        console.error('Error creando factura:', facturaError);
        throw facturaError;
      }

      // Crear los items de la factura
      if (formData.items.length > 0) {
        const lineSubtotal = (item: any) => item.qty * item.unit_price - (item.discount_amount || 0);
        const lineTaxAmount = (item: any) => (lineSubtotal(item) * (item.tax_rate || 0)) / 100;
        
        const items = formData.items.map(item => ({
          // Campos requeridos para facturas de compra
          invoice_id: factura.id, // Campo genérico requerido
          invoice_type: 'purchase' as const,
          invoice_purchase_id: factura.id, // Campo específico para facturas de compra
          invoice_sales_id: null, // Debe ser null para facturas de compra
          product_id: item.product_id || null,
          description: item.description,
          qty: item.qty,
          unit_price: item.unit_price,
          tax_rate: item.tax_rate || 0,
          total_line: lineSubtotal(item),
          discount_amount: item.discount_amount || 0,
          tax_included: formData.tax_included || false // Campo requerido
        }));
        
        console.log('Items a insertar:', items);

        const { error: itemsError } = await supabase
          .from('invoice_items')
          .insert(items);

        if (itemsError) {
          console.error('Error creando items de factura:', itemsError);
          throw itemsError;
        }
      }

      // Crear cuenta por pagar
      const { error: accountError } = await supabase
        .from('accounts_payable')
        .insert({
          organization_id: this.organizationId,
          supplier_id: formData.supplier_id,
          invoice_id: factura.id,
          amount: total,
          balance: total,
          due_date: formData.due_date,
          status: 'pending'
        });

      if (accountError) {
        console.error('Error creando cuenta por pagar:', accountError);
        // No lanzamos error aquí para no bloquear la creación de la factura
      }

      // Actualizar inventario para productos con product_id válido
      if (this.branchId) {
        await this.actualizarInventarioPorCompra(factura.id, formData.items, this.branchId);
      } else {
        console.warn('No se pudo actualizar inventario: branchId no disponible');
      }

      return factura;
    } catch (error) {
      console.error('Error en crearFactura:', error);
      throw error;
    }
  }

  /**
   * Actualiza una factura de compra existente
   */
  static async actualizarFactura(facturaId: string, formData: NuevaFacturaCompraForm): Promise<InvoicePurchase> {
    try {
      console.log('Actualizando factura:', facturaId, formData);

      // Verificar que la factura existe y se puede editar
      const { data: facturaExistente, error: checkError } = await supabase
        .from('invoice_purchase')
        .select('id, status')
        .eq('id', facturaId)
        .single();

      if (checkError) {
        console.error('Error verificando factura:', checkError);
        throw checkError;
      }

      if (!facturaExistente) {
        throw new Error('Factura no encontrada');
      }

      // Verificar estado editable
      if (!['draft', 'pending'].includes(facturaExistente.status)) {
        throw new Error(`No se puede editar una factura en estado "${facturaExistente.status}"`);
      }

      // Calcular totales
      let subtotal = 0;
      let tax_total = 0;
      
      formData.items.forEach(item => {
        const itemSubtotal = item.qty * item.unit_price - (item.discount_amount || 0);
        subtotal += itemSubtotal;
        if (!formData.tax_included) {
          tax_total += (itemSubtotal * (item.tax_rate || 0)) / 100;
        }
      });
      
      const total = formData.tax_included ? subtotal : subtotal + tax_total;

      // Actualizar factura principal
      const { data: factura, error: facturaError } = await supabase
        .from('invoice_purchase')
        .update({
          supplier_id: formData.supplier_id,
          number_ext: formData.number_ext,
          issue_date: formData.issue_date,
          due_date: formData.due_date,
          currency: formData.currency,
          subtotal: subtotal,
          tax_total: tax_total,
          total: total,
          balance: total, // Resetear balance al total (puede cambiar si hay pagos)
          notes: formData.notes,
          payment_terms: formData.payment_terms,
          tax_included: formData.tax_included,
          updated_at: new Date().toISOString()
        })
        .eq('id', facturaId)
        .select()
        .single();

      if (facturaError) {
        console.error('Error actualizando factura:', facturaError);
        throw facturaError;
      }

      // Eliminar items existentes
      const { error: deleteItemsError } = await supabase
        .from('invoice_items')
        .delete()
        .eq('invoice_purchase_id', facturaId);

      if (deleteItemsError) {
        console.error('Error eliminando items existentes:', deleteItemsError);
        throw deleteItemsError;
      }

      // Crear nuevos items si existen
      if (formData.items.length > 0) {
        const lineSubtotal = (item: any) => item.qty * item.unit_price - (item.discount_amount || 0);
        const lineTaxAmount = (item: any) => (lineSubtotal(item) * (item.tax_rate || 0)) / 100;
        
        const items = formData.items.map(item => ({
          invoice_id: factura.id,
          invoice_type: 'purchase' as const,
          invoice_purchase_id: factura.id,
          invoice_sales_id: null,
          product_id: item.product_id || null,
          description: item.description,
          qty: item.qty,
          unit_price: item.unit_price,
          tax_rate: item.tax_rate || 0,
          total_line: lineSubtotal(item),
          discount_amount: item.discount_amount || 0,
          tax_included: formData.tax_included || false
        }));
        
        console.log('Nuevos items a insertar:', items);

        const { error: itemsError } = await supabase
          .from('invoice_items')
          .insert(items);

        if (itemsError) {
          console.error('Error creando nuevos items:', itemsError);
          throw itemsError;
        }
      }

      // Actualizar cuenta por pagar si existe
      const { error: updateAccountError } = await supabase
        .from('accounts_payable')
        .update({
          amount: total,
          due_date: formData.due_date,
          updated_at: new Date().toISOString()
        })
        .eq('invoice_purchase_id', facturaId);

      if (updateAccountError) {
        console.warn('Error actualizando cuenta por pagar:', updateAccountError);
        // No lanzamos error aquí para no bloquear la actualización
      }

      console.log('Factura actualizada exitosamente:', factura);
      return factura;
    } catch (error) {
      console.error('Error en actualizarFactura:', error);
      throw error;
    }
  }

  /**
   * Obtiene la cuenta por pagar asociada a una factura de compra
   */
  static async obtenerCuentaPorPagar(facturaId: string): Promise<any | null> {
    try {
      console.log('=== Obteniendo cuenta por pagar ===');
      console.log('Factura ID:', facturaId);
      
      const { data: cuentaPorPagar, error } = await supabase
        .from('accounts_payable')
        .select(`
          *,
          supplier:suppliers(
            id,
            name,
            nit
          )
        `)
        .eq('organization_id', this.organizationId)
        .eq('invoice_id', facturaId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          console.log('No se encontró cuenta por pagar para esta factura');
          return null;
        }
        console.error('Error obteniendo cuenta por pagar:', error);
        throw error;
      }

      console.log('Cuenta por pagar obtenida:', cuentaPorPagar);
      return cuentaPorPagar;
    } catch (error) {
      console.error('Error en obtenerCuentaPorPagar:', error);
      throw error;
    }
  }

  /**
   * Obtiene todos los pagos asociados a una factura de compra
   */
  static async obtenerPagosFactura(facturaId: string): Promise<any[]> {
    try {
      console.log('=== Obteniendo pagos de factura ===');
      console.log('Factura ID:', facturaId);
      
      const { data: pagos, error } = await supabase
        .from('payments')
        .select(`
          *
        `)
        .eq('organization_id', this.organizationId)
        .eq('source', 'invoice_purchase')
        .eq('source_id', facturaId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error obteniendo pagos:', error);
        throw error;
      }

      console.log('Pagos obtenidos:', pagos?.length || 0);
      return pagos || [];
    } catch (error) {
      console.error('Error en obtenerPagosFactura:', error);
      throw error;
    }
  }

  /**
   * Obtiene los métodos de pago activos de la organización
   */
  static async obtenerMetodosPago(): Promise<any[]> {
    try {
      console.log('=== Obteniendo métodos de pago ===');
      console.log('Organization ID:', this.organizationId);
      
      const { data: metodos, error } = await supabase
        .from('organization_payment_methods')
        .select(`
          *,
          payment_methods:payment_method_code(*)
        `)
        .eq('organization_id', this.organizationId)
        .eq('is_active', true)
        .order('id');

      if (error) {
        console.error('Error obteniendo métodos de pago:', error);
        throw error;
      }

      console.log('Métodos de pago obtenidos:', metodos?.length || 0);
      return metodos || [];
    } catch (error) {
      console.error('Error en obtenerMetodosPago:', error);
      throw error;
    }
  }

  /**
   * Registra un pago para una factura de compra
   */
  static async registrarPago(facturaId: string, pagoData: {
    amount: number;
    payment_method: string;
    reference?: string;
    notes?: string;
  }): Promise<any> {
    try {
      console.log('=== Registrando pago ===');
      console.log('Factura ID:', facturaId);
      console.log('Pago data:', pagoData);
      
      // Primero obtener la factura actual
      const factura = await this.obtenerFacturaPorId(facturaId);
      if (!factura) {
        throw new Error('Factura no encontrada');
      }
      
      // Validar que el monto no exceda el balance
      if (pagoData.amount > factura.balance) {
        throw new Error('El monto del pago no puede exceder el balance pendiente');
      }
      
      // Registrar el pago
      const { data: payment, error: paymentError } = await supabase
        .from('payments')
        .insert({
          organization_id: this.organizationId,
          branch_id: this.branchId,
          source: 'invoice_purchase',
          source_id: facturaId,
          method: pagoData.payment_method,
          amount: pagoData.amount,
          currency: factura.currency || 'COP',
          reference: pagoData.reference || null,
          status: 'completed'
        })
        .select()
        .single();
        
      if (paymentError) {
        console.error('Error registrando pago:', paymentError);
        throw paymentError;
      }
      
      // Calcular nuevo balance y estado
      const nuevoBalance = factura.balance - pagoData.amount;
      const nuevoEstado = nuevoBalance <= 0 ? 'paid' : 
                         nuevoBalance < factura.total ? 'partial' : factura.status;
      
      // Actualizar la factura
      const { error: updateError } = await supabase
        .from('invoice_purchase')
        .update({
          balance: nuevoBalance,
          status: nuevoEstado
        })
        .eq('id', facturaId);
        
      if (updateError) {
        console.error('Error actualizando factura:', updateError);
        throw updateError;
      }
      
      // Actualizar la cuenta por pagar
      const { error: accountError } = await supabase
        .from('accounts_payable')
        .update({
          balance: nuevoBalance,
          status: nuevoBalance <= 0 ? 'paid' : 'partial'
        })
        .eq('invoice_id', facturaId);
        
      if (accountError) {
        console.warn('Error actualizando cuenta por pagar:', accountError);
        // No lanzamos error para no bloquear el flujo principal
      }
      
      console.log('Pago registrado exitosamente:', payment.id);
      return payment;
    } catch (error) {
      console.error('Error en registrarPago:', error);
      throw error;
    }
  }

  /**
   * Actualiza el inventario cuando se recibe una factura de compra
   */
  private static async actualizarInventarioPorCompra(
    facturaId: string, 
    items: NuevaFacturaCompraForm['items'], 
    branchId: number
  ): Promise<void> {
    try {
      console.log('=== Actualizando inventario por compra ===');
      console.log('Factura ID:', facturaId);
      console.log('Branch ID:', branchId);
      console.log('Items a procesar:', items);

      for (const item of items) {
        // Solo procesar items que tienen product_id válido
        if (!item.product_id || item.qty <= 0) {
          console.log(`Saltando item sin product_id o cantidad inválida:`, item);
          continue;
        }

        console.log(`Procesando producto ID ${item.product_id}, cantidad: ${item.qty}`);

        // 1. Verificar si existe stock_level para este producto y sucursal
        const { data: stockExistente, error: stockCheckError } = await supabase
          .from('stock_levels')
          .select('id, qty_on_hand, avg_cost')
          .eq('product_id', item.product_id)
          .eq('branch_id', branchId)
          .single();

        if (stockCheckError && stockCheckError.code !== 'PGRST116') {
          console.error('Error verificando stock existente:', stockCheckError);
          continue;
        }

        const nuevaCantidad = (stockExistente?.qty_on_hand || 0) + item.qty;
        const costoAnterior = stockExistente?.avg_cost || 0;
        const cantidadAnterior = stockExistente?.qty_on_hand || 0;
        
        // Calcular nuevo costo promedio ponderado
        const nuevoCostoPromedio = cantidadAnterior > 0 
          ? ((costoAnterior * cantidadAnterior) + (item.unit_price * item.qty)) / nuevaCantidad
          : item.unit_price;

        if (stockExistente) {
          // 2a. Actualizar stock existente
          console.log(`Actualizando stock existente para producto ${item.product_id}:`);
          console.log(`  Cantidad anterior: ${cantidadAnterior} -> Nueva: ${nuevaCantidad}`);
          console.log(`  Costo anterior: ${costoAnterior} -> Nuevo: ${nuevoCostoPromedio}`);

          const { error: updateError } = await supabase
            .from('stock_levels')
            .update({
              qty_on_hand: nuevaCantidad,
              avg_cost: nuevoCostoPromedio,
              updated_at: new Date().toISOString()
            })
            .eq('id', stockExistente.id);

          if (updateError) {
            console.error(`Error actualizando stock para producto ${item.product_id}:`, updateError);
            continue;
          }
        } else {
          // 2b. Crear nuevo registro de stock
          console.log(`Creando nuevo stock para producto ${item.product_id}:`);
          console.log(`  Cantidad inicial: ${item.qty}`);
          console.log(`  Costo inicial: ${item.unit_price}`);

          const { error: insertError } = await supabase
            .from('stock_levels')
            .insert({
              product_id: item.product_id,
              branch_id: branchId,
              qty_on_hand: item.qty,
              qty_reserved: 0,
              avg_cost: item.unit_price,
              min_level: 0
            });

          if (insertError) {
            console.error(`Error creando stock para producto ${item.product_id}:`, insertError);
            continue;
          }
        }

        // 3. Crear movimiento de inventario
        console.log(`Creando movimiento de inventario para producto ${item.product_id}`);
        const { error: movementError } = await supabase
          .from('stock_movements')
          .insert({
            organization_id: this.organizationId,
            branch_id: branchId,
            product_id: item.product_id,
            direction: 'in',
            qty: item.qty,
            unit_cost: item.unit_price,
            source: 'purchase',
            source_id: facturaId,
            note: `Compra - Factura ${facturaId}`,
            updated_by: await getCurrentUserId()
          });

        if (movementError) {
          console.error(`Error creando movimiento para producto ${item.product_id}:`, movementError);
          continue;
        }

        console.log(`✅ Inventario actualizado correctamente para producto ${item.product_id}`);
      }

      console.log('=== Actualización de inventario completada ===');
    } catch (error) {
      console.error('Error actualizando inventario por compra:', error);
      // No lanzamos el error para no bloquear la creación de la factura
      // El inventario se puede corregir manualmente si es necesario
    }
  }

  /**
   * Obtiene todos los proveedores de la organización
   */
  static async obtenerProveedores(): Promise<SupplierBase[]> {
    try {
      const { data, error } = await supabase
        .from('suppliers')
        .select('*')
        .eq('organization_id', this.organizationId)
        .order('name');

      if (error) {
        console.error('Error obteniendo proveedores:', error);
        throw error;
      }

      return data || [];
    } catch (error) {
      console.error('Error en obtenerProveedores:', error);
      return [];
    }
  }

  /**
   * Crea un nuevo proveedor
   */
  static async crearProveedor(proveedor: Omit<SupplierBase, 'id' | 'organization_id' | 'created_at' | 'updated_at'>): Promise<SupplierBase> {
    try {
      const { data, error } = await supabase
        .from('suppliers')
        .insert({
          organization_id: this.organizationId,
          ...proveedor
        })
        .select()
        .single();

      if (error) {
        console.error('Error creando proveedor:', error);
        throw error;
      }

      return data;
    } catch (error) {
      console.error('Error en crearProveedor:', error);
      throw error;
    }
  }

  /**
   * Obtiene las tasas de cambio vigentes
   */
  static async obtenerTasasCambio(): Promise<CurrencyRate[]> {
    try {
      const { data, error } = await supabase
        .from('currency_rates')
        .select('*')
        .eq('organization_id', this.organizationId)
        .order('effective_date', { ascending: false });

      if (error) {
        console.error('Error obteniendo tasas de cambio:', error);
        throw error;
      }

      return data || [];
    } catch (error) {
      console.error('Error en obtenerTasasCambio:', error);
      return [];
    }
  }

  /**
   * Obtiene las monedas disponibles para la organización
   */
  static async obtenerMonedas(): Promise<OrganizationCurrency[]> {
    try {
      // Obtener organizationId dinámicamente
      const currentOrgId = getOrganizationId();
      console.log('Obteniendo monedas para organización:', currentOrgId);
      
      // Obtener organization_currencies
      const { data: orgCurrencies, error: orgError } = await supabase
        .from('organization_currencies')
        .select('*')
        .eq('organization_id', currentOrgId)
        .order('is_base', { ascending: false });

      if (orgError) {
        console.error('Error obteniendo organization_currencies:', orgError);
        return [];
      }

      console.log('Organization currencies obtenidas:', orgCurrencies);
      
      if (!orgCurrencies || orgCurrencies.length === 0) {
        console.log('No se encontraron monedas para la organización:', currentOrgId);
        return [];
      }

      // Obtener currencies por separado
      const currencyCodes = orgCurrencies.map(oc => oc.currency_code);
      console.log('Buscando currencies con códigos:', currencyCodes);
      
      const { data: currencies, error: currError } = await supabase
        .from('currencies')
        .select('*')
        .in('code', currencyCodes);

      if (currError) {
        console.error('Error obteniendo currencies:', currError);
        // Devolver sin datos de currencies
        return orgCurrencies;
      }
      
      console.log('Currencies obtenidas:', currencies);

      // Combinar datos manualmente
      const result = orgCurrencies.map(orgCurr => ({
        ...orgCurr,
        currencies: currencies?.find(c => c.code === orgCurr.currency_code)
      }));
      
      console.log('Resultado final combinado:', result);
      return result;
    } catch (error) {
      console.error('Error en obtenerMonedas:', error);
      return [];
    }
  }



  /**
   * Obtiene facturas próximas a vencer
   */
  static async obtenerFacturasProximasVencer(diasLimite: number = 15): Promise<InvoicePurchase[]> {
    try {
      const fechaLimite = new Date();
      fechaLimite.setDate(fechaLimite.getDate() + diasLimite);

      const { data, error } = await supabase
        .from('invoice_purchase')
        .select(`
          *,
          supplier:suppliers(name, contact, phone)
        `)
        .eq('organization_id', this.organizationId)
        .in('status', ['received', 'partial'])
        .lte('due_date', fechaLimite.toISOString())
        .gt('balance', 0)
        .order('due_date');

      if (error) {
        console.error('Error obteniendo facturas próximas a vencer:', error);
        throw error;
      }

      return data || [];
    } catch (error) {
      console.error('Error en obtenerFacturasProximasVencer:', error);
      return [];
    }
  }

  /**
   * Actualiza el estado de una factura
   */
  static async actualizarEstadoFactura(id: string, estado: InvoicePurchase['status']): Promise<void> {
    try {
      // Obtener estado actual y datos de la factura
      const { data: facturaActual, error: fetchError } = await supabase
        .from('invoice_purchase')
        .select(`
          *,
          items:invoice_items(
            id,
            product_id,
            description,
            qty,
            unit_price
          )
        `)
        .eq('id', id)
        .eq('organization_id', this.organizationId)
        .single();

      if (fetchError) {
        console.error('Error obteniendo factura actual:', fetchError);
        throw fetchError;
      }

      const estadoAnterior = facturaActual.status;
      
      // Actualizar el estado
      const { error } = await supabase
        .from('invoice_purchase')
        .update({ status: estado, updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('organization_id', this.organizationId);

      if (error) {
        console.error('Error actualizando estado de factura:', error);
        throw error;
      }

      // Si cambia de 'draft' a 'received', actualizar inventario
      if (estadoAnterior === 'draft' && estado === 'received' && facturaActual.items) {
        console.log(`Factura ${id} cambió de 'draft' a 'received' - Actualizando inventario`);
        
        // Convertir items al formato esperado
        const itemsParaInventario = facturaActual.items.map((item: any) => ({
          product_id: item.product_id,
          qty: item.qty,
          unit_price: item.unit_price,
          description: item.description
        }));

        if (facturaActual.branch_id) {
          await this.actualizarInventarioPorCompra(id, itemsParaInventario, facturaActual.branch_id);
        } else {
          console.warn(`No se pudo actualizar inventario para factura ${id}: branch_id no disponible`);
        }
      }

      console.log(`Estado de factura ${id} actualizado: ${estadoAnterior} -> ${estado}`);
    } catch (error) {
      console.error('Error en actualizarEstadoFactura:', error);
      throw error;
    }
  }

  /**
   * Elimina una factura (solo si está en estado draft)
   */
  static async eliminarFactura(id: string): Promise<void> {
    try {
      // Verificar que la factura esté en estado draft
      const { data: factura, error: checkError } = await supabase
        .from('invoice_purchase')
        .select('status')
        .eq('id', id)
        .eq('organization_id', this.organizationId)
        .single();

      if (checkError) {
        throw checkError;
      }

      if (factura.status !== 'draft') {
        throw new Error('Solo se pueden eliminar facturas en estado borrador');
      }

      // Eliminar items de la factura
      await supabase
        .from('invoice_items')
        .delete()
        .eq('invoice_id', id);

      // Eliminar cuenta por pagar
      await supabase
        .from('accounts_payable')
        .delete()
        .eq('invoice_id', id);

      // Eliminar la factura
      const { error } = await supabase
        .from('invoice_purchase')
        .delete()
        .eq('id', id)
        .eq('organization_id', this.organizationId);

      if (error) {
        console.error('Error eliminando factura:', error);
        throw error;
      }
    } catch (error) {
      console.error('Error en eliminarFactura:', error);
      throw error;
    }
  }
}
