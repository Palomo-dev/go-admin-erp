'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useToast } from '@/components/ui/use-toast';
import { RefreshCw, ChefHat, Volume2, VolumeX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageHeader, EmptyState, BranchBadgeActiva, RowActionsMenu } from '@/components/kit';
import { FilterBar } from '@/components/pos/comandas/FilterBar';
import { LoadingState } from '@/components/pos/comandas/LoadingState';
import { TicketsGrid } from '@/components/pos/comandas/TicketsGrid';
import { ComandasPagination } from '@/components/pos/comandas/ComandasPagination';
import { Card } from '@/components/ui/card';
import KitchenService, { type KitchenTicket, type KitchenTicketItem, type ZoneFilter, type StatusFilter, type StationFilter } from '@/lib/services/kitchenService';
import { PrintJobsService } from '@/lib/services/printJobsService';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { useBranch } from '@/lib/context/BranchContext';
import { playNotificationBeep } from '@/lib/utils/sound';
import { useTranslations } from 'next-intl';
import { alergiaPendiente } from '@/components/pos/comandas/TicketCard';
import { confirmarAlergia } from '@/components/pos/cocina/cocinaCliente';
import { itemsParaImprimir, ticketRondaDesdeRegistro, type RegistroComanda } from '@/lib/pos/cocina/lineasCarrito';

export default function ComandasPage() {
  const { toast } = useToast();
  const tComandas = useTranslations('posComandas');
  const tCocina = useTranslations('posCocina');
  const { organization } = useOrganization();
  const { branchFilter } = useBranch();
  
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
        branchId: branchFilter,
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
        title: tComandas('pagina.error'),
        description: tComandas('pagina.errorCargar'),
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
            branchId: branchFilter,
          });

          const ticketsNuevos = data.filter(
            (t) => t.status === 'new' && !knownTicketIdsRef.current.has(t.id)
          );
          if (ticketsNuevos.length > 0 && soundEnabled) {
            playNotificationBeep();
            toast({
              title: tComandas('pagina.nuevosTickets', { n: ticketsNuevos.length }),
              description: ticketsNuevos
                .map((t) => t.table_sessions?.restaurant_tables?.name || tComandas('tarjeta.ticket', { id: t.id }))
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
    // La suscripción se rehace solo al cambiar organización, filtros o sonido:
    // `loadTickets` se redefine en cada render y `toast`/`tComandas` son estables.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organization?.id, statusFilter, zoneFilter, soundEnabled, branchFilter]);

  // Cambiar estado de ticket (con actualización optimista)
  const handleStatusChange = async (ticketId: number, status: KitchenTicket['status']) => {
    const previousTickets = [...tickets];
    // Comanda con alergia sin confirmar: no se empieza (la base también lo impide;
    // esto evita el ida y vuelta al arrastrar la tarjeta).
    const objetivo = tickets.find((tk) => tk.id === ticketId);
    if (objetivo && alergiaPendiente(objetivo) && (status === 'preparing' || status === 'ready')) {
      toast({ title: tComandas('alergiaPendiente'), variant: 'destructive' });
      return;
    }
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
            kitchen_ticket_items: ticket.kitchen_ticket_items?.map((item) => (
              item.status === 'cancelled' ? item : { ...item, status: itemStatusByTicketStatus[status] }
            )),
          }
        : ticket
    ));

    try {
      await KitchenService.updateTicketStatus(ticketId, status);
      
      toast({
        title: tComandas('pagina.estadoActualizado'),
        description: tComandas('pagina.ticketMarcado', { id: ticketId, estado: getStatusLabel(status) }),
      });
    } catch (error) {
      console.error('Error actualizando estado:', JSON.stringify(error));
      setTickets(previousTickets);
      toast({
        title: tComandas('pagina.error'),
        description: tComandas('pagina.errorEstado'),
        variant: 'destructive',
      });
    }
  };

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      new: tComandas('estados.new'),
      preparing: tComandas('estados.preparing'),
      ready: tComandas('estados.ready'),
      delivered: tComandas('estados.delivered'),
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
      
      const name = productName || tComandas('tarjeta.producto');
      toast({
        title: tComandas('pagina.productoActualizado', { producto: name }),
        description: tComandas('pagina.productoMarcado', { producto: name, estado: getItemStatusLabel(status) }),
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
            title: tComandas('pagina.comandaActualizada'),
            description: tComandas('pagina.ticketPaso', { id: parentTicket.id, estado: getStatusLabel(newTicketStatus) }),
          });
        }
      }
    } catch (error) {
      console.error('Error actualizando estado del item:', JSON.stringify(error));
      // Revertir al estado anterior si falla
      setTickets(previousTickets);
      toast({
        title: tComandas('pagina.error'),
        description: tComandas('pagina.errorEstadoItem'),
        variant: 'destructive',
      });
    }
  };

  // Confirmar la alergia de la comanda (queda quién y cuándo, en el servidor)
  const handleConfirmAllergy = async (ticket: KitchenTicket) => {
    try {
      const r = await confirmarAlergia(ticket.id);
      setTickets((prev) => prev.map((tk) => (
        tk.id === ticket.id ? { ...tk, allergy_ack_at: r.allergy_ack_at, allergy_ack_by: r.allergy_ack_by } : tk
      )));
      toast({ title: tComandas('alergiaConfirmadaToast', { id: ticket.id }) });
    } catch (error) {
      console.error('Error confirmando la alergia:', error);
      toast({ title: tComandas('errorConfirmarAlergia'), variant: 'destructive' });
    }
  };

  // Reimpresión física bajo demanda (best-effort, no bloquea la UI)
  const handleReprint = async (ticket: KitchenTicket) => {
    try {
      // Con la copia del ítem y, en un ajuste, qué cambió (+n, −n, ANULAR, NOTA).
      const ronda = ticketRondaDesdeRegistro(ticket as unknown as RegistroComanda);
      const nombreMesa = ticket.table_sessions?.restaurant_tables?.name || (ticket.source === 'pos' ? 'POS' : '');
      const { enqueued, skippedStations } = await PrintJobsService.enqueueKitchenTicket(ticket.branch_id, {
        ticketId: ticket.id,
        tableName: ronda.ticket_type === 'adjustment'
          ? `${nombreMesa} · ${tCocina('impreso.ajuste', { id: ronda.adjusts_ticket_id ?? '' })}`
          : nombreMesa,
        serverName: ticket.table_sessions?.serverName || ticket.server_name || undefined,
        createdAt: ticket.created_at,
        items: itemsParaImprimir(ronda, {
          mesa: nombreMesa,
          ajuste: (original) => tCocina('impreso.ajuste', { id: original ?? '' }),
          mas: (n) => tCocina('impreso.mas', { cantidad: n }),
          menos: (n) => tCocina('impreso.menos', { cantidad: n }),
          anular: tCocina('impreso.anular'),
          notaCambiada: tCocina('impreso.nota'),
          alergia: tCocina('impreso.alergia'),
        }),
      });
      if (enqueued > 0) {
        toast({ title: tComandas('pagina.reimpresionEnviada'), description: tComandas('pagina.ticketEnviadoImpresion', { id: ticket.id }) });
      } else {
        toast({
          title: tComandas('pagina.sinImpresora'),
          description: tComandas('pagina.sinImpresoraDesc', {
            estaciones: skippedStations
              .map((s) => (tComandas.has(`estaciones.${s}`) ? tComandas(`estaciones.${s}`) : s))
              .join(', ') || tComandas('pagina.estaEstacion'),
          }),
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Error reimprimiendo ticket:', error);
      toast({ title: tComandas('pagina.error'), description: tComandas('pagina.errorReimprimir'), variant: 'destructive' });
    }
  };

  const getItemStatusLabel = (status: string) => {
    // Mismo texto que el estado de la comanda, salvo «Pendiente».
    const labels: Record<string, string> = {
      pending: tComandas('estadosItem.pending'),
      in_progress: tComandas('estados.preparing'),
      ready: tComandas('estados.ready'),
      delivered: tComandas('estados.delivered'),
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
    <div className="min-h-screen bg-canvas">
      {/* Cabecera del kit (sustituye a la local, que además tapaba el nombre del kit) */}
      <div className="px-3 pb-4 pt-4 sm:px-6 sm:pt-6">
        <PageHeader
          titulo={tComandas('cabecera.titulo')}
          subtitulo={tComandas('cabecera.subtitulo')}
          icono={ChefHat}
          cargando={isLoading}
          debajo={<BranchBadgeActiva />}
          acciones={
            <>
              <Button
                variant="outline"
                size="icon"
                className="h-10 w-10"
                onClick={() => setSoundEnabled((prev) => !prev)}
                aria-label={soundEnabled ? tComandas('cabecera.desactivarSonido') : tComandas('cabecera.activarSonido')}
                aria-pressed={soundEnabled}
                title={soundEnabled ? tComandas('cabecera.desactivarSonido') : tComandas('cabecera.activarSonido')}
              >
                {soundEnabled ? (
                  <Volume2 aria-hidden="true" className="size-4" strokeWidth={1.5} />
                ) : (
                  <VolumeX aria-hidden="true" className="size-4 text-fg-muted" strokeWidth={1.5} />
                )}
              </Button>
              <Button variant="outline" className="h-10 gap-2" onClick={loadTickets} disabled={isLoading}>
                <RefreshCw aria-hidden="true" className={isLoading ? 'size-4 animate-spin' : 'size-4'} strokeWidth={1.5} />
                {tComandas('cabecera.actualizar')}
              </Button>
            </>
          }
          movil={{
            accion: (
              <RowActionsMenu
                orientacion="horizontal"
                tamano="md"
                titulo={tComandas('cabecera.titulo')}
                acciones={[
                  { id: 'actualizar', etiqueta: tComandas('cabecera.actualizar'), icono: RefreshCw, onSelect: loadTickets, deshabilitada: isLoading },
                  {
                    id: 'sonido',
                    etiqueta: soundEnabled ? tComandas('cabecera.desactivarSonido') : tComandas('cabecera.activarSonido'),
                    icono: soundEnabled ? VolumeX : Volume2,
                    onSelect: () => setSoundEnabled((prev) => !prev),
                  },
                ]}
              />
            ),
          }}
        />
      </div>

      {/* Filtros */}
      <div className="border-y border-line bg-surface">
        <div className="px-3 sm:px-6">
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
      <div className="px-3 sm:px-6 py-4 sm:py-6">
        {isLoading ? (
          <LoadingState />
        ) : stationTickets.length === 0 ? (
          <EmptyState
            variante={zoneFilter !== 'all' || stationFilter !== 'all' || statusFilter !== 'all' ? 'search' : 'empty'}
            titulo={tComandas('vacio.titulo')}
            descripcion={tComandas('vacio.descripcion')}
            icono={ChefHat}
            onLimpiarFiltros={() => {
              setZoneFilter('all');
              setStationFilter('all');
              setStatusFilter('all');
            }}
          />
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
              onConfirmAllergy={handleConfirmAllergy}
              stationFilter={stationFilter}
            />

            {/* Paginación */}
            {stationTickets.length > 0 && (
              <Card className="p-3 sm:p-4 mt-4 sm:mt-6">
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
