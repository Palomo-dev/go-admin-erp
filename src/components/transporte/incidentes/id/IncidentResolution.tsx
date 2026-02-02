'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, Clock, AlertTriangle, FileText } from 'lucide-react';
import { IncidentWithDetails } from '@/lib/services/incidentsService';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface IncidentResolutionProps {
  incident: IncidentWithDetails;
}

export function IncidentResolution({ incident }: IncidentResolutionProps) {
  const isResolved = incident.status === 'resolved' || incident.status === 'closed';
  const hasResolutionData = incident.resolution_summary || incident.root_cause || incident.corrective_actions;

  if (!isResolved && !hasResolutionData) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-8">
          <div className="text-center text-gray-500 dark:text-gray-400">
            <Clock className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p className="font-medium">Incidente pendiente de resolución</p>
            <p className="text-sm mt-1">
              La información de resolución se mostrará cuando el incidente sea resuelto
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={isResolved ? 'border-green-200 dark:border-green-800' : ''}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CheckCircle className={`h-5 w-5 ${isResolved ? 'text-green-600' : 'text-gray-400'}`} />
          Resolución del Incidente
          {incident.status === 'closed' && (
            <Badge className="bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300">
              Cerrado
            </Badge>
          )}
          {incident.status === 'resolved' && (
            <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300">
              Resuelto
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Fechas de resolución */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {incident.acknowledged_at && (
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3">
              <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                Reconocido
              </p>
              <p className="font-medium text-gray-900 dark:text-white">
                {format(new Date(incident.acknowledged_at), 'dd/MM/yyyy HH:mm', { locale: es })}
              </p>
            </div>
          )}
          {incident.resolved_at && (
            <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-3">
              <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                Resuelto
              </p>
              <p className="font-medium text-gray-900 dark:text-white">
                {format(new Date(incident.resolved_at), 'dd/MM/yyyy HH:mm', { locale: es })}
              </p>
            </div>
          )}
          {incident.closed_at && (
            <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3">
              <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                Cerrado
              </p>
              <p className="font-medium text-gray-900 dark:text-white">
                {format(new Date(incident.closed_at), 'dd/MM/yyyy HH:mm', { locale: es })}
              </p>
            </div>
          )}
        </div>

        {/* Resumen de resolución */}
        {incident.resolution_summary && (
          <div className="space-y-2">
            <h4 className="flex items-center gap-2 font-medium text-gray-900 dark:text-white">
              <FileText className="h-4 w-4 text-gray-500" />
              Resumen de Resolución
            </h4>
            <p className="text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4">
              {incident.resolution_summary}
            </p>
          </div>
        )}

        {/* Causa raíz */}
        {incident.root_cause && (
          <div className="space-y-2">
            <h4 className="flex items-center gap-2 font-medium text-gray-900 dark:text-white">
              <AlertTriangle className="h-4 w-4 text-orange-500" />
              Causa Raíz
            </h4>
            <p className="text-gray-700 dark:text-gray-300 bg-orange-50 dark:bg-orange-900/20 rounded-lg p-4">
              {incident.root_cause}
            </p>
          </div>
        )}

        {/* Acciones correctivas */}
        {incident.corrective_actions && (
          <div className="space-y-2">
            <h4 className="flex items-center gap-2 font-medium text-gray-900 dark:text-white">
              <CheckCircle className="h-4 w-4 text-green-500" />
              Acciones Correctivas
            </h4>
            <p className="text-gray-700 dark:text-gray-300 bg-green-50 dark:bg-green-900/20 rounded-lg p-4">
              {incident.corrective_actions}
            </p>
          </div>
        )}

        {/* Notas */}
        {incident.notes && (
          <div className="space-y-2">
            <h4 className="font-medium text-gray-900 dark:text-white">Notas</h4>
            <pre className="text-sm text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4 whitespace-pre-wrap font-sans">
              {incident.notes}
            </pre>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
