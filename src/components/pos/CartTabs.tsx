'use client';

import { useState } from 'react';
import { Plus, X, Clock, ShoppingCart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Cart } from './types';
import { formatCurrency } from '@/utils/Utils';

interface CartTabsProps {
  carts: Cart[];
  activeCartId: string;
  onCartSelect: (cartId: string) => void;
  onNewCart: () => void;
  onRemoveCart: (cartId: string) => void;
  className?: string;
}

export function CartTabs({ 
  carts, 
  activeCartId, 
  onCartSelect, 
  onNewCart, 
  onRemoveCart, 
  className 
}: CartTabsProps) {
  const [isCreatingCart, setIsCreatingCart] = useState(false);

  const handleNewCart = async () => {
    setIsCreatingCart(true);
    try {
      await onNewCart();
    } finally {
      setIsCreatingCart(false);
    }
  };

  const handleRemoveCart = (cartId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    
    // Solo remover si hay más de 1 carrito
    if (carts.length > 1) {
      onRemoveCart(cartId);
    }
  };

  const getCartDisplayName = (cart: Cart, index: number) => {
    if (cart.customer) {
      const firstName = cart.customer.full_name.split(' ')[0];
      return firstName.length > 8 ? firstName.substring(0, 8) + '...' : firstName;
    }
    return `Carrito ${index + 1}`;
  };

  const getCartIcon = (cart: Cart) => {
    if (cart.status === 'hold') {
      return <Clock className="h-4 w-4" />;
    }
    return <ShoppingCart className="h-4 w-4" />;
  };

  return (
    <div className={`space-y-2 ${className}`}>
      {/* Tabs para múltiples carritos */}
      {carts.length > 0 ? (
        <Tabs value={activeCartId} onValueChange={onCartSelect}>
          <div className="flex items-center justify-between mb-2">
            <ScrollArea className="flex-1">
              <div className="flex space-x-1 w-max">
                <TabsList className="dark:bg-gray-800 light:bg-gray-100 p-1 inline-flex">
                {carts.map((cart, index) => (
                  <TabsTrigger
                    key={cart.id}
                    value={cart.id}
                    className={`
                      relative group flex items-center space-x-2 px-3 py-2
                      ${cart.status === 'hold' 
                        ? 'dark:data-[state=active]:bg-yellow-600/20 dark:data-[state=active]:text-yellow-400 light:data-[state=active]:bg-yellow-100 light:data-[state=active]:text-yellow-700'
                        : 'dark:data-[state=active]:bg-blue-600/20 dark:data-[state=active]:text-blue-400 light:data-[state=active]:bg-blue-100 light:data-[state=active]:text-blue-700'
                      }
                    `}
                  >
                    {getCartIcon(cart)}
                    <span className="text-sm font-medium">
                      {getCartDisplayName(cart, index)}
                    </span>
                    
                    {/* Badge con total */}
                    {cart.total > 0 && (
                      <Badge 
                        variant="secondary" 
                        className="text-xs px-1 py-0 h-5 dark:bg-gray-700 light:bg-gray-200"
                      >
                        {formatCurrency(cart.total, 'COP', 'es-CO').replace(/\$\s?/, '$').replace(/,\d{3}$/, 'k')}
                      </Badge>
                    )}

                    {/* Badge con cantidad de items */}
                    {cart.items.length > 0 && (
                      <Badge 
                        variant={cart.status === 'hold' ? 'outline' : 'default'}
                        className={`
                          text-xs px-1 py-0 h-5 min-w-[20px] flex items-center justify-center
                          ${cart.status === 'hold' 
                            ? 'dark:border-yellow-500 dark:text-yellow-400 light:border-yellow-500 light:text-yellow-600' 
                            : 'dark:bg-blue-600 dark:text-white light:bg-blue-600 light:text-white'
                          }
                        `}
                      >
                        {cart.items.length}
                      </Badge>
                    )}

                    {/* Botón para cerrar carrito */}
                    {carts.length > 1 && (
                      <div
                        role="button"
                        tabIndex={0}
                        className="h-5 w-5 p-0 ml-1 opacity-0 group-hover:opacity-100 transition-opacity dark:hover:bg-red-500/20 dark:hover:text-red-400 light:hover:bg-red-100 light:hover:text-red-600 rounded flex items-center justify-center cursor-pointer"
                        onClick={(e) => handleRemoveCart(cart.id, e)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            handleRemoveCart(cart.id, e as any);
                          }
                        }}
                      >
                        <X className="h-3 w-3" />
                      </div>
                    )}
                  </TabsTrigger>
                ))}
                </TabsList>
              </div>
              <ScrollBar orientation="horizontal" />
            </ScrollArea>

            {/* Botón para agregar nuevo carrito */}
            <Button
              size="sm"
              variant="outline"
              onClick={handleNewCart}
              disabled={isCreatingCart}
              className="ml-2 dark:border-gray-700 dark:hover:bg-gray-800 light:border-gray-300 light:hover:bg-gray-50"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          {/* Contenido de cada carrito */}
          {carts.map((cart) => (
            <TabsContent key={cart.id} value={cart.id} className="mt-0">
              <Card className="dark:bg-gray-800/50 dark:border-gray-700/50 light:bg-gray-50/50 light:border-gray-200">
                <CardContent className="p-3">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center space-x-4">
                      <span className="dark:text-gray-400 light:text-gray-600">
                        Items: <span className="font-medium dark:text-white light:text-gray-900">{cart.items.length}</span>
                      </span>
                      {cart.customer && (
                        <span className="dark:text-gray-400 light:text-gray-600">
                          Cliente: <span className="font-medium dark:text-white light:text-gray-900">{cart.customer.full_name}</span>
                        </span>
                      )}
                      {cart.status === 'hold' && cart.hold_reason && (
                        <span className="dark:text-yellow-400 light:text-yellow-600 text-xs">
                          En espera: {cart.hold_reason}
                        </span>
                      )}
                    </div>
                    <div className="text-right">
                      <div className="font-semibold dark:text-blue-400 light:text-blue-600">
                        {formatCurrency(cart.total)}
                      </div>
                      <div className="text-xs dark:text-gray-400 light:text-gray-600">
                        {new Date(cart.updated_at).toLocaleTimeString()}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          ))}
        </Tabs>
      ) : (
        /* Mensaje cuando no hay carritos */
        <Card className="dark:bg-gray-800 dark:border-gray-700 light:bg-white light:border-gray-200">
          <CardContent className="p-6 text-center">
            <ShoppingCart className="h-12 w-12 mx-auto mb-3 dark:text-gray-400 light:text-gray-500 opacity-50" />
            <h3 className="font-medium mb-2 dark:text-white light:text-gray-900">
              No hay carritos activos
            </h3>
            <p className="text-sm dark:text-gray-400 light:text-gray-600 mb-4">
              Crea un nuevo carrito para comenzar una venta
            </p>
            <Button 
              onClick={handleNewCart}
              disabled={isCreatingCart}
              className="dark:bg-blue-600 dark:hover:bg-blue-700 light:bg-blue-600 light:hover:bg-blue-700"
            >
              <Plus className="h-4 w-4 mr-2" />
              Crear Carrito
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
