"use client";

import { useEffect, useState, useRef } from "react";
import { DragDropContext, Droppable, DropResult } from "@hello-pangea/dnd";
import { Loader2, RefreshCw } from "lucide-react";
import { cn } from "@/utils/Utils";
import KanbanColumn from "./KanbanColumn";
import { KanbanSummary } from "./KanbanSummary";
import { useTheme } from "next-themes";
import { handleStageChangeAutomation } from "./OpportunityAutomations";
import { Customer, Opportunity, Stage, Pipeline, OpportunityBase } from "@/types/crm";
import { 
  loadPipelineData, 
  updateOpportunityStage, 
  calculateStageStatistics,
  getOrganizationId 
} from "@/lib/services/kanbanService";
import { 
  RealtimeSubscription, 
  subscribeToOpportunities,
  subscribeToStages,
  RealtimeChangeHandler
} from "@/lib/services/realtimeService";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/use-toast";
import { translateOpportunityStatus } from '@/utils/crmTranslations';

interface KanbanBoardProps {
  showStageManager?: boolean;
}

// Tipo para las estadísticas de etapas
interface StageStats {
  id: string;
  name: string;
  count: number;
  totalAmount: number;
  forecast: number;
  currency: string;
}

export function KanbanBoard({ showStageManager = false }: KanbanBoardProps) {
  const [pipeline, setPipeline] = useState<Pipeline | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [processingAutomation, setProcessingAutomation] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stageStats, setStageStats] = useState<StageStats[]>([]);
  const { theme } = useTheme();
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [realtimeEnabled, setRealtimeEnabled] = useState(true);
  
  // Referencias para mantener suscripciones activas
  const stagesSubscriptionRef = useRef<RealtimeSubscription | null>(null);
  const opportunitiesSubscriptionsRef = useRef<Record<string, RealtimeSubscription>>({});

  // Esta función ahora se importa desde kanbanService

  const handleStagesUpdate = () => {
    setRefreshTrigger((prev) => prev + 1);
  };

  const fetchPipelineData = async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Utilizamos el servicio kanban para cargar todos los datos del pipeline
      const pipelineData = await loadPipelineData();
      
      if (!pipelineData) {
        setError("No se pudo cargar el pipeline. Verifique que exista un pipeline predeterminado.");
        return;
      }
      
      // Actualizamos el estado con los datos del pipeline
      setPipeline(pipelineData);
      
      // Cargar las estadísticas de las etapas de forma asíncrona
      try {
        const stats = await calculateStageStatistics(pipelineData.stages);
        setStageStats(stats);
      } catch (statsErr: any) {
        console.error("Error al cargar estadísticas de etapas:", statsErr);
        // No mostrar error al usuario, usar array vacío como fallback
        setStageStats([]);
      }
    } catch (err: any) {
      console.error("Error al cargar el pipeline:", err);
      setError(err.message || "Error al cargar los datos del pipeline");
    } finally {
      setIsLoading(false);
    }
  };

  // Función para configurar las suscripciones en tiempo real
  const setupRealtimeSubscriptions = () => {
    if (!realtimeEnabled || !pipeline || !pipeline.id) return;
    
    // Cancelar suscripciones previas
    cleanupRealtimeSubscriptions();

    // Suscribirse a cambios en las etapas del pipeline
    stagesSubscriptionRef.current = subscribeToStages(pipeline.id, {
      onInsert: (newStage) => {
        // Cuando se inserta una nueva etapa, actualizamos el pipeline
        console.log('Nueva etapa creada:', newStage);
        setPipeline(prev => {
          if (!prev) return prev;
          // Convertir el objeto StageRecord a un objeto Stage completo
          const completeStage: Stage = {
            id: newStage.id,
            pipeline_id: newStage.pipeline_id,
            name: newStage.name || 'Nueva etapa',
            position: newStage.position || 0,
            probability: newStage.probability || 0,
            color: newStage.color,
            description: newStage.description,
            opportunities: []
          };
          return {
            ...prev,
            stages: [...prev.stages, completeStage]
          };
        });
      },
      onUpdate: (updatedStage) => {
        // Cuando se actualiza una etapa existente
        console.log('Etapa actualizada:', updatedStage);
        setPipeline(prev => {
          if (!prev) return prev;
          return {
            ...prev,
            stages: prev.stages.map(stage => 
              stage.id === updatedStage.id ? { ...stage, ...updatedStage, opportunities: stage.opportunities } : stage
            )
          };
        });
      },
      onDelete: (deletedStage) => {
        // Cuando se elimina una etapa
        console.log('Etapa eliminada:', deletedStage);
        setPipeline(prev => {
          if (!prev) return prev;
          return {
            ...prev,
            stages: prev.stages.filter(stage => stage.id !== deletedStage.id)
          };
        });
      }
    });

    // Suscribirse a cambios en las oportunidades de cada etapa
    if (pipeline.stages && pipeline.stages.length > 0) {
      pipeline.stages.forEach(stage => {
        const stageId = stage.id;
        // Suscribirse a oportunidades de esta etapa
        opportunitiesSubscriptionsRef.current[stageId] = subscribeToOpportunities(stageId, {
          onInsert: (newOpportunity) => {
            // Cuando se crea una nueva oportunidad en esta etapa
            console.log(`Nueva oportunidad en etapa ${stageId}:`, newOpportunity);
            setPipeline(prev => {
              if (!prev) return prev;
              
              // Convertir OpportunityRecord a una Opportunity completa
              const completeOpportunity: Opportunity = {
                ...newOpportunity,
                name: newOpportunity.name || `Oportunidad ${newOpportunity.id.substring(0, 5)}`,
                customer: newOpportunity.customer_id ? { id: newOpportunity.customer_id, full_name: 'Cliente' } : null
              };
              
              return {
                ...prev,
                stages: prev.stages.map(s => {
                  if (s.id === stageId) {
                    return {
                      ...s,
                      opportunities: [...(s.opportunities || []), completeOpportunity]
                    };
                  }
                  return s;
                })
              };
            });
          },
          onUpdate: (updatedOpportunity) => {
            // Cuando se actualiza una oportunidad
            console.log(`Oportunidad actualizada en etapa ${stageId}:`, updatedOpportunity);
            setPipeline(prev => {
              if (!prev) return prev;
              
              // Convertir OpportunityRecord a una Opportunity completa
              const completeOpportunity: Opportunity = {
                ...updatedOpportunity,
                name: updatedOpportunity.name || `Oportunidad ${updatedOpportunity.id.substring(0, 5)}`,
                customer: updatedOpportunity.customer_id ? { id: updatedOpportunity.customer_id, full_name: 'Cliente' } : null
              };
              
              // Si la oportunidad cambió de etapa, la actualizamos en la etapa correcta
              const currentStageId = updatedOpportunity.stage_id;
              
              if (currentStageId !== stageId) {
                // La oportunidad cambió de etapa, hay que moverla
                // Eliminarla de la etapa actual
                const updatedStages = prev.stages.map(s => {
                  if (s.id === stageId) {
                    return {
                      ...s,
                      opportunities: (s.opportunities || []).filter(o => o.id !== updatedOpportunity.id)
                    };
                  }
                  // Agregarla a la nueva etapa
                  if (s.id === currentStageId) {
                    return {
                      ...s,
                      opportunities: [...(s.opportunities || []), completeOpportunity]
                    };
                  }
                  return s;
                });
                
                return {
                  ...prev,
                  stages: updatedStages
                };
              } else {
                // Solo actualizamos la oportunidad en su etapa actual
                return {
                  ...prev,
                  stages: prev.stages.map(s => {
                    if (s.id === stageId) {
                      return {
                        ...s,
                        opportunities: (s.opportunities || []).map(o => 
                          o.id === updatedOpportunity.id ? completeOpportunity : o
                        )
                      };
                    }
                    return s;
                  })
                };
              }
            });
          },
          onDelete: (deletedOpportunity) => {
            // Cuando se elimina una oportunidad
            console.log(`Oportunidad eliminada de etapa ${stageId}:`, deletedOpportunity);
            setPipeline(prev => {
              if (!prev) return prev;
              // Aseguramos eliminar la oportunidad de la etapa correcta
              return {
                ...prev,
                stages: prev.stages.map(s => {
                  if (s.id === stageId) {
                    return {
                      ...s,
                      opportunities: (s.opportunities || []).filter(o => o.id !== deletedOpportunity.id)
                    };
                  }
                  return s;
                })
              };
            });
            
            // Mostrar notificación de eliminación
            toast({
              description: "Oportunidad eliminada correctamente",
              duration: 2000,
              variant: "destructive"
            });
          }
        });
      });
    }

    toast({
      title: "Actualizaciones en tiempo real activadas",
      description: "El tablero se actualizará automáticamente con los cambios",
      duration: 3000,
    });
  };

  // Limpiar suscripciones
  const cleanupRealtimeSubscriptions = () => {
    // Cancelar suscripción a etapas
    if (stagesSubscriptionRef.current) {
      stagesSubscriptionRef.current.unsubscribe();
      stagesSubscriptionRef.current = null;
    }
    
    // Cancelar suscripciones a oportunidades
    Object.values(opportunitiesSubscriptionsRef.current).forEach(subscription => {
      subscription.unsubscribe();
    });
    opportunitiesSubscriptionsRef.current = {};
  };

  // Efecto para cargar datos iniciales
  useEffect(() => {
    fetchPipelineData();
  }, [refreshTrigger]);
  
  // Configurar suscripciones en tiempo real cuando el pipeline cambia
  useEffect(() => {
    if (pipeline) {
      setupRealtimeSubscriptions();
    }
    
    // Limpiar suscripciones al desmontar
    return () => {
      cleanupRealtimeSubscriptions();
    };
  }, [pipeline?.id, realtimeEnabled]);

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

    // Actualizar en Supabase usando el servicio
    try {
      // Utilizamos el servicio kanban para actualizar la etapa de la oportunidad
      const updateResult = await updateOpportunityStage(
        result.draggableId, 
        destination.droppableId
      );
      
      if (!updateResult.success) {
        throw new Error(updateResult.error || "Error al actualizar la oportunidad");
      }

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
            organizationId: String(organizationId) // Convertir a string para compatibilidad con la función
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
  
  // Clasificar las etapas para la visualización
  const classifyStageType = (stageName: string | undefined) => {
    const name = (stageName || '').toLowerCase();
    if (name.includes('nuevo') || name.includes('lead') || name.includes('prospecto')) {
      return 'new';
    } else if (name.includes('ganado') || name.includes('cerrado') && name.includes('positivo') || name.includes('won')) {
      return 'won';
    } else if (name.includes('perdido') || name.includes('cerrado') && name.includes('negativo') || name.includes('lost')) {
      return 'lost';
    } else {
      return 'inProgress';
    }
  };

  // Ordenar etapas por su posición
  const sortedStages = [...pipeline.stages].sort((a, b) => a.position - b.position);

  return (
  <div className="flex flex-col w-full h-full">
    <div className="flex justify-between items-center mb-4">
      <div className="flex items-center gap-2">
        <h2 className="text-2xl font-bold">{pipeline?.name || "Pipeline"}</h2>
        {showStageManager && StageManagerComponent && (
          <Button
            variant="ghost"
            size="sm"
            className="text-xs"
            onClick={() => {}}
            title="Configurar etapas"
          >
            <RefreshCw className="h-3.5 w-3.5 mr-1" />
            Editar etapas
          </Button>
        )}
      </div>
      <div className="flex items-center space-x-2">
        <div className="flex items-center mr-4">
          <label htmlFor="realtime-toggle" className="mr-2 text-sm">
            Tiempo real
          </label>
          <div className="relative inline-block w-10 mr-2 align-middle select-none">
            <input
              type="checkbox"
              id="realtime-toggle"
              className="sr-only"
              checked={realtimeEnabled}
              onChange={() => {
                setRealtimeEnabled(!realtimeEnabled);
                if (!realtimeEnabled) {
                  // Si estamos activando las suscripciones
                  toast({
                    title: "Actualizaciones en tiempo real activadas",
                    description: "El tablero se sincronizará automáticamente",
                    duration: 3000,
                  });
                } else {
                  // Si estamos desactivando las suscripciones
                  cleanupRealtimeSubscriptions();
                  toast({
                    title: "Actualizaciones en tiempo real desactivadas",
                    description: "Deberá actualizar manualmente para ver cambios",
                    duration: 3000,
                  });
                }
              }}
            />
            <div className={`block w-10 h-6 rounded-full transition-colors ${realtimeEnabled ? 'bg-green-400' : 'bg-gray-300'}`}></div>
            <div className={`dot absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition transform ${realtimeEnabled ? 'translate-x-4' : ''}`}></div>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setRefreshTrigger((prev) => prev + 1)}
          disabled={isLoading}
        >
          <RefreshCw className={cn("h-4 w-4 mr-1", { "animate-spin": isLoading })} />
          Actualizar
        </Button>
      </div>
    </div>
    
    {/* Indicadores de progreso y estadísticas */}
    <div className="bg-muted/20 p-2 rounded-md mb-4 flex items-center justify-between text-xs">
      <span className="font-medium">
        {stageStats.length} etapas - {stageStats.reduce((sum, stat) => sum + (stat.count || 0), 0)} oportunidades
      </span>
      <span className="font-medium">
        Total: {stageStats.reduce((sum, stat) => sum + (stat.totalAmount || 0), 0).toLocaleString('es-ES')} {sortedStages[0]?.opportunities?.[0]?.currency || 'COP'}
      </span>
    </div>
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
        {/* Usar las etapas ordenadas por posición */}
        {sortedStages.map((stage) => {
          const opportunities = stage.opportunities || [];
          const stageTotal = opportunities.reduce(
            (sum, opp) => sum + (parseFloat(opp.amount?.toString() || "0") || 0),
            0
          );
          
          // Clasificar el tipo de etapa
          const stageType = classifyStageType(stage.name);
          
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
          
          // Determinar clases de estilo basadas en el tipo de etapa
          const getStageClasses = () => {
            // Clase base para todas las columnas
            let classes = "min-w-[280px] max-w-[280px] ";
            
            // Añadir clases específicas según el tipo de etapa
            switch(stageType) {
              case 'new':
                classes += "border-l-4 border-blue-500 pl-1 ";
                break;
              case 'won':
                classes += "border-l-4 border-green-500 pl-1 ";
                break;
              case 'lost':
                classes += "border-l-4 border-red-500 pl-1 ";
                break;
              default:
                classes += "border-l border-gray-300 dark:border-gray-700 pl-1 ";
            }
            
            return classes;
          };
          
          return (
            <div key={stage.id} className={getStageClasses()}>
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
    {isLoading && (
      <div className="flex items-center justify-center mt-4">
        <Loader2 className="h-6 w-6 animate-spin text-primary mr-2" />
        <span>Sincronizando datos...</span>
      </div>
    )}
  </div>
  );
}
