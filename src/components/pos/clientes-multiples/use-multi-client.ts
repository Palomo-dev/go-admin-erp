"use client";

import { useState, useEffect, useCallback } from "react";

// Función para validar si un string tiene formato UUID válido
function isValidUUID(id: any): boolean {
  if (!id || typeof id !== 'string') return false;
  
  // Patrón regex para UUID v4
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[4][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidPattern.test(id);
}
import { supabase } from "@/lib/supabase/config";
import { getUserOrganization, getMainBranch } from "@/lib/hooks/useOrganization";

// Interfaces mejoradas basadas en las tablas de Supabase
export interface Product {
  id: string; // UUID en la base de datos
  name: string;
  price: number;
  cost: number;
  category_id?: number; // Integer en la base de datos
  category?: string;
  description?: string;
  sku?: string;
  image_url?: string;
  is_menu_item?: boolean;
  track_stock?: boolean;
  organization_id: number; // Integer en la base de datos
}

export interface Customer {
  id: string; // UUID en la base de datos
  full_name: string;
  email?: string;
  phone?: string;
  notes?: string;
  organization_id: number; // Integer en la base de datos
}

export interface CartItem {
  id: string | number; // Flexible para permitir IDs temporales o UUIDs
  product_id: string; // UUID en la base de datos
  product_name: string;
  quantity: number;
  unit_price: number;
  total: number;
  notes?: string;
}

export interface MultiClientCart {
  id: string; // Siempre usamos UUID como ID
  customer: Customer;
  items: CartItem[];
  active: boolean;
}

export interface CartSummary {
  subtotal: number;
  tax_total: number;
  total: number;
}

// Se eliminó la duplicación de isValidUUID

export function useMultiClient(userId: string | undefined) {
  // Estados
  const [carts, setCarts] = useState<MultiClientCart[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [orgId, setOrgId] = useState<number | null>(null);
  const [branchId, setBranchId] = useState<number | null>(null);
  const [userIdState, setUserId] = useState<string | undefined>(userId);
  
  // Inicialización - Cargar organización y sucursal
  useEffect(() => {
    const getInitialContext = async () => {
      try {
        const session = await supabase.auth.getSession();
        
        if (session?.data?.session?.user) {
          const userId = session.data.session.user.id;
          setUserId(userId);
          
          // Obtener información de la organización del usuario
          const orgData = await getUserOrganization(userId);
          
          console.log('Datos de organización obtenidos:', orgData);
          console.log('Tipos de datos - userId:', typeof userId);
          
          if (orgData && Array.isArray(orgData) && orgData.length > 0) {
            // Tomar la primera organización por defecto
            const firstOrg = orgData[0].organization;
            setOrgId(firstOrg?.id);
            console.log('Organization ID:', firstOrg?.id, 'tipo:', typeof firstOrg?.id);
            
            // Buscar la sucursal principal
            if (firstOrg?.branches && firstOrg.branches.length > 0) {
              const mainBranch = firstOrg.branches.find(b => b.is_main === true) || firstOrg.branches[0];
              setBranchId(mainBranch.id);
              console.log('Branch ID:', mainBranch.id, 'tipo:', typeof mainBranch.id);
            }
            
            // Cargar productos
            await loadProducts(firstOrg?.id);
            
            // Cargar carritos guardados o crear uno inicial
            await loadSavedCarts(firstOrg?.id);
          }
        }
      } catch (error) {
        console.error("Error al inicializar datos:", error);
      } finally {
        setLoading(false);
      }
    };
    
    getInitialContext();
  }, [userIdState]);
  
  // Cargar productos desde Supabase
  const loadProducts = async (organizationId: number) => {
    try {
      // Obtener productos con sus categorías
      const { data: productsData, error } = await supabase
        .from("products")
        .select(`
          id, 
          name, 
          price, 
          cost, 
          description,
          sku,
          image_url,
          track_stock,
          is_menu_item,
          category_id,
          categories (name)
        `)
        .eq("organization_id", organizationId)
        .eq("status", "active");
        
      if (error) throw error;
      
      if (productsData) {
        const formattedProducts = productsData.map(product => ({
          ...product,
          category: product.categories && product.categories[0]?.name || "Sin categoría",
          organization_id: organizationId // Asegurar que organization_id esté presente
        }));
        
        setProducts(formattedProducts as Product[]);
        
        // Extraer categorías únicas
        const uniqueCategories = Array.from(
          new Set(formattedProducts.map(p => p.category))
        );
        setCategories(uniqueCategories);
      }
    } catch (error) {
      console.error("Error al cargar productos:", error);
    }
  };

  // Cargar carritos guardados desde Supabase
  const loadSavedCarts = async (organizationId: number) => {
    try {
      // Debug - Verificar valores y tipos
      console.log('Cargando carritos con params:', {
        organizationId,
        tipoOrganizationId: typeof organizationId,
        userId,
        tipoUserId: typeof userId,
        esUUID: isValidUUID(userId)
      });

      const { data: existingCarts, error } = await supabase
        .from("carts")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("user_id", userId);
      
      if (error) throw error;
      
      if (existingCarts && existingCarts.length > 0) {
        // Transformar datos de JSONB a nuestro formato
        const loadedCarts = await Promise.all(
          existingCarts.map(async (cart) => {
            const cartData = cart.cart_data || {};
            
            // Obtener datos del cliente
            let customer = cartData.customer;
            if (customer?.id && !customer?.full_name) {
              // Validar que el ID del cliente sea un UUID válido
              if (isValidUUID(customer.id)) {
                const { data: customerData } = await supabase
                  .from("customers")
                  .select("*")
                  .eq("id", customer.id)
                  .single();
                
                if (customerData) {
                  customer = customerData;
                }
              } else {
                console.warn("ID de cliente inválido, no es un UUID:", customer.id);
                // Asignar un cliente temporal con información existente
                customer = {
                  ...customer,
                  id: undefined, // Permitirá que se cree un nuevo cliente si se guarda
                  full_name: customer.name || customer.full_name || "Cliente sin nombre"
                };
              }
            }
            
            return {
              id: cart.id,
              customer: customer || { 
                // Generar un ID temporal con formato UUID v4 compatible con Supabase
                id: crypto.randomUUID ? crypto.randomUUID() : '00000000-0000-0000-0000-000000000000', 
                full_name: "Cliente sin nombre",
                organization_id: organizationId // organization_id es de tipo number
              },
              items: cartData.items || [],
              active: false
            };
          })
        );
        
        // Activar el primer carrito
        if (loadedCarts.length > 0) {
          loadedCarts[0].active = true;
        }
        
        setCarts(loadedCarts);
      } else {
        // Crear un carrito inicial si no hay ninguno
        setCarts([{
          id: crypto.randomUUID ? crypto.randomUUID() : '00000000-0000-0000-0000-000000000000',
          customer: { 
            id: crypto.randomUUID ? crypto.randomUUID() : '00000000-0000-0000-0000-000000000000', 
            full_name: "Nuevo Cliente",
            organization_id: organizationId // organization_id es de tipo number
          },
          items: [],
          active: true
        }]);
      }
    } catch (error) {
      // Mejorar el log para depuración
      console.error("Error al cargar carritos guardados:", error);
      console.log("Organization ID recibido:", organizationId);
      console.log("User ID utilizado:", userId);
      
      // Crear un carrito inicial en caso de error
      if (organizationId) {
        setCarts([{
          id: crypto.randomUUID ? crypto.randomUUID() : '00000000-0000-0000-0000-000000000000',
          customer: { 
            id: crypto.randomUUID ? crypto.randomUUID() : '00000000-0000-0000-0000-000000000000', 
            full_name: "Nuevo Cliente", 
            organization_id: organizationId // organization_id es de tipo number
          },
          items: [],
          active: true
        }]);
      }
    }
  };

  // Guardar carritos en Supabase
  const saveAllCarts = async (): Promise<boolean> => {
    if (!orgId || !branchId || !userId || !isValidUUID(userId)) {
      console.error("No se puede guardar sin organización, sucursal o usuario válidos");
      return false;
    }
    
    try {
      const savePromises = carts.map(cart => {
        const cartData = {
          customer: cart.customer,
          items: cart.items
        };
        
        // Para debug
        console.log('Guardando carrito:', {
          cartId: cart.id,
          isUUID: isValidUUID(cart.id),
          orgId,
          branchId,
          userId,
        });
        
        // Usar upsert para crear o actualizar carritos existentes
        return supabase
          .from("carts")
          .upsert({
            id: isValidUUID(cart.id) ? cart.id : undefined,
            organization_id: orgId,        // Debe ser un integer según la estructura BD
            branch_id: branchId,           // Debe ser un integer según la estructura BD
            user_id: userId,               // Debe ser un UUID según la estructura BD
            cart_data: cartData,
            expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // 24 horas
          });
      });
      
      await Promise.all(savePromises);
      return true;
    } catch (error) {
      console.error("Error al guardar carritos:", error);
      return false;
    }
  };

  // Procesar checkout de uno o varios carritos
  const processCheckout = async (cartId?: string) => {
    // Validar que userId sea un UUID válido
    if (!isValidUUID(userId)) {
      console.error("Error: userId no es un UUID válido:", {
        userId,
        isUserIdUUID: isValidUUID(userId)
      });
      
      return { success: false, error: "ID de usuario inválido" };
    }
    
    console.log("Procesando checkout con:", {
      orgId, 
      branchId, 
      userId,
      isUserIdUUID: isValidUUID(userId)
    });
    
    try {
      // Determinar qué carritos procesar
      const cartsToProcess = cartId 
        ? carts.filter(cart => cart.id === cartId)
        : carts;
      
      if (cartsToProcess.length === 0) {
        return { success: false, error: "No hay carritos para procesar" };
      }
      
      // Procesar cada carrito como una venta separada
      const results = await Promise.all(cartsToProcess.map(async (cart) => {
        // 1. Crear encabezado de venta
        const summary = calculateSummary(cart.items);
        
        const { data: salesData, error: salesError } = await supabase
          .from("sales")
          .insert({
            organization_id: orgId,
            branch_id: branchId,
            customer_id: cart.customer.id,
            user_id: userId,
            subtotal: summary.subtotal,
            tax_total: summary.tax_total,
            total: summary.total,
            status: "completed",
            payment_status: "paid",
            sale_date: new Date().toISOString()
          })
          .select()
          .single();
          
        if (salesError || !salesData) {
          throw new Error(`Error al crear venta: ${salesError?.message}`);
        }
        
        const saleId = salesData.id;
        
        // 2. Crear items de venta
        const saleItems = cart.items.map(item => ({
          sale_id: saleId,
          product_id: item.product_id,
          quantity: item.quantity,
          unit_price: item.unit_price,
          total: item.total,
          notes: item.notes || null
        }));
        
        const { error: itemsError } = await supabase
          .from("sale_items")
          .insert(saleItems);
          
        if (itemsError) {
          throw new Error(`Error al crear items de venta: ${itemsError.message}`);
        }
        
        // 3. Eliminar carrito procesado
        await supabase
          .from("carts")
          .delete()
          .eq("id", cart.id);
        
        return {
          success: true,
          saleId,
          customerId: cart.customer.id,
          customerName: cart.customer.full_name
        };
      }));
      
      // 4. Actualizar estado local
      setCarts(prevCarts => 
        prevCarts.filter(cart => !cartsToProcess.some(c => c.id === cart.id))
      );
      
      // Si no quedan carritos, crear uno nuevo
      if (carts.length === cartsToProcess.length) {
        setCarts([{
          id: crypto.randomUUID ? crypto.randomUUID() : '00000000-0000-0000-0000-000000000000',
          customer: { 
            id: crypto.randomUUID ? crypto.randomUUID() : '00000000-0000-0000-0000-000000000000', 
            full_name: "Nuevo Cliente",
            organization_id: orgId 
          },
          items: [],
          active: true
        }]);
      }
      
      return { success: true, results };
      
    } catch (error) {
      console.error("Error al procesar checkout:", error);
      return { success: false, error: String(error) };
    }
  };
  
  // Calcular subtotal, impuestos y total
  const calculateSummary = (items: CartItem[]): CartSummary => {
    const subtotal = items.reduce((sum, item) => sum + item.total, 0);
    const taxRate = 0.16; // 16% IVA
    const tax_total = subtotal * taxRate;
  
    return {
      subtotal,
      tax_total,
      total: subtotal + tax_total
    };
  };

// Funciones para manejar los carritos
const addToCart = (product: Product) => {
  setCarts(currentCarts => 
    currentCarts.map(cart => {
      if (!cart.active) return cart;
      
      // Verificar si el producto ya está en el carrito
      const existingItem = cart.items.find(item => item.product_id === product.id);
      
      if (existingItem) {
        // Incrementar cantidad
        return {
          ...cart,
          items: cart.items.map(item => 
            item.product_id === product.id 
              ? { 
                  ...item, 
                  quantity: item.quantity + 1,
                  total: (item.quantity + 1) * item.unit_price 
                } 
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
              id: crypto.randomUUID ? crypto.randomUUID() : '00000000-0000-0000-0000-000000000000',
              product_id: product.id,
              product_name: product.name,
              quantity: 1,
              unit_price: product.price,
              total: product.price
            }
          ]
        };
      }
    })
  );
};

const increaseQuantity = (itemId: string | number) => {
  setCarts(currentCarts => 
    currentCarts.map(cart => {
      if (!cart.active) return cart;
      
      return {
        ...cart,
        items: cart.items.map(item => 
          item.id === itemId 
            ? { 
                ...item, 
                quantity: item.quantity + 1,
                total: (item.quantity + 1) * item.unit_price 
              } 
            : item
        )
      };
    })
  );
};

const decreaseQuantity = (itemId: string | number) => {
  setCarts(currentCarts => 
    currentCarts.map(cart => {
      if (!cart.active) return cart;
      
      return {
        ...cart,
        items: cart.items.map(item => 
          item.id === itemId && item.quantity > 1
            ? { 
                ...item, 
                quantity: item.quantity - 1,
                total: (item.quantity - 1) * item.unit_price 
              } 
            : item
        ).filter(item => !(item.id === itemId && item.quantity === 1))
      };
    })
  );
};

const removeFromCart = (itemId: string | number) => {
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

const setActiveCart = (cartId: string) => {
  setCarts(currentCarts => 
    currentCarts.map(cart => ({
      ...cart,
      active: cart.id === cartId
    }))
  );
};

const addNewCart = () => {
  // Crear un nuevo carrito con datos por defecto
  const newCart: MultiClientCart = {
    id: crypto.randomUUID ? crypto.randomUUID() : '00000000-0000-0000-0000-000000000000',
    customer: {
      id: crypto.randomUUID ? crypto.randomUUID() : '00000000-0000-0000-0000-000000000000', 
      full_name: "Nuevo Cliente",
      organization_id: orgId as number 
    },
    items: [],
    active: false
  };
  
  setCarts(currentCarts => 
    currentCarts.map(cart => ({
      ...cart,
      active: false
    })).concat(newCart)
  );
};

const removeCart = (cartId: string | number) => {
  // Agregar logs para depurar problemas con tipos de ID
  console.log('Eliminando carrito con ID:', cartId, 'tipo:', typeof cartId);
  
  setCarts(currentCarts => {
    const filtered = currentCarts.filter(cart => cart.id !== cartId);
    
    // Si eliminamos el carrito activo, activar el primero
    if (filtered.length > 0 && !filtered.some(cart => cart.active)) {
      filtered[0].active = true;
    }
    
    return filtered;
  });
};

// Buscar cliente en Supabase
const searchCustomers = async (query: string) => {
  if (!orgId || query.length < 2) return [];
  
  try {
    const { data, error } = await supabase
      .from("customers")
      .select("*")
      .eq("organization_id", orgId)
      .or(`full_name.ilike.%${query}%,email.ilike.%${query}%,phone.ilike.%${query}%`)
      .limit(5);
      
    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error("Error al buscar clientes:", error);
    return [];
  }
};

// Asignar cliente al carrito activo
const assignCustomer = (customer: Customer) => {
  setCarts(currentCarts => 
    currentCarts.map(cart => {
      if (!cart.active) return cart;
      
      return {
        ...cart,
        customer
      };
    })
  );
};

// Crear nuevo cliente en Supabase
const createCustomer = async (customerData: Omit<Customer, 'id' | 'organization_id'>) => {
  if (!orgId) return null;
  
  try {
    // Log para depurar tipos
    console.log('Creando cliente con datos:', {
      ...customerData,
      organization_id: orgId,
      tipoOrgId: typeof orgId
    });
    
    const { data, error } = await supabase
      .from("customers")
      .insert({
        ...customerData,
        organization_id: orgId
      })
      .select()
      .single();
    
    if (error) {
      console.error('Error al crear cliente:', error);
      return null;
    }
    
    return data;
  } catch (error) {
    console.error('Error inesperado al crear cliente:', error);
    return null;
  }
};

  // Se eliminó la duplicación de removeCart, usando la versión de abajo
  // Se eliminó la duplicación de searchCustomers, usando la versión declarada abajo
  // Se eliminó la duplicación de assignCustomer, usando la versión declarada arriba
  // Se eliminó la duplicación de createCustomer, usando la versión declarada arriba

  // Obtener carrito activo
  const activeCart = carts.find(cart => cart.active) || carts[0];

  return {
    carts,
    products,
    categories,
    loading,
    orgId,
    branchId,
    activeCart,
    addToCart,
    increaseQuantity,
    decreaseQuantity,
    removeFromCart,
    setActiveCart,
    addNewCart,
    removeCart,
    saveCarts: saveAllCarts,
    processCheckout,
    searchCustomers,
    assignCustomer,
    createCustomer,
    calculateSummary
  };
}
