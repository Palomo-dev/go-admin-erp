"use client";

import React, { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useMonedaOrganizacion } from "@/lib/hooks/useOrgCurrency";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { formatMoneda } from "@/lib/utils/moneda";
import { Button } from "@/components/ui/button";
import {
  agruparGraficoPronostico,
  type DatosGraficoPronostico,
} from "./forecastPresentacion";
import { usePipelineForecast } from "./usePipelineForecast";

// Interfaces
interface ForecastChartProps {
  pipelineId: string;
  period?: "monthly" | "quarterly"; // Período de visualización
}

const ForecastChart: React.FC<ForecastChartProps> = ({
  pipelineId,
  period = "monthly",
}) => {
  const t = useTranslations("crm.pronostico.pipelineAnalitica");
  const { paraDocumento } = useMonedaOrganizacion();
  const [selectedView, setSelectedView] = useState<"monthly" | "quarterly">(
    period,
  );
  const { loading, error, forecast, goal, retry } =
    usePipelineForecast(pipelineId);
  const chartData = useMemo(
    () =>
      agruparGraficoPronostico(
        forecast?.monthlyForecasts ?? [],
        selectedView,
        goal,
        {
          noDate: t("sinFecha"),
          quarter: (year, n) => t("trimestreEtiqueta", { year, n }),
        },
      ),
    [forecast, selectedView, goal, t],
  );
  const formatear = (amount: number) =>
    formatMoneda(amount, paraDocumento(forecast?.baseCurrency));

  // Color según tema
  const barColors = {
    totalAmount: "#94a3b8", // slate-400
    forecastAmount: "#3b82f6", // blue-500
    goal: "#10b981", // emerald-500
  };

  // Renderizar gráfico de carga
  if (loading) {
    return (
      <Card className="p-4 h-80 space-y-4">
        <Skeleton className="h-5 w-1/2" />
        <Skeleton className="h-60 w-full" />
      </Card>
    );
  }

  if (error) {
    return (
      <Card
        className="p-6 h-80 flex flex-col items-center justify-center gap-3"
        role="alert"
      >
        <p>{t(error === "organization" ? "sinOrganizacion" : "errorCarga")}</p>
        <Button variant="outline" onClick={retry}>
          {t("reintentar")}
        </Button>
      </Card>
    );
  }

  // Si no hay datos
  if (chartData.length === 0) {
    return (
      <Card className="p-6 h-80 flex items-center justify-center">
        <div className="text-center">
          <h3 className="text-lg font-medium mb-2">{t("vacio")}</h3>
          <p className="text-gray-500 dark:text-gray-400">
            {t("vacioDetalle")}
          </p>
        </div>
      </Card>
    );
  }

  // Tipo correcto para el tooltip
  interface TooltipProps {
    active?: boolean;
    payload?: Array<{
      value: number;
      name: string;
      dataKey: string;
      payload: DatosGraficoPronostico;
    }>;
  }

  const CustomTooltip: React.FC<TooltipProps> = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-white dark:bg-gray-800 p-3 border border-gray-200 dark:border-gray-700 rounded-md shadow-md">
          <p className="font-medium text-gray-800 dark:text-gray-200">
            {data.name}
          </p>
          <p className="text-sm text-gray-600 dark:text-gray-300">
            {t("total")}: {formatear(data.totalAmount)}
          </p>
          <p className="text-sm font-medium text-blue-600 dark:text-blue-400">
            {t("pronostico")}: {formatear(data.forecastAmount)}
          </p>
          {data.goal && (
            <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
              {t("objetivo")}: {formatear(data.goal)}
            </p>
          )}
        </div>
      );
    }
    return null;
  };

  return (
    <Card className="p-4">
      <div className="mb-4 flex justify-between items-center">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100">
          {t("tituloGrafico")}
        </h3>

        <Tabs
          value={selectedView}
          onValueChange={(value: string) =>
            setSelectedView(value as "monthly" | "quarterly")
          }
          className="w-auto"
        >
          <TabsList className="bg-gray-100 dark:bg-gray-800">
            <TabsTrigger value="monthly">{t("mensual")}</TabsTrigger>
            <TabsTrigger value="quarterly">{t("trimestral")}</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            margin={{ top: 10, right: 10, left: 10, bottom: 50 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              className="stroke-gray-200 dark:stroke-gray-700"
            />
            <XAxis
              dataKey="name"
              className="text-xs text-gray-600 dark:text-gray-300"
              angle={-45}
              textAnchor="end"
              height={60}
            />
            <YAxis
              tickFormatter={(value) => formatear(value)}
              className="text-xs text-gray-600 dark:text-gray-300"
            />
            <Tooltip
              content={<CustomTooltip />}
              cursor={{ fill: "rgba(148, 163, 184, 0.1)" }}
            />
            <Legend />
            <Bar
              name={t("totalBruto")}
              dataKey="totalAmount"
              fill={barColors.totalAmount}
              className="dark:opacity-80"
            />
            <Bar
              name={t("ponderado")}
              dataKey="forecastAmount"
              fill={barColors.forecastAmount}
              className="dark:opacity-80"
            />
            {chartData.some((item) => item.goal !== undefined) && (
              <Bar
                name={t("objetivo")}
                dataKey="goal"
                fill={barColors.goal}
                className="dark:opacity-80"
              />
            )}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
};

export default ForecastChart;
