import { supabase } from '@/lib/supabase/config';
import { getOrganizationId, getCurrentBranchId, getCurrentUserId } from '@/lib/hooks/useOrganization';
import { generateInvoiceNumber as generateInvoiceNumberUtil } from '@/lib/utils/invoiceUtils';
import { calculateCartTaxesComplete, getTaxIncludedSetting, formatTaxCalculationForLog, type TaxCalculationItem } from '@/lib/utils/taxCalculations';
import { CreditNoteNumberService } from '@/lib/services/creditNoteNumberService';
import {
  Product,
  Customer,
  Cart,
  CartItem,
  Sale,
  SaleItem,
  Payment,
  PaymentMethod,
  Currency,
  ProductFilter,
  CustomerFilter,
  CheckoutData,
  HoldWithDebtData,
  HoldWithDebtResult
} from '../../components/pos/types';

export class POSService {
  private static organizationId = getOrganizationId();
  private static branchId: number | null = null;

  // Obtener branch_id dinámicamente (caché simple)
  private static async getBranchId(): Promise<number> {
    if (this.branchId) return this.branchId;
    
    try {
      const { data, error } = await supabase
        .from('branches')
        .select('id')
        .eq('organization_id', this.organizationId)
        .order('id')
        .limit(1)
        .single();
      
      if (error) throw error;
      this.branchId = data.id;
      return data.id;
    } catch (error) {
      console.warn('Error getting branch_id, using default:', error);
      return 2; // Fallback a branch_id 2
    }
  }

  // ===============================
  // PRODUCTOS
  // ===============================
  static async searchProducts(filter: ProductFilter): Promise<Product[]> {
    try {
      let query = supabase
        .from('products')
        .select(`
          *,
          categories(
            id,
            name,
            slug
          )
        `)
        .eq('organization_id', this.organizationId);

      if (filter.status !== 'all') {
        query = query.eq('status', filter.status);
      }

      if (filter.search) {
        query = query.or(
          `sku.ilike.%${filter.search}%,name.ilike.%${filter.search}%,description.ilike.%${filter.search}%,barcode.eq.${filter.search}`
        );
      }

      if (filter.category_id) {
        query = query.eq('category_id', filter.category_id);
      }

      const { data, error } = await query
        .order('name')
        .limit(filter.limit || 50);

      if (error) throw error;

      // Obtener las imágenes principales de los productos
      const productIds = data?.map(p => p.id) || [];
      let productImages: Record<string | number, string> = {};
      
      if (productIds.length > 0) {
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

      return data?.map((product: any) => ({
        ...product,
        category: product.categories,
        image: productImages[product.id] ? 
          `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/organization_images/${productImages[product.id]}` :
          null
      })) || [];
    } catch (error) {
      console.error('Error searching products:', error);
      throw error;
    }
  }

  static async getProductsPaginated({
    page = 1,
    limit = 12,
    search = '',
    category_id = null,
    status = 'active'
  }: {
    page?: number;
    limit?: number;
    search?: string;
    category_id?: number | null;
    status?: string;
  }) {
    try {
      let query = supabase
      .from('products')
      .select(`
        *,
        categories(
          id,
          name,
          slug
        ),
        product_prices!inner(
          price
        )
      `, { count: 'exact' })
      .eq('organization_id', this.organizationId);

      if (status !== 'all') {
        query = query.eq('status', status);
      }

      if (search) {
        query = query.or(
          `sku.ilike.%${search}%,name.ilike.%${search}%,description.ilike.%${search}%,barcode.eq.${search}`
        );
      }

      if (category_id) {
        query = query.eq('category_id', category_id);
      }

      const offset = (page - 1) * limit;
      const { data, error, count } = await query
        .order('name')
        .range(offset, offset + limit - 1);

      if (error) throw error;

      // Obtener las imágenes principales de los productos
      const productIds = data?.map(p => p.id) || [];
      let productImages: Record<string | number, string> = {};
      
      if (productIds.length > 0) {
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

      const products = data?.map((product: any) => ({
        ...product,
        category: product.categories,
        price: product.product_prices?.[0]?.price || null, // Extraer precio del primer elemento del array
        image: productImages[product.id] ? 
          `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/organization_images/${productImages[product.id]}` :
          null
      })) || [];

      return {
        data: products,
        total: count || 0,
        page,
        limit,
        totalPages: Math.ceil((count || 0) / limit)
      };
    } catch (error) {
      console.error('Error getting products paginated:', error);
      throw error;
    }
  }

  static getProductPlaceholderImage(categoryId?: number): string | null {
    // No usar imagen placeholder, retornar null para mostrar "Sin imagen"
    return null;
  }

  static async getCategories() {
    try {
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .eq('organization_id', this.organizationId)
        .order('rank');

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error getting categories:', error);
      return [];
    }
  }

  static async getProductByBarcode(barcode: string): Promise<Product | null> {
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('organization_id', this.organizationId)
        .eq('barcode', barcode)
        .eq('status', 'active')
        .single();

      if (error && error.code !== 'PGRST116') throw error;
      return data;
    } catch (error) {
      console.error('Error getting product by barcode:', error);
      throw error;
    }
  }

  // getProductById is implemented later with proper price and tax integration

  // ===============================
  // CLIENTES
  // ===============================
  static async searchCustomers(filter: CustomerFilter): Promise<Customer[]> {
    try {
      let query = supabase
        .from('customers')
        .select('*')
        .eq('organization_id', this.organizationId);

      if (filter.search) {
        query = query.or(
          `full_name.ilike.%${filter.search}%,email.ilike.%${filter.search}%,phone.ilike.%${filter.search}%,doc_number.ilike.%${filter.search}%`
        );
      }

      const { data, error } = await query
        .order('full_name')
        .limit(20);

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error searching customers:', error);
      throw error;
    }
  }

  static async createCustomer(customerData: Partial<Customer>): Promise<Customer> {
    try {
      // Mapear los campos del formulario a la estructura de la base de datos
      const insertData = {
        organization_id: this.organizationId,
        branch_id: await this.getBranchId(),
        full_name: customerData.full_name,
        first_name: customerData.full_name?.split(' ')[0] || '',
        last_name: customerData.full_name?.split(' ').slice(1).join(' ') || '',
        email: customerData.email,
        phone: customerData.phone,
        // Solo usar identification_type y identification_number (doc_type y doc_number son columnas generadas)
        identification_type: customerData.doc_type,
        identification_number: customerData.doc_number,
        address: customerData.address,
        city: customerData.city,
        roles: customerData.roles || ['customer'],
        tags: customerData.tags || [],
        preferences: customerData.preferences || {},
        metadata: {
          country: customerData.country
        }
      };

      console.log('Creating customer with data:', insertData);

      const { data, error } = await supabase
        .from('customers')
        .insert(insertData)
        .select()
        .single();

      if (error) {
        console.error('Supabase error details:', error);
        throw error;
      }
      
      console.log('Customer created successfully:', data);
      return data;
    } catch (error) {
      console.error('Error creating customer:', error);
      throw error;
    }
  }

  // ===============================
  // CARRITOS
  // ===============================
  static async createCart(branchId: number): Promise<Cart> {
    try {
      const cartId = crypto.randomUUID();
      
      const newCart: Cart = {
        id: cartId,
        organization_id: this.organizationId,
        branch_id: branchId,
        status: 'active',
        items: [],
        subtotal: 0,
        tax_amount: 0,
        tax_total: 0,
        discount_amount: 0,
        discount_total: 0,
        total: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      // Guardamos el carrito en el localStorage temporalmente
      this.saveCartToStorage(newCart);
      
      return newCart;
    } catch (error) {
      console.error('Error creating cart:', error);
      throw error;
    }
  }

  static async getActiveCarts(): Promise<Cart[]> {
    try {
      // Por ahora obtenemos los carritos del localStorage
      const cartsData = localStorage.getItem(`pos_carts_${this.organizationId}`);
      if (!cartsData) return [];

      const carts: Cart[] = JSON.parse(cartsData);
      return carts.filter(cart => cart.status === 'active' || cart.status === 'hold');
    } catch (error) {
      console.error('Error getting active carts:', error);
      return [];
    }
  }

  static async addItemToCart(cartId: string, product: Product, quantity: number = 1): Promise<Cart> {
    try {
      const carts = await this.getActiveCarts();
      const cartIndex = carts.findIndex(c => c.id === cartId);
      
      if (cartIndex === -1) throw new Error('Carrito no encontrado');

      const cart = carts[cartIndex];
      const existingItemIndex = cart.items.findIndex(item => item.product_id === product.id);

      if (existingItemIndex >= 0) {
        // Actualizar cantidad del item existente
        cart.items[existingItemIndex].quantity += quantity;
        cart.items[existingItemIndex].total = cart.items[existingItemIndex].quantity * cart.items[existingItemIndex].unit_price;
      } else {
        // Agregar nuevo item
        const newItem: CartItem = {
          id: crypto.randomUUID(),
          cart_id: cartId,
          product_id: product.id,
          product,
          quantity,
          unit_price: await this.getProductPrice(product.id), // Implementar función de precios
          total: 0,
          discount_amount: 0,
          tax_amount: 0,
          tax_rate: 0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
        
        newItem.total = newItem.quantity * newItem.unit_price;
        cart.items.push(newItem);
      }

      // Recalcular totales
      await this.calculateCartTotals(cart);
      cart.updated_at = new Date().toISOString();

      // Guardar carrito actualizado
      carts[cartIndex] = cart;
      this.saveCartsToStorage(carts);

      return cart;
    } catch (error) {
      console.error('Error adding item to cart:', error);
      throw error;
    }
  }

  static async removeItemFromCart(cartId: string, itemId: string): Promise<Cart> {
    try {
      const carts = await this.getActiveCarts();
      const cartIndex = carts.findIndex(c => c.id === cartId);
      
      if (cartIndex === -1) throw new Error('Carrito no encontrado');

      const cart = carts[cartIndex];
      cart.items = cart.items.filter(item => item.id !== itemId);

      // Recalcular totales
      await this.calculateCartTotals(cart);
      cart.updated_at = new Date().toISOString();

      // Guardar carrito actualizado
      carts[cartIndex] = cart;
      this.saveCartsToStorage(carts);

      return cart;
    } catch (error) {
      console.error('Error removing item from cart:', error);
      throw error;
    }
  }

  static async updateCartItemQuantity(cartId: string, itemId: string, quantity: number): Promise<Cart> {
    try {
      const carts = await this.getActiveCarts();
      const cartIndex = carts.findIndex(c => c.id === cartId);
      
      if (cartIndex === -1) throw new Error('Carrito no encontrado');

      const cart = carts[cartIndex];
      const itemIndex = cart.items.findIndex(item => item.id === itemId);
      
      if (itemIndex === -1) throw new Error('Item no encontrado');

      if (quantity <= 0) {
        return await this.removeItemFromCart(cartId, itemId);
      }

      cart.items[itemIndex].quantity = quantity;
      cart.items[itemIndex].total = quantity * cart.items[itemIndex].unit_price;

      // Recalcular totales
      await this.calculateCartTotals(cart);
      cart.updated_at = new Date().toISOString();

      // Guardar carrito actualizado
      carts[cartIndex] = cart;
      this.saveCartsToStorage(carts);

      return cart;
    } catch (error) {
      console.error('Error updating cart item quantity:', error);
      throw error;
    }
  }

  static async setCartCustomer(cartId: string, customerId?: string): Promise<Cart> {
    try {
      const carts = await this.getActiveCarts();
      const cartIndex = carts.findIndex(c => c.id === cartId);
      
      if (cartIndex === -1) throw new Error('Carrito no encontrado');

      const cart = carts[cartIndex];
      cart.customer_id = customerId;

      if (customerId) {
        // Obtener datos del cliente
        const { data: customer, error } = await supabase
          .from('customers')
          .select('*')
          .eq('id', customerId)
          .single();

        if (error) throw error;
        cart.customer = customer;
      } else {
        cart.customer = undefined;
      }

      cart.updated_at = new Date().toISOString();

      // Guardar carrito actualizado
      carts[cartIndex] = cart;
      this.saveCartsToStorage(carts);

      return cart;
    } catch (error) {
      console.error('Error setting cart customer:', error);
      throw error;
    }
  }

  static async holdCart(cartId: string, reason?: string): Promise<Cart> {
    try {
      const carts = await this.getActiveCarts();
      const cartIndex = carts.findIndex(c => c.id === cartId);
      
      if (cartIndex === -1) throw new Error('Carrito no encontrado');

      const cart = carts[cartIndex];
      cart.status = 'hold';
      cart.hold_reason = reason;
      cart.updated_at = new Date().toISOString();

      // Guardar carrito actualizado
      carts[cartIndex] = cart;
      this.saveCartsToStorage(carts);

      return cart;
    } catch (error) {
      console.error('Error holding cart:', error);
      throw error;
    }
  }

  static async activateCart(cartId: string): Promise<Cart> {
    try {
      // Buscar en TODOS los carritos (incluyendo hold_with_debt)
      const cartsData = localStorage.getItem(`pos_carts_${this.organizationId}`);
      if (!cartsData) {
        throw new Error('No se encontraron carritos almacenados');
      }
      const allCarts: Cart[] = JSON.parse(cartsData);
      const cartIndex = allCarts.findIndex(c => c.id === cartId);
      
      if (cartIndex === -1) throw new Error('Carrito no encontrado');

      const cart = allCarts[cartIndex];
      cart.status = 'active';
      cart.hold_reason = undefined;
      cart.updated_at = new Date().toISOString();

      // Guardar carrito actualizado
      allCarts[cartIndex] = cart;
      this.saveCartsToStorage(allCarts);

      return cart;
    } catch (error) {
      console.error('Error activating cart:', error);
      throw error;
    }
  }

  static async holdCartWithDebt(data: {
    cartId: string;
    reason: string;
    paymentTerms?: number;
    notes?: string;
  }): Promise<{
    cart: Cart;
    invoice: any;
    accountReceivable: any;
  }> {
    try {
      const { cartId, reason, paymentTerms = 30, notes } = data;
      
      // PASO 1: Validar carrito
      const carts = await this.getActiveCarts();
      const cartIndex = carts.findIndex(c => c.id === cartId);
      
      if (cartIndex === -1) {
        throw new Error('Carrito no encontrado');
      }
      
      const cart = carts[cartIndex];
      
      // Validaciones de negocio
      if (!cart.customer_id) {
        throw new Error('El carrito debe tener un cliente asignado para generar deuda');
      }
      
      if (cart.items.length === 0) {
        throw new Error('El carrito debe tener items para generar deuda');
      }
      
      if (cart.total <= 0) {
        throw new Error('El total del carrito debe ser mayor a cero');
      }
      
      if (cart.status !== 'active') {
        throw new Error('Solo se pueden poner en espera carritos activos');
      }
      
      console.log(`💰 Iniciando creación de deuda para carrito ${cartId}:`, {
        cliente: cart.customer?.full_name,
        total: cart.total,
        items: cart.items.length
      });
      
      // PASO 2: Calcular impuestos usando utilidad mejorada
      const taxCalculationItems: TaxCalculationItem[] = cart.items.map(item => ({
        quantity: item.quantity,
        unit_price: item.unit_price,
        product_id: item.product_id
      }));
      
      const taxIncluded = getTaxIncludedSetting(false);
      
      const taxCalculation = await calculateCartTaxesComplete(
        taxCalculationItems,
        this, // Pasar instancia de POSService
        taxIncluded
      );
      
      console.log('🚀 Resultado final:', formatTaxCalculationForLog(taxCalculation));
      
      // PASO 2.5: Crear venta (sale) PRIMERO para tener sale_id
      console.log('🔄 Creando venta (sale) antes de factura...');
      
      const saleData: any = {
        organization_id: this.organizationId,
        branch_id: getCurrentBranchId(),
        customer_id: cart.customer_id,
        user_id: await getCurrentUserId(), // Campo requerido en tabla sales
        sale_date: new Date().toISOString(),
        subtotal: taxCalculation.subtotal,
        tax_total: taxCalculation.totalTaxAmount,
        discount_total: 0,
        total: taxCalculation.finalTotal, // Agregar campo total requerido
        balance: taxCalculation.finalTotal,
        status: 'pending', // Estado pending hasta completar pago
        payment_status: 'pending',
        notes: `Venta con deuda - ${reason}`
      };
      
      const { data: sale, error: saleError } = await supabase
        .from('sales')
        .insert(saleData)
        .select()
        .single();
      
      if (saleError) {
        console.error('Error creando sale:', saleError);
        throw new Error(`Error creando sale: ${saleError.message}`);
      }
      
      console.log(`🔄 Venta creada exitosamente:`, {
        id: sale.id,
        customer_id: sale.customer_id,
        total: sale.balance
      });
      
      // PASO 3: Crear invoice_sales con totales calculados
      const invoiceNumber = await this.generateInvoiceNumber();
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + paymentTerms);
      
      const invoiceData: any = {
        organization_id: this.organizationId,
        branch_id: getCurrentBranchId(), // Usar branch_id actual del usuario
        customer_id: cart.customer_id,
        sale_id: sale.id, // Relacionar factura con venta creada
        number: invoiceNumber,
        issue_date: new Date().toISOString(),
        due_date: dueDate.toISOString(),
        currency: 'COP', // Debe existir en tabla currencies
        subtotal: taxCalculation.subtotal,
        tax_total: taxCalculation.totalTaxAmount,
        total: taxCalculation.finalTotal,
        balance: taxCalculation.finalTotal,
        status: 'issued', // Estado para facturas recién emitidas
        payment_method: 'credit', // Debe existir en tabla payment_methods
        tax_included: taxIncluded,
        payment_terms: paymentTerms,
        notes: notes || `Carrito puesto en espera: ${reason}`,
        document_type: 'invoice',
        created_by: await getCurrentUserId() // Usuario actual que crea la factura
      };
      
      console.log('📄 Creando invoice_sales con datos:', invoiceData);
      
      const { data: invoice, error: invoiceError } = await supabase
        .from('invoice_sales')
        .insert(invoiceData)
        .select()
        .single();
      
      if (invoiceError) {
        console.error('Error creando invoice_sales:', {
          error: invoiceError,
          message: invoiceError.message,
          details: invoiceError.details,
          hint: invoiceError.hint,
          code: invoiceError.code,
          invoiceData: invoiceData
        });
        throw new Error(`Error creando invoice_sales: ${invoiceError.message || 'Error desconocido'}`);
      }
      
      console.log(`📄 Factura creada exitosamente:`, {
        id: invoice.id,
        number: invoice.number,
        total: invoice.total
      });
      
      // PASO 4: Crear invoice_items
      const invoiceItems = cart.items.map(item => ({
        invoice_id: invoice.id,
        invoice_type: 'sale', // Debe ser 'sale' no 'sales'
        invoice_sales_id: invoice.id,
        product_id: item.product_id,
        description: item.product?.name || 'Producto',
        qty: item.quantity || 0,
        unit_price: item.unit_price || 0,
        tax_rate: item.tax_rate || 0,
        total_line: item.total || 0,
        discount_amount: item.discount_amount || 0,
        tax_included: taxIncluded
      }));
      
      console.log('📋 Creando invoice_items con datos:', invoiceItems);
      
      const { error: itemsError } = await supabase
        .from('invoice_items')
        .insert(invoiceItems);
      
      if (itemsError) {
        console.error('Error creando invoice_items:', {
          error: itemsError,
          message: itemsError.message,
          details: itemsError.details,
          hint: itemsError.hint,
          code: itemsError.code,
          invoiceItems: invoiceItems
        });
        throw new Error(`Error creando invoice_items: ${itemsError.message || 'Error desconocido'}`);
      }
      
      console.log(`📋 ${invoiceItems.length} items de factura creados exitosamente`);
      

      // Calcular tax_amount total por item basado en el resultado de taxCalculation
      const totalTaxPerItem = taxCalculation.totalTaxAmount / cart.items.length;
      
      const saleItems = cart.items.map(item => ({
        sale_id: sale.id,
        product_id: item.product_id,
        quantity: item.quantity || 1, // Default es 1, no 0
        unit_price: item.unit_price,
        total: item.total,
        discount_amount: item.discount_amount || 0,
        tax_amount: item.tax_rate ? (item.unit_price * (item.tax_rate / 100) * item.quantity) : totalTaxPerItem
        // No incluir created_by - no existe en tabla sale_items
      }));
      
      console.log('🛍️ Creando sale_items con datos:', saleItems);
      
      const { error: saleItemsError } = await supabase
        .from('sale_items')
        .insert(saleItems);
      
      if (saleItemsError) {
        console.error('Error creando sale_items:', saleItemsError);
        throw new Error(`Error creando sale_items: ${saleItemsError.message}`);
      }
      
      console.log(`🛍️ ${saleItems.length} items de venta creados exitosamente`);
      
      // PASO 5: La cuenta por cobrar se crea automáticamente por el trigger tr_create_account_receivable
      // al insertar la factura con status != 'draft'. Obtenemos la cuenta creada usando RPC:
      console.log('📃 Obteniendo cuenta por cobrar creada automáticamente por trigger...');
      
      // Usar función RPC que maneja correctamente las políticas RLS
      let accountReceivable = null;
      let lastError = null;
      
      for (let attempt = 1; attempt <= 3; attempt++) {
        console.log(`Intento ${attempt}/3 obteniendo accounts_receivable con RPC...`);
        
        try {
          const { data, error } = await supabase
            .rpc('get_accounts_receivable_with_customers', {
              org_id: this.organizationId
            });
          
          if (data && !error) {
            // Buscar la cuenta por cobrar para esta factura específica
            const foundAR = data.find((ar: any) => ar.invoice_id === invoice.id);
            
            if (foundAR) {
              accountReceivable = foundAR;
              console.log(`👍 Cuenta por cobrar encontrada con RPC:`, {
                id: foundAR.id,
                balance: foundAR.balance,
                customer_name: foundAR.customer_name
              });
              break;
            }
          }
          
          lastError = error || { message: 'Cuenta por cobrar no encontrada en resultados RPC' };
        } catch (rpcError: any) {
          lastError = rpcError;
          console.log(`Error en RPC intento ${attempt}:`, rpcError);
        }
        
        if (attempt < 3) {
          // Esperar 500ms antes del siguiente intento
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
      
      if (!accountReceivable) {
        console.error('Error obteniendo accounts_receivable después de 3 intentos con RPC:', {
          error: lastError,
          message: lastError?.message || 'Timeout esperando trigger',
          invoice_id: invoice.id,
          organization_id: this.organizationId
        });
        throw new Error(`Error obteniendo accounts_receivable: ${lastError?.message || 'Timeout esperando que el trigger cree la cuenta por cobrar'}`);
      }
      
      console.log(`💳 Cuenta por cobrar obtenida exitosamente:`, {
        id: accountReceivable.id,
        balance: accountReceivable.balance,
        due_date: accountReceivable.due_date
      });
      
      // PASO 6: Actualizar carrito
      cart.status = 'hold_with_debt';
      cart.hold_reason = reason;
      cart.notes = `Factura: ${invoice.number} | Vence: ${dueDate.toLocaleDateString()}`;
      cart.updated_at = new Date().toISOString();
      
      carts[cartIndex] = cart;
      this.saveCartsToStorage(carts);
      
      console.log(`🛒 Carrito actualizado a estado: hold_with_debt`);
      
      return {
        cart,
        invoice: {
          id: invoice.id,
          number: invoice.number,
          total: invoice.total,
          due_date: invoice.due_date,
          status: invoice.status
        },
        accountReceivable: {
          id: accountReceivable.id,
          amount: accountReceivable.amount,
          balance: accountReceivable.balance,
          due_date: accountReceivable.due_date,
          status: accountReceivable.status
        }
      };
      
    } catch (error) {
      console.error('Error en holdCartWithDebt:', error);
      throw error;
    }
  }

  // FACTURACIÓN
  // ===============================

  private static async generateInvoiceNumber(): Promise<string> {
    return await generateInvoiceNumberUtil(this.organizationId, 'FACT');
  }

  // ===============================
  // CHECKOUT Y VENTAS
  // ===============================
  static async checkout(checkoutData: CheckoutData): Promise<Sale> {
    try {
      const { cart, payments } = checkoutData;

      // Crear la venta en la base de datos
      const { data: saleData, error: saleError } = await supabase
        .from('sales')
        .insert({
          organization_id: cart.organization_id,
          branch_id: getCurrentBranchId(), // Usar branch_id actual del usuario
          customer_id: cart.customer_id,
          user_id: (await supabase.auth.getUser()).data.user?.id,
          subtotal: cart.subtotal,
          tax_total: cart.tax_total,
          discount_total: cart.discount_total,
          total: cart.total,
          balance: Math.max(0, cart.total - checkoutData.total_paid),
          status: checkoutData.total_paid >= cart.total ? 'paid' : 'pending',
          payment_status: checkoutData.total_paid >= cart.total ? 'paid' : 'partial',
          sale_date: new Date().toISOString()
        })
        .select()
        .single();

      if (saleError) throw saleError;

      // Crear los items de venta
      const saleItems = cart.items.map(item => ({
        sale_id: saleData.id,
        product_id: item.product_id,
        quantity: item.quantity,
        unit_price: item.unit_price,
        total: item.total,
        tax_amount: item.tax_amount || 0,
        tax_rate: item.tax_rate || 0,
        discount_amount: item.discount_amount || 0,
        notes: item.notes ? JSON.stringify(item.notes) : null
      }));

      const { error: itemsError } = await supabase
        .from('sale_items')
        .insert(saleItems);

      if (itemsError) throw itemsError;

      // Crear la factura (invoice_sales)
      const invoiceNumber = await this.generateInvoiceNumber();
      const baseCurrency = await this.getBaseCurrency();
      
      const { data: invoiceData, error: invoiceError } = await supabase
        .from('invoice_sales')
        .insert({
          organization_id: cart.organization_id,
          branch_id: getCurrentBranchId(), // Usar branch_id actual del usuario
          customer_id: cart.customer_id,
          sale_id: saleData.id,
          number: invoiceNumber,
          issue_date: new Date().toISOString(),
          due_date: new Date().toISOString(), // Pago inmediato para POS
          currency: baseCurrency.code,
          subtotal: cart.subtotal,
          tax_total: cart.tax_total,
          total: cart.total,
          balance: saleData.balance,
          status: saleData.balance > 0 ? 'partial' : 'paid',
          tax_included: checkoutData.tax_included || false,
          payment_method: payments.length > 0 ? payments[0].method : 'cash',
          payment_terms: 0, // POS es pago inmediato
          created_by: (await supabase.auth.getUser()).data.user?.id,
          notes: `Factura generada automáticamente desde POS - Venta #${saleData.id}`
        })
        .select()
        .single();

      if (invoiceError) {
        console.error('Error creating invoice:', invoiceError);
        // No lanzamos error para que no falle todo el checkout
      } else {
        console.log('Invoice created successfully:', invoiceData.number);
        
        // Crear los invoice_items basados en cart.items
        try {
          // Obtener información de productos para las descripciones
          const productIds = cart.items.map(item => item.product_id).filter(id => id);
          const { data: productsData } = await supabase
            .from('products')
            .select('id, name, description')
            .in('id', productIds);
            
          const productMap = new Map((productsData || []).map(p => [p.id, p]));
          
          const invoiceItems = cart.items.map((cartItem: any) => {
            const product = productMap.get(cartItem.product_id);
            const description = product 
              ? `${product.name}${product.description ? ' - ' + product.description : ''}`
              : `Producto ID: ${cartItem.product_id}`;
              
            return {
              invoice_id: invoiceData.id, // Campo correcto según schema
              invoice_sales_id: invoiceData.id, // Mantener para relación
              invoice_type: 'sale',
              product_id: cartItem.product_id,
              description: description.substring(0, 255), // Limitar longitud
              qty: cartItem.quantity,
              unit_price: cartItem.unit_price,
              total_line: cartItem.total,
              tax_rate: cartItem.tax_rate || 0,
              tax_included: checkoutData.tax_included || false,
              discount_amount: cartItem.discount_amount || 0
            };
          });
          
          console.log('Creating invoice items:', invoiceItems);
          
          const { error: itemsError } = await supabase
            .from('invoice_items')
            .insert(invoiceItems);
            
          if (itemsError) {
            console.error('Error creating invoice items:', {
              error: itemsError,
              message: itemsError.message,
              details: itemsError.details,
              hint: itemsError.hint,
              code: itemsError.code,
              invoiceItems: invoiceItems
            });
          } else {
            console.log(`Invoice items created successfully: ${invoiceItems.length} items`);
          }
        } catch (itemsError) {
          console.error('Exception creating invoice items:', itemsError);
        }
      }

      // Crear los pagos - asociar con la factura (invoice_sales)
      const currentUser = await supabase.auth.getUser();
      const userId = currentUser.data.user?.id;
      
      for (const payment of payments) {
        if (payment.amount > 0) {
          const paymentData: any = {
            organization_id: cart.organization_id,
            branch_id: getCurrentBranchId(), // Usar branch_id actual del usuario
            amount: payment.amount,
            method: payment.method,
            currency: baseCurrency.code,
            status: 'completed'
          };
          
          // Asociar con la factura si existe, sino con la venta
          if (invoiceData && !invoiceError) {
            paymentData.source = 'invoice_sales';
            paymentData.source_id = invoiceData.id;
          } else {
            paymentData.source = 'sale';
            paymentData.source_id = saleData.id;
          }
          
          // Asignar created_by si hay usuario autenticado
          if (userId) {
            paymentData.created_by = userId;
          }
          
          console.log('Creating payment:', paymentData);
          
          const { data: paymentResult, error: paymentError } = await supabase
            .from('payments')
            .insert(paymentData)
            .select()
            .single();

          if (paymentError) {
            console.error('Error creating payment:', {
              error: paymentError,
              paymentData: paymentData
            });
            throw paymentError;
          } else {
            console.log('Payment created successfully:', paymentResult);
          }
        }
      }

      // Si hay balance pendiente, crear cuenta por cobrar
      if (saleData.balance > 0 && cart.customer_id) {
        const { error: arError } = await supabase
          .from('accounts_receivable')
          .insert({
            organization_id: cart.organization_id,
            customer_id: cart.customer_id,
            sale_id: saleData.id,
            amount: saleData.total,
            balance: saleData.balance,
            due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 días
            status: 'partial'
          });

        if (arError) throw arError;
      }

      // Eliminar el carrito del localStorage
      await this.removeCart(cart.id);

      return saleData;
    } catch (error) {
      console.error('Error during checkout:', error);
      throw error;
    }
  }

  // ===============================
  // MÉTODOS DE PAGO Y MONEDAS
  // ===============================
  static async getPaymentMethods(): Promise<PaymentMethod[]> {
    try {
      const { data, error } = await supabase
        .from('organization_payment_methods')
        .select(`
          payment_method_code,
          is_active,
          settings,
          payment_methods!inner (
            name
          )
        `)
        .eq('organization_id', this.organizationId)
        .eq('is_active', true);

      if (error) throw error;
      
      return data?.map((method: any) => ({
        id: method.payment_method_code,
        name: method.payment_methods?.name || method.payment_method_code,
        code: method.payment_method_code,
        type: method.payment_method_code === 'cash' ? 'cash' : 
              method.payment_method_code === 'card' ? 'card' : 'digital',
        is_active: method.is_active,
        settings: method.settings,
        icon: this.getPaymentMethodIcon(method.payment_method_code),
        color: method.settings?.color || this.getPaymentMethodColor(method.payment_method_code)
      })) || [];
    } catch (error) {
      console.error('Error getting payment methods:', error);
      // Fallback a métodos básicos
      return [
        { id: 'cash', name: 'Efectivo', code: 'cash', type: 'cash', is_active: true, icon: '💵', color: '#10B981' },
        { id: 'card', name: 'Tarjeta', code: 'card', type: 'card', is_active: true, icon: '💳', color: '#3B82F6' }
      ];
    }
  }

  static async getCurrencies(): Promise<Currency[]> {
    try {
      const orgId = this.organizationId;
      console.log('Getting currencies for organization:', orgId);
      
      if (!orgId) {
        throw new Error('Organization ID not found');
      }
      
      // Usar SQL query manual en lugar de la sintaxis de Supabase join
      const { data, error } = await supabase.rpc('get_organization_currencies', {
        p_organization_id: orgId
      });

      if (error) {
        console.error('RPC error:', error);
        throw error;
      }
      
      console.log('Currency data received:', data);
      
      if (!data || data.length === 0) {
        console.warn('No currencies found, using fallback');
        return [
          { code: 'COP', name: 'Peso Colombiano', symbol: '$', decimals: 0, is_base: true, is_active: true }
        ];
      }
      
      return data.map((curr: any) => ({
        code: curr.code,
        name: curr.name || curr.code,
        symbol: curr.symbol || '$',
        decimals: curr.decimals || 0,
        is_base: curr.is_base || false,
        is_active: true
      }));
    } catch (error) {
      console.error('Error getting organization currencies:', error);
      // Fallback a peso colombiano
      return [
        { code: 'COP', name: 'Peso Colombiano', symbol: '$', decimals: 0, is_base: true, is_active: true }
      ];
    }
  }

  static async getBaseCurrency(): Promise<Currency> {
    try {
      const currencies = await this.getCurrencies();
      return currencies.find(c => c.is_base) || currencies[0] || 
        { code: 'COP', name: 'Peso Colombiano', symbol: '$', decimals: 0, is_base: true, is_active: true };
    } catch (error) {
      console.error('Error getting base currency:', error);
      return { code: 'COP', name: 'Peso Colombiano', symbol: '$', decimals: 0, is_base: true, is_active: true };
    }
  }

  // ===============================
  // IMPUESTOS Y PRECIOS
  // ===============================

  // ===============================
  // MÉTODOS AUXILIARES
  // ===============================
  static async getProductById(productId: number): Promise<Product | null> {
    try {
      const { data, error } = await supabase
        .from('products')
        .select(`
          *,
          categories(
            id,
            name
          ),
          product_prices!inner(
            price
          )
        `)
        .eq('id', productId)
        .eq('organization_id', this.organizationId)
        .eq('product_prices.effective_to', null) // Precio actual
        .single();

      if (error) throw error;
      if (!data) return null;

      return {
        id: data.id,
        organization_id: data.organization_id,
        sku: data.sku,
        name: data.name,
        description: data.description,
        barcode: data.barcode,
        price: parseFloat(data.product_prices?.[0]?.price || '0'),
        cost: 0, // TODO: Implementar desde product_costs
        stock_quantity: 0, // TODO: Implementar desde stock_levels
        min_stock_level: 0,
        category_id: data.category_id,
        category: data.categories,
        unit_code: data.unit_code,
        status: data.status,
        image: undefined, // TODO: Implementar desde product_images
        tax_id: data.tax_id,
        created_at: data.created_at,
        updated_at: data.updated_at,
        tag_id: data.tag_id,
        parent_product_id: data.parent_product_id
      };
    } catch (error) {
      console.error('Error getting product by id:', error);
      return null;
    }
  }

  private static async getProductPrice(productId: number): Promise<number> {
    try {
      const { data, error } = await supabase
        .from('product_prices')
        .select('price')
        .eq('product_id', productId)
        .is('effective_to', null) // Precio actual
        .single();

      if (error) throw error;
      return parseFloat(data?.price || '0');
    } catch (error) {
      console.error('Error getting product price:', error);
      return 0;
    }
  }

  private static getPaymentMethodIcon(code: string): string {
    const iconMap: { [key: string]: string } = {
      'cash': '💵',
      'card': '💳',
      'transfer': '🏦',
      'nequi': '🟣',
      'daviplata': '🟠',
      'pse': '🔗',
      'payu': '💎',
      'mp': '💙',
      'credit': '📋',
      'check': '📝'
    };
    return iconMap[code] || '💰';
  }

  private static getPaymentMethodColor(code: string): string {
    const colorMap: { [key: string]: string } = {
      'cash': '#10B981',
      'card': '#3B82F6',
      'transfer': '#8B5CF6',
      'nequi': '#5d2e8a',
      'daviplata': '#ff6b35',
      'pse': '#059669',
      'payu': '#F59E0B',
      'mp': '#1DA1F2',
      'credit': '#EF4444',
      'check': '#6B7280'
    };
    return colorMap[code] || '#6B7280';
  }

  private static async calculateCartTotals(cart: Cart): Promise<void> {
    // Recalcular impuestos para cada ítem
    for (const item of cart.items) {
      await this.calculateItemTaxes(item);
    }
    
    // Calcular totales del carrito
    cart.subtotal = cart.items.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0);
    cart.tax_total = cart.items.reduce((sum, item) => sum + (item.tax_amount || 0), 0);
    cart.discount_total = cart.items.reduce((sum, item) => sum + (item.discount_amount || 0), 0);
    cart.total = cart.subtotal + cart.tax_total - cart.discount_total;
  }

  private static async calculateItemTaxes(item: CartItem): Promise<void> {
    try {
      // Obtener los impuestos configurados para el producto
      const productTaxes = await this.getProductTaxes(item.product_id);
      
      if (productTaxes.length === 0) {
        // No hay impuestos configurados para el producto
        item.tax_amount = 0;
        item.tax_rate = 0;
        return;
      }

      const baseAmount = item.quantity * item.unit_price;
      let totalTaxAmount = 0;
      let totalTaxRate = 0;

      // Calcular impuestos acumulativos
      for (const taxRelation of productTaxes) {
        const tax = taxRelation.organization_taxes;
        if (tax && tax.is_active) {
          const taxAmount = (baseAmount * tax.rate) / 100;
          totalTaxAmount += taxAmount;
          totalTaxRate += tax.rate;
        }
      }

      item.tax_amount = Math.round(totalTaxAmount * 100) / 100; // Redondear a 2 decimales
      item.tax_rate = totalTaxRate;
      item.total = baseAmount + item.tax_amount - (item.discount_amount || 0);
      
      console.log(`Tax calculation for ${item.product?.name}:`, {
        baseAmount,
        taxRate: totalTaxRate + '%',
        taxAmount: item.tax_amount,
        total: item.total
      });
      
    } catch (error) {
      console.error('Error calculating item taxes:', error);
      // En caso de error, no aplicar impuestos
      item.tax_amount = 0;
      item.tax_rate = 0;
      item.total = item.quantity * item.unit_price - (item.discount_amount || 0);
    }
  }

  // ===============================
  // MÉTODOS DE IMPUESTOS
  // ===============================
  static async getOrganizationTaxes(): Promise<any[]> {
    try {
      const { data, error } = await supabase
        .from('organization_taxes')
        .select('*')
        .eq('organization_id', this.organizationId)
        .eq('is_active', true)
        .order('name');

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error getting organization taxes:', error);
      return [];
    }
  }

  static async getProductTaxes(productId: number): Promise<any[]> {
    try {
      // Primero obtener las relaciones de impuestos del producto
      const { data: relations, error: relationsError } = await supabase
        .from('product_tax_relations')
        .select('tax_id')
        .eq('product_id', productId);

      if (relationsError) {
        console.error('Error getting product tax relations:', relationsError);
        return [];
      }
      
      console.log('Product tax relations:', relations);
      
      if (!relations || relations.length === 0) {
        return [];
      }

      // Luego obtener los detalles de los impuestos
      const taxIds = relations.map(rel => rel.tax_id);
      const { data: taxes, error: taxesError } = await supabase
        .from('organization_taxes')
        .select('*')
        .in('id', taxIds)
        .eq('organization_id', this.organizationId)
        .eq('is_active', true);

      if (taxesError) {
        console.error('Error getting tax details:', taxesError);
        return [];
      }
      
      console.log('Tax details:', taxes);
      
      // Mapear a la estructura esperada
      const result = taxes?.map(tax => ({
        product_id: productId,
        tax_id: tax.id,
        organization_taxes: tax
      })) || [];
      
      console.log('Final product taxes result:', result);
      return result;
    } catch (error) {
      console.error('Error getting product taxes:', error);
      return [];
    }
  }

  private static saveCartToStorage(cart: Cart): void {
    const carts = JSON.parse(localStorage.getItem(`pos_carts_${this.organizationId}`) || '[]');
    const existingIndex = carts.findIndex((c: Cart) => c.id === cart.id);
    
    if (existingIndex >= 0) {
      carts[existingIndex] = cart;
    } else {
      carts.push(cart);
    }
    
    localStorage.setItem(`pos_carts_${this.organizationId}`, JSON.stringify(carts));
  }

  private static saveCartsToStorage(carts: Cart[]): void {
    localStorage.setItem(`pos_carts_${this.organizationId}`, JSON.stringify(carts));
  }

  private static async removeCart(cartId: string): Promise<void> {
    const carts = await this.getActiveCarts();
    const filteredCarts = carts.filter(cart => cart.id !== cartId);
    this.saveCartsToStorage(filteredCarts);
  }

  /**
   * Obtener los datos completos de una factura para visualización o impresión
   * Usa la misma lógica que la página de facturas que ya funciona
   * @param cartId - ID del carrito que está en hold_with_debt
   * @returns Datos completos de la factura con items y customer
   */
  static async getInvoiceForCart(cartId: string): Promise<{
    invoice: any;
    items: any[];
    customer: any;
  }> {
    try {
      // 1. Obtener el carrito para extraer el número de factura
      const cartsData = localStorage.getItem(`pos_carts_${this.organizationId}`);
      if (!cartsData) {
        throw new Error('No se encontraron carritos almacenados');
      }
      
      const allCarts: Cart[] = JSON.parse(cartsData);
      const cart = allCarts.find(c => c.id === cartId);
        
      if (!cart || cart.status !== 'hold_with_debt') {
        throw new Error('Carrito no encontrado o no está en estado de deuda');
      }
      
      // 2. Extraer número de factura de las notas
      const invoiceNumber = cart.notes?.match(/Factura: ([^|]+)/)?.[1]?.trim();
      if (!invoiceNumber) {
        throw new Error('No se encontró el número de factura');
      }
      
      // 3. Obtener factura con customer info (MISMA LÓGICA que la página que funciona)
      const { data: facturaData, error: facturaError } = await supabase
        .from('invoice_sales')
        .select('*, customers(id, full_name, email, phone)')
        .eq('number', invoiceNumber)
        .eq('organization_id', this.organizationId)
        .single();

      if (facturaError) throw facturaError;
      if (!facturaData) throw new Error('No se encontró la factura');

      // 4. Obtener items (MISMA LÓGICA que la página que funciona)
      const { data: itemsData, error: itemsError } = await supabase
        .from('invoice_items')
        .select('*, products(id, name, sku, description)')
        .eq('invoice_sales_id', facturaData.id)
        .order('id', { ascending: true });

      if (itemsError) throw itemsError;
      
      // 5. Obtener pagos (MISMA LÓGICA que la página que funciona)
      const { data: pagosData, error: pagosError } = await supabase
        .from('payments')
        .select('*')
        .eq('source', 'invoice_sales')
        .eq('source_id', facturaData.id)
        .order('created_at', { ascending: false });

      if (pagosError) throw pagosError;
      
      // 6. Combinar todos los datos (MISMO FORMATO que la página que funciona)
      const facturaCompleta = {
        ...facturaData,
        items: itemsData || [],
        pagos: pagosData || []
      };
      
      return {
        invoice: facturaCompleta,
        items: itemsData || [],
        customer: facturaData.customers
      };
      
    } catch (error) {
      console.error('Error en getInvoiceForCart:', error);
      throw error;
    }
  }

  /**
   * Anular deuda con nota de crédito
   * Crea una nota de crédito que anula la factura original y salda todos los balances
   * @param cartId ID del carrito con deuda
   * @returns Carrito actualizado y datos de la nota de crédito
   */
  static async cancelDebtWithCreditNote(cartId: string): Promise<{
    cart: Cart;
    creditNote: any;
  }> {
    try {
      // 1. Obtener el carrito y verificar que tenga deuda
      const cartsData = localStorage.getItem(`pos_carts_${this.organizationId}`);
      if (!cartsData) {
        throw new Error('No se encontraron carritos almacenados');
      }
      
      const allCarts: Cart[] = JSON.parse(cartsData);
      const cartIndex = allCarts.findIndex(c => c.id === cartId);
      
      if (cartIndex === -1) {
        throw new Error('Carrito no encontrado');
      }
      
      const cart = allCarts[cartIndex];
      
      if (cart.status !== 'hold_with_debt') {
        throw new Error('El carrito no tiene deuda pendiente');
      }

      // 2. Obtener la venta asociada al carrito
      // Primero necesitamos encontrar la venta por el customer y items del carrito
      const { data: saleData, error: saleError } = await supabase
        .from('sales')
        .select('id')
        .eq('customer_id', cart.customer_id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (saleError || !saleData) {
        throw new Error('No se encontró la venta asociada al carrito');
      }

      // 3. Obtener la factura original asociada a la venta
      let { data: originalInvoice, error: invoiceError } = await supabase
        .from('invoice_sales')
        .select('*')
        .eq('sale_id', saleData.id)
        .eq('document_type', 'invoice')
        .single();

      // Si no se encuentra con document_type 'invoice', buscar con document_type null
      if (invoiceError || !originalInvoice) {
        const { data: invoiceWithNullType, error: nullTypeError } = await supabase
          .from('invoice_sales')
          .select('*')
          .eq('sale_id', saleData.id)
          .is('document_type', null)
          .single();
          
        if (nullTypeError || !invoiceWithNullType) {
          throw new Error('No se encontró la factura original');
        }
        
        originalInvoice = invoiceWithNullType;
      }

      // 4. Obtener los items de la factura original
      const { data: originalItems, error: itemsError } = await supabase
        .from('invoice_items')
        .select('*')
        .eq('invoice_sales_id', originalInvoice.id);

      if (itemsError) {
        throw new Error('Error al obtener los items de la factura original');
      }

      // 5. Generar número de nota de crédito usando servicio centralizado
      const creditNoteNumber = await CreditNoteNumberService.generateNextCreditNoteNumber(
        String(this.organizationId)
      );

      // 6. Crear la nota de crédito
      const currentDate = new Date().toISOString();
      const { data: creditNoteData, error: creditNoteError } = await supabase
        .from('invoice_sales')
        .insert({
          organization_id: this.organizationId,
          branch_id: originalInvoice.branch_id,
          customer_id: originalInvoice.customer_id,
          sale_id: originalInvoice.sale_id,
          number: creditNoteNumber,
          issue_date: currentDate,
          due_date: currentDate, // Misma fecha que issue_date para notas de crédito
          currency: originalInvoice.currency,
          subtotal: -originalInvoice.subtotal, // Valores negativos para anular
          tax_total: -originalInvoice.tax_total,
          total: -originalInvoice.total,
          balance: 0, // La nota de crédito no tiene balance pendiente
          status: 'issued',
          document_type: 'credit_note',
          related_invoice_id: originalInvoice.id,
          tax_included: originalInvoice.tax_included,
          payment_method: originalInvoice.payment_method || 'credit', // Usar método de pago original
          description: `Nota de crédito por anulación de factura ${originalInvoice.number}`,
          created_by: (await supabase.auth.getUser()).data.user?.id
        })
        .select()
        .single();

      if (creditNoteError) {
        throw new Error('Error al crear la nota de crédito: ' + creditNoteError.message);
      }

      // 7. Crear los items de la nota de crédito (valores negativos)
      const creditNoteItems = originalItems?.map(item => ({
        invoice_id: creditNoteData.id, // invoice_id requerido
        invoice_sales_id: creditNoteData.id,
        invoice_type: 'sale', // invoice_type requerido
        product_id: item.product_id,
        description: item.description || 'Item de nota de crédito', // description requerido
        qty: -item.qty, // qty (no quantity) - cantidad negativa
        unit_price: item.unit_price,
        total_line: -item.total_line, // total_line (no total) - total negativo
        tax_rate: item.tax_rate || 0,
        discount_amount: item.discount_amount ? -item.discount_amount : 0,
        tax_included: item.tax_included || false
      })) || [];

      if (creditNoteItems.length > 0) {
        const { error: itemsInsertError } = await supabase
          .from('invoice_items')
          .insert(creditNoteItems);

        if (itemsInsertError) {
          console.error('Error insertando items de nota de crédito:', itemsInsertError);
          console.error('Datos enviados:', creditNoteItems);
          throw new Error(`Error al crear los items de la nota de crédito: ${itemsInsertError.message}`);
        }
      }

      // 8. Actualizar la factura original (balance a cero)
      const { error: updateInvoiceError } = await supabase
        .from('invoice_sales')
        .update({
          balance: 0,
          status: 'paid', // Cambiamos a pagado porque se anuló con nota de crédito
          updated_at: new Date().toISOString()
        })
        .eq('id', originalInvoice.id);

      if (updateInvoiceError) {
        throw new Error('Error al actualizar la factura original');
      }

      // 9. Actualizar la venta original (balance a cero)
      const { error: updateSaleError } = await supabase
        .from('sales')
        .update({
          balance: 0,
          status: 'paid',
          updated_at: new Date().toISOString()
        })
        .eq('id', saleData.id);

      if (updateSaleError) {
        throw new Error('Error al actualizar la venta original');
      }

      // 10. Actualizar las cuentas por cobrar (balance a cero)
      const { error: updateARError } = await supabase
        .from('accounts_receivable')
        .update({
          balance: 0,
          status: 'paid',
          updated_at: new Date().toISOString()
        })
        .eq('invoice_id', originalInvoice.id);

      if (updateARError) {
        throw new Error('Error al actualizar las cuentas por cobrar');
      }

      // 11. Actualizar el carrito (cambiar estado a cancelled)
      cart.status = 'cancelled';
      cart.hold_reason = 'Deuda anulada con nota de crédito';
      cart.updated_at = new Date().toISOString();
      
      allCarts[cartIndex] = cart;
      this.saveCartsToStorage(allCarts);

      return {
        cart,
        creditNote: creditNoteData
      };
      
    } catch (error) {
      console.error('Error al anular deuda con nota de crédito:', error);
      throw error;
    }
  }
}
