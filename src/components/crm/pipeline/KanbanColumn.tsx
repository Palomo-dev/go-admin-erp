"use client";

import { useState } from "react";
import { Draggable, Droppable } from "@hello-pangea/dnd";
import { formatCurrency } from "@/utils/Utils";
import { useTheme } from "next-themes";
import { OpportunityCard } from "./OpportunityCard";
import { Opportunity, Stage } from "@/types/crm";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Settings } from "lucide-react";
import { StageConfigDialog } from "./StageConfigDialog";

interface KanbanColumnProps {
  stage: Stage;
  opportunities: Opportunity[];
  onOpportunityDrop?: (opportunityId: string, sourceStageId: string, destinationStageId: string) => Promise<void>;
  stageTotal?: number;
  isLoading?: boolean;
  onStageUpdate?: (updatedStage: Stage) => void;
}

const KanbanColumn = ({ stage, opportunities, stageTotal, isLoading, onStageUpdate }: KanbanColumnProps) => {
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const { theme } = useTheme();

  // Calcular el valor total de las oportunidades en esta etapa
  const totalValue = opportunities.reduce(
    (sum, opportunity) =>
      sum + (parseFloat(opportunity.amount?.toString() || "0") || 0),
    0
  );

  // Determinar la moneda (usar la primera oportunidad como referencia o COP por defecto)
  const currency =
    opportunities.length > 0 ? opportunities[0].currency || "COP" : "COP";

  // Función para determinar el color de la barra indicadora según la probabilidad
  const getStageColorClass = () => {
    // Si stage.color está definido, usar ese color
    if (stage.color) {
      return `bg-[${stage.color}]`;
    }
    
    // Si no hay color definido, usar la probabilidad
    const probability = stage.probability || 0;
    if (probability < 25) return 'bg-red-500'; // Etapa inicial
    if (probability < 50) return 'bg-amber-500'; // Etapa intermedia
    if (probability < 75) return 'bg-blue-500'; // Etapa avanzada
    return 'bg-green-500'; // Etapa final
  };

  // Determinar el nombre de la etapa para mostrar iconos
  const stageName = stage.name?.toLowerCase() || '';
  const isNewStage = stageName.includes('nuevo') || stageName.includes('lead');
  const isWonStage = stageName.includes('ganado') || stageName.includes('cerrado') || stageName.includes('won');
  const isLostStage = stageName.includes('perdido') || stageName.includes('lost');

  return (
    <>
      <div
        className={`h-full flex flex-col rounded-md ${
          theme === "dark"
            ? "bg-gray-950 border-gray-800"
            : "bg-gray-50 border-gray-200"
        } border shadow-sm relative overflow-hidden`}
      >
        <div className={`absolute top-0 left-0 w-full h-1 ${getStageColorClass()}`} />
        
        <div
          className={`p-3 pt-4 ${
            theme === "dark"
              ? "bg-gray-900 text-gray-100"
              : "bg-gray-100 text-gray-900"
          } rounded-t-md border-b ${
            theme === "dark" ? "border-gray-800" : "border-gray-200"
          }`}
        >
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              {isNewStage && <span className="text-blue-500 text-sm">●</span>}
              {isWonStage && <span className="text-green-500 text-sm">✓</span>}
              {isLostStage && <span className="text-red-500 text-sm">✗</span>}
              <h3 className="font-medium text-sm">{stage.name}</h3>
              <Badge 
                variant={isWonStage ? "success" : (isLostStage ? "destructive" : "secondary")} 
                className="text-xs font-normal"
              >
                {opportunities.length}
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              <div className="text-xs font-medium">
                {formatCurrency(totalValue, currency)}
              </div>
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-6 ml-1 flex items-center text-xs gap-1 opacity-70 hover:opacity-100" 
                onClick={() => setIsConfigOpen(true)}
                title="Configurar etapa"
              >
                <Settings className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
          {stage.probability !== null && (
            <div className="mt-1 text-xs text-muted-foreground flex items-center gap-1">
              <div className="w-full bg-gray-200 dark:bg-gray-700 h-1 rounded-full overflow-hidden">
                <div 
                  className={`h-full ${getStageColorClass()}`}
                  style={{ width: `${stage.probability}%` }}
                />
              </div>
              <span>{stage.probability}%</span>
            </div>
          )}
        </div>

        <Droppable droppableId={stage.id}>
          {(provided, snapshot) => (
            <div
              ref={provided.innerRef}
              {...provided.droppableProps}
              className={`flex-1 p-2 min-h-[150px] overflow-y-auto ${
                snapshot.isDraggingOver && theme === "dark"
                  ? "bg-gray-900/50"
                  : snapshot.isDraggingOver
                  ? "bg-gray-100/50"
                  : ""
              }`}
            >
              {opportunities.map((opportunity, index) => (
                <Draggable
                  key={opportunity.id}
                  draggableId={opportunity.id}
                  index={index}
                >
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.draggableProps}
                      {...provided.dragHandleProps}
                      style={{
                        ...provided.draggableProps.style,
                        opacity: snapshot.isDragging ? "0.8" : "1",
                      }}
                      className="mb-2"
                    >
                      <OpportunityCard opportunity={opportunity} />
                    </div>
                  )}
                </Draggable>
              ))}
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      </div>

      {/* Diálogo de configuración de etapa */}
      {isConfigOpen && (
        <StageConfigDialog
          isOpen={isConfigOpen}
          onClose={() => setIsConfigOpen(false)}
          stage={stage}
          onStageUpdate={(updatedStage) => {
            if (onStageUpdate) {
              onStageUpdate(updatedStage);
            }
            setIsConfigOpen(false);
          }}
        />
      )}
    </>
  );
};

export default KanbanColumn;
