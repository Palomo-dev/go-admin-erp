'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/utils/Utils';
import {
  FileText,
  ArrowRight,
  Plus,
  Minus,
  Edit,
  Trash2,
  CheckCircle,
  XCircle,
} from 'lucide-react';
import type { TimelineEvent } from '@/lib/services/timelineService';
import { ACTION_LABELS } from '@/lib/services/timelineService';

interface EventSummaryPanelProps {
  event: TimelineEvent;
}

export function EventSummaryPanel({ event }: EventSummaryPanelProps) {
  const getActionIcon = (action: string) => {
    const icons: Record<string, React.ReactNode> = {
      create: <Plus className="h-5 w-5 text-green-500" />,
      update: <Edit className="h-5 w-5 text-blue-500" />,
      delete: <Trash2 className="h-5 w-5 text-red-500" />,
      approve: <CheckCircle className="h-5 w-5 text-emerald-500" />,
      reject: <XCircle className="h-5 w-5 text-rose-500" />,
    };
    return icons[action] || <FileText className="h-5 w-5 text-gray-500" />;
  };

  const getChangeSummary = () => {
    const payload = event.payload as Record<string, unknown>;
    
    if (!payload) return null;

    // Detectar cambios basados en la estructura del payload
    const changes: Array<{ field: string; oldValue?: unknown; newValue?: unknown; type: 'add' | 'remove' | 'change' }> = [];

    // Si tiene old_data y new_data (formato de audit_log)
    if (payload.old_data && payload.new_data) {
      const oldData = payload.old_data as Record<string, unknown>;
      const newData = payload.new_data as Record<string, unknown>;
      
      const allKeys = new Set([...Object.keys(oldData), ...Object.keys(newData)]);
      
      allKeys.forEach((key) => {
        const oldVal = oldData[key];
        const newVal = newData[key];
        
        if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
          if (oldVal === undefined) {
            changes.push({ field: key, newValue: newVal, type: 'add' });
          } else if (newVal === undefined) {
            changes.push({ field: key, oldValue: oldVal, type: 'remove' });
          } else {
            changes.push({ field: key, oldValue: oldVal, newValue: newVal, type: 'change' });
          }
        }
      });
    }
    // Si tiene changes array
    else if (Array.isArray(payload.changes)) {
      payload.changes.forEach((change: unknown) => {
        const c = change as Record<string, unknown>;
        changes.push({
          field: c.field as string,
          oldValue: c.old_value,
          newValue: c.new_value,
          type: c.old_value === undefined ? 'add' : c.new_value === undefined ? 'remove' : 'change',
        });
      });
    }

    return changes.length > 0 ? changes : null;
  };

  const changes = getChangeSummary();

  const formatValue = (value: unknown): string => {
    if (value === null || value === undefined) return '(vacío)';
    if (typeof value === 'boolean') return value ? 'Sí' : 'No';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  };

  return (
    <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <FileText className="h-5 w-5 text-blue-500" />
          Resumen del Evento
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Acción principal */}
        <div className="flex items-center gap-3 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
          {getActionIcon(event.action)}
          <div>
            <p className="font-medium text-gray-900 dark:text-white">
              {ACTION_LABELS[event.action] || event.action}
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {event.event_type} en {event.entity_type}
            </p>
          </div>
        </div>

        {/* Lista de cambios */}
        {changes && changes.length > 0 ? (
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Campos modificados ({changes.length})
            </h4>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {changes.map((change, idx) => (
                <div 
                  key={idx}
                  className={cn(
                    'p-3 rounded-lg border',
                    change.type === 'add' && 'bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-800',
                    change.type === 'remove' && 'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-800',
                    change.type === 'change' && 'bg-blue-50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-800'
                  )}
                >
                  <div className="flex items-center gap-2 mb-1">
                    {change.type === 'add' && <Plus className="h-3 w-3 text-green-600" />}
                    {change.type === 'remove' && <Minus className="h-3 w-3 text-red-600" />}
                    {change.type === 'change' && <Edit className="h-3 w-3 text-blue-600" />}
                    <span className="font-medium text-sm text-gray-900 dark:text-white">
                      {change.field}
                    </span>
                    <Badge variant="outline" className="text-xs">
                      {change.type === 'add' ? 'Agregado' : change.type === 'remove' ? 'Eliminado' : 'Modificado'}
                    </Badge>
                  </div>
                  
                  {change.type === 'change' && (
                    <div className="flex items-center gap-2 text-xs mt-2">
                      <code className="bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 px-2 py-1 rounded max-w-[45%] truncate">
                        {formatValue(change.oldValue)}
                      </code>
                      <ArrowRight className="h-3 w-3 text-gray-400 flex-shrink-0" />
                      <code className="bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 px-2 py-1 rounded max-w-[45%] truncate">
                        {formatValue(change.newValue)}
                      </code>
                    </div>
                  )}
                  
                  {change.type === 'add' && (
                    <code className="text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 px-2 py-1 rounded inline-block mt-1">
                      {formatValue(change.newValue)}
                    </code>
                  )}
                  
                  {change.type === 'remove' && (
                    <code className="text-xs bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 px-2 py-1 rounded inline-block mt-1 line-through">
                      {formatValue(change.oldValue)}
                    </code>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="text-sm text-gray-500 dark:text-gray-400 italic p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
            No se detectaron cambios específicos en este evento.
            Revisa el panel de datos completos para más información.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
