"use client";

import { useMemo, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useMonedaOrganizacion } from "@/lib/hooks/useOrgCurrency";
import { formatMoneda } from "@/lib/utils/moneda";
import { BarChart3, Calendar, LineChart } from "lucide-react";
import ForecastChart from "./ForecastChart";
import GoalCompletionWidget from "./GoalCompletionWidget";
import ForecastByStageChart from "./ForecastByStageChart";
import MonthlyForecastView from "./MonthlyForecastView";
import ForecastSidebar from "./ForecastSidebar";
import WeightedFunnelChart from "./WeightedFunnelChart";
import { TableSkeleton } from "@/components/common/PageSkeletons";
import { forecastRealTimeService } from "@/lib/services/forecastRealTimeService";
import { Button } from "@/components/ui/button";
import { usePipelineForecast } from "./usePipelineForecast";
import { formatPlainDate } from "@/lib/utils/dateDisplay";

interface ForecastViewProps {
  pipelineId: string;
}

const ForecastView: React.FC<ForecastViewProps> = ({ pipelineId }) => {
  const t = useTranslations("crm.pronostico.pipelineAnalitica");
  const { paraDocumento } = useMonedaOrganizacion();
  const {
    loading,
    error: loadError,
    forecast,
    organizationId,
    retry,
  } = usePipelineForecast(pipelineId, { useGoalCurrency: false });
  const baseCurrency = forecast?.baseCurrency ?? "";
  const forecastData = useMemo(
    () =>
      (forecast?.monthlyForecasts ?? []).map((month) => ({
        ...month,
        opportunities: month.opportunities.map((opportunity) => ({
          ...opportunity,
          probabilityPercent: opportunity.probability,
        })),
      })),
    [forecast],
  );
  const totalForecast = forecast?.totals ?? {
    totalAmount: 0,
    weightedAmount: 0,
    opportunityCount: 0,
  };

  useEffect(() => {
    if (!organizationId || !pipelineId) return;
    forecastRealTimeService.initialize();
    return forecastRealTimeService.subscribeToPipelineChanges(
      pipelineId,
      retry,
    );
  }, [pipelineId, organizationId, retry]);

  // Renderizar el esqueleto de carga
  if (loading) {
    return (
      <div className="p-3 sm:p-4">
        <TableSkeleton columns={6} rows={5} />
      </div>
    );
  }

  // La carga falló: error explícito con reintento, nunca el estado vacío.
  if (loadError) {
    return (
      <div className="p-3 sm:p-4">
        <Card className="p-4" role="alert">
          <p>
            {t(loadError === "organization" ? "sinOrganizacion" : "errorCarga")}
          </p>
          <Button variant="outline" className="mt-3" onClick={retry}>
            {t("reintentar")}
          </Button>
        </Card>
      </div>
    );
  }

  // Si no hay datos de pronóstico
  if (forecastData.length === 0) {
    return (
      <div className="p-3 sm:p-4">
        <Card className="p-6 sm:p-8 text-center bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <h3 className="text-base sm:text-lg font-semibold mb-2 text-gray-900 dark:text-gray-100">
            {t("vacio")}
          </h3>
          <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400">
            {t("vacioDetalle")}
          </p>
        </Card>
      </div>
    );
  }

  // Renderizar el pronóstico
  return (
    <div className="p-3 sm:p-4 space-y-4 sm:space-y-6">
      {/* Sidebar de pronóstico - siempre visible */}
      <ForecastSidebar pipelineId={pipelineId} />

      <div className="flex-1 space-y-4">
        <Tabs defaultValue="chart" className="space-y-4">
          <TabsList className="flex-wrap h-auto gap-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-2">
            <TabsTrigger
              value="chart"
              className="text-xs sm:text-sm min-h-[36px] sm:min-h-[40px] px-3 sm:px-4 data-[state=active]:bg-blue-600 data-[state=active]:text-white text-gray-700 dark:text-gray-300"
            >
              <BarChart3 className="h-4 w-4 mr-1 sm:mr-2" />
              <span className="hidden sm:inline">{t("vistaGrafico")}</span>
              <span className="sm:hidden">{t("grafico")}</span>
            </TabsTrigger>
            <TabsTrigger
              value="monthly"
              className="text-xs sm:text-sm min-h-[36px] sm:min-h-[40px] px-3 sm:px-4 data-[state=active]:bg-blue-600 data-[state=active]:text-white text-gray-700 dark:text-gray-300"
            >
              <LineChart className="h-4 w-4 mr-1 sm:mr-2" />
              <span className="hidden sm:inline">{t("vistaMensual")}</span>
              <span className="sm:hidden">{t("mensual")}</span>
            </TabsTrigger>
            <TabsTrigger
              value="table"
              className="text-xs sm:text-sm min-h-[36px] sm:min-h-[40px] px-3 sm:px-4 data-[state=active]:bg-blue-600 data-[state=active]:text-white text-gray-700 dark:text-gray-300"
            >
              <Calendar className="h-4 w-4 mr-1 sm:mr-2" />
              <span className="hidden sm:inline">{t("vistaTabla")}</span>
              <span className="sm:hidden">{t("tabla")}</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="chart" className="space-y-3 sm:space-y-4">
            <ForecastChart pipelineId={pipelineId} />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
              <ForecastByStageChart pipelineId={pipelineId} />
              <GoalCompletionWidget pipelineId={pipelineId} />
            </div>
            <div className="mt-3 sm:mt-4">
              <WeightedFunnelChart pipelineId={pipelineId} />
            </div>
          </TabsContent>

          <TabsContent value="monthly" className="space-y-4">
            <MonthlyForecastView pipelineId={pipelineId} />
          </TabsContent>

          <TabsContent value="table" className="space-y-4">
            <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
              <div className="p-3 sm:p-4 border-b border-gray-200 dark:border-gray-700">
                <h3 className="text-sm sm:text-base font-semibold text-gray-900 dark:text-gray-100">
                  {t("oportunidadesMes")}
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-700">
                    <tr>
                      <th className="p-2 sm:p-3 text-left text-xs font-semibold text-gray-900 dark:text-gray-100 uppercase tracking-wider">
                        {t("nombre")}
                      </th>
                      <th className="p-2 sm:p-3 text-left text-xs font-semibold text-gray-900 dark:text-gray-100 uppercase tracking-wider hidden sm:table-cell">
                        {t("cliente")}
                      </th>
                      <th className="p-2 sm:p-3 text-left text-xs font-semibold text-gray-900 dark:text-gray-100 uppercase tracking-wider hidden md:table-cell">
                        {t("fechaEsperada")}
                      </th>
                      <th className="p-2 sm:p-3 text-left text-xs font-semibold text-gray-900 dark:text-gray-100 uppercase tracking-wider hidden lg:table-cell">
                        {t("etapa")}
                      </th>
                      <th className="p-2 sm:p-3 text-left text-xs font-semibold text-gray-900 dark:text-gray-100 uppercase tracking-wider">
                        {t("monto")}
                      </th>
                      <th className="p-2 sm:p-3 text-left text-xs font-semibold text-gray-900 dark:text-gray-100 uppercase tracking-wider">
                        {t("probabilidad")}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {forecastData.flatMap((month) =>
                      month.opportunities.map((opp) => (
                        <tr
                          key={opp.id}
                          className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                        >
                          <td className="p-2 sm:p-3 text-xs sm:text-sm text-gray-900 dark:text-gray-100">
                            <div className="flex flex-col">
                              <span className="font-medium">{opp.name}</span>
                              <span className="sm:hidden text-gray-600 dark:text-gray-400 text-xs mt-1">
                                {opp.customer_name}
                              </span>
                            </div>
                          </td>
                          <td className="p-2 sm:p-3 text-xs sm:text-sm text-gray-700 dark:text-gray-300 hidden sm:table-cell">
                            {opp.customer_name}
                          </td>
                          <td className="p-2 sm:p-3 text-xs sm:text-sm text-gray-700 dark:text-gray-300 hidden md:table-cell">
                            {opp.expected_close_date
                              ? formatPlainDate(opp.expected_close_date)
                              : t("sinFecha")}
                          </td>
                          <td className="p-2 sm:p-3 text-xs sm:text-sm text-gray-700 dark:text-gray-300 hidden lg:table-cell">
                            {opp.stage_name}
                          </td>
                          <td className="p-2 sm:p-3 text-xs sm:text-sm font-semibold text-gray-900 dark:text-gray-100">
                            {opp.currency === baseCurrency ? (
                              formatMoneda(
                                opp.convertedAmount ?? opp.amount,
                                paraDocumento(baseCurrency),
                              )
                            ) : (
                              <>
                                <div>
                                  {formatMoneda(
                                    opp.amount,
                                    paraDocumento(opp.currency),
                                  )}
                                </div>
                                <div className="text-xs text-gray-600 dark:text-gray-400">
                                  (
                                  {formatMoneda(
                                    opp.convertedAmount ?? opp.amount,
                                    paraDocumento(baseCurrency),
                                  )}
                                  )
                                </div>
                              </>
                            )}
                          </td>
                          <td className="p-2 sm:p-3 text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300">
                            {Math.round(opp.probabilityPercent)}%
                          </td>
                        </tr>
                      )),
                    )}
                  </tbody>
                  <tfoot className="bg-gray-50 dark:bg-gray-900/50 border-t border-gray-200 dark:border-gray-700">
                    <tr>
                      <td
                        colSpan={4}
                        className="p-2 sm:p-3 text-xs sm:text-sm font-semibold text-right text-gray-900 dark:text-gray-100"
                      >
                        {t("total")}:
                      </td>
                      <td className="p-2 sm:p-3 text-xs sm:text-sm font-bold text-gray-900 dark:text-gray-100">
                        {formatMoneda(
                          totalForecast.totalAmount,
                          paraDocumento(baseCurrency),
                        )}
                      </td>
                      <td className="p-2 sm:p-3 text-xs sm:text-sm"></td>
                    </tr>
                    <tr>
                      <td
                        colSpan={4}
                        className="p-2 sm:p-3 text-xs sm:text-sm font-semibold text-right text-gray-900 dark:text-gray-100"
                      >
                        {t("ponderado")}:
                      </td>
                      <td className="p-2 sm:p-3 text-xs sm:text-sm font-bold text-blue-600 dark:text-blue-400">
                        {formatMoneda(
                          totalForecast.weightedAmount,
                          paraDocumento(baseCurrency),
                        )}
                      </td>
                      <td className="p-2 sm:p-3 text-xs sm:text-sm"></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default ForecastView;
