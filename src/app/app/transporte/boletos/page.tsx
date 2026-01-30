'use client';

import { useState, useEffect, useCallback } from 'react';
import { useToast } from '@/components/ui/use-toast';
import { useOrganization } from '@/lib/hooks/useOrganization';
import {
  TicketsHeader,
  TicketsFilters,
  TicketsList,
  TicketsStats,
  TicketDialog,
} from '@/components/transporte/boletos';
import { ticketsService, type TicketWithDetails } from '@/lib/services/ticketsService';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface Trip {
  id: string;
  trip_code: string;
  trip_date: string;
  scheduled_departure?: string;
  available_seats?: number;
  transport_routes?: { name: string } | { name: string }[];
}

interface Stop {
  id: string;
  name: string;
  city?: string;
}

export default function BoletosPage() {
  const { toast } = useToast();
  const { organization } = useOrganization();
  const organizationId = organization?.id;

  const [tickets, setTickets] = useState<TicketWithDetails[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [stats, setStats] = useState({
    total: 0,
    reserved: 0,
    confirmed: 0,
    boarded: 0,
    cancelled: 0,
    noShow: 0,
    revenue: 0,
  });
  const [trips, setTrips] = useState<Trip[]>([]);

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [paymentFilter, setPaymentFilter] = useState('all');
  const [tripFilter, setTripFilter] = useState('all');

  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [ticketToCancel, setTicketToCancel] = useState<TicketWithDetails | null>(null);

  const [showTicketDialog, setShowTicketDialog] = useState(false);
  const [ticketToEdit, setTicketToEdit] = useState<TicketWithDetails | null>(null);
  const [stops, setStops] = useState<Stop[]>([]);

  const loadData = useCallback(async () => {
    if (!organizationId) return;

    setIsLoading(true);
    try {
      const [ticketsData, statsData, tripsData, stopsData] = await Promise.all([
        ticketsService.getTickets(organizationId, {
          status: statusFilter !== 'all' ? statusFilter : undefined,
          paymentStatus: paymentFilter !== 'all' ? paymentFilter : undefined,
          tripId: tripFilter !== 'all' ? tripFilter : undefined,
          search: searchTerm || undefined,
        }),
        ticketsService.getTicketStats(organizationId),
        ticketsService.getTrips(organizationId),
        ticketsService.getStops(organizationId),
      ]);

      setTickets(ticketsData);
      setStats(statsData);
      setTrips(tripsData);
      setStops(stopsData);
    } catch (error) {
      console.error('Error loading tickets:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar los boletos',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [organizationId, statusFilter, paymentFilter, tripFilter, searchTerm, toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const hasFilters = searchTerm !== '' || statusFilter !== 'all' || paymentFilter !== 'all' || tripFilter !== 'all';

  const clearFilters = () => {
    setSearchTerm('');
    setStatusFilter('all');
    setPaymentFilter('all');
    setTripFilter('all');
  };

  const handleNew = () => {
    setTicketToEdit(null);
    setShowTicketDialog(true);
  };

  const handleView = (ticket: TicketWithDetails) => {
    setTicketToEdit(ticket);
    setShowTicketDialog(true);
  };

  const handleEdit = (ticket: TicketWithDetails) => {
    setTicketToEdit(ticket);
    setShowTicketDialog(true);
  };

  const handleSaveTicket = async (data: Partial<TicketWithDetails>) => {
    if (!organizationId) return;

    try {
      if (ticketToEdit) {
        await ticketsService.updateTicket(ticketToEdit.id, data);
        toast({ title: 'Boleto actualizado' });
      } else {
        await ticketsService.createTicket({ ...data, organization_id: organizationId });
        toast({ title: 'Boleto creado' });
      }
      loadData();
    } catch (error) {
      console.error('Error saving ticket:', error);
      toast({ title: 'Error', description: 'No se pudo guardar el boleto', variant: 'destructive' });
      throw error;
    }
  };

  const handleDuplicate = async (ticket: TicketWithDetails) => {
    if (!organizationId) return;

    try {
      await ticketsService.duplicateTicket(ticket.id, organizationId);
      toast({ title: 'Boleto duplicado', description: 'Se ha creado una copia del boleto' });
      loadData();
    } catch (error) {
      console.error('Error duplicating ticket:', error);
      toast({ title: 'Error', description: 'No se pudo duplicar el boleto', variant: 'destructive' });
    }
  };

  const handleResendQR = async (ticket: TicketWithDetails) => {
    try {
      const result = await ticketsService.resendQR(ticket.id);
      toast({ title: 'QR enviado', description: result.message });
    } catch (error) {
      console.error('Error resending QR:', error);
      toast({ title: 'Error', description: 'No se pudo enviar el QR', variant: 'destructive' });
    }
  };

  const handleSearchCustomer = async (query: string) => {
    if (!organizationId) return [];
    return ticketsService.searchCustomers(organizationId, query);
  };

  const handleConfirm = async (ticket: TicketWithDetails) => {
    try {
      await ticketsService.confirmTicket(ticket.id);
      toast({ title: 'Boleto confirmado' });
      loadData();
    } catch (error) {
      console.error('Error confirming ticket:', error);
      toast({ title: 'Error', description: 'No se pudo confirmar', variant: 'destructive' });
    }
  };

  const handleBoard = async (ticket: TicketWithDetails) => {
    try {
      await ticketsService.boardTicket(ticket.id);
      toast({ title: 'Pasajero abordado' });
      loadData();
    } catch (error) {
      console.error('Error boarding ticket:', error);
      toast({ title: 'Error', description: 'No se pudo marcar abordado', variant: 'destructive' });
    }
  };

  const handleNoShow = async (ticket: TicketWithDetails) => {
    try {
      await ticketsService.markNoShow(ticket.id);
      toast({ title: 'No Show registrado' });
      loadData();
    } catch (error) {
      console.error('Error marking no show:', error);
      toast({ title: 'Error', description: 'No se pudo marcar No Show', variant: 'destructive' });
    }
  };

  const handleCancel = (ticket: TicketWithDetails) => {
    setTicketToCancel(ticket);
    setShowCancelDialog(true);
  };

  const confirmCancel = async () => {
    if (!ticketToCancel) return;

    try {
      await ticketsService.cancelTicket(ticketToCancel.id);
      toast({ title: 'Boleto cancelado' });
      loadData();
    } catch (error) {
      console.error('Error cancelling ticket:', error);
      toast({ title: 'Error', description: 'No se pudo cancelar', variant: 'destructive' });
    } finally {
      setShowCancelDialog(false);
      setTicketToCancel(null);
    }
  };

  const handleRefund = async (ticket: TicketWithDetails) => {
    try {
      await ticketsService.processRefund(ticket.id);
      toast({ title: 'Reembolso procesado' });
      loadData();
    } catch (error) {
      console.error('Error processing refund:', error);
      toast({ title: 'Error', description: 'No se pudo procesar reembolso', variant: 'destructive' });
    }
  };

  return (
    <div className="p-6 space-y-6">
      <TicketsHeader onNew={handleNew} onRefresh={loadData} isLoading={isLoading} />

      <TicketsStats stats={stats} />

      <TicketsFilters
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        statusFilter={statusFilter}
        onStatusChange={setStatusFilter}
        paymentFilter={paymentFilter}
        onPaymentChange={setPaymentFilter}
        tripFilter={tripFilter}
        onTripChange={setTripFilter}
        trips={trips}
        onClearFilters={clearFilters}
        hasFilters={hasFilters}
      />

      <TicketsList
        tickets={tickets}
        isLoading={isLoading}
        onView={handleView}
        onEdit={handleEdit}
        onConfirm={handleConfirm}
        onBoard={handleBoard}
        onNoShow={handleNoShow}
        onCancel={handleCancel}
        onRefund={handleRefund}
        onDuplicate={handleDuplicate}
        onResendQR={handleResendQR}
      />

      <TicketDialog
        open={showTicketDialog}
        onOpenChange={setShowTicketDialog}
        ticket={ticketToEdit}
        trips={trips}
        stops={stops}
        onSave={handleSaveTicket}
        onSearchCustomer={handleSearchCustomer}
      />

      <AlertDialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Cancelar boleto?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción cancelará el boleto <strong>{ticketToCancel?.ticket_number}</strong>.
              El pasajero no podrá abordar con este boleto.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Volver</AlertDialogCancel>
            <AlertDialogAction onClick={confirmCancel} className="bg-red-600 hover:bg-red-700">
              Cancelar Boleto
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
