"use client";

import { Draggable, Droppable } from "@hello-pangea/dnd";
import { formatCurrency } from "@/utils/Utils";
import { useTheme } from "next-themes";
import { OpportunityCard } from "./OpportunityCard";
import { Opportunity, Stage } from "@/types/crm";
import { Badge } from "@/components/ui/badge";

interface KanbanColumnProps {
  stage: Stage;
  opportunities: Opportunity[];
  onOpportunityDrop: (opportunityId: string, sourceStageId: string, destinationStageId: string) => Promise<void>;
  stageTotal: number;
  isLoading?: boolean;
}

const KanbanColumn = ({ stage, opportunities, stageTotal, isLoading }: KanbanColumnProps) => {
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

  return (
    <div
      className={`h-full flex flex-col rounded-md ${
        theme === "dark"
          ? "bg-gray-950 border-gray-800"
          : "bg-gray-50 border-gray-200"
      } border shadow-sm`}
    >
      <div
        className={`p-3 ${
          theme === "dark"
            ? "bg-gray-900 text-gray-100"
            : "bg-gray-100 text-gray-900"
        } rounded-t-md border-b ${
          theme === "dark" ? "border-gray-800" : "border-gray-200"
        }`}
      >
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            <h3 className="font-medium text-sm">{stage.name}</h3>
            <Badge variant="secondary" className="text-xs font-normal">
              {opportunities.length}
            </Badge>
          </div>
          <div className="text-xs font-medium">
            {formatCurrency(totalValue, currency)}
          </div>
        </div>
        {stage.probability !== null && (
          <div className="mt-1 text-xs text-muted-foreground">
            Prob: {stage.probability}%
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
  );
}

export default KanbanColumn;
