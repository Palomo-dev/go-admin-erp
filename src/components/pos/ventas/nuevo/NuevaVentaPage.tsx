'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  ShoppingCart,
  User,
  Search,
  Plus,
  Minus,
  Trash2,
  CreditCard,
  Tag,
  Percent,
  Save,
  X,
  RefreshCw,
  Barcode,
  Package
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useOrganization, getCurrentBranchId } from '@/lib/hooks/useOrganization';
import { POSService } from '@/lib/services/posService';
import { Product, Cart, CartItem, Customer } from '@/components/pos/types';
import { ProductSearch } from '@/components/pos/ProductSearch';
import { CustomerSelector } from '@/components/pos/CustomerSelector';
import { CheckoutDialog } from '@/components/pos/CheckoutDialog';
import { formatCurrency } from '@/utils/Utils';
import { cn } from '@/utils/Utils';

export function NuevaVentaPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { organization, isLoading: orgLoading } = useOrganization();
  
  const [cart, setCart] = useState<Cart | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showCheckout, setShowCheckout] = useState(false);
  const [couponCode, setCouponCode] = useState('');
  const [isApplyingCoupon, setIsApplyingCoupon] = useState(false);

  const isDuplicate = searchParams.get('duplicate') === 'true';

  useEffect(() => {
    if (organization?.id) {
      initializeCart();
    }
  }, [organization]);

  const initializeCart = async () => {
    setIsLoading(true);
    try {
      const branchId = getCurrentBranchId() || 2;
      const newCart = await POSService.createCart(branchId);
      setCart(newCart);

      // Si es duplicar, cargar items del sessionStorage
      if (isDuplicate) {
        const savedItems = sessionStorage.getItem('duplicateSaleItems');
        if (savedItems) {
          const items = JSON.parse(savedItems);
          for (const item of items) {
            if (item.products) {
              await POSService.addItemToCart(newCart.id, {
                id: item.product_id,
                ...item.products,
                price: item.unit_price
              });
            }
          }
          sessionStorage.removeItem('duplicateSaleItems');
          // Recargar carrito con items
          const carts = await POSService.getActiveCarts();
          const updatedCart = carts.find(c => c.id === newCart.id);
          if (updatedCart) setCart(updatedCart);
        }
      }
    } catch (error) {
      console.error('Error initializing cart:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleProductSelect = async (product: Product) => {
    if (!cart) return;
    try {
      const updatedCart = await POSService.addItemToCart(cart.id, product);
      setCart(updatedCart);
    } catch (error) {
      console.error('Error adding product:', error);
      alert('Error al agregar producto');
    }
  };

  const handleUpdateQuantity = async (itemId: string, newQuantity: number) => {
    if (!cart || newQuantity < 1) return;
    try {
      const updatedCart = await POSService.updateCartItemQuantity(cart.id, itemId, newQuantity);
      setCart(updatedCart);
    } catch (error) {
      console.error('Error updating quantity:', error);
    }
  };

  const handleRemoveItem = async (itemId: string) => {
    if (!cart) return;
    try {
      const updatedCart = await POSService.removeItemFromCart(cart.id, itemId);
      setCart(updatedCart);
    } catch (error) {
      console.error('Error removing item:', error);
    }
  };

  const handleCustomerSelect = async (customer?: Customer) => {
    if (!cart) return;
    try {
      const updatedCart = await POSService.setCartCustomer(cart.id, customer?.id);
      setCart(updatedCart);
    } catch (error) {
      console.error('Error setting customer:', error);
    }
  };

  const handleApplyCoupon = async () => {
    if (!cart || !couponCode.trim()) return;
    setIsApplyingCoupon(true);
    try {
      // TODO: Implementar aplicación de cupón
      alert(`Cupón "${couponCode}" aplicado (demo)`);
      setCouponCode('');
    } catch (error) {
      console.error('Error applying coupon:', error);
      alert('Cupón inválido o expirado');
    } finally {
      setIsApplyingCoupon(false);
    }
  };

  const handleCheckout = () => {
    if (!cart || cart.items.length === 0) {
      alert('El carrito está vacío');
      return;
    }
    setShowCheckout(true);
  };

  const handleCheckoutComplete = async (sale: any) => {
    setShowCheckout(false);
    alert(`Venta completada: ${formatCurrency(sale.total)}`);
    router.push(`/app/pos/ventas/${sale.id}`);
  };

  const handleSaveAsPending = async () => {
    if (!cart) return;
    // TODO: Implementar guardar como pendiente
    alert('Venta guardada como pendiente');
    router.push('/app/pos/ventas');
  };

  const handleClearCart = async () => {
    if (!cart) return;
    if (!confirm('¿Limpiar el carrito?')) return;
    
    try {
      for (const item of cart.items) {
        await POSService.removeItemFromCart(cart.id, item.id);
      }
      const carts = await POSService.getActiveCarts();
      const updatedCart = carts.find(c => c.id === cart.id);
      if (updatedCart) setCart(updatedCart);
    } catch (error) {
      console.error('Error clearing cart:', error);
    }
  };

  if (orgLoading || isLoading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[500px]">
        <RefreshCw className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50 dark:bg-gray-950">
      {/* Header */}
      <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/app/pos">
              <Button variant="ghost" size="icon" className="dark:text-gray-400">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-white">
                {isDuplicate ? 'Duplicar Venta' : 'Nueva Venta'}
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {organization?.name}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              onClick={handleSaveAsPending}
              disabled={!cart || cart.items.length === 0}
              className="dark:border-gray-700"
            >
              <Save className="h-4 w-4 mr-2" />
              Guardar
            </Button>
            <Button
              onClick={handleCheckout}
              disabled={!cart || cart.items.length === 0}
              className="bg-blue-500 hover:bg-blue-600 text-white"
            >
              <CreditCard className="h-4 w-4 mr-2" />
              Cobrar
            </Button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Panel izquierdo: Productos */}
        <div className="flex-1 p-4 overflow-auto">
          <ProductSearch onProductSelect={handleProductSelect} />
        </div>

        {/* Panel derecho: Carrito */}
        <div className="w-full md:w-[400px] lg:w-[450px] bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-800 flex flex-col">
          {/* Cliente */}
          <div className="p-4 border-b border-gray-200 dark:border-gray-800">
            <div className="flex items-center gap-2 mb-3">
              <User className="h-4 w-4 text-gray-500" />
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Cliente</span>
            </div>
            <CustomerSelector
              selectedCustomer={cart?.customer}
              onCustomerSelect={handleCustomerSelect}
            />
          </div>

          {/* Items */}
          <div className="flex-1 overflow-auto p-4">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <ShoppingCart className="h-4 w-4 text-gray-500" />
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Carrito ({cart?.items.length || 0})
                </span>
              </div>
              {cart && cart.items.length > 0 && (
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={handleClearCart}
                  className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                >
                  <Trash2 className="h-4 w-4 mr-1" />
                  Limpiar
                </Button>
              )}
            </div>

            {!cart || cart.items.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Package className="h-12 w-12 text-gray-300 dark:text-gray-600 mb-4" />
                <p className="text-gray-500 dark:text-gray-400">
                  El carrito está vacío
                </p>
                <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
                  Busca productos para agregar
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {cart.items.map((item) => (
                  <div
                    key={item.id}
                    className="p-3 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-900 dark:text-white truncate">
                          {item.product?.name || 'Producto'}
                        </p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          {formatCurrency(item.unit_price)} c/u
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-red-500 hover:text-red-600"
                        onClick={() => handleRemoveItem(item.id)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="flex items-center justify-between mt-2">
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-7 w-7 dark:border-gray-600"
                          onClick={() => handleUpdateQuantity(item.id, item.quantity - 1)}
                          disabled={item.quantity <= 1}
                        >
                          <Minus className="h-3 w-3" />
                        </Button>
                        <span className="w-8 text-center font-medium dark:text-white">
                          {item.quantity}
                        </span>
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-7 w-7 dark:border-gray-600"
                          onClick={() => handleUpdateQuantity(item.id, item.quantity + 1)}
                        >
                          <Plus className="h-3 w-3" />
                        </Button>
                      </div>
                      <p className="font-semibold text-gray-900 dark:text-white">
                        {formatCurrency(item.total)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Cupón */}
          <div className="p-4 border-t border-gray-200 dark:border-gray-800">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Tag className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Código de cupón"
                  value={couponCode}
                  onChange={(e) => setCouponCode(e.target.value)}
                  className="pl-10 dark:bg-gray-800 dark:border-gray-700"
                />
              </div>
              <Button
                variant="outline"
                onClick={handleApplyCoupon}
                disabled={!couponCode.trim() || isApplyingCoupon}
                className="dark:border-gray-700"
              >
                Aplicar
              </Button>
            </div>
          </div>

          {/* Totales */}
          <div className="p-4 border-t border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
            <div className="space-y-2 mb-4">
              <div className="flex justify-between text-gray-600 dark:text-gray-400">
                <span>Subtotal</span>
                <span>{formatCurrency(cart?.subtotal || 0)}</span>
              </div>
              <div className="flex justify-between text-gray-600 dark:text-gray-400">
                <span>Impuestos</span>
                <span>{formatCurrency(cart?.tax_total || 0)}</span>
              </div>
              {Number(cart?.discount_total) > 0 && (
                <div className="flex justify-between text-green-600 dark:text-green-400">
                  <span>Descuentos</span>
                  <span>-{formatCurrency(cart?.discount_total || 0)}</span>
                </div>
              )}
            </div>
            <Separator className="dark:bg-gray-700 mb-4" />
            <div className="flex justify-between text-xl font-bold text-gray-900 dark:text-white mb-4">
              <span>Total</span>
              <span>{formatCurrency(cart?.total || 0)}</span>
            </div>
            <Button
              className="w-full h-12 text-lg bg-blue-500 hover:bg-blue-600 text-white"
              onClick={handleCheckout}
              disabled={!cart || cart.items.length === 0}
            >
              <CreditCard className="h-5 w-5 mr-2" />
              Cobrar {formatCurrency(cart?.total || 0)}
            </Button>
          </div>
        </div>
      </div>

      {/* Checkout Dialog */}
      {cart && (
        <CheckoutDialog
          cart={cart}
          open={showCheckout}
          onOpenChange={setShowCheckout}
          onCheckoutComplete={handleCheckoutComplete}
        />
      )}
    </div>
  );
}
