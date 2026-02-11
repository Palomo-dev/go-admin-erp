'use client';

import { useState, useEffect, useCallback } from 'react';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { useToast } from '@/components/ui/use-toast';
import { Loader2 } from 'lucide-react';
import {
  reservasMesasService,
  ReservasHeader,
  ReservasStats,
  ReservasList,
  ReservaFormDialog,
  type RestaurantReservation,
  type ReservationFilters,
  type ReservationStats as StatsType,
  type ReservationStatus,
  type CreateReservationInput,
  type UpdateReservationInput,
} from '@/components/pos/reservas-mesas';

export default function ReservasMesasPage() {
  const { organization } = useOrganization();
  const { toast } = useToast();

  // Estado principal
  const [reservations, setReservations] = useState<RestaurantReservation[]>([]);
  const [stats, setStats] = useState<StatsType | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Filtros
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('all');
  const today = new Date().toISOString().split('T')[0];
  const [dateFrom, setDateFrom] = useState(today);
  const [dateTo, setDateTo] = useState(today);

  // Modal
  const [formOpen, setFormOpen] = useState(false);
  const [editingReservation, setEditingReservation] = useState<RestaurantReservation | null>(null);

  // ── Carga de datos ─────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    if (!organization?.id) return;

    setIsLoading(true);
    try {
      const filters: ReservationFilters = {};

      if (statusFilter !== 'all') {
        filters.status = [statusFilter as ReservationStatus];
      }
      if (sourceFilter !== 'all') {
        filters.source = sourceFilter as any;
      }
      if (dateFrom) filters.date_from = dateFrom;
      if (dateTo) filters.date_to = dateTo;
      if (search.trim()) filters.search = search.trim();

      const [reservationsData, statsData] = await Promise.all([
        reservasMesasService.getReservations(filters),
        reservasMesasService.getStats(dateFrom || undefined, dateTo || undefined),
      ]);

      setReservations(reservationsData);
      setStats(statsData);
    } catch (error) {
      console.error('Error cargando reservas:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar las reservas',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [organization?.id, statusFilter, sourceFilter, dateFrom, dateTo, search, toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ── Handlers ───────────────────────────────────────────────────────────

  const handleCreate = async (data: CreateReservationInput | UpdateReservationInput) => {
    try {
      await reservasMesasService.createReservation(data as CreateReservationInput);
      toast({ title: 'Reserva creada', description: 'La reserva se creó exitosamente' });
      loadData();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error?.message || 'No se pudo crear la reserva',
        variant: 'destructive',
      });
      throw error;
    }
  };

  const handleUpdate = async (data: CreateReservationInput | UpdateReservationInput) => {
    if (!editingReservation) return;
    try {
      await reservasMesasService.updateReservation(editingReservation.id, data as UpdateReservationInput);
      toast({ title: 'Reserva actualizada', description: 'Los cambios se guardaron exitosamente' });
      setEditingReservation(null);
      loadData();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error?.message || 'No se pudo actualizar la reserva',
        variant: 'destructive',
      });
      throw error;
    }
  };

  const handleChangeStatus = async (id: string, status: ReservationStatus, reason?: string) => {
    try {
      await reservasMesasService.changeStatus(id, status, reason);
      toast({ title: 'Estado actualizado' });
      loadData();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error?.message || 'No se pudo cambiar el estado',
        variant: 'destructive',
      });
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await reservasMesasService.deleteReservation(id);
      toast({ title: 'Reserva eliminada' });
      loadData();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error?.message || 'No se pudo eliminar la reserva',
        variant: 'destructive',
      });
    }
  };

  const handleEdit = (reservation: RestaurantReservation) => {
    setEditingReservation(reservation);
    setFormOpen(true);
  };

  const handleNewReservation = () => {
    setEditingReservation(null);
    setFormOpen(true);
  };

  // ── Loading inicial ────────────────────────────────────────────────────

  if (!organization) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-4rem)]">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="p-6 space-y-6 bg-gray-50 dark:bg-gray-950 min-h-screen">
      {/* Header + filtros */}
      <ReservasHeader
        search={search}
        onSearchChange={setSearch}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        sourceFilter={sourceFilter}
        onSourceFilterChange={setSourceFilter}
        dateFrom={dateFrom}
        onDateFromChange={setDateFrom}
        dateTo={dateTo}
        onDateToChange={setDateTo}
        onRefresh={loadData}
        onNewReservation={handleNewReservation}
        isLoading={isLoading}
      />

      {/* Stats */}
      <ReservasStats stats={stats} isLoading={isLoading} />

      {/* Lista */}
      <ReservasList
        reservations={reservations}
        isLoading={isLoading}
        onEdit={handleEdit}
        onChangeStatus={handleChangeStatus}
        onDelete={handleDelete}
      />

      {/* Formulario */}
      <ReservaFormDialog
        open={formOpen}
        onOpenChange={(isOpen: boolean) => {
          setFormOpen(isOpen);
          if (!isOpen) setEditingReservation(null);
        }}
        reservation={editingReservation}
        onSubmit={editingReservation ? handleUpdate : handleCreate}
      />
    </div>
  );
}
