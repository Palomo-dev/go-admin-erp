'use client';

import { useState, useEffect } from 'react';
import { ShoppingCart, Users, Package, Settings, RefreshCw, Clock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ProductSearch } from '@/components/pos/ProductSearch';
import { CustomerSelector } from '@/components/pos/CustomerSelector';
import { CartView } from '@/components/pos/CartView';
import { CartTabs } from '@/components/pos/CartTabs';
import { CheckoutDialog } from '@/components/pos/CheckoutDialog';
import { POSService } from '@/lib/services/posService';
import { PrintService } from '@/lib/services/printService';
import { useOrganization, getCurrentBranchId } from '@/lib/hooks/useOrganization';
import { Product, Customer, Cart, Sale } from '@/components/pos/types';
import { formatCurrency } from '@/utils/Utils';

export default function POSPage() {
  const { organization, isLoading: orgLoading } = useOrganization();
  const [carts, setCarts] = useState<Cart[]>([]);
  const [activeCartId, setActiveCartId] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | undefined>();
  const [showCheckout, setShowCheckout] = useState(false);
  const [checkoutCart, setCheckoutCart] = useState<Cart | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(new Date());

  // Cargar datos iniciales
  useEffect(() => {
    if (organization?.id) {
      initializePOS();
    }
  }, [organization]);

  const initializePOS = async () => {
    setIsLoading(true);
    try {
      // Cargar carritos existentes
      const existingCarts = await POSService.getActiveCarts();
      
      if (existingCarts.length > 0) {
        setCarts(existingCarts);
        setActiveCartId(existingCarts[0].id);
      } else {
        // Crear primer carrito
        await createNewCart();
      }
    } catch (error) {
      console.error('Error initializing POS:', error);
      // Crear carrito por defecto en caso de error
      await createNewCart();
    } finally {
      setIsLoading(false);
    }
  };

  const createNewCart = async () => {
    try {
      // Usar branch_id actual seleccionado por el usuario
      const branchId = getCurrentBranchId(); // Obtener branch_id actual del selector
      const newCart = await POSService.createCart(branchId);
      
      setCarts(prevCarts => [...prevCarts, newCart]);
      setActiveCartId(newCart.id);
      setSelectedCustomer(undefined);
      setLastUpdate(new Date());
    } catch (error) {
      console.error('Error creating new cart:', error);
      alert('Error al crear nuevo carrito');
    }
  };

  const removeCart = async (cartId: string) => {
    try {
      const updatedCarts = carts.filter(cart => cart.id !== cartId);
      setCarts(updatedCarts);
      
      // Si el carrito activo fue eliminado, cambiar a otro
      if (cartId === activeCartId && updatedCarts.length > 0) {
        setActiveCartId(updatedCarts[0].id);
      } else if (updatedCarts.length === 0) {
        // Crear nuevo carrito si no quedan
        await createNewCart();
      }
    } catch (error) {
      console.error('Error removing cart:', error);
    }
  };

  const handleProductSelect = async (product: Product) => {
    if (!activeCartId) {
      alert('No hay carrito activo');
      return;
    }

    try {
      const updatedCart = await POSService.addItemToCart(activeCartId, product);
      updateCartInState(updatedCart);
    } catch (error) {
      console.error('Error adding product to cart:', error);
      alert('Error al agregar producto al carrito');
    }
  };

  const handleCustomerSelect = async (customer?: Customer) => {
    if (!activeCartId) return;

    try {
      const updatedCart = await POSService.setCartCustomer(activeCartId, customer?.id);
      updateCartInState(updatedCart);
      setSelectedCustomer(customer);
    } catch (error) {
      console.error('Error setting cart customer:', error);
      alert('Error al asignar cliente al carrito');
    }
  };

  const updateCartInState = (updatedCart: Cart) => {
    setCarts(prevCarts => 
      prevCarts.map(cart => 
        cart.id === updatedCart.id ? updatedCart : cart
      )
    );
    setLastUpdate(new Date());
  };

  const handleCartUpdate = (updatedCart: Cart) => {
    updateCartInState(updatedCart);
  };

  const handleCheckout = (cart: Cart) => {
    setCheckoutCart(cart);
    setShowCheckout(true);
  };

  const handleCheckoutComplete = async (sale: Sale) => {
    try {
      // Obtener datos para impresión
      const saleItems = checkoutCart?.items.map(item => ({
        id: crypto.randomUUID(),
        sale_id: sale.id,
        product_id: item.product_id,
        quantity: item.quantity,
        unit_price: item.unit_price,
        total: item.total,
        tax_amount: item.tax_amount,
        tax_rate: item.tax_rate,
        discount_amount: item.discount_amount,
        notes: { product_name: item.product.name },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })) || [];

      // Imprimir ticket automáticamente
      PrintService.smartPrint(
        sale,
        saleItems,
        checkoutCart?.customer,
        [], // payments se obtendrían de la BD en implementación completa
        organization?.name || 'Mi Empresa',
        'Dirección de la sucursal'
      );

      // Remover el carrito completado
      if (checkoutCart) {
        const updatedCarts = carts.filter(cart => cart.id !== checkoutCart.id);
        setCarts(updatedCarts);
        
        // Crear nuevo carrito si era el único
        if (updatedCarts.length === 0) {
          await createNewCart();
        } else {
          setActiveCartId(updatedCarts[0].id);
        }
      }

      alert(`Venta completada: ${formatCurrency(sale.total)}`);
    } catch (error) {
      console.error('Error completing checkout:', error);
    }
  };

  const handleHoldCart = (cart: Cart, reason?: string) => {
    updateCartInState(cart);
    alert(`Carrito puesto en espera${reason ? ': ' + reason : ''}`);
  };

  // Obtener carrito activo
  const activeCart = carts.find(cart => cart.id === activeCartId);

  // Estados de carga
  if (orgLoading || isLoading) {
    return (
      <div className="flex items-center justify-center h-screen dark:bg-gray-900 light:bg-gray-50">
        <div className="text-center space-y-4">
          <RefreshCw className="h-8 w-8 animate-spin mx-auto dark:text-blue-400 light:text-blue-600" />
          <p className="dark:text-gray-400 light:text-gray-600">Cargando sistema POS...</p>
        </div>
      </div>
    );
  }

  if (!organization) {
    return (
      <div className="flex items-center justify-center h-screen dark:bg-gray-900 light:bg-gray-50">
        <Card className="dark:bg-gray-800 dark:border-gray-700 light:bg-white light:border-gray-200">
          <CardContent className="p-6 text-center">
            <Settings className="h-12 w-12 mx-auto mb-4 dark:text-gray-400 light:text-gray-500" />
            <h2 className="text-lg font-semibold mb-2 dark:text-white light:text-gray-900">
              Organización no encontrada
            </h2>
            <p className="dark:text-gray-400 light:text-gray-600">
              Configure su organización para usar el sistema POS
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="h-screen dark:bg-gray-900 light:bg-gray-50 p-2">
      <div className="w-full h-full space-y-1">
        {/* Header */}
        <Card className="dark:bg-gray-800 dark:border-gray-700 light:bg-white light:border-gray-200">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="p-2 rounded-full dark:bg-blue-500/20 light:bg-blue-100">
                  <ShoppingCart className="h-6 w-6 dark:text-blue-400 light:text-blue-600" />
                </div>
                <div>
                  <CardTitle className="dark:text-white light:text-gray-900">
                    Sistema POS - {organization?.name || 'Organización'}
                  </CardTitle>
                  <p className="text-sm dark:text-gray-400 light:text-gray-600">
                    Caja rápida / Venta clásica
                  </p>
                </div>
              </div>
              <div className="flex items-center space-x-4">
                <div className="text-right">
                  <div className="flex items-center space-x-2">
                    <Clock className="h-4 w-4 dark:text-gray-400 light:text-gray-500" />
                    <span className="text-sm dark:text-gray-400 light:text-gray-600">
                      {lastUpdate.toLocaleTimeString()}
                    </span>
                  </div>
                  <div className="flex items-center space-x-2 mt-1">
                    <Badge variant="outline" className="dark:border-green-500 dark:text-green-400 light:border-green-500 light:text-green-600">
                      {carts.filter(c => c.status === 'active').length} Activos
                    </Badge>
                    <Badge variant="outline" className="dark:border-yellow-500 dark:text-yellow-400 light:border-yellow-500 light:text-yellow-600">
                      {carts.filter(c => c.status === 'hold').length} En Espera
                    </Badge>
                  </div>
                </div>
              </div>
            </div>
          </CardHeader>
        </Card>

        {/* Contenido principal - Layout 3:1 columnas FULLSCREEN */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 h-[calc(100vh-120px)]">
          {/* Columna izquierda: Catálogo de productos (3/4) */}
          <div className="lg:col-span-3 h-full">
            <ProductSearch 
              onProductSelect={handleProductSelect}
            />
          </div>

          {/* Columna derecha: Cliente y Carritos (1/4) */}
          <div className="lg:col-span-1 space-y-2 overflow-y-auto h-full">
            {/* Selector de cliente - Compacto */}
            <Card className="dark:bg-gray-800 dark:border-gray-700 light:bg-white light:border-gray-200">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center space-x-2 text-sm dark:text-white light:text-gray-900">
                  <Users className="h-4 w-4" />
                  <span>Cliente</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0 pb-2">
                <CustomerSelector 
                  selectedCustomer={activeCart?.customer}
                  onCustomerSelect={handleCustomerSelect}
                />
              </CardContent>
            </Card>

            {/* Pestañas de carritos - Compactas */}
            <div className="space-y-2 flex-1">
              <CartTabs
                carts={carts}
                activeCartId={activeCartId}
                onCartSelect={setActiveCartId}
                onNewCart={createNewCart}
                onRemoveCart={removeCart}
              />

              {/* Vista del carrito activo - Compacta */}
              {activeCart && (
                <div className="flex-1">
                  <CartView
                    cart={activeCart}
                    onCartUpdate={handleCartUpdate}
                    onCheckout={handleCheckout}
                    onHold={handleHoldCart}
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Dialog de checkout */}
        {checkoutCart && (
          <CheckoutDialog
            cart={checkoutCart}
            open={showCheckout}
            onOpenChange={setShowCheckout}
            onCheckoutComplete={handleCheckoutComplete}
          />
        )}
      </div>
    </div>
  );
}