"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { Draggable } from "@hello-pangea/dnd";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar, DollarSign, Eye } from "lucide-react";
import { formatCurrency } from "@/utils/Utils";
import { translateOpportunityStatus } from '@/utils/crmTranslations';

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

interface OpportunityKanbanCardProps {
  opportunity: Opportunity;
  index: number;
}

/**
 * Componente de tarjeta de oportunidad para el Kanban
 * Renderiza una oportunidad individual con drag & drop habilitado
 */
export default function OpportunityKanbanCard({ opportunity, index }: OpportunityKanbanCardProps) {
  const router = useRouter();

  return (
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
          className={`p-3 mb-2 cursor-pointer transition-all duration-200 shadow-sm hover:shadow ${
            opportunity.status === 'won' 
              ? 'border border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-900/10 hover:border-green-300 hover:bg-green-50 dark:hover:border-green-700 dark:hover:bg-green-900/20' 
              : opportunity.status === 'lost'
              ? 'border border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-900/10 hover:border-red-300 hover:bg-red-50 dark:hover:border-red-700 dark:hover:bg-red-900/20'
              : 'border border-blue-100 dark:border-blue-900 hover:border-blue-300 hover:bg-blue-50 dark:hover:border-blue-700 dark:hover:bg-blue-900/20'
          }`}
        >
          {/* Título de la oportunidad con estado */}
          <h4 className="font-medium text-gray-900 dark:text-gray-100 flex items-center">
            {opportunity.name}
            {opportunity.status === 'won' && (
              <span className="ml-1.5 text-green-600 dark:text-green-400 text-xs bg-green-100 dark:bg-green-900/30 rounded-full px-1.5 py-0.5">
                {translateOpportunityStatus('won')}
              </span>
            )}
            {opportunity.status === 'lost' && (
              <span className="ml-1.5 text-red-600 dark:text-red-400 text-xs bg-red-100 dark:bg-red-900/30 rounded-full px-1.5 py-0.5">
                {translateOpportunityStatus('lost')}
              </span>
            )}
          </h4>
          
          {/* Información del cliente */}
          <div className="text-sm text-gray-600 dark:text-gray-400 mt-1 flex items-center">
            {opportunity.customer?.full_name || 'Cliente no especificado'}
          </div>
          
          {/* Fecha esperada de cierre */}
          {opportunity.expected_close_date && (
            <div className="mt-1 text-xs text-gray-500 dark:text-gray-400 flex items-center">
              <Calendar className="h-3 w-3 mr-1 text-blue-500 dark:text-blue-400" />
              {new Date(opportunity.expected_close_date).toLocaleDateString('es-ES')}
            </div>
          )}
          
          {/* Footer con monto, moneda y acciones */}
          <div className="flex items-center justify-between mt-2 pt-2 border-t border-blue-50 dark:border-blue-900/50">
            <div className={`font-medium flex items-center ${
              opportunity.status === 'won' 
                ? 'text-green-600 dark:text-green-400' 
                : opportunity.status === 'lost' 
                ? 'text-red-500 dark:text-red-400' 
                : 'text-blue-600 dark:text-blue-400'
            }`}>
              <DollarSign className="h-3 w-3 mr-0.5" />
              {formatCurrency(opportunity.amount)}
            </div>
            <div className="flex items-center gap-2">
              <Badge 
                className={`capitalize ${
                  opportunity.status === 'won' 
                    ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' 
                    : opportunity.status === 'lost' 
                    ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200' 
                    : 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
                }`}
              >
                {opportunity.currency || 'COP'}
              </Badge>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 w-6 p-0 hover:bg-blue-100 dark:hover:bg-blue-900"
                onClick={(e) => {
                  e.stopPropagation();
                  router.push(`/app/crm/oportunidades/${opportunity.id}`);
                }}
                title="Ver detalle de la oportunidad"
              >
                <Eye className="h-3 w-3" />
              </Button>
            </div>
          </div>
        </Card>
      )}
    </Draggable>
  );
}
