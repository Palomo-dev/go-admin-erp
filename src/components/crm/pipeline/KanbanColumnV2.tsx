'use client';

import { Draggable, Droppable } from '@hello-pangea/dnd';
import { BarChart3, GripVertical, Plus, Settings, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn, formatCurrency } from '@/utils/Utils';
import { OpportunityCardV2 } from './OpportunityCardV2';
import type { KanbanOpportunity, KanbanStage } from './hooks/useKanbanBoard';

/**
 * KanbanColumnV2 — columna arrastrable (type STAGE) con borde superior en
 * `style` (fix B5: nada de `bg-[${color}]`), contador/total, acciones de
 * etapa (crear oportunidad, configurar, borrar) y droppable de oportunidades.
 */
export interface KanbanColumnV2Props {
  stage: KanbanStage;
  index: number;
  opportunities: KanbanOpportunity[];
  stats: { count: number; total: number };
  onOpen: (id: string) => void;
  onCreate: (stageId: string) => void;
  onEditStage: (stage: KanbanStage) => void;
  onDeleteStage: (stage: KanbanStage) => void;
  compact?: boolean;
}

export function KanbanColumnV2({ stage, index, opportunities, stats, onOpen, onCreate, onEditStage, onDeleteStage, compact }: KanbanColumnV2Props) {
  const color = stage.color || '#3b82f6';
  const tone = stage.is_won ? 'ring-green-200 dark:ring-green-900' : stage.is_lost ? 'ring-red-200 dark:ring-red-900' : '';

  return (
    <Draggable draggableId={`stage-${stage.id}`} index={index}>
      {(drag, snapshot) => (
        <div
          ref={drag.innerRef}
          {...drag.draggableProps}
          className={cn(
            'flex-1 min-w-[240px] max-w-[300px] sm:min-w-[260px] flex flex-col rounded-lg bg-white dark:bg-gray-800 shadow-sm border border-gray-200 dark:border-gray-700 ring-1',
            tone || 'ring-transparent',
            snapshot.isDragging && 'border-blue-500 shadow-lg'
          )}
          style={{ ...drag.draggableProps.style, borderTopWidth: 4, borderTopColor: color }}
        >
          <div className="p-2.5 border-b border-gray-200 dark:border-gray-700 flex items-center gap-1.5">
            <span {...drag.dragHandleProps} className="cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" aria-label="Reordenar etapa">
              <GripVertical className="h-4 w-4" />
            </span>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <h3 className="font-semibold text-sm text-gray-800 dark:text-gray-200 truncate flex-1 cursor-help">{stage.name}</h3>
                </TooltipTrigger>
                <TooltipContent><p className="text-xs">{stage.description || 'Sin descripción'}{stage.probability != null ? ` · ${Math.round(Number(stage.probability) <= 1 ? Number(stage.probability) * 100 : Number(stage.probability))}%` : ''}</p></TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <Badge variant="outline" className="text-[11px] bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900 dark:text-blue-200 dark:border-blue-800">{stats.count}</Badge>
            <button type="button" onClick={() => onCreate(stage.id)} className="p-1 rounded-md hover:bg-blue-100 dark:hover:bg-blue-900 text-blue-600 dark:text-blue-400" title="Crear oportunidad" aria-label="Crear oportunidad en esta etapa"><Plus className="h-4 w-4" /></button>
            <button type="button" onClick={() => onEditStage(stage)} className="p-1 rounded-md hover:bg-blue-100 dark:hover:bg-blue-900 text-blue-600 dark:text-blue-400" title="Configurar etapa" aria-label="Configurar etapa"><Settings className="h-4 w-4" /></button>
            <button type="button" onClick={() => onDeleteStage(stage)} className="p-1 rounded-md hover:bg-red-100 dark:hover:bg-red-900 text-red-500 dark:text-red-400" title="Eliminar etapa" aria-label="Eliminar etapa"><Trash2 className="h-4 w-4" /></button>
          </div>
          <div className="px-2.5 py-1.5 bg-gray-50 dark:bg-gray-700/30 flex justify-between items-center text-xs border-b border-gray-200 dark:border-gray-700">
            <span className="flex items-center text-gray-600 dark:text-gray-300"><BarChart3 className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400 mr-1" />Total</span>
            <span className="font-medium text-gray-900 dark:text-gray-100">{formatCurrency(stats.total)}</span>
          </div>
          <Droppable droppableId={stage.id} type="OPPORTUNITY">
            {(drop, dropSnap) => (
              <div ref={drop.innerRef} {...drop.droppableProps} className={cn('min-h-[10rem] flex-1 p-2 transition-colors rounded-b-lg', dropSnap.isDraggingOver && 'bg-blue-50/60 dark:bg-blue-900/10')}>
                {opportunities.map((o, i) => <OpportunityCardV2 key={o.id} opportunity={o} index={i} onOpen={onOpen} compact={compact} />)}
                {drop.placeholder}
                {opportunities.length === 0 && !dropSnap.isDraggingOver && (
                  <p className="text-[11px] text-center text-gray-400 dark:text-gray-500 py-3">Arrastra aquí</p>
                )}
                <button type="button" onClick={() => onCreate(stage.id)} className="w-full mt-1 py-1.5 flex items-center justify-center gap-1 text-xs text-gray-400 dark:text-gray-500 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg border border-dashed border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-700 transition-all">
                  <Plus className="h-3.5 w-3.5" />Nueva oportunidad
                </button>
              </div>
            )}
          </Droppable>
        </div>
      )}
    </Draggable>
  );
}
