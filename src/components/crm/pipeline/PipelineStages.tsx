"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/lib/supabase/config";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency, getCurrentTheme, applyTheme } from "@/utils/Utils";
import { handleStageChangeAutomation } from "./OpportunityAutomations";
import { BarChart3, Calendar, DollarSign } from "lucide-react";
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

  // Obtener el ID de la organización y el usuario
  useEffect(() => {
    // Obtener userId de la sesión de Supabase
    const getUserId = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) {
          console.error('Error al obtener la sesión:', error.message);
          return;
        }
        
        if (session?.user) {
          console.log('Usuario autenticado:', session.user.email);
          setUserId(session.user.id);
        } else {
          console.log('No hay sesión de usuario activa');
        }
      } catch (err) {
        console.error('Error inesperado al obtener sesión:', err);
      }
    };
    
    getUserId();
    
    const possibleKeys = [
      "currentOrganizationId",
      "organizationId", 
      "selectedOrganizationId",
      "orgId",
      "organization_id"
    ];
    
    for (const key of possibleKeys) {
      const orgId = localStorage.getItem(key);
      if (orgId) {
        console.log(`Organización encontrada en localStorage con clave: ${key}`, orgId);
        setOrganizationId(Number(orgId));
        return;
      }
    }
    
    for (const key of possibleKeys) {
      const orgId = sessionStorage.getItem(key);
      if (orgId) {
        console.log(`Organización encontrada en sessionStorage con clave: ${key}`, orgId);
        setOrganizationId(Number(orgId));
        return;
      }
    }
    
    if (process.env.NODE_ENV !== 'production') {
      console.log('Usando ID de organización predeterminado para desarrollo: 2');
      setOrganizationId(2); // Valor predeterminado para desarrollo
    } else {
      console.error('No se pudo encontrar el ID de organización en el almacenamiento local');
    }
  }, []);

  // Función para cargar las etapas del pipeline
  const loadStages = async () => {
    if (!pipelineId) {
      console.error('ID de pipeline no definido');
      return;
    }

    try {
      console.log('Cargando etapas para pipeline ID:', pipelineId);
      setLoading(true);
      const { data, error } = await supabase
        .from('stages')
        .select('id, name, position, pipeline_id, probability')
        .eq('pipeline_id', pipelineId)
        .order('position');

      if (error) {
        console.error('Error al cargar etapas:', error);
        return;
      }

      // Verificar si se encontraron etapas
      if (!data || data.length === 0) {
        console.log('No se encontraron etapas para el pipeline', pipelineId);
        return;
      }

      console.log('Etapas cargadas:', data.length);
      
      // Asegurarse de que todos los datos tengan el pipeline_id
      const stagesWithPipelineId = data.map((stage) => ({ 
        ...stage, 
        pipeline_id: stage.pipeline_id || pipelineId 
      }));

      setStages(stagesWithPipelineId);
    } catch (err) {
      console.error('Error al cargar etapas:', err);
    } finally {
      setLoading(false);
    }
  };

  // Función para cargar las oportunidades (con useCallback para evitar bucles infinitos)
  const loadOpportunities = useCallback(async () => {
    if (!pipelineId) {
      console.error('ID de pipeline no definido para cargar oportunidades');
      return;
    }

    try {
      console.log('Cargando oportunidades para pipeline ID:', pipelineId);
      console.log('Organization ID:', organizationId || 'no definido');
      setLoading(true);
      
      // Construir la consulta base
      let query = supabase
        .from('opportunities')
        .select(`
          id, name, stage_id, customer_id, amount, currency, expected_close_date, status,
          customer:customers!customer_id(id, full_name, email)
        `)
        .eq('pipeline_id', pipelineId)
        .in('status', ['open', 'won', 'lost']) // Mostrar todas las oportunidades (abiertas, ganadas y perdidas)
        .order('updated_at', { ascending: false });
        
      // Agregar filtro de organización solo si está disponible
      if (organizationId) {
        query = query.eq('organization_id', organizationId);
      }
      
      const { data, error } = await query;

      if (error) {
        console.error('Error al cargar oportunidades:', error);
        return;
      }

      // Verificar si se encontraron oportunidades
      if (!data || data.length === 0) {
        console.log('No se encontraron oportunidades para el pipeline', pipelineId);
        // Verificar si hay oportunidades sin filtrar por estado
        const { data: allOpps, error: allOppsError } = await supabase
          .from('opportunities')
          .select('id, status')
          .eq('pipeline_id', pipelineId);
          
        if (!allOppsError && allOpps && allOpps.length > 0) {
          console.log(`Se encontraron ${allOpps.length} oportunidades totales (incluyendo no abiertas)`);
          console.log('Estados:', allOpps.map(o => o.status).filter((v, i, a) => a.indexOf(v) === i));
        }
        return;
      }

      console.log('Oportunidades cargadas:', data.length);
      
      // Las oportunidades ya vienen con el objeto customer desde Supabase
      const formattedOpps = data.map((opp: any) => {
        // Si no hay datos del cliente, proporcionamos un valor predeterminado
        if (!opp.customer) {
          return {
            ...opp,
            customer: { id: opp.customer_id, full_name: "Cliente sin nombre" }
          };
        }
        return opp;
      });

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
      console.log('Iniciando carga de datos para pipeline:', pipelineId);
      loadStages();
      loadOpportunities();
    } else {
      console.error('No se puede cargar datos: pipelineId no está definido');
    }
  }, [pipelineId, organizationId, loadOpportunities]);

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
    if (!result.destination) {
      console.log('Drag cancelado: no hay destino');
      return;
    }

    const { draggableId, source, destination } = result;

    // Si la oportunidad se soltó en la misma etapa, no hacemos nada
    if (source.droppableId === destination.droppableId) {
      console.log('Misma etapa: no es necesario actualizar');
      return;
    }

    console.log(`Moviendo oportunidad ${draggableId} de etapa ${source.droppableId} a ${destination.droppableId}`);

    // Obtener el ID de la oportunidad y las etapas de origen y destino
    const opportunityId = draggableId;
    const fromStageId = source.droppableId;
    const toStageId = destination.droppableId;

    // Encontrar la oportunidad que se movió
    const movedOpportunity = opportunities.find((opp) => opp.id === opportunityId);
    if (!movedOpportunity) {
      console.error('No se encontró la oportunidad:', opportunityId);
      return;
    }

    // Encontrar información de las etapas
    const fromStage = stages.find((stage) => stage.id === fromStageId);
    const toStage = stages.find((stage) => stage.id === toStageId);

    if (!fromStage || !toStage) {
      console.error('No se encontraron las etapas de origen o destino');
      return;
    }

    console.log(`Moviendo de "${fromStage.name}" a "${toStage.name}"`);

    // Determinar el nuevo estado basado en el nombre de la etapa destino
    let newStatus = movedOpportunity.status;
    
    // Actualizar estado según el nombre de la etapa
    if (toStage.name === "Ganado") {
      newStatus = "won";
    } else if (toStage.name === "Perdido") {
      newStatus = "lost";
    } else if ((movedOpportunity.status === "won" || movedOpportunity.status === "lost") && 
               toStage.name !== "Ganado" && toStage.name !== "Perdido") {
      // Si va de ganado/perdido a una etapa normal, vuelve a estado abierto
      newStatus = "open";
    }

    // Actualizar localmente para una respuesta inmediata en la UI
    setOpportunities((prevOpps) =>
      prevOpps.map((opp) => {
        if (opp.id === opportunityId) {
          return { ...opp, stage_id: toStageId, status: newStatus };
        }
        return opp;
      })
    );

    // Datos a actualizar en la base de datos
    const updateData: { stage_id: string; status?: string } = { 
      stage_id: toStageId 
    };
    
    // Solo actualizamos el status si ha cambiado
    if (newStatus !== movedOpportunity.status) {
      updateData.status = newStatus;
    }

    console.log('Actualizando en Supabase:', updateData);

    // Actualizar en la base de datos
    const { error } = await supabase
      .from("opportunities")
      .update(updateData)
      .eq("id", opportunityId);

    if (error) {
      console.error("Error al actualizar la oportunidad:", error);
      // Revertir el cambio local en caso de error
      setOpportunities((prevOpps) =>
        prevOpps.map((opp) => (
          opp.id === opportunityId ? 
          { ...opp, stage_id: fromStageId, status: movedOpportunity.status } : 
          opp
        ))
      );
      return;
    }

    console.log('Actualización exitosa');

    // Ejecutar automatizaciones (tareas, notificaciones, etc.)
    if (organizationId && userId) {
      console.log('Ejecutando automatizaciones por cambio de etapa');
      await handleStageChangeAutomation({
        opportunityId: movedOpportunity.id,
        opportunityTitle: movedOpportunity.name,
        customerId: movedOpportunity.customer_id,
        customerName: movedOpportunity.customer.full_name || 'Cliente',
        stageId: destination.droppableId,
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
      <div className="flex flex-wrap gap-6 p-6 overflow-x-auto bg-white/5 dark:bg-black/5 rounded-lg">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="flex-shrink-0 w-72 bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm border border-blue-100 dark:border-blue-900">
            <Skeleton className="h-10 w-full mb-4 bg-blue-100 dark:bg-blue-900/30" />
            <div className="px-3 py-2 mb-3 bg-blue-50 dark:bg-blue-900/20 rounded">
              <Skeleton className="h-6 w-full bg-blue-100 dark:bg-blue-900/30" />
            </div>
            <Skeleton className="h-24 w-full mb-2 bg-blue-100 dark:bg-blue-900/30" />
            <Skeleton className="h-24 w-full bg-blue-100 dark:bg-blue-900/30" />
          </div>
        ))}
      </div>
    );
  }
  
  // Mostrar mensaje si no hay etapas
  if (!stages || stages.length === 0) {
    return (
      <div className="p-8 text-center bg-white dark:bg-gray-800 rounded-lg shadow border border-blue-100 dark:border-blue-900">
        <h3 className="text-xl font-medium text-blue-700 dark:text-blue-300 mb-2">No hay etapas configuradas</h3>
        <p className="text-gray-600 dark:text-gray-400 mb-4">
          Este pipeline no tiene etapas configuradas. Contacte al administrador para configurar el pipeline.
        </p>
      </div>
    );
  }
  
  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <div className="flex gap-6 p-6 overflow-x-auto min-h-[calc(100vh-10rem)] bg-gray-50 dark:bg-gray-900 transition-colors duration-200">
        {stages.map((stage) => (
          <div 
            key={stage.id} 
            className="flex-shrink-0 w-72 bg-white dark:bg-gray-800 rounded-lg shadow-sm transition-all duration-200 border border-blue-100 dark:border-blue-900"
          >
            <div className="p-3 border-b border-blue-100 dark:border-blue-900 flex items-center justify-between bg-gradient-to-r from-blue-50 to-white dark:from-blue-950 dark:to-gray-900">
              <h3 className="font-semibold text-gray-800 dark:text-gray-200">
                {stage.name}
              </h3>
              <div className="flex items-center gap-2">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger>
                      <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900 dark:text-blue-200 dark:border-blue-800">
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
            <div className="px-3 py-2 bg-blue-50 dark:bg-blue-900/30 flex justify-between items-center text-sm border-b border-blue-100 dark:border-blue-900">
              <div className="flex items-center">
                <BarChart3 className="h-4 w-4 text-blue-600 dark:text-blue-400 mr-1.5" />
                <span className="text-blue-700 dark:text-blue-300">Valor total:</span>
              </div>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger>
                    <span className="font-medium text-blue-700 dark:text-blue-300">
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
                  className="min-h-[12rem] p-2 overflow-y-auto bg-white dark:bg-gray-800"
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
                          className={`p-3 mb-2 cursor-pointer transition-all duration-200 shadow-sm hover:shadow ${opportunity.status === 'won' 
                            ? 'border border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-900/10 hover:border-green-300 hover:bg-green-50 dark:hover:border-green-700 dark:hover:bg-green-900/20' 
                            : opportunity.status === 'lost'
                            ? 'border border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-900/10 hover:border-red-300 hover:bg-red-50 dark:hover:border-red-700 dark:hover:bg-red-900/20'
                            : 'border border-blue-100 dark:border-blue-900 hover:border-blue-300 hover:bg-blue-50 dark:hover:border-blue-700 dark:hover:bg-blue-900/20'}`}
                        >
                          <h4 className="font-medium text-gray-900 dark:text-gray-100 flex items-center">
                            {opportunity.name}
                            {opportunity.status === 'won' && (
                              <span className="ml-1.5 text-green-600 dark:text-green-400 text-xs bg-green-100 dark:bg-green-900/30 rounded-full px-1.5 py-0.5">
                                Ganado
                              </span>
                            )}
                            {opportunity.status === 'lost' && (
                              <span className="ml-1.5 text-red-600 dark:text-red-400 text-xs bg-red-100 dark:bg-red-900/30 rounded-full px-1.5 py-0.5">
                                Perdido
                              </span>
                            )}
                          </h4>
                          
                          <div className="text-sm text-gray-600 dark:text-gray-400 mt-1 flex items-center">
                            {opportunity.customer?.full_name || 'Cliente no especificado'}
                          </div>
                          
                          {opportunity.expected_close_date && (
                            <div className="mt-1 text-xs text-gray-500 dark:text-gray-400 flex items-center">
                              <Calendar className="h-3 w-3 mr-1 text-blue-500 dark:text-blue-400" />
                              {new Date(opportunity.expected_close_date).toLocaleDateString('es-ES')}
                            </div>
                          )}
                          
                          <div className="flex items-center justify-between mt-2 pt-2 border-t border-blue-50 dark:border-blue-900/50">
                            <div className={`font-medium flex items-center ${opportunity.status === 'won' ? 'text-green-600 dark:text-green-400' : opportunity.status === 'lost' ? 'text-red-500 dark:text-red-400' : 'text-blue-600 dark:text-blue-400'}`}>
                              <DollarSign className="h-3 w-3 mr-0.5" />
                              {formatCurrency(opportunity.amount)}
                            </div>
                            <Badge 
                              className={`capitalize ${opportunity.status === 'won' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' : opportunity.status === 'lost' ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200' : 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'}`}
                            >
                              {opportunity.currency || 'COP'}
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
