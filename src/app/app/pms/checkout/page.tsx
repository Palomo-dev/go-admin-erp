'use client';

import React, { useState, useEffect } from 'react';
import { useToast } from '@/components/ui/use-toast';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { Button } from '@/components/ui/button';
import { RefreshCw, Calendar, LogOut } from 'lucide-react';
import CheckoutService, {
  type CheckoutReservation,
  type CheckoutStats as CheckoutStatsType,
} from '@/lib/services/checkoutService';
import { supabase } from '@/lib/supabase/config';
import {
  CheckoutStats,
  DeparturesTable,
  CheckoutDialog,
  type CheckoutDialogData,
} from '@/components/pms/checkout';
import {
  DateRangeFilter,
  getDateRangeFromPreset,
  getDateRangeLabel,
  type DateRangePreset,
  type CustomDateRange,
} from '@/components/pms/checkin';
import { ReservationsPagination } from '@/components/pms/reservas';

export default function CheckoutPage() {
  const { toast } = useToast();
  const { organization } = useOrganization();

  const [departures, setDepartures] = useState<CheckoutReservation[]>([]);
  const [stats, setStats] = useState<CheckoutStatsType>({
    total_departures: 0,
    checked_out: 0,
    pending: 0,
    with_balance: 0,
    rooms_cleaned: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [selectedReservation, setSelectedReservation] =
    useState<CheckoutReservation | null>(null);
  const [showCheckoutDialog, setShowCheckoutDialog] = useState(false);

  // Paginación
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Filtro de fechas
  const [datePreset, setDatePreset] = useState<DateRangePreset>('today');
  const [customDateRange, setCustomDateRange] = useState<CustomDateRange>({});

  useEffect(() => {
    if (organization) {
      loadData();
    }
  }, [organization, datePreset, customDateRange]);

  const loadData = async () => {
    if (!organization) return;

    try {
      setIsLoading(true);

      // Obtener rango de fechas según el preset
      const dateRange = getDateRangeFromPreset(datePreset, customDateRange);

      // Cargar salidas y estadísticas en paralelo
      const [departuresData, statsData] = await Promise.all([
        CheckoutService.getDepartures(
          organization.id,
          dateRange.startDate,
          dateRange.endDate
        ),
        CheckoutService.getStats(
          organization.id,
          dateRange.startDate,
          dateRange.endDate
        ),
      ]);

      setDepartures(departuresData);
      setStats(statsData);
    } catch (error: any) {
      console.error('Error loading check-out data:', error);
      
      toast({
        title: 'Error',
        description: error.message || error.hint || 'No se pudieron cargar las salidas del día',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCheckout = (reservation: CheckoutReservation) => {
    setSelectedReservation(reservation);
    setShowCheckoutDialog(true);
  };

  const handleViewFolio = (reservation: CheckoutReservation) => {
    // TODO: Implementar vista detallada del folio
    console.log('Ver folio de reserva:', reservation.id);
    toast({
      title: 'Folio',
      description: `Abriendo folio de ${reservation.code}`,
    });
  };

  const handleConfirmCheckout = async (data: CheckoutDialogData) => {
    try {
      console.log('Iniciando check-out para:', data);

      // Obtener usuario actual para auditoría
      const { data: { user } } = await supabase.auth.getUser();

      // Realizar check-out con userId para auditoría
      await CheckoutService.performCheckout({
        ...data,
        userId: user?.id,
      });

      toast({
        title: '¡Check-out exitoso!',
        description: `La salida del huésped ha sido registrada correctamente`,
      });

      // Recargar datos
      await loadData();
      setShowCheckoutDialog(false);
    } catch (error: any) {
      console.error('Error en check-out:', error);
      toast({
        title: 'Error',
        description: error.message || 'No se pudo completar el check-out',
        variant: 'destructive',
      });
    }
  };

  // Función para obtener el título de la página según el filtro
  const getPageTitle = () => {
    return getDateRangeLabel(datePreset, customDateRange);
  };

  // Resetear página cuando cambia pageSize o filtros de fecha
  useEffect(() => {
    setCurrentPage(1);
  }, [pageSize, datePreset, customDateRange]);

  // Paginación
  const totalPages = Math.ceil(departures.length / pageSize);
  const paginatedDepartures = departures.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

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
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-orange-50 dark:bg-orange-950">
                <LogOut className="h-6 w-6 text-orange-600 dark:text-orange-400" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
                  Salidas del Día
                </h1>
                <div className="flex items-center gap-2 mt-1">
                  <Calendar className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                  <p className="text-sm text-gray-500 dark:text-gray-400 capitalize">
                    {getPageTitle()}
                  </p>
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              {/* Filtro de fechas */}
              <DateRangeFilter
                preset={datePreset}
                customDateRange={customDateRange}
                onPresetChange={setDatePreset}
                onCustomDateRangeChange={setCustomDateRange}
              />
              
              {/* Botón actualizar */}
              <Button
                onClick={loadData}
                variant="outline"
                size="icon"
                disabled={isLoading}
                title="Actualizar"
              >
                <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </div>
        </div>

        {/* Stats */}
        <CheckoutStats stats={stats} isLoading={isLoading} />

        {/* Tabla de Salidas */}
        <div>
          <div className="mb-4">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
              Reservas con Salida
            </h2>
            <p className="text-gray-500 dark:text-gray-400 mt-1">
              Gestiona el check-out de los huéspedes en el período seleccionado
            </p>
          </div>
          <DeparturesTable
            departures={paginatedDepartures}
            isLoading={isLoading}
            onCheckout={handleCheckout}
            onViewFolio={handleViewFolio}
          />

          {/* Paginación */}
          {departures.length > 0 && (
            <div className="mt-6 p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
              <ReservationsPagination
                currentPage={currentPage}
                totalPages={totalPages}
                pageSize={pageSize}
                totalItems={departures.length}
                onPageChange={setCurrentPage}
                onPageSizeChange={setPageSize}
              />
            </div>
          )}
        </div>

        {/* Diálogo de Check-out */}
        <CheckoutDialog
          open={showCheckoutDialog}
          onOpenChange={setShowCheckoutDialog}
          reservation={selectedReservation}
          onConfirm={handleConfirmCheckout}
        />
      </div>
    </div>
  );
}
