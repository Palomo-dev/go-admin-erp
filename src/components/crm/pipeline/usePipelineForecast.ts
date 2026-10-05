"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useOrganization } from "@/lib/hooks/useOrganization";
import { useFormatDate } from "@/lib/context/OrganizationTimezoneContext";
import {
  getMonthlyForecast,
  getPipelineGoal,
  type ForecastResult,
  type PipelineGoal,
} from "@/lib/services/forecastService";
import { toast } from "@/components/ui/use-toast";
import { rangoMetaPronostico } from "./forecastPresentacion";

/** Una misma lectura para el gráfico, la meta y la tabla del pipeline. */
export function usePipelineForecast(
  pipelineId: string,
  { goalPeriodOnly = false, useGoalCurrency = true } = {},
) {
  const { organization, isLoading: organizationLoading } = useOrganization();
  const organizationId = organization?.id;
  const { getToday } = useFormatDate();
  const locale = useLocale();
  const t = useTranslations("crm.pronostico.pipelineAnalitica");
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<{
    loading: boolean;
    error: "organization" | "load" | null;
    goal: PipelineGoal | null;
    forecast: ForecastResult | null;
  }>({ loading: true, error: null, goal: null, forecast: null });

  useEffect(() => {
    let cancelled = false;
    setState({ loading: true, error: null, goal: null, forecast: null });
    if (organizationLoading) return;
    if (!organizationId || !pipelineId) {
      setState({
        loading: false,
        error: "organization",
        goal: null,
        forecast: null,
      });
      return;
    }

    const load = async () => {
      try {
        const goal = await getPipelineGoal(pipelineId);
        if (cancelled) return;
        const range =
          goalPeriodOnly && goal
            ? rangoMetaPronostico(getToday(), goal.goalPeriod)
            : {};
        const forecast = await getMonthlyForecast(pipelineId, {
          baseCurrency: useGoalCurrency
            ? (goal?.goalCurrency ?? undefined)
            : undefined,
          includeWon: false,
          includeLost: false,
          locale,
          noDateLabel: t("sinFecha"),
          ...range,
        });
        if (!forecast) throw new Error("pronostico_no_disponible");
        if (!cancelled)
          setState({ loading: false, error: null, goal, forecast });
      } catch {
        if (!cancelled) {
          setState({
            loading: false,
            error: "load",
            goal: null,
            forecast: null,
          });
          toast({
            title: t("errorTitulo"),
            description: t("errorCarga"),
            variant: "destructive",
          });
        }
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [
    pipelineId,
    organizationId,
    organizationLoading,
    getToday,
    locale,
    revision,
    goalPeriodOnly,
    useGoalCurrency,
    t,
  ]);

  const retry = useCallback(() => setRevision((value) => value + 1), []);
  return { ...state, organizationId, retry };
}
