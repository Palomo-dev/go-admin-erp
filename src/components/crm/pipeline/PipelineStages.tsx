"use client";

import PipelineStagesCore from "./PipelineStagesCore";

interface PipelineStagesProps {
  pipelineId: string;
}

/**
 * Componente principal de PipelineStages refactorizado
 * Ahora utiliza PipelineStagesCore que integra componentes modulares:
 * - StageColumn: Columnas individuales del Kanban
 * - StageManagementDialogs: Diálogos de gestión de etapas
 * - KanbanDragDropProvider: Lógica de drag & drop
 */
export default function PipelineStages({ pipelineId }: PipelineStagesProps) {
  return <PipelineStagesCore pipelineId={pipelineId} />;
}
