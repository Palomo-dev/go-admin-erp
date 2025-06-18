"use client";

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/pos/card';
import { Button } from '@/components/pos/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/pos/tabs';
import { Input } from '@/components/pos/input';
import { Badge } from '@/components/pos/badge';
import Link from 'next/link';
import { Skeleton } from '@/components/pos/skeleton';
import { useToast } from '@/components/pos/use-toast';
import { useMultiClient, Product } from "@/components/pos/clientes-multiples/use-multi-client";
import { useTheme } from 'next-themes';
import { cn } from '@/utils/posUtils';
import { CustomerSelector } from '@/components/pos/clientes-multiples/customer-selector';
import { ProductItem } from '@/components/pos/clientes-multiples/product-item';
import { CartItem } from '@/components/pos/clientes-multiples/cart-item';
import { ClientTab } from '@/components/pos/clientes-multiples/client-tab';
import { supabase, updatePassword } from '@/lib/supabase/config';

// Utilizamos el tipo Product directamente del hook useMultiClient

export default function ClientesMultiplesPage() {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const { toast } = useToast();
  
  // Obtener el ID de usuario de la sesión activa
  const [userId, setUserId] = useState<string | undefined>(undefined);
  
  // Estado para la pestaña de categoría activa - movido al inicio para mantener orden de hooks consistente
  const [activeCategory, setActiveCategory] = useState<string>('all');
  
  useEffect(() => {
    // En un entorno real, esto vendría de la sesión del usuario
    const getUserId = async () => {
      try {
        // Usamos un UUID válido de ejemplo mientras se implementa la autenticación real
        setUserId("ef533638-8ef8-4dd9-8986-a69effbaec83");
      } catch (error) {
        console.error("Error al obtener ID de usuario:", error);
      }
    };
    
    getUserId();
  }, []);
  
  // Usar nuestro hook personalizado para la gestión de clientes múltiples
  const {
    carts,
    activeCart,
    products,
    categories,
    loading,
    addToCart,
    removeFromCart,
    increaseQuantity,
    decreaseQuantity,
    setActiveCart,
    addNewCart,
    removeCart,
    searchCustomers,
    createCustomer,
    assignCustomer,
    saveCarts,
    processCheckout,
    calculateSummary
  } = useMultiClient(userId);
  
  // Estados para búsqueda
  const [search, setSearch] = useState<string>('');
  const filteredProducts = search.trim() ? 
    products.filter(p => p.name.toLowerCase().includes(search.toLowerCase())) : 
    products;
  
  // La búsqueda de productos ya viene del hook useMultiClient

  // Renderizado de producto individual
  const renderProduct = (product: Product) => (
    <ProductItem 
      key={Number(product.id)} 
      id={Number(product.id)}
      name={product.name}
      category={product.category || "Sin categoría"}
      price={product.price}
      image={product.image_url}
      onClick={() => addToCart(product)}
    />
  );

  // La filtración de productos por búsqueda ya viene implementada en el hook useMultiClient
    
  // Manejar guardar carritos
  const handleSaveCarts = async () => {
    try {
      const result = await saveCarts();
      if (result) {
        toast.success("Los carritos se han guardado correctamente");
      }
    } catch (error) {
      console.error("Error al guardar carritos:", error);
      toast.error("No se pudieron guardar los carritos");
    }
  };
  
  // Manejar checkout
  const handleCheckout = async () => {
    if (!activeCart || activeCart.items.length === 0) {
      toast.error("Agrega productos al carrito antes de proceder al cobro");
      return;
    }

    try {
      const result = await processCheckout(activeCart.id);
      if (result && result.success) {
        toast.success("El pago se ha procesado correctamente");
      } else {
        toast.error(result?.error || "Error desconocido al cobrar");
      }
    } catch (error) {
      console.error("Error en checkout:", error);
      toast.error("No se pudo procesar el cobro");
    }
  };
  
  // Manejar eliminación de carrito
  const handleDeleteCart = () => {
    if (activeCart && carts.length > 1) {
      removeCart(activeCart.id);
      toast.success("El carrito se ha eliminado correctamente");
    } else {
      toast.error("No se puede eliminar el último carrito");
    }
  };
  
  // Renderizar loading state
  if (loading) {
    return (
      <div className={cn(
        "container mx-auto p-4",
        isDark ? "text-white" : "text-gray-900"
      )}>
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold">POS - Clientes Múltiples</h1>
            <p className={cn(
              isDark ? "text-gray-300" : "text-gray-600"
            )}>Cargando datos...</p>
          </div>
        </div>
        
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="h-full">
              <CardHeader>
                <Skeleton className="h-8 w-3/4" />
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-16 w-full" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  // Obtener el resumen del carrito activo
  const activeCartSummary = activeCart ? calculateSummary(activeCart.items) : { subtotal: 0, tax_total: 0, total: 0 };

  // Categorías únicas obtenidas de los productos
  const uniqueCategories = Array.from(new Set(products.map(product => product.category || '')));

  // Filtrar productos por categoría y búsqueda
  const filteredByCategory = activeCategory === 'all' ? 
    filteredProducts : 
    filteredProducts.filter((product: Product) => product.category === activeCategory);

  // Handler para cambiar cliente en el carrito activo
  const handleCustomerChange = (customer: any) => {
    if (activeCart) {
      assignCustomer(customer);
    }
  };

  // Handler para crear un nuevo cliente
  const handleCreateCustomer = async (data: any) => {
    try {
      // Llamar a la función del hook para crear cliente
      const newCustomer = await createCustomer(data);
      
      if (newCustomer) {
        toast.success(`Se ha creado el cliente ${data.full_name || data.email}`);
        
        // Asignar al carrito automáticamente
        if (activeCart) {
          assignCustomer(newCustomer);
          toast.success(`El cliente ha sido asignado al carrito`);
        }
        
        return newCustomer;
      }
    } catch (error) {
      console.error("Error al crear cliente:", error);
      toast.error("No se pudo crear el cliente");
    }
  };

  // Handler para búsqueda de clientes
  const handleSearchCustomer = async (query: string) => {
    return await searchCustomers(query);
  };
  
  // Handler para guardar todos los carritos
  const handleSaveCart = async () => {
    try {
      await saveCarts();
      toast.success(`Carritos guardados correctamente`);
    } catch (error) {
      toast.error("No se pudieron guardar los cambios");
    }
  };

  return (
    <div className="container mx-auto p-4">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold">POS - Clientes Múltiples</h1>
          <p className="text-gray-600">Administra varios carritos de compra simultáneamente</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={addNewCart}>
            Nuevo Cliente
          </Button>
          <Link href="/app/pos/cobro">
            <Button variant="default">
              Ir a Cobro
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Panel Izquierdo - Carritos */}
        <div className="lg:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle>Clientes Activos</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {carts.map((cart) => (
                  <Card 
                    key={cart.id}
                    className={`cursor-pointer hover:shadow-md transition-shadow ${
                      cart.active ? 'border-primary' : ''
                    }`}
                    onClick={() => setActiveCart(cart.id)}
                  >
                    <CardContent className="p-4">
                      <div className="flex justify-between items-center">
                        <div>
                          <div className="font-medium">{cart.customer.full_name}</div>
                          <div className="text-sm text-gray-500">
                            {cart.items.length} productos · ${cart.items.reduce((sum, item) => sum + (item.unit_price * item.quantity), 0).toFixed(2)}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {cart.active && <Badge variant="default">Activo</Badge>}
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={(e: React.MouseEvent) => {
                              e.stopPropagation();
                              handleDeleteCart();
                            }}
                          >
                            Eliminar
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
                
                <Button 
                  variant="outline" 
                  className="w-full"
                  onClick={addNewCart}
                >
                  + Agregar Cliente
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Panel Central - Productos */}
        <div className="lg:col-span-1">
          <Card className="h-full">
            <CardHeader>
              <CardTitle>Productos</CardTitle>
                <Input
                type="text"
                placeholder="Buscar productos..."
                value={search}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
              />
            </CardHeader>
            <CardContent>
              <Tabs defaultValue={categories[0]}>
                <TabsList className="w-full overflow-x-auto">
                  {categories.map((category) => (
                    <TabsTrigger key={category} value={category}>
                      {category}
                    </TabsTrigger>
                  ))}
                </TabsList>
                
                {categories.map((category) => (
                  <TabsContent key={category} value={category} className="space-y-3 mt-3">
                    {filteredProducts
                      .filter(product => category === "Todos" ? true : product.category === category)
                      .map(product => (
                        <div
                          key={Number(product.id)}
                          className="flex justify-between items-center border rounded-md p-3 hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer"
                          onClick={() => addToCart(product)}
                        >
                          <div>
                            <div className="font-medium">{product.name}</div>
                            <div className="text-sm text-gray-500 dark:text-gray-400">
                              {product.category}
                            </div>
                          </div>
                          <div className="font-medium">
                            ${product.price.toFixed(2)}
                          </div>
                        </div>
                      ))}
                      {filteredProducts.filter(product => category === "Todos" ? true : product.category === category).length === 0 && (
                        <div className="text-center py-3 text-gray-500 dark:text-gray-400">
                          No hay productos en esta categoría
                        </div>
                      )}
                  </TabsContent>
                ))}
              </Tabs>
            </CardContent>
          </Card>
        </div>

        {/* Panel Derecho - Carrito Activo */}
        <div className="lg:col-span-1">
          <Card className="h-full">
            <CardHeader>
              <CardTitle>
                Carrito de {activeCart?.customer?.full_name || "Cliente"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {activeCart?.items.length === 0 ? (
                  <p className="text-center text-gray-500 py-4">
                    Carrito vacío
                  </p>
                ) : (
                  <div className="space-y-3">
                    {activeCart?.items.map((item) => (
                      <div 
                        key={item.id}
                        className="flex justify-between items-center border-b pb-2"
                      >
                        <div className="flex-grow">
                          <div>{item.product_name}</div>
                          <div className="text-gray-500">
                            ${item.unit_price.toFixed(2)}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => decreaseQuantity(item.id)}
                          >
                            -
                          </Button>
                          <span className="w-8 text-center">
                            {item.quantity}
                          </span>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => increaseQuantity(item.id)}
                          >
                            +
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => removeFromCart(item.id)}
                          >
                            Eliminar
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="border-t pt-4">
                  <div className="flex justify-between font-medium">
                    <span>Subtotal:</span>
                    <span>${activeCartSummary.subtotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm mt-1">
                    <span>IVA (16%):</span>
                    <span>${(activeCartSummary.subtotal * 0.16).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between font-bold text-lg mt-2">
                    <span>Total:</span>
                    <span>${activeCartSummary.total.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            </CardContent>
            <CardFooter>
              <div className="flex w-full gap-2">
                <Button variant="outline" className="flex-1" onClick={handleSaveCart}>
                  Guardar
                </Button>
                <Button className="flex-1" onClick={handleCheckout}>
                  Cobrar
                </Button>
              </div>
            </CardFooter>
          </Card>
        </div>
      </div>
    </div>
  );
}
