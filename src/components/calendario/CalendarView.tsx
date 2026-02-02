'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { CalendarHeader } from './CalendarHeader';
import { CalendarFilters } from './CalendarFilters';
import { MonthView } from './MonthView';
import { WeekView } from './WeekView';
import { DayView } from './DayView';
import { AgendaView } from './AgendaView';
import { EventModal } from './EventModal';
import { useCalendar } from './useCalendar';
import { CalendarEvent, CalendarViewType, EventStatus } from './types';
import { cn } from '@/utils/Utils';

interface CalendarViewProps {
  organizationId: number | null;
  className?: string;
}

export function CalendarView({ organizationId, className }: CalendarViewProps) {
  const router = useRouter();
  const { toast } = useToast();
  
  const {
    events,
    isLoading,
    error,
    currentDate,
    view,
    filters,
    setView,
    setCurrentDate,
    setFilters,
    goToToday,
    goToNext,
    goToPrevious,
    refreshEvents,
    createEvent,
    updateEvent,
    deleteEvent,
    moveEvent,
    resizeEvent,
  } = useCalendar({ organizationId });

  const [modalState, setModalState] = useState<{
    isOpen: boolean;
    mode: 'view' | 'create' | 'edit';
    event: CalendarEvent | null;
    defaultDate: Date;
  }>({
    isOpen: false,
    mode: 'view',
    event: null,
    defaultDate: new Date(),
  });

  const handleEventClick = useCallback((event: CalendarEvent) => {
    setModalState({
      isOpen: true,
      mode: 'view',
      event,
      defaultDate: new Date(event.start_at),
    });
  }, []);

  const handleDateClick = useCallback((date: Date) => {
    if (view === 'month') {
      setCurrentDate(date);
      setView('day');
    }
  }, [view, setCurrentDate, setView]);

  const handleTimeSlotClick = useCallback((date: Date) => {
    setModalState({
      isOpen: true,
      mode: 'create',
      event: null,
      defaultDate: date,
    });
  }, []);

  const handleTimeRangeSelect = useCallback((startDate: Date, endDate: Date) => {
    setModalState({
      isOpen: true,
      mode: 'create',
      event: {
        id: '',
        title: '',
        start_at: startDate.toISOString(),
        end_at: endDate.toISOString(),
        all_day: false,
        source_type: 'calendar_event',
        source_id: null,
        status: 'confirmed',
        color: '#3B82F6',
        organization_id: organizationId,
      } as CalendarEvent,
      defaultDate: startDate,
    });
  }, [organizationId]);

  const handleNewEvent = useCallback(() => {
    setModalState({
      isOpen: true,
      mode: 'create',
      event: null,
      defaultDate: currentDate,
    });
  }, [currentDate]);

  const handleCloseModal = useCallback(() => {
    setModalState((prev) => ({ ...prev, isOpen: false }));
  }, []);

  const handleSaveEvent = useCallback(async (eventData: Partial<CalendarEvent>) => {
    if (modalState.mode === 'create') {
      const result = await createEvent(eventData);
      if (result.error) {
        toast({
          title: 'Error',
          description: result.error,
          variant: 'destructive',
        });
      } else {
        toast({
          title: 'Evento creado',
          description: 'El evento se ha creado correctamente',
        });
      }
    } else if (modalState.event) {
      const result = await updateEvent(modalState.event.id, eventData);
      if (result.error) {
        toast({
          title: 'Error',
          description: result.error,
          variant: 'destructive',
        });
      } else {
        toast({
          title: 'Evento actualizado',
          description: 'El evento se ha actualizado correctamente',
        });
      }
    }
  }, [modalState, createEvent, updateEvent, toast]);

  const handleDeleteEvent = useCallback(async (id: string) => {
    const result = await deleteEvent(id);
    if (result.error) {
      toast({
        title: 'Error',
        description: result.error,
        variant: 'destructive',
      });
    } else {
      toast({
        title: 'Evento eliminado',
        description: 'El evento se ha eliminado correctamente',
      });
    }
  }, [deleteEvent, toast]);

  const handleNavigateToSource = useCallback((event: CalendarEvent) => {
    const routes: Record<string, string> = {
      task: '/app/crm/tareas',
      shift: '/app/hrm/turnos',
      leave: '/app/hrm/permisos',
      reservation: '/app/pms/reservaciones',
      housekeeping: '/app/pms/housekeeping',
      maintenance: '/app/pms/mantenimiento',
      gym_class: '/app/gym/horarios',
      trip: '/app/transporte/viajes',
    };

    const baseRoute = routes[event.source_type];
    if (baseRoute) {
      router.push(`${baseRoute}/${event.source_id}`);
    }
  }, [router]);

  const handleEventMove = useCallback(async (eventId: string, newDate: Date, newHour: number) => {
    const result = await moveEvent(eventId, newDate, newHour);
    if (result.error) {
      toast({
        title: 'Error',
        description: result.error,
        variant: 'destructive',
      });
    } else {
      toast({
        title: 'Evento movido',
        description: 'El evento se ha movido correctamente',
      });
    }
  }, [moveEvent, toast]);

  const handleEventResize = useCallback(async (eventId: string, newStartAt: Date, newEndAt: Date) => {
    const result = await resizeEvent(eventId, newStartAt, newEndAt);
    if (result.error) {
      toast({
        title: 'Error',
        description: result.error,
        variant: 'destructive',
      });
    } else {
      toast({
        title: 'Duración actualizada',
        description: 'La duración del evento se ha modificado correctamente',
      });
    }
  }, [resizeEvent, toast]);

  const handleEditEvent = useCallback((event: CalendarEvent) => {
    if (event.source_type !== 'calendar_event') return;
    setModalState({
      isOpen: true,
      mode: 'edit',
      event,
      defaultDate: new Date(event.start_at),
    });
  }, []);

  const handleDuplicateEvent = useCallback((event: CalendarEvent) => {
    if (event.source_type !== 'calendar_event') return;
    const duplicatedEvent = {
      ...event,
      id: '',
      title: `${event.title} (copia)`,
    };
    setModalState({
      isOpen: true,
      mode: 'create',
      event: duplicatedEvent as CalendarEvent,
      defaultDate: new Date(event.start_at),
    });
  }, []);

  const handleCancelEvent = useCallback(async (eventId: string) => {
    const result = await updateEvent(eventId, { status: 'cancelled' });
    if (result.error) {
      toast({
        title: 'Error',
        description: result.error,
        variant: 'destructive',
      });
    } else {
      toast({
        title: 'Evento cancelado',
        description: 'El evento se ha cancelado correctamente',
      });
    }
  }, [updateEvent, toast]);

  const handleUpdateEventStatus = useCallback(async (eventId: string, status: EventStatus) => {
    const result = await updateEvent(eventId, { status });
    if (result.error) {
      toast({
        title: 'Error',
        description: result.error,
        variant: 'destructive',
      });
    } else {
      toast({
        title: 'Estado actualizado',
        description: `El evento se ha marcado como ${status === 'confirmed' ? 'confirmado' : status === 'tentative' ? 'tentativo' : status}`,
      });
    }
  }, [updateEvent, toast]);

  const renderView = () => {
    if (isLoading) {
      return (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600 mx-auto" />
            <p className="mt-2 text-gray-500 dark:text-gray-400">Cargando eventos...</p>
          </div>
        </div>
      );
    }

    if (error) {
      return (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <p className="text-red-600 dark:text-red-400">{error}</p>
            <button
              onClick={refreshEvents}
              className="mt-2 text-blue-600 hover:underline"
            >
              Reintentar
            </button>
          </div>
        </div>
      );
    }

    switch (view) {
      case 'month':
        return (
          <MonthView
            currentDate={currentDate}
            events={events}
            onEventClick={handleEventClick}
            onDateClick={handleDateClick}
          />
        );
      case 'week':
        return (
          <WeekView
            currentDate={currentDate}
            events={events}
            onEventClick={handleEventClick}
            onTimeSlotClick={handleTimeSlotClick}
            onTimeRangeSelect={handleTimeRangeSelect}
            onEventMove={handleEventMove}
            onEventResize={handleEventResize}
          />
        );
      case 'day':
        return (
          <DayView
            currentDate={currentDate}
            events={events}
            onEventClick={handleEventClick}
            onTimeSlotClick={handleTimeSlotClick}
            onTimeRangeSelect={handleTimeRangeSelect}
            onEventMove={handleEventMove}
            onEventResize={handleEventResize}
          />
        );
      case 'agenda':
        return (
          <AgendaView
            events={events}
            onEventClick={handleEventClick}
            onEditEvent={handleEditEvent}
            onDuplicateEvent={handleDuplicateEvent}
            onCancelEvent={handleCancelEvent}
            onUpdateStatus={handleUpdateEventStatus}
            onNavigateToSource={handleNavigateToSource}
          />
        );
    }
  };

  return (
    <div className={cn('h-full flex flex-col bg-white dark:bg-gray-900', className)}>
      <CalendarHeader
        currentDate={currentDate}
        view={view}
        isLoading={isLoading}
        onViewChange={setView}
        onPrevious={goToPrevious}
        onNext={goToNext}
        onToday={goToToday}
        onRefresh={refreshEvents}
        onNewEvent={handleNewEvent}
      />

      <CalendarFilters
        organizationId={organizationId}
        filters={filters}
        onFiltersChange={setFilters}
      />

      {renderView()}

      <EventModal
        event={modalState.event}
        isOpen={modalState.isOpen}
        mode={modalState.mode}
        defaultDate={modalState.defaultDate}
        organizationId={organizationId}
        onClose={handleCloseModal}
        onSave={handleSaveEvent}
        onDelete={handleDeleteEvent}
        onNavigateToSource={handleNavigateToSource}
      />
    </div>
  );
}
