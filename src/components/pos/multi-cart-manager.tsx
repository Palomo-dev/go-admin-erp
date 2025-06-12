import React, { useState, useEffect } from "react";
import { ShoppingCart, Trash2, Loader2, Plus } from "lucide-react";
import { Card, CardContent } from "./card";
import { Button } from "./button";
import { supabase } from "@/lib/supabase/config";

interface Product {
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
}

interface CartItem {
  product_id: string;
  product: Product;
  quantity: number;
  unit_price: number;
  notes?: string;
  tax_amount?: number;
  discount_amount?: number;
}

interface Cart {
  id?: string;
  items: CartItem[];
  customer_id?: string;
  customer_name?: string;
  organization_id?: string;
  branch_id?: string;
  user_id?: string;
  created_at?: string;
}

interface SavedCart {
  id: string;
  organization_id: string;
  branch_id: string;
  user_id: string;
  cart_data: Cart;
  expires_at: string;
  created_at: string;
}

interface MultiCartManagerProps {
  organizationId: string;
  branchId: string;
  userId: string;
  onLoadCart: (cart: Cart) => void;
  onNewCart: () => void;
  currentCart: Cart;
}

export function MultiCartManager({
  organizationId,
  branchId,
  userId,
  onLoadCart,
  onNewCart,
  currentCart
}: MultiCartManagerProps) {
  const [savedCarts, setSavedCarts] = useState<SavedCart[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeCartId, setActiveCartId] = useState<string | null>(null);

  // Cargar carritos guardados
  const loadSavedCarts = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("carts")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("branch_id", branchId)
        .order("created_at", { ascending: false });
        
      if (error) {
        console.error("Error al cargar carritos guardados:", error);
        throw error;
      }
      
      setSavedCarts(data || []);
    } catch (err) {
      console.error("Error al cargar carritos guardados:", err);
    } finally {
      setLoading(false);
    }
  };

  // Cargar carritos al montar el componente
  useEffect(() => {
    if (organizationId && branchId) {
      loadSavedCarts();
    }
  }, [organizationId, branchId]);

  // Eliminar un carrito
  const handleDeleteCart = async (cartId: string) => {
    if (!confirm("¿Estás seguro de eliminar este ticket en espera?")) return;
    
    try {
      const { error } = await supabase
        .from("carts")
        .delete()
        .eq("id", cartId);
        
      if (error) {
        console.error("Error al eliminar carrito:", error);
        throw error;
      }
      
      // Actualizar la lista
      setSavedCarts(prev => prev.filter(cart => cart.id !== cartId));
      
      // Si se eliminó el carrito activo, crear uno nuevo
      if (activeCartId === cartId) {
        setActiveCartId(null);
        onNewCart();
      }
    } catch (err) {
      console.error("Error al eliminar carrito:", err);
    }
  };

  // Cargar un carrito
  const handleLoadCart = (cart: SavedCart) => {
    setActiveCartId(cart.id);
    onLoadCart(cart.cart_data);
  };

  // Calcular el total de cada carrito
  const calculateCartTotal = (cart: Cart) => {
    return cart.items.reduce(
      (sum, item) => sum + item.unit_price * item.quantity,
      0
    );
  };

  // Formatear fecha y hora
  const formatDateTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('es-ES', { 
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      hour: '2-digit', 
      minute: '2-digit'
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-medium text-gray-800 dark:text-gray-200">
          Tickets en espera ({savedCarts.length})
        </h3>
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={loadSavedCarts}
          className="h-8 text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
        >
          Actualizar
        </Button>
      </div>
      
      {loading ? (
        <div className="flex justify-center items-center h-20">
          <Loader2 className="h-5 w-5 animate-spin text-blue-500 dark:text-blue-400" />
        </div>
      ) : savedCarts.length > 0 ? (
        <div className="space-y-2">
          {savedCarts.map(savedCart => {
            const cart = savedCart.cart_data;
            const itemCount = cart.items.reduce((count, item) => count + item.quantity, 0);
            const total = calculateCartTotal(cart);
            
            return (
              <Card 
                key={savedCart.id}
                className={`
                  bg-white dark:bg-gray-850 border-gray-200 dark:border-gray-700 cursor-pointer
                  ${activeCartId === savedCart.id ? 'ring-2 ring-blue-500 dark:ring-blue-400' : ''}
                  hover:bg-gray-50 dark:hover:bg-gray-800
                `}
                onClick={() => handleLoadCart(savedCart)}
              >
                <CardContent className="p-3 flex items-center justify-between">
                  <div>
                    <div className="flex items-center">
                      <ShoppingCart className="h-4 w-4 text-blue-500 dark:text-blue-400 mr-2" />
                      <span className="text-sm font-medium text-gray-800 dark:text-gray-200">
                        {cart.customer_name || 'Cliente general'}
                      </span>
                    </div>
                    <div className="flex items-center mt-1 text-xs text-gray-500 dark:text-gray-400">
                      <span className="mr-2">{formatDateTime(savedCart.created_at)}</span>
                      <span className="px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded text-xs">
                        {itemCount} items
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center">
                    <span className="text-sm font-medium text-gray-800 dark:text-gray-200 mr-3">
                      ${total.toFixed(2)}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-gray-400 dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteCart(savedCart.id);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-6 border border-dashed border-gray-200 dark:border-gray-700 rounded-lg">
          <ShoppingCart className="mx-auto h-8 w-8 text-gray-300 dark:text-gray-600 mb-2" />
          <p className="text-sm text-gray-500 dark:text-gray-400">
            No hay tickets en espera
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
            Usa "Poner en espera" para guardar carritos
          </p>
        </div>
      )}
      
      <Button
        className="w-full mt-2 bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 text-white"
        onClick={onNewCart}
      >
        <Plus className="h-4 w-4 mr-1" />
        Nuevo carrito
      </Button>
    </div>
  );
}
