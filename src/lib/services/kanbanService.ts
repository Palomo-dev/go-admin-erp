/**
 * Servicio para gestionar las operaciones relacionadas con el tablero Kanban
 * Este servicio maneja la recuperación y actualización de datos para pipelines,
 * etapas y oportunidades usando Supabase.
 */

import { supabase } from "@/lib/supabase/config";
import { Customer, Opportunity, Stage, Pipeline } from "@/types/crm";
import { currencyService } from "./currencyService";

/**
 * Obtiene el ID de la organización actualmente seleccionada
 * @returns ID de la organización o null si no se encuentra
 */
export const getOrganizationId = (): number | null => {
  if (typeof window === "undefined") return null;
  
  // Intentar obtener primero de currentOrganizationId
  const orgId = localStorage.getItem("currentOrganizationId");
  if (orgId) {
    return Number(orgId);
  }
  
  // Si no existe, intentar el formato alternativo
  const orgData = localStorage.getItem("organizacionActiva");
  if (orgData) {
    try {
      const parsed = JSON.parse(orgData);
      return parsed?.id || null;
    } catch (err) {
      console.error("Error al analizar datos de organización del localStorage", err);
      return null;
    }
  }
  return null;
};

/**
 * Obtiene un pipeline por su ID
 * @param pipelineId - ID del pipeline a obtener
 * @returns El pipeline con sus etapas o null si hay error
 */
export const getPipelineById = async (pipelineId: string): Promise<Pipeline | null> => {
  try {
    const { data: pipelineData, error: pipelineError } = await supabase
      .from("pipelines")
      .select("id, name")
      .eq("id", pipelineId)
      .single();

    if (pipelineError) throw pipelineError;
    if (!pipelineData) return null;

    // Obtener etapas del pipeline
    const { data: stagesData, error: stagesError } = await supabase
      .from("stages")
      .select("id, name, position, probability")
      .eq("pipeline_id", pipelineId)
      .order("position");

    if (stagesError) throw stagesError;

    // Asignar colores por defecto a las etapas
    const stagesWithColor = (stagesData || []).map(stage => ({
      ...stage,
      color: getDefaultColorByPosition(stage.position),
      opportunities: []
    }));

    return {
      id: pipelineData.id,
      name: pipelineData.name,
      stages: stagesWithColor
    };
  } catch (err) {
    console.error("Error al obtener el pipeline:", err);
    return null;
  }
};

/**
 * Obtiene el pipeline predeterminado de una organización
 * @param organizationId - ID de la organización
 * @returns El pipeline predeterminado con sus etapas o null si hay error
 */
export const getDefaultPipeline = async (organizationId?: number): Promise<Pipeline | null> => {
  try {
    const orgId = organizationId || getOrganizationId();
    if (!orgId) {
      throw new Error("No se encontró la organización activa");
    }

    const { data: pipelineData, error: pipelineError } = await supabase
      .from("pipelines")
      .select("id, name")
      .eq("organization_id", orgId)
      .eq("is_default", true)
      .single();

    if (pipelineError) throw pipelineError;
    if (!pipelineData) {
      throw new Error("No se encontró un pipeline por defecto");
    }

    return await getPipelineById(pipelineData.id);
  } catch (err: any) {
    console.error("Error al obtener el pipeline predeterminado:", err);
    return null;
  }
};

/**
 * Carga todas las etapas de un pipeline con sus oportunidades
 * @param pipelineId - ID del pipeline
 * @returns Etapas del pipeline con sus oportunidades o null si hay error
 */
export const getStagesWithOpportunities = async (pipelineId: string): Promise<Stage[] | null> => {
  try {
    const organizationId = getOrganizationId();
    if (!organizationId) {
      throw new Error("No se encontró la organización activa");
    }

    // 1. Obtener etapas del pipeline
    const { data: stagesData, error: stagesError } = await supabase
      .from("stages")
      .select("id, name, position, probability")
      .eq("pipeline_id", pipelineId)
      .order("position");

    if (stagesError) throw stagesError;
    
    if (!stagesData || stagesData.length === 0) {
      return await createDefaultStages(pipelineId, organizationId);
    }

    // 2. Para cada etapa, obtener sus oportunidades
    const stagesWithOpportunities = await Promise.all(
      stagesData.map(async (stage) => {
        const opportunities = await getOpportunitiesByStage(stage.id, organizationId);
        return {
          ...stage,
          color: getDefaultColorByPosition(stage.position),
          opportunities
        };
      })
    );

    return stagesWithOpportunities;
  } catch (err) {
    console.error("Error al obtener etapas con oportunidades:", err);
    return null;
  }
};

/**
 * Obtiene las oportunidades para una etapa específica
 * @param stageId - ID de la etapa
 * @param organizationId - ID de la organización
 * @returns Lista de oportunidades para la etapa
 */
export const getOpportunitiesByStage = async (stageId: string, organizationId: number): Promise<Opportunity[]> => {
  try {
    const { data: opportunities, error: oppsError } = await supabase
      .from("opportunities")
      .select(`
        id, name, amount, currency, expected_close_date, status, customer_id,
        created_by, created_at, updated_at,
        customer:customer_id (id, full_name)
      `)
      .eq("organization_id", organizationId)
      .eq("stage_id", stageId);

    if (oppsError) throw oppsError;

    // Formatear las oportunidades para manejar correctamente el campo customer
    return (opportunities || []).map((opp) => {
      // Fix para el customer - verificamos si es un array o un objeto
      let customerObj = null;
      if (opp.customer) {
        if (Array.isArray(opp.customer)) {
          // Si es un array, tomamos el primer elemento
          customerObj = opp.customer[0] ? {
            id: opp.customer_id,
            full_name: opp.customer[0].full_name
          } : null;
        } else {
          // Si es un objeto, lo usamos directamente
          const customerName = opp.customer && typeof opp.customer === 'object' ? 
            (opp.customer as any).full_name || 'Cliente sin nombre' : 'Cliente sin nombre';
            
          customerObj = {
            id: opp.customer_id,
            full_name: customerName
          };
        }
      }

      return {
        id: opp.id,
        name: opp.name,
        amount: opp.amount,
        currency: opp.currency,
        expected_close_date: opp.expected_close_date,
        status: opp.status,
        customer_id: opp.customer_id,
        customer: customerObj,
        stage_id: stageId,
        created_by: opp.created_by,
        created_at: opp.created_at,
        updated_at: opp.updated_at
      };
    });
  } catch (err) {
    console.error(`Error al obtener oportunidades para etapa ${stageId}:`, err);
    return [];
  }
};

/**
 * Función para crear etapas predeterminadas para un pipeline
 * @param pipelineId - ID del pipeline
 * @param organizationId - ID de la organización
 * @returns Lista de etapas creadas con sus oportunidades
 */
export const createDefaultStages = async (pipelineId: string, organizationId: number): Promise<Stage[]> => {
  const defaultStages = [
    { name: "Lead", position: 10, probability: 10 },
    { name: "Contacto Inicial", position: 20, probability: 25 },
    { name: "Propuesta", position: 30, probability: 50 },
    { name: "Negociación", position: 40, probability: 75 },
    { name: "Ganado", position: 1000, probability: 100 },
    { name: "Perdido", position: 999, probability: 0 }
  ];

  try {
    // Crear cada etapa en la base de datos
    for (const stage of defaultStages) {
      await supabase.from("stages").insert({
        id: crypto.randomUUID(),
        name: stage.name,
        pipeline_id: pipelineId,
        position: stage.position,
        probability: stage.probability,
        organization_id: organizationId,
        created_at: new Date().toISOString()
      });
    }

    // Obtener las etapas recién creadas
    const { data: createdStages, error } = await supabase
      .from("stages")
      .select("id, name, position, probability")
      .eq("pipeline_id", pipelineId)
      .order("position");

    if (error) throw error;
    
    // Devolver las etapas con oportunidades vacías y colores por defecto
    return (createdStages || []).map(stage => ({
      ...stage,
      color: getDefaultColorByPosition(stage.position),
      opportunities: []
    }));
  } catch (err) {
    console.error("Error al crear etapas predeterminadas:", err);
    return [];
  }
};

/**
 * Función para asignar colores por defecto según la posición de la etapa
 * @param position - Posición de la etapa
 * @returns Código de color para la etapa
 */
export const getDefaultColorByPosition = (position: number): string => {
  // Colores para diferentes etapas del pipeline
  if (position >= 1000) return "#27ae60"; // Ganado
  if (position >= 999) return "#7f8c8d"; // Perdido
  if (position >= 40) return "#e74c3c"; // Negociación
  if (position >= 30) return "#f39c12"; // Propuesta
  if (position >= 20) return "#2ecc71"; // Contacto Inicial
  return "#3498db"; // Lead (default)
};

/**
 * Carga los datos completos del pipeline y sus oportunidades
 * @param organizationId - ID de la organización (opcional)
 * @returns Datos completos del pipeline o null si hay error
 */
export const loadPipelineData = async (organizationId?: number): Promise<Pipeline | null> => {
  try {
    const orgId = organizationId || getOrganizationId();
    if (!orgId) {
      throw new Error("No se encontró la organización activa");
    }

    // 1. Obtener el pipeline predeterminado
    const defaultPipeline = await getDefaultPipeline(orgId);
    if (!defaultPipeline) return null;

    // 2. Cargar etapas con oportunidades
    const stagesWithOpportunities = await getStagesWithOpportunities(defaultPipeline.id);
    
    // 3. Retornar el pipeline completo con las etapas y oportunidades
    return {
      ...defaultPipeline,
      stages: stagesWithOpportunities || []
    };
  } catch (err: any) {
    console.error("Error al cargar datos del pipeline:", err);
    return null;
  }
};

/**
 * Actualiza la etapa de una oportunidad
 * @param opportunityId - ID de la oportunidad
 * @param stageId - ID de la nueva etapa
 * @returns Objeto con resultado de la operación
 */
export const updateOpportunityStage = async (
  opportunityId: string,
  stageId: string
): Promise<{ success: boolean; error?: string }> => {
  try {
    const { error } = await supabase
      .from("opportunities")
      .update({ stage_id: stageId, updated_at: new Date().toISOString() })
      .eq("id", opportunityId);

    if (error) throw error;
    
    return { success: true };
  } catch (err: any) {
    console.error("Error al actualizar la etapa de la oportunidad:", err);
    return { 
      success: false, 
      error: err.message || "Error al actualizar la etapa de la oportunidad"
    };
  }
};

/**
 * Calcula estadísticas para cada etapa del pipeline
 * @param stages - Lista de etapas con oportunidades
 * @param baseCurrency - Moneda base para conversión (opcional)
 * @returns Estadísticas calculadas para cada etapa
 */
export const calculateStageStatistics = async (stages: Stage[], baseCurrency?: string, organizationId?: number) => {
  // Usar COP como moneda base por defecto si no se especifica
  const targetCurrency = baseCurrency || "COP";
  
  // Obtener organizationId si no se proporciona
  const orgId = organizationId || getOrganizationId();
  if (!orgId) {
    console.error("No se pudo obtener el ID de organización para las estadísticas de etapa");
    return [];
  }

  // Procesar cada etapa de manera asíncrona
  const stagePromises = stages.map(async (stage) => {
    const opportunities = stage.opportunities || [];
    
    // Procesar cada oportunidad para convertir su moneda
    const oppPromises = opportunities.map(async (opp) => {
      const amount = parseFloat(opp.amount?.toString() || "0") || 0;
      const currency = opp.currency || targetCurrency;
      
      // Convertir el monto a la moneda base usando el servicio de moneda
      return await currencyService.convertAmount(amount, currency, targetCurrency, orgId);
    });
    
    // Esperar a que se conviertan todos los montos
    const convertedAmounts = await Promise.all(oppPromises);
    
    // Sumar todos los montos convertidos
    const totalAmount = convertedAmounts.reduce((sum, amount) => sum + amount, 0);

    // Calcular el pronóstico basado en la probabilidad de la etapa
    const forecast = (totalAmount * (stage.probability || 0)) / 100;

    return {
      id: stage.id,
      name: stage.name,
      count: opportunities.length,
      totalAmount,
      forecast,
      currency: targetCurrency,
    };
  });
  
  // Resolver todas las promesas para cada etapa
  return await Promise.all(stagePromises);
};
