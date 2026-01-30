'use client';

import { format, formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  Card,
  CardContent,
  CardHeader,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertTriangle,
  MoreVertical,
  Edit,
  Copy,
  Trash2,
  User,
  Calendar,
  Clock,
  DollarSign,
  MapPin,
  Truck,
  Package,
  Eye,
  UserPlus,
  CheckCircle,
  XCircle,
  AlertCircle,
} from 'lucide-react';
import type { IncidentWithDetails } from '@/lib/services/incidentsService';
import { INCIDENT_TYPES, SEVERITY_LEVELS, INCIDENT_STATUSES } from '@/lib/services/incidentsService';

interface IncidentCardProps {
  incident: IncidentWithDetails;
  onView: (incident: IncidentWithDetails) => void;
  onEdit: (incident: IncidentWithDetails) => void;
  onDuplicate: (incident: IncidentWithDetails) => void;
  onDelete: (incident: IncidentWithDetails) => void;
  onAssign: (incident: IncidentWithDetails) => void;
  onChangeStatus: (incident: IncidentWithDetails, status: string) => void;
}

const getSeverityColor = (severity: string) => {
  switch (severity) {
    case 'low': return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
    case 'medium': return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400';
    case 'high': return 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400';
    case 'critical': return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
    default: return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400';
  }
};

const getStatusColor = (status: string) => {
  switch (status) {
    case 'open': return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
    case 'in_progress': return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400';
    case 'resolved': return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
    case 'closed': return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400';
    default: return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400';
  }
};

const getStatusIcon = (status: string) => {
  switch (status) {
    case 'open': return <AlertCircle className="h-4 w-4" />;
    case 'in_progress': return <Clock className="h-4 w-4" />;
    case 'resolved': return <CheckCircle className="h-4 w-4" />;
    case 'closed': return <XCircle className="h-4 w-4" />;
    default: return <AlertCircle className="h-4 w-4" />;
  }
};

export function IncidentCard({
  incident,
  onView,
  onEdit,
  onDuplicate,
  onDelete,
  onAssign,
  onChangeStatus,
}: IncidentCardProps) {
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: incident.currency || 'COP',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const incidentTypeLabel = INCIDENT_TYPES.find(t => t.value === incident.incident_type)?.label || incident.incident_type;
  const severityLabel = SEVERITY_LEVELS.find(s => s.value === incident.severity)?.label || incident.severity;
  const statusLabel = INCIDENT_STATUSES.find(s => s.value === incident.status)?.label || incident.status;

  const timeAgo = formatDistanceToNow(new Date(incident.occurred_at), { addSuffix: true, locale: es });

  return (
    <Card className={`relative transition-all hover:shadow-md ${incident.sla_breached ? 'border-red-300 dark:border-red-700' : ''}`}>
      {incident.sla_breached && (
        <div className="absolute top-0 right-0 bg-red-500 text-white text-xs px-2 py-0.5 rounded-bl-lg rounded-tr-lg">
          SLA Incumplido
        </div>
      )}
      
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${getSeverityColor(incident.severity)}`}>
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-gray-900 dark:text-white truncate">
                {incident.title}
              </h3>
              <p className="text-xs text-gray-500 flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {timeAgo}
              </p>
            </div>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onView(incident)}>
                <Eye className="h-4 w-4 mr-2" />
                Ver detalle
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onEdit(incident)}>
                <Edit className="h-4 w-4 mr-2" />
                Editar
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onAssign(incident)}>
                <UserPlus className="h-4 w-4 mr-2" />
                Asignar
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onDuplicate(incident)}>
                <Copy className="h-4 w-4 mr-2" />
                Duplicar
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {incident.status === 'open' && (
                <DropdownMenuItem onClick={() => onChangeStatus(incident, 'in_progress')}>
                  <Clock className="h-4 w-4 mr-2" />
                  Marcar en proceso
                </DropdownMenuItem>
              )}
              {incident.status === 'in_progress' && (
                <DropdownMenuItem onClick={() => onChangeStatus(incident, 'resolved')}>
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Marcar resuelto
                </DropdownMenuItem>
              )}
              {incident.status === 'resolved' && (
                <DropdownMenuItem onClick={() => onChangeStatus(incident, 'closed')}>
                  <XCircle className="h-4 w-4 mr-2" />
                  Cerrar
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => onDelete(incident)}
                className="text-red-600 dark:text-red-400"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Eliminar
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {/* Badges */}
        <div className="flex flex-wrap gap-2">
          <Badge className={getStatusColor(incident.status)}>
            {getStatusIcon(incident.status)}
            <span className="ml-1">{statusLabel}</span>
          </Badge>
          <Badge className={getSeverityColor(incident.severity)}>
            {severityLabel}
          </Badge>
          <Badge variant="outline" className="text-xs">
            {incidentTypeLabel}
          </Badge>
        </div>

        {/* Descripción */}
        {incident.description && (
          <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
            {incident.description}
          </p>
        )}

        {/* Referencia */}
        <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
          {incident.reference_type === 'trip' ? (
            <>
              <Truck className="h-4 w-4 text-blue-500" />
              <span>Viaje: {incident.trip?.trip_code || incident.reference_id.slice(0, 8)}</span>
            </>
          ) : (
            <>
              <Package className="h-4 w-4 text-purple-500" />
              <span>Envío: {incident.shipment?.tracking_number || incident.reference_id.slice(0, 8)}</span>
            </>
          )}
        </div>

        {/* Ubicación */}
        {incident.location_description && (
          <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
            <MapPin className="h-4 w-4 text-green-500" />
            <span className="truncate">{incident.location_description}</span>
          </div>
        )}

        {/* Costos */}
        {(incident.estimated_cost > 0 || incident.actual_cost > 0) && (
          <div className="flex items-center gap-4 text-sm">
            {incident.estimated_cost > 0 && (
              <span className="flex items-center gap-1 text-gray-600 dark:text-gray-400">
                <DollarSign className="h-3 w-3" />
                Est: {formatCurrency(incident.estimated_cost)}
              </span>
            )}
            {incident.actual_cost > 0 && (
              <span className="flex items-center gap-1 text-blue-600">
                <DollarSign className="h-3 w-3" />
                Real: {formatCurrency(incident.actual_cost)}
              </span>
            )}
          </div>
        )}

        {/* Asignado a */}
        <div className="flex items-center justify-between pt-2 border-t dark:border-gray-700">
          <div className="flex items-center gap-2 text-sm">
            <User className="h-4 w-4 text-gray-400" />
            {incident.assigned_user ? (
              <span className="text-gray-700 dark:text-gray-300">
                {incident.assigned_user.full_name}
              </span>
            ) : (
              <span className="text-gray-400 italic">Sin asignar</span>
            )}
          </div>
          
          {incident.sla_hours && (
            <div className="flex items-center gap-1 text-xs text-gray-500">
              <Clock className="h-3 w-3" />
              SLA: {incident.sla_hours}h
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default IncidentCard;
