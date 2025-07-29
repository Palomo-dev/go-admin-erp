"use client";

import React from "react";
import { Droppable } from "@hello-pangea/dnd";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { BarChart3 } from "lucide-react";
import { formatCurrency } from "@/utils/Utils";
import OpportunityKanbanCard from "./OpportunityKanbanCard";

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

interface StageColumnProps {
  stage: Stage;
  opportunities: Opportunity[];
  onConfigStage: (stage: Stage) => void;
  onDeleteStage: (stageId: string) => void;
  calculateStageValue: (stageId: string) => number;
}

export default function StageColumn({
  stage,
  opportunities,
  onConfigStage,
  onDeleteStage,
  calculateStageValue,
}: StageColumnProps) {
  const getOpportunitiesByStage = (stageId: string) => {
    return opportunities.filter(opp => opp.stage_id === stageId);
  };

  const stageOpportunities = getOpportunitiesByStage(stage.id);

  return (
    <div className="flex-shrink-0 w-72 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700">
      {/* Header de la etapa */}
      <div className="p-3 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 rounded-t-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <h3 className="font-semibold text-gray-900 dark:text-gray-100 mr-2">
              {stage.name}
            </h3>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger>
                  <Badge 
                    variant="secondary" 
                    className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 hover:bg-blue-200 dark:hover:bg-blue-800"
                  >
                    {stageOpportunities.length}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Número de oportunidades</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          
          {/* Acciones de la etapa */}
          <div className="flex items-center">
            <button 
              onClick={() => onConfigStage(stage)}
              className="ml-1 p-1 rounded-md hover:bg-blue-100 dark:hover:bg-blue-900 text-blue-600 dark:text-blue-400"
              title="Configurar etapa"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-settings">
                <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"></path>
                <circle cx="12" cy="12" r="3"></circle>
              </svg>
            </button>
            <button 
              onClick={() => onDeleteStage(stage.id)}
              className="ml-1 p-1 rounded-md hover:bg-red-100 dark:hover:bg-red-900 text-red-600 dark:text-red-400"
              title="Eliminar etapa"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-trash-2">
                <path d="m3 6 3 0"></path>
                <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path>
                <path d="m8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
                <line x1="10" x2="10" y1="11" y2="17"></line>
                <line x1="14" x2="14" y1="11" y2="17"></line>
              </svg>
            </button>
          </div>
        </div>
      </div>
      
      {/* Valor total de la etapa */}
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
              <p className="text-xs text-gray-500">
                Total sin ponderar: {formatCurrency(stageOpportunities.reduce((acc, opp) => acc + (opp.amount || 0), 0))}
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
      
      {/* Área de drop para oportunidades */}
      <Droppable droppableId={stage.id}>
        {(provided) => (
          <div 
            {...provided.droppableProps}
            ref={provided.innerRef}
            className="min-h-[12rem] p-2 bg-white dark:bg-gray-800"
          >
            {stageOpportunities.map((opportunity, index) => (
              <OpportunityKanbanCard
                key={opportunity.id}
                opportunity={opportunity}
                index={index}
              />
            ))}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </div>
  );
}
