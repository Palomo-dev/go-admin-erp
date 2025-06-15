"use client";

import React from "react";
import { Button } from "@/components/pos/button";
import { Badge } from "@/components/pos/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/pos/card";
import { Printer, Clock } from "lucide-react";
import { supabase } from "@/lib/supabase/config";
import { useTheme } from "next-themes";

// Interfaces
interface KitchenTicketProps {
  tableId: number; // Renombrado de tableSessionId
  saleId: number | null;
  organizationId: number;
  branchId: number;
  cartItems: CartItem[];
  onTicketCreated: () => Promise<void>; // Renombrado de onTicketSent
  className?: string;
}

interface CartItem {
  id: number;
  product_id: number;
  product_name: string;
  quantity: number;
  price: number;
  status?: string;
  notes?: string;
  created_at?: string;
}

export function KitchenTicket({ 
  tableId, 
  saleId,
  organizationId, 
  branchId,
  cartItems,
  onTicketCreated,
  className 
}: KitchenTicketProps) {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  // Filtrar solo los elementos que no han sido enviados a cocina
  const pendingItems = cartItems.filter(item => item.status === "ordered");

  // Función para enviar comanda a cocina
  const sendToKitchen = async () => {
    try {
      if (!pendingItems.length) {
        return;
      }

      // 1. Crear un nuevo ticket en kitchen_tickets
      const { data: ticketData, error: ticketError } = await supabase
        .from("kitchen_tickets")
        .insert({
          organization_id: organizationId,
          branch_id: branchId,
          table_session_id: tableId,
          sale_id: saleId,
          status: "pending",
          printed_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          priority: 1,
          estimated_time: 15
        })
        .select("id")
        .single();

      if (ticketError || !ticketData) {
        throw new Error("Error al crear ticket de cocina");
      }

      // 2. Actualizar los items enviados a cocina
      const updatePromises = pendingItems.map(item => 
        supabase
          .from("sale_items")
          .update({
            status: "preparing",
            updated_at: new Date().toISOString(),
            kitchen_ticket_id: ticketData.id
          })
          .eq("id", item.id)
      );

      await Promise.all(updatePromises);
      
      // 3. Notificar éxito
      await onTicketCreated();

    } catch (error) {
      console.error("Error al enviar comanda a cocina:", error);
    }
  };

  return (
    <Card className={`${isDark ? "bg-slate-900 border-slate-800" : "bg-white"} ${className || ''}`}>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex justify-between items-center">
          <span>Enviar a cocina</span>
          <Badge variant={pendingItems.length > 0 ? "destructive" : "outline"}>
            {pendingItems.length} pendientes
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {pendingItems.length > 0 ? (
          <>
            <div className="mb-4">
              <ul className="space-y-1">
                {pendingItems.map(item => (
                  <li key={item.id} className="flex justify-between items-center border-b pb-1">
                    <span><strong>{item.quantity}x</strong> {item.product_name}</span>
                    {item.notes && <em className="text-sm text-gray-500">{item.notes}</em>}
                  </li>
                ))}
              </ul>
            </div>
            <Button 
              onClick={sendToKitchen} 
              className="w-full"
              variant="default"
            >
              <Printer className="mr-2 h-4 w-4" />
              Enviar comanda
            </Button>
          </>
        ) : (
          <div className="text-center py-4 text-muted-foreground flex flex-col items-center">
            <Clock className="mb-2 h-8 w-8" />
            <p>No hay productos pendientes de envío</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
