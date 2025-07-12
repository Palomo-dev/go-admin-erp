"use client";

import { useEffect, useState } from "react";
import { DragDropContext, Droppable, DropResult } from "@hello-pangea/dnd";
import { Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase/config";
import { cn } from "@/utils/Utils";
import KanbanColumn from "./KanbanColumn";
import { KanbanSummary } from "./KanbanSummary";
import { useTheme } from "next-themes";
import { handleStageChangeAutomation } from "./OpportunityAutomations";
import { Customer, Opportunity, Stage, Pipeline } from "@/types/crm";

interface KanbanBoardProps {
  showStageManager?: boolean;
}

export function KanbanBoard({ showStageManager = false }: KanbanBoardProps) {
  const [pipeline, setPipeline] = useState<Pipeline | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [processingAutomation, setProcessingAutomation] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { theme } = useTheme();
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Función para asignar colores por defecto según la posición de la etapa
  const getDefaultColorByPosition = (position: number): string => {
    // Colores para diferentes etapas del pipeline
    if (position >= 1000) return "#27ae60"; // Ganado
    if (position >= 999) return "#7f8c8d"; // Perdido
    if (position >= 40) return "#e74c3c"; // Negociación
    if (position >= 30) return "#f39c12"; // Propuesta
    if (position >= 20) return "#2ecc71"; // Contacto Inicial
    return "#3498db"; // Lead (default)
  };

  const getOrganizationId = () => {
    if (typeof window !== "undefined") {
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
          console.error(
            "Error parsing organization data from localStorage",
            err
          );
          return null;
        }
      }
    }
    return null;
  };

  const handleStagesUpdate = () => {
    setRefreshTrigger((prev) => prev + 1);
  };

  const fetchPipelineData = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const organizationId = getOrganizationId();
      if (!organizationId) {
        setError("No se encontró la organización activa");
        setIsLoading(false);
        return;
      }

      // 1. Obtener el pipeline principal (is_default = true) para la organización
      const { data: pipelineData, error: pipelineError } = await supabase
        .from("pipelines")
        .select("id, name")
        .eq("organization_id", organizationId)
        .eq("is_default", true)
        .single();

      if (pipelineError) throw pipelineError;
      if (!pipelineData)
        throw new Error("No se encontró un pipeline por defecto");

      // 2. Obtener todas las etapas del pipeline
      let { data: stagesData, error: stagesError } = await supabase
        .from("stages")
        .select("id, name, position, probability")
        .eq("pipeline_id", pipelineData.id)
        .order("position");

      if (stagesError) throw stagesError;

      // Si no hay etapas, crear algunas por defecto
      if (!stagesData || stagesData.length === 0) {
        const defaultStages = [
          { name: "Lead", position: 10, probability: 10 },
          { name: "Contacto Inicial", position: 20, probability: 25 },
          { name: "Propuesta", position: 30, probability: 50 },
          { name: "Negociación", position: 40, probability: 75 },
          { name: "Ganado", position: 1000, probability: 100 },
          { name: "Perdido", position: 999, probability: 0 }
        ];

        for (const stage of defaultStages) {
          await supabase.from("stages").insert({
            id: crypto.randomUUID(),
            name: stage.name,
            pipeline_id: pipelineData.id,
            position: stage.position,
            probability: stage.probability,
            // Eliminamos el campo color que no existe en la tabla
            // color: stage.color,
            organization_id: organizationId,
            created_at: new Date().toISOString()
          });
        }

        // Volver a obtener las etapas después de crear las predeterminadas
        const { data: refreshedStages, error: refreshError } = await supabase
          .from("stages")
          .select("id, name, position, probability")
          .eq("pipeline_id", pipelineData.id)
          .order("position");

        if (refreshError) throw refreshError;
        if (refreshedStages) {
          // Usar las etapas refrescadas en lugar de las originales
          stagesData = refreshedStages;
        }
      }

      // 3. Obtener oportunidades para cada etapa
      const stagesWithOpportunities = await Promise.all(
        (stagesData || []).map(async (stage) => {
          const { data: opportunities, error: oppsError } = await supabase
            .from("opportunities")
            .select(
              `
              id, name, amount, currency, expected_close_date, status, customer_id,
              created_by, created_at, updated_at,
              customer:customer_id (id, full_name)
            `
            )
            .eq("organization_id", organizationId)
            .eq("stage_id", stage.id);

          if (oppsError) throw oppsError;

          // Asegurar que las oportunidades tengan la propiedad stage_id
          const opportunitiesWithStageId = (opportunities || []).map((opp) => {
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
                // Verificar que customer tenga la propiedad full_name antes de acceder
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
              stage_id: stage.id,
              created_by: opp.created_by,
              created_at: opp.created_at,
              updated_at: opp.updated_at
            };
          });

          return {
            ...stage,
            opportunities: opportunitiesWithStageId,
          };
        })
      );

      // Agregar un color por defecto a cada etapa para la UI
      const stagesWithDefaultColor = stagesWithOpportunities.map(stage => ({
        ...stage,
        color: getDefaultColorByPosition(stage.position)
      }));

      setPipeline({
        id: pipelineData.id,
        name: pipelineData.name,
        stages: stagesWithDefaultColor,
      });
    } catch (err: any) {
      console.error("Error al cargar el pipeline:", err);
      setError(err.message || "Error al cargar los datos del pipeline");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPipelineData();
  }, [refreshTrigger]);

  const handleDragEnd = async (result: DropResult) => {
    // Validación básica para asegurarnos de que el drag terminó en un lugar válido
    if (!result.destination) {
      return;
    }
    
    // Asegurarnos de que destination no sea null en este punto
    const destination = result.destination;

    // Si se soltó en el mismo lugar, no hacemos nada
    if (
      result.destination.droppableId === result.source.droppableId &&
      result.destination.index === result.source.index
    ) {
      return;
    }

    if (!pipeline) return;

    // Crear una copia del pipeline para manipular
    const newPipeline = { ...pipeline };

    // Encontrar los índices de las etapas de origen y destino
    const sourceStageIndex = newPipeline.stages.findIndex(
      (stage) => stage.id === result.source.droppableId
    );
    const destStageIndex = newPipeline.stages.findIndex(
      (stage) => stage.id === destination.droppableId
    );
    
    if (sourceStageIndex === -1 || destStageIndex === -1) return;

    // Asegurar que las etapas tienen un array de oportunidades
    if (!newPipeline.stages[sourceStageIndex].opportunities) {
      newPipeline.stages[sourceStageIndex].opportunities = [];
    }
    if (!newPipeline.stages[destStageIndex].opportunities) {
      newPipeline.stages[destStageIndex].opportunities = [];
    }

    // Encontrar la oportunidad que estamos moviendo
    const opportunityToMove = newPipeline.stages[
      sourceStageIndex
    ].opportunities?.find((opp) => opp.id === result.draggableId);

    if (!opportunityToMove) return;

    // Remover la oportunidad de la etapa de origen
    newPipeline.stages[sourceStageIndex].opportunities = 
      newPipeline.stages[sourceStageIndex].opportunities!.filter(
        (opp) => opp.id !== result.draggableId
      );

    // Añadir la oportunidad a la etapa de destino en la posición correcta
    newPipeline.stages[destStageIndex].opportunities!.splice(
      destination.index,
      0,
      opportunityToMove
    );

    // Actualizar el estado local
    setPipeline(newPipeline);

    // Actualizar en Supabase
    try {
      await supabase
        .from("opportunities")
        .update({ stage_id: destination.droppableId })
        .eq("id", result.draggableId);

      // Oportunidad actualizada en la base de datos
      const finishStage = newPipeline.stages[destStageIndex];
      // Oportunidad movida a nueva etapa

      // Si hay cambios de etapa, ejecutar automatizaciones
      if (result.source.droppableId !== destination.droppableId) {
        const organizationId = getOrganizationId();

        if (organizationId) {
          // Indicar que las automatizaciones están en proceso
          setProcessingAutomation(result.draggableId);
          
          // Ejecutar automatizaciones cuando cambia la etapa
          // Ejecutando automatizaciones para cambio de etapa
          handleStageChangeAutomation({
            opportunityId: result.draggableId,
            fromStageId: result.source.droppableId,
            toStageId: destination.droppableId,
            organizationId: organizationId
          }).then((result) => {
            setProcessingAutomation(null);
            if (!result.success) {
              console.error("Error en automatizaciones:", result.error);
            } else {
              // Automatizaciones ejecutadas correctamente
            }
          }).catch(error => {
            setProcessingAutomation(null);
            console.error("Error al ejecutar automatizaciones:", error);
          });
        }
      }
    } catch (err: any) {
      console.error("Error al actualizar la etapa de la oportunidad:", err);
      // Revertir el estado local si hay error
      fetchPipelineData();
    }
  };

  let StageManagerComponent: any = null;
  if (showStageManager) {
    try {
      // Dynamic import
      StageManagerComponent = require("./StageManager").StageManager;
    } catch (e) {
      console.warn("No se pudo cargar StageManager", e);
    }
  }

  if (!pipeline) {
    return (
      <div className="p-4 text-center">
        <p>No se encontró ningún pipeline. Cree uno nuevo para comenzar.</p>
      </div>
    );
  }
  
  // Calcular el total por etapa
  const stageStats = pipeline.stages.map((stage) => {
    const opportunities = stage.opportunities || [];
    const totalAmount = opportunities.reduce(
      (sum, opp) => sum + (parseFloat(opp.amount?.toString() || "0") || 0),
      0
    );

    // Calcular el pronóstico basado en la probabilidad de la etapa
    const forecast = (totalAmount * (stage.probability || 0)) / 100;

    return {
      id: stage.id,
      name: stage.name,
      count: opportunities.length,
      totalAmount,
      forecast,
    };
  });

  return (
    <div className="h-full">
      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : error ? (
        <div className="bg-destructive/20 p-4 rounded-md text-center">
          <p className="text-destructive font-medium">Error: {error}</p>
        </div>
      ) : (
        <>
          {showStageManager && StageManagerComponent && (
            <StageManagerComponent 
              pipeline={pipeline} 
              onPipelineChange={setPipeline} 
              onStagesUpdate={handleStagesUpdate}
            />
          )}
          <KanbanSummary stages={stageStats} />

          <DragDropContext onDragEnd={handleDragEnd}>
            <div className="flex overflow-x-auto pb-4 gap-4">
              {pipeline.stages.map((stage) => {
                const opportunities = stage.opportunities || [];
                const stageTotal = opportunities.reduce(
                  (sum, opp) => sum + (parseFloat(opp.amount?.toString() || "0") || 0),
                  0
                );
                
                // Función para actualizar una etapa específica
                const handleStageUpdate = (updatedStage: Stage) => {
                  // Crear una copia del pipeline
                  const updatedPipeline = { ...pipeline };
                  // Encontrar el índice de la etapa a actualizar
                  const stageIndex = updatedPipeline.stages.findIndex(
                    (s) => s.id === updatedStage.id
                  );
                  // Si la etapa existe, actualizarla
                  if (stageIndex !== -1) {
                    updatedPipeline.stages[stageIndex] = {
                      ...updatedPipeline.stages[stageIndex],
                      ...updatedStage,
                    };
                    // Actualizar el pipeline
                    setPipeline(updatedPipeline);
                  }
                };
                return (
                  <div key={stage.id} className="min-w-[300px] max-w-[300px]">
                    <KanbanColumn 
                      stage={stage} 
                      opportunities={opportunities}
                      stageTotal={stageTotal}
                      onOpportunityDrop={async (opportunityId: string, sourceStageId: string, destinationStageId: string) => {
                        // Esta función ya se maneja en handleDragEnd
                        // Se incluye para cumplir con la interfaz
                      }}
                      isLoading={isLoading}
                      onStageUpdate={handleStageUpdate}
                    />
                  </div>
                );
              })}
            </div>
          </DragDropContext>

        </>
      )}
    </div>
  );
}
