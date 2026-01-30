'use client';

import React, { useState, useEffect } from 'react';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { useToast } from '@/components/ui/use-toast';
import RoomAssignmentService, {
  type UnassignedReservation,
  type AvailableSpace,
} from '@/lib/services/roomAssignmentService';
import {
  AssignmentStats,
  UnassignedList,
  AvailableSpacesPanel,
} from '@/components/pms/asignaciones';
import { Button } from '@/components/ui/button';
import { RefreshCw, LayoutGrid } from 'lucide-react';
import { formatDate } from '@/utils/Utils';

export default function AsignacionesPage() {
  const { organization } = useOrganization();
  const { toast } = useToast();

  const [stats, setStats] = useState({
    totalUnassigned: 0,
    arrivingToday: 0,
    arrivingTomorrow: 0,
    arrivingThisWeek: 0,
  });
  const [reservations, setReservations] = useState<UnassignedReservation[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedReservation, setSelectedReservation] = useState<UnassignedReservation | null>(null);
  const [availableSpaces, setAvailableSpaces] = useState<AvailableSpace[]>([]);
  const [selectedSpaceId, setSelectedSpaceId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingSpaces, setIsLoadingSpaces] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isAssigning, setIsAssigning] = useState(false);

  const loadData = async () => {
    if (!organization?.id) return;

    try {
      const [statsData, reservationsData] = await Promise.all([
        RoomAssignmentService.getAssignmentStats(organization.id),
        RoomAssignmentService.getUnassignedReservations(organization.id),
      ]);

      setStats(statsData);
      setReservations(reservationsData);
    } catch (error) {
      console.error('Error loading assignment data:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar las reservas sin asignar',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  const loadAvailableSpaces = async (reservation: UnassignedReservation) => {
    if (!organization?.id) return;

    setIsLoadingSpaces(true);
    try {
      const spaces = await RoomAssignmentService.getAvailableSpaces(
        organization.id,
        reservation.checkin,
        reservation.checkout,
        reservation.spaceTypeId
      );
      setAvailableSpaces(spaces);
    } catch (error) {
      console.error('Error loading available spaces:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar los espacios disponibles',
        variant: 'destructive',
      });
    } finally {
      setIsLoadingSpaces(false);
    }
  };

  useEffect(() => {
    if (organization?.id) {
      loadData();
    }
  }, [organization?.id]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    setSelectedReservation(null);
    setSelectedSpaceId(null);
    setAvailableSpaces([]);
    setSelectedIds([]);
    await loadData();
    toast({
      title: 'Actualizado',
      description: 'Los datos han sido actualizados',
    });
  };

  const handleSelectReservation = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    if (selectedIds.length === reservations.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(reservations.map((r) => r.id));
    }
  };

  const handleAssignReservation = async (reservation: UnassignedReservation) => {
    setSelectedReservation(reservation);
    setSelectedSpaceId(null);
    await loadAvailableSpaces(reservation);
  };

  const handleSelectSpace = (spaceId: string) => {
    setSelectedSpaceId(spaceId);
  };

  const handleConfirmAssignment = async () => {
    if (!selectedReservation || !selectedSpaceId) return;

    setIsAssigning(true);
    try {
      await RoomAssignmentService.assignSpace(selectedReservation.id, selectedSpaceId);
      
      toast({
        title: 'Asignación exitosa',
        description: `Espacio asignado a la reserva ${selectedReservation.code}`,
      });

      // Reset and reload
      setSelectedReservation(null);
      setSelectedSpaceId(null);
      setAvailableSpaces([]);
      await loadData();
    } catch (error) {
      console.error('Error assigning space:', error);
      toast({
        title: 'Error',
        description: 'No se pudo asignar el espacio',
        variant: 'destructive',
      });
    } finally {
      setIsAssigning(false);
    }
  };

  return (
    <div className="h-screen flex flex-col bg-gray-50 dark:bg-gray-950">
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                <LayoutGrid className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                  Asignación de Espacios
                </h1>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Asigna espacios a las reservas pendientes
                </p>
              </div>
            </div>
          </div>
          <Button
            variant="outline"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="self-start md:self-auto"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
            Actualizar
          </Button>
        </div>

        {/* Stats */}
        <AssignmentStats
          totalUnassigned={stats.totalUnassigned}
          arrivingToday={stats.arrivingToday}
          arrivingTomorrow={stats.arrivingTomorrow}
          arrivingThisWeek={stats.arrivingThisWeek}
          isLoading={isLoading}
        />

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <UnassignedList
            reservations={reservations}
            selectedIds={selectedIds}
            onSelect={handleSelectReservation}
            onSelectAll={handleSelectAll}
            onAssign={handleAssignReservation}
            isLoading={isLoading}
          />

          <AvailableSpacesPanel
            spaces={availableSpaces}
            selectedSpaceId={selectedSpaceId}
            onSelectSpace={handleSelectSpace}
            onConfirmAssignment={handleConfirmAssignment}
            isLoading={isLoadingSpaces || isAssigning}
            reservationInfo={selectedReservation ? {
              customerName: selectedReservation.customerName,
              checkin: formatDate(selectedReservation.checkin),
              checkout: formatDate(selectedReservation.checkout),
            } : null}
          />
        </div>
      </div>
    </div>
  );
}
