'use client';

import React from 'react';
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd';
import { Badge } from '@/components/ui/badge';
import { TicketCard } from './TicketCard';
import type { KitchenTicket, KitchenTicketItem, StationFilter } from '@/lib/services/kitchenService';

interface TicketsGridProps {
  tickets: {
    new: KitchenTicket[];
    in_progress: KitchenTicket[];
    ready: KitchenTicket[];
    delivered?: KitchenTicket[];
  };
  onStatusChange: (ticketId: number, status: KitchenTicket['status']) => void;
  onItemStatusChange?: (itemId: number, status: KitchenTicketItem['status'], productName?: string) => void;
  onReprint?: (ticket: KitchenTicket) => Promise<void> | void;
  stationFilter?: StationFilter;
}

type ColumnKey = 'new' | 'in_progress' | 'ready' | 'delivered';

const COLUMNS: { key: ColumnKey; status: KitchenTicket['status']; label: string; badgeClass: string }[] = [
  { key: 'new', status: 'new', label: 'Nuevos', badgeClass: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' },
  { key: 'in_progress', status: 'preparing', label: 'En Preparación', badgeClass: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400' },
  { key: 'ready', status: 'ready', label: 'Listos para Entregar', badgeClass: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' },
  { key: 'delivered', status: 'delivered', label: 'Entregados', badgeClass: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400' },
];

const DELIVERED_VISIBLE_LIMIT = 12;

export function TicketsGrid({ tickets, onStatusChange, onItemStatusChange, onReprint, stationFilter }: TicketsGridProps) {
  const columnsData: Record<ColumnKey, KitchenTicket[]> = {
    new: tickets.new,
    in_progress: tickets.in_progress,
    ready: tickets.ready,
    delivered: tickets.delivered || [],
  };

  const handleDragEnd = (result: DropResult) => {
    const { source, destination, draggableId } = result;
    if (!destination) return;
    if (source.droppableId === destination.droppableId) return;

    const targetColumn = COLUMNS.find((c) => c.key === destination.droppableId);
    if (!targetColumn) return;

    onStatusChange(Number(draggableId), targetColumn.status);
  };

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {COLUMNS.map((column) => {
          const columnTickets = columnsData[column.key];
          const visibleTickets =
            column.key === 'delivered' ? columnTickets.slice(0, DELIVERED_VISIBLE_LIMIT) : columnTickets;

          return (
            <div key={column.key} className="flex flex-col min-w-0">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2 mb-2">
                <Badge className={column.badgeClass}>{columnTickets.length}</Badge>
                {column.label}
              </h2>

              <Droppable droppableId={column.key}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className={`flex-1 space-y-3 rounded-lg p-1.5 min-h-[120px] transition-colors ${
                      snapshot.isDraggingOver ? 'bg-blue-50 dark:bg-blue-900/20 ring-2 ring-blue-300 dark:ring-blue-700' : ''
                    }`}
                  >
                    {visibleTickets.map((ticket, index) => (
                      <Draggable key={ticket.id} draggableId={ticket.id.toString()} index={index}>
                        {(dragProvided, dragSnapshot) => (
                          <div
                            ref={dragProvided.innerRef}
                            {...dragProvided.draggableProps}
                            {...dragProvided.dragHandleProps}
                            className={dragSnapshot.isDragging ? 'opacity-90 rotate-1' : ''}
                          >
                            <TicketCard
                              ticket={ticket}
                              onStatusChange={onStatusChange}
                              onItemStatusChange={onItemStatusChange}
                              onReprint={onReprint}
                              stationFilter={stationFilter}
                            />
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}

                    {column.key === 'delivered' && columnTickets.length > DELIVERED_VISIBLE_LIMIT && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 text-center py-2">
                        Mostrando los últimos {DELIVERED_VISIBLE_LIMIT} de {columnTickets.length}
                      </p>
                    )}
                  </div>
                )}
              </Droppable>
            </div>
          );
        })}
      </div>
    </DragDropContext>
  );
}
