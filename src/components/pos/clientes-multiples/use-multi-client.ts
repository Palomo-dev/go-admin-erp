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
interface Product {
  id: string;
  name: string;
  price: number;
  cost: number;
  category_id?: number;
  category?: string;
  description?: string;
  sku?: string;
  image_url?: string;
  is_menu_item?: boolean;
  track_stock?: boolean;
  organization_id: number;
}

interface Customer {
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
  const [orgUuid, setOrgUuid] = useState<string | null>(null);
  const [branchUuid, setBranchUuid] = useState<string | null>(null);
  const [userIdState, setUserId] = useState<string | undefined>(userId);
  
  // Inicialización - Cargar organización y sucursal
  useEffect(() => {
    const getInitialContext = async () => {
      try {
        const session = await supabase.auth.getSession();
        
        if (session?.data?.session?.user) {
          const userId = session.data.session.user.id;
          // Asignar userId al estado local
          setUserId(userId);
          
          // Obtener información de la organización del usuario
          const { data: orgData, error: orgError } = await getUserOrganization(userId);
          
          console.log('Datos de organización obtenidos:', { data: orgData, error: orgError });
          console.log('Tipos de datos - userId:', typeof userId);
          
          if (orgError) {
            console.error('Error al obtener la organización:', orgError);
            // Manejar el error apropiadamente
            return;
          }
          
          if (orgData && Array.isArray(orgData) && orgData.length > 0) {
            // Tomar la primera organización por defecto
            const firstOrg = orgData[0].organization;
            setOrgId(firstOrg?.id);
            // Guardar el UUID de la organización
            setOrgUuid(firstOrg?.uuid || null);
            console.log('Organization ID:', firstOrg?.id, 'tipo:', typeof firstOrg?.id);
            console.log('Organization UUID:', firstOrg?.uuid, 'tipo:', typeof firstOrg?.uuid);
            
            // Buscar la sucursal principal
            if (firstOrg?.branches && firstOrg.branches.length > 0) {
              const mainBranch = firstOrg.branches.find(b => b.is_main === true) || firstOrg.branches[0];
              setBranchId(mainBranch.id);
              // Las sucursales no tienen UUID, según lo que vimos previamente
              console.log('Branch ID:', mainBranch.id, 'tipo:', typeof mainBranch.id);
            }
            
            // Cargar productos
            await loadProducts(firstOrg?.id);
          }
        }
      } catch (error) {
        console.error("Error al inicializar datos:", error);
      } finally {
        setLoading(false);
      }
    };
    
    getInitialContext();
  }, []);
  
  // Efecto separado para cargar carritos cuando tengamos userIdState y orgUuid
  useEffect(() => {
    const loadCartsWhenReady = async () => {
      if (userIdState && orgUuid && isValidUUID(userIdState) && isValidUUID(orgUuid)) {
        console.log('Intentando cargar carritos con userIdState:', userIdState);
        console.log('y orgUuid:', orgUuid);
        
        // Evitar referencia circular al separar esta lógica
        try {
          const currentUserId = userIdState;
          if (!currentUserId || !isValidUUID(currentUserId)) {
            console.error("No se puede cargar carritos sin un user_id válido");
            return;
          }
          const { data: existingCarts, error } = await supabase
            .from("carts")
            .select("*")
            .eq("organization_id", orgUuid)
            .eq("user_id", currentUserId);

          if (error) {
            console.error("Error al cargar carritos:", error);
            return;
          }

          if (existingCarts && existingCarts.length > 0) {
            console.log("Carritos cargados:", existingCarts.length);
            const loadedCarts = existingCarts.map((cart: any) => ({
              id: cart.id,
              customer: {
                id: cart.customer_id || "",
                full_name: cart.customer_name || "Cliente sin nombre",
                organization_id: orgId || 0
              },
              items: cart.items || [],
              active: cart.active || false
            }));
            setCarts(loadedCarts);
          } else {
            console.log("No se encontraron carritos guardados");
            setCarts([]);
          }
        } catch (loadError) {
          console.error("Error al procesar carritos:", loadError);
        }
      }
    };
    
    loadCartsWhenReady();
  }, [userIdState, orgUuid, orgId, isValidUUID]);
  
  // Cargar productos desde Supabase
  const loadProducts = async (organizationId: number) => {
    try {
      // Obtener productos
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
          category_id
        `)
        .eq("organization_id", organizationId)
        .eq("status", "active");
        
      if (error) throw error;
      
      // Obtener todas las categorías
      const { data: categoriesData, error: categoriesError } = await supabase
        .from("categories")
        .select("id, name")
        .eq("organization_id", organizationId);
        
      if (categoriesError) {
        console.error("Error al cargar categorías:", categoriesError);
      }
      
      // Crear mapa de categorías para buscar por ID
      const categoriesMap: Record<number, string> = {};
      if (categoriesData) {
        categoriesData.forEach((cat) => {
          categoriesMap[cat.id] = cat.name;
        });
      }
      
      if (productsData) {
        // Formatear productos con sus categorías
        const formattedProducts = productsData.map(product => ({
          ...product,
          // Asignar nombre de categoría desde el mapa o "Sin categoría" si no existe
          category: product.category_id ? categoriesMap[product.category_id] || "Sin categoría" : "Sin categoría",
          organization_id: organizationId // Asegurar que organization_id esté presente
        }));
        
        setProducts(formattedProducts as Product[]);
        
        // Extraer categorías únicas
        const uniqueCategories = Array.from(
          new Set(formattedProducts.map(p => p.category))
        );
        
        // Añadir "Todos" al principio y asegurarse que "Sin categoría" esté después
        const finalCategories = ["Todos"];
        
        // Añadir "Sin categoría" si existe o si hay productos sin categoría
        if (uniqueCategories.includes("Sin categoría") || formattedProducts.some(p => !p.category_id)) {
          finalCategories.push("Sin categoría");
        }
        
        // Añadir el resto de categorías
        uniqueCategories.forEach(category => {
          if (category !== "Sin categoría") {
            finalCategories.push(category);
          }
        });
        
        console.log("Categorías cargadas:", finalCategories);
        setCategories(finalCategories);
      }
    } catch (error) {
      console.error("Error al cargar productos:", error);
    }
  };
  
  // Cargar carritos guardados desde Supabase
  const loadSavedCarts = async (organizationUuid: string): Promise<void> => {
    try {
      const currentUserId = userIdState;
      // Debug para errores de UUID
      console.log("Debug loadSavedCarts:", { 
        orgUuid: organizationUuid, 
        esUUIDOrg: isValidUUID(organizationUuid),
        userIdState: currentUserId, 
        esUUIDUser: currentUserId ? isValidUUID(currentUserId) : false
      });
      
      // Si no hay userId válido, no podemos consultar
      if (!currentUserId || !isValidUUID(currentUserId)) {
        console.error("No se puede cargar carritos sin un user_id válido");
        return; // Salir de la función sin consultar
      }

      const { data: existingCarts, error } = await supabase
        .from("carts")
        .select("*")
        .eq("organization_id", organizationUuid)
        .eq("user_id", currentUserId);
      
      if (error) throw error;
      
      if (existingCarts && existingCarts.length > 0) {
        console.log("Carritos cargados:", existingCarts.length);
        const loadedCarts = existingCarts.map((cart: any) => ({
          id: cart.id,
          customer: {
            id: cart.customer_id || "",
            full_name: cart.customer_name || "Cliente sin nombre",
            organization_id: orgId || 0
          },
          items: cart.items || [],
          active: cart.active || false
        }));
        setCarts(loadedCarts);
      } else {
        console.log("No se encontraron carritos guardados");
        // Crear un carrito inicial si no hay ninguno
        setCarts([{
          id: crypto.randomUUID ? crypto.randomUUID() : '00000000-0000-0000-0000-000000000000',
          customer: { 
            id: crypto.randomUUID ? crypto.randomUUID() : '00000000-0000-0000-0000-000000000000', 
            full_name: "Nuevo Cliente",
            organization_id: orgId || 0 // Usamos el ID numérico para el objeto customer
          },
          items: [],
          active: true
        }]);
      }
    } catch (error) {
      // Mejorar el log para depuración
      console.error("Error al cargar carritos guardados:", error);
      console.log("Organization UUID recibido:", organizationUuid);
      console.log("User ID utilizado:", userIdState);
      
      // Crear un carrito inicial en caso de error
      if (orgId) {
        setCarts([{
          id: crypto.randomUUID ? crypto.randomUUID() : '00000000-0000-0000-0000-000000000000',
          customer: { 
            id: crypto.randomUUID ? crypto.randomUUID() : '00000000-0000-0000-0000-000000000000', 
            full_name: "Nuevo Cliente", 
            organization_id: orgId || 0 // Usamos el ID numérico para el objeto customer
          },
          items: [],
          active: true
        }]);
      }
    }
  };

  // Guardar carritos en Supabase
  const saveAllCarts = async (): Promise<boolean> => {
    // Usar userIdState que mantenemos en el estado de React
    const currentUserId = userIdState;
    
    if (!orgUuid || !currentUserId || !isValidUUID(currentUserId) || !isValidUUID(orgUuid)) {
      console.error("No se puede guardar sin organización UUID o usuario UUID válidos");
      console.log("Valores actuales:", {
        orgUuid,
        esOrgUuidValido: orgUuid ? isValidUUID(orgUuid) : false,
        userIdState: currentUserId,
        esUserIdValido: currentUserId ? isValidUUID(currentUserId) : false
      });
      return false;
    }
    
    try {
      const savePromises = carts.map((cart: MultiClientCart) => {
        const cartData = {
          customer: cart.customer,
          items: cart.items
        };
        
        // Para debug
        console.log('Guardando carrito:', {
          cartId: cart.id,
          isUUID: isValidUUID(cart.id),
          orgId,
          orgUuid,
          userIdState: currentUserId,
        });
        
        // Usar upsert para crear o actualizar carritos existentes
        return supabase
          .from("carts")
          .upsert({
            id: isValidUUID(cart.id) ? cart.id : undefined,
            organization_id: orgUuid,      // Debe ser un UUID según la estructura BD
            user_id: currentUserId,        // Debe ser un UUID según la estructura BD
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
    // Validar que userIdState sea un UUID válido
    const currentUserId = userIdState;
    
    if (!currentUserId || !isValidUUID(currentUserId)) {
      console.error("Error: userIdState no es un UUID válido:", {
        userIdState: currentUserId,
        isUserIdUUID: currentUserId ? isValidUUID(currentUserId) : false
      });
      
      return { success: false, error: "ID de usuario inválido" };
    }
    
    console.log("Procesando checkout con:", {
      orgId, 
      orgUuid,
      userIdState: currentUserId,
      isUserIdUUID: isValidUUID(currentUserId),
      isOrgUuidValid: orgUuid ? isValidUUID(orgUuid) : false
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
      const results = await Promise.all(cartsToProcess.map(async (cart: MultiClientCart) => {
        // 1. Crear encabezado de venta
        const summary = calculateSummary(cart.items);
        
        const { data: salesData, error: salesError } = await supabase
          .from("sales")
          .insert({
            organization_id: orgUuid, // Usar UUID en lugar de ID numérico
            customer_id: cart.customer.id,
            user_id: currentUserId, // Usar userIdState (guardado en currentUserId)
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
        const saleItems = cart.items.map((item: CartItem) => ({
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
      setCarts((prevCarts: MultiClientCart[]) => 
        prevCarts.filter((cart: MultiClientCart) => !cartsToProcess.some((c: MultiClientCart) => c.id === cart.id))
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
const addToCart = (product: Product): void => {
  setCarts((currentCarts: MultiClientCart[]) => 
    currentCarts.map((cart: MultiClientCart) => {
      if (!cart.active) return cart;
      
      // Verificar si el producto ya está en el carrito
      const existingItem = cart.items.find((item: CartItem) => item.product_id === product.id);
      
      if (existingItem) {
        // Incrementar cantidad
        return {
          ...cart,
          items: cart.items.map((item: CartItem) => 
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
            } as CartItem
          ]
        };
      }
    })
  );
};

const increaseQuantity = (itemId: string | number): void => {
  setCarts((currentCarts: MultiClientCart[]) => 
    currentCarts.map((cart: MultiClientCart) => {
      if (!cart.active) return cart;
      
      return {
        ...cart,
        items: cart.items.map((item: CartItem) => 
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

const decreaseQuantity = (itemId: string | number): void => {
  setCarts((currentCarts: MultiClientCart[]) => 
    currentCarts.map((cart: MultiClientCart) => {
      if (!cart.active) return cart;
      
      return {
        ...cart,
        items: cart.items.map((item: CartItem) => 
          item.id === itemId && item.quantity > 1
            ? { 
                ...item, 
                quantity: item.quantity - 1,
                total: (item.quantity - 1) * item.unit_price 
              } 
            : item
        ).filter((item: CartItem) => !(item.id === itemId && item.quantity === 1))
      };
    })
  );
};

const removeFromCart = (itemId: string | number): void => {
  setCarts((currentCarts: MultiClientCart[]) => 
    currentCarts.map((cart: MultiClientCart) => {
      if (!cart.active) return cart;
      
      return {
        ...cart,
        items: cart.items.filter((item: CartItem) => item.id !== itemId)
      };
    })
  );
};

const setActiveCart = (cartId: string): void => {
  setCarts((currentCarts: MultiClientCart[]) => 
    currentCarts.map((cart: MultiClientCart) => ({
      ...cart,
      active: cart.id === cartId
    }))
  );
};

const addNewCart = (): void => {
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
  
  setCarts((currentCarts: MultiClientCart[]) => 
    currentCarts.map((cart: MultiClientCart) => ({
      ...cart,
      active: false
    })).concat(newCart)
  );
};

const removeCart = (cartId: string | number): void => {
  // Agregar logs para depurar problemas con tipos de ID
  console.log('Eliminando carrito con ID:', cartId, 'tipo:', typeof cartId);
  
  setCarts((currentCarts: MultiClientCart[]) => {
    const filtered = currentCarts.filter((cart: MultiClientCart) => cart.id !== cartId);
    
    // Si eliminamos el carrito activo, activar el primero
    if (filtered.length > 0 && !filtered.some((cart: MultiClientCart) => cart.active)) {
      filtered[0].active = true;
    }
    
    return filtered;
  });
};

// Buscar cliente en Supabase
const searchCustomers = async (query: string): Promise<Customer[]> => {
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
const assignCustomer = (customer: Customer): void => {
  setCarts((currentCarts: MultiClientCart[]) => 
    currentCarts.map((cart: MultiClientCart) => {
      if (!cart.active) return cart;
      
      return {
        ...cart,
        customer
      };
    })
  );
};

// Crear nuevo cliente en Supabase
const createCustomer = async (customerData: Omit<Customer, 'id' | 'organization_id'>): Promise<Customer | null> => {
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
    
    return data as Customer;
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
  const activeCart = carts.find((cart: MultiClientCart) => cart.active) || carts[0];

  return {
    carts,
    products,
    categories,
    loading,
    orgId,
    branchId,
    orgUuid,         // Agregado para dar visibilidad al UUID de organización
    userIdState,     // Agregado para dar visibilidad al UUID de usuario
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
