"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/pos/button";
import { Badge } from "@/components/pos/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/pos/card";
import { Input } from "@/components/pos/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/pos/tabs";
import { MoreVertical, Edit, Trash2, CheckCircle } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/pos/dropdown-menu";
import Link from "next/link";
import { supabase, getSession, getUserOrganization } from "@/lib/supabase/config";

// Interfaces
interface Mesa {
  id: number;
  name: string;
  zone: string;
  capacity: number;
  state: string;
  timeOccupied?: string;
  customers?: number;
  server_name?: string;
  session_id?: number;
}

interface Product {
  id: number;
  name: string;
  price: number;
  price_with_taxes?: number;
  tax?: number;
  category_id?: number;
  category_name?: string;
}

interface CartItem {
  id: number;
  product_id: number;
  product_name: string;
  quantity: number;
  price: number;
  status?: "ordered" | "preparing" | "ready" | "delivered";
  notes?: string;
  created_at?: string;
}

export default function MesaDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  // Estado para la mesa
  const [mesa, setMesa] = useState<Mesa | null>(null);
  
  // Estado para productos
  const [productos, setProductos] = useState<Product[]>([]);
  
  // Estado para items del carrito de la mesa
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  
  // Estados para carga y errores
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [organizationId, setOrganizationId] = useState<number | null>(null);
  const [branchId, setBranchId] = useState<number | null>(null);

  // Cargar datos al iniciar
  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        setError(null);
        
        // Obtener sesión del usuario
        const { session, error: sessionError } = await getSession();
        if (sessionError || !session) {
          throw new Error("Error al cargar la sesión del usuario");
        }
        
        // Obtener organización del usuario
        const { data, error: orgError } = await getUserOrganization(session.user.id);
        if (orgError || !data || !data.organizations) {
          throw new Error("Error al cargar la organización del usuario");
        }
        
        // La organización viene como un array, debemos obtener el primer elemento
        const orgId = Array.isArray(data.organizations) && data.organizations.length > 0 
          ? data.organizations[0]?.id 
          : null;
        
        if (!orgId) {
          throw new Error("No se encontró un ID de organización válido");
        }
        
        setOrganizationId(orgId);
        
        // Obtener sucursal principal
        const { data: branchData, error: branchError } = await supabase
          .from("branches")
          .select("id")
          .eq("organization_id", orgId)
          .eq("is_main", true)
          .single();
          
        if (branchError || !branchData) {
          throw new Error("Error al cargar la sucursal principal");
        }
        
        setBranchId(branchData.id);
        
        // Cargar datos de la mesa
        const mesaObj = await loadMesa(orgId, branchData.id, parseInt(params.id));
        setMesa(mesaObj);
        
        // Cargar productos disponibles
        const productosFormateados = await loadProductos(orgId, branchData.id);
        setProductos(productosFormateados);
        
        // Cargar items del carrito para la mesa
        const cartItemsFormateados = await loadCartItems(orgId, branchData.id, parseInt(params.id));
        // Asegurarnos de que siempre tenemos un array para setCartItems
        setCartItems(Array.isArray(cartItemsFormateados) ? cartItemsFormateados : []);
      } catch (error) {
        console.error("Error al cargar datos:", error);
        setError("Error al cargar datos");
      } finally {
        setLoading(false);
      }
    };
    
    loadData();
  }, [params.id]);
  
  // Cargar datos de la mesa
  const loadMesa = async (orgId: number, branchId: number, tableId: number) => {
    try {
      // Obtener información de la mesa
      const { data: tableData, error: tableError } = await supabase
        .from("restaurant_tables")
        .select("*")
        .eq("organization_id", orgId)
        .eq("branch_id", branchId)
        .eq("id", tableId)
        .single();
        
      if (tableError || !tableData) {
        throw new Error("Error al cargar información de la mesa");
      }
      
      // Obtener sesión activa de la mesa si existe
      const { data: sessionData, error: sessionError } = await supabase
        .from("table_sessions")
        .select(`
          id, restaurant_table_id, opened_at, status, customers,
          server_id, profiles:server_id(first_name, last_name)
        `)
        .eq("organization_id", orgId)
        .eq("restaurant_table_id", tableId)
        .is("closed_at", null)
        .maybeSingle();
      
      // Calcular tiempo ocupada si hay sesión activa
      let timeOccupied;
      let serverName;
      
      if (sessionData) {
        // Calcular tiempo ocupado
        if (sessionData.opened_at) {
          const opened = new Date(sessionData.opened_at);
          const now = new Date();
          const diffMs = now.getTime() - opened.getTime();
          const diffMin = Math.round(diffMs / 60000);
          
          if (diffMin < 60) {
            timeOccupied = `${diffMin} min`;
          } else {
            const hours = Math.floor(diffMin / 60);
            const mins = diffMin % 60;
            timeOccupied = `${hours}h ${mins}m`;
          }
        }
        
        // Obtener nombre del mesero con acceso seguro a las propiedades
        try {
          const profile = sessionData?.profiles as Record<string, any> | null;
          if (profile && typeof profile === 'object') {
            const firstName = profile.first_name || '';
            const lastName = profile.last_name || '';
            if (firstName || lastName) {
              serverName = `${firstName} ${lastName}`.trim();
            }
          }
        } catch (error) {
          console.error('Error al obtener nombre del mesero:', error);
        }
      }
      
      // Crear objeto mesa con datos combinados
      const mesaData: Mesa = {
        id: tableData?.id,
        name: tableData?.name,
        zone: tableData.zone || "",
        capacity: tableData.capacity || 0,
        state: sessionData?.status || tableData.state || "free",
        timeOccupied,
        customers: sessionData?.customers || 0,
        server_name: serverName,
        session_id: sessionData?.id
      };
      
      return mesaData;
    } catch (error) {
      console.error("Error al cargar mesa:", error);
      throw error;
    }
  };
  
  // Cargar productos disponibles
  const loadProductos = async (orgId: number, branchId: number) => {
    try {
      // Obtener productos de la organización
      const { data: productsData, error: productsError } = await supabase
        .from("products")
        .select(`
          id, name, price, price_with_taxes, tax,
          categories:category_id (id, name)
        `)
        .eq("organization_id", orgId)
        .eq("active", true)
        .order("name");
        
      if (productsError) {
        throw new Error("Error al cargar productos");
      }
      
      // Transformar productos al formato requerido con acceso seguro a propiedades
      const productosFormateados: Product[] = Array.isArray(productsData) ? productsData.map(item => {
        // Usar type assertion para evitar errores de tipo never
        const product = item as any;
        return {
          id: product.id || 0,
          name: product.name || 'Producto sin nombre',
          price: typeof product.price === 'number' ? product.price : 0,
          price_with_taxes: product.price_with_taxes || product.price || 0,
          tax: product.tax || 0,
          category_id: product.categories && typeof product.categories === 'object' ? product.categories.id : undefined,
          category_name: product.categories && typeof product.categories === 'object' ? product.categories.name : 'Sin categoría'
        };
      }) : [];
      
      return productosFormateados;
    } catch (error) {
      console.error("Error al cargar productos:", error);
      throw error;
    }
  };
  
  // Cargar items del carrito para la mesa
  const loadCartItems = async (orgId: number, branchId: number, tableId: number) => {
    try {
      // Buscar sesión activa para esta mesa
      const { data: sessionData, error: sessionError } = await supabase
        .from("table_sessions")
        .select("id, sale_id")
        .eq("organization_id", orgId)
        .eq("restaurant_table_id", tableId)
        .is("closed_at", null)
        .maybeSingle();
        
      if (sessionError) {
        throw new Error("Error al verificar sesión de mesa");
      }
      
      // Si no hay sesión activa o no hay sale_id asociada, no hay items
      if (!sessionData?.id || !sessionData?.sale_id) {
        return [];
      }
      
      // Buscar items de pedido para esta venta asociada a la sesión
      const { data: saleItems, error: itemsError } = await supabase
        .from("sale_items")
        .select(`
          id, product_id, quantity, unit_price, total, notes, created_at,
          products:product_id (name)
        `)
        .eq("sale_id", sessionData.sale_id);
        
      if (itemsError) {
        throw new Error("Error al cargar items de pedido");
      }
      
      // Transformar a formato CartItem con acceso seguro a propiedades
      const itemsFormateados: CartItem[] = Array.isArray(saleItems) ? saleItems.map(item => {
        // Usar type assertion para evitar errores de tipo
        const saleItem = item as any;
        
        // Procesar campo products que viene de la consulta JOIN
        let productName = "Producto desconocido";
        if (saleItem.products) {
          // Verificar el tipo concreto de datos que recibimos
          if (typeof saleItem.products === 'object' && !Array.isArray(saleItem.products) && saleItem.products !== null) {
            // Es un objeto único
            productName = saleItem.products.name || "Producto desconocido";
          } else if (Array.isArray(saleItem.products) && saleItem.products.length > 0) {
            // Es un array de objetos
            const firstProduct = saleItem.products[0] as {name?: string};
            productName = firstProduct && firstProduct.name ? firstProduct.name : "Producto desconocido";
          }
        }
        
        // Procesar campo notes que es JSONB
        let itemNotes = '';
        if (saleItem.notes) {
          if (typeof saleItem.notes === 'string') {
            itemNotes = saleItem.notes;
          } else if (typeof saleItem.notes === 'object') {
            itemNotes = saleItem.notes.text || '';
          }
        }
        
        return {
          id: saleItem.id || 0,
          product_id: saleItem.product_id || 0,
          product_name: productName,
          quantity: typeof saleItem.quantity === 'number' || typeof saleItem.quantity === 'string' ? Number(saleItem.quantity) : 1,
          price: typeof saleItem.unit_price === 'number' || typeof saleItem.unit_price === 'string' ? Number(saleItem.unit_price) : 0,
          notes: itemNotes,
          status: "ordered" as "ordered" | "preparing" | "ready" | "delivered", // El estado se maneja diferente, por defecto usamos ordered
          created_at: saleItem.created_at || new Date().toISOString()
        };
      }) : [];
      
      return itemsFormateados;
    } catch (error) {
      console.error("Error al cargar items del pedido:", error);
      return [];
    }
  };

  // Estado para búsqueda de productos
  const [search, setSearch] = useState("");
  const [filteredProducts, setFilteredProducts] = useState<Product[]>([]);

  // Verificar si la mesa está cargada para evitar errores de referencia nula
  if (loading) {
    return (
      <div className="container mx-auto p-4 flex justify-center items-center h-screen">
        <div className="text-center">
          <p className="mb-4">Cargando información de la mesa...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto p-4 flex justify-center items-center h-screen">
        <div className="text-center">
          <h2 className="text-xl font-bold mb-2">Error</h2>
          <p className="mb-4">{error}</p>
          <Link href="/app/pos/mesas">
            <Button>Volver a Mesas</Button>
          </Link>
        </div>
      </div>
    );
  }

  // Filtrar productos al escribir
  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    const searchTerm = e.target.value;
    setSearch(searchTerm);
    
    if (searchTerm.trim() === "") {
      setFilteredProducts([]);
    } else {
      const filtered = productos.filter(product => 
        product.name.toLowerCase().includes(searchTerm.toLowerCase())
      );
      setFilteredProducts(filtered);
    }
  };

  // Guardar productos en Supabase
  const saveProductToSupabase = async (product: Product, quantity: number, existingItemId?: number) => {
    try {
      if (!mesa?.session_id || !organizationId || !branchId) {
        throw new Error("No hay sesión activa para esta mesa");
      }
      
      // Buscar el ID de la venta asociada a esta sesión
      const { data: sessionData, error: sessionError } = await supabase
        .from("table_sessions")
        .select("sale_id")
        .eq("id", mesa.session_id)
        .single();
        
      if (sessionError || !sessionData || !sessionData.sale_id) {
        throw new Error("No se encontró la venta asociada a esta mesa");
      }
      
      const saleId = sessionData.sale_id;
      
      // Si es un item existente, actualizarlo
      if (existingItemId) {
        const { error } = await supabase
          .from("sale_items")
          .update({
            quantity,
            total: product.price * quantity,
            updated_at: new Date().toISOString()
          })
          .eq("id", existingItemId);
          
        if (error) {
          throw error;
        }
      } else {
        // Crear nuevo item
        const { error } = await supabase
          .from("sale_items")
          .insert({
            organization_id: organizationId,
            branch_id: branchId,
            sale_id: saleId,
            product_id: product.id,
            quantity: quantity,
            unit_price: product.price,
            total: product.price * quantity,
            status: "ordered",
            notes: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          });
          
        if (error) {
          throw error;
        }
      }
      
      // Recargar items después de guardar
      const updatedItems = await loadCartItems(
        organizationId as number, 
        branchId as number, 
        parseInt(params.id)
      );
      setCartItems(updatedItems);
      
      return true;
    } catch (error) {
      console.error("Error al guardar producto en Supabase:", error);
      setError("No se pudo guardar el producto");
      return false;
    }
  };
  
  // Agregar producto al carrito
  const addToCart = async (product: Product) => {
    // Verificar si el producto ya está en el carrito
    const existingItem = cartItems.find(item => item.product_id === product.id);
    
    if (existingItem) {
      const newQuantity = existingItem.quantity + 1;
      
      // Actualizar en Supabase primero
      const saved = await saveProductToSupabase(product, newQuantity, existingItem.id);
      
      if (saved) {
        // Actualizar el estado local
        setCartItems(cartItems.map(item => 
          item.product_id === product.id 
            ? { ...item, quantity: newQuantity } 
            : item
        ));
      }
    } else {
      // Guardar nuevo producto en Supabase primero
      const saved = await saveProductToSupabase(product, 1);
      
      if (saved) {
        // No necesitamos actualizar manualmente el estado local porque
        // la función saveProductToSupabase ya recarga los items actualizados
      }
    }
    
    // Limpiar búsqueda después de agregar
    setSearch("");
    setFilteredProducts([]);
  };
  
  // Eliminar producto del carrito
  const removeFromCart = async (itemId: number) => {
    try {
      if (!organizationId || !branchId) {
        throw new Error("No hay información de organización o sucursal");
      }
      
      // Eliminar el item de Supabase
      const { error } = await supabase
        .from("sale_items")
        .delete()
        .eq("id", itemId);
        
      if (error) {
        throw error;
      }
      
      // Actualizar estado local eliminando el item
      setCartItems(cartItems.filter(item => item.id !== itemId));
      
      return true;
    } catch (error) {
      console.error("Error al eliminar producto del carrito:", error);
      setError("No se pudo eliminar el producto");
      return false;
    }
  };
  
  // Enviar pedido a cocina
  const sendToKitchen = async () => {
    try {
      if (!mesa?.session_id || !organizationId || !branchId || cartItems.length === 0) {
        throw new Error("No hay items para enviar a cocina");
      }
      
      // Buscar el ID de la venta asociada a esta sesión
      const { data: sessionData, error: sessionError } = await supabase
        .from("table_sessions")
        .select("sale_id")
        .eq("id", mesa.session_id)
        .single();
        
      if (sessionError || !sessionData || !sessionData.sale_id) {
        throw new Error("No se encontró la venta asociada a esta mesa");
      }
      
      // Actualizar todos los items con estado 'ordered' a 'preparing'
      const { error } = await supabase
        .from("sale_items")
        .update({ 
          status: "preparing",
          updated_at: new Date().toISOString() 
        })
        .eq("sale_id", sessionData.sale_id)
        .eq("status", "ordered");
      
      if (error) {
        throw error;
      }
      
      // Recargar items para obtener estados actualizados
      const updatedItems = await loadCartItems(
        organizationId as number, 
        branchId as number, 
        parseInt(params.id)
      );
      setCartItems(updatedItems);
      
      return true;
    } catch (error) {
      console.error("Error al enviar pedido a cocina:", error);
      setError("No se pudo enviar el pedido a cocina");
      return false;
    }
  };

  // Marcar pedido como entregado
  const markAsDelivered = async (itemId: number) => {
    try {
      // Actualizar el estado del ítem a 'delivered'
      const { error } = await supabase
        .from("sale_items")
        .update({ 
          status: "delivered",
          updated_at: new Date().toISOString() 
        })
        .eq("id", itemId);
      
      if (error) {
        throw error;
      }
      
      // Actualizar estado local
      setCartItems(cartItems.map(item => 
        item.id === itemId ? {...item, status: "delivered"} : item
      ));
      
      return true;
    } catch (error) {
      console.error("Error al marcar pedido como entregado:", error);
      setError("No se pudo actualizar el estado del pedido");
      return false;
    }
  };

  // Calcular total con acceso seguro a propiedades
  const total = Array.isArray(cartItems) ? cartItems.reduce(
    (sum, item) => sum + (typeof item.price === 'number' ? item.price : 0) * (typeof item.quantity === 'number' ? item.quantity : 0), 
    0
  ) : 0;

  // Función para mostrar estado del pedido
  const getStatusBadge = (status: string) => {
    switch (status) {
      case "ordered":
        return <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-700 dark:text-yellow-100">Ordenado</Badge>;
      case "preparing":
        return <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-700 dark:text-blue-100">Preparando</Badge>;
      case "ready":
        return <Badge className="bg-green-100 text-green-800 dark:bg-green-700 dark:text-green-100">Listo</Badge>;
      case "delivered":
        return <Badge>Entregado</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  return (
    <div className="container mx-auto p-4">
      <div className="flex justify-between items-center mb-6">
        <div>
          <Link href="/app/pos/mesas">
            <Button className="border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground h-8 rounded-md px-3 text-xs mb-2">
              ← Volver a Mesas
            </Button>
          </Link>
          <h1 className="text-2xl font-bold">Mesa {mesa?.name}</h1>
          <div className="flex gap-2 items-center mt-1">
            <Badge className={mesa?.state === "occupied" ? 
              "border-transparent bg-primary text-primary-foreground shadow hover:bg-primary/80" : 
              "border-transparent bg-green-100 text-green-800 dark:bg-green-700 dark:text-green-100"}>
              {mesa?.state === "occupied" ? "Ocupada" : "Libre"}
            </Badge>
            {mesa?.timeOccupied && mesa?.state === "occupied" && (
              <span className="text-sm text-gray-500">
                {mesa.timeOccupied}
              </span>
            )}
          </div>
        </div>
        <div className="text-right">
          <Button className="border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground mb-2">
            Cambiar Mesa
          </Button>
          <div className="text-sm">
            <div>Comensales: {mesa?.customers || 0}</div>
            <div>Mesero: {mesa?.server_name || 'No asignado'}</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Panel Izquierdo - Pedido Actual */}
        <div>
          <Card>
            <CardHeader>
              <CardTitle>Pedido Actual</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {cartItems.length === 0 ? (
                  <p className="text-center text-gray-500 py-4">
                    No hay productos en el pedido
                  </p>
                ) : (
                  <div className="space-y-2">
                    {Array.isArray(cartItems) && cartItems.length > 0 ? cartItems.map((item) => (
                      <div 
                        key={item.id || Math.random()} 
                        className="flex justify-between items-center border-b pb-2"
                      >
                        <div>
                          <div className="font-medium">{item.product_name || 'Producto sin nombre'}</div>
                          <div className="flex gap-3 items-center mt-1">
                            <span className="text-sm">
                              {typeof item.quantity === 'number' ? item.quantity : 1} x ${typeof item.price === 'number' ? item.price.toFixed(2) : '0.00'}
                            </span>
                            {getStatusBadge(item.status || 'ordered')}
                          </div>
                          {item.notes && (
                            <div className="text-xs text-gray-500 mt-1">
                              Nota: {item.notes}
                            </div>
                          )}
                        </div>
                        <div className="text-right">
                          <div className="font-medium">
                            ${typeof item.quantity === 'number' && typeof item.price === 'number' ? (item.quantity * item.price).toFixed(2) : '0.00'}
                          </div>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button className="h-8 rounded-md px-2 text-xs border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground">
                                <MoreVertical className="h-4 w-4" />
                                Acciones
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem className="cursor-pointer flex items-center gap-2" onClick={() => console.log("Editar", item.id)}>
                                <Edit className="h-4 w-4" /> Editar
                              </DropdownMenuItem>
                              <DropdownMenuItem className="cursor-pointer flex items-center gap-2 text-red-600" onClick={() => removeFromCart(item.id)}>
                                <Trash2 className="h-4 w-4" /> Eliminar
                              </DropdownMenuItem>
                              {item.status === 'preparing' && (
                                <DropdownMenuItem 
                                  className="cursor-pointer flex items-center gap-2 text-green-600"
                                  onClick={() => markAsDelivered(item.id)}
                                >
                                  <CheckCircle className="h-4 w-4" /> Marcar como entregado
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                    )) : null}
                  </div>
                )}

                <div className="border-t pt-4">
                  <div className="flex justify-between font-medium">
                    <span>Subtotal:</span>
                    <span>${total.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm mt-1">
                    <span>IVA (16%):</span>
                    <span>${(total * 0.16).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between font-bold text-lg mt-2">
                    <span>Total:</span>
                    <span>${(total * 1.16).toFixed(2)}</span>
                  </div>
                </div>

                <div className="flex gap-2 pt-4">
                  <Button 
                    className="flex-1 bg-primary text-primary-foreground shadow hover:bg-primary/90"
                    onClick={sendToKitchen}
                  >
                    Enviar a Cocina
                  </Button>
                  <Button className="flex-1 border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground">
                    Dividir Cuenta
                  </Button>
                  <Link href={`/app/pos/cobro?mesa=${params.id}`} className="flex-1">
                    <Button className="w-full bg-primary text-primary-foreground shadow hover:bg-primary/90">
                      Cobrar
                    </Button>
                  </Link>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Panel Derecho - Agregar Productos */}
        <div>
          <Card>
            <CardHeader>
              <CardTitle>Agregar Productos</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <Input
                  type="text"
                  placeholder="Buscar productos..."
                  value={search}
                  onChange={handleSearch}
                />

                {/* Resultados de la búsqueda */}
                {search.trim() !== "" && (
                  <div className="border rounded-md overflow-hidden">
                    {filteredProducts.length === 0 ? (
                      <div className="p-4 text-center text-gray-500">
                        No se encontraron productos
                      </div>
                    ) : (
                      <div className="divide-y">
                        {Array.isArray(filteredProducts) && filteredProducts.length > 0 ? filteredProducts.map((product) => (
                          <div
                            key={product.id || Math.random()}
                            className="p-3 flex justify-between items-center hover:bg-gray-50 cursor-pointer"
                            onClick={() => addToCart(product)}
                          >
                            <div>
                              <div className="font-medium">{product.name || 'Producto sin nombre'}</div>
                              <div className="text-sm text-gray-500">
                                {product.category_name || 'Sin categoría'}
                              </div>
                            </div>
                            <div className="font-medium">
                              ${typeof product.price === 'number' ? product.price.toFixed(2) : '0.00'}
                            </div>
                          </div>
                        )) : null}
                      </div>
                    )}
                  </div>
                )}

                {/* Categorías de productos más usados */}
                <div className="space-y-4">
                  <h3 className="font-medium">Productos frecuentes</h3>
                  
                  <div className="grid grid-cols-2 gap-2">
                    {Array.isArray(productos) && productos.length > 0 ? productos.slice(0, 10).map((product) => (
                      <div
                        key={product.id || Math.random()}
                        className="border rounded-md p-3 hover:bg-gray-50 cursor-pointer"
                        onClick={() => addToCart(product)}
                      >
                        <div className="font-medium">{product.name || 'Producto sin nombre'}</div>
                        <div className="flex justify-between items-center mt-1">
                          <span className="text-sm text-gray-500">
                            {product.category_name || 'Sin categoría'}
                          </span>
                          <span className="font-medium">
                            ${typeof product.price === 'number' ? product.price.toFixed(2) : '0.00'}
                          </span>
                        </div>
                      </div>
                    )) : (
                      <div className="text-center p-4 text-gray-500">No hay productos disponibles</div>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
