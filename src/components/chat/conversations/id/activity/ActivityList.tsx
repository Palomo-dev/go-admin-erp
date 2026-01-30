'use client';

import React, { useState } from 'react';
import { Search, Filter, Loader2, History } from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import ActivityItemComponent from './ActivityItem';
import { ActivityItem, ActivityType } from '@/lib/services/conversationActivityService';

interface ActivityListProps {
  activities: ActivityItem[];
  loading: boolean;
}

export default function ActivityList({ activities, loading }: ActivityListProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');

  const filteredActivities = activities.filter(activity => {
    const matchesSearch = activity.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = typeFilter === 'all' || activity.type === typeFilter;
    return matchesSearch && matchesType;
  });

  const groupByDate = (items: ActivityItem[]) => {
    const groups: Record<string, ActivityItem[]> = {};
    
    items.forEach(item => {
      const date = new Date(item.timestamp);
      const dateKey = date.toLocaleDateString('es-ES', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
      
      if (!groups[dateKey]) {
        groups[dateKey] = [];
      }
      groups[dateKey].push(item);
    });

    return groups;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  const groupedActivities = groupByDate(filteredActivities);

  return (
    <div className="p-4">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Buscar actividad..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>

        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder="Tipo de actividad" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las actividades</SelectItem>
            <SelectItem value="status_change">Cambios de estado</SelectItem>
            <SelectItem value="assignment">Asignaciones</SelectItem>
            <SelectItem value="tag_added">Etiquetas agregadas</SelectItem>
            <SelectItem value="ai_job">Trabajos IA</SelectItem>
            <SelectItem value="audit">Auditoría</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Activity Timeline */}
      {filteredActivities.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 text-center">
          <History className="h-16 w-16 text-gray-300 dark:text-gray-600 mb-4" />
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-1">
            {activities.length === 0 ? 'No hay actividad' : 'No se encontró actividad'}
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {activities.length === 0 
              ? 'Aún no hay actividad registrada en esta conversación'
              : 'Intenta ajustar los filtros de búsqueda'
            }
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(groupedActivities).map(([date, items]) => (
            <div key={date}>
              <div className="sticky top-0 z-10 py-2 bg-gray-50 dark:bg-gray-950">
                <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-400 capitalize">
                  {date}
                </h3>
              </div>
              <div className="space-y-3 mt-2">
                {items.map((activity) => (
                  <ActivityItemComponent key={activity.id} activity={activity} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Results count */}
      {activities.length > 0 && (
        <div className="mt-4 text-sm text-gray-500 dark:text-gray-400 text-center">
          Mostrando {filteredActivities.length} de {activities.length} actividades
        </div>
      )}
    </div>
  );
}
