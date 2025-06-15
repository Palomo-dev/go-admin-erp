"use client";

import React from "react";
import { Button } from "@/components/pos/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/pos/card";
import { Receipt, CreditCard, FileText, Send } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/pos/dialog";
import { supabase } from "@/lib/supabase/config";
import { useTheme } from "next-themes";
import { format } from "date-fns";
import { es } from "date-fns/locale";

// Interfaces
interface BillManagerProps {
  tableId: number;
  tableSessionId: number;
  saleId: number | null;
  organizationId: number;
  branchId: number;
  cartItems: CartItem[];
  subtotal: number;
  taxRate: number;
  onBillGenerated: () => void;
  className?: string;
}

interface CartItem {
  id: number;
  product_id: number;
  product_name: string;
  quantity: number;
  price: number;
  total?: number;
  status?: string;
  notes?: string;
  created_at?: string;
}

export function BillManager({
  tableId,
  tableSessionId,
  saleId,
  organizationId,
  branchId,
  cartItems,
  subtotal,
  taxRate,
  onBillGenerated,
  className
}: BillManagerProps) {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  
  // Calcular totales usando los props proporcionados
  const tax = subtotal * taxRate;
  const total = subtotal + tax;
  
  // Función para generar pre-cuenta (solo actualiza el estado)
  const generatePreBill = async () => {
    try {
      if (!saleId) {
        throw new Error("No se encontró ID de venta");
      }
      
      // Actualizar estado de la mesa a "bill_requested"
      const { error: sessionError } = await supabase
        .from("table_sessions")
        .update({
          status: "bill_requested",
          updated_at: new Date().toISOString()
        })
        .eq("id", tableSessionId);
        
      if (sessionError) {
        throw new Error("Error al actualizar estado de mesa");
      }
      
      // Actualizar venta con totales calculados
      const { error: saleError } = await supabase
        .from("sales")
        .update({
          status: "pending_payment",
          payment_status: "pending",
          subtotal: subtotal,
          tax_total: tax,
          total: total,
          updated_at: new Date().toISOString()
        })
        .eq("id", saleId);
        
      if (saleError) {
        throw new Error("Error al actualizar venta");
      }
      
      // Notificar éxito
      onBillGenerated();
      
    } catch (error) {
      console.error("Error al generar pre-cuenta:", error);
    }
  };
  
  // Función para imprimir la cuenta (simulada)
  const printBill = () => {
    const billWindow = window.open("", "_blank");
    if (!billWindow) return;
    
    const today = format(new Date(), "PPP", {locale: es});
    const time = format(new Date(), "HH:mm");
    
    billWindow.document.write(`
      <html>
        <head>
          <title>Cuenta - Mesa ${tableId}</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 0; padding: 20px; }
            .header { text-align: center; margin-bottom: 20px; }
            .bill-item { display: flex; justify-content: space-between; margin: 5px 0; }
            .totals { margin-top: 10px; border-top: 1px solid #000; padding-top: 10px; }
            .total { font-weight: bold; }
            @media print {
              .no-print { display: none; }
              button { display: none; }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h2>GoAdmin ERP Restaurant</h2>
            <p>Mesa: ${tableId}</p>
            <p>${today} ${time}</p>
          </div>
          
          <div class="content">
            <h3>Detalle de consumo</h3>
            ${cartItems.map(item => `
              <div class="bill-item">
                <span>${item.quantity} x ${item.product_name}</span>
                <span>$${(item.price * item.quantity).toFixed(2)}</span>
              </div>
            `).join('')}
            
            <div class="totals">
              <div class="bill-item">
                <span>Subtotal:</span>
                <span>$${subtotal.toFixed(2)}</span>
              </div>
              <div class="bill-item">
                <span>IVA (16%):</span>
                <span>$${tax.toFixed(2)}</span>
              </div>
              <div class="bill-item total">
                <span>Total:</span>
                <span>$${total.toFixed(2)}</span>
              </div>
            </div>
          </div>
          
          <div class="footer" style="margin-top: 30px; text-align: center;">
            <p>¡Gracias por su visita!</p>
            <p>Esta cuenta es solo informativa, no es un comprobante fiscal</p>
          </div>
          
          <div class="no-print" style="margin-top: 20px; text-align: center;">
            <button onclick="window.print()">Imprimir</button>
          </div>
        </body>
      </html>
    `);
    
    billWindow.document.close();
    setTimeout(() => billWindow.print(), 500);
  };
  
  // Función para cargar el nombre de la mesa (en caso de necesitarlo)
  const getMesaName = async () => {
    const { data } = await supabase
      .from("restaurant_tables")
      .select("name")
      .eq("id", tableId)
      .single();
    return data?.name || `Mesa ${tableId}`;
  };
      
  return (
    <Card className={`${isDark ? "bg-slate-900 border-slate-800" : "bg-white"} ${className || ''}`}>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg">Cuenta</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Subtotal</span>
            <span>${subtotal.toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">IVA (16%)</span>
            <span>${tax.toFixed(2)}</span>
          </div>
          <div className="flex justify-between font-bold">
            <span>Total</span>
            <span>${total.toFixed(2)}</span>
          </div>
        </div>
      </CardContent>
      <CardFooter className="flex flex-col space-y-2">
        <Button 
          className="w-full" 
          variant="outline"
          onClick={generatePreBill}
        >
          <Receipt className="mr-2 h-4 w-4" />
          Generar Pre-cuenta
        </Button>
        
        <Dialog>
          <DialogTrigger asChild>
            <Button className="w-full">
              <CreditCard className="mr-2 h-4 w-4" />
              Ver Cuenta Completa
            </Button>
          </DialogTrigger>
          <DialogContent className={`sm:max-w-md ${isDark ? "bg-slate-900 text-white" : "bg-white"}`}>
            <DialogHeader>
              <DialogTitle>Cuenta de Mesa {tableId}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="max-h-[50vh] overflow-auto">
                {cartItems.map((item) => (
                  <div key={item.id} className="flex justify-between py-1 border-b">
                    <div>
                      <div className="font-medium">{item.product_name}</div>
                      <div className="text-sm text-muted-foreground">{item.quantity} x ${item.price.toFixed(2)}</div>
                    </div>
                    <div className="font-medium">
                      ${(item.quantity * item.price).toFixed(2)}
                    </div>
                  </div>
                ))}
              </div>
              
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>${subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">IVA (16%)</span>
                  <span>${tax.toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-bold">
                  <span>Total</span>
                  <span>${total.toFixed(2)}</span>
                </div>
              </div>
            </div>
            <div className="flex justify-between">
              <Button onClick={printBill} variant="outline">
                <FileText className="mr-2 h-4 w-4" />
                Imprimir cuenta
              </Button>
              <Button onClick={onBillGenerated}>
                <Send className="mr-2 h-4 w-4" />
                Procesar pago
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </CardFooter>
    </Card>
  );
}
