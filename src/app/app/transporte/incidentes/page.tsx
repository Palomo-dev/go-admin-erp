'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/ui/use-toast';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
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
  AlertTriangle,
  Search,
  Plus,
  Loader2,
  RefreshCw,
  AlertCircle,
  Clock,
  CheckCircle,
  XCircle,
  Filter,
} from 'lucide-react';
import {
  incidentsService,
  type IncidentWithDetails,
  type IncidentFilters,
  type CreateIncidentData,
  SEVERITY_LEVELS,
  INCIDENT_STATUSES,
} from '@/lib/services/incidentsService';
import {
  IncidentCard,
  IncidentDialog,
  AssignDialog,
  ResolveDialog,
} from '@/components/transporte/incidentes';

const REFERENCE_TYPE_OPTIONS = [
  { value: 'all', label: 'Todos' },
  { value: 'trip', label: 'Viajes' },
  { value: 'shipment', label: 'Envíos' },
];

export default function IncidentesPage() {
  const { toast } = useToast();
  const router = useRouter();
  const { organization } = useOrganization();
  const organizationId = organization?.id;

  // Estados principales
  const [incidents, setIncidents] = useState<IncidentWithDetails[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Datos auxiliares
  const [employees, setEmployees] = useState<Array<{ id: number; full_name: string; email?: string }>>([]);
  const [trips, setTrips] = useState<Array<{ id: string; trip_code: string; departure_datetime: string }>>([]);
  const [shipments, setShipments] = useState<Array<{ id: string; tracking_number: string; status: string }>>([]);

  // Filtros
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [selectedSeverity, setSelectedSeverity] = useState('all');
  const [selectedReferenceType, setSelectedReferenceType] = useState('all');

  // Diálogos
  const [showIncidentDialog, setShowIncidentDialog] = useState(false);
  const [showAssignDialog, setShowAssignDialog] = useState(false);
  const [showResolveDialog, setShowResolveDialog] = useState(false);
  const [selectedIncident, setSelectedIncident] = useState<IncidentWithDetails | null>(null);
  const [incidentToDelete, setIncidentToDelete] = useState<IncidentWithDetails | null>(null);

  // Estadísticas
  const [stats, setStats] = useState({
    total: 0,
    open: 0,
    inProgress: 0,
    resolved: 0,
    closed: 0,
    slaBreached: 0,
    bySeverity: {} as Record<string, number>,
    byType: {} as Record<string, number>,
  });

  // Cargar incidentes
  const loadIncidents = useCallback(async () => {
    if (!organizationId) return;

    setIsLoading(true);
    try {
      const filters: IncidentFilters = {};
      
      if (searchTerm) filters.search = searchTerm;
      if (selectedStatus !== 'all') filters.status = selectedStatus;
      if (selectedSeverity !== 'all') filters.severity = selectedSeverity;
      if (selectedReferenceType !== 'all') filters.reference_type = selectedReferenceType;

      const data = await incidentsService.getIncidents(organizationId, filters);
      setIncidents(data);

      // Cargar estadísticas
      const statsData = await incidentsService.getStats(organizationId);
      setStats(statsData);
    } catch (error) {
      console.error('Error loading incidents:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar los incidentes',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [organizationId, searchTerm, selectedStatus, selectedSeverity, selectedReferenceType, toast]);

  // Cargar datos auxiliares
  const loadAuxiliaryData = useCallback(async () => {
    if (!organizationId) return;

    try {
      const [empData, tripsData, shipmentsData] = await Promise.all([
        incidentsService.getEmployees(organizationId),
        incidentsService.getTrips(organizationId),
        incidentsService.getShipments(organizationId),
      ]);

      setEmployees(empData);
      setTrips(tripsData);
      setShipments(shipmentsData);
    } catch (error) {
      console.error('Error loading auxiliary data:', error);
    }
  }, [organizationId]);

  useEffect(() => {
    loadIncidents();
  }, [loadIncidents]);

  useEffect(() => {
    loadAuxiliaryData();
  }, [loadAuxiliaryData]);

  // Handlers CRUD
  const handleCreateIncident = async (data: Partial<CreateIncidentData>) => {
    if (!organizationId) return;

    setIsSubmitting(true);
    try {
      await incidentsService.createIncident({
        ...data,
        organization_id: organizationId,
        title: data.title || '',
        reference_type: data.reference_type as 'trip' | 'shipment',
        reference_id: data.reference_id || '',
        incident_type: data.incident_type || 'other',
      });

      toast({
        title: 'Incidente creado',
        description: 'El incidente se ha registrado correctamente',
      });

      setShowIncidentDialog(false);
      loadIncidents();
    } catch (error) {
      console.error('Error creating incident:', error);
      toast({
        title: 'Error',
        description: 'No se pudo crear el incidente',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateIncident = async (data: Partial<CreateIncidentData>) => {
    if (!selectedIncident) return;

    setIsSubmitting(true);
    try {
      await incidentsService.updateIncident(selectedIncident.id, data);

      toast({
        title: 'Incidente actualizado',
        description: 'Los cambios se han guardado correctamente',
      });

      setShowIncidentDialog(false);
      setSelectedIncident(null);
      loadIncidents();
    } catch (error) {
      console.error('Error updating incident:', error);
      toast({
        title: 'Error',
        description: 'No se pudo actualizar el incidente',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!incidentToDelete) return;

    setIsSubmitting(true);
    try {
      await incidentsService.deleteIncident(incidentToDelete.id);

      toast({
        title: 'Incidente eliminado',
        description: 'El incidente se ha eliminado correctamente',
      });

      setIncidentToDelete(null);
      loadIncidents();
    } catch (error) {
      console.error('Error deleting incident:', error);
      toast({
        title: 'Error',
        description: 'No se pudo eliminar el incidente',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDuplicate = async (incident: IncidentWithDetails) => {
    try {
      await incidentsService.duplicateIncident(incident.id);

      toast({
        title: 'Incidente duplicado',
        description: 'Se ha creado una copia del incidente',
      });

      loadIncidents();
    } catch (error) {
      console.error('Error duplicating incident:', error);
      toast({
        title: 'Error',
        description: 'No se pudo duplicar el incidente',
        variant: 'destructive',
      });
    }
  };

  const handleAssign = async (employeeId: number) => {
    if (!selectedIncident) return;

    setIsSubmitting(true);
    try {
      await incidentsService.assignResponsible(selectedIncident.id, employeeId);

      toast({
        title: 'Responsable asignado',
        description: 'El incidente ha sido asignado correctamente',
      });

      setShowAssignDialog(false);
      setSelectedIncident(null);
      loadIncidents();
    } catch (error) {
      console.error('Error assigning:', error);
      toast({
        title: 'Error',
        description: 'No se pudo asignar el responsable',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChangeStatus = async (incident: IncidentWithDetails, newStatus: string) => {
    if (newStatus === 'resolved') {
      setSelectedIncident(incident);
      setShowResolveDialog(true);
      return;
    }

    try {
      await incidentsService.changeStatus(incident.id, newStatus as 'open' | 'in_progress' | 'resolved' | 'closed');

      toast({
        title: 'Estado actualizado',
        description: `El incidente ahora está ${INCIDENT_STATUSES.find(s => s.value === newStatus)?.label || newStatus}`,
      });

      loadIncidents();
    } catch (error) {
      console.error('Error changing status:', error);
      toast({
        title: 'Error',
        description: 'No se pudo cambiar el estado',
        variant: 'destructive',
      });
    }
  };

  const handleResolve = async (data: { resolution_summary: string; root_cause: string; corrective_actions: string }) => {
    if (!selectedIncident) return;

    setIsSubmitting(true);
    try {
      await incidentsService.changeStatus(selectedIncident.id, 'resolved', data);

      toast({
        title: 'Incidente resuelto',
        description: 'El incidente ha sido marcado como resuelto',
      });

      setShowResolveDialog(false);
      setSelectedIncident(null);
      loadIncidents();
    } catch (error) {
      console.error('Error resolving:', error);
      toast({
        title: 'Error',
        description: 'No se pudo resolver el incidente',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleView = (incident: IncidentWithDetails) => {
    router.push(`/app/transporte/incidentes/${incident.id}`);
  };

  const handleEdit = (incident: IncidentWithDetails) => {
    setSelectedIncident(incident);
    setShowIncidentDialog(true);
  };

  const handleAssignClick = (incident: IncidentWithDetails) => {
    setSelectedIncident(incident);
    setShowAssignDialog(true);
  };

  const handleNewIncident = () => {
    setSelectedIncident(null);
    setShowIncidentDialog(true);
  };

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <AlertTriangle className="h-7 w-7 text-orange-600" />
            Gestión de Incidentes
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            Registra y da seguimiento a incidentes de transporte
          </p>
        </div>

        <Button onClick={handleNewIncident}>
          <Plus className="h-4 w-4 mr-2" />
          Nuevo Incidente
        </Button>
      </div>

      {/* Estadísticas */}
      {!isLoading && (
        <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gray-100 dark:bg-gray-800 rounded-lg">
                <AlertTriangle className="h-5 w-5 text-gray-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.total}</p>
                <p className="text-xs text-gray-500">Total</p>
              </div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                <AlertCircle className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-blue-600">{stats.open}</p>
                <p className="text-xs text-gray-500">Abiertos</p>
              </div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-yellow-100 dark:bg-yellow-900/30 rounded-lg">
                <Clock className="h-5 w-5 text-yellow-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-yellow-600">{stats.inProgress}</p>
                <p className="text-xs text-gray-500">En proceso</p>
              </div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
                <CheckCircle className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-green-600">{stats.resolved}</p>
                <p className="text-xs text-gray-500">Resueltos</p>
              </div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gray-100 dark:bg-gray-800 rounded-lg">
                <XCircle className="h-5 w-5 text-gray-500" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-500">{stats.closed}</p>
                <p className="text-xs text-gray-500">Cerrados</p>
              </div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-lg">
                <AlertTriangle className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-red-600">{stats.slaBreached}</p>
                <p className="text-xs text-gray-500">SLA Incumplido</p>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Filtros */}
      <Card className="p-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Buscar por título o descripción..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>

          <Select value={selectedStatus} onValueChange={setSelectedStatus}>
            <SelectTrigger className="w-full sm:w-[160px]">
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los estados</SelectItem>
              {INCIDENT_STATUSES.map((status) => (
                <SelectItem key={status.value} value={status.value}>
                  {status.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={selectedSeverity} onValueChange={setSelectedSeverity}>
            <SelectTrigger className="w-full sm:w-[160px]">
              <SelectValue placeholder="Severidad" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              {SEVERITY_LEVELS.map((level) => (
                <SelectItem key={level.value} value={level.value}>
                  {level.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={selectedReferenceType} onValueChange={setSelectedReferenceType}>
            <SelectTrigger className="w-full sm:w-[140px]">
              <SelectValue placeholder="Tipo" />
            </SelectTrigger>
            <SelectContent>
              {REFERENCE_TYPE_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button variant="outline" size="icon" onClick={loadIncidents}>
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </Card>

      {/* Lista de incidentes */}
      {isLoading ? (
        <Card className="p-8">
          <div className="flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-orange-600" />
            <span className="ml-3 text-gray-600 dark:text-gray-400">Cargando incidentes...</span>
          </div>
        </Card>
      ) : incidents.length === 0 ? (
        <Card className="p-8 text-center">
          <AlertTriangle className="h-12 w-12 mx-auto text-gray-400 mb-4" />
          <h3 className="text-lg font-medium text-gray-900 dark:text-white">
            No hay incidentes registrados
          </h3>
          <p className="text-gray-500 mt-1">
            {searchTerm || selectedStatus !== 'all' || selectedSeverity !== 'all'
              ? 'No se encontraron incidentes con los filtros aplicados'
              : 'Comienza registrando un nuevo incidente'}
          </p>
          <Button onClick={handleNewIncident} className="mt-4">
            <Plus className="h-4 w-4 mr-2" />
            Nuevo Incidente
          </Button>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {incidents.map((incident) => (
            <IncidentCard
              key={incident.id}
              incident={incident}
              onView={handleView}
              onEdit={handleEdit}
              onDuplicate={handleDuplicate}
              onDelete={setIncidentToDelete}
              onAssign={handleAssignClick}
              onChangeStatus={handleChangeStatus}
            />
          ))}
        </div>
      )}

      {/* Diálogos */}
      <IncidentDialog
        open={showIncidentDialog}
        onOpenChange={(open) => {
          setShowIncidentDialog(open);
          if (!open) setSelectedIncident(null);
        }}
        incident={selectedIncident}
        trips={trips}
        shipments={shipments}
        employees={employees}
        onSave={selectedIncident ? handleUpdateIncident : handleCreateIncident}
        isLoading={isSubmitting}
      />

      <AssignDialog
        open={showAssignDialog}
        onOpenChange={(open) => {
          setShowAssignDialog(open);
          if (!open) setSelectedIncident(null);
        }}
        incidentTitle={selectedIncident?.title || ''}
        currentAssignee={selectedIncident?.assigned_to}
        employees={employees}
        onAssign={handleAssign}
        isLoading={isSubmitting}
      />

      <ResolveDialog
        open={showResolveDialog}
        onOpenChange={(open) => {
          setShowResolveDialog(open);
          if (!open) setSelectedIncident(null);
        }}
        incidentTitle={selectedIncident?.title || ''}
        onResolve={handleResolve}
        isLoading={isSubmitting}
      />

      <AlertDialog open={!!incidentToDelete} onOpenChange={() => setIncidentToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar incidente?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. El incidente &quot;{incidentToDelete?.title}&quot; será eliminado permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-red-600 hover:bg-red-700"
            >
              {isSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                'Eliminar'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
