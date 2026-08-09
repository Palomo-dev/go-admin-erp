import { supabase } from '@/lib/supabase/config';
import { getOrganizationId, getCurrentBranchId, getCurrentBranchIdWithFallback, getCurrentUserId } from '@/lib/hooks/useOrganization';
import { generateInvoiceNumber as generateInvoiceNumberUtil } from '@/lib/utils/invoiceUtils';
import { calculateCartTaxesComplete, getTaxIncludedSetting, formatTaxCalculationForLog, type TaxCalculationItem } from '@/lib/utils/taxCalculations';
import { CreditNoteNumberService } from '@/lib/services/creditNoteNumberService';
import { stockMovementService } from '@/lib/services/stockMovementService';
import { getPaymentMethodLabels } from '@/lib/services/paymentMethodHelper';
import {
  Product,
  Customer,
  Cart,
  CartItem,
  CartItemModifier,
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

// Función para obtener URL de imagen desde storage path usando el cliente de supabase
const getStorageImageUrl = (storagePath: string): string => {
  if (!storagePath) return '';
  const bucket = (storagePath.startsWith('products/') || storagePath.startsWith('productos/')) ? 'product-images' : 'organization_images';
  const { data } = supabase.storage
    .from(bucket)
    .getPublicUrl(storagePath);
  return data?.publicUrl || '';
};

export class POSService {
  private static organizationId = getOrganizationId();
  private static branchId: number | null = null;

  // Obtener branch_id dinámicamente (caché simple)
  private static async getBranchId(): Promise<number> {
    if (this.branchId) return this.branchId;

    // 1. Intentar obtener de localStorage (sucursal seleccionada por el usuario)
    const localBranchId = getCurrentBranchId();
    if (localBranchId) {
      this.branchId = localBranchId;
      return localBranchId;
    }

    // 2. Consultar la primera branch de la organización
    try {
      const { data, error } = await supabase
        .from('branches')
        .select('id')
        .eq('organization_id', this.organizationId)
        .eq('is_active', true)
        .order('id')
        .limit(1)
        .single();

      if (error) throw error;
      this.branchId = data.id;
      return data.id;
    } catch (error) {
      console.warn('Error getting branch_id, querying all branches:', error);
      // 3. Último recurso: buscar sin filtro de is_active
      try {
        const { data: fallbackData } = await supabase
          .from('branches')
          .select('id')
          .eq('organization_id', this.organizationId)
          .order('id')
          .limit(1)
          .single();
        if (fallbackData) {
          this.branchId = fallbackData.id;
          return fallbackData.id;
        }
      } catch (e) {
        console.error('No branches found for organization:', this.organizationId, e);
      }
      throw new Error(`No se encontró ninguna sucursal para la organización ${this.organizationId}`);
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
            slug,
            station,
            requires_preparation
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
        image: productImages[product.id] ? getStorageImageUrl(productImages[product.id]) : null
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
    status = 'active',
    includeVariants = false // Nueva opción para incluir variantes
  }: {
    page?: number;
    limit?: number;
    search?: string;
    category_id?: number | null;
    status?: string;
    includeVariants?: boolean;
  }) {
    try {
      const currentBranchId = getCurrentBranchId();

      let query = supabase
      .from('products')
      .select(`
        *,
        categories(
          id,
          name,
          slug,
          station,
          requires_preparation
        ),
        product_prices(
          price,
          compare_price,
          effective_from
        )
      `, { count: 'exact' })
      .eq('organization_id', this.organizationId);

      // Filtrar variantes: mostrar solo productos principales y productos simples
      // NO mostrar productos que son variantes (tienen parent_product_id)
      if (!includeVariants) {
        query = query.is('parent_product_id', null);
      }

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

      // Obtener las imágenes de los productos
      const productIds = data?.map(p => p.id) || [];
      let productImagesMap: Record<string | number, any[]> = {};
      
      if (productIds.length > 0) {
        const { data: images, error: imagesError } = await supabase
          .from('product_images')
          .select('id, product_id, storage_path, is_primary, display_order')
          .in('product_id', productIds)
          .order('display_order');
          
        if (!imagesError && images) {
          images.forEach((img: any) => {
            if (!productImagesMap[img.product_id]) {
              productImagesMap[img.product_id] = [];
            }
            productImagesMap[img.product_id].push(img);
          });
        }
      }

      // Para productos padre, contar sus variantes
      const parentIds = data?.filter(p => p.is_parent).map(p => p.id) || [];
      let variantCountMap: Record<number, number> = {};
      
      if (parentIds.length > 0) {
        const { data: variantCounts, error: variantError } = await supabase
          .from('products')
          .select('parent_product_id')
          .in('parent_product_id', parentIds)
          .eq('status', 'active');
          
        if (!variantError && variantCounts) {
          variantCounts.forEach((v: any) => {
            variantCountMap[v.parent_product_id] = (variantCountMap[v.parent_product_id] || 0) + 1;
          });
        }
      }

      // Detectar qué productos tienen grupos de modificadores configurados (ej. salsas, extras),
      // incluso si no tienen variantes, para poder ofrecer el selector en esos casos.
      let productsWithModifiers = new Set<number>();
      if (productIds.length > 0) {
        const { data: modifierGroups } = await supabase
          .from('product_modifier_groups')
          .select('product_id')
          .in('product_id', productIds);
        (modifierGroups || []).forEach((g: any) => productsWithModifiers.add(g.product_id));
      }

      // Obtener stock_levels por branch_id actual
      // Para productos padre, el stock está en las variantes hijas, no en el padre.
      let stockMap: Record<number, { qty_on_hand: number; qty_reserved: number }> = {};
      let variantStockMap: Record<number, { qty_on_hand: number; qty_reserved: number }> = {};
      if (productIds.length > 0 && currentBranchId) {
        // Identificar productos padre para buscar stock de sus hijos
        const parentIds = data?.filter((p: any) => p.is_parent).map((p: any) => p.id) || [];
        let variantIds: number[] = [];
        if (parentIds.length > 0) {
          const { data: variants } = await supabase
            .from('products')
            .select('id, parent_product_id')
            .in('parent_product_id', parentIds);
          variantIds = (variants || []).map((v: any) => v.id);
          // Mapear variant_id -> parent_product_id para acumular después
          const variantToParent: Record<number, number> = {};
          (variants || []).forEach((v: any) => {
            variantToParent[v.id] = v.parent_product_id;
          });
          // Consultar stock de las variantes
          if (variantIds.length > 0) {
            const { data: variantStockData } = await supabase
              .from('stock_levels')
              .select('product_id, qty_on_hand, qty_reserved')
              .in('product_id', variantIds)
              .eq('branch_id', currentBranchId)
              .is('lot_id', null);
            (variantStockData || []).forEach((s: any) => {
              const parentId = variantToParent[s.product_id];
              if (!variantStockMap[parentId]) {
                variantStockMap[parentId] = { qty_on_hand: 0, qty_reserved: 0 };
              }
              variantStockMap[parentId].qty_on_hand += Number(s.qty_on_hand) || 0;
              variantStockMap[parentId].qty_reserved += Number(s.qty_reserved) || 0;
            });
          }
        }
        // Consultar stock de los productos de la página actual (incluye padres e hijos directos)
        const { data: stockData } = await supabase
          .from('stock_levels')
          .select('product_id, qty_on_hand, qty_reserved')
          .in('product_id', productIds)
          .eq('branch_id', currentBranchId)
          .is('lot_id', null);
        (stockData || []).forEach((s: any) => {
          stockMap[s.product_id] = {
            qty_on_hand: Number(s.qty_on_hand) || 0,
            qty_reserved: Number(s.qty_reserved) || 0,
          };
        });
      }

      const products = data?.map((product: any) => {
        const stock = stockMap[product.id];
        const variantStock = variantStockMap[product.id];
        // Sumar stock propio + stock de variantes hijas
        const stockQty = (stock?.qty_on_hand ?? 0) + (variantStock?.qty_on_hand ?? 0);
        const reservedQty = (stock?.qty_reserved ?? 0) + (variantStock?.qty_reserved ?? 0);
        const isOutOfStock = product.track_stock === true && stockQty <= 0;
        // Ordenar precios por effective_from descendente para tomar el mas reciente
        const sortedPrices = (product.product_prices || []).sort(
          (a: any, b: any) => new Date(b.effective_from).getTime() - new Date(a.effective_from).getTime()
        );
        return {
          ...product,
          category: product.categories,
          price: sortedPrices[0]?.price || null,
          compare_price: sortedPrices[0]?.compare_price || null,
          product_images: productImagesMap[product.id] || [],
          // Información de variantes
          has_variants: product.is_parent === true,
          variant_count: variantCountMap[product.id] || 0,
          has_modifiers: productsWithModifiers.has(product.id),
          // Información de stock
          track_stock: product.track_stock,
          stock_quantity: stockQty,
          qty_reserved: reservedQty,
          is_out_of_stock: isOutOfStock,
          // Mantener compatibilidad con código que use 'image'
          image: productImagesMap[product.id]?.[0]?.storage_path ? 
            getStorageImageUrl(productImagesMap[product.id][0].storage_path) : null
        };
      }) || [];

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

  // Obtener variantes de un producto padre
  static async getProductVariants(parentProductId: number) {
    try {
      const { data, error } = await supabase
        .from('products')
        .select(`
          *,
          categories(
            id,
            name,
            slug,
            station,
            requires_preparation
          ),
          product_prices(price)
        `)
        .eq('parent_product_id', parentProductId)
        .eq('status', 'active')
        .order('name');

      if (error) throw error;

      // Obtener imágenes de las variantes
      const variantIds = data?.map(p => p.id) || [];
      let variantImagesMap: Record<number, any[]> = {};
      
      if (variantIds.length > 0) {
        const { data: images } = await supabase
          .from('product_images')
          .select('id, product_id, storage_path, is_primary')
          .in('product_id', variantIds);
          
        if (images) {
          images.forEach((img: any) => {
            if (!variantImagesMap[img.product_id]) {
              variantImagesMap[img.product_id] = [];
            }
            variantImagesMap[img.product_id].push(img);
          });
        }
      }

      // Fallback: si una variante no tiene imagen propia, usar la del producto padre
      const { data: parentImages } = await supabase
        .from('product_images')
        .select('id, product_id, storage_path, is_primary')
        .eq('product_id', parentProductId);

      const parentImage = parentImages?.find((img: any) => img.is_primary) || parentImages?.[0];

      return data?.map((variant: any) => {
        const ownImages = variantImagesMap[variant.id] || [];
        const primaryOwnImage = ownImages.find((img: any) => img.is_primary) || ownImages[0];
        const resolvedImage = primaryOwnImage?.storage_path
          ? getStorageImageUrl(primaryOwnImage.storage_path)
          : parentImage?.storage_path
            ? getStorageImageUrl(parentImage.storage_path)
            : null;

        return {
          ...variant,
          price: (variant.product_prices || []).sort(
            (a: any, b: any) => new Date(b.effective_from).getTime() - new Date(a.effective_from).getTime()
          )[0]?.price || null,
          product_images: ownImages.length > 0 ? ownImages : (parentImages || []),
          image: resolvedImage
        };
      }) || [];
    } catch (error) {
      console.error('Error getting product variants:', error);
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
          `full_name.ilike.%${filter.search}%,email.ilike.%${filter.search}%,phone.ilike.%${filter.search}%,doc_number.ilike.%${filter.search}%,company_name.ilike.%${filter.search}%,trade_name.ilike.%${filter.search}%,identification_number.ilike.%${filter.search}%`
        );
      }

      const { data, error } = await query
        .order('full_name')
        .limit(filter.search ? 20 : 50);

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
        first_name: customerData.full_name?.split(' ')[0] || '',
        last_name: customerData.full_name?.split(' ').slice(1).join(' ') || '',
        email: customerData.email,
        phone: customerData.phone,
        // Solo usar identification_type y identification_number (doc_type y doc_number son columnas generadas)
        identification_type: customerData.doc_type,
        identification_number: customerData.doc_number,
        address: customerData.address,
        roles: customerData.roles || ['cliente', 'huesped'],
        fiscal_responsibilities: ['R-99-PN'],
        fiscal_municipality_id: customerData.fiscal_municipality_id || 'aa4b6637-0060-41bb-9459-bc95f9789e08',
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

  static async addItemToCart(
    cartId: string,
    product: Product,
    quantity: number = 1,
    modifiers?: CartItemModifier[]
  ): Promise<Cart> {
    try {
      const carts = await this.getActiveCarts();
      const cartIndex = carts.findIndex(c => c.id === cartId);
      
      if (cartIndex === -1) throw new Error('Carrito no encontrado');

      const cart = carts[cartIndex];
      const modifiersKey = (mods?: CartItemModifier[]) =>
        (mods || []).map((m) => m.modifierId).sort().join(',');
      const existingItemIndex = cart.items.findIndex(
        item => item.product_id === product.id && modifiersKey(item.modifiers) === modifiersKey(modifiers)
      );

      if (existingItemIndex >= 0) {
        // Actualizar cantidad del item existente
        cart.items[existingItemIndex].quantity += quantity;
        cart.items[existingItemIndex].total = cart.items[existingItemIndex].quantity * cart.items[existingItemIndex].unit_price;
      } else {
        // Agregar nuevo item
        const basePrice = await this.getProductPrice(product.id); // Implementar función de precios
        const extraTotal = (modifiers || []).reduce((sum, m) => sum + (m.extraPrice || 0), 0);
        const newItem: CartItem = {
          id: crypto.randomUUID(),
          cart_id: cartId,
          product_id: product.id,
          product,
          quantity,
          unit_price: basePrice + extraTotal,
          total: 0,
          discount_amount: 0,
          tax_amount: 0,
          tax_rate: 0,
          modifiers: modifiers && modifiers.length > 0 ? modifiers : undefined,
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

  static async updateCartItemDiscount(cartId: string, itemId: string, discountAmount: number): Promise<Cart> {
    try {
      const carts = await this.getActiveCarts();
      const cartIndex = carts.findIndex(c => c.id === cartId);

      if (cartIndex === -1) throw new Error('Carrito no encontrado');

      const cart = carts[cartIndex];
      const itemIndex = cart.items.findIndex(item => item.id === itemId);

      if (itemIndex === -1) throw new Error('Item no encontrado');

      const maxDiscount = cart.items[itemIndex].quantity * cart.items[itemIndex].unit_price;
      cart.items[itemIndex].discount_amount = Math.max(0, Math.min(discountAmount, maxDiscount));

      // Recalcular totales
      await this.calculateCartTotals(cart);
      cart.updated_at = new Date().toISOString();

      carts[cartIndex] = cart;
      this.saveCartsToStorage(carts);

      return cart;
    } catch (error) {
      console.error('Error updating cart item discount:', error);
      throw error;
    }
  }

  static async updateItemTaxIncluded(cartId: string, itemId: string, taxIncluded: boolean): Promise<Cart> {
    try {
      const carts = await this.getActiveCarts();
      const cartIndex = carts.findIndex(c => c.id === cartId);

      if (cartIndex === -1) throw new Error('Carrito no encontrado');

      const cart = carts[cartIndex];
      const itemIndex = cart.items.findIndex(item => item.id === itemId);

      if (itemIndex === -1) throw new Error('Item no encontrado');

      cart.items[itemIndex].tax_included = taxIncluded;

      // Recalcular totales
      await this.calculateCartTotals(cart);
      cart.updated_at = new Date().toISOString();

      carts[cartIndex] = cart;
      this.saveCartsToStorage(carts);

      return cart;
    } catch (error) {
      console.error('Error updating item tax_included:', error);
      throw error;
    }
  }

  static async getFrequentDiscounts(productId: number, organizationId: number): Promise<number[]> {
    try {
      const [saleItemsRes, invoiceItemsRes] = await Promise.all([
        supabase
          .from('sale_items')
          .select('discount_amount')
          .eq('product_id', productId)
          .gt('discount_amount', 0),
        supabase
          .from('invoice_items')
          .select('discount_amount')
          .eq('product_id', productId)
          .gt('discount_amount', 0),
      ]);

      const freqMap = new Map<number, number>();

      saleItemsRes.data?.forEach((row: any) => {
        const val = parseFloat(row.discount_amount);
        if (val > 0) freqMap.set(val, (freqMap.get(val) ?? 0) + 1);
      });

      invoiceItemsRes.data?.forEach((row: any) => {
        const val = parseFloat(row.discount_amount);
        if (val > 0) freqMap.set(val, (freqMap.get(val) ?? 0) + 1);
      });

      return Array.from(freqMap.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([val]) => val);
    } catch (error) {
      console.error('Error getting frequent discounts:', error);
      return [];
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

  static async updateCartTaxSettings(
    cartId: string,
    settings: { tax_included?: boolean; applied_tax_ids?: string[] }
  ): Promise<Cart> {
    try {
      const carts = await this.getActiveCarts();
      const cartIndex = carts.findIndex(c => c.id === cartId);

      if (cartIndex === -1) throw new Error('Carrito no encontrado');

      const cart = carts[cartIndex];
      if (settings.tax_included !== undefined) {
        cart.tax_included = settings.tax_included;
        // Propagar tax_included a cada item
        cart.items.forEach(item => { item.tax_included = settings.tax_included; });
      }
      if (settings.applied_tax_ids !== undefined) cart.applied_tax_ids = settings.applied_tax_ids;
      cart.updated_at = new Date().toISOString();

      // Recalcular totales con la nueva configuracion
      await this.calculateCartTotals(cart);

      carts[cartIndex] = cart;
      this.saveCartsToStorage(carts);

      return cart;
    } catch (error) {
      console.error('Error updating cart tax settings:', error);
      throw error;
    }
  }

  static async recalculateCart(cartId: string): Promise<Cart> {
    try {
      const carts = await this.getActiveCarts();
      const cartIndex = carts.findIndex(c => c.id === cartId);

      if (cartIndex === -1) throw new Error('Carrito no encontrado');

      const cart = carts[cartIndex];
      await this.calculateCartTotals(cart);
      cart.updated_at = new Date().toISOString();

      carts[cartIndex] = cart;
      this.saveCartsToStorage(carts);

      return cart;
    } catch (error) {
      console.error('Error recalculating cart:', error);
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
        product_id: item.product_id,
        tax_rate: item.tax_rate,
        tax_included: item.tax_included ?? cart.tax_included,
        discount_amount: item.discount_amount || 0
      }));
      
      const taxIncluded = cart.tax_included ?? getTaxIncludedSetting(false);
      
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
      const invoiceItems = cart.items.map(item => {
        let description = item.product?.name || 'Producto';

        // Agregar modificadores del item (sin mencionar la palabra "modificador")
        if (item.modifiers && item.modifiers.length > 0) {
          const modNames = item.modifiers.map((m: any) => m.name).filter(Boolean);
          if (modNames.length > 0) {
            description += ` (${modNames.join(', ')})`;
          }
        }

        const lineTotal = (item.unit_price || 0) * (item.quantity || 0);
        const itemTaxIncluded = item.tax_included ?? taxIncluded;
        const itemTaxRate = item.tax_rate || 0;
        const itemTax = itemTaxIncluded
          ? lineTotal - (lineTotal / (1 + itemTaxRate / 100))
          : lineTotal * itemTaxRate / 100;

        return {
          invoice_id: invoice.id,
          invoice_type: 'sale',
          invoice_sales_id: invoice.id,
          product_id: item.product_id,
          description: description.substring(0, 255),
          qty: item.quantity || 0,
          unit_price: item.unit_price || 0,
          tax_rate: itemTaxRate,
          total_line: itemTaxIncluded ? lineTotal : lineTotal + itemTax,
          discount_amount: item.discount_amount || 0,
          tax_included: itemTaxIncluded
        };
      });
      
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
      
      const saleItems = cart.items.map(item => {
        const lineTotal = (item.unit_price || 0) * (item.quantity || 1);
        const itemTaxIncluded = item.tax_included ?? taxIncluded;
        const itemTaxRate = item.tax_rate || 0;
        const itemTax = itemTaxIncluded
          ? lineTotal - (lineTotal / (1 + itemTaxRate / 100))
          : lineTotal * itemTaxRate / 100;
        return {
          sale_id: sale.id,
          product_id: item.product_id,
          quantity: item.quantity || 1,
          unit_price: item.unit_price,
          total: itemTaxIncluded ? lineTotal : lineTotal + itemTax,
          discount_amount: item.discount_amount || 0,
          tax_amount: itemTax || totalTaxPerItem
        };
      });
      
      console.log('🛍️ Creando sale_items con datos:', saleItems);
      
      const { error: saleItemsError } = await supabase
        .from('sale_items')
        .insert(saleItems);
      
      if (saleItemsError) {
        console.error('Error creando sale_items:', saleItemsError);
        throw new Error(`Error creando sale_items: ${saleItemsError.message}`);
      }
      
      console.log(`🛍️ ${saleItems.length} items de venta creados exitosamente`);

      // Descontar stock por cada item vendido
      try {
        const stockResult = await stockMovementService.decrementOnSale(
          this.organizationId,
          getCurrentBranchIdWithFallback(),
          sale.id,
          cart.items.map(item => ({ product_id: item.product_id, quantity: item.quantity, unit_price: item.unit_price })),
          'sale'
        );
        if (stockResult.errors.length > 0) {
          console.warn('⚠️ Algunos items no descontaron stock:', stockResult.errors);
        }
        console.log(`📦 Stock descontado: ${cart.items.length - stockResult.skipped} items procesados`);
      } catch (stockError) {
        console.warn('⚠️ Error descontando stock (no bloquea la venta):', stockError);
      }
      
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
      cart.sale_id = sale.id;
      cart.invoice_id = invoice.id;
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

      // Calcular total final incluyendo flete y propina
      const shippingFee = checkoutData.shipping_fee || 0;
      const tipAmount = checkoutData.tip_amount || 0;
      const finalTotal = cart.total + shippingFee + tipAmount;

      // Si el carrito ya tiene sale_id (viene de hold_with_debt), actualizar la venta existente
      const isDebtCheckout = !!(cart.sale_id && cart.invoice_id);
      let saleData: any;

      if (isDebtCheckout) {
        console.log(`💰 Checkout de deuda existente - sale_id: ${cart.sale_id}, invoice_id: ${cart.invoice_id}`);
        const { data: updatedSale, error: saleError } = await supabase
          .from('sales')
          .update({
            balance: Math.max(0, finalTotal - checkoutData.total_paid),
            status: checkoutData.total_paid >= finalTotal ? 'paid' : 'pending',
            payment_status: checkoutData.total_paid >= finalTotal ? 'paid' : 'partial',
            tax_included: checkoutData.tax_included || false,
            tax_breakdown: checkoutData.tax_breakdown || null,
            salesperson_id: checkoutData.salesperson_id || null,
            commission_rate: checkoutData.commission_rate || 0,
            commission_type: checkoutData.commission_type || 'none',
            delivery_fee: shippingFee > 0 ? shippingFee : 0,
            tip_amount: tipAmount > 0 ? tipAmount : null
          })
          .eq('id', cart.sale_id)
          .select()
          .single();

        if (saleError) throw saleError;
        saleData = updatedSale;
      } else {
        // Crear la venta en la base de datos (flujo normal)
        const { data: newSale, error: saleError } = await supabase
          .from('sales')
          .insert({
            organization_id: cart.organization_id,
            branch_id: getCurrentBranchId(),
            customer_id: cart.customer_id,
            user_id: (await supabase.auth.getUser()).data.user?.id,
            subtotal: cart.subtotal,
            tax_total: cart.tax_total,
            discount_total: cart.discount_total,
            total: finalTotal,
            balance: Math.max(0, finalTotal - checkoutData.total_paid),
            status: checkoutData.total_paid >= finalTotal ? 'paid' : 'pending',
            payment_status: checkoutData.total_paid >= finalTotal ? 'paid' : 'partial',
            tax_included: checkoutData.tax_included || false,
            tax_breakdown: checkoutData.tax_breakdown || null,
            sale_date: new Date().toISOString(),
            salesperson_id: checkoutData.salesperson_id || null,
            commission_rate: checkoutData.commission_rate || 0,
            commission_type: checkoutData.commission_type || 'none',
            delivery_fee: shippingFee > 0 ? shippingFee : 0,
            tip_amount: tipAmount > 0 ? tipAmount : null
          })
          .select()
          .single();

        if (saleError) throw saleError;
        saleData = newSale;
      }

      // Crear registro de comisión si aplica
      if (checkoutData.salesperson_id && checkoutData.commission_rate && checkoutData.commission_rate > 0 && checkoutData.commission_type !== 'none') {
        try {
          const { data: profileData } = await supabase
            .from('profiles')
            .select('first_name, last_name')
            .eq('id', checkoutData.salesperson_id)
            .single();

          let salespersonName = 'N/A';
          if (profileData) {
            salespersonName = `${profileData.first_name || ''} ${profileData.last_name || ''}`.trim() || 'N/A';
          }

          const { error: commissionInsertError } = await supabase
            .from('commissions')
            .insert({
              organization_id: cart.organization_id,
              branch_id: getCurrentBranchId(),
              commission_type: checkoutData.commission_type,
              source_type: 'sale',
              source_id: saleData.id,
              payee_type: 'employee',
              payee_id: checkoutData.salesperson_id,
              payee_name: salespersonName,
              base_amount: cart.subtotal,
              commission_rate: checkoutData.commission_rate,
              commission_amount: checkoutData.commission_amount || 0,
              currency: (await this.getBaseCurrency()).code,
              status: 'accrued',
              accrued_at: new Date().toISOString(),
              created_by: (await supabase.auth.getUser()).data.user?.id,
              metadata: { sale_id: saleData.id, commission_method: checkoutData.commission_method || 'percentage' },
            });
          if (commissionInsertError) {
            console.error('Error al crear registro de comisión (POS):', commissionInsertError);
          }
        } catch (commissionErr) {
          console.error('Error al crear registro de comisión (POS catch):', commissionErr);
        }
      }

      // Crear los items de venta (solo si no es checkout de deuda - ya fueron creados)
      if (!isDebtCheckout) {
        const saleItems = cart.items.map(item => {
          const notesObj: Record<string, any> = { product_name: item.product?.name };
          if (item.notes) notesObj.extra = item.notes;
          if (item.modifiers && item.modifiers.length > 0) notesObj.modifiers = item.modifiers;

          return {
            sale_id: saleData.id,
            product_id: item.product_id,
            quantity: item.quantity,
            unit_price: item.unit_price,
            total: item.total,
            tax_amount: item.tax_amount || 0,
            tax_rate: item.tax_rate || 0,
            discount_amount: item.discount_amount || 0,
            notes: notesObj
          };
        });

        const { error: itemsError } = await supabase
          .from('sale_items')
          .insert(saleItems);

        if (itemsError) throw itemsError;
      }

      // Descontar stock por cada item vendido (solo si no es deuda - ya fue descontado)
      if (!isDebtCheckout) {
        try {
          const stockResult = await stockMovementService.decrementOnSale(
            cart.organization_id,
            getCurrentBranchIdWithFallback(),
            saleData.id,
            cart.items.map(item => ({ product_id: item.product_id, quantity: item.quantity, unit_price: item.unit_price })),
            'sale'
          );
          if (stockResult.errors.length > 0) {
            console.warn('⚠️ Algunos items no descontaron stock:', stockResult.errors);
          }
          console.log(`📦 Stock descontado: ${cart.items.length - stockResult.skipped} items procesados`);
        } catch (stockError) {
          console.warn('⚠️ Error descontando stock (no bloquea la venta):', stockError);
        }
      }

      // Crear o actualizar la factura (invoice_sales)
      const baseCurrency = await this.getBaseCurrency();
      let invoiceData: any = null;
      let invoiceError: any = null;

      if (isDebtCheckout) {
        // Actualizar factura existente de la deuda
        const { data: updatedInvoice, error: updateInvError } = await supabase
          .from('invoice_sales')
          .update({
            balance: saleData.balance,
            status: saleData.balance > 0 ? 'partial' : 'paid',
            tax_included: checkoutData.tax_included || false,
            payment_method: payments.length > 0 ? payments[0].method : 'cash',
            payment_terms: 0,
            due_date: new Date().toISOString(),
          })
          .eq('id', cart.invoice_id)
          .select()
          .single();

        invoiceData = updatedInvoice;
        invoiceError = updateInvError;

        if (updateInvError) {
          console.error('Error updating debt invoice:', updateInvError);
        } else {
          console.log('Debt invoice updated successfully:', invoiceData.number);
        }
      } else {
        // Crear nueva factura (flujo normal)
        const invoiceNumber = await this.generateInvoiceNumber();
        const { data: newInvoice, error: newInvError } = await supabase
          .from('invoice_sales')
          .insert({
            organization_id: cart.organization_id,
            branch_id: getCurrentBranchId(),
            customer_id: cart.customer_id,
            sale_id: saleData.id,
            number: invoiceNumber,
            issue_date: new Date().toISOString(),
            due_date: new Date().toISOString(),
            currency: baseCurrency.code,
            subtotal: cart.subtotal,
            tax_total: cart.tax_total,
            total: finalTotal,
            balance: saleData.balance,
            status: saleData.balance > 0 ? 'partial' : 'paid',
            tax_included: checkoutData.tax_included || false,
            payment_method: payments.length > 0 ? payments[0].method : 'cash',
            payment_terms: 0,
            created_by: (await supabase.auth.getUser()).data.user?.id,
            notes: `Factura generada automáticamente desde POS - Venta #${saleData.id}`
          })
          .select()
          .single();

        invoiceData = newInvoice;
        invoiceError = newInvError;

        if (newInvError) {
          console.error('Error creating invoice:', newInvError);
        } else {
          console.log('Invoice created successfully:', invoiceData.number);
        }
      }

      // Crear los pagos - asociar con la factura (invoice_sales)
      //
      // IMPORTANTE: los pagos se insertan ANTES de los invoice_items.
      // El trigger fn_recalc_invoice_totals (en invoice_items) recalcula
      // balance = total - pagos_completados. Si los items se insertan primero, el
      // pago todavia no existe y el trigger escribe balance = total, pisando el
      // balance correcto y dejando la factura como 'paid' con saldo pendiente.
      const currentUser = await supabase.auth.getUser();
      const userId = currentUser.data.user?.id;
      
      const changeAmount = checkoutData.change || 0;
      let changeAssigned = false;
      for (const payment of payments) {
        if (payment.amount > 0) {
          const paymentData: any = {
            organization_id: cart.organization_id,
            branch_id: getCurrentBranchId(), // Usar branch_id actual del usuario
            amount: payment.amount,
            method: payment.method,
            currency: baseCurrency.code,
            status: 'completed',
            change_amount: (!changeAssigned && changeAmount > 0 && payment.method === 'cash') ? changeAmount : 0,
          };
          if (!changeAssigned && changeAmount > 0 && payment.method === 'cash') {
            changeAssigned = true;
          }
          
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

      // Crear los invoice_items basados en cart.items (solo si no es deuda - ya existen)
      if (invoiceData && !invoiceError && !isDebtCheckout) {
        try {
          // Obtener información de productos para las descripciones
          const productIds = cart.items.map(item => item.product_id).filter(id => id);
          const { data: productsData } = await supabase
            .from('products')
            .select('id, name, description, parent_product_id, parent:products!parent_product_id(name)')
            .in('id', productIds);
            
          const productMap = new Map((productsData || []).map(p => [p.id, p]));
          
          const invoiceItems = cart.items.map((cartItem: any) => {
            const product = productMap.get(cartItem.product_id);
            let description = product 
              ? product.name
              : `Producto ID: ${cartItem.product_id}`;

            // Si es un producto derivado, incluir el nombre del principal
            if (product?.parent_product_id && (product as any).parent?.name) {
              description = `${(product as any).parent.name} - ${description}`;
            }

            // Agregar modificadores del item (sin mencionar la palabra "modificador")
            if (cartItem.modifiers && cartItem.modifiers.length > 0) {
              const modNames = cartItem.modifiers.map((m: any) => m.name).filter(Boolean);
              if (modNames.length > 0) {
                description += ` (${modNames.join(', ')})`;
              }
            }

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

      // Si hay balance pendiente, crear cuenta por cobrar (solo si no es deuda - ya existe)
      if (saleData.balance > 0 && cart.customer_id && !isDebtCheckout) {
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

      // Guardar propina si existe
      if (checkoutData.tip_amount && checkoutData.tip_amount > 0) {
        const tipPayment = payments.find(p => p.amount > 0);
        const tipData = {
          organization_id: cart.organization_id,
          branch_id: getCurrentBranchId(),
          sale_id: saleData.id,
          server_id: checkoutData.tip_server_id || userId,
          amount: checkoutData.tip_amount,
          tip_type: tipPayment?.method === 'card' ? 'card' : 
                   tipPayment?.method === 'transfer' ? 'transfer' : 'cash',
          is_distributed: false,
          notes: `Propina de venta #${saleData.id.slice(-8)}`
        };
        
        const { error: tipError } = await supabase
          .from('tips')
          .insert(tipData);
        
        if (tipError) {
          console.error('Error creating tip:', tipError);
          // No lanzamos error para que no falle todo el checkout
        } else {
          console.log('Tip created successfully:', checkoutData.tip_amount);
        }
      }

      // Registrar movimientos de caja para todos los métodos de pago
      if (payments.length > 0) {
        try {
          const branchId = getCurrentBranchId();
          const { data: activeSession } = await supabase
            .from('cash_sessions')
            .select('id')
            .eq('organization_id', cart.organization_id)
            .eq('branch_id', branchId)
            .eq('status', 'open')
            .order('opened_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (activeSession) {
            const methodLabels = await getPaymentMethodLabels();
            const currentUserId = (await supabase.auth.getUser()).data.user?.id;

            for (const payment of payments) {
              if (payment.amount > 0) {
                const methodLabel = methodLabels[payment.method] || payment.method;
                await supabase
                  .from('cash_movements')
                  .insert({
                    organization_id: cart.organization_id,
                    branch_id: branchId,
                    cash_session_id: activeSession.id,
                    type: 'in',
                    concept: `Venta POS #${saleData.id.slice(0, 8)} - ${methodLabel}`,
                    amount: payment.amount,
                    user_id: currentUserId || undefined,
                    notes: `Pago ${methodLabel.toLowerCase()} - Venta desde POS`,
                  });
              }
            }
          }
        } catch (cashError) {
          console.error('Error registrando movimiento de caja:', cashError);
        }
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
            name,
            station,
            requires_preparation
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
        // tax_id legacy removido: los impuestos se consultan via product_tax_relations
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
        .is('effective_to', null)
        .order('effective_from', { ascending: false })
        .limit(1)
        .maybeSingle();

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
    // Si el impuesto está incluido en el precio, el subtotal ya contiene el impuesto
    // Por lo tanto, el total es subtotal - descuento (no se suma tax_total)
    const hasAnyTaxIncluded = cart.items.some(item => item.tax_included);
    if (hasAnyTaxIncluded) {
      // Para items con tax_included, el tax_amount ya está dentro del precio
      // Solo sumar tax_amount de items sin tax_included
      const extraTax = cart.items
        .filter(item => !item.tax_included)
        .reduce((sum, item) => sum + (item.tax_amount || 0), 0);
      cart.total = cart.subtotal + extraTax - cart.discount_total;
    } else {
      cart.total = cart.subtotal + cart.tax_total - cart.discount_total;
    }
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
      const taxableBase = baseAmount - (item.discount_amount || 0);
      let totalTaxAmount = 0;
      let totalTaxRate = 0;

      // Calcular impuestos acumulativos sobre la base gravable (despues del descuento)
      for (const taxRelation of productTaxes) {
        const tax = taxRelation.organization_taxes;
        if (tax && tax.is_active) {
          const taxAmount = (taxableBase * tax.rate) / 100;
          totalTaxAmount += taxAmount;
          totalTaxRate += tax.rate;
        }
      }

      item.tax_amount = Math.round(totalTaxAmount * 100) / 100;
      item.tax_rate = totalTaxRate;

      if (item.tax_included) {
        // Impuesto incluido en el precio: el total NO suma el impuesto encima
        const taxPortion = taxableBase - (taxableBase / (1 + totalTaxRate / 100));
        item.tax_amount = Math.round(taxPortion * 100) / 100;
        item.total = taxableBase;
      } else {
        // Impuesto NO incluido: se suma encima del precio
        item.total = taxableBase + item.tax_amount;
      }
      
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
        console.warn('Product tax relations error for product', productId, ':', relationsError);
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
        .select('*, customers(id, organization_id, full_name, first_name, last_name, email, phone, identification_type, identification_number, address, city, avatar_url, created_at, updated_at)')
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

      // 2. Usar invoice_id del carrito para encontrar la factura y luego la venta
      if (!cart.invoice_id) {
        throw new Error('El carrito no tiene invoice_id. Es posible que la deuda se haya creado antes de esta corrección.');
      }

      // Buscar la factura primero por invoice_id
      const { data: originalInvoice, error: invoiceError } = await supabase
        .from('invoice_sales')
        .select('*')
        .eq('id', cart.invoice_id)
        .single();

      if (invoiceError || !originalInvoice) {
        throw new Error('No se encontró la factura original');
      }

      // Buscar la venta por sale_id del carrito o por sale_id de la factura
      const saleIdToUse = cart.sale_id || originalInvoice.sale_id;

      if (!saleIdToUse) {
        throw new Error('No se pudo determinar la venta asociada');
      }

      const { data: saleData, error: saleError } = await supabase
        .from('sales')
        .select('*')
        .eq('id', saleIdToUse)
        .single();

      if (saleError || !saleData) {
        throw new Error('No se encontró la venta asociada al carrito');
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

      // 8. Fix: El trigger fn_recalc_invoice_totals usa GREATEST(tax, 0) que no permite
      // tax negativo en NC. Actualizamos tax_total manualmente DESPUÉS de que el trigger corre.
      const correctTaxTotal = -originalInvoice.tax_total;
      const correctSubtotal = -originalInvoice.subtotal;
      const correctTotal = -originalInvoice.total;
      const { error: fixNcError } = await supabase
        .from('invoice_sales')
        .update({
          subtotal: correctSubtotal,
          tax_total: correctTaxTotal,
          total: correctTotal,
          balance: 0,
        })
        .eq('id', creditNoteData.id);

      if (fixNcError) {
        console.warn('⚠️ No se pudo corregir tax_total de la NC:', fixNcError);
      }

      // 9. Actualizar la factura original (anulada, no pagada)
      const { error: updateInvoiceError } = await supabase
        .from('invoice_sales')
        .update({
          balance: 0,
          status: 'void',
          updated_at: new Date().toISOString()
        })
        .eq('id', originalInvoice.id);

      if (updateInvoiceError) {
        throw new Error('Error al actualizar la factura original');
      }

      // 10. Actualizar la venta original (cancelada, no pagada)
      const { error: updateSaleError } = await supabase
        .from('sales')
        .update({
          balance: 0,
          status: 'void',
          payment_status: 'refunded',
          updated_at: new Date().toISOString()
        })
        .eq('id', saleData.id);

      if (updateSaleError) {
        throw new Error('Error al actualizar la venta original');
      }

      // 11. Actualizar las cuentas por cobrar (cancelada, no pagada)
      const { error: updateARError } = await supabase
        .from('accounts_receivable')
        .update({
          balance: 0,
          status: 'cancelled',
          updated_at: new Date().toISOString()
        })
        .eq('invoice_id', originalInvoice.id);

      if (updateARError) {
        throw new Error('Error al actualizar las cuentas por cobrar');
      }

      // 10.5: Devolver stock al anular la deuda
      try {
        const stockItems = (originalItems || []).map(item => ({
          product_id: item.product_id,
          quantity: Math.abs(parseFloat(item.qty)),
          unit_price: parseFloat(item.unit_price) || 0,
        })).filter(item => item.product_id && item.quantity > 0);

        if (stockItems.length > 0) {
          const stockResult = await stockMovementService.incrementOnPurchase(
            this.organizationId,
            originalInvoice.branch_id || getCurrentBranchIdWithFallback(),
            creditNoteData.id,
            stockItems,
            'credit_note'
          );
          if (stockResult.errors.length > 0) {
            console.warn('⚠️ Algunos items no devolvieron stock:', stockResult.errors);
          }
          console.log(`📦 Stock devuelto: ${stockItems.length - stockResult.skipped} items procesados`);
        }
      } catch (stockError) {
        console.warn('⚠️ Error devolviendo stock (no bloquea la anulación):', stockError);
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

  /**
   * Obtener miembros de la organización (para propinas)
   */
  static async getOrganizationMembers(): Promise<any[]> {
    try {
      const orgId = getOrganizationId();
      if (!orgId) {
        console.warn('No organization ID available');
        return [];
      }

      // Obtener miembros activos
      const { data: members, error: membersError } = await supabase
        .from('organization_members')
        .select('user_id, role_id, is_active')
        .eq('organization_id', orgId)
        .eq('is_active', true);

      if (membersError) throw membersError;
      if (!members || members.length === 0) return [];

      // Obtener perfiles de los usuarios
      const userIds = members.map(m => m.user_id);
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, email, first_name, last_name')
        .in('id', userIds);

      if (profilesError) throw profilesError;

      // Crear mapa de perfiles
      const profilesMap: Record<string, any> = {};
      (profiles || []).forEach(p => {
        profilesMap[p.id] = p;
      });

      // Combinar datos
      return members.map(m => {
        const profile = profilesMap[m.user_id];
        const firstName = profile?.first_name || '';
        const lastName = profile?.last_name || '';
        const fullName = [firstName, lastName].filter(Boolean).join(' ') || null;
        
        return {
          user_id: m.user_id,
          role_id: m.role_id,
          is_active: m.is_active,
          users: profile ? {
            id: profile.id,
            email: profile.email,
            first_name: firstName,
            last_name: lastName,
            raw_user_meta_data: {
              full_name: fullName,
              name: firstName || null
            }
          } : null
        };
      });
    } catch (error) {
      console.error('Error fetching organization members:', error);
      return [];
    }
  }
}
