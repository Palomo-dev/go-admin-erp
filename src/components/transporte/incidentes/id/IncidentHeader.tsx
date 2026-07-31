'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  ArrowLeft,
  Edit,
  MoreVertical,
  Clock,
  AlertTriangle,
  CheckCircle,
  XCircle,
  User,
  Calendar,
  MapPin,
  Truck,
  Package,
} from 'lucide-react';
import { IncidentWithDetails, INCIDENT_TYPES, SEVERITY_LEVELS, INCIDENT_STATUSES } from '@/lib/services/incidentsService';
import { formatDistanceToNow, format } from 'date-fns';
import { es } from 'date-fns/locale';

interface IncidentHeaderProps {
  incident: IncidentWithDetails;
  relatedTrip?: {
    id: string;
    trip_code: string;
    departure_datetime: string;
    origin?: string;
    destination?: string;
    status: string;
  } | null;
  relatedShipment?: {
    id: string;
    tracking_number: string;
    status: string;
    origin_address?: string;
    destination_address?: string;
  } | null;
  onEdit: () => void;
  onChangeStatus: (status: 'open' | 'in_progress' | 'resolved' | 'closed') => void;
  onClose: () => void;
}

export function IncidentHeader({
  incident,
  relatedTrip,
  relatedShipment,
  onEdit,
  onChangeStatus,
  onClose,
}: IncidentHeaderProps) {
  const router = useRouter();

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'open':
        return <AlertTriangle className="h-4 w-4" />;
      case 'in_progress':
        return <Clock className="h-4 w-4" />;
      case 'resolved':
        return <CheckCircle className="h-4 w-4" />;
      case 'closed':
        return <XCircle className="h-4 w-4" />;
      default:
        return null;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'open':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300';
      case 'in_progress':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300';
      case 'resolved':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
      case 'closed':
        return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'low':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
      case 'medium':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300';
      case 'high':
        return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300';
      case 'critical':
        return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
    }
  };

  const incidentType = INCIDENT_TYPES.find(t => t.value === incident.incident_type);
  const severity = SEVERITY_LEVELS.find(s => s.value === incident.severity);
  const status = INCIDENT_STATUSES.find(s => s.value === incident.status);

  const canChangeToInProgress = incident.status === 'open';
  const canResolve = incident.status === 'in_progress';
  const canClose = incident.status === 'resolved';
  const canReopen = incident.status === 'closed';

  return (
    <div className="space-y-4">
      {/* Navegación */}
      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push('/app/transporte/incidentes')}
          className="gap-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver a Incidentes
        </Button>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onEdit} className="gap-2">
            <Edit className="h-4 w-4" />
            Editar
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {canChangeToInProgress && (
                <DropdownMenuItem onClick={() => onChangeStatus('in_progress')}>
                  <Clock className="h-4 w-4 mr-2" />
                  Iniciar proceso
                </DropdownMenuItem>
              )}
              {canResolve && (
                <DropdownMenuItem onClick={() => onChangeStatus('resolved')}>
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Marcar como resuelto
                </DropdownMenuItem>
              )}
              {canClose && (
                <DropdownMenuItem onClick={onClose}>
                  <XCircle className="h-4 w-4 mr-2" />
                  Cerrar incidente
                </DropdownMenuItem>
              )}
              {canReopen && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => onChangeStatus('open')}>
                    <AlertTriangle className="h-4 w-4 mr-2" />
                    Reabrir incidente
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Información principal */}
      <Card className="border-l-4 border-l-blue-600">
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
            <div className="space-y-3 flex-1">
              {/* Título y badges */}
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                  {incident.title}
                </h1>
                <Badge className={getSeverityColor(incident.severity)}>
                  {severity?.label || incident.severity}
                </Badge>
                <Badge className={getStatusColor(incident.status)}>
                  {getStatusIcon(incident.status)}
                  <span className="ml-1">{status?.label || incident.status}</span>
                </Badge>
                {incident.sla_breached && (
                  <Badge variant="destructive">SLA Incumplido</Badge>
                )}
              </div>

              {/* Tipo de incidente */}
              <p className="text-sm text-gray-500 dark:text-gray-400">
                <span className="font-medium">Tipo:</span> {incidentType?.label || incident.incident_type}
              </p>

              {/* Descripción */}
              {incident.description && (
                <p className="text-gray-700 dark:text-gray-300">{incident.description}</p>
              )}

              {/* Metadatos */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 pt-4">
                {/* Fecha ocurrencia */}
                <div className="flex items-center gap-2 text-sm">
                  <Calendar className="h-4 w-4 text-gray-400" />
                  <div>
                    <span className="text-gray-500 dark:text-gray-400">Ocurrió:</span>
                    <p className="font-medium text-gray-900 dark:text-white">
                      {format(new Date(incident.occurred_at), 'dd/MM/yyyy HH:mm', { locale: es })}
                    </p>
                    <p className="text-xs text-gray-500">
                      {formatDistanceToNow(new Date(incident.occurred_at), { addSuffix: true, locale: es })}
                    </p>
                  </div>
                </div>

                {/* Responsable */}
                <div className="flex items-center gap-2 text-sm">
                  <User className="h-4 w-4 text-gray-400" />
                  <div>
                    <span className="text-gray-500 dark:text-gray-400">Responsable:</span>
                    <p className="font-medium text-gray-900 dark:text-white">
                      {incident.assigned_user?.full_name || 'Sin asignar'}
                    </p>
                    {incident.assigned_user?.email && (
                      <p className="text-xs text-gray-500">{incident.assigned_user.email}</p>
                    )}
                  </div>
                </div>

                {/* Ubicación */}
                {incident.location_description && (
                  <div className="flex items-center gap-2 text-sm">
                    <MapPin className="h-4 w-4 text-gray-400" />
                    <div>
                      <span className="text-gray-500 dark:text-gray-400">Ubicación:</span>
                      <p className="font-medium text-gray-900 dark:text-white">
                        {incident.location_description}
                      </p>
                    </div>
                  </div>
                )}

                {/* SLA */}
                {incident.sla_hours && (
                  <div className="flex items-center gap-2 text-sm">
                    <Clock className="h-4 w-4 text-gray-400" />
                    <div>
                      <span className="text-gray-500 dark:text-gray-400">SLA:</span>
                      <p className={`font-medium ${incident.sla_breached ? 'text-red-600' : 'text-gray-900 dark:text-white'}`}>
                        {incident.sla_hours} horas
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Referencia (Trip/Shipment) */}
            <div className="md:w-64 shrink-0">
              <Card className="bg-gray-50 dark:bg-gray-800/50">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3">
                    {incident.reference_type === 'trip' ? (
                      <Truck className="h-5 w-5 text-blue-600" />
                    ) : (
                      <Package className="h-5 w-5 text-blue-600" />
                    )}
                    <span className="font-medium text-gray-900 dark:text-white">
                      {incident.reference_type === 'trip' ? 'Viaje' : 'Envío'}
                    </span>
                  </div>

                  {incident.reference_type === 'trip' && relatedTrip && (
                    <div className="space-y-2 text-sm">
                      <p className="font-mono text-blue-600">{relatedTrip.trip_code}</p>
                      {relatedTrip.origin && relatedTrip.destination && (
                        <p className="text-gray-600 dark:text-gray-400">
                          {relatedTrip.origin} → {relatedTrip.destination}
                        </p>
                      )}
                      <Button
                        variant="link"
                        size="sm"
                        className="p-0 h-auto"
                        onClick={() => router.push(`/app/transporte/viajes/${relatedTrip.id}`)}
                      >
                        Ver viaje →
                      </Button>
                    </div>
                  )}

                  {incident.reference_type === 'shipment' && relatedShipment && (
                    <div className="space-y-2 text-sm">
                      <p className="font-mono text-blue-600">{relatedShipment.tracking_number}</p>
                      <Badge variant="outline">{relatedShipment.status}</Badge>
                      <Button
                        variant="link"
                        size="sm"
                        className="p-0 h-auto"
                        onClick={() => router.push(`/app/transporte/envios/${relatedShipment.id}`)}
                      >
                        Ver envío →
                      </Button>
                    </div>
                  )}

                  {!relatedTrip && !relatedShipment && (
                    <p className="text-sm text-gray-500">
                      ID: {incident.reference_id.slice(0, 8)}...
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
