'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { Loader2, Search, Calendar } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { 
  ReservationsHeader, 
  ReservationsList, 
  ReservationDialog,
  CheckInDialog,
  ImportReservationsDialog 
} from '@/components/gym/reservaciones';
import { useOrganization } from '@/lib/hooks/useOrganization';
import {
  GymClass,
  ClassReservation,
  getClasses,
  getReservations,
  createReservation,
  updateReservation,
  cancelReservation,
  markAttendance,
} from '@/lib/services/gymService';

export default function ReservacionesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const classIdParam = searchParams.get('classId');
  const { organization } = useOrganization();
  
  const [reservations, setReservations] = useState<ClassReservation[]>([]);
  const [classes, setClasses] = useState<GymClass[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('all');

  const [showDialog, setShowDialog] = useState(false);
  const [selectedReservation, setSelectedReservation] = useState<ClassReservation | null>(null);
  
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [reservationToCancel, setReservationToCancel] = useState<ClassReservation | null>(null);
  const [cancelReason, setCancelReason] = useState('');

  const [showCheckInDialog, setShowCheckInDialog] = useState(false);
  const [reservationToCheckIn, setReservationToCheckIn] = useState<ClassReservation | null>(null);

  const [showImportDialog, setShowImportDialog] = useState(false);

  const [showDuplicateDialog, setShowDuplicateDialog] = useState(false);
  const [reservationToDuplicate, setReservationToDuplicate] = useState<ClassReservation | null>(null);
  const [duplicateClassId, setDuplicateClassId] = useState<string>('');

  const loadReservations = async () => {
    if (!organization?.id) return;
    setIsLoading(true);
    try {
      const filters: { classId?: number; status?: string; dateFrom?: string; dateTo?: string } = {};
      if (classIdParam) filters.classId = parseInt(classIdParam);
      if (statusFilter !== 'all') filters.status = statusFilter;
      
      // Filtro de fecha
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (dateFilter === 'today') {
        filters.dateFrom = today.toISOString();
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        filters.dateTo = tomorrow.toISOString();
      } else if (dateFilter === 'week') {
        filters.dateFrom = today.toISOString();
        const nextWeek = new Date(today);
        nextWeek.setDate(nextWeek.getDate() + 7);
        filters.dateTo = nextWeek.toISOString();
      }
      
      const data = await getReservations(organization.id, filters);
      setReservations(data);
    } catch (error) {
      console.error('Error cargando reservaciones:', error);
      toast.error('Error al cargar las reservaciones');
    } finally {
      setIsLoading(false);
    }
  };

  const loadClasses = async () => {
    if (!organization?.id) return;
    try {
      const data = await getClasses(organization.id, { status: 'scheduled' });
      setClasses(data);
    } catch (error) {
      console.error('Error cargando clases:', error);
    }
  };

  useEffect(() => {
    loadReservations();
    loadClasses();
  }, [organization?.id, classIdParam, statusFilter, dateFilter]);

  // Calcular estadísticas
  const stats = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const todayReservations = reservations.filter(r => {
      if (!r.gym_classes?.start_at) return false;
      const classDate = new Date(r.gym_classes.start_at);
      return classDate >= today && classDate < tomorrow;
    }).length;

    return {
      total: reservations.length,
      booked: reservations.filter(r => r.status === 'booked').length,
      attended: reservations.filter(r => r.status === 'attended').length,
      cancelled: reservations.filter(r => r.status === 'cancelled').length,
      todayReservations,
    };
  }, [reservations]);

  const filteredReservations = reservations.filter((r) => {
    if (!searchTerm) return true;
    const search = searchTerm.toLowerCase();
    return (
      r.customers?.first_name?.toLowerCase().includes(search) ||
      r.customers?.last_name?.toLowerCase().includes(search) ||
      r.customers?.email?.toLowerCase().includes(search) ||
      r.gym_classes?.title?.toLowerCase().includes(search)
    );
  });

  const handleNewReservation = () => {
    setSelectedReservation(null);
    setShowDialog(true);
  };

  const handleEditReservation = (reservation: ClassReservation) => {
    setSelectedReservation(reservation);
    setShowDialog(true);
  };

  const handleSaveReservation = async (data: Partial<ClassReservation>) => {
    try {
      if (data.id) {
        await updateReservation(data.id, data);
        toast.success('Reservación actualizada correctamente');
      } else {
        await createReservation(data);
        toast.success('Reservación creada correctamente');
      }
      await loadReservations();
    } catch (error) {
      console.error('Error guardando reservación:', error);
      toast.error('Error al guardar la reservación');
      throw error;
    }
  };

  const handleMarkAttendance = async (reservation: ClassReservation, attended: boolean) => {
    try {
      await markAttendance(reservation.id, attended);
      toast.success(attended ? 'Asistencia registrada' : 'No asistencia registrada');
      await loadReservations();
    } catch (error) {
      console.error('Error marcando asistencia:', error);
      toast.error('Error al registrar asistencia');
    }
  };

  const handleCancelReservation = (reservation: ClassReservation) => {
    setReservationToCancel(reservation);
    setCancelReason('');
    setShowCancelDialog(true);
  };

  const confirmCancel = async () => {
    if (!reservationToCancel) return;
    try {
      await cancelReservation(reservationToCancel.id, cancelReason);
      toast.success('Reservación cancelada');
      await loadReservations();
      setShowCancelDialog(false);
      setReservationToCancel(null);
      setCancelReason('');
    } catch (error) {
      console.error('Error cancelando reservación:', error);
      toast.error('Error al cancelar la reservación');
    }
  };

  const handleCheckIn = (reservation: ClassReservation) => {
    setReservationToCheckIn(reservation);
    setShowCheckInDialog(true);
  };

  const handleDuplicateReservation = (reservation: ClassReservation) => {
    setReservationToDuplicate(reservation);
    setDuplicateClassId('');
    setShowDuplicateDialog(true);
  };

  const confirmDuplicate = async () => {
    if (!reservationToDuplicate || !duplicateClassId) return;
    try {
      await createReservation({
        gym_class_id: parseInt(duplicateClassId),
        customer_id: reservationToDuplicate.customer_id,
        notes: reservationToDuplicate.notes,
        reservation_source: 'duplicate',
      });
      toast.success('Reservación duplicada correctamente');
      await loadReservations();
      setShowDuplicateDialog(false);
      setReservationToDuplicate(null);
    } catch (error) {
      console.error('Error duplicando reservación:', error);
      toast.error('Error al duplicar la reservación');
    }
  };

  const handleViewClass = (reservation: ClassReservation) => {
    if (reservation.gym_class_id) {
      router.push(`/app/gym/clases`);
    }
  };

  return (
    <div className="p-6 space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      <ReservationsHeader
        onNewReservation={handleNewReservation}
        onRefresh={loadReservations}
        onImport={() => setShowImportDialog(true)}
        isLoading={isLoading}
        stats={stats}
      />

      <Card className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Buscar por cliente o clase..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={dateFilter} onValueChange={setDateFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Fecha" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las fechas</SelectItem>
                <SelectItem value="today">Hoy</SelectItem>
                <SelectItem value="week">Esta semana</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="booked">Reservado</SelectItem>
                <SelectItem value="attended">Asistió</SelectItem>
                <SelectItem value="no_show">No Asistió</SelectItem>
                <SelectItem value="cancelled">Cancelado</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="flex justify-center items-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        </div>
      ) : (
        <ReservationsList
          reservations={filteredReservations}
          onMarkAttendance={handleMarkAttendance}
          onCancel={handleCancelReservation}
          onViewClass={handleViewClass}
          onEdit={handleEditReservation}
          onDuplicate={handleDuplicateReservation}
          onCheckIn={handleCheckIn}
        />
      )}

      <ReservationDialog
        open={showDialog}
        onOpenChange={setShowDialog}
        reservation={selectedReservation}
        onSave={handleSaveReservation}
      />

      <CheckInDialog
        open={showCheckInDialog}
        onOpenChange={setShowCheckInDialog}
        reservation={reservationToCheckIn}
        onCheckInComplete={loadReservations}
      />

      <ImportReservationsDialog
        open={showImportDialog}
        onOpenChange={setShowImportDialog}
        onImportComplete={loadReservations}
        classes={classes}
      />

      {/* Diálogo de Cancelar */}
      <AlertDialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar Reservación</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Estás seguro de que deseas cancelar esta reservación de{' '}
              <strong>{reservationToCancel?.customers?.first_name} {reservationToCancel?.customers?.last_name}</strong>
              {' '}para la clase <strong>{reservationToCancel?.gym_classes?.title}</strong>?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <Label htmlFor="cancel-reason">Motivo de cancelación</Label>
            <Textarea
              id="cancel-reason"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Ingresa el motivo de la cancelación..."
              rows={2}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Volver</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmCancel}
              className="bg-red-600 hover:bg-red-700"
            >
              Confirmar Cancelación
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Diálogo de Duplicar */}
      <AlertDialog open={showDuplicateDialog} onOpenChange={setShowDuplicateDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Duplicar Reservación</AlertDialogTitle>
            <AlertDialogDescription>
              Crear una nueva reservación para{' '}
              <strong>{reservationToDuplicate?.customers?.first_name} {reservationToDuplicate?.customers?.last_name}</strong>
              {' '}en otra clase.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <Label>Seleccionar nueva clase</Label>
            <Select value={duplicateClassId} onValueChange={setDuplicateClassId}>
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar clase" />
              </SelectTrigger>
              <SelectContent>
                {classes.map((gymClass) => {
                  const date = new Date(gymClass.start_at);
                  const timeStr = date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
                  const dateStr = date.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
                  return (
                    <SelectItem key={gymClass.id} value={gymClass.id.toString()}>
                      {gymClass.title} - {dateStr} {timeStr}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDuplicate}
              disabled={!duplicateClassId}
              className="bg-blue-600 hover:bg-blue-700"
            >
              Duplicar Reservación
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
