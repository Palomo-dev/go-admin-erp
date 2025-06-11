"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import Link from "next/link";

// Interfaces
interface Product {
  id: number;
  name: string;
  price: number;
  category: string;
  image?: string;
}

interface CartItem {
  id: number;
  productId: number;
  productName: string;
  quantity: number;
  price: number;
}

interface Customer {
  id: number;
  name: string;
  email?: string;
  phone?: string;
}

interface Cart {
  id: number;
  customer: Customer;
  items: CartItem[];
  active: boolean;
}

export default function ClientesMultiplesPage() {
  // Estado para búsqueda de productos
  const [search, setSearch] = useState("");

  // Estado para clientes y carritos
  const [carts, setCarts] = useState<Cart[]>([
    {
      id: 1,
      customer: { id: 1, name: "Juan Pérez", email: "juan@ejemplo.com" },
      items: [
        { id: 1, productId: 1, productName: "Camiseta Casual", quantity: 2, price: 24.99 },
        { id: 2, productId: 3, productName: "Calcetines", quantity: 3, price: 5.99 }
      ],
      active: true
    },
    {
      id: 2,
      customer: { id: 2, name: "María González" },
      items: [
        { id: 3, productId: 2, productName: "Pantalón Vaquero", quantity: 1, price: 39.99 }
      ],
      active: false
    }
  ]);

  // Estado para productos (simulados)
  const [products, setProducts] = useState<Product[]>([
    { id: 1, name: "Camiseta Casual", price: 24.99, category: "Ropa", image: "shirt.jpg" },
    { id: 2, name: "Pantalón Vaquero", price: 39.99, category: "Ropa", image: "jeans.jpg" },
    { id: 3, name: "Calcetines", price: 5.99, category: "Accesorios", image: "socks.jpg" },
    { id: 4, name: "Zapatillas Deportivas", price: 59.99, category: "Calzado", image: "shoes.jpg" },
    { id: 5, name: "Gorra", price: 14.99, category: "Accesorios", image: "cap.jpg" },
    { id: 6, name: "Reloj Digital", price: 29.99, category: "Accesorios", image: "watch.jpg" },
    { id: 7, name: "Bufanda", price: 19.99, category: "Accesorios", image: "scarf.jpg" },
    { id: 8, name: "Sudadera", price: 34.99, category: "Ropa", image: "hoodie.jpg" },
  ]);

  // Categorías únicas para pestañas
  const categories = Array.from(new Set(products.map(p => p.category)));

  // Cliente activo
  const activeCart = carts.find(cart => cart.active) || carts[0];

  // Filtrar productos por búsqueda
  const filteredProducts = search.trim() !== ""
    ? products.filter(product => 
        product.name.toLowerCase().includes(search.toLowerCase())
      )
    : products;

  // Funciones para manejar el carrito
  const addToCart = (product: Product) => {
    setCarts(currentCarts => 
      currentCarts.map(cart => {
        if (!cart.active) return cart;
        
        // Verificar si el producto ya está en el carrito
        const existingItem = cart.items.find(item => item.productId === product.id);
        
        if (existingItem) {
          // Incrementar cantidad
          return {
            ...cart,
            items: cart.items.map(item => 
              item.productId === product.id 
                ? { ...item, quantity: item.quantity + 1 } 
                : item
            )
          };
        } else {
          // Agregar nuevo item
          return {
            ...cart,
            items: [
              ...cart.items,
              {
                id: Date.now(),
                productId: product.id,
                productName: product.name,
                quantity: 1,
                price: product.price
              }
            ]
          };
        }
      })
    );
  };

  const increaseQuantity = (itemId: number) => {
    setCarts(currentCarts => 
      currentCarts.map(cart => {
        if (!cart.active) return cart;
        
        return {
          ...cart,
          items: cart.items.map(item => 
            item.id === itemId 
              ? { ...item, quantity: item.quantity + 1 } 
              : item
          )
        };
      })
    );
  };

  const decreaseQuantity = (itemId: number) => {
    setCarts(currentCarts => 
      currentCarts.map(cart => {
        if (!cart.active) return cart;
        
        return {
          ...cart,
          items: cart.items.map(item => 
            item.id === itemId && item.quantity > 1
              ? { ...item, quantity: item.quantity - 1 } 
              : item
          ).filter(item => !(item.id === itemId && item.quantity === 1))
        };
      })
    );
  };

  const removeFromCart = (itemId: number) => {
    setCarts(currentCarts => 
      currentCarts.map(cart => {
        if (!cart.active) return cart;
        
        return {
          ...cart,
          items: cart.items.filter(item => item.id !== itemId)
        };
      })
    );
  };

  const setActiveCart = (cartId: number) => {
    setCarts(currentCarts => 
      currentCarts.map(cart => ({
        ...cart,
        active: cart.id === cartId
      }))
    );
  };

  const addNewCart = () => {
    const newCart: Cart = {
      id: Date.now(),
      customer: { id: Date.now(), name: "Nuevo Cliente" },
      items: [],
      active: true
    };
    
    setCarts(currentCarts => 
      currentCarts.map(cart => ({
        ...cart,
        active: false
      })).concat(newCart)
    );
  };

  const removeCart = (cartId: number) => {
    setCarts(currentCarts => {
      const filtered = currentCarts.filter(cart => cart.id !== cartId);
      
      // Si eliminamos el carrito activo, activar el primero
      if (filtered.length > 0 && !filtered.some(cart => cart.active)) {
        filtered[0].active = true;
      }
      
      return filtered;
    });
  };

  // Calcular total del carrito activo
  const cartTotal = activeCart
    ? activeCart.items.reduce((sum, item) => sum + (item.price * item.quantity), 0)
    : 0;

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
                          <div className="font-medium">{cart.customer.name}</div>
                          <div className="text-sm text-gray-500">
                            {cart.items.length} productos · ${cart.items.reduce((sum, item) => sum + (item.price * item.quantity), 0).toFixed(2)}
                          </div>
                        </div>
                        <div className="flex gap-1">
                          {cart.active && <Badge variant="default">Activo</Badge>}
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              removeCart(cart.id);
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
                onChange={(e) => setSearch(e.target.value)}
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
                      .filter(product => product.category === category)
                      .map((product) => (
                        <div
                          key={product.id}
                          className="flex justify-between items-center border rounded-md p-3 hover:bg-gray-50 cursor-pointer"
                          onClick={() => addToCart(product)}
                        >
                          <div>
                            <div className="font-medium">{product.name}</div>
                            <div className="text-sm text-gray-500">
                              {product.category}
                            </div>
                          </div>
                          <div className="font-medium">
                            ${product.price.toFixed(2)}
                          </div>
                        </div>
                      ))}
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
                Carrito de {activeCart?.customer.name || "Cliente"}
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
                          <div>{item.productName}</div>
                          <div className="text-gray-500">
                            ${item.price.toFixed(2)}
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
                    <span>${cartTotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm mt-1">
                    <span>IVA (16%):</span>
                    <span>${(cartTotal * 0.16).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between font-bold text-lg mt-2">
                    <span>Total:</span>
                    <span>${(cartTotal * 1.16).toFixed(2)}</span>
                  </div>
                </div>
              </div>
            </CardContent>
            <CardFooter>
              <div className="flex w-full gap-2">
                <Button variant="outline" className="flex-1">
                  Guardar
                </Button>
                <Link href="/app/pos/cobro" className="flex-1">
                  <Button className="w-full">
                    Cobrar
                  </Button>
                </Link>
              </div>
            </CardFooter>
          </Card>
        </div>
      </div>
    </div>
  );
}
