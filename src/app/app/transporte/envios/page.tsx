'use client';

import { useState, useEffect, useCallback } from 'react';
import { useToast } from '@/components/ui/use-toast';
import { useOrganization, getCurrentBranchId } from '@/lib/hooks/useOrganization';
import {
  ShipmentsHeader,
  ShipmentsFilters,
  ShipmentsList,
  ShipmentsStats,
  ShipmentDialog,
} from '@/components/transporte/envios';
import { AssignDriverDialog, type AvailableDriver } from '@/components/transporte/envios/id';
import { shipmentsService, type ShipmentWithDetails } from '@/lib/services/shipmentsService';
import { printShipmentGuideWithCut, printShipmentGuidesWithCut } from '@/components/transporte/envios/shipmentLabelPrinter';
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
    assigned: 0,
    inTransit: 0,
    outForDelivery: 0,
    delivered: 0,
    failed: 0,
    returned: 0,
    cancelled: 0,
    revenue: 0,
    totalWeight: 0,
    totalDeclaredValue: 0,
    shipmentsToday: 0,
    unassignedPending: 0,
    deliveryRate: 0,
  });
  const [trips, setTrips] = useState<Trip[]>([]);

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [paymentFilter, setPaymentFilter] = useState('all');
  const [tripFilter, setTripFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [driverFilter, setDriverFilter] = useState('all');
  const [driversList, setDriversList] = useState<{ id: string; name: string }[]>([]);

  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [shipmentToCancel, setShipmentToCancel] = useState<ShipmentWithDetails | null>(null);

  const [showShipmentDialog, setShowShipmentDialog] = useState(false);
  const [shipmentToEdit, setShipmentToEdit] = useState<ShipmentWithDetails | null>(null);
  const [stops, setStops] = useState<Stop[]>([]);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkAssignDriver, setShowBulkAssignDriver] = useState(false);
  const [availableDrivers, setAvailableDrivers] = useState<AvailableDriver[]>([]);
  const [isLoadingDrivers, setIsLoadingDrivers] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const loadData = useCallback(async () => {
    if (!organizationId) return;

    setIsLoading(true);
    setPage(1);
    try {
      const [shipmentsData, statsData, tripsData, stopsData] = await Promise.all([
        shipmentsService.getShipments(organizationId, {
          status: statusFilter !== 'all' ? statusFilter : undefined,
          payment_status: paymentFilter !== 'all' ? paymentFilter : undefined,
          tripId: tripFilter !== 'all' ? tripFilter : undefined,
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
          search: searchTerm || undefined,
        }),
        shipmentsService.getShipmentStats(organizationId),
        shipmentsService.getTrips(organizationId),
        shipmentsService.getStops(organizationId),
      ]);

      // Construir lista de conductores desde los envíos
      const driverMap = new Map<string, string>();
      shipmentsData.forEach((s) => {
        const driverId = (s.metadata as Record<string, unknown> | null)?.driver_id as string | undefined;
        if (driverId && s.driver_name) {
          driverMap.set(driverId, s.driver_name);
        }
      });
      setDriversList(Array.from(driverMap.entries()).map(([id, name]) => ({ id, name })));

      // Aplicar filtro de conductor en cliente (metadata.driver_id)
      let filtered = shipmentsData;
      if (driverFilter === 'unassigned') {
        filtered = shipmentsData.filter(
          (s) => !(s.metadata as Record<string, unknown> | null)?.driver_id
        );
      } else if (driverFilter !== 'all') {
        filtered = shipmentsData.filter(
          (s) => (s.metadata as Record<string, unknown> | null)?.driver_id === driverFilter
        );
      }
      setShipments(filtered);

      setStats({
        total: statsData.total || 0,
        pending: statsData.pending || 0,
        assigned: statsData.assigned || 0,
        inTransit: statsData.inTransit || 0,
        outForDelivery: statsData.outForDelivery || 0,
        delivered: statsData.delivered || 0,
        failed: statsData.failed || 0,
        returned: statsData.returned || 0,
        cancelled: statsData.cancelled || 0,
        revenue: statsData.revenue || 0,
        totalWeight: statsData.totalWeight || 0,
        totalDeclaredValue: statsData.totalDeclaredValue || 0,
        shipmentsToday: statsData.shipmentsToday || 0,
        unassignedPending: statsData.unassignedPending || 0,
        deliveryRate: statsData.deliveryRate || 0,
      });
      setTrips(tripsData as Trip[]);
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
  }, [organizationId, statusFilter, paymentFilter, tripFilter, searchTerm, dateFrom, dateTo, driverFilter, toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const hasFilters = searchTerm !== '' || statusFilter !== 'all' || paymentFilter !== 'all' || tripFilter !== 'all' || dateFrom !== '' || dateTo !== '' || driverFilter !== 'all';

  const clearFilters = () => {
    setSearchTerm('');
    setStatusFilter('all');
    setPaymentFilter('all');
    setTripFilter('all');
    setDateFrom('');
    setDateTo('');
    setDriverFilter('all');
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

  const handlePrintLabel = async (shipment: ShipmentWithDetails) => {
    const branchId = getCurrentBranchId();
    const result = await printShipmentGuideWithCut(
      shipment,
      {
        orgInfo: organization ? {
          name: organization.name,
          nit: organization.nit,
          tax_id: organization.tax_id,
          address: organization.address,
          phone: organization.phone,
        } : undefined,
      },
      branchId || undefined,
    );
    if (result.method === 'agent') {
      toast({ title: 'Guia enviada a impresora termica', description: `${result.enqueued} job(s) encolado(s) con corte automatico` });
    }
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

  const handleOpenBulkAssignDriver = async () => {
    if (!organizationId || selectedIds.size === 0) return;
    setShowBulkAssignDriver(true);
    setIsLoadingDrivers(true);
    try {
      const drivers = await shipmentsService.getAvailableDrivers(organizationId);
      setAvailableDrivers(drivers);
    } catch (error) {
      console.error('Error loading drivers:', error);
      toast({ title: 'Error', description: 'No se pudieron cargar los conductores', variant: 'destructive' });
    } finally {
      setIsLoadingDrivers(false);
    }
  };

  const handleBulkAssignDriver = async (driverId: string) => {
    if (selectedIds.size === 0) return;
    try {
      const { succeeded, failed } = await shipmentsService.bulkAssignDriver(
        Array.from(selectedIds),
        driverId
      );
      toast({
        title: 'Asignación masiva completada',
        description: `${succeeded} envío(s) asignado(s)${failed > 0 ? `, ${failed} fallaron` : ''}`,
        variant: failed > 0 ? 'destructive' : 'default',
      });
      setSelectedIds(new Set());
      setShowBulkAssignDriver(false);
      loadData();
    } catch (error) {
      console.error('Error bulk assigning driver:', error);
      toast({ title: 'Error', description: 'No se pudo asignar el conductor', variant: 'destructive' });
    }
  };

  const handleBulkStatusChange = async (status: string) => {
    if (selectedIds.size === 0) return;
    try {
      const { succeeded, failed } = await shipmentsService.bulkUpdateStatus(Array.from(selectedIds), status);
      toast({
        title: 'Estado actualizado',
        description: `${succeeded} envío(s) actualizado(s)${failed > 0 ? `, ${failed} fallaron` : ''}`,
        variant: failed > 0 ? 'destructive' : 'default',
      });
      setSelectedIds(new Set());
      loadData();
    } catch (error) {
      console.error('Error bulk status change:', error);
      toast({ title: 'Error', description: 'No se pudo actualizar el estado', variant: 'destructive' });
    }
  };

  const handleBulkCancel = async () => {
    if (selectedIds.size === 0) return;
    try {
      const { succeeded, failed } = await shipmentsService.bulkCancel(Array.from(selectedIds));
      toast({
        title: 'Cancelación masiva completada',
        description: `${succeeded} envío(s) cancelado(s)${failed > 0 ? `, ${failed} fallaron` : ''}`,
        variant: failed > 0 ? 'destructive' : 'default',
      });
      setSelectedIds(new Set());
      loadData();
    } catch (error) {
      console.error('Error bulk cancel:', error);
      toast({ title: 'Error', description: 'No se pudieron cancelar los envíos', variant: 'destructive' });
    }
  };

  const handleBulkMarkReturned = async () => {
    if (selectedIds.size === 0) return;
    try {
      const { succeeded, failed } = await shipmentsService.bulkMarkReturned(Array.from(selectedIds));
      toast({
        title: 'Devolución masiva completada',
        description: `${succeeded} envío(s) marcado(s) como devuelto(s)${failed > 0 ? `, ${failed} fallaron` : ''}`,
        variant: failed > 0 ? 'destructive' : 'default',
      });
      setSelectedIds(new Set());
      loadData();
    } catch (error) {
      console.error('Error bulk mark returned:', error);
      toast({ title: 'Error', description: 'No se pudieron marcar las devoluciones', variant: 'destructive' });
    }
  };

  const handleBulkPrintLabels = async () => {
    if (selectedIds.size === 0) return;
    toast({ title: 'Imprimir guias', description: `Generando ${selectedIds.size} guia(s)...` });
    const selectedShipments = shipments.filter((s) => selectedIds.has(s.id));
    const orgInfo = organization ? {
      name: organization.name,
      nit: organization.nit,
      tax_id: organization.tax_id,
      address: organization.address,
      phone: organization.phone,
    } : undefined;
    const branchId = getCurrentBranchId();
    const result = await printShipmentGuidesWithCut(
      selectedShipments.map((s) => ({ shipment: s, options: { orgInfo } })),
      branchId || undefined,
    );
    if (result.method === 'agent') {
      toast({ title: 'Guias enviadas a impresora termica', description: `${result.enqueued} job(s) encolado(s) con corte automatico` });
    }
    setSelectedIds(new Set());
  };

  const handleBulkMarkPaid = async () => {
    if (selectedIds.size === 0) return;
    try {
      const { succeeded, failed } = await shipmentsService.bulkMarkPaid(Array.from(selectedIds));
      toast({
        title: 'Pago masivo completado',
        description: `${succeeded} envío(s) marcado(s) como pagado(s)${failed > 0 ? `, ${failed} fallaron` : ''}`,
        variant: failed > 0 ? 'destructive' : 'default',
      });
      setSelectedIds(new Set());
      loadData();
    } catch (error) {
      console.error('Error bulk mark paid:', error);
      toast({ title: 'Error', description: 'No se pudieron marcar como pagados', variant: 'destructive' });
    }
  };

  const handleBulkAddIncident = () => {
    if (selectedIds.size === 0) return;
    toast({
      title: 'Incidentes masivos',
        description: `Se abrirá el gestor de incidentes para ${selectedIds.size} envío(s)`,
    });
    // TODO: Abrir IncidentDialog para los envíos seleccionados
  };

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
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
        dateFrom={dateFrom}
        onDateFromChange={setDateFrom}
        dateTo={dateTo}
        onDateToChange={setDateTo}
        driverFilter={driverFilter}
        onDriverChange={setDriverFilter}
        drivers={driversList}
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
        selectedIds={selectedIds}
        onSelectionChange={setSelectedIds}
        onBulkAssignDriver={handleOpenBulkAssignDriver}
        onBulkStatusChange={handleBulkStatusChange}
        onBulkCancel={handleBulkCancel}
        onBulkMarkReturned={handleBulkMarkReturned}
        onBulkPrintLabels={handleBulkPrintLabels}
        onBulkMarkPaid={handleBulkMarkPaid}
        onBulkAddIncident={handleBulkAddIncident}
        page={page}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={(size) => { setPageSize(size); setPage(1); }}
      />

      <ShipmentDialog
        open={showShipmentDialog}
        onOpenChange={setShowShipmentDialog}
        shipment={shipmentToEdit}
        stops={stops}
        onSave={handleSaveShipment}
        onSearchCustomer={handleSearchCustomer}
        organizationId={organizationId}
      />

      <AssignDriverDialog
        open={showBulkAssignDriver}
        onOpenChange={setShowBulkAssignDriver}
        drivers={availableDrivers}
        isLoading={isLoadingDrivers}
        onAssign={handleBulkAssignDriver}
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
