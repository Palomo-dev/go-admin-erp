"use client";

import React from "react";
import { DragDropContext, DropResult } from "@hello-pangea/dnd";
import { supabase } from "@/lib/supabase/config";
import { toast } from "@/components/ui/use-toast";
import { handleStageChangeAutomation } from "../OpportunityAutomations";

interface Stage {
  id: string;
  name: string;
  color?: string;
  description?: string;
  position: number;
  pipeline_id: string;
}

interface Customer {
  id: string;
  full_name: string;
  email?: string;
}

interface Opportunity {
  id: string;
  name: string;
  stage_id: string;
  customer_id: string;
  amount: number;
  expected_close_date: string;
  customer: Customer;
  customers?: Customer[];
  status?: string;
  currency?: string;
}

interface KanbanDragDropProviderProps {
  children: React.ReactNode;
  stages: Stage[];
  opportunities: Opportunity[];
  organizationId: string | null;
  userId: string | null;
  onOpportunitiesUpdate: (opportunities: Opportunity[]) => void;
}

export default function KanbanDragDropProvider({
  children,
  stages,
  opportunities,
  organizationId,
  userId,
  onOpportunitiesUpdate,
}: KanbanDragDropProviderProps) {

  const handleDragEnd = async (result: DropResult) => {
    const { destination, source, draggableId } = result;

    // Si no hay destino, no hacer nada
    if (!destination) {
      return;
    }

    // Si la posición no cambió, no hacer nada
    if (
      destination.droppableId === source.droppableId &&
      destination.index === source.index
    ) {
      return;
    }

    const opportunityId = draggableId;
    const fromStageId = source.droppableId;
    const toStageId = destination.droppableId;

    console.log(`Moviendo oportunidad ${opportunityId} de etapa ${fromStageId} a ${toStageId}`);

    // Encontrar la oportunidad que se está moviendo
    const movedOpportunity = opportunities.find(opp => opp.id === opportunityId);
    if (!movedOpportunity) {
      console.error('No se encontró la oportunidad que se está moviendo');
      toast({
        title: "Error",
        description: "No se encontró la oportunidad",
        variant: "destructive"
      });
      return;
    }

    // Encontrar las etapas de origen y destino
    const fromStage = stages.find((stage) => stage.id === fromStageId);
    const toStage = stages.find((stage) => stage.id === toStageId);

    if (!fromStage || !toStage) {
      console.error('No se encontraron las etapas de origen o destino');
      toast({
        title: "Error",
        description: "No se encontraron las etapas",
        variant: "destructive"
      });
      return;
    }

    console.log(`Moviendo de "${fromStage.name}" a "${toStage.name}"`);

    // Determinar el nuevo estado basado en el nombre de la etapa destino
    let newStatus = movedOpportunity.status || 'open';
    
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
    const updatedOpportunities = opportunities.map((opp) => {
      if (opp.id === opportunityId) {
        return { ...opp, stage_id: toStageId, status: newStatus };
      }
      return opp;
    });
    
    onOpportunitiesUpdate(updatedOpportunities);

    try {
      // Usar la nueva función SQL que devuelve JSON con información detallada
      console.log(`Actualizando oportunidad ${opportunityId} a etapa ${toStageId} con estado ${newStatus}`);
      toast({
        title: "Actualizando",
        description: "Guardando cambios...",
      });
      
      // Llamada a la función SQL con SECURITY DEFINER
      const { data, error } = await supabase.rpc('direct_update_opportunity', {
        p_opportunity_id: opportunityId,
        p_stage_id: toStageId,
        p_status: newStatus
      });
      
      // Manejo de errores explícitos de Supabase
      if (error) {
        console.error('Error explícito de Supabase:', error);
        toast({
          title: "Error de servidor",
          description: error.message || "Error al comunicarse con el servidor",
          variant: "destructive",
        });
        throw error;
      }
      
      // Verificar la respuesta detallada de la función SQL
      console.log('Respuesta de la actualización:', data);
      
      if (!data || data.success === false) {
        console.warn('Error detallado de la actualización:', data?.message, data?.error_code);
        toast({
          title: "No se pudo actualizar",
          description: data?.message || "Error al actualizar la oportunidad",
          variant: "destructive",
        });
        throw new Error(data?.message || "Error desconocido al actualizar");
      }
      
      // Notificar éxito
      toast({
        title: "Actualizado",
        description: "La oportunidad se movió correctamente",
      });
      
      console.log('Actualización exitosa a etapa', toStageId, 'con estado', newStatus);

      // Ejecutar automatizaciones si hay cambio de etapa
      if (fromStageId !== toStageId && organizationId && userId) {
        try {
          console.log('🤖 Ejecutando automatizaciones para cambio de etapa...');
          await handleStageChangeAutomation(
            movedOpportunity,
            fromStage,
            toStage,
            organizationId,
            userId
          );
          console.log('✅ Automatizaciones ejecutadas correctamente');
        } catch (automationError) {
          console.error('❌ Error en automatizaciones:', automationError);
          // No mostrar error al usuario, las automatizaciones son secundarias
        }
      }

    } catch (error: any) {
      console.error("Error al actualizar la oportunidad:", error);
      toast({
        title: "Error",
        description: `No se pudo actualizar la oportunidad: ${error.message || "Error desconocido"}`,
        variant: "destructive",
      });
      
      // Revertir el cambio local en caso de error
      const revertedOpportunities = opportunities.map((opp) => (
        opp.id === opportunityId ? 
        { ...opp, stage_id: fromStageId, status: movedOpportunity.status } : 
        opp
      ));
      
      onOpportunitiesUpdate(revertedOpportunities);
      return;
    }
  };

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      {children}
    </DragDropContext>
  );
}
