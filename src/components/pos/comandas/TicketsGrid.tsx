'use client';

import React from 'react';
import { Badge } from '@/components/ui/badge';
import { TicketCard } from './TicketCard';
import type { KitchenTicket, KitchenTicketItem } from '@/lib/services/kitchenService';

interface TicketsGridProps {
  tickets: {
    new: KitchenTicket[];
    in_progress: KitchenTicket[];
    ready: KitchenTicket[];
  };
  onStatusChange: (ticketId: number, status: KitchenTicket['status']) => void;
  onItemStatusChange?: (itemId: number, status: KitchenTicketItem['status'], productName?: string) => void;
}

export function TicketsGrid({ tickets, onStatusChange, onItemStatusChange }: TicketsGridProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {/* Nuevos */}
      {tickets.new.length > 0 && (
        <>
          <div className="col-span-full">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
                {tickets.new.length}
              </Badge>
              Nuevos
            </h2>
          </div>
          {tickets.new.map((ticket) => (
            <TicketCard
              key={ticket.id}
              ticket={ticket}
              onStatusChange={onStatusChange}
              onItemStatusChange={onItemStatusChange}
            />
          ))}
        </>
      )}

      {/* En Proceso */}
      {tickets.in_progress.length > 0 && (
        <>
          <div className="col-span-full mt-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <Badge className="bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400">
                {tickets.in_progress.length}
              </Badge>
              En Proceso
            </h2>
          </div>
          {tickets.in_progress.map((ticket) => (
            <TicketCard
              key={ticket.id}
              ticket={ticket}
              onStatusChange={onStatusChange}
              onItemStatusChange={onItemStatusChange}
            />
          ))}
        </>
      )}

      {/* Listos */}
      {tickets.ready.length > 0 && (
        <>
          <div className="col-span-full mt-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                {tickets.ready.length}
              </Badge>
              Listos para Entregar
            </h2>
          </div>
          {tickets.ready.map((ticket) => (
            <TicketCard
              key={ticket.id}
              ticket={ticket}
              onStatusChange={onStatusChange}
              onItemStatusChange={onItemStatusChange}
            />
          ))}
        </>
      )}
    </div>
  );
}
