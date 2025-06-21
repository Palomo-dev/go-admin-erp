import React, { useState, useEffect } from "react";
import { ProductSearch } from "./product-search";
import { ProductGrid } from "./product-grid";
import { CartSummary } from "./cart-summary";
import { CustomerSelector } from "./customer-selector";
import { MultiCartManager } from "./multi-cart-manager";
import { BarcodeScanner } from "./barcode-scanner";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { Printer, ShoppingCart, User } from "lucide-react";
import { getUserRole, getUserOrganization, supabase } from '@/lib/supabase/config';

interface Product {
  id: string;
  name: string;
  price: number;
  sku: string;
  image_url?: string;
  image_path?: string;
  image_type?: string;
  category_id?: number;
  description?: string;
  is_menu_item?: boolean;
  status?: string;
  organization_id: string;
  barcode?: string;
}

interface Category {
  id: number;
  name: string;
  slug?: string;
  parent_id?: number | null;
  rank?: number;
  organization_id: string;
}

interface Customer {
  id: string;
  full_name: string;
  email?: string;
  phone?: string;
  identification_type?: string;
  identification_number?: string;
  organization_id: string;
}

interface CartItem {
  product_id: string;
  product: Product;
  quantity: number;
  unit_price: number;
}

interface Cart {
  id?: string;
  items: CartItem[];
  customer?: Customer | null;
  notes?: string;
  name?: string;
  created_at?: string;
  updated_at?: string;
  organization_id?: string;
  branch_id?: string;
  user_id?: string;
}

const defaultCart: Cart = {
  items: [],
  customer: null
};

export function MainPOS({
  initialProducts,
  initialCategories,
  initialUser
}: {
  initialProducts: Product[];
  initialCategories: Category[];
  initialUser: any;
}) {
  const supabase = createClientComponentClient();
  const router = useRouter();
  
  const [products, setProducts] = useState<Product[]>(initialProducts || []);
  const [categories, setCategories] = useState<Category[]>(initialCategories || []);
  const [cart, setCart] = useState<Cart>(defaultCart);
  const [searchTerm, setSearchTerm] = useState("");
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [filteredProducts, setFilteredProducts] = useState<Product[]>(initialProducts || []);
  const [isLoading, setIsLoading] = useState(false);
  const [savedCarts, setSavedCarts] = useState<Cart[]>([]);
  const [isMultiCartOpen, setIsMultiCartOpen] = useState(false);

  // Cargar carritos guardados al inicio
  useEffect(() => {
    loadSavedCarts();
  }, []);

  // Filtrar productos por término de búsqueda
  useEffect(() => {
    if (!searchTerm.trim()) {
      setFilteredProducts(products);
      return;
    }
    
    const term = searchTerm.toLowerCase().trim();
    const filtered = products.filter(product => 
      product.name.toLowerCase().includes(term) ||
      product.sku.toLowerCase().includes(term) ||
      (product.barcode && product.barcode.toLowerCase().includes(term))
    );
    
    setFilteredProducts(filtered);
  }, [searchTerm, products]);

  // Función para validar si un string tiene formato UUID
  const isValidUUID = (uuid: any): boolean => {
    if (!uuid) return false;
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(uuid.toString());
  };

  // Cargar carritos guardados desde Supabase
  const loadSavedCarts = async () => {
    setIsLoading(true);
    try {
      console.log("Cargando carritos guardados...");
      console.log("Datos usuario", initialUser);

      // Validar que los IDs sean UUIDs válidos antes de consultar
      const orgId = initialUser?.organization_id;
      const branchId = initialUser?.branch_id;

      if (!isValidUUID(orgId) || !isValidUUID(branchId)) {
        console.warn("IDs de organización o sucursal no válidos para consulta de carritos");
        setIsLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from('carts')
        .select('*')
        .eq('organization_id', orgId)
        .eq('branch_id', branchId);

      console.log("Carritos guardados:", data);
      
      if (error) {
        console.error("Error al cargar carritos:", error);
        return;
      }
      
      setSavedCarts(data || []);
    } catch (error) {
      console.error("Error al cargar carritos:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // Manejar la búsqueda de productos
  const handleSearch = (term: string) => {
    setSearchTerm(term);
  };

  // Manejar escaneo de código de barras
  const handleBarcodeScan = (barcode: string) => {
    setIsScannerOpen(false);
    
    // Buscar producto por código de barras
    const product = products.find(p => p.barcode === barcode);
    if (product) {
      addToCart(product);
    } else {
      // Aquí podrías mostrar una notificación de que el producto no se encontró
      alert("Producto no encontrado con el código de barras: " + barcode);
    }
  };

  // Funciones para manipular el carrito
  const addToCart = (product: Product) => {
    setCart(currentCart => {
      const existingItemIndex = currentCart.items.findIndex(
        item => item.product_id === product.id
      );
      if (existingItemIndex > -1) {
        const updatedItems = [...currentCart.items];
        updatedItems[existingItemIndex].quantity += 1;
        return { ...currentCart, items: updatedItems };
      } else {
        return {
          ...currentCart,
          items: [
            ...currentCart.items,
            {
              product_id: product.id,
              product: product,
              quantity: 1,
              unit_price: product.price
            }
          ]
        };
      }
    });
  };

  const increaseQuantity = (productId: string) => {
    setCart(currentCart => {
      const updatedItems = currentCart.items.map(item => 
        item.product_id === productId
          ? { ...item, quantity: item.quantity + 1 }
          : item
      );
      return { ...currentCart, items: updatedItems };
    });
  };

  const decreaseQuantity = (productId: string) => {
    setCart(currentCart => {
      const updatedItems = currentCart.items.map(item => 
        item.product_id === productId && item.quantity > 1
          ? { ...item, quantity: item.quantity - 1 }
          : item
      );
      return { ...currentCart, items: updatedItems };
    });
  };

  const removeFromCart = (productId: string) => {
    setCart(currentCart => ({
      ...currentCart,
      items: currentCart.items.filter(item => item.product_id !== productId)
    }));
  };

  // Calcular total del carrito
  const calculateTotal = () => {
    return cart.items.reduce(
      (total, item) => total + item.quantity * item.unit_price,
      0
    );
  };

  // Seleccionar cliente
  const selectCustomer = (customer: Customer | null) => {
    setCart(currentCart => ({
      ...currentCart,
      customer
    }));
  };

  // Guardar carrito en Supabase
  const saveCart = async () => {
    setIsLoading(true);
    try {
      // Preparar datos del carrito
      const cartData = {
        organization_id: initialUser?.organization_id,
        branch_id: initialUser?.branch_id,
        user_id: initialUser?.id,
        cart_data: {
          items: cart.items,
          customer: cart.customer,
          notes: cart.notes || ''
        },
        name: `Ticket ${new Date().toLocaleTimeString()}`,
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // 24 horas
      };
      
      const { data, error } = await supabase
        .from('carts')
        .insert(cartData)
        .select('*')
        .single();
      
      if (error) {
        console.error("Error al guardar carrito:", error);
        return;
      }
      
      // Recargar los carritos guardados
      await loadSavedCarts();
      
      // Limpiar carrito actual
      setCart(defaultCart);
    } catch (error) {
      console.error("Error al guardar carrito:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // Cargar un carrito guardado
  const loadCart = (savedCart: Cart) => {
    if (savedCart && savedCart.cart_data) {
      setCart({
        id: savedCart.id,
        items: savedCart.cart_data.items || [],
        customer: savedCart.cart_data.customer || null,
        notes: savedCart.cart_data.notes || ''
      });
      
      setIsMultiCartOpen(false);
    }
  };

  // Eliminar un carrito guardado
  const deleteCart = async (cartId: string) => {
    try {
      const { error } = await supabase
        .from('carts')
        .delete()
        .eq('id', cartId);
      
      if (error) {
        console.error("Error al eliminar carrito:", error);
        return;
      }
      
      // Actualizar lista local de carritos
      setSavedCarts(prevCarts => prevCarts.filter(cart => cart.id !== cartId));
    } catch (error) {
      console.error("Error al eliminar carrito:", error);
    }
  };

  // Proceder al cobro
  const proceedToCheckout = async () => {
    if (cart.items.length === 0) {
      alert('No hay productos en el carrito');
      return;
    }

    setIsLoading(true);
    try {
      // Si no hay un ID de carrito, significa que necesitamos guardarlo primero en Supabase
      let cartId = cart.id;
      if (!cartId) {
        // Preparar datos del carrito
        const cartData = {
          organization_id: initialUser?.organization_id,
          branch_id: initialUser?.branch_id,
          user_id: initialUser?.id,
          cart_data: JSON.stringify({
            items: cart.items,
            customer: cart.customer,
            notes: cart.notes || ''
          }),
          name: `Ticket ${new Date().toLocaleTimeString()}`,
          expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // 24 horas
        };
        
        const { data, error } = await supabase
          .from('carts')
          .insert(cartData)
          .select('*')
          .single();
        
        if (error) {
          console.error('Error al guardar carrito para cobro:', error);
          alert('Error al preparar el carrito para cobro. Intente nuevamente.');
          setIsLoading(false);
          return;
        }
        
        cartId = data.id;
      }
      
      // Guardar también en localStorage como respaldo (mejor manejo de datos)
      localStorage.setItem('posCart', JSON.stringify({
        items: cart.items,
        customer: cart.customer,
        notes: cart.notes || '',
        cartId: cartId // Incluir ID del carrito guardado
      }));
      
      // Redireccionar a cobro con parámetros
      const params = new URLSearchParams();
      if (cartId) params.append('cartId', cartId);
      if (cart.customer?.id) params.append('customerId', cart.customer.id);
      
      router.push(`/app/pos/cobro?${params.toString()}`);
    } catch (error) {
      console.error('Error al proceder al cobro:', error);
      alert('Ocurrió un error al proceder al cobro. Intente nuevamente.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 h-full">
      {/* Panel izquierdo - Búsqueda y productos */}
      <div className="lg:col-span-8 h-full flex flex-col">
        <div className="mb-4 flex">
          <div className="flex-1 mr-2">
            <ProductSearch
              onSearch={handleSearch}
              onScanClick={() => setIsScannerOpen(true)}
              isLoading={isLoading}
            />
          </div>
          <div className="flex space-x-2">
            <Button
              variant="outline"
              className="border-blue-200 dark:border-blue-800 bg-white dark:bg-gray-800"
              onClick={() => setIsMultiCartOpen(true)}
            >
              <ShoppingCart className="h-5 w-5 mr-1 text-blue-600 dark:text-blue-400" />
              <span className="hidden sm:inline">Tickets</span>
              <span className="inline sm:hidden">{savedCarts.length}</span>
            </Button>
          </div>
        </div>
        
        {/* Grid de productos */}
        <div className="flex-1 overflow-hidden">
          <div className="h-full overflow-y-auto pb-6">
            <ProductGrid
              products={filteredProducts}
              categories={categories}
              onProductClick={addToCart}
            />
          </div>
        </div>
      </div>
      
      {/* Panel derecho - Carrito y cliente */}
      <div className="lg:col-span-4 h-full flex flex-col">
        <div className="bg-white dark:bg-gray-850 rounded-lg border border-gray-200 dark:border-gray-700 p-4 h-full flex flex-col">
          <div className="mb-4">
            <CustomerSelector
              onSelectCustomer={selectCustomer}
              selectedCustomer={cart.customer}
            />
          </div>
          
          <div className="flex-1 overflow-hidden">
            <CartSummary
              cart={cart}
              onIncreaseQuantity={increaseQuantity}
              onDecreaseQuantity={decreaseQuantity}
              onRemoveItem={removeFromCart}
              onHoldCart={saveCart}
              onCheckout={proceedToCheckout}
              customerName={cart.customer?.full_name}
            />
          </div>
        </div>
      </div>
      
      {/* Escáner de código de barras */}
      {isScannerOpen && (
        <BarcodeScanner
          onScan={handleBarcodeScan}
          onClose={() => setIsScannerOpen(false)}
        />
      )}
      
      {/* Gestor de múltiples carritos */}
      {isMultiCartOpen && (
        <MultiCartManager
          savedCarts={savedCarts}
          onClose={() => setIsMultiCartOpen(false)}
          onLoad={loadCart}
          onDelete={deleteCart}
          isLoading={isLoading}
        />
      )}
    </div>
  );
}
