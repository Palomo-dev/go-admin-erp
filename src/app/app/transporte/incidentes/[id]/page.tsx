'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useToast } from '@/components/ui/use-toast';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { Loader2 } from 'lucide-react';
import {
  IncidentHeader,
  IncidentTimeline,
  IncidentCosts,
  IncidentAttachments,
  IncidentResolution,
  AddEventDialog,
  CloseIncidentDialog,
} from '@/components/transporte/incidentes/id';
import { IncidentDialog } from '@/components/transporte/incidentes/IncidentDialog';
import { ResolveDialog } from '@/components/transporte/incidentes/ResolveDialog';
import {
  incidentsService,
  IncidentWithDetails,
  TransportEvent,
} from '@/lib/services/incidentsService';

export default function IncidentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const { organization } = useOrganization();
  const organizationId = organization?.id;

  const incidentId = params.id as string;

  // Estados principales
  const [incident, setIncident] = useState<IncidentWithDetails | null>(null);
  const [events, setEvents] = useState<TransportEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingEvents, setIsLoadingEvents] = useState(true);

  // Referencias relacionadas
  const [relatedTrip, setRelatedTrip] = useState<{
    id: string;
    trip_code: string;
    departure_datetime: string;
    origin?: string;
    destination?: string;
    status: string;
  } | null>(null);
  const [relatedShipment, setRelatedShipment] = useState<{
    id: string;
    tracking_number: string;
    status: string;
    origin_address?: string;
    destination_address?: string;
  } | null>(null);

  // Datos auxiliares para edición
  const [employees, setEmployees] = useState<Array<{ id: number; full_name: string; email?: string }>>([]);
  const [trips, setTrips] = useState<Array<{ id: string; trip_code: string; departure_datetime: string }>>([]);
  const [shipments, setShipments] = useState<Array<{ id: string; tracking_number: string; status: string }>>([]);

  // Diálogos
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showAddEventDialog, setShowAddEventDialog] = useState(false);
  const [showResolveDialog, setShowResolveDialog] = useState(false);
  const [showCloseDialog, setShowCloseDialog] = useState(false);

  // Cargar incidente
  const loadIncident = useCallback(async () => {
    if (!incidentId) return;

    setIsLoading(true);
    try {
      const data = await incidentsService.getIncidentById(incidentId);
      if (!data) {
        toast({
          title: 'Error',
          description: 'Incidente no encontrado',
          variant: 'destructive',
        });
        router.push('/app/transporte/incidentes');
        return;
      }
      setIncident(data);

      // Cargar referencia relacionada
      if (data.reference_type === 'trip') {
        const trip = await incidentsService.getRelatedTrip(data.reference_id);
        setRelatedTrip(trip);
      } else if (data.reference_type === 'shipment') {
        const shipment = await incidentsService.getRelatedShipment(data.reference_id);
        setRelatedShipment(shipment);
      }
    } catch (error) {
      console.error('Error loading incident:', error);
      toast({
        title: 'Error',
        description: 'No se pudo cargar el incidente',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [incidentId, router, toast]);

  // Cargar eventos
  const loadEvents = useCallback(async () => {
    if (!incidentId) return;

    setIsLoadingEvents(true);
    try {
      const data = await incidentsService.getIncidentEvents(incidentId);
      setEvents(data);
    } catch (error) {
      console.error('Error loading events:', error);
    } finally {
      setIsLoadingEvents(false);
    }
  }, [incidentId]);

  // Cargar datos auxiliares
  const loadAuxiliaryData = useCallback(async () => {
    if (!organizationId) return;

    try {
      const [employeesData, tripsData, shipmentsData] = await Promise.all([
        incidentsService.getEmployees(organizationId),
        incidentsService.getTrips(organizationId),
        incidentsService.getShipments(organizationId),
      ]);
      setEmployees(employeesData);
      setTrips(tripsData);
      setShipments(shipmentsData);
    } catch (error) {
      console.error('Error loading auxiliary data:', error);
    }
  }, [organizationId]);

  useEffect(() => {
    loadIncident();
    loadEvents();
  }, [loadIncident, loadEvents]);

  useEffect(() => {
    loadAuxiliaryData();
  }, [loadAuxiliaryData]);

  // Handlers
  const handleUpdateIncident = async (data: Parameters<typeof incidentsService.updateIncident>[1]) => {
    if (!incident) return;

    try {
      await incidentsService.updateIncident(incident.id, data);
      toast({
        title: 'Incidente actualizado',
        description: 'Los cambios se guardaron correctamente',
      });
      loadIncident();
      setShowEditDialog(false);
    } catch (error) {
      console.error('Error updating incident:', error);
      toast({
        title: 'Error',
        description: 'No se pudo actualizar el incidente',
        variant: 'destructive',
      });
    }
  };

  const handleChangeStatus = async (newStatus: 'open' | 'in_progress' | 'resolved' | 'closed') => {
    if (!incident) return;

    if (newStatus === 'resolved') {
      setShowResolveDialog(true);
      return;
    }

    try {
      await incidentsService.changeStatus(incident.id, newStatus);
      toast({
        title: 'Estado actualizado',
        description: `El incidente ahora está ${newStatus === 'open' ? 'abierto' : newStatus === 'in_progress' ? 'en proceso' : 'cerrado'}`,
      });
      loadIncident();
      
      // Agregar evento de cambio de estado
      await incidentsService.addIncidentEvent(incident.id, {
        event_type: 'status_change',
        description: `Estado cambiado a: ${newStatus}`,
        actor_type: 'user',
      });
      loadEvents();
    } catch (error) {
      console.error('Error changing status:', error);
      toast({
        title: 'Error',
        description: 'No se pudo cambiar el estado',
        variant: 'destructive',
      });
    }
  };

  const handleResolve = async (resolutionData: {
    resolution_summary: string;
    root_cause: string;
    corrective_actions: string;
  }) => {
    if (!incident) return;

    try {
      await incidentsService.changeStatus(incident.id, 'resolved', resolutionData);
      toast({
        title: 'Incidente resuelto',
        description: 'El incidente ha sido marcado como resuelto',
      });
      
      // Agregar evento de resolución
      await incidentsService.addIncidentEvent(incident.id, {
        event_type: 'resolution',
        description: `Incidente resuelto. ${resolutionData.resolution_summary}`,
        actor_type: 'user',
      });
      
      loadIncident();
      loadEvents();
      setShowResolveDialog(false);
    } catch (error) {
      console.error('Error resolving incident:', error);
      toast({
        title: 'Error',
        description: 'No se pudo resolver el incidente',
        variant: 'destructive',
      });
    }
  };

  const handleCloseIncident = async (closureData: {
    resolution_summary?: string;
    root_cause?: string;
    corrective_actions?: string;
    notify: boolean;
  }) => {
    if (!incident || !organizationId) return;

    try {
      await incidentsService.closeIncident(incident.id, {
        ...closureData,
        organizationId,
      });
      toast({
        title: 'Incidente cerrado',
        description: closureData.notify ? 'Se notificó al responsable' : 'El incidente ha sido cerrado',
      });
      
      // Agregar evento de cierre
      await incidentsService.addIncidentEvent(incident.id, {
        event_type: 'status_change',
        description: 'Incidente cerrado',
        actor_type: 'user',
      });
      
      loadIncident();
      loadEvents();
      setShowCloseDialog(false);
    } catch (error) {
      console.error('Error closing incident:', error);
      toast({
        title: 'Error',
        description: 'No se pudo cerrar el incidente',
        variant: 'destructive',
      });
    }
  };

  const handleAddEvent = async (eventData: {
    event_type: string;
    description: string;
    actor_type: string;
    location_text?: string;
  }) => {
    if (!incident) return;

    try {
      await incidentsService.addIncidentEvent(incident.id, eventData);
      toast({
        title: 'Entrada agregada',
        description: 'La entrada se agregó a la bitácora',
      });
      loadEvents();
    } catch (error) {
      console.error('Error adding event:', error);
      toast({
        title: 'Error',
        description: 'No se pudo agregar la entrada',
        variant: 'destructive',
      });
      throw error;
    }
  };

  const handleUpdateCosts = async (costs: { estimated_cost?: number; actual_cost?: number }) => {
    if (!incident) return;

    try {
      await incidentsService.updateCosts(incident.id, costs);
      toast({
        title: 'Costos actualizados',
        description: 'Los costos se guardaron correctamente',
      });
      loadIncident();
    } catch (error) {
      console.error('Error updating costs:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron actualizar los costos',
        variant: 'destructive',
      });
    }
  };

  const handleAddAttachment = async (attachment: { name: string; url: string; type: string }) => {
    if (!incident) return;

    try {
      await incidentsService.addAttachment(incident.id, attachment);
      toast({
        title: 'Archivo adjuntado',
        description: `"${attachment.name}" se agregó correctamente`,
      });
      
      // Agregar evento de evidencia
      await incidentsService.addIncidentEvent(incident.id, {
        event_type: 'evidence',
        description: `Archivo adjuntado: ${attachment.name}`,
        actor_type: 'user',
      });
      
      loadIncident();
      loadEvents();
    } catch (error) {
      console.error('Error adding attachment:', error);
      toast({
        title: 'Error',
        description: 'No se pudo adjuntar el archivo',
        variant: 'destructive',
      });
      throw error;
    }
  };

  const handleRemoveAttachment = async (attachmentUrl: string) => {
    if (!incident) return;

    try {
      await incidentsService.removeAttachment(incident.id, attachmentUrl);
      toast({
        title: 'Archivo eliminado',
        description: 'El archivo se eliminó correctamente',
      });
      loadIncident();
    } catch (error) {
      console.error('Error removing attachment:', error);
      toast({
        title: 'Error',
        description: 'No se pudo eliminar el archivo',
        variant: 'destructive',
      });
      throw error;
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-500 dark:text-gray-400">Cargando incidente...</p>
        </div>
      </div>
    );
  }

  if (!incident) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <p className="text-gray-500 dark:text-gray-400">Incidente no encontrado</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header con info principal */}
      <IncidentHeader
        incident={incident}
        relatedTrip={relatedTrip}
        relatedShipment={relatedShipment}
        onEdit={() => setShowEditDialog(true)}
        onChangeStatus={handleChangeStatus}
        onClose={() => setShowCloseDialog(true)}
      />

      {/* Grid de contenido */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Columna principal */}
        <div className="lg:col-span-2 space-y-6">
          {/* Timeline de eventos */}
          <IncidentTimeline
            events={events}
            isLoading={isLoadingEvents}
            onAddEvent={() => setShowAddEventDialog(true)}
          />

          {/* Resolución */}
          <IncidentResolution incident={incident} />
        </div>

        {/* Columna lateral */}
        <div className="space-y-6">
          {/* Costos */}
          <IncidentCosts incident={incident} onUpdateCosts={handleUpdateCosts} />

          {/* Adjuntos */}
          <IncidentAttachments
            attachments={incident.attachments || []}
            onAddAttachment={handleAddAttachment}
            onRemoveAttachment={handleRemoveAttachment}
          />
        </div>
      </div>

      {/* Diálogos */}
      <IncidentDialog
        open={showEditDialog}
        onOpenChange={setShowEditDialog}
        incident={incident}
        employees={employees}
        trips={trips}
        shipments={shipments}
        onSave={handleUpdateIncident}
      />

      <AddEventDialog
        open={showAddEventDialog}
        onOpenChange={setShowAddEventDialog}
        onSubmit={handleAddEvent}
      />

      <ResolveDialog
        open={showResolveDialog}
        onOpenChange={setShowResolveDialog}
        incidentTitle={incident?.title || ''}
        onResolve={handleResolve}
      />

      <CloseIncidentDialog
        open={showCloseDialog}
        onOpenChange={setShowCloseDialog}
        incident={incident}
        onClose={handleCloseIncident}
      />
    </div>
  );
}
