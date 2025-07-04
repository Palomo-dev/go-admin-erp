"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/lib/supabase/config";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency } from "@/utils/Utils";
import { handleStageChangeAutomation } from "./OpportunityAutomations";
import { BarChart3 } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface Stage {
  id: string;
  name: string;
  position: number;
  pipeline_id: string;
}

interface Customer {
  id: string;
  full_name: string;
  email?: string;
  // Eliminamos company ya que no existe en la tabla customers
}

interface Opportunity {
  id: string;
  name: string; // La tabla usa 'name' en lugar de 'title'
  stage_id: string;
  customer_id: string;
  amount: number; // La tabla usa 'amount' en lugar de 'value'
  expected_close_date: string;
  customer: Customer;
  customers?: Customer[];
  status?: string;
  currency?: string;
}

interface PipelineStagesProps {
  pipelineId: string;
}

export default function PipelineStages({ pipelineId }: PipelineStagesProps) {
  const [stages, setStages] = useState<Stage[]>([]);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [organizationId, setOrganizationId] = useState<number | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  // Obtener el ID de la organización y el usuario del localStorage
  useEffect(() => {
    // Primero intentamos con currentOrganizationId (clave principal)
    let orgId = localStorage.getItem("currentOrganizationId");
    
    // Si no se encuentra, intentamos con otras posibles claves
    if (!orgId) {
      orgId = localStorage.getItem("organizacionActiva");
    }
    
    // Si seguimos sin encontrarlo, intentamos con otra posible clave
    if (!orgId) {
      orgId = localStorage.getItem("organizationId");
    }
    
    if (orgId) {
      console.log("ID de organización encontrado:", orgId);
      setOrganizationId(Number(orgId));
    } else {
      console.error("No se pudo encontrar el ID de organización en localStorage");
    }

    // Obtener el ID del usuario actual desde la sesión de Supabase
    const getUserId = async () => {
      const { data } = await supabase.auth.getSession();
      if (data?.session?.user) {
        setUserId(data.session.user.id);
      }
    };

    getUserId();
  }, []);

  // Función para cargar las etapas del pipeline
  const loadStages = async () => {
    if (!pipelineId || !organizationId) return;

    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('stages')
        .select('id, name, position, pipeline_id')
        .eq('pipeline_id', pipelineId)
        .order('position');

      if (error) {
        console.error('Error al cargar etapas:', error);
        return;
      }

      // Asegurarse de que todos los datos tengan el pipeline_id
      const stagesWithPipelineId = data ? data.map((stage) => ({ 
        ...stage, 
        pipeline_id: stage.pipeline_id || pipelineId 
      })) : [];

      setStages(stagesWithPipelineId);
    } catch (err) {
      console.error('Error al cargar etapas:', err);
    } finally {
      setLoading(false);
    }
  };

  // Función para cargar las oportunidades (con useCallback para evitar bucles infinitos)
  const loadOpportunities = useCallback(async () => {
    if (!pipelineId || !organizationId) return;

    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('opportunities')
        .select(`
          id, name, stage_id, customer_id, amount, currency, expected_close_date, status,
          customer:customers!customer_id(id, full_name, email)
        `)
        .eq('pipeline_id', pipelineId)
        .eq('organization_id', organizationId)
        .eq('status', 'open')
        .order('updated_at', { ascending: false });

      if (error) {
        console.error('Error al cargar oportunidades:', error);
        return;
      }

      // Las oportunidades ya vienen con el objeto customer desde Supabase
      const formattedOpps = data ? data.map((opp: any) => {
        // Si no hay datos del cliente, proporcionamos un valor predeterminado
        if (!opp.customer) {
          return {
            ...opp,
            customer: { id: opp.customer_id, full_name: "Cliente sin nombre" }
          };
        }
        return opp;
      }) : [];

      setOpportunities(formattedOpps);
    } catch (err) {
      console.error('Error al cargar oportunidades:', err);
    } finally {
      setLoading(false);
    }
  }, [pipelineId, organizationId]);

  // Cargar datos iniciales cuando el componente se monta
  useEffect(() => {
    if (pipelineId) {
      loadStages();
      loadOpportunities();
    }
  }, [pipelineId, organizationId]);

  // Escuchar el evento para recargar datos cuando se crea una nueva oportunidad
  useEffect(() => {    
    const handleRefresh = () => {
      console.log('Recargando datos del pipeline después de nueva oportunidad');
      loadOpportunities();
    };
    
    window.addEventListener('refresh-pipeline-data', handleRefresh);
    
    // Eliminar el listener al desmontar
    return () => {
      window.removeEventListener('refresh-pipeline-data', handleRefresh);
    };
  }, [loadOpportunities]);


  // Filtrar las oportunidades por etapa
  const getOpportunitiesByStage = (stageId: string) => {
    return opportunities.filter((opportunity) => opportunity.stage_id === stageId);
  };

  // Calcular el valor total de las oportunidades en una etapa
  const calculateStageValue = (stageId: string): number => {
    const stageOpportunities = getOpportunitiesByStage(stageId);
    return stageOpportunities.reduce((total, opp) => {
      // Calcular el valor usando el campo amount
      const weightedValue = opp.amount; // Ya no usamos probability
      return total + weightedValue;
    }, 0);
  };

  // Calcular el valor total del pipeline completo
  const totalPipelineValue = useMemo(() => {
    return opportunities.reduce((total, opp) => total + (opp.amount || 0), 0);
  }, [opportunities]);

  // Calcular el valor ponderado total del pipeline (considerando probabilidades)
  const weightedPipelineValue = useMemo(() => {
    return opportunities.reduce((total, opp) => {
      const weightedValue = opp.amount; // Ya no usamos probability
      return total + weightedValue;
    }, 0);
  }, [opportunities]);

  // Manejar el arrastre y soltar de oportunidades entre etapas
  const handleDragEnd = async (result: any) => {
    if (!result.destination || !userId) return;

    const { draggableId, source, destination } = result;

    // Si la oportunidad se soltó en la misma etapa, no hacemos nada
    if (source.droppableId === destination.droppableId) return;

    // Obtener el ID de la oportunidad y las etapas de origen y destino
    const opportunityId = draggableId;
    const fromStageId = source.droppableId;
    const toStageId = destination.droppableId;

    // Encontrar la oportunidad que se movió
    const movedOpportunity = opportunities.find((opp) => opp.id === opportunityId);
    if (!movedOpportunity) return;

    // Actualizar localmente para una respuesta inmediata en la UI
    setOpportunities((prevOpps) =>
      prevOpps.map((opp) => (opp.id === opportunityId ? { ...opp, stage_id: toStageId } : opp))
    );

    // Actualizar en la base de datos
    const { error } = await supabase
      .from("opportunities")
      .update({ stage_id: toStageId })
      .eq("id", opportunityId);

    if (error) {
      console.error("Error al actualizar la etapa de la oportunidad:", error);
      // Revertir el cambio local en caso de error
      setOpportunities((prevOpps) =>
        prevOpps.map((opp) => (opp.id === opportunityId ? { ...opp, stage_id: fromStageId } : opp))
      );
      return;
    }

    // Encontrar nombres de etapas para el registro
    const fromStage = stages.find((stage) => stage.id === fromStageId);
    const toStage = stages.find((stage) => stage.id === toStageId);

    // Ejecutar automatizaciones (tareas, notificaciones, etc.)
    if (fromStage && toStage && organizationId && userId) {
      await handleStageChangeAutomation({
        opportunityId: movedOpportunity.id,
        opportunityTitle: movedOpportunity.name,
        customerId: movedOpportunity.customer_id,
        customerName: movedOpportunity.customer.full_name,
        stageId: result.destination.droppableId,
        stageName: toStage.name,
        userId: userId,
        pipelineId: pipelineId,
        organizationId: organizationId,
      });
    }
  };

  // Mostrar esqueletos mientras se cargan los datos
  if (loading) {
    return (
      <div className="flex flex-wrap gap-6 p-6 overflow-x-auto">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="flex-shrink-0 w-72">
            <Skeleton className="h-10 w-full mb-4" />
            <Skeleton className="h-32 w-full mb-3" />
            <Skeleton className="h-32 w-full" />
          </div>
        ))}
      </div>
    );
  }
  
  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <div className="flex gap-6 p-6 overflow-x-auto min-h-[calc(100vh-10rem)] bg-gray-50 dark:bg-gray-900 transition-colors duration-200">
        {stages.map((stage) => (
          <div 
            key={stage.id} 
            className="flex-shrink-0 w-72 bg-white dark:bg-gray-800 rounded-lg shadow-sm transition-all duration-200"
          >
            <div className="p-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <h3 className="font-semibold text-gray-800 dark:text-gray-200">
                {stage.name}
              </h3>
              <div className="flex items-center gap-2">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger>
                      <Badge variant="outline" className="text-xs bg-gray-100 dark:bg-gray-700">
                        {getOpportunitiesByStage(stage.id).length}
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Número de oportunidades</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            </div>
            
            {/* Mostrar valor total de etapa */}
            <div className="px-3 py-2 bg-gray-50 dark:bg-gray-700/50 flex justify-between items-center text-sm border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center">
                <BarChart3 className="h-4 w-4 text-blue-500 dark:text-blue-400 mr-1.5" />
                <span className="text-gray-600 dark:text-gray-300">Valor total:</span>
              </div>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger>
                    <span className="font-medium text-blue-600 dark:text-blue-400">
                      {formatCurrency(calculateStageValue(stage.id))}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Valor ponderado por probabilidad</p>
                    <p className="text-xs text-gray-500">Total sin ponderar: {formatCurrency(getOpportunitiesByStage(stage.id).reduce((acc, opp) => acc + (opp.amount || 0), 0))}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            
            <Droppable droppableId={stage.id}>
              {(provided) => (
                <div 
                  {...provided.droppableProps}
                  ref={provided.innerRef}
                  className="min-h-[12rem] p-2 overflow-y-auto"
                >
                  {getOpportunitiesByStage(stage.id).map((opportunity, index) => (
                    <Draggable 
                      key={opportunity.id} 
                      draggableId={opportunity.id} 
                      index={index}
                    >
                      {(provided) => (
                        <Card
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                          {...provided.dragHandleProps}
                          className="p-3 mb-2 border border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-700 cursor-pointer transition-colors duration-200"
                        >
                          <h4 className="font-medium text-gray-900 dark:text-gray-100">
                            {opportunity.name}
                          </h4>
                          
                          <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                            {opportunity.customer?.full_name || 'Cliente no especificado'}
                          </div>
                          
                          <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-100 dark:border-gray-700">
                            <div className="text-blue-600 dark:text-blue-400 font-medium">
                              {formatCurrency(opportunity.amount)}
                            </div>
                            <Badge 
                              className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
                            >
                              {opportunity.status || 'activo'}
                            </Badge>
                          </div>
                        </Card>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </div>
        ))}
      </div>
    </DragDropContext>
  );
}
