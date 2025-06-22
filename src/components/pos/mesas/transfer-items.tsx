"use client";

import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckCheck, ArrowRight } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { supabase } from "@/lib/supabase/config";
import { useTheme } from "next-themes";

// Interfaces
interface TransferItemsProps {
  tableId: number;
  tableSessionId: number;
  saleId: number | null;
  organizationId: number;
  branchId: number;
  cartItems: CartItem[];
  onItemsTransferred: () => void;
}

interface CartItem {
  id: number;
  product_id: number;
  product_name: string;
  quantity: number;
  price: number;
  status?: string;
  notes?: string;
}

interface Mesa {
  id: number;
  name: string;
  session_id?: number | null;
  sale_id?: number | null;
}

export function TransferItems({
  tableId,
  tableSessionId,
  saleId,
  organizationId,
  branchId,
  cartItems,
  onItemsTransferred
}: TransferItemsProps) {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  
  // Estados
  const [loading, setLoading] = useState(false);
  const [selectedDestTable, setSelectedDestTable] = useState<number | null>(null);
  const [selectedItems, setSelectedItems] = useState<Record<number, boolean>>({});
  const [availableTables, setAvailableTables] = useState<Mesa[]>([]);
  const [error, setError] = useState<string | null>(null);
  
  // Cargar mesas disponibles para transferencia
  useEffect(() => {
    const loadAvailableTables = async () => {
      try {
        // Obtener todas las mesas ocupadas (con sesión activa) excepto la actual
        const { data: tablesData, error: tablesError } = await supabase
          .from("restaurant_tables")
          .select(`
            id, name,
            table_sessions!inner (
              id, 
              sale_id
            )
          `)
          .eq("organization_id", organizationId)
          .eq("branch_id", branchId)
          .eq("table_sessions.closed_at", null)
          .neq("id", tableId);
          
        if (tablesError) {
          throw new Error("Error al cargar mesas disponibles");
        }
        
        // Formatear datos de mesas para el select
        const formattedTables = tablesData?.map(table => {
          // Obtener la primera sesión activa (debería ser única por mesa)
          const session = Array.isArray(table.table_sessions) && table.table_sessions.length > 0
            ? table.table_sessions[0]
            : null;
            
          return {
            id: table.id,
            name: table.name,
            session_id: session?.id || null,
            sale_id: session?.sale_id || null
          };
        }) || [];
        
        setAvailableTables(formattedTables);
      } catch (error) {
        console.error("Error al cargar mesas:", error);
        setError("Error al cargar mesas disponibles");
      }
    };
    
    loadAvailableTables();
  }, [organizationId, branchId, tableId]);
  
  // Manejar selección de items
  const handleItemSelect = (itemId: number) => {
    setSelectedItems(prev => ({
      ...prev,
      [itemId]: !prev[itemId]
    }));
  };
  
  // Verificar si hay items seleccionados
  const hasSelectedItems = Object.values(selectedItems).some(value => value);
  
  // Transferir items seleccionados
  const transferItems = async () => {
    try {
      setLoading(true);
      setError(null);
      
      if (!selectedDestTable) {
        throw new Error("Seleccione una mesa de destino");
      }
      
      if (!hasSelectedItems) {
        throw new Error("Seleccione al menos un producto para transferir");
      }
      
      // Encontrar la sesión y venta de la mesa de destino
      const destTable = availableTables.find(table => table.id === selectedDestTable);
      
      if (!destTable?.session_id || !destTable?.sale_id) {
        throw new Error("La mesa de destino no tiene una sesión activa");
      }
      
      // Obtener los IDs de los items seleccionados
      const itemsToTransfer = cartItems.filter(item => selectedItems[item.id]);
      
      // Para cada item seleccionado
      for (const item of itemsToTransfer) {
        // 1. Actualizar el item existente para cambiarlo a la nueva venta
        await supabase
          .from("sale_items")
          .update({
            sale_id: destTable.sale_id,
            updated_at: new Date().toISOString()
          })
          .eq("id", item.id);
      }
      
      // Notificar éxito
      onItemsTransferred();
      
      // Limpiar selecciones
      setSelectedItems({});
      
    } catch (error: any) {
      console.error("Error al transferir items:", error);
      setError(error.message || "Error al transferir productos");
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" className="w-full">
          <ArrowRight className="mr-2 h-4 w-4" />
          Transferir Productos
        </Button>
      </DialogTrigger>
      <DialogContent className={`sm:max-w-md ${isDark ? "bg-slate-900 text-white" : "bg-white"}`}>
        <DialogHeader>
          <DialogTitle>Transferir productos a otra mesa</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          {error && (
            <div className="text-red-500 text-sm mb-4">
              {error}
            </div>
          )}
          
          <div className="space-y-2">
            <Label>Mesa destino</Label>
            <Select 
              onValueChange={(value) => setSelectedDestTable(Number(value))}
              disabled={loading || availableTables.length === 0}
            >
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar mesa" />
              </SelectTrigger>
              <SelectContent>
                {availableTables.length > 0 ? (
                  availableTables.map((table) => (
                    <SelectItem key={table.id} value={table.id.toString()}>
                      {table.name}
                    </SelectItem>
                  ))
                ) : (
                  <SelectItem value="none" disabled>No hay mesas disponibles</SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>
          
          <div className="space-y-2">
            <Label>Seleccionar productos a transferir</Label>
            <Card className={isDark ? "bg-slate-800" : "bg-gray-50"}>
              <CardContent className="pt-4 px-2">
                {cartItems.length > 0 ? (
                  <div className="space-y-2 max-h-[40vh] overflow-y-auto pr-2">
                    {cartItems.map((item) => (
                      <div key={item.id} className="flex items-center space-x-2">
                        <Checkbox 
                          id={`item-${item.id}`}
                          checked={!!selectedItems[item.id]}
                          onCheckedChange={() => handleItemSelect(item.id)}
                        />
                        <Label htmlFor={`item-${item.id}`} className="flex-grow">
                          <span className="font-medium">{item.quantity}x {item.product_name}</span>
                          <span className="block text-sm text-muted-foreground">
                            ${(item.price * item.quantity).toFixed(2)}
                          </span>
                        </Label>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-4 text-muted-foreground">
                    No hay productos para transferir
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
        <div className="flex justify-end">
          <Button 
            onClick={transferItems} 
            disabled={loading || !selectedDestTable || !hasSelectedItems}
          >
            {loading ? "Transfiriendo..." : "Transferir Seleccionados"}
            {!loading && <CheckCheck className="ml-2 h-4 w-4" />}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
