"use client";

import { CalendarIcon, User2 } from "lucide-react";
import { formatCurrency } from "@/utils/Utils";
import { Card, CardContent } from "@/components/ui/card";
import { useTheme } from "next-themes";
import type { Opportunity } from "@/types/crm";
import { Badge } from "@/components/ui/badge";
import { translateOpportunityStatus } from '@/utils/crmTranslations';

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
      className={`${theme === "dark" ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200"} hover:shadow-md dark:hover:shadow-gray-900/50 transition-shadow`}
    >
      <CardContent className="p-2 sm:p-3 relative">
        {/* Indicador de prioridad o actividad reciente */}
        {opportunity.priority === "high" && (
          <div className="absolute -top-1 -right-1 w-2.5 h-2.5 sm:w-3 sm:h-3 bg-red-500 rounded-full border-2 border-white dark:border-gray-800" 
               title="Alta prioridad" />
        )}
        {hasRecentActivity && !opportunity.priority && (
          <div className="absolute -top-1 -right-1 w-2 h-2 bg-blue-400 rounded-full border border-white dark:border-gray-800" 
               title="Actividad reciente" />
        )}
        
        <div className="flex justify-between items-start gap-1.5 sm:gap-2">
          <h4 className="text-xs sm:text-sm font-medium truncate flex-1 text-gray-900 dark:text-white" title={opportunity.name}>
            {opportunity.name}
          </h4>
          {status && (
            <Badge variant={getBadgeVariant(status)} className="text-[9px] sm:text-[10px] shrink-0">
              {translateOpportunityStatus(status || '')}
            </Badge>
          )}
        </div>

        <div className="mt-1.5 sm:mt-2 flex justify-between items-center">
          <div className="text-xs sm:text-sm font-semibold text-gray-900 dark:text-white">{formattedAmount}</div>
          {winProbability > 0 && (
            <div className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400">{winProbability}%</div>
          )}
        </div>
        
        {/* Barra de progreso de probabilidad */}
        {winProbability > 0 && (
          <div className="mt-1 w-full bg-gray-200 dark:bg-gray-600 h-1 rounded-full overflow-hidden">
            <div 
              className={`h-full ${winProbability > 70 ? 'bg-green-500 dark:bg-green-400' : winProbability > 40 ? 'bg-blue-500 dark:bg-blue-400' : 'bg-amber-500 dark:bg-amber-400'}`}
              style={{ width: `${winProbability}%` }}
            />
          </div>
        )}

        <div className="mt-2 sm:mt-3 flex justify-between items-center text-[10px] sm:text-xs text-gray-500 dark:text-gray-400">
          {opportunity.customer?.full_name && (
            <div
              className="flex items-center gap-0.5 sm:gap-1 truncate max-w-[55%] sm:max-w-[60%]"
              title={opportunity.customer.full_name}
            >
              <User2 className="h-2.5 w-2.5 sm:h-3 sm:w-3 shrink-0" />
              <span className="truncate">{opportunity.customer.full_name}</span>
            </div>
          )}

          {formattedDate && (
            <div className="flex items-center gap-0.5 sm:gap-1 shrink-0" title="Fecha estimada de cierre">
              <CalendarIcon className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
              <span>{formattedDate}</span>
            </div>
          )}
        </div>
        
        {/* Línea de tareas o seguimientos */}
        {(opportunity.tasks_count || 0) > 0 && (
          <div className="mt-1.5 sm:mt-2 pt-1.5 sm:pt-2 border-t border-gray-200 dark:border-gray-700 text-[10px] sm:text-xs flex items-center justify-between">
            <span className="text-gray-500 dark:text-gray-400">
              {opportunity.tasks_completed || 0}/{opportunity.tasks_count} tareas
            </span>
            <div className="w-12 sm:w-16 bg-gray-200 dark:bg-gray-600 h-1 rounded-full overflow-hidden">
              <div 
                className="h-full bg-blue-500 dark:bg-blue-400"
                style={{ width: `${opportunity.tasks_count ? (opportunity.tasks_completed || 0) / opportunity.tasks_count * 100 : 0}%` }}
              />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
