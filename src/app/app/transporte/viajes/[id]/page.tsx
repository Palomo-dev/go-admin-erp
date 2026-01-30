'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { useToast } from '@/components/ui/use-toast';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  TripDetailHeader,
  TripInfo,
  TripPassengersList,
  TripTimeline,
  TripIncidents,
  CheckinDialog,
  AddEventDialog,
  ReportIncidentDialog,
} from '@/components/transporte/viajes/id';
import { TripDialog } from '@/components/transporte/viajes';
import {
  tripsService,
  type TripWithDetails,
  type TripTicket,
  type TransportEvent,
} from '@/lib/services/tripsService';
import { Loader2, Users, Clock, AlertTriangle } from 'lucide-react';

interface Route {
  id: string;
  name: string;
  code: string;
}

interface Vehicle {
  id: string;
  plate: string;
  passenger_capacity?: number;
}

interface Driver {
  id: string;
  name: string;
}

interface Branch {
  id: number;
  name: string;
}

interface Incident {
  id: string;
  incident_type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description?: string;
  status: string;
  occurred_at: string;
  resolved_at?: string;
}

export default function TripDetailPage() {
  const params = useParams();
  const tripId = params.id as string;
  const { toast } = useToast();
  const { organization } = useOrganization();
  const organizationId = organization?.id;

  const [trip, setTrip] = useState<TripWithDetails | null>(null);
  const [tickets, setTickets] = useState<TripTicket[]>([]);
  const [events, setEvents] = useState<TransportEvent[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingTickets, setIsLoadingTickets] = useState(true);
  const [isLoadingEvents, setIsLoadingEvents] = useState(true);
  const [isLoadingIncidents, setIsLoadingIncidents] = useState(true);

  const [routes, setRoutes] = useState<Route[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);

  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showCheckinDialog, setShowCheckinDialog] = useState(false);
  const [showAddEventDialog, setShowAddEventDialog] = useState(false);
  const [showIncidentDialog, setShowIncidentDialog] = useState(false);

  const loadTrip = useCallback(async () => {
    if (!tripId) return;

    setIsLoading(true);
    try {
      const data = await tripsService.getTripById(tripId);
      setTrip(data);
    } catch (error) {
      console.error('Error loading trip:', error);
      toast({
        title: 'Error',
        description: 'No se pudo cargar el viaje',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [tripId, toast]);

  const loadTickets = useCallback(async () => {
    if (!tripId) return;

    setIsLoadingTickets(true);
    try {
      const data = await tripsService.getTripTickets(tripId);
      setTickets(data);
    } catch (error) {
      console.error('Error loading tickets:', error);
    } finally {
      setIsLoadingTickets(false);
    }
  }, [tripId]);

  const loadEvents = useCallback(async () => {
    if (!tripId) return;

    setIsLoadingEvents(true);
    try {
      const data = await tripsService.getTripEvents(tripId);
      setEvents(data);
    } catch (error) {
      console.error('Error loading events:', error);
    } finally {
      setIsLoadingEvents(false);
    }
  }, [tripId]);

  const loadIncidents = useCallback(async () => {
    if (!tripId) return;

    setIsLoadingIncidents(true);
    try {
      const data = await tripsService.getTripIncidents(tripId);
      setIncidents(data as Incident[]);
    } catch (error) {
      console.error('Error loading incidents:', error);
    } finally {
      setIsLoadingIncidents(false);
    }
  }, [tripId]);

  const loadReferenceData = useCallback(async () => {
    if (!organizationId) return;

    try {
      const [routesData, vehiclesData, driversData, branchesData] = await Promise.all([
        tripsService.getRoutes(organizationId),
        tripsService.getVehicles(organizationId),
        tripsService.getDrivers(organizationId),
        tripsService.getBranches(organizationId),
      ]);

      setRoutes(routesData);
      setVehicles(vehiclesData);
      setDrivers(driversData);
      setBranches(branchesData);
    } catch (error) {
      console.error('Error loading reference data:', error);
    }
  }, [organizationId]);

  useEffect(() => {
    loadTrip();
    loadTickets();
    loadEvents();
    loadIncidents();
    loadReferenceData();
  }, [loadTrip, loadTickets, loadEvents, loadIncidents, loadReferenceData]);

  const handleStatusChange = async (newStatus: string) => {
    if (!trip) return;

    try {
      await tripsService.updateTripStatus(trip.id, newStatus as TripWithDetails['status']);
      toast({
        title: 'Estado actualizado',
        description: `El viaje ahora está ${newStatus === 'boarding' ? 'en abordaje' : newStatus === 'in_transit' ? 'en ruta' : newStatus === 'completed' ? 'completado' : 'cancelado'}`,
      });
      loadTrip();
      loadEvents();
    } catch (error) {
      console.error('Error updating status:', error);
      toast({
        title: 'Error',
        description: 'No se pudo actualizar el estado',
        variant: 'destructive',
      });
    }
  };

  const handleSaveTrip = async (data: Partial<TripWithDetails>) => {
    if (!trip) return;

    try {
      await tripsService.updateTrip(trip.id, data);
      toast({
        title: 'Viaje actualizado',
        description: 'Los cambios han sido guardados',
      });
      loadTrip();
    } catch (error) {
      console.error('Error updating trip:', error);
      toast({
        title: 'Error',
        description: 'No se pudo guardar el viaje',
        variant: 'destructive',
      });
      throw error;
    }
  };

  const handleBoardPassenger = async (ticket: TripTicket) => {
    try {
      await tripsService.boardPassenger(ticket.id);
      toast({
        title: 'Pasajero abordado',
        description: `${ticket.passenger_name || 'Pasajero'} ha sido marcado como abordado`,
      });
      loadTickets();
    } catch (error) {
      console.error('Error boarding passenger:', error);
      toast({
        title: 'Error',
        description: 'No se pudo marcar el pasajero como abordado',
        variant: 'destructive',
      });
    }
  };

  const handleNoShow = async (ticket: TripTicket) => {
    try {
      await tripsService.markNoShow(ticket.id);
      toast({
        title: 'No Show registrado',
        description: `${ticket.passenger_name || 'Pasajero'} ha sido marcado como No Show`,
      });
      loadTickets();
    } catch (error) {
      console.error('Error marking no show:', error);
      toast({
        title: 'Error',
        description: 'No se pudo marcar el pasajero como No Show',
        variant: 'destructive',
      });
    }
  };

  const handleScanQR = () => {
    setShowCheckinDialog(true);
  };

  const handleCheckinSuccess = () => {
    toast({
      title: 'Check-in exitoso',
      description: 'El pasajero ha sido abordado correctamente',
    });
    loadTickets();
  };

  const handleAddEvent = () => {
    setShowAddEventDialog(true);
  };

  const handleEventSuccess = () => {
    toast({
      title: 'Evento registrado',
      description: 'El evento ha sido agregado al timeline',
    });
    loadEvents();
  };

  const handleReportIncident = () => {
    setShowIncidentDialog(true);
  };

  const handleIncidentSuccess = () => {
    toast({
      title: 'Incidente reportado',
      description: 'El incidente ha sido registrado correctamente',
    });
    loadIncidents();
  };

  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        <span className="ml-3 text-gray-600 dark:text-gray-400">Cargando viaje...</span>
      </div>
    );
  }

  if (!trip) {
    return (
      <div className="p-6 text-center">
        <AlertTriangle className="h-12 w-12 mx-auto text-yellow-500 mb-4" />
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
          Viaje no encontrado
        </h2>
        <p className="text-gray-600 dark:text-gray-400 mt-2">
          El viaje que buscas no existe o ha sido eliminado.
        </p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <TripDetailHeader
        trip={trip}
        onEdit={() => setShowEditDialog(true)}
        onStatusChange={handleStatusChange}
      />

      <TripInfo trip={trip} />

      <Tabs defaultValue="passengers" className="w-full">
        <TabsList className="grid w-full grid-cols-3 max-w-md">
          <TabsTrigger value="passengers" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            Pasajeros
          </TabsTrigger>
          <TabsTrigger value="timeline" className="flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Timeline
          </TabsTrigger>
          <TabsTrigger value="incidents" className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            Incidentes
          </TabsTrigger>
        </TabsList>

        <TabsContent value="passengers" className="mt-6">
          <TripPassengersList
            tickets={tickets}
            isLoading={isLoadingTickets}
            onBoard={handleBoardPassenger}
            onNoShow={handleNoShow}
            onScanQR={handleScanQR}
          />
        </TabsContent>

        <TabsContent value="timeline" className="mt-6">
          <TripTimeline
            events={events}
            isLoading={isLoadingEvents}
            onAddEvent={handleAddEvent}
          />
        </TabsContent>

        <TabsContent value="incidents" className="mt-6">
          <TripIncidents
            incidents={incidents}
            isLoading={isLoadingIncidents}
            onReportIncident={handleReportIncident}
          />
        </TabsContent>
      </Tabs>

      <TripDialog
        open={showEditDialog}
        onOpenChange={setShowEditDialog}
        trip={trip}
        routes={routes}
        vehicles={vehicles}
        drivers={drivers}
        branches={branches}
        onSave={handleSaveTrip}
      />

      <CheckinDialog
        open={showCheckinDialog}
        onOpenChange={setShowCheckinDialog}
        tripId={tripId}
        onSuccess={handleCheckinSuccess}
      />

      {organizationId && (
        <>
          <AddEventDialog
            open={showAddEventDialog}
            onOpenChange={setShowAddEventDialog}
            tripId={tripId}
            organizationId={organizationId}
            onSuccess={handleEventSuccess}
          />

          <ReportIncidentDialog
            open={showIncidentDialog}
            onOpenChange={setShowIncidentDialog}
            tripId={tripId}
            organizationId={organizationId}
            onSuccess={handleIncidentSuccess}
          />
        </>
      )}
    </div>
  );
}
