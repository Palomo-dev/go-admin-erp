"use client";

import { useRouter } from "next/navigation";
import React, { useState, useEffect } from "react";
import { supabase, getUserOrganization } from '@/lib/supabase/config';
import Image from "next/image";

// Componentes
import { Badge } from "@/components/pos/badge";  
import { Card } from "@/components/pos/card";  
import { Button } from "@/components/pos/button";  

// Estilos
import styles from "../../styles.module.css";

// Tipos
interface Cart {
  id: string;
  organization_id: string; // Nombre correcto según la tabla
  branch_id: string;
  user_id: string;
  cart_data: {
    items: CartItem[];
    total: number;
    customer?: Customer;
  };
  created_at: string;
  expires_at: string;
}

interface CartItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  image_url?: string;
}

interface Customer {
  id: string;
  full_name: string;
}

export default function CarritosPage() {
  const router = useRouter();
  const [carts, setCarts] = useState<Cart[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Utilizamos el cliente Supabase global

  // Función para cargar los carritos desde Supabase
  const loadCarts = async () => {
    setLoading(true);
    setError(null);

    try {
      // Obtenemos la sesión actual
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        setError("No se pudo obtener la sesión del usuario");
        setLoading(false);
        return;
      }

      console.log("Datos de sesión:", session);

      // Obtenemos la organización y sucursal del usuario usando la función existente
      const { data: userOrg, error: orgError } = await supabase
        .from('organization_members')
        .select('id, organization_id, role_id')
        .eq('user_id', session.user.id)
        .eq('organization_id', localStorage.getItem('currentOrganizationId'))
        .single();
      
      console.log("Datos de organización:", userOrgData);

      if (orgError || !userOrg) {
        console.error("Error al obtener la organización:", orgError);
        setError("No se pudo obtener la información de organización");
        setLoading(false);
        return;
      }

      // Obtenemos los datos de la sucursal primaria del usuario
      const { data: branchData, error: branchError } = await supabase
        .from("member_branches")
        .select("*")
        .eq("organization_member_id", userOrg.id)
        .single();

      console.log("Datos de sucursal:", branchData);

      if (branchError) {
        console.error("Error al obtener la sucursal:", branchError);
        setError("No se pudo obtener la información de sucursal");
        setLoading(false);
        return;
      }
      
      const organization_id = userOrg.organization_id;
      const branch_id = branchData.id;

      // Obtenemos los carritos de la organización actual
      // Solo traemos los que no han expirado
      // Usamos el UUID obtenido para la consulta
      console.log("Consultando carritos con orgUuid:", orgUuid, "y branch_id:", branch_id);
      
      // Consultamos sólo por organización, ya que la relación de branches y branch_id en carts
      // necesita una revisión más profunda de la estructura
      const { data: cartsData, error: cartsError } = await supabase
        .from("carts")
        .select("*")
        .eq("organization_id", orgUuid) // Usamos el UUID de la organización
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false });
        
      // Si tenemos datos, podemos filtrar por branch_id en el cliente
      // Esta es una solución temporal hasta que se revise la estructura

      if (cartsError) {
        console.error("Error al obtener los carritos:", cartsError);
        setError("No se pudieron cargar los carritos");
        setLoading(false);
        return;
      }

      setCarts(cartsData);
      setLoading(false);
    } catch (e) {
      console.error("Error al obtener los carritos:", e);
      setError("Ocurrió un error al cargar los carritos");
      setLoading(false);
    }
  };

  // Función para eliminar un carrito
  const handleDeleteCart = async (cartId: string) => {
    try {
      const { error } = await supabase
        .from("carts")
        .delete()
        .eq("id", cartId);

      if (error) {
        console.error("Error al eliminar el carrito:", error);
        setError("No se pudo eliminar el carrito");
        return;
      }

      // Actualizamos la lista de carritos
      setCarts(carts.filter(cart => cart.id !== cartId));
    } catch (e) {
      console.error("Error al eliminar el carrito:", e);
      setError("Ocurrió un error al eliminar el carrito");
    }
  };

  // Función para cargar un carrito
  const handleLoadCart = (cart: Cart) => {
    try {
      // Guardamos el carrito en localStorage para recuperarlo en la página POS
      localStorage.setItem("currentCart", JSON.stringify(cart.cart_data));
      
      // Redirigimos a la página POS
      router.push("/app/pos");
    } catch (e) {
      console.error("Error al cargar el carrito:", e);
      setError("No se pudo cargar el carrito");
    }
  };

  // Cargamos los carritos cuando se monta el componente
  useEffect(() => {
    loadCarts();
  }, []);

  // Función para formatear la fecha en formato legible
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Función para calcular el tiempo restante hasta la expiración
  const getTimeRemaining = (expiresAt: string) => {
    const now = new Date();
    const expiration = new Date(expiresAt);
    const remainingMs = expiration.getTime() - now.getTime();
    
    if (remainingMs <= 0) return "Expirado";
    
    const remainingMinutes = Math.floor(remainingMs / (1000 * 60));
    const hours = Math.floor(remainingMinutes / 60);
    const minutes = remainingMinutes % 60;
    
    return `${hours}h ${minutes}m`;
  };

  return (
    <div className="p-4">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Carritos en Espera</h1>
        <div className="flex space-x-2">
          <Button
            onClick={() => router.push("/app/pos")}
            variant="secondary"
          >
            Volver a POS
          </Button>
          <Button
            onClick={() => loadCarts()}
            variant="default"
          >
            Actualizar
          </Button>
        </div>
      </div>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-10">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
        </div>
      ) : carts.length === 0 ? (
        <div className="text-center py-10">
          <p className="text-gray-500">No hay carritos en espera</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {carts.map((cart) => (
            <Card key={cart.id} className="overflow-hidden">
              <div className="p-4">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <h3 className="font-bold text-lg">
                      {cart.cart_data.customer?.full_name || "Cliente sin nombre"}
                    </h3>
                    <p className="text-sm text-gray-500">
                      {formatDate(cart.created_at)}
                    </p>
                  </div>
                  <Badge variant="info">
                    {getTimeRemaining(cart.expires_at)}
                  </Badge>
                </div>
                
                <div className="mt-3">
                  <p className="text-sm font-medium">Productos: {cart.cart_data.items.length}</p>
                  <p className="text-lg font-bold">
                    Total: ${cart.cart_data.total.toFixed(2)}
                  </p>
                </div>

                <div className="mt-3 border-t pt-3">
                  <div className="flex flex-wrap gap-1">
                    {cart.cart_data.items.slice(0, 3).map((item) => (
                      <div key={item.id} className="flex items-center gap-1 bg-gray-100 px-2 py-1 rounded text-xs">
                        {item.image_url && (
                          <Image 
                            src={item.image_url} 
                            alt={item.name}
                            width={16}
                            height={16}
                            className="rounded-full"
                          />
                        )}
                        <span>{item.quantity}x</span>
                        <span className="truncate max-w-[80px]">{item.name}</span>
                      </div>
                    ))}
                    {cart.cart_data.items.length > 3 && (
                      <span className="bg-gray-100 px-2 py-1 rounded text-xs">
                        +{cart.cart_data.items.length - 3} más
                      </span>
                    )}
                  </div>
                </div>

                <div className="mt-4 flex justify-between">
                  <Button
                    onClick={() => handleDeleteCart(cart.id)}
                    variant="destructive"
                    className="px-2 py-1"
                  >
                    Eliminar
                  </Button>
                  <Button
                    onClick={() => handleLoadCart(cart)}
                    variant="default"
                    className="px-2 py-1"
                  >
                    Cargar
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
