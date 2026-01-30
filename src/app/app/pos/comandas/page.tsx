'use client';

import React, { useState, useEffect } from 'react';
import { useToast } from '@/components/ui/use-toast';
import { PageHeader } from '@/components/pos/comandas/PageHeader';
import { FilterBar } from '@/components/pos/comandas/FilterBar';
import { LoadingState } from '@/components/pos/comandas/LoadingState';
import { EmptyState } from '@/components/pos/comandas/EmptyState';
import { TicketsGrid } from '@/components/pos/comandas/TicketsGrid';
import { ComandasPagination } from '@/components/pos/comandas/ComandasPagination';
import { Card } from '@/components/ui/card';
import KitchenService, { type KitchenTicket, type KitchenTicketItem, type ZoneFilter, type StatusFilter } from '@/lib/services/kitchenService';
import { useOrganization } from '@/lib/hooks/useOrganization';

export default function ComandasPage() {
  const { toast } = useToast();
  const { organization } = useOrganization();
  
  const [tickets, setTickets] = useState<KitchenTicket[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [zoneFilter, setZoneFilter] = useState<ZoneFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [availableZones, setAvailableZones] = useState<string[]>([]);
  
  // Paginación
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(8);

  // Cargar tickets
  const loadTickets = async () => {
    if (!organization?.id) return;
    
    try {
      setIsLoading(true);
      const data = await KitchenService.getKitchenTickets({
        organizationId: organization.id,
        status: statusFilter,
        zone: zoneFilter,
      });
      setTickets(data);
      
      // Extraer zonas únicas de los tickets
      const zones = Array.from(
        new Set(
          data
            .map(t => t.table_sessions?.restaurant_tables?.zone)
            .filter(Boolean) as string[]
        )
      ).sort();
      setAvailableZones(zones);
    } catch (error) {
      console.error('Error cargando tickets:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar las comandas',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Suscripción a tiempo real
  useEffect(() => {
    if (!organization?.id) return;

    loadTickets();

    const unsubscribe = KitchenService.subscribeToKitchenTickets(
      organization.id,
      async () => {
        // Recargar con los filtros actuales cuando hay cambios en tiempo real
        const data = await KitchenService.getKitchenTickets({
          organizationId: organization.id,
          status: statusFilter,
          zone: zoneFilter,
        });
        setTickets(data);
      }
    );

    return () => {
      unsubscribe();
    };
  }, [organization?.id, statusFilter, zoneFilter]);

  // Cambiar estado de ticket
  const handleStatusChange = async (ticketId: number, status: KitchenTicket['status']) => {
    try {
      await KitchenService.updateTicketStatus(ticketId, status);
      
      toast({
        title: 'Estado actualizado',
        description: `Ticket #${ticketId} marcado como ${getStatusLabel(status)}`,
      });
      
      // Los cambios se reflejarán automáticamente por Realtime
    } catch (error) {
      console.error('Error actualizando estado:', error);
      toast({
        title: 'Error',
        description: 'No se pudo actualizar el estado',
        variant: 'destructive',
      });
    }
  };

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      new: 'Nuevo',
      preparing: 'En Preparación',
      ready: 'Listo',
      delivered: 'Entregado',
    };
    return labels[status] || status;
  };

  // Cambiar estado de item individual
  const handleItemStatusChange = async (itemId: number, status: KitchenTicketItem['status']) => {
    try {
      await KitchenService.updateItemStatus(itemId, status);
      
      toast({
        title: 'Item actualizado',
        description: `Item marcado como ${getItemStatusLabel(status)}`,
      });
      
      // Los cambios se reflejarán automáticamente por Realtime
    } catch (error) {
      console.error('Error actualizando estado del item:', error);
      toast({
        title: 'Error',
        description: 'No se pudo actualizar el estado del item',
        variant: 'destructive',
      });
    }
  };

  const getItemStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      pending: 'Pendiente',
      preparing: 'En Preparación',
      ready: 'Listo',
      delivered: 'Entregado',
    };
    return labels[status] || status;
  };

  // Los tickets ya vienen filtrados del servicio, solo agrupar por estado
  const ticketsByStatus = {
    new: tickets.filter((t) => t.status === 'new'),
    in_progress: tickets.filter((t) => t.status === 'preparing'),
    ready: tickets.filter((t) => t.status === 'ready'),
    delivered: tickets.filter((t) => t.status === 'delivered'),
  };

  // Calcular paginación
  const totalPages = Math.ceil(tickets.length / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const paginatedTickets = tickets.slice(startIndex, endIndex);

  // Tickets paginados agrupados por estado
  const paginatedTicketsByStatus = {
    new: paginatedTickets.filter((t) => t.status === 'new'),
    in_progress: paginatedTickets.filter((t) => t.status === 'preparing'),
    ready: paginatedTickets.filter((t) => t.status === 'ready'),
  };

  // Resetear página cuando cambian los filtros
  useEffect(() => {
    setCurrentPage(1);
  }, [zoneFilter, statusFilter, pageSize]);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <PageHeader onRefresh={loadTickets} isLoading={isLoading} />

      {/* Filtros */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="container mx-auto px-6">
          <FilterBar
            zoneFilter={zoneFilter}
            statusFilter={statusFilter}
            availableZones={availableZones}
            onZoneChange={setZoneFilter}
            onStatusChange={setStatusFilter}
            statusCounts={{
              new: ticketsByStatus.new.length,
              in_progress: ticketsByStatus.in_progress.length,
              ready: ticketsByStatus.ready.length,
            }}
          />
        </div>
      </div>

      {/* Contenido principal */}
      <div className="container mx-auto px-6 py-6">
        {isLoading ? (
          <LoadingState />
        ) : tickets.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            <TicketsGrid
              tickets={{
                new: paginatedTicketsByStatus.new,
                in_progress: paginatedTicketsByStatus.in_progress,
                ready: paginatedTicketsByStatus.ready,
              }}
              onStatusChange={handleStatusChange}
              onItemStatusChange={handleItemStatusChange}
            />

            {/* Paginación */}
            {tickets.length > 0 && (
              <Card className="p-4 mt-6">
                <ComandasPagination
                  currentPage={currentPage}
                  totalPages={totalPages}
                  pageSize={pageSize}
                  totalItems={tickets.length}
                  onPageChange={setCurrentPage}
                  onPageSizeChange={setPageSize}
                />
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  );
}
