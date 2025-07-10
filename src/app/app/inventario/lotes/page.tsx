import { Metadata } from "next";
// Importamos explícitamente los componentes
import { LotesList } from "@/components/inventario/lotes/LotesList";
import { LotesAlerts } from "@/components/inventario/lotes/LotesAlerts";
import { Info } from "lucide-react";

export const metadata: Metadata = {
  title: "Control de Lotes y Vencimientos",
  description: "Sistema de trazabilidad por número de lote y gestión de fechas de vencimiento",
};

export default function LotesPage() {
  return (
    <div className="flex flex-col gap-4 p-4">
      <h1 className="text-3xl font-bold tracking-tight">Control de Lotes y Vencimientos</h1>
      
      <div className="flex items-start gap-2 text-muted-foreground mb-2">
        <Info className="h-5 w-5 flex-shrink-0" />
        <p className="text-sm">
          Esta página permite la gestión de lotes, sus fechas de vencimiento y existencias actuales. 
          El sistema alerta automáticamente sobre lotes vencidos o próximos a vencer que tengan stock disponible.
        </p>
      </div>
      
      {/* Alertas de vencimiento */}
      <LotesAlerts />
      
      {/* Lista completa de lotes */}
      <LotesList />
    </div>
  );
}
