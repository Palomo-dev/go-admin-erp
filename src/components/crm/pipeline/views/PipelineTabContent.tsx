"use client";

import React from "react";
import PipelineStages from "../PipelineStages";
import ForecastView from "../ForecastView";
import TableView from "../TableView";
import ClientsView from "../ClientsView";
import AutomationsView from "../AutomationsView";
import PipelineManager from "../PipelineManager";
import EmptyStateView from "./EmptyStateView";

interface PipelineTabContentProps {
  activeTab: string;
  currentPipelineId: string | null;
  organizationId: number | null;
  refreshTrigger: number;
  onPipelineChange: (pipelineId: string) => void;
}

/**
 * Componente que renderiza el contenido de cada pestaña del pipeline
 * Maneja la lógica de renderizado condicional basada en la pestaña activa
 */
export default function PipelineTabContent({
  activeTab,
  currentPipelineId,
  organizationId,
  refreshTrigger,
  onPipelineChange,
}: PipelineTabContentProps) {
  // Renderizado del contenido de la pestaña Kanban
  if (activeTab === "kanban") {
    return (
      <div className="mt-0">
        {currentPipelineId && (
          <PipelineStages 
            key={`${currentPipelineId}-${refreshTrigger}`} 
            pipelineId={currentPipelineId} 
          />
        )}
      </div>
    );
  }

  // Renderizado del contenido de la pestaña Tabla
  if (activeTab === "table") {
    return (
      <div>
        {currentPipelineId ? (
          <TableView 
            key={currentPipelineId} 
            pipelineId={currentPipelineId} 
          />
        ) : (
          <EmptyStateView message="Seleccione un pipeline para ver la tabla" />
        )}
      </div>
    );
  }

  // Renderizado del contenido de la pestaña Pronóstico
  if (activeTab === "forecast") {
    return (
      <div>
        {currentPipelineId ? (
          <ForecastView 
            key={currentPipelineId} 
            pipelineId={currentPipelineId} 
          />
        ) : (
          <EmptyStateView message="Seleccione un pipeline para ver el pronóstico" />
        )}
      </div>
    );
  }

  // Renderizado del contenido de la pestaña Clientes
  if (activeTab === "clients") {
    return (
      <div>
        {currentPipelineId ? (
          <ClientsView pipelineId={currentPipelineId} />
        ) : (
          <EmptyStateView message="Seleccione un pipeline para ver los clientes" />
        )}
      </div>
    );
  }

  // Renderizado del contenido de la pestaña Automatización
  if (activeTab === "automation") {
    return (
      <div>
        {currentPipelineId ? (
          <AutomationsView pipelineId={currentPipelineId} />
        ) : (
          <EmptyStateView message="Seleccione un pipeline para configurar automatizaciones" />
        )}
      </div>
    );
  }

  // Renderizado del contenido de la pestaña Pipelines
  if (activeTab === "pipelines") {
    return (
      <div>
        {organizationId ? (
          <PipelineManager 
            organizationId={organizationId}
            currentPipelineId={currentPipelineId || ""}
            onPipelineChange={onPipelineChange}
          />
        ) : (
          <EmptyStateView message="Cargando información de la organización..." />
        )}
      </div>
    );
  }

  // Fallback para pestañas no reconocidas
  return <EmptyStateView message="Pestaña no encontrada" />;
}
