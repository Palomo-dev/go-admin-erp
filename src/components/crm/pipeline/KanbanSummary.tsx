"use client";

import { formatCurrency } from "@/utils/Utils";
import { useTheme } from "next-themes";
import { Card, CardContent } from "@/components/ui/card";

interface StageStats {
  id: string;
  name: string;
  count: number;
  totalAmount: number;
  forecast: number;
}

interface KanbanSummaryProps {
  stages: StageStats[];
}

export function KanbanSummary({ stages }: KanbanSummaryProps) {
  const { theme } = useTheme();

  const totalOpportunities = stages.reduce(
    (sum, stage) => sum + stage.count,
    0
  );
  const totalAmount = stages.reduce((sum, stage) => sum + stage.totalAmount, 0);
  const totalForecast = stages.reduce((sum, stage) => sum + stage.forecast, 0);

  // Determinar el mes actual y los próximos dos meses para pronóstico
  const currentDate = new Date();
  const months = Array.from({ length: 3 }, (_, i) => {
    const d = new Date();
    d.setMonth(currentDate.getMonth() + i);
    return d.toLocaleDateString("es-ES", { month: "long" });
  });

  // Estimar pronóstico mensual (simplificado)
  // En un caso real esto se basaría en datos históricos y estimaciones más complejas
  const monthlyForecasts = [
    totalForecast * 0.6, // Mes actual
    totalForecast * 0.3, // Próximo mes
    totalForecast * 0.1, // Mes después del próximo
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      <Card
        className={
          theme === "dark" ? "bg-gray-900 border-gray-800" : "bg-white"
        }
      >
        <CardContent className="p-4">
          <h3 className="text-sm font-medium text-muted-foreground">Resumen</h3>
          <div className="mt-2">
            <div className="flex justify-between text-sm mb-1">
              <span>Total oportunidades:</span>
              <span className="font-medium">{totalOpportunities}</span>
            </div>
            <div className="flex justify-between text-sm mb-1">
              <span>Valor total:</span>
              <span className="font-medium">{formatCurrency(totalAmount)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span>Pronóstico:</span>
              <span className="font-medium">
                {formatCurrency(totalForecast)}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card
        className={
          theme === "dark" ? "bg-gray-900 border-gray-800" : "bg-white"
        }
      >
        <CardContent className="p-4">
          <h3 className="text-sm font-medium text-muted-foreground">
            Por Etapa
          </h3>
          <div className="mt-2 space-y-2">
            {stages.map((stage) => (
              <div key={stage.id} className="text-xs">
                <div className="flex justify-between mb-1">
                  <span>{stage.name}:</span>
                  <span className="font-medium">{stage.count} opp.</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Valor:</span>
                  <span>{formatCurrency(stage.totalAmount)}</span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card
        className={
          theme === "dark" ? "bg-gray-900 border-gray-800" : "bg-white"
        }
      >
        <CardContent className="p-4">
          <h3 className="text-sm font-medium text-muted-foreground">
            Pronóstico Mensual
          </h3>
          <div className="mt-2 space-y-2">
            {months.map((month, index) => (
              <div key={month} className="flex justify-between text-sm">
                <span className="capitalize">{month}:</span>
                <span className="font-medium">
                  {formatCurrency(monthlyForecasts[index])}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
