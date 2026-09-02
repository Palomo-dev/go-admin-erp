"use client";

import { useEffect, useState, useRef } from "react";
import { DragDropContext, Droppable, DropResult } from "@hello-pangea/dnd";
import { RefreshCw } from "lucide-react";
import { cn } from "@/utils/Utils";
import KanbanColumn from "./KanbanColumn";
import { KanbanSummary } from "./KanbanSummary";
import { Skeleton } from "@/components/ui/skeleton";
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
import { supabase } from "@/lib/supabase/config";
import { WonCloseModal } from "./WonCloseModal";
import { StageManager } from "./StageManager";
import { GateWarningDialog } from "./GateWarningDialog";
import { StructuredLossDialog } from "@/components/crm/oportunidades/StructuredLossDialog";
import type { LossReasonData } from "@/components/crm/oportunidades/types";
import {
  evaluateStageGate,
  type GateMissing,
} from "@/lib/services/crm/stageGateService";

interface KanbanBoardProps {
  showStageManager?: boolean;
}

// Estado para el modal de cierre ganado
interface WonCloseState {
  open: boolean;
  opportunityId: string;
  opportunityName: string;
  originalStageId: string;
  destStageId: string;
}

// Estado para el modal de gate warning (soft-gate F2)
interface GateWarningState {
  open: boolean;
  missing: GateMissing[];
  stageName: string;
  opportunityId: string;
  sourceStageId: string;
  destStageId: string;
  destStageName: string;
}

// Estado para el modal de cierre perdido
interface LostCloseState {
  open: boolean;
  opportunityId: string;
  opportunityName: string;
  originalStageId: string;
  destStageId: string;
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
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [realtimeEnabled, setRealtimeEnabled] = useState(true);
  const [wonClose, setWonClose] = useState<WonCloseState | null>(null);
  const [gateWarning, setGateWarning] = useState<GateWarningState | null>(null);
  const [lostClose, setLostClose] = useState<LostCloseState | null>(null);
  const [isLostSubmitting, setIsLostSubmitting] = useState(false);
  
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

    // Si la etapa no cambió, no hacemos nada más
    if (result.source.droppableId === destination.droppableId) return;

    // Verificar si la etapa destino es is_won (cierre ganado) o is_lost (cierre perdido)
    let destStageIsWon = false;
    let destStageIsLost = false;
    try {
      const { data: destStage } = await supabase
        .from('stages')
        .select('is_won, is_lost')
        .eq('id', destination.droppableId)
        .maybeSingle();
      destStageIsWon = Boolean((destStage as { is_won?: boolean } | null)?.is_won);
      destStageIsLost = Boolean((destStage as { is_lost?: boolean } | null)?.is_lost);
    } catch (err) {
      console.warn("No se pudo verificar is_won/is_lost de la etapa destino:", err);
    }

    // Si es etapa is_won, abrir WonCloseModal en lugar de actualizar directamente
    if (destStageIsWon) {
      setWonClose({
        open: true,
        opportunityId: result.draggableId,
        opportunityName: opportunityToMove.name || 'Oportunidad',
        originalStageId: result.source.droppableId,
        destStageId: destination.droppableId,
      });
      return;
    }

    // Si es etapa is_lost, abrir StructuredLossDialog en lugar de actualizar directamente
    if (destStageIsLost) {
      setLostClose({
        open: true,
        opportunityId: result.draggableId,
        opportunityName: opportunityToMove.name || 'Oportunidad',
        originalStageId: result.source.droppableId,
        destStageId: destination.droppableId,
      });
      return;
    }

    // === Gate F2: evaluar exit_criteria de la etapa destino ===
    // Soft-gate: si faltan criterios, mostrar GateWarningDialog.
    // El usuario puede avanzar de todos modos o cancelar.
    const destStageName = newPipeline.stages[destStageIndex].name || 'etapa destino';
    try {
      const organizationId = getOrganizationId();
      if (organizationId) {
        const gateResult = await evaluateStageGate(supabase, organizationId, {
          opportunityId: result.draggableId,
          targetStageId: destination.droppableId,
        });

        if (gateResult.missing.length > 0) {
          setGateWarning({
            open: true,
            missing: gateResult.missing,
            stageName: destStageName,
            opportunityId: result.draggableId,
            sourceStageId: result.source.droppableId,
            destStageId: destination.droppableId,
            destStageName,
          });
          return;
        }
      }
    } catch (gateErr) {
      // Soft-gate: si falla la evaluación, no bloquear el movimiento
      console.warn('No se pudo evaluar stage gate:', gateErr);
    }

    // Flujo normal: persistir el cambio de etapa + automatizaciones
    await performStageMove(
      result.draggableId,
      result.source.droppableId,
      destination.droppableId
    );
  };

  /**
   * Persiste el cambio de etapa en Supabase y ejecuta automatizaciones.
   * Reutilizado por handleDragEnd (gate ok) y handleGateWarningConfirm (soft-gate).
   */
  const performStageMove = async (
    opportunityId: string,
    sourceStageId: string,
    destStageId: string
  ) => {
    // Flujo normal: actualizar en Supabase y ejecutar automatizaciones
    try {
      // Utilizamos el servicio kanban para actualizar la etapa de la oportunidad
      const updateResult = await updateOpportunityStage(
        opportunityId,
        destStageId
      );

      if (!updateResult.success) {
        throw new Error(updateResult.error || "Error al actualizar la oportunidad");
      }

      // Si hay cambios de etapa, ejecutar automatizaciones
      if (sourceStageId !== destStageId) {
        const organizationId = getOrganizationId();

        if (organizationId) {
          // Indicar que las automatizaciones están en proceso
          setProcessingAutomation(opportunityId);

          // Ejecutar automatizaciones cuando cambia la etapa
          handleStageChangeAutomation({
            opportunityId,
            fromStageId: sourceStageId,
            toStageId: destStageId,
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

  /**
   * Confirmar avance a pesar de gate incompleto (soft-gate).
   */
  const handleGateWarningConfirm = async () => {
    if (!gateWarning) return;
    const { opportunityId, sourceStageId, destStageId } = gateWarning;
    setGateWarning(null);
    await performStageMove(opportunityId, sourceStageId, destStageId);
  };

  /**
   * Cancelar avance cuando el gate falla: revertir el estado local.
   */
  const handleGateWarningCancel = () => {
    // La oportunidad no se persistió, recargamos desde la BD para revertir el drag
    fetchPipelineData();
    setGateWarning(null);
  };

  // Confirmar cierre ganado: persistir cambio de etapa + automatizaciones
  const handleWonCloseComplete = async () => {
    if (!wonClose) return;
    try {
      // Persistir el cambio de etapa a la etapa is_won + status='won'
      const { error: updateError } = await supabase
        .from('opportunities')
        .update({
          stage_id: wonClose.destStageId,
          status: 'won',
          closed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', wonClose.opportunityId);

      if (updateError) throw updateError;

      // Ejecutar automatizaciones de cambio de etapa
      const organizationId = getOrganizationId();
      if (organizationId) {
        setProcessingAutomation(wonClose.opportunityId);
        handleStageChangeAutomation({
          opportunityId: wonClose.opportunityId,
          fromStageId: wonClose.originalStageId,
          toStageId: wonClose.destStageId,
          organizationId: String(organizationId),
        }).then((result) => {
          setProcessingAutomation(null);
          if (!result.success) {
            console.error("Error en automatizaciones:", result.error);
          }
        }).catch(error => {
          setProcessingAutomation(null);
          console.error("Error al ejecutar automatizaciones:", error);
        });
      }

      toast({
        title: "Oportunidad ganada",
        description: "Cierre completado con acciones de trazabilidad.",
        duration: 4000,
      });
    } catch (err: any) {
      console.error("Error al confirmar cierre ganado:", err);
      toast({
        title: "Error",
        description: err.message || "No se pudo completar el cierre",
        variant: "destructive",
      });
      fetchPipelineData();
    } finally {
      setWonClose(null);
    }
  };

  // Cancelar cierre ganado: revertir el drag a la etapa original
  const handleWonCloseCancel = () => {
    if (!wonClose) return;
    // Revertir el estado local recargando los datos desde la BD
    // (la oportunidad sigue en su etapa original porque no se persistió)
    fetchPipelineData();
    setWonClose(null);
  };

  // Confirmar cierre perdido: persistir cambio de etapa + status lost + datos de pérdida
  const handleLostCloseConfirm = async (data: LossReasonData) => {
    if (!lostClose) return;
    setIsLostSubmitting(true);
    try {
      // 1. Actualizar la oportunidad: stage_id + status='lost' + datos de pérdida
      const updatePayload: Record<string, unknown> = {
        stage_id: lostClose.destStageId,
        status: 'lost',
        loss_reason_value: data.lossReasonId,
        loss_reason_notes: data.notes || null,
        closed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      if (data.competitor) updatePayload.competitor_name = data.competitor;
      if (data.competitorPrice !== undefined) updatePayload.competitor_price = data.competitorPrice;
      if (data.missingFeatures) updatePayload.missing_features = data.missingFeatures;
      if (data.recontactDate) updatePayload.recontact_at = data.recontactDate;

      const { error: updateError } = await supabase
        .from('opportunities')
        .update(updatePayload)
        .eq('id', lostClose.opportunityId);

      if (updateError) throw updateError;

      // 2. Ejecutar automatizaciones de cambio de etapa
      const organizationId = getOrganizationId();
      if (organizationId) {
        setProcessingAutomation(lostClose.opportunityId);
        handleStageChangeAutomation({
          opportunityId: lostClose.opportunityId,
          fromStageId: lostClose.originalStageId,
          toStageId: lostClose.destStageId,
          organizationId: String(organizationId),
        }).then((result) => {
          setProcessingAutomation(null);
          if (!result.success) {
            console.error("Error en automatizaciones:", result.error);
          }
        }).catch(error => {
          setProcessingAutomation(null);
          console.error("Error al ejecutar automatizaciones:", error);
        });
      }

      toast({
        title: "Oportunidad perdida",
        description: "Se registró la razón de pérdida.",
        duration: 4000,
      });
    } catch (err) {
      console.error("Error al confirmar cierre perdido:", err);
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "No se pudo registrar la pérdida",
        variant: "destructive",
      });
      fetchPipelineData();
    } finally {
      setIsLostSubmitting(false);
      setLostClose(null);
    }
  };

  // Cancelar cierre perdido: revertir el drag
  const handleLostCloseCancel = () => {
    if (!lostClose) return;
    fetchPipelineData();
    setLostClose(null);
  };

  if (!pipeline) {
    return (
      <div className="p-4 text-center">
        <p>No se encontró ningún pipeline. Cree uno nuevo para comenzar.</p>
      </div>
    );
  }
  
  // Clasificar las etapas para la visualización
  // Prioriza los flags is_won / is_lost de la BD; fallback al nombre
  const classifyStageType = (stageName: string | undefined, stage?: { is_won?: boolean; is_lost?: boolean }) => {
    if (stage?.is_won) return 'won';
    if (stage?.is_lost) return 'lost';
    return 'inProgress';
  };

  // Ordenar etapas por su posición
  const sortedStages = [...pipeline.stages].sort((a, b) => a.position - b.position);

  return (
  <div className="flex flex-col w-full h-full">
    <div className="flex justify-between items-center mb-4">
      <div className="flex items-center gap-2">
        <h2 className="text-2xl font-bold">{pipeline?.name || "Pipeline"}</h2>
        {showStageManager && (
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
          className="dark:bg-gray-800 dark:text-gray-200 dark:border-gray-600 dark:hover:bg-gray-700"
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
    {showStageManager && (
      <StageManager
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
          const stageType = classifyStageType(stage.name, stage);
          
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
      <div className="flex items-center justify-center mt-4 gap-2">
        <Skeleton className="h-5 w-40" />
      </div>
    )}

    {/* Modal de cierre ganado con acciones encadenadas */}
    {wonClose && (
      <WonCloseModal
        open={wonClose.open}
        onOpenChange={(v) => {
          if (!v) {
            handleWonCloseCancel();
          } else {
            setWonClose({ ...wonClose, open: v });
          }
        }}
        opportunityId={wonClose.opportunityId}
        opportunityName={wonClose.opportunityName}
        onComplete={handleWonCloseComplete}
        onCancel={handleWonCloseCancel}
      />
    )}

    {/* Modal de gate warning (soft-gate F2) */}
    {gateWarning && (
      <GateWarningDialog
        open={gateWarning.open}
        onClose={handleGateWarningCancel}
        onConfirm={handleGateWarningConfirm}
        missing={gateWarning.missing.map((m) => m.detail)}
        stageName={gateWarning.destStageName}
      />
    )}

    {/* Modal de cierre perdido con razones estructuradas */}
    {lostClose && (
      <StructuredLossDialog
        open={lostClose.open}
        onOpenChange={(v) => {
          if (!v) handleLostCloseCancel();
        }}
        onConfirm={handleLostCloseConfirm}
        isLoading={isLostSubmitting}
      />
    )}
  </div>
  );
}
