"use client";

import { CalendarIcon, User2 } from "lucide-react";
import { formatCurrency } from "@/utils/Utils";
import { Card, CardContent } from "@/components/ui/card";
import { useTheme } from "next-themes";
import { Opportunity } from "@/types/crm";
import { Badge } from "@/components/ui/badge";

interface OpportunityCardProps {
  opportunity: Opportunity;
}

export function OpportunityCard({ opportunity }: OpportunityCardProps) {
  const { theme } = useTheme();

  // Formatear fecha si existe
  const formattedDate = opportunity.expected_close_date
    ? new Date(opportunity.expected_close_date).toLocaleDateString("es-ES", {
        day: "2-digit",
        month: "short",
      })
    : null;

  // Formatear monto
  const formattedAmount = formatCurrency(
    parseFloat(opportunity.amount?.toString() || "0") || 0,
    opportunity.currency || "COP"
  );

  // Obtener el estado de la oportunidad si existe
  const status = opportunity.status?.toLowerCase();

  // Determinar el color del badge según el estado
  const getBadgeVariant = (status: string | undefined) => {
    switch (status) {
      case "active":
      case "open":
      case "in_progress":
        return "default";
      case "won":
        return "success";
      case "lost":
        return "destructive";
      case "delayed":
        return "warning";
      default:
        return "secondary";
    }
  };

  // Calcular la probabilidad estimada de cierre (si está disponible)
  const winProbability = opportunity.win_probability || 0;
  
  // Calcular el tiempo transcurrido desde la creación
  const daysSinceCreation = opportunity.created_at ? 
    Math.floor((new Date().getTime() - new Date(opportunity.created_at).getTime()) / (1000 * 3600 * 24)) : 0;
  
  // Indicador de actividad reciente
  const hasRecentActivity = daysSinceCreation < 7; // Menos de 7 días

  return (
    <Card
      className={`${theme === "dark" ? "bg-gray-900 border-gray-800" : "bg-white"} hover:shadow-md transition-shadow`}
    >
      <CardContent className="p-3 relative">
        {/* Indicador de prioridad o actividad reciente */}
        {opportunity.priority === "high" && (
          <div className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-white dark:border-gray-900" 
               title="Alta prioridad" />
        )}
        {hasRecentActivity && !opportunity.priority && (
          <div className="absolute -top-1 -right-1 w-2 h-2 bg-blue-400 rounded-full border border-white dark:border-gray-900" 
               title="Actividad reciente" />
        )}
        
        <div className="flex justify-between items-start gap-2">
          <h4 className="text-sm font-medium truncate flex-1" title={opportunity.name}>
            {opportunity.name}
          </h4>
          {status && (
            <Badge variant={getBadgeVariant(status)} className="text-[10px]">
              {status === "in_progress"
                ? "En progreso"
                : status === "won"
                ? "Ganada"
                : status === "lost"
                ? "Perdida"
                : status === "active"
                ? "Activa"
                : status === "delayed"
                ? "Retrasada"
                : status}
            </Badge>
          )}
        </div>

        <div className="mt-2 flex justify-between items-center">
          <div className="text-sm font-semibold">{formattedAmount}</div>
          {winProbability > 0 && (
            <div className="text-xs text-muted-foreground">{winProbability}%</div>
          )}
        </div>
        
        {/* Barra de progreso de probabilidad */}
        {winProbability > 0 && (
          <div className="mt-1 w-full bg-gray-200 dark:bg-gray-700 h-1 rounded-full overflow-hidden">
            <div 
              className={`h-full ${winProbability > 70 ? 'bg-green-500' : winProbability > 40 ? 'bg-blue-500' : 'bg-amber-500'}`}
              style={{ width: `${winProbability}%` }}
            />
          </div>
        )}

        <div className="mt-3 flex justify-between items-center text-xs text-muted-foreground">
          {opportunity.customer?.full_name && (
            <div
              className="flex items-center gap-1 truncate max-w-[60%]"
              title={opportunity.customer.full_name}
            >
              <User2 className="h-3 w-3" />
              <span className="truncate">{opportunity.customer.full_name}</span>
            </div>
          )}

          {formattedDate && (
            <div className="flex items-center gap-1" title="Fecha estimada de cierre">
              <CalendarIcon className="h-3 w-3" />
              <span>{formattedDate}</span>
            </div>
          )}
        </div>
        
        {/* Línea de tareas o seguimientos */}
        {(opportunity.tasks_count || 0) > 0 && (
          <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-800 text-xs flex items-center justify-between">
            <span className="text-muted-foreground">
              {opportunity.tasks_completed || 0}/{opportunity.tasks_count} tareas
            </span>
            <div className="w-16 bg-gray-200 dark:bg-gray-700 h-1 rounded-full overflow-hidden">
              <div 
                className="h-full bg-blue-500"
                style={{ width: `${opportunity.tasks_count ? (opportunity.tasks_completed || 0) / opportunity.tasks_count * 100 : 0}%` }}
              />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
