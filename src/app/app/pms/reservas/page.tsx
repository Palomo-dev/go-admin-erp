'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { useToast } from '@/components/ui/use-toast';
import ReservationListService, { type ReservationFilters, type ReservationListItem } from '@/lib/services/reservationListService';
import CheckinService, { type CheckinReservation } from '@/lib/services/checkinService';
import CheckoutService, { type CheckoutReservation } from '@/lib/services/checkoutService';
import {
  ReservationsHeader,
  ReservationsFilters,
  ReservationsTable,
  ReservationsPagination,
  ReservationsBulkActions,
} from '@/components/pms/reservas';
import { CheckinDialog, type CheckinData } from '@/components/pms/checkin';
import { CheckoutDialog, type CheckoutDialogData } from '@/components/pms/checkout';
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

export default function ReservasPage() {
  const router = useRouter();
  const { organization } = useOrganization();
  const { toast } = useToast();

  const [reservations, setReservations] = useState<ReservationListItem[]>([]);
  const [filteredReservations, setFilteredReservations] = useState<ReservationListItem[]>([]);
  const [filters, setFilters] = useState<ReservationFilters>({});
  const [stats, setStats] = useState({
    total: 0,
    confirmed: 0,
    checkedIn: 0,
    checkedOut: 0,
    cancelled: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Paginación
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Estado para diálogo de confirmación (solo cancel, check-out usa su propio dialog)
  const [dialogState, setDialogState] = useState<{
    isOpen: boolean;
    type: 'cancel' | null;
    reservationId: string | null;
    title: string;
    description: string;
  }>({
    isOpen: false,
    type: null,
    reservationId: null,
    title: '',
    description: '',
  });

  // Estado para diálogo completo de check-in
  const [selectedReservation, setSelectedReservation] = useState<CheckinReservation | null>(null);
  const [showCheckinDialog, setShowCheckinDialog] = useState(false);

  // Estado para diálogo completo de check-out
  const [selectedCheckoutReservation, setSelectedCheckoutReservation] = useState<CheckoutReservation | null>(null);
  const [showCheckoutDialog, setShowCheckoutDialog] = useState(false);

  // Estado para selección múltiple
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isProcessingBulk, setIsProcessingBulk] = useState(false);

  // Estado para diálogo de confirmación de acciones masivas
  const [bulkDialogState, setBulkDialogState] = useState<{
    isOpen: boolean;
    type: 'confirm' | 'cancel' | null;
    title: string;
    description: string;
  }>({
    isOpen: false,
    type: null,
    title: '',
    description: '',
  });

  // Cargar datos al inicio
  useEffect(() => {
    if (organization) {
      loadData();
    }
  }, [organization]);

  // Filtrar reservas cuando cambian los filtros
  useEffect(() => {
    filterReservations();
  }, [filters, reservations]);

  const loadData = async () => {
    if (!organization) return;

    try {
      setIsLoading(true);
      const [reservationsData, statsData] = await Promise.all([
        ReservationListService.getReservations(organization.id, filters),
        ReservationListService.getReservationStats(organization.id),
      ]);

      setReservations(reservationsData);
      setStats(statsData);
    } catch (error: any) {
      console.error('Error cargando reservas:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar las reservas',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadData();
    setIsRefreshing(false);
    toast({
      title: 'Actualizado',
      description: 'Las reservas se han actualizado correctamente',
    });
  };

  const filterReservations = () => {
    let filtered = [...reservations];

    // Filtro de búsqueda por texto
    if (filters.searchTerm) {
      const searchLower = filters.searchTerm.toLowerCase();
      filtered = filtered.filter(
        (r) =>
          r.code.toLowerCase().includes(searchLower) ||
          r.customer_name.toLowerCase().includes(searchLower) ||
          r.customer_email.toLowerCase().includes(searchLower)
      );
    }

    setFilteredReservations(filtered);
  };

  // Calcular paginación
  const totalPages = Math.ceil(filteredReservations.length / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const paginatedReservations = filteredReservations.slice(startIndex, endIndex);

  // Resetear página cuando cambian los filtros o pageSize
  useEffect(() => {
    setCurrentPage(1);
  }, [filters, pageSize]);

  const handleNewReservation = () => {
    router.push('/app/pms/reservas/nueva');
  };

  const handleView = (id: string) => {
    router.push(`/app/pms/reservas/${id}`);
  };

  const handleEdit = (id: string) => {
    router.push(`/app/pms/reservas/${id}/editar`);
  };

  // Funciones de selección múltiple
  const getSelectedReservations = () => {
    return filteredReservations.filter((r) => selectedIds.has(r.id));
  };

  const canConfirmSelected = () => {
    const selected = getSelectedReservations();
    return selected.some((r) => r.status === 'tentative');
  };

  const canCancelSelected = () => {
    const selected = getSelectedReservations();
    return selected.some((r) => ['tentative', 'confirmed'].includes(r.status));
  };

  const handleBulkConfirm = () => {
    const count = getSelectedReservations().filter((r) => r.status === 'tentative').length;
    setBulkDialogState({
      isOpen: true,
      type: 'confirm',
      title: 'Confirmar Reservas',
      description: `¿Estás seguro de confirmar ${count} reserva${count !== 1 ? 's' : ''} seleccionada${count !== 1 ? 's' : ''}?`,
    });
  };

  const handleBulkCancel = () => {
    const count = getSelectedReservations().filter((r) => ['tentative', 'confirmed'].includes(r.status)).length;
    setBulkDialogState({
      isOpen: true,
      type: 'cancel',
      title: 'Cancelar Reservas',
      description: `¿Estás seguro de cancelar ${count} reserva${count !== 1 ? 's' : ''} seleccionada${count !== 1 ? 's' : ''}? Esta acción no se puede deshacer.`,
    });
  };

  const handleBulkExport = () => {
    const selected = getSelectedReservations();
    ReservationListService.exportToCSV(selected);
    toast({
      title: 'Exportado',
      description: `${selected.length} reserva${selected.length !== 1 ? 's' : ''} exportada${selected.length !== 1 ? 's' : ''} correctamente`,
    });
  };

  const confirmBulkAction = async () => {
    setIsProcessingBulk(true);
    try {
      if (bulkDialogState.type === 'confirm') {
        const idsToConfirm = getSelectedReservations()
          .filter((r) => r.status === 'tentative')
          .map((r) => r.id);
        
        const result = await ReservationListService.confirmMultipleReservations(idsToConfirm);
        
        toast({
          title: 'Reservas Confirmadas',
          description: `${result.success} reserva${result.success !== 1 ? 's' : ''} confirmada${result.success !== 1 ? 's' : ''} correctamente${result.failed > 0 ? `. ${result.failed} fallaron.` : ''}`,
        });
      } else if (bulkDialogState.type === 'cancel') {
        const idsToCancel = getSelectedReservations()
          .filter((r) => ['tentative', 'confirmed'].includes(r.status))
          .map((r) => r.id);
        
        const result = await ReservationListService.cancelMultipleReservations(idsToCancel);
        
        toast({
          title: 'Reservas Canceladas',
          description: `${result.success} reserva${result.success !== 1 ? 's' : ''} cancelada${result.success !== 1 ? 's' : ''} correctamente${result.failed > 0 ? `. ${result.failed} fallaron.` : ''}`,
        });
      }

      // Limpiar selección y recargar datos
      setSelectedIds(new Set());
      await loadData();
    } catch (error: any) {
      console.error('Error en acción masiva:', error);
      toast({
        title: 'Error',
        description: 'No se pudo completar la acción',
        variant: 'destructive',
      });
    } finally {
      setIsProcessingBulk(false);
      setBulkDialogState({
        isOpen: false,
        type: null,
        title: '',
        description: '',
      });
    }
  };

  const handleCheckIn = async (id: string) => {
    try {
      // Buscar la reserva en la lista actual
      const reservation = reservations.find((r) => r.id === id);
      if (!reservation) {
        toast({
          title: 'Error',
          description: 'No se encontró la reserva',
          variant: 'destructive',
        });
        return;
      }

      // Obtener datos completos para check-in desde Supabase
      const arrivalsData = await CheckinService.getTodayArrivals(organization!.id);

      // Buscar la reserva específica
      const fullReservation = arrivalsData.find((r: CheckinReservation) => r.id === id);
      
      if (!fullReservation) {
        // Si no está en las llegadas de hoy, construir desde los datos de la lista
        const checkIn = reservation.checkin;
        const checkOut = reservation.checkout;
        const nights = reservation.nights;

        const tempReservation: CheckinReservation = {
          id: reservation.id,
          code: reservation.code,
          customer_name: reservation.customer_name,
          customer_email: reservation.customer_email,
          customer_phone: '',
          customer_id: '',
          checkin: checkIn,
          checkout: checkOut,
          nights: nights,
          occupant_count: reservation.occupant_count,
          total_estimated: reservation.total_estimated,
          status: reservation.status,
          spaces: reservation.spaces.map((label, idx) => ({
            id: '',
            label: label,
            space_type_name: reservation.space_types[idx] || '',
            floor_zone: '',
            housekeeping_status: 'pending',
            is_ready: false,
          })),
          metadata: {},
        };
        setSelectedReservation(tempReservation);
      } else {
        setSelectedReservation(fullReservation);
      }
      
      setShowCheckinDialog(true);
    } catch (error: any) {
      console.error('Error al preparar check-in:', error);
      toast({
        title: 'Error',
        description: 'No se pudo preparar el check-in',
        variant: 'destructive',
      });
    }
  };

  const handleCheckOut = async (id: string) => {
    try {
      // Buscar la reserva en la lista actual
      const reservation = reservations.find((r) => r.id === id);
      if (!reservation) {
        toast({
          title: 'Error',
          description: 'No se encontró la reserva',
          variant: 'destructive',
        });
        return;
      }

      // Obtener datos completos para check-out desde Supabase
      const today = new Date().toISOString().split('T')[0];
      const departuresData = await CheckoutService.getDepartures(organization!.id, today);

      // Buscar la reserva específica
      const fullReservation = departuresData.find((r: CheckoutReservation) => r.id === id);
      
      if (!fullReservation) {
        // Si no está en las salidas de hoy, construir desde los datos de la lista
        const checkIn = reservation.checkin;
        const checkOut = reservation.checkout;
        const nights = reservation.nights;

        const tempReservation: CheckoutReservation = {
          id: reservation.id,
          code: reservation.code,
          customer_name: reservation.customer_name,
          customer_email: reservation.customer_email,
          customer_phone: '',
          customer_id: '',
          checkin: checkIn,
          checkout: checkOut,
          nights: nights,
          occupant_count: reservation.occupant_count,
          total_estimated: reservation.total_estimated,
          status: reservation.status,
          spaces: reservation.spaces.map((label, idx) => ({
            id: '',
            label: label,
            space_type_name: reservation.space_types[idx] || '',
            floor_zone: '',
            housekeeping_status: 'pending',
            is_ready: false,
          })),
          folio: null,
          metadata: {},
        };
        setSelectedCheckoutReservation(tempReservation);
      } else {
        setSelectedCheckoutReservation(fullReservation);
      }
      
      setShowCheckoutDialog(true);
    } catch (error: any) {
      console.error('Error al preparar check-out:', error);
      toast({
        title: 'Error',
        description: 'No se pudo cargar los datos para check-out',
        variant: 'destructive',
      });
    }
  };

  const handleCancel = (id: string) => {
    setDialogState({
      isOpen: true,
      type: 'cancel',
      reservationId: id,
      title: 'Cancelar Reserva',
      description: '¿Estás seguro de cancelar esta reserva? Esta acción no se puede deshacer.',
    });
  };

  const handleConfirmCheckin = async (data: CheckinData) => {
    try {
      console.log('Iniciando check-in para:', data);

      // Realizar check-in con todos los datos
      await CheckinService.performCheckin({
        reservationId: data.reservationId,
        notes: data.notes,
        depositAmount: data.depositAmount,
        signatureData: data.signatureData,
        identificationType: data.identificationType,
        identificationNumber: data.identificationNumber,
        nationality: data.nationality,
        originCity: data.originCity,
        originCountry: data.originCountry,
        destinationCity: data.destinationCity,
        destinationCountry: data.destinationCountry,
      });

      console.log('Check-in realizado exitosamente');

      // Registrar depósito si existe
      if (data.depositAmount > 0) {
        console.log('Registrando depósito:', data.depositAmount);
        await CheckinService.registerDeposit({
          reservationId: data.reservationId,
          amount: data.depositAmount,
          method: data.depositMethod,
          reference: data.depositReference,
        });
        console.log('Depósito registrado exitosamente');
      }

      toast({
        title: 'Check-in Exitoso',
        description: `Check-in realizado para ${selectedReservation?.customer_name}`,
      });

      // Recargar datos
      await loadData();
      setShowCheckinDialog(false);
      setSelectedReservation(null);
    } catch (error: any) {
      console.error('Error completo al realizar check-in:', error);
      console.error('Error message:', error.message);
      console.error('Error details:', error.details);
      console.error('Error hint:', error.hint);
      
      toast({
        title: 'Error al Realizar Check-in',
        description: error.message || error.hint || 'No se pudo completar el check-in. Revisa la consola para más detalles.',
        variant: 'destructive',
      });
    }
  };

  const handleConfirmCheckout = async (data: CheckoutDialogData) => {
    try {
      console.log('Iniciando check-out para:', data);

      // Realizar check-out con todos los datos
      await CheckoutService.performCheckout({
        reservationId: data.reservationId,
        notes: data.notes,
        generateInvoice: data.generateInvoice,
        generateReceipt: data.generateReceipt,
      });

      console.log('Check-out realizado exitosamente');

      toast({
        title: 'Check-out Exitoso',
        description: `Check-out realizado para ${selectedCheckoutReservation?.customer_name}`,
      });

      // Recargar datos
      await loadData();
      setShowCheckoutDialog(false);
      setSelectedCheckoutReservation(null);
    } catch (error: any) {
      console.error('Error completo al realizar check-out:', error);
      console.error('Error message:', error.message);
      console.error('Error details:', error.details);
      console.error('Error hint:', error.hint);
      
      toast({
        title: 'Error al Realizar Check-out',
        description: error.message || error.hint || 'No se pudo completar el check-out. Revisa la consola para más detalles.',
        variant: 'destructive',
      });
    }
  };

  const confirmAction = async () => {
    if (!dialogState.reservationId || !dialogState.type) return;

    try {
      switch (dialogState.type) {
        case 'cancel':
          await ReservationListService.cancelReservation(dialogState.reservationId);
          toast({
            title: 'Reserva cancelada',
            description: 'La reserva se canceló correctamente',
          });
          break;
      }

      // Recargar datos
      await loadData();
    } catch (error: any) {
      console.error('Error en acción:', error);
      toast({
        title: 'Error',
        description: 'No se pudo completar la acción',
        variant: 'destructive',
      });
    } finally {
      setDialogState({
        isOpen: false,
        type: null,
        reservationId: null,
        title: '',
        description: '',
      });
    }
  };

  if (!organization) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-gray-500 dark:text-gray-400">Cargando...</p>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50 dark:bg-gray-950">
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        <ReservationsHeader
          stats={stats}
          onNewReservation={handleNewReservation}
          onRefresh={handleRefresh}
          isRefreshing={isRefreshing}
        />

        <ReservationsFilters
          filters={filters}
          onFiltersChange={setFilters}
          onClearFilters={() => setFilters({})}
        />

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full"></div>
          </div>
        ) : (
          <>
            {/* Barra de acciones masivas */}
            <ReservationsBulkActions
              selectedCount={selectedIds.size}
              totalCount={paginatedReservations.length}
              allSelected={paginatedReservations.length > 0 && paginatedReservations.every((r) => selectedIds.has(r.id))}
              onSelectAll={() => {
                if (paginatedReservations.every((r) => selectedIds.has(r.id))) {
                  setSelectedIds(new Set());
                } else {
                  setSelectedIds(new Set(paginatedReservations.map((r) => r.id)));
                }
              }}
              onClearSelection={() => setSelectedIds(new Set())}
              onConfirm={handleBulkConfirm}
              onCancel={handleBulkCancel}
              onExport={handleBulkExport}
              isProcessing={isProcessingBulk}
              canConfirm={canConfirmSelected()}
              canCancel={canCancelSelected()}
            />

            <ReservationsTable
              reservations={paginatedReservations}
              selectedIds={selectedIds}
              onSelectionChange={setSelectedIds}
              onView={handleView}
              onEdit={handleEdit}
              onCheckIn={handleCheckIn}
              onCheckOut={handleCheckOut}
              onCancel={handleCancel}
            />

            {/* Paginación */}
            {filteredReservations.length > 0 && (
              <div className="mt-6 p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                <ReservationsPagination
                  currentPage={currentPage}
                  totalPages={totalPages}
                  pageSize={pageSize}
                  totalItems={filteredReservations.length}
                  onPageChange={setCurrentPage}
                  onPageSizeChange={setPageSize}
                />
              </div>
            )}
          </>
        )}
      </div>

      {/* Diálogo de confirmación para cancel individual */}
      <AlertDialog open={dialogState.isOpen} onOpenChange={(open) => {
        if (!open) {
          setDialogState({
            isOpen: false,
            type: null,
            reservationId: null,
            title: '',
            description: '',
          });
        }
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{dialogState.title}</AlertDialogTitle>
            <AlertDialogDescription>{dialogState.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmAction}>
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Diálogo de confirmación para acciones masivas */}
      <AlertDialog open={bulkDialogState.isOpen} onOpenChange={(open) => {
        if (!open) {
          setBulkDialogState({
            isOpen: false,
            type: null,
            title: '',
            description: '',
          });
        }
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{bulkDialogState.title}</AlertDialogTitle>
            <AlertDialogDescription>{bulkDialogState.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isProcessingBulk}>Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={confirmBulkAction}
              disabled={isProcessingBulk}
              className={bulkDialogState.type === 'cancel' ? 'bg-red-600 hover:bg-red-700' : ''}
            >
              {isProcessingBulk ? 'Procesando...' : 'Confirmar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Diálogo completo de check-in */}
      <CheckinDialog
        open={showCheckinDialog}
        onOpenChange={setShowCheckinDialog}
        reservation={selectedReservation}
        onConfirm={handleConfirmCheckin}
      />

      {/* Diálogo completo de check-out */}
      <CheckoutDialog
        open={showCheckoutDialog}
        onOpenChange={setShowCheckoutDialog}
        reservation={selectedCheckoutReservation}
        onConfirm={handleConfirmCheckout}
      />
    </div>
  );
}
