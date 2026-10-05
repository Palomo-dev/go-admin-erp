"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Card } from "@/components/ui/card";
import { useMonedaOrganizacion } from "@/lib/hooks/useOrgCurrency";
import { formatMoneda } from "@/lib/utils/moneda";
import { Target, TrendingUp } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { usePipelineForecast } from "./usePipelineForecast";

interface GoalCompletionWidgetProps {
  pipelineId: string;
  className?: string;
}

const GoalCompletionWidget: React.FC<GoalCompletionWidgetProps> = ({
  pipelineId,
  className,
}) => {
  const t = useTranslations("crm.pronostico.pipelineAnalitica");
  const { paraDocumento } = useMonedaOrganizacion();
  const { loading, error, goal, forecast, retry } = usePipelineForecast(
    pipelineId,
    { goalPeriodOnly: true },
  );
  const goalData =
    goal && goal.goalAmount > 0 && forecast
      ? {
          ...goal,
          forecastAmount: forecast.totals.weightedAmount,
          totalAmount: forecast.totals.totalAmount,
          completionPercentage: Math.min(
            100,
            (forecast.totals.weightedAmount / goal.goalAmount) * 100,
          ),
        }
      : null;

  const getPerformanceColor = (percentage: number): string => {
    if (percentage >= 90) return "text-green-500 dark:text-green-400";
    if (percentage >= 70) return "text-yellow-500 dark:text-yellow-400";
    return "text-red-500 dark:text-red-400";
  };

  if (loading) {
    return (
      <Card className={`p-4 space-y-4 h-48 ${className}`}>
        <Skeleton className="h-5 w-1/2" />
        <Skeleton className="h-6 w-3/4" />
        <Skeleton className="h-4 w-full" />
      </Card>
    );
  }

  if (error) {
    return (
      <Card className={`p-4 ${className}`} role="alert">
        <p>{t(error === "organization" ? "sinOrganizacion" : "errorCarga")}</p>
        <Button variant="outline" className="mt-3" onClick={retry}>
          {t("reintentar")}
        </Button>
      </Card>
    );
  }

  // Si no hay objetivo configurado
  if (!goalData) {
    return (
      <Card className={`p-4 ${className}`}>
        <div className="flex items-center justify-center h-48 text-center">
          <div>
            <Target className="h-8 w-8 text-gray-400 dark:text-gray-500 mx-auto mb-2" />
            <h3 className="text-lg font-medium text-gray-800 dark:text-gray-200">
              {t("sinMeta")}
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {t("sinMetaDetalle")}
            </p>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className={`p-5 ${className}`}>
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center">
          <Target className="h-5 w-5 text-blue-500 dark:text-blue-400 mr-2" />
          <h3 className="text-lg font-medium text-gray-800 dark:text-gray-200">
            {t("tituloMeta", { periodo: t(`periodos.${goalData.goalPeriod}`) })}
          </h3>
        </div>
      </div>

      <div className="space-y-6 mt-4">
        {/* Barra de progreso */}
        <div className="w-full">
          <div className="flex justify-between text-sm mb-1">
            <span className="text-gray-600 dark:text-gray-300">
              {t("progreso")}
            </span>
            <span
              className={getPerformanceColor(goalData.completionPercentage)}
            >
              {goalData.completionPercentage.toFixed(1)}%
            </span>
          </div>
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3">
            <div
              className={`h-3 rounded-full ${getPerformanceColor(goalData.completionPercentage).replace("text-", "bg-")}`}
              style={{ width: `${goalData.completionPercentage}%` }}
            ></div>
          </div>
        </div>

        {/* Detalle de montos */}
        <div className="grid grid-cols-2 gap-4 mt-4">
          <div className="border-r border-gray-200 dark:border-gray-700 pr-4">
            <div className="text-sm text-gray-500 dark:text-gray-400">
              {t("objetivo")}
            </div>
            <div className="text-xl font-bold text-gray-800 dark:text-gray-200">
              {formatMoneda(
                goalData.goalAmount,
                paraDocumento(forecast?.baseCurrency),
              )}
            </div>
          </div>
          <div className="pl-4">
            <div className="text-sm text-gray-500 dark:text-gray-400">
              {t("pronostico")}
            </div>
            <div className="text-xl font-bold text-blue-600 dark:text-blue-400">
              {formatMoneda(
                goalData.forecastAmount,
                paraDocumento(forecast?.baseCurrency),
              )}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {t("deBruto", {
                monto: formatMoneda(
                  goalData.totalAmount,
                  paraDocumento(forecast?.baseCurrency),
                ),
              })}
            </div>
          </div>
        </div>

        {/* Indicador de tendencia */}
        <div className="flex items-center mt-2">
          <TrendingUp
            className={`h-4 w-4 mr-2 ${getPerformanceColor(goalData.completionPercentage)}`}
          />
          <span
            className={`text-sm ${getPerformanceColor(goalData.completionPercentage)}`}
          >
            {goalData.completionPercentage >= 90
              ? t("metaEnCamino")
              : goalData.completionPercentage >= 70
                ? t("metaCerca")
                : t("metaDebajo")}
          </span>
        </div>
      </div>
    </Card>
  );
};

export default GoalCompletionWidget;
