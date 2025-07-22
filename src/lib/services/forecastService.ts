/**
 * Servicio para los cálculos de pronóstico (forecast) de oportunidades
 * Este servicio maneja los cálculos y transformaciones para generar pronósticos
 * mensuales basados en oportunidades, etapas y probabilidades.
 */

import { supabase } from "@/lib/supabase/config";
import { getOrganizationId } from "./kanbanService";
import { currencyService } from "./currencyService";

// Tipos necesarios para el servicio
export interface MonthlyForecast {
  month: string; // formato: YYYY-MM
  monthName: string; // formato: Enero 2025
  totalValue: number; // valor bruto
  weightedValue: number; // valor ponderado por probabilidad
  opportunityCount: number;
  opportunities: ForecastOpportunity[];
}

export interface ForecastOpportunity {
  id: string;
  name: string;
  amount: number;
  currency: string;
  convertedAmount: number; // monto convertido a la moneda base si es necesario
  expected_close_date: string | null;
  stage_id: string;
  stage_name?: string;
  probability: number; // valor decimal (0-1)
  weightedAmount: number; // monto ponderado por probabilidad
  customer_name?: string;
  status: string;
}

export interface ForecastTotals {
  totalAmount: number; // suma de todos los montos sin ponderar
  weightedAmount: number; // suma de todos los montos ponderados
  opportunityCount: number; // total de oportunidades
  currencyDistribution: Record<string, number>; // distribución por moneda
}

export interface ForecastResult {
  monthlyForecasts: MonthlyForecast[];
  totals: ForecastTotals;
  baseCurrency: string; // moneda base para conversiones
}

/**
 * Obtiene datos de pronóstico mensual para un pipeline específico
 * @param pipelineId - ID del pipeline
 * @param options - Opciones de configuración
 * @returns Resultado del pronóstico con datos mensuales y totales
 */
export const getMonthlyForecast = async (
  pipelineId: string,
  options: {
    baseCurrency?: string; // moneda base para conversiones
    startDate?: Date; // fecha de inicio para el pronóstico
    endDate?: Date; // fecha de fin para el pronóstico
    includeWon?: boolean; // incluir oportunidades ganadas
    includeLost?: boolean; // incluir oportunidades perdidas
  } = {}
): Promise<ForecastResult | null> => {
  try {
    // Valores predeterminados
    const baseCurrency = options.baseCurrency || "COP";
    const includeWon = options.includeWon ?? true;
    const includeLost = options.includeLost ?? false;
    const now = new Date();
    const startDate = options.startDate || new Date(now.getFullYear(), now.getMonth(), 1);
    const endDate = options.endDate || new Date(now.getFullYear() + 1, now.getMonth(), 0);

    // Obtener el ID de organización
    const organizationId = getOrganizationId();
    if (!organizationId) {
      console.error("No se encontró ID de organización para el pronóstico");
      return null;
    }

    // Construir filtro de estado
    const statusFilter = ["open"];
    if (includeWon) statusFilter.push("won");
    if (includeLost) statusFilter.push("lost");

    // Consulta a Supabase para obtener oportunidades con información de etapas
    const { data, error } = await supabase
      .from("opportunities")
      .select(`
        id, name, amount, currency, expected_close_date, stage_id, status, customer_id,
        stages:stage_id(name, probability),
        customers:customer_id(full_name)
      `)
      .eq("organization_id", organizationId)
      .eq("pipeline_id", pipelineId)
      .in("status", statusFilter)
      .order("expected_close_date");

    if (error) {
      console.error("Error al cargar datos para el pronóstico:", error);
      return null;
    }

    if (!data || data.length === 0) {
      return {
        monthlyForecasts: [],
        totals: {
          totalAmount: 0,
          weightedAmount: 0,
          opportunityCount: 0,
          currencyDistribution: {}
        },
        baseCurrency
      };
    }

    // Procesar y agrupar oportunidades por mes
    return await processOpportunitiesByMonth(data, baseCurrency, organizationId, { startDate, endDate });
  } catch (error) {
    console.error("Error en cálculo de pronóstico mensual:", error);
    return null;
  }
};

/**
 * Procesa las oportunidades y las agrupa por mes para el pronóstico
 * @param data - Datos de oportunidades desde Supabase
 * @param baseCurrency - Moneda base para conversiones
 * @param options - Opciones adicionales
 * @returns Resultado del pronóstico procesado
 */
const processOpportunitiesByMonth = async (
  data: any[],
  baseCurrency: string,
  organizationId: number,
  options: { startDate?: Date; endDate?: Date } = {}
): Promise<ForecastResult> => {
  const monthMap = new Map<string, MonthlyForecast>();
  const currencyDistribution: Record<string, number> = {};
  let totalAmount = 0;
  let weightedAmount = 0;
  let opportunityCount = 0;

  // Crear un grupo para oportunidades sin fecha
  const noDateKey = "sin-fecha";
  monthMap.set(noDateKey, {
    month: noDateKey,
    monthName: "Sin fecha definida",
    totalValue: 0,
    weightedValue: 0,
    opportunityCount: 0,
    opportunities: [],
  });

  // Procesar cada oportunidad de forma asíncrona
  const opportunityObjects: ForecastOpportunity[] = [];
  const processPromises = data.map(async (opp) => {
    const probability = opp.stages ? Number(opp.stages.probability) / 100 : 0;
    const currency = opp.currency || baseCurrency;
    const amount = Number(opp.amount) || 0;
    
    // Convertir monto si es necesario usando el servicio de conversión de moneda
    const convertedAmount = await currencyService.convertAmount(amount, currency, baseCurrency, organizationId);
    
    // Calcular monto ponderado usando la probabilidad
    const weightedAmountForOpp = convertedAmount * probability;

    // Actualizar distribución por moneda
    currencyDistribution[currency] = (currencyDistribution[currency] || 0) + amount;
    
    // Extraer información de etapa y cliente
    const stageName = opp.stages?.name || "Sin etapa";
    const customerName = opp.customers?.full_name || "Sin cliente";
    
    // Crear objeto de oportunidad para el pronóstico
    const opportunity: ForecastOpportunity = {
      id: opp.id,
      name: opp.name,
      amount: amount,
      currency: currency,
      convertedAmount: convertedAmount,
      expected_close_date: opp.expected_close_date,
      stage_id: opp.stage_id,
      stage_name: stageName,
      probability: probability,
      weightedAmount: weightedAmountForOpp,
      customer_name: customerName,
      status: opp.status,
    };

    // Determinar a qué mes pertenece la oportunidad
    let key;
    let monthName;

    // Verificar si tiene fecha de cierre esperada
    if (!opp.expected_close_date) {
      // Sin fecha, agregarlo al grupo especial
      key = noDateKey;
      monthName = "Sin fecha definida";
    } else {
      // Con fecha, procesar normalmente
      const closeDate = new Date(opp.expected_close_date);
      const year = closeDate.getFullYear();
      const month = closeDate.getMonth(); // 0-indexed para arrays
      const monthNames = [
        "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", 
        "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
      ];

      key = `${year}-${String(month + 1).padStart(2, "0")}`;
      monthName = `${monthNames[month]} ${year}`;
    }

    // Guardar la oportunidad procesada para uso posterior
    opportunity.weightedAmount = weightedAmountForOpp;
    opportunity.convertedAmount = convertedAmount;
    opportunityObjects.push(opportunity);

    // Actualizar o crear el grupo del mes
    if (monthMap.has(key)) {
      const monthData = monthMap.get(key)!;
      monthData.totalValue += convertedAmount;
      monthData.weightedValue += weightedAmountForOpp;
      monthData.opportunityCount++;
      monthData.opportunities.push(opportunity);
    } else {
      monthMap.set(key, {
        month: key,
        monthName: monthName,
        totalValue: convertedAmount,
        weightedValue: weightedAmountForOpp,
        opportunityCount: 1,
        opportunities: [opportunity],
      });
    }
  });

  // Esperar a que todas las promesas se completen
  await Promise.all(processPromises);
  
  // Ahora procesamos los objetos de oportunidad y calculamos los totales
  for (const opportunity of opportunityObjects) {
    totalAmount += opportunity.convertedAmount;
    weightedAmount += opportunity.weightedAmount;
    opportunityCount++;
    
    // Actualizar o crear el grupo del mes
    let key = noDateKey;
    let monthName = "Sin fecha definida";
    
    if (opportunity.expected_close_date) {
      const closeDate = new Date(opportunity.expected_close_date);
      key = `${closeDate.getFullYear()}-${String(closeDate.getMonth() + 1).padStart(2, "0")}`;
      const monthNames = [
        "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", 
        "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
      ];
      monthName = `${monthNames[closeDate.getMonth()]} ${closeDate.getFullYear()}`;
    }
    
    // Actualizar el grupo del mes en el mapa
    if (monthMap.has(key)) {
      const monthData = monthMap.get(key)!;
      monthData.totalValue += opportunity.convertedAmount;
      monthData.weightedValue += opportunity.weightedAmount;
      monthData.opportunityCount++;
      monthData.opportunities.push(opportunity);
    } else {
      monthMap.set(key, {
        month: key,
        monthName: monthName,
        totalValue: opportunity.convertedAmount,
        weightedValue: opportunity.weightedAmount,
        opportunityCount: 1,
        opportunities: [opportunity],
      });
    }
  }

  // Convertir el Map a un array y ordenar por mes
  const monthlyForecasts = Array.from(monthMap.values())
    .filter((month) => month.month !== noDateKey) // Filtrar meses reales
    .sort((a, b) => a.month.localeCompare(b.month));

  // Añadir el grupo "sin fecha" al final si tiene oportunidades
  const noDateMonth = monthMap.get(noDateKey);
  if (noDateMonth && noDateMonth.opportunityCount > 0) {
    monthlyForecasts.push(noDateMonth);
  }

  return {
    monthlyForecasts,
    totals: {
      totalAmount,
      weightedAmount,
      opportunityCount,
      currencyDistribution
    },
    baseCurrency
  };
};

/**
 * Obtiene el pronóstico por etapa
 * @param pipelineId - ID del pipeline
 * @param stageId - ID de la etapa
 * @param options - Opciones de configuración
 * @returns Información de pronóstico para la etapa
 */
export const getForecastByStage = async (
  pipelineId: string,
  stageId: string,
  options: {
    baseCurrency?: string;
    includeWon?: boolean;
    includeLost?: boolean;
  } = {}
): Promise<{
  totalAmount: number;
  weightedAmount: number;
  opportunityCount: number;
} | null> => {
  try {
    // Valores predeterminados
    const baseCurrency = options.baseCurrency || "USD";
    const includeWon = options.includeWon ?? true;
    const includeLost = options.includeLost ?? false;

    // Obtener el ID de organización
    const organizationId = getOrganizationId();
    if (!organizationId) {
      console.error("No se encontró ID de organización para el pronóstico por etapa");
      return null;
    }

    // Construir filtro de estado
    const statusFilter = ["open"];
    if (includeWon) statusFilter.push("won");
    if (includeLost) statusFilter.push("lost");

    // Consulta a Supabase
    const { data, error } = await supabase
      .from("opportunities")
      .select(`
        id, amount, currency, stages:stage_id(name, probability)
      `)
      .eq("organization_id", organizationId)
      .eq("pipeline_id", pipelineId)
      .eq("stage_id", stageId)
      .in("status", statusFilter);

    if (error || !data) {
      console.error("Error al obtener pronóstico por etapa:", error);
      return null;
    }

    // Calcular totales
    let totalAmount = 0;
    let weightedAmount = 0;

    // Procesar oportunidades de forma asíncrona
    const processPromises = data.map(async (opp: any) => {
      const amount = Number(opp.amount) || 0;
      const probability = opp.stages ? Number(opp.stages.probability) / 100 : 0;
      const currency = opp.currency || baseCurrency;
      
      // Convertir usando el servicio de moneda
      const convertedAmount = await currencyService.convertAmount(amount, currency, baseCurrency, organizationId);
      
      return {
        totalAmount: convertedAmount,
        weightedAmount: convertedAmount * probability
      };
    });
    
    // Esperar a que todas las conversiones se completen
    const results = await Promise.all(processPromises);
    
    // Sumar los resultados
    for (const result of results) {
      totalAmount += result.totalAmount;
      weightedAmount += result.weightedAmount;
    }

    return {
      totalAmount,
      weightedAmount,
      opportunityCount: data.length
    };
  } catch (error) {
    console.error("Error en cálculo de pronóstico por etapa:", error);
    return null;
  }
};

/**
 * Calcula el pronóstico para una etapa específica
 * @param pipelineId - ID del pipeline
 * @param stageId - ID de la etapa
 * @param options - Opciones para la consulta
 * @returns Información de pronóstico para la etapa
 */
export const calculateStageForecasts = async (
  pipelineId: string,
  stageId: string,
  options: {
    baseCurrency?: string;
    includeWon?: boolean;
  } = {}
): Promise<{
  totalAmount: number;
  weightedAmount: number;
  opportunityCount: number;
} | null> => {
  try {
    const organizationId = getOrganizationId();
    if (!organizationId) return null;

    const baseCurrency = options.baseCurrency || "COP";
    const includeWon = options.includeWon ?? true;
    
    // Filtro de estado
    const statusFilter = ["open"];
    if (includeWon) statusFilter.push("won");

    // Consulta oportunidades por etapa
    const { data, error } = await supabase
      .from("opportunities")
      .select(`
        id, name, amount, currency, stage_id,
        stages:stage_id(probability)
      `)
      .eq("organization_id", organizationId)
      .eq("pipeline_id", pipelineId)
      .eq("stage_id", stageId)
      .in("status", statusFilter);

    if (error || !data) {
      console.error("Error al obtener pronóstico por etapa:", error);
      return null;
    }

    // Calcular totales
    let totalAmount = 0;
    let weightedAmount = 0;

    // Procesar oportunidades de forma asíncrona
    const processPromises = data.map(async (opp: any) => {
      const amount = Number(opp.amount) || 0;
      const probability = opp.stages ? Number(opp.stages.probability) / 100 : 0;
      const currency = opp.currency || baseCurrency;
      
      // Convertir usando el servicio de moneda
      const convertedAmount = await currencyService.convertAmount(amount, currency, baseCurrency, organizationId);
      
      return {
        totalAmount: convertedAmount,
        weightedAmount: convertedAmount * probability
      };
    });
    
    // Esperar a que todas las conversiones se completen
    const results = await Promise.all(processPromises);
    
    // Sumar los resultados
    for (const result of results) {
      totalAmount += result.totalAmount;
      weightedAmount += result.weightedAmount;
    }

    return {
      totalAmount,
      weightedAmount,
      opportunityCount: data.length
    };
  } catch (error) {
    console.error("Error en cálculo de pronóstico por etapa:", error);
    return null;
  }
};

/**
 * Obtiene el pronóstico por etapa
 * @param stageId - ID de la etapa
 * @param options - Opciones de configuración
 * @returns Información de pronóstico para la etapa
 */
export const getStageForecasts = async (
  stageId: string,
  options: {
    baseCurrency?: string;
    includeWon?: boolean;
  } = {}
): Promise<{
  totalAmount: number;
  weightedAmount: number;
  opportunityCount: number;
} | null> => {
  try {
    const organizationId = getOrganizationId();
    if (!organizationId) return null;

    const baseCurrency = options.baseCurrency || "COP";
    const includeWon = options.includeWon ?? true;
    
    // Filtro de estado
    const statusFilter = ["open"];
    if (includeWon) statusFilter.push("won");

    // Consulta oportunidades por etapa
    const { data, error } = await supabase
      .from("opportunities")
      .select(`
        id, name, amount, currency, stage_id,
        stages:stage_id(probability)
      `)
      .eq("organization_id", organizationId)
      .eq("stage_id", stageId)
      .in("status", statusFilter);

    if (error || !data) {
      console.error("Error al obtener pronóstico por etapa:", error);
      return null;
    }

    // Calcular totales
    let totalAmount = 0;
    let weightedAmount = 0;

    // Procesar oportunidades de forma asíncrona
    const processPromises = data.map(async (opp: any) => {
      const amount = Number(opp.amount) || 0;
      const probability = opp.stages ? Number(opp.stages.probability) / 100 : 0;
      const currency = opp.currency || baseCurrency;
      
      // Convertir usando el servicio de moneda
      const convertedAmount = await currencyService.convertAmount(
        amount, 
        currency, 
        baseCurrency, 
        organizationId
      );
      
      return {
        totalAmount: convertedAmount,
        weightedAmount: convertedAmount * probability
      };
    });
    
    // Esperar a que todas las conversiones se completen
    const results = await Promise.all(processPromises);
    
    // Sumar los resultados
    for (const result of results) {
      totalAmount += result.totalAmount;
      weightedAmount += result.weightedAmount;
    }

    return {
      totalAmount,
      weightedAmount,
      opportunityCount: data.length
    };
  } catch (error) {
    console.error("Error en cálculo de pronóstico por etapa:", error);
    return null;
  }
};
