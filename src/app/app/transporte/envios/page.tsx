'use client';

import { useState, useEffect, useCallback } from 'react';
import { useToast } from '@/components/ui/use-toast';
import { useOrganization } from '@/lib/hooks/useOrganization';
import {
  ShipmentsHeader,
  ShipmentsFilters,
  ShipmentsList,
  ShipmentsStats,
  ShipmentDialog,
} from '@/components/transporte/envios';
import { shipmentsService, type ShipmentWithDetails } from '@/lib/services/shipmentsService';
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
  transport_routes?: { name: string };
}

interface Stop {
  id: string;
  name: string;
  city?: string;
}

export default function EnviosPage() {
  const { toast } = useToast();
  const { organization } = useOrganization();
  const organizationId = organization?.id;

  const [shipments, setShipments] = useState<ShipmentWithDetails[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [stats, setStats] = useState({
    total: 0,
    pending: 0,
    received: 0,
    inTransit: 0,
    delivered: 0,
    cancelled: 0,
    revenue: 0,
  });
  const [trips, setTrips] = useState<Trip[]>([]);

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [paymentFilter, setPaymentFilter] = useState('all');
  const [tripFilter, setTripFilter] = useState('all');

  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [shipmentToCancel, setShipmentToCancel] = useState<ShipmentWithDetails | null>(null);

  const [showShipmentDialog, setShowShipmentDialog] = useState(false);
  const [shipmentToEdit, setShipmentToEdit] = useState<ShipmentWithDetails | null>(null);
  const [stops, setStops] = useState<Stop[]>([]);

  const loadData = useCallback(async () => {
    if (!organizationId) return;

    setIsLoading(true);
    try {
      const [shipmentsData, statsData, tripsData, stopsData] = await Promise.all([
        shipmentsService.getShipments(organizationId, {
          status: statusFilter !== 'all' ? statusFilter : undefined,
          payment_status: paymentFilter !== 'all' ? paymentFilter : undefined,
          tripId: tripFilter !== 'all' ? tripFilter : undefined,
          search: searchTerm || undefined,
        }),
        shipmentsService.getShipmentStats(organizationId),
        shipmentsService.getTrips(organizationId),
        shipmentsService.getStops(organizationId),
      ]);

      setShipments(shipmentsData);
      setStats({
        total: statsData.total || 0,
        pending: statsData.pending || 0,
        received: statsData.pickedUp || 0,
        inTransit: statsData.inTransit || 0,
        delivered: statsData.delivered || 0,
        cancelled: statsData.cancelled || 0,
        revenue: statsData.revenue || 0,
      });
      // Mapear trips para asegurar compatibilidad de tipos
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mappedTrips: Trip[] = (tripsData as any[]).map((t) => ({
        id: t.id,
        trip_code: t.trip_code,
        transport_routes: Array.isArray(t.transport_routes) ? t.transport_routes[0] : t.transport_routes,
      }));
      setTrips(mappedTrips);
      setStops(stopsData);
    } catch (error) {
      console.error('Error loading shipments:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar los envíos',
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
    setShipmentToEdit(null);
    setShowShipmentDialog(true);
  };

  const handleEdit = (shipment: ShipmentWithDetails) => {
    setShipmentToEdit(shipment);
    setShowShipmentDialog(true);
  };

  const handleSaveShipment = async (data: Partial<ShipmentWithDetails>) => {
    if (!organizationId) return;

    try {
      if (shipmentToEdit) {
        await shipmentsService.updateShipment(shipmentToEdit.id, data);
        toast({ title: 'Envío actualizado' });
      } else {
        await shipmentsService.createShipment({ ...data, organization_id: organizationId });
        toast({ title: 'Envío creado' });
      }
      loadData();
    } catch (error) {
      console.error('Error saving shipment:', error);
      toast({ title: 'Error', description: 'No se pudo guardar el envío', variant: 'destructive' });
      throw error;
    }
  };

  const handleDuplicate = async (shipment: ShipmentWithDetails) => {
    if (!organizationId) return;

    try {
      await shipmentsService.duplicateShipment(shipment.id, organizationId);
      toast({ title: 'Envío duplicado', description: 'Se ha creado una copia del envío' });
      loadData();
    } catch (error) {
      console.error('Error duplicating shipment:', error);
      toast({ title: 'Error', description: 'No se pudo duplicar el envío', variant: 'destructive' });
    }
  };

  const handleMarkReturned = async (shipment: ShipmentWithDetails) => {
    try {
      await shipmentsService.markReturned(shipment.id);
      toast({ title: 'Envío devuelto', description: 'El envío ha sido marcado como devuelto' });
      loadData();
    } catch (error) {
      console.error('Error marking returned:', error);
      toast({ title: 'Error', description: 'No se pudo marcar como devuelto', variant: 'destructive' });
    }
  };

  const handleSearchCustomer = async (query: string) => {
    if (!organizationId) return [];
    return shipmentsService.searchCustomers(organizationId, query);
  };

  const handleStatusChange = async (shipment: ShipmentWithDetails, status: string) => {
    try {
      await shipmentsService.updateStatus(shipment.id, status as ShipmentWithDetails['status']);
      toast({
        title: 'Estado actualizado',
        description: `Envío ${shipment.tracking_number} actualizado`,
      });
      loadData();
    } catch (error) {
      console.error('Error updating status:', error);
      toast({
        title: 'Error',
        description: 'No se pudo actualizar el estado',
        variant: 'destructive',
      });
    }
  };

  const handlePrintLabel = (shipment: ShipmentWithDetails) => {
    toast({
      title: 'Imprimir etiqueta',
      description: `Etiqueta de ${shipment.tracking_number}`,
    });
  };

  const handleCancel = (shipment: ShipmentWithDetails) => {
    setShipmentToCancel(shipment);
    setShowCancelDialog(true);
  };

  const confirmCancel = async () => {
    if (!shipmentToCancel) return;

    try {
      await shipmentsService.updateStatus(shipmentToCancel.id, 'cancelled');
      toast({ title: 'Envío cancelado' });
      loadData();
    } catch (error) {
      console.error('Error cancelling shipment:', error);
      toast({ title: 'Error', description: 'No se pudo cancelar', variant: 'destructive' });
    } finally {
      setShowCancelDialog(false);
      setShipmentToCancel(null);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <ShipmentsHeader onNew={handleNew} onRefresh={loadData} isLoading={isLoading} />

      <ShipmentsStats stats={stats} />

      <ShipmentsFilters
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

      <ShipmentsList
        shipments={shipments}
        isLoading={isLoading}
        onEdit={handleEdit}
        onStatusChange={handleStatusChange}
        onPrintLabel={handlePrintLabel}
        onCancel={handleCancel}
        onDuplicate={handleDuplicate}
        onMarkReturned={handleMarkReturned}
      />

      <ShipmentDialog
        open={showShipmentDialog}
        onOpenChange={setShowShipmentDialog}
        shipment={shipmentToEdit}
        stops={stops}
        onSave={handleSaveShipment}
        onSearchCustomer={handleSearchCustomer}
      />

      <AlertDialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Cancelar envío?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción cancelará el envío <strong>{shipmentToCancel?.tracking_number}</strong>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Volver</AlertDialogCancel>
            <AlertDialogAction onClick={confirmCancel} className="bg-red-600 hover:bg-red-700">
              Cancelar Envío
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
