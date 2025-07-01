"use client";

import { CalendarIcon, User2 } from "lucide-react";
import { formatCurrency } from "@/utils/Utils";
import { Card, CardContent } from "@/components/ui/card";
import { useTheme } from "next-themes";
import { Opportunity } from "./KanbanBoard";
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

  return (
    <Card
      className={theme === "dark" ? "bg-gray-900 border-gray-800" : "bg-white"}
    >
      <CardContent className="p-3">
        <div className="flex justify-between items-start gap-2">
          <h4 className="text-sm font-medium truncate flex-1">
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

        <div className="mt-2 text-sm font-semibold">{formattedAmount}</div>

        <div className="mt-3 flex justify-between items-center text-xs text-muted-foreground">
          {opportunity.customer?.name && (
            <div
              className="flex items-center gap-1 truncate max-w-[60%]"
              title={opportunity.customer.name}
            >
              <User2 className="h-3 w-3" />
              <span className="truncate">{opportunity.customer.name}</span>
            </div>
          )}

          {formattedDate && (
            <div className="flex items-center gap-1">
              <CalendarIcon className="h-3 w-3" />
              <span>{formattedDate}</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
