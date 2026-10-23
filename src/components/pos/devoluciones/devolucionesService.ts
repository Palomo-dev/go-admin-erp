import { supabase } from '@/lib/supabase/config';
import { obtenerOrganizacionActiva } from '@/lib/hooks/useOrganization';
import { desgloseReembolso } from '@/lib/pos/devoluciones/desgloseReembolso';
import { parametrosProcesarDevolucion, type ResultadoProcesarDevolucion } from '@/lib/pos/devoluciones/procesarDevolucion';
import { idsSerialesLinea, mismoId, serialesVendidosDeLinea, type SerialDeLinea } from '@/lib/pos/devoluciones/serialesLinea';
import { 
  Return,
  SaleForReturn, 
  RefundData,
  ReturnSearchFilters,
  SaleSearchFilters,
  PaginatedReturnResponse,
  PaginatedSaleResponse,
  SoldSerialInfo
} from './types';

/** Filas leídas de Supabase (cliente sin tipos generados): solo los campos que se usan. */
interface ClienteFila {
  id: string;
  full_name: string;
  email?: string;
  phone?: string;
}

interface ProductoFila {
  id: number;
  name: string;
  sku: string;
  track_serial?: boolean | null;
  sale_mode?: string | null;
  unit_code?: string | null;
  qty_decimals?: number | null;
}

interface VentaFila {
  id: string;
  customer_id: string | null;
  total: number | string | null;
  subtotal: number | string | null;
  tax_total: number | string | null;
}

// Función helper para obtener URL pública de imagen
const getStorageImageUrl = (storagePath: string): string => {
  if (!storagePath) return '';
  const bucket = (storagePath.startsWith('products/') || storagePath.startsWith('productos/')) ? 'product-images' : 'organization_images';
  const { data } = supabase.storage
    .from(bucket)
    .getPublicUrl(storagePath);
  return data?.publicUrl || '';
};

/**
 * Seriales vendidos de esas ventas. `sale_id` es el respaldo cuando la línea
 * no guardó `serial_ids`; los ids de la línea se piden aparte por si el
 * vínculo de la venta no alcanzó. Un error de lectura se propaga: tragárselo
 * dejaba el selector vacío y la validación fallaba sin explicación.
 */
async function serialesVendidos(
  organizationId: number,
  saleIds: string[],
  serialIds: number[],
): Promise<SerialDeLinea[]> {
  if (saleIds.length === 0 && serialIds.length === 0) return [];
  const porVenta = saleIds.length === 0
    ? { data: [] as SerialDeLinea[], error: null }
    : await supabase
      .from('serial_numbers')
      .select('id, serial, status, product_id, sale_id')
      .eq('organization_id', organizationId)
      .in('sale_id', saleIds)
      .eq('status', 'sold');
  if (porVenta.error) throw porVenta.error;
  const lista = (porVenta.data ?? []) as SerialDeLinea[];
  const ya = new Set(lista.map((s) => s.id));
  const faltan = serialIds.filter((id) => !ya.has(id));
  if (faltan.length === 0) return lista;
  const extra = await supabase
    .from('serial_numbers')
    .select('id, serial, status, product_id, sale_id')
    .eq('organization_id', organizationId)
    .in('id', faltan)
    .eq('status', 'sold');
  if (extra.error) throw extra.error;
  return [...lista, ...((extra.data ?? []) as SerialDeLinea[])];
}

function asignarSeriales(
  items: { id: string; sale_id: string; product_id: number; product: { track_serial?: boolean }; serials?: SoldSerialInfo[] }[],
  serialIdsPorLinea: ReadonlyMap<string, unknown>,
  vendidos: readonly SerialDeLinea[],
): void {
  for (const item of items) {
    if (!item.product.track_serial) continue;
    item.serials = serialesVendidosDeLinea({
      serialIds: serialIdsPorLinea.get(item.id),
      productId: item.product_id,
      saleId: item.sale_id,
      vendidos,
    }).map((s) => ({ id: s.id, serial: s.serial, status: s.status }));
  }
}

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
        customerId,
        branchId,
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

      // Filtro de sucursal
      if (branchId != null) {
        baseQuery = baseQuery.eq('branch_id', branchId);
      }

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
      let customersData: ClienteFila[] = [];
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
          discount_amount,
          serial_ids
        `)
        .in('sale_id', availableSaleIds);

      if (itemsError) {
        console.warn('Error obteniendo sale_items:', itemsError);
      }

      // Obtener productos para los items
      const productIds = (saleItemsData || []).map(item => item.product_id).filter(Boolean);
      let productsData: ProductoFila[] = [];
      const productImages: Record<string | number, string> = {};
      
      if (productIds.length > 0) {
        // Obtener datos básicos de productos
        const { data: products, error: productsError } = await supabase
          .from('products')
          .select('id, name, sku, track_serial, sale_mode, unit_code, qty_decimals')
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
          images.forEach((img) => {
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
          const product = productsData.find((p) => mismoId(p.id, item.product_id));
          return {
            id: item.id,
            sale_id: item.sale_id,
            product_id: item.product_id,
            // Decimal: una venta por peso de 0,375 kg ya no se lee como 0.
            quantity: Number(item.quantity),
            unit_price: parseFloat(item.unit_price),
            total: parseFloat(item.total),
            tax_amount: parseFloat(item.tax_amount || '0'),
            discount_amount: parseFloat(item.discount_amount || '0'),
            product: product ? {
              id: product.id,
              name: product.name,
              sku: product.sku,
              image: productImages[product.id] ? getStorageImageUrl(productImages[product.id]) : null,
              track_serial: product.track_serial || false,
              sale_mode: product.sale_mode ?? null,
              unit_code: product.unit_code ?? null,
              qty_decimals: product.qty_decimals ?? null,
            } : {
              id: 0,
              name: '', // la pantalla muestra «producto no encontrado» traducido
              sku: '',
              image: null,
              track_serial: false
            },
            returned_quantity: 0, // Se calculará en obtenerDetalleVenta
            serials: [] // Se llenarán después si el producto tiene track_serial
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
          payment_method: invoice?.payment_method || undefined, // sin método: la pantalla lo traduce
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

      const serialIdsLinea = (saleItemsData || []).flatMap((item) => idsSerialesLinea(item.serial_ids));
      const vendidos = await serialesVendidos(organizationId, availableSaleIds, serialIdsLinea);
      const serialIdsPorLinea = new Map((saleItemsData || []).map((item) => [item.id, item.serial_ids]));
      for (const sale of transformedData) asignarSeriales(sale.items, serialIdsPorLinea, vendidos);

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
      let customerData: ClienteFila | null = null;
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
        .select('id, sale_id, product_id, quantity, unit_price, total, tax_amount, discount_amount, serial_ids')
        .eq('sale_id', saleId);

      if (itemsError) {
        console.error('Error obteniendo sale_items:', itemsError);
        throw itemsError;
      }

      // Obtener productos e imágenes
      const productIds = (saleItems || []).map(item => item.product_id).filter(Boolean);
      let productsData: ProductoFila[] = [];
      const productImages: Record<string | number, string> = {};
      
      if (productIds.length > 0) {
        // Obtener productos
        const { data: products } = await supabase
          .from('products')
          .select('id, name, sku, track_serial, sale_mode, unit_code, qty_decimals')
          .in('id', productIds);
        productsData = products || [];

        // Obtener imágenes de productos
        const { data: images } = await supabase
          .from('product_images')
          .select('id, product_id, storage_path, is_primary')
          .in('product_id', productIds)
          .eq('is_primary', true);
          
        if (images) {
          images.forEach((img) => {
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
        payment_method: invoice?.payment_method || undefined, // sin método: la pantalla lo traduce
        invoice_number: invoice?.number || null,
        sale_date: saleData.sale_date,
        items: (saleItems || []).map((item) => {
          const product = productsData.find((p) => mismoId(p.id, item.product_id));
          return {
            id: item.id,
            sale_id: item.sale_id,
            product_id: item.product_id,
            product: product ? {
              id: product.id,
              name: product.name,
              sku: product.sku,
              image: productImages[product.id] ? getStorageImageUrl(productImages[product.id]) : null,
              track_serial: product.track_serial || false,
              sale_mode: product.sale_mode ?? null,
              unit_code: product.unit_code ?? null,
              qty_decimals: product.qty_decimals ?? null,
            } : {
              id: 0,
              name: '', // la pantalla muestra «producto no encontrado» traducido
              sku: '',
              image: null,
              track_serial: false
            },
            quantity: Number(item.quantity),
            unit_price: Number(item.unit_price),
            total: Number(item.total),
            tax_amount: item.tax_amount ? Number(item.tax_amount) : undefined,
            discount_amount: item.discount_amount ? Number(item.discount_amount) : undefined,
            returned_quantity: returnedQuantities[item.id] || 0,
            serials: [] as SoldSerialInfo[]
          };
        }),
        payments: (payments || []).map((payment) => ({
          id: payment.id,
          method: payment.method,
          amount: Number(payment.amount),
          status: payment.status,
          reference: payment.reference
        }))
      };

      const serialIdsLinea = (saleItems || []).flatMap((item) => idsSerialesLinea(item.serial_ids));
      const vendidos = await serialesVendidos(organizationId, [saleId], serialIdsLinea);
      asignarSeriales(
        transformedData.items,
        new Map((saleItems || []).map((item) => [item.id, item.serial_ids])),
        vendidos,
      );

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
   * Procesar devolución.
   *
   * Todo en una transacción en el servidor (`procesar_devolucion`): la
   * devolución y sus líneas con motivo, el stock por kardex (seriales
   * incluidos), la salida de la caja abierta que corresponde —o el bloqueo si
   * no hay caja (decisión del dueño 2026-09-23)—, el saldo a favor y la nota
   * crédito contable. Antes eran N llamadas desde el navegador: el stock solo
   * volvía para serializados, la salida de caja fallaba en silencio (insert
   * sin organization_id) y reason_id quedaba vacío.
   *
   * `idempotencyKey`: una por intento de la pantalla; reintentar con la misma
   * clave devuelve la devolución ya hecha en vez de duplicarla.
   *
   * La nota crédito ELECTRÓNICA no se envía todavía (`nc_electronica:
   * 'no_enviada'`): el enganche es encolar `credit_note_invoice_id` en
   * electronic_invoicing_jobs desde el servidor cuando se decida.
   */
  static async procesarDevolucion(
    saleId: string,
    refundData: RefundData,
    idempotencyKey: string = crypto.randomUUID(),
  ): Promise<ResultadoProcesarDevolucion> {
    const params = parametrosProcesarDevolucion(this.getOrganizationId(), saleId, refundData, idempotencyKey);
    const { data, error } = await supabase.rpc('procesar_devolucion', params);
    if (error) {
      console.error('Error en procesarDevolucion:', error);
      throw error;
    }
    return data as ResultadoProcesarDevolucion;
  }

  /**
   * Obtener historial de devoluciones
   */
  static async obtenerHistorialDevoluciones(filters: ReturnSearchFilters = {}): Promise<PaginatedReturnResponse> {
    try {
      const organizationId = this.getOrganizationId();
      console.log('Obteniendo historial para organización:', organizationId);
      
      const {
        dateFrom,
        dateTo,
        status,
        branchId
      } = filters;

      // Primero obtener devoluciones básicas
      let query = supabase
        .from('returns')
        .select('id, organization_id, branch_id, sale_id, user_id, total_refund, reason, return_date, status, return_items, created_at, updated_at')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false });

      // Filtro de sucursal
      if (branchId != null) {
        query = query.eq('branch_id', branchId);
      }

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

      // El impuesto del reembolso sale de las líneas, no de un prorrateo sobre la venta.
      const impuestoPorDevolucion = new Map<number, number>();
      const { data: lineas, error: lineasError } = await supabase
        .from('return_lines')
        .select('return_id, tax_amount')
        .eq('organization_id', organizationId)
        .in('return_id', returnsData.map(ret => ret.id));

      if (lineasError) {
        console.error('Error obteniendo líneas de devolución:', lineasError);
        throw new Error(`Error consultando líneas de devolución: ${lineasError.message}`);
      }

      for (const linea of lineas ?? []) {
        const id = Number(linea.return_id);
        const impuesto = Number(linea.tax_amount);
        impuestoPorDevolucion.set(id, (impuestoPorDevolucion.get(id) ?? 0) + (Number.isFinite(impuesto) ? impuesto : 0));
      }

      // La venta solo adjunta cliente y sus propios totales.
      const saleIds = returnsData.map(ret => ret.sale_id).filter(Boolean);
      let salesData: VentaFila[] = [];
      let customersData: ClienteFila[] = [];
      
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
        
        const totalVenta = sale ? Number(sale.total) : 0;
        const subtotalVenta = sale ? Number(sale.subtotal) : 0;
        const impuestoVenta = sale ? Number(sale.tax_total) : 0;
        const desglose = desgloseReembolso(
          Number(returnItem.total_refund),
          impuestoPorDevolucion.get(Number(returnItem.id)) ?? 0,
        );
        
        return {
          id: returnItem.id,
          organization_id: returnItem.organization_id,
          branch_id: returnItem.branch_id,
          sale_id: returnItem.sale_id,
          user_id: returnItem.user_id,
          total_refund: desglose.total,
          refund_tax_amount: desglose.impuesto,
          refund_total_with_tax: desglose.total,
          reason: returnItem.reason,
          return_date: returnItem.return_date,
          status: returnItem.status,
          return_items: returnItem.return_items || [],
          created_at: returnItem.created_at,
          updated_at: returnItem.updated_at,
          // Datos de venta y cliente si existen
          sale: sale ? {
            id: sale.id,
            total: totalVenta,
            subtotal: subtotalVenta,
            tax_total: impuestoVenta,
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
}
