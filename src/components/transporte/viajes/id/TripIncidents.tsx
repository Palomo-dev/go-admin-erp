'use client';

import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Plus, Clock, CheckCircle } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

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

interface TripIncidentsProps {
  incidents: Incident[];
  isLoading: boolean;
  onReportIncident: () => void;
}

const SEVERITY_CONFIG: Record<string, { label: string; color: string }> = {
  low: { label: 'Baja', color: 'bg-green-100 text-green-800' },
  medium: { label: 'Media', color: 'bg-yellow-100 text-yellow-800' },
  high: { label: 'Alta', color: 'bg-orange-100 text-orange-800' },
  critical: { label: 'Crítica', color: 'bg-red-100 text-red-800' },
};

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  open: { label: 'Abierto', color: 'bg-red-100 text-red-800' },
  investigating: { label: 'Investigando', color: 'bg-yellow-100 text-yellow-800' },
  in_progress: { label: 'En Progreso', color: 'bg-blue-100 text-blue-800' },
  resolved: { label: 'Resuelto', color: 'bg-green-100 text-green-800' },
  closed: { label: 'Cerrado', color: 'bg-gray-100 text-gray-800' },
};

export function TripIncidents({ incidents, isLoading, onReportIncident }: TripIncidentsProps) {
  if (isLoading) {
    return (
      <Card className="p-8">
        <div className="flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <AlertTriangle className="h-5 w-5" />
          Incidentes
          {incidents.length > 0 && (
            <Badge variant="outline" className="ml-2">
              {incidents.length}
            </Badge>
          )}
        </h3>
        <Button size="sm" variant="outline" onClick={onReportIncident}>
          <Plus className="h-4 w-4 mr-2" />
          Reportar Incidente
        </Button>
      </div>

      {incidents.length === 0 ? (
        <div className="p-8 text-center">
          <CheckCircle className="h-12 w-12 mx-auto text-green-500 mb-4" />
          <p className="text-gray-600 dark:text-gray-400">
            No hay incidentes reportados para este viaje
          </p>
        </div>
      ) : (
        <div className="divide-y divide-gray-200 dark:divide-gray-700">
          {incidents.map((incident) => {
            const severity = SEVERITY_CONFIG[incident.severity] || SEVERITY_CONFIG.low;
            const status = STATUS_CONFIG[incident.status] || STATUS_CONFIG.open;

            return (
              <div key={incident.id} className="p-4">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge className={severity.color}>{severity.label}</Badge>
                      <Badge className={status.color}>{status.label}</Badge>
                    </div>
                    <h4 className="font-medium text-gray-900 dark:text-white">
                      {incident.title}
                    </h4>
                    {incident.description && (
                      <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                        {incident.description}
                      </p>
                    )}
                    <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {format(new Date(incident.occurred_at), "d MMM yyyy, HH:mm", { locale: es })}
                      </span>
                      {incident.resolved_at && (
                        <span className="flex items-center gap-1 text-green-600">
                          <CheckCircle className="h-3 w-3" />
                          Resuelto: {format(new Date(incident.resolved_at), "d MMM, HH:mm", { locale: es })}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
