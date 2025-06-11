"use client";

import React, { useState, useEffect, useMemo } from "react";
import { Plus, ShoppingCart, User, Search, Tag, X, CreditCard, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/pos/button";
import { Input } from "@/components/pos/input";
import { Badge } from "@/components/pos/badge";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/pos/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/pos/tabs";
import Link from "next/link";
import Image from "next/image";
import { getUserRole, getUserOrganization, supabase } from '@/lib/supabase/config';

// Tipos de datos para trabajar con el módulo POS
type Product = {
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
};

type Category = {
  id: number;
  name: string;
  slug?: string;
  parent_id?: number | null;
  rank?: number;
  organization_id: string;
};

type CartItem = {
  product_id: string;
  product: Product;
  quantity: number;
  unit_price: number;
  notes?: string;
  tax_amount?: number;
  discount_amount?: number;
};

type Cart = {
  id?: string;
  items: CartItem[];
  customer_id?: string;
  customer_name?: string;
  organization_id?: string;
  branch_id?: string;
  user_id?: string;
};

export default function PosPage() {
  // Estado para la sesión, carga y errores
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [userData, setUserData] = useState<any>(null);

  // Estados para gestionar el carrito y búsqueda de productos
  const [cart, setCart] = useState<Cart>({ items: [] });
  const [searchTerm, setSearchTerm] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [filteredProducts, setFilteredProducts] = useState<Product[]>([]);
  const [selectedTab, setSelectedTab] = useState("productos");
  const [cameraActive, setCameraActive] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);

  // Cargar sesión del usuario y productos
  useEffect(() => {
    const loadUserDataAndProducts = async () => {
      try {
        setLoading(true);
        
        // Obtener la sesión actual
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        
        if (sessionError || !session) {
          throw new Error(sessionError?.message || "No se pudo obtener la sesión del usuario");
        }
        
        // Obtener datos de organización usando la función centralizada
        const userOrgData = await getUserOrganization(session.user.id);
        
        if (!userOrgData?.organization) {
          throw new Error("No se pudo obtener la información de la organización");
        }
        
        const organizationId = userOrgData.organization.id;
        
        // Obtener sucursal primaria con filtro por organización
        const { data: branchData, error: branchError } = await supabase
          .from("branches")
          .select("*")
          .eq("organization_id", organizationId)
          .eq("is_primary", true)
          .limit(1)
          .single();
          
        if (branchError) {
          throw new Error(`Error al obtener sucursal: ${branchError.message}`);
        }
        
        // Guardar información de usuario, organización y sucursal
        const userDataObj = {
          user_id: session.user.id,
          organization_id: organizationId,
          branch_id: branchData.id
        };
        
        setUserData(userDataObj);
        
        // Cargar categorías desde Supabase
        const { data: categoriesData, error: categoriesError } = await supabase
          .from("categories")
          .select("id, name, slug, parent_id, rank, organization_id")
          .eq("organization_id", organizationId)
          .order("rank", { ascending: true });
          
        if (categoriesError) {
          console.error("Error al cargar categorías:", categoriesError);
        } else if (categoriesData) {
          setCategories(categoriesData);
        }
        
        // Cargar productos desde Supabase con todos los campos relevantes
        const { data: productsData, error: productsError } = await supabase
          .from("products")
          .select("*")  // Seleccionamos todos los campos para tener la información completa
          .eq("organization_id", organizationId)
          .eq("status", "active");
        
        if (productsError) {
          console.error("Error al cargar productos:", productsError);
          setError("Error al cargar los productos");
        } else if (productsData) {
          // Usamos directamente los datos de Supabase que ya tienen la estructura correcta
          setProducts(productsData as Product[]);
        }
        
        // Intentar cargar carrito guardado desde localStorage
        const savedCart = localStorage.getItem('posCart');
        if (savedCart) {
          try {
            const parsedCart = JSON.parse(savedCart);
            if (parsedCart.items) {
              setCart({ items: parsedCart.items });
            }
            if (parsedCart.customer) {
              // No se utiliza el customer en este componente
            }
          } catch (e) {
            console.error('Error al cargar el carrito guardado:', e);
          }
        }
        
        setLoading(false);
      } catch (err) {
        console.error("Error al cargar datos:", err);
        setError("Error al cargar datos de usuario y productos");
        setLoading(false);
      }
    };
    
    loadUserDataAndProducts();
  }, []);

  // Efecto para filtrar productos según término de búsqueda
  useEffect(() => {
    if (searchTerm.trim() === "") {
      setFilteredProducts(products);
    } else {
      const filtered = products.filter(product => 
        product.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        product.sku?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        product.barcode?.toLowerCase().includes(searchTerm.toLowerCase())
      );
      setFilteredProducts(filtered);
    }
  }, [searchTerm, products]);

  // Función para agregar producto al carrito
  const addToCart = (product: Product) => {
    setCart(currentCart => {
      const existingItemIndex = currentCart.items.findIndex(
        item => item.product_id === product.id
      );

      if (existingItemIndex > -1) {
        // Si el producto ya está en el carrito, incrementa la cantidad
        const updatedItems = [...currentCart.items];
        updatedItems[existingItemIndex].quantity += 1;
        return { ...currentCart, items: updatedItems };
      } else {
        // Si no está en el carrito, agrégalo con cantidad 1
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

  // Funciones para manipular cantidades en el carrito
  const increaseQuantity = (productId: string) => {
    setCart(currentCart => {
      const updatedItems = currentCart.items.map(item => {
        if (item.product_id === productId) {
          return { ...item, quantity: item.quantity + 1 };
        }
        return item;
      });
      return { ...currentCart, items: updatedItems };
    });
  };

  const decreaseQuantity = (productId: string) => {
    setCart(currentCart => {
      const updatedItems = currentCart.items.map(item => {
        if (item.product_id === productId && item.quantity > 1) {
          return { ...item, quantity: item.quantity - 1 };
        }
        return item;
      }).filter(item => item.quantity > 0);
      return { ...currentCart, items: updatedItems };
    });
  };

  const removeFromCart = (productId: string) => {
    setCart(currentCart => {
      const updatedItems = currentCart.items.filter(
        item => item.product_id !== productId
      );
      return { ...currentCart, items: updatedItems };
    });
  };

  // Calcular el total del carrito
  const cartTotal = cart.items.reduce(
    (sum, item) => sum + item.unit_price * item.quantity, 
    0
  );

  // Función para guardar el carrito en Supabase
  const saveCart = async () => {
    if (!userData) {
      setError("No se pudo obtener la información del usuario");
      return;
    }
    
    try {
      const cartData = {
        organization_id: userData.organization_id,
        branch_id: userData.branch_id,
        user_id: userData.user_id,
        cart_data: cart, // Supabase maneja JSONB directamente, no es necesario convertir a string
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // Expira en 24 horas
      };
      
      const { data, error } = await supabase
        .from("carts")
        .insert(cartData)
        .select();
      
      if (error) {
        console.error("Error al guardar carrito:", error);
        setError("Error al guardar el carrito");
        return;
      }
      
      alert("Carrito guardado como ticket pendiente");
      
    } catch (err) {
      console.error("Error al guardar carrito:", err);
      setError("Error al procesar la solicitud");
    }
  };

  // Función para ir a la pantalla de cobro
  const goToCheckout = async () => {
    if (cart.items.length === 0) {
      alert("No hay productos en el carrito");
      return;
    }
    
    try {
      // Guardar el carrito actual en localStorage para recuperarlo en la página de cobro
      localStorage.setItem('posCart', JSON.stringify(cart));
      
      // Redireccionar a la página de cobro
      window.location.href = '/app/pos/cobro';
    } catch (error) {
      console.error('Error al preparar el cobro:', error);
      alert('Ocurrió un error al preparar el cobro');
    }
  };

  // Función para simular activar la cámara para escanear
  const toggleCamera = () => {
    setCameraActive(!cameraActive);
  };

  return (
    <div className="flex flex-col p-2 lg:flex-row lg:p-4 h-[calc(100vh-4rem)]">
      {/* Panel izquierdo: búsqueda y productos */}
      <div className="flex flex-col w-full lg:w-3/5 h-full overflow-hidden pr-0 lg:pr-4">
        <div className="flex items-center space-x-2 mb-4">
          <div className="relative flex-grow">
            <Input
              type="text"
              placeholder="Buscar producto por nombre o código..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
          </div>
          <Button className="h-10 w-10 p-0" onClick={toggleCamera}>
            <Plus className={`h-5 w-5 ${cameraActive ? 'text-primary' : 'text-gray-400'}`} />
          </Button>
        </div>

        {cameraActive && (
          <div className="bg-black h-48 mb-4 flex items-center justify-center text-white text-sm">
            Simulación de escáner de códigos de barras/QR
          </div>
        )}

        <Tabs defaultValue="productos" value={selectedTab} onValueChange={setSelectedTab} className="flex-grow flex flex-col">
          <TabsList className="mb-4 overflow-x-auto">
            <TabsTrigger value="productos">Todos</TabsTrigger>
            {categories.map(category => (
              <TabsTrigger key={category.id} value={`cat-${category.id}`}>
                {category.name}
              </TabsTrigger>
            ))}
          </TabsList>
          
          {/* Pestaña de loading mientras se cargan los productos */}
          {loading && (
            <div className="flex-grow overflow-y-auto flex justify-center items-center p-8">
              <div className="flex flex-col items-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary mb-2" />
                <p className="text-sm text-gray-500">Cargando productos...</p>
              </div>
            </div>
          )}
          
          {/* Pestaña para todos los productos */}
          <TabsContent value="productos" className="flex-grow overflow-y-auto">
            {!loading && filteredProducts.length === 0 ? (
              <div className="flex justify-center items-center h-full p-4">
                <p className="text-gray-500">No se encontraron productos</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {filteredProducts.map((product) => (
                  <Card 
                    key={product.id} 
                    className="cursor-pointer hover:border-primary transition-colors"
                    onClick={() => addToCart(product)}
                  >
                    <div className="relative h-28 w-full overflow-hidden">
                      <div className="absolute inset-0 bg-gray-100 flex items-center justify-center">
                        {product.image_url ? (
                          <img 
                            src={product.image_url} 
                            alt={product.name} 
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <ShoppingCart className="h-12 w-12 text-gray-300" />
                        )}
                      </div>
                    </div>
                    <CardHeader className="p-3 pb-0">
                      <CardTitle className="text-sm truncate">{product.name}</CardTitle>
                    </CardHeader>
                    <CardContent className="p-3 pt-1">
                      <p className="text-xs text-gray-500">{product.sku}</p>
                      {product.description && (
                        <p className="text-xs text-gray-500 truncate">{product.description}</p>
                      )}
                    </CardContent>
                    <CardFooter className="p-3 pt-0 flex justify-between">
                      <p className="font-semibold">${Number(product.price).toFixed(2)}</p>
                      <Button size="sm" variant="ghost">
                        <Plus className="h-4 w-4" />
                      </Button>
                    </CardFooter>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
          
          {/* Pestañas dinámicas para cada categoría */}
          {categories.map(category => (
            <TabsContent key={category.id} value={`cat-${category.id}`} className="flex-grow overflow-y-auto">
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {filteredProducts
                  .filter(p => p.category_id === category.id)
                  .map((product) => (
                    <Card 
                      key={product.id} 
                      className="cursor-pointer hover:border-primary transition-colors"
                      onClick={() => addToCart(product)}
                    >
                      <div className="relative h-28 w-full overflow-hidden">
                        <div className="absolute inset-0 bg-gray-100 flex items-center justify-center">
                          {product.image_url ? (
                            <img 
                              src={product.image_url} 
                              alt={product.name} 
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <ShoppingCart className="h-12 w-12 text-gray-300" />
                          )}
                        </div>
                      </div>
                      <CardHeader className="p-3 pb-0">
                        <CardTitle className="text-sm truncate">{product.name}</CardTitle>
                      </CardHeader>
                      <CardContent className="p-3 pt-1">
                        <p className="text-xs text-gray-500">{product.sku}</p>
                      </CardContent>
                      <CardFooter className="p-3 pt-0 flex justify-between">
                        <p className="font-semibold">${Number(product.price).toFixed(2)}</p>
                        <Button size="sm" variant="ghost">
                          <Plus className="h-4 w-4" />
                        </Button>
                      </CardFooter>
                    </Card>
                  ))}
              </div>
            </TabsContent>
          ))}
        </Tabs>
      </div>
      
      {/* Panel derecho: carrito y acciones */}
      <div className="w-full lg:w-2/5 mt-4 lg:mt-0 flex flex-col h-full overflow-hidden">
        <Card className="h-full flex flex-col">
          <CardHeader className="pb-2">
            <div className="flex justify-between items-center">
              <CardTitle className="text-xl">Carrito</CardTitle>
              <div className="flex space-x-2">
                <Button variant="outline" size="sm">
                  <User className="h-4 w-4 mr-1" />
                  Cliente
                </Button>
                <Button variant="outline" size="sm" onClick={saveCart}>
                  <Plus className="h-4 w-4 mr-1" />
                  En espera
                </Button>
              </div>
            </div>
          </CardHeader>
          
          <CardContent className="flex-grow overflow-y-auto py-0">
            {cart.items.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-gray-400">
                <ShoppingCart className="h-12 w-12 mb-2" />
                <p className="text-sm">El carrito está vacío</p>
              </div>
            ) : (
              <div className="space-y-2">
                {cart.items.map((item) => (
                  <div 
                    key={item.product_id} 
                    className="flex justify-between items-center p-2 border rounded-md"
                  >
                    <div className="flex-grow">
                      <p className="font-medium">{item.product.name}</p>
                      <p className="text-sm text-gray-500">
                        ${item.unit_price.toFixed(2)} x {item.quantity} = ${(item.unit_price * item.quantity).toFixed(2)}
                      </p>
                    </div>
                    <div className="flex items-center space-x-1">
                      <Button 
                        size="icon" 
                        variant="ghost" 
                        className="h-8 w-8" 
                        onClick={() => decreaseQuantity(item.product_id)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                      <span className="w-6 text-center">{item.quantity}</span>
                      <Button 
                        size="icon" 
                        variant="ghost" 
                        className="h-8 w-8" 
                        onClick={() => increaseQuantity(item.product_id)}
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                      <Button 
                        size="icon" 
                        variant="ghost" 
                        className="h-8 w-8 text-red-500" 
                        onClick={() => removeFromCart(item.product_id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
          
          <CardFooter className="flex-col border-t pt-4">
            <div className="w-full flex justify-between text-lg font-bold mb-4">
              <span>Total:</span>
              <span>${cartTotal.toFixed(2)}</span>
            </div>
            <Button 
              className="w-full" 
              size="lg" 
              disabled={cart.items.length === 0}
              onClick={goToCheckout}
            >
              <CreditCard className="mr-2 h-5 w-5" />
              Cobrar
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}