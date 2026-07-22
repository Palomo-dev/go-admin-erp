'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useToast } from '@/components/ui/use-toast';
import { PageHeader } from '@/components/pos/comandas/PageHeader';
import { FilterBar } from '@/components/pos/comandas/FilterBar';
import { LoadingState } from '@/components/pos/comandas/LoadingState';
import { EmptyState } from '@/components/pos/comandas/EmptyState';
import { TicketsGrid } from '@/components/pos/comandas/TicketsGrid';
import { ComandasPagination } from '@/components/pos/comandas/ComandasPagination';
import { Card } from '@/components/ui/card';
import KitchenService, { type KitchenTicket, type KitchenTicketItem, type ZoneFilter, type StatusFilter, type StationFilter } from '@/lib/services/kitchenService';
import { PrintJobsService } from '@/lib/services/printJobsService';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { playNotificationBeep } from '@/lib/utils/sound';

export default function ComandasPage() {
  const { toast } = useToast();
  const { organization } = useOrganization();
  
  const [tickets, setTickets] = useState<KitchenTicket[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [zoneFilter, setZoneFilter] = useState<ZoneFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [stationFilter, setStationFilter] = useState<StationFilter>('all');
  const [availableZones, setAvailableZones] = useState<string[]>([]);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const knownTicketIdsRef = useRef<Set<number>>(new Set());
  
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
      // Semilla inicial de IDs conocidos, sin disparar sonido de notificación
      knownTicketIdsRef.current = new Set(data.map((t) => t.id));
      
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
        // Recargar silenciosamente (sin setIsLoading) cuando hay cambios en tiempo real
        try {
          const data = await KitchenService.getKitchenTickets({
            organizationId: organization.id,
            status: statusFilter,
            zone: zoneFilter,
          });

          const ticketsNuevos = data.filter(
            (t) => t.status === 'new' && !knownTicketIdsRef.current.has(t.id)
          );
          if (ticketsNuevos.length > 0 && soundEnabled) {
            playNotificationBeep();
            toast({
              title: ticketsNuevos.length === 1 ? 'Nuevo ticket de cocina' : 'Nuevos tickets de cocina',
              description: ticketsNuevos
                .map((t) => t.table_sessions?.restaurant_tables?.name || `Ticket #${t.id}`)
                .join(', '),
            });
          }

          knownTicketIdsRef.current = new Set(data.map((t) => t.id));
          setTickets(data);
        } catch (err) {
          console.error('Error recargando tickets por realtime:', err);
        }
      }
    );

    return () => {
      unsubscribe();
    };
  }, [organization?.id, statusFilter, zoneFilter, soundEnabled]);

  // Cambiar estado de ticket (con actualización optimista)
  const handleStatusChange = async (ticketId: number, status: KitchenTicket['status']) => {
    const previousTickets = [...tickets];
    const itemStatusByTicketStatus: Record<KitchenTicket['status'], KitchenTicketItem['status']> = {
      new: 'pending',
      preparing: 'in_progress',
      ready: 'ready',
      delivered: 'delivered',
    };

    // Actualización optimista: el ticket y todos sus items reflejan el nuevo estado
    const nowIso = new Date().toISOString();
    setTickets(prev => prev.map(ticket =>
      ticket.id === ticketId
        ? {
            ...ticket,
            status,
            ready_at: status === 'ready' ? nowIso : (status === 'delivered' ? ticket.ready_at : null),
            kitchen_ticket_items: ticket.kitchen_ticket_items?.map((item) => ({
              ...item,
              status: itemStatusByTicketStatus[status],
            })),
          }
        : ticket
    ));

    try {
      await KitchenService.updateTicketStatus(ticketId, status);
      
      toast({
        title: 'Estado actualizado',
        description: `Ticket #${ticketId} marcado como ${getStatusLabel(status)}`,
      });
    } catch (error) {
      console.error('Error actualizando estado:', JSON.stringify(error));
      setTickets(previousTickets);
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

  // Cambiar estado de item individual (con actualización optimista)
  const handleItemStatusChange = async (itemId: number, status: KitchenTicketItem['status'], productName?: string) => {
    // Guardar estado anterior para revertir en caso de error
    const previousTickets = [...tickets];
    
    // Actualización optimista: actualizar UI inmediatamente
    setTickets(prev => prev.map(ticket => ({
      ...ticket,
      kitchen_ticket_items: ticket.kitchen_ticket_items?.map(item =>
        item.id === itemId ? { ...item, status } : item
      ),
    })));

    try {
      await KitchenService.updateItemStatus(itemId, status);
      
      const name = productName || 'Producto';
      toast({
        title: `${name} actualizado`,
        description: `${name} marcado como ${getItemStatusLabel(status)}`,
      });

      // Auto-promover estado del ticket si todos los items tienen el mismo estado
      const parentTicket = previousTickets.find(t =>
        t.kitchen_ticket_items?.some(i => i.id === itemId)
      );
      if (parentTicket?.kitchen_ticket_items) {
        // Simular el nuevo estado de items (el item actualizado + los demás)
        const updatedItems = parentTicket.kitchen_ticket_items.map(i =>
          i.id === itemId ? { ...i, status } : i
        );
        const allInProgress = updatedItems.every(i => i.status === 'in_progress' || i.status === 'ready' || i.status === 'delivered');
        const allReady = updatedItems.every(i => i.status === 'ready' || i.status === 'delivered');

        let newTicketStatus: KitchenTicket['status'] | null = null;
        if (allReady && parentTicket.status !== 'ready') {
          newTicketStatus = 'ready';
        } else if (allInProgress && !allReady && parentTicket.status === 'new') {
          newTicketStatus = 'preparing';
        }

        if (newTicketStatus) {
          // Actualización optimista del ticket
          setTickets(prev => prev.map(t =>
            t.id === parentTicket.id ? { ...t, status: newTicketStatus! } : t
          ));
          await KitchenService.updateTicketStatus(parentTicket.id, newTicketStatus);
          toast({
            title: 'Comanda actualizada',
            description: `Ticket #${parentTicket.id} pasó a ${getStatusLabel(newTicketStatus)}`,
          });
        }
      }
    } catch (error) {
      console.error('Error actualizando estado del item:', JSON.stringify(error));
      // Revertir al estado anterior si falla
      setTickets(previousTickets);
      toast({
        title: 'Error',
        description: 'No se pudo actualizar el estado del item',
        variant: 'destructive',
      });
    }
  };

  // Reimpresión física bajo demanda (best-effort, no bloquea la UI)
  const handleReprint = async (ticket: KitchenTicket) => {
    try {
      const { enqueued, skippedStations } = await PrintJobsService.enqueueKitchenTicketByRecord(ticket);
      if (enqueued > 0) {
        toast({ title: 'Reimpresión enviada', description: `Ticket #${ticket.id} enviado a impresión` });
      } else {
        toast({
          title: 'Sin impresora asignada',
          description: `No hay impresora configurada para: ${skippedStations.join(', ') || 'esta estación'}`,
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Error reimprimiendo ticket:', error);
      toast({ title: 'Error', description: 'No se pudo reimprimir la comanda', variant: 'destructive' });
    }
  };

  const getItemStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      pending: 'Pendiente',
      in_progress: 'En Preparación',
      ready: 'Listo',
      delivered: 'Entregado',
    };
    return labels[status] || status;
  };

  // Filtro por estación de cocina (cliente): solo tickets con al menos un item de esa estación
  const stationTickets = stationFilter === 'all'
    ? tickets
    : tickets.filter((t) => t.kitchen_ticket_items?.some((i) => i.station === stationFilter));

  // Los tickets ya vienen filtrados del servicio, solo agrupar por estado
  const ticketsByStatus = {
    new: stationTickets.filter((t) => t.status === 'new'),
    in_progress: stationTickets.filter((t) => t.status === 'preparing'),
    ready: stationTickets.filter((t) => t.status === 'ready'),
    delivered: stationTickets.filter((t) => t.status === 'delivered'),
  };

  // Calcular paginación
  const totalPages = Math.ceil(stationTickets.length / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const paginatedTickets = stationTickets.slice(startIndex, endIndex);

  // Tickets paginados agrupados por estado
  const paginatedTicketsByStatus = {
    new: paginatedTickets.filter((t) => t.status === 'new'),
    in_progress: paginatedTickets.filter((t) => t.status === 'preparing'),
    ready: paginatedTickets.filter((t) => t.status === 'ready'),
    delivered: paginatedTickets.filter((t) => t.status === 'delivered'),
  };

  // Resetear página cuando cambian los filtros
  useEffect(() => {
    setCurrentPage(1);
  }, [zoneFilter, statusFilter, stationFilter, pageSize]);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <PageHeader
        onRefresh={loadTickets}
        isLoading={isLoading}
        soundEnabled={soundEnabled}
        onToggleSound={() => setSoundEnabled((prev) => !prev)}
      />

      {/* Filtros */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="px-6">
          <FilterBar
            zoneFilter={zoneFilter}
            statusFilter={statusFilter}
            stationFilter={stationFilter}
            availableZones={availableZones}
            onZoneChange={setZoneFilter}
            onStatusChange={setStatusFilter}
            onStationChange={setStationFilter}
            statusCounts={{
              new: ticketsByStatus.new.length,
              in_progress: ticketsByStatus.in_progress.length,
              ready: ticketsByStatus.ready.length,
              delivered: ticketsByStatus.delivered.length,
            }}
          />
        </div>
      </div>

      {/* Contenido principal */}
      <div className="px-6 py-6">
        {isLoading ? (
          <LoadingState />
        ) : stationTickets.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            <TicketsGrid
              tickets={{
                new: paginatedTicketsByStatus.new,
                in_progress: paginatedTicketsByStatus.in_progress,
                ready: paginatedTicketsByStatus.ready,
                delivered: paginatedTicketsByStatus.delivered,
              }}
              onStatusChange={handleStatusChange}
              onItemStatusChange={handleItemStatusChange}
              onReprint={handleReprint}
              stationFilter={stationFilter}
            />

            {/* Paginación */}
            {stationTickets.length > 0 && (
              <Card className="p-4 mt-6">
                <ComandasPagination
                  currentPage={currentPage}
                  totalPages={totalPages}
                  pageSize={pageSize}
                  totalItems={stationTickets.length}
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
