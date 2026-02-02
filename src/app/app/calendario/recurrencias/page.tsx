'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Calendar as CalendarIcon, Repeat } from 'lucide-react';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
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
  RecurringEventsList,
  RecurringEventModal,
  useRecurringEvents,
  RecurringEvent,
  CalendarException,
} from '@/components/calendario/recurrencias';

export default function RecurrenciasPage() {
  const router = useRouter();
  const { organization } = useOrganization();
  const organizationId = organization?.id || null;
  const { toast } = useToast();

  // Hook para gestión de eventos recurrentes
  const {
    events,
    isLoading,
    refresh,
    getExceptions,
    createException,
    updateException,
    deleteException,
    updateEvent,
    deleteEvent,
  } = useRecurringEvents({ organizationId });

  // Estado del modal
  const [selectedEvent, setSelectedEvent] = useState<RecurringEvent | null>(null);
  const [eventExceptions, setEventExceptions] = useState<CalendarException[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'view' | 'edit' | 'exceptions'>('view');

  // Estado para eliminar evento
  const [eventToDelete, setEventToDelete] = useState<RecurringEvent | null>(null);

  // Handlers
  const handleView = useCallback(async (event: RecurringEvent) => {
    setSelectedEvent(event);
    const exceptions = await getExceptions(event.id);
    setEventExceptions(exceptions);
    setModalMode('view');
    setModalOpen(true);
  }, [getExceptions]);

  const handleEdit = useCallback(async (event: RecurringEvent) => {
    setSelectedEvent(event);
    const exceptions = await getExceptions(event.id);
    setEventExceptions(exceptions);
    setModalMode('edit');
    setModalOpen(true);
  }, [getExceptions]);

  const handleManageExceptions = useCallback(async (event: RecurringEvent) => {
    setSelectedEvent(event);
    const exceptions = await getExceptions(event.id);
    setEventExceptions(exceptions);
    setModalMode('exceptions');
    setModalOpen(true);
  }, [getExceptions]);

  const handleDelete = useCallback((event: RecurringEvent) => {
    setEventToDelete(event);
  }, []);

  const confirmDelete = useCallback(async () => {
    if (!eventToDelete) return;

    try {
      await deleteEvent(eventToDelete.id);
      toast({
        title: 'Evento eliminado',
        description: 'El evento recurrente y sus excepciones han sido eliminados.',
      });
      setEventToDelete(null);
    } catch (error) {
      console.error('Error deleting event:', error);
      toast({
        title: 'Error',
        description: 'No se pudo eliminar el evento.',
        variant: 'destructive',
      });
    }
  }, [eventToDelete, deleteEvent, toast]);

  const handleCloseModal = useCallback(() => {
    setModalOpen(false);
    setSelectedEvent(null);
    setEventExceptions([]);
  }, []);

  const handleSaveEvent = useCallback(async (updates: Partial<RecurringEvent>) => {
    if (!selectedEvent) return;

    try {
      await updateEvent(selectedEvent.id, updates);
      toast({
        title: 'Evento actualizado',
        description: 'Los cambios han sido guardados.',
      });
      // Actualizar el evento seleccionado
      setSelectedEvent({ ...selectedEvent, ...updates });
    } catch (error) {
      console.error('Error updating event:', error);
      toast({
        title: 'Error',
        description: 'No se pudo actualizar el evento.',
        variant: 'destructive',
      });
      throw error;
    }
  }, [selectedEvent, updateEvent, toast]);

  const handleCreateException = useCallback(async (exception: Omit<CalendarException, 'id' | 'created_at'>) => {
    try {
      const newException = await createException(exception);
      setEventExceptions(prev => [...prev, newException]);
      toast({
        title: 'Excepción creada',
        description: 'La excepción ha sido registrada.',
      });
      refresh();
    } catch (error) {
      console.error('Error creating exception:', error);
      toast({
        title: 'Error',
        description: 'No se pudo crear la excepción.',
        variant: 'destructive',
      });
      throw error;
    }
  }, [createException, toast, refresh]);

  const handleUpdateException = useCallback(async (id: string, updates: Partial<CalendarException>) => {
    try {
      const updated = await updateException(id, updates);
      setEventExceptions(prev => prev.map(e => e.id === id ? updated : e));
      toast({
        title: 'Excepción actualizada',
        description: 'Los cambios han sido guardados.',
      });
    } catch (error) {
      console.error('Error updating exception:', error);
      toast({
        title: 'Error',
        description: 'No se pudo actualizar la excepción.',
        variant: 'destructive',
      });
      throw error;
    }
  }, [updateException, toast]);

  const handleDeleteException = useCallback(async (id: string) => {
    try {
      await deleteException(id);
      setEventExceptions(prev => prev.filter(e => e.id !== id));
      toast({
        title: 'Excepción eliminada',
        description: 'La excepción ha sido eliminada.',
      });
      refresh();
    } catch (error) {
      console.error('Error deleting exception:', error);
      toast({
        title: 'Error',
        description: 'No se pudo eliminar la excepción.',
        variant: 'destructive',
      });
      throw error;
    }
  }, [deleteException, toast, refresh]);

  const handleNewEvent = useCallback(() => {
    router.push('/app/calendario?action=new&recurrent=true');
  }, [router]);

  return (
    <div className="min-h-full">
      {/* Header */}
      <div className="border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                <Repeat className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <h1 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Eventos Recurrentes
                </h1>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Gestiona eventos con recurrencia y sus excepciones
                </p>
              </div>
            </div>
            <Link href="/app/calendario">
              <Button variant="outline" size="sm">
                <ArrowLeft className="h-4 w-4 mr-1" />
                Calendario
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* Contenido */}
      <div className="p-6">
        <RecurringEventsList
          events={events}
          isLoading={isLoading}
          onView={handleView}
          onEdit={handleEdit}
          onDelete={handleDelete}
          onManageExceptions={handleManageExceptions}
          onRefresh={refresh}
          onNewEvent={handleNewEvent}
        />
      </div>

      {/* Modal de evento */}
      <RecurringEventModal
        event={selectedEvent}
        exceptions={eventExceptions}
        isOpen={modalOpen}
        mode={modalMode}
        onClose={handleCloseModal}
        onSave={handleSaveEvent}
        onCreateException={handleCreateException}
        onUpdateException={handleUpdateException}
        onDeleteException={handleDeleteException}
      />

      {/* Dialog para confirmar eliminación */}
      <AlertDialog open={!!eventToDelete} onOpenChange={() => setEventToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar evento recurrente?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará el evento &quot;{eventToDelete?.title}&quot; y todas sus excepciones.
              Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-red-600 hover:bg-red-700"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
