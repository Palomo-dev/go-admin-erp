'use client';

import React, { useState, useEffect } from 'react';
import { useToast } from '@/components/ui/use-toast';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { Button } from '@/components/ui/button';
import { RefreshCw, Calendar, LogIn } from 'lucide-react';
import CheckinService, {
  type CheckinReservation,
  type CheckinStats as CheckinStatsType,
} from '@/lib/services/checkinService';
import {
  CheckinStats,
  ArrivalsTable,
  CheckinDialog,
  type CheckinData,
  DateRangeFilter,
  getDateRangeFromPreset,
  getDateRangeLabel,
  type DateRangePreset,
  type CustomDateRange,
} from '@/components/pms/checkin';
import { ReservationsPagination } from '@/components/pms/reservas';

export default function CheckinPage() {
  const { toast } = useToast();
  const { organization } = useOrganization();

  const [arrivals, setArrivals] = useState<CheckinReservation[]>([]);
  const [stats, setStats] = useState<CheckinStatsType>({
    total_arrivals: 0,
    checked_in: 0,
    pending: 0,
    rooms_ready: 0,
    rooms_not_ready: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [selectedReservation, setSelectedReservation] =
    useState<CheckinReservation | null>(null);
  const [showCheckinDialog, setShowCheckinDialog] = useState(false);

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

      // Cargar llegadas y estadísticas en paralelo
      const [arrivalsData, statsData] = await Promise.all([
        CheckinService.getArrivals(organization.id, dateRange.startDate, dateRange.endDate),
        CheckinService.getStats(organization.id, dateRange.startDate, dateRange.endDate),
      ]);

      setArrivals(arrivalsData);
      setStats(statsData);
    } catch (error: any) {
      console.error('Error loading check-in data:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar las llegadas del día',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCheckin = (reservation: CheckinReservation) => {
    setSelectedReservation(reservation);
    setShowCheckinDialog(true);
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

  const getPageTitle = () => {
    return getDateRangeLabel(datePreset, customDateRange);
  };

  // Calcular paginación
  const totalPages = Math.ceil(arrivals.length / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const paginatedArrivals = arrivals.slice(startIndex, endIndex);

  // Resetear página cuando cambia pageSize o filtros de fecha
  useEffect(() => {
    setCurrentPage(1);
  }, [pageSize, datePreset, customDateRange]);

  if (!organization) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-gray-500 dark:text-gray-400">Cargando...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="container mx-auto px-6 py-6">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-blue-50 dark:bg-blue-950">
                <LogIn className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
                  Llegadas del Día
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

        {/* Estadísticas */}
        <CheckinStats stats={stats} isLoading={isLoading} />

        {/* Tabla de Llegadas */}
        <div>
          <div className="mb-4">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
              Reservas con Llegada
            </h2>
            <p className="text-gray-500 dark:text-gray-400 mt-1">
              Gestiona el check-in de los huéspedes en el período seleccionado
            </p>
          </div>
          <ArrivalsTable
            arrivals={paginatedArrivals}
            onCheckin={handleCheckin}
            isLoading={isLoading}
          />

          {/* Paginación */}
          {arrivals.length > 0 && (
            <div className="mt-6 p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
              <ReservationsPagination
                currentPage={currentPage}
                totalPages={totalPages}
                pageSize={pageSize}
                totalItems={arrivals.length}
                onPageChange={setCurrentPage}
                onPageSizeChange={setPageSize}
              />
            </div>
          )}
        </div>

        {/* Dialog de Check-in */}
        <CheckinDialog
          open={showCheckinDialog}
          onOpenChange={setShowCheckinDialog}
          reservation={selectedReservation}
          onConfirm={handleConfirmCheckin}
        />
      </div>
    </div>
  );
}
