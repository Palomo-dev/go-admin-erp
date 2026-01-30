'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Search,
  MoreVertical,
  Edit,
  Trash2,
  Copy,
  Power,
  Clock,
  Route,
  Bus,
  User,
  Calendar,
  Play,
} from 'lucide-react';
import { RouteSchedule, TransportRoute } from '@/lib/services/transportRoutesService';

interface SchedulesListProps {
  schedules: RouteSchedule[];
  routes: TransportRoute[];
  isLoading: boolean;
  onEdit: (schedule: RouteSchedule) => void;
  onDelete: (schedule: RouteSchedule) => void;
  onDuplicate: (schedule: RouteSchedule) => void;
  onToggleStatus: (schedule: RouteSchedule) => void;
  onGenerateTrips?: (schedule: RouteSchedule) => void;
}

const DAYS_OF_WEEK = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

export function SchedulesList({
  schedules,
  routes,
  isLoading,
  onEdit,
  onDelete,
  onDuplicate,
  onToggleStatus,
  onGenerateTrips,
}: SchedulesListProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [routeFilter, setRouteFilter] = useState<string>('all');

  const filteredSchedules = schedules.filter((schedule) => {
    const matchesSearch =
      schedule.schedule_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      schedule.transport_routes?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      schedule.departure_time.includes(searchTerm);
    const matchesRoute = routeFilter === 'all' || schedule.route_id === routeFilter;
    return matchesSearch && matchesRoute;
  });

  const getRecurrenceLabel = (schedule: RouteSchedule) => {
    switch (schedule.recurrence_type) {
      case 'daily':
        return 'Diario';
      case 'weekly':
        return schedule.days_of_week?.map((d) => DAYS_OF_WEEK[d]).join(', ') || 'Semanal';
      case 'specific_dates':
        return `${schedule.specific_dates?.length || 0} fechas`;
      default:
        return schedule.recurrence_type;
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex gap-4">
          <Skeleton className="h-10 w-full max-w-sm" />
          <Skeleton className="h-10 w-48" />
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-48" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Buscar por nombre, ruta, hora..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={routeFilter} onValueChange={setRouteFilter}>
          <SelectTrigger className="w-[220px]">
            <SelectValue placeholder="Filtrar por ruta" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las rutas</SelectItem>
            {routes.map((route) => (
              <SelectItem key={route.id} value={route.id}>
                {route.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-sm text-gray-500 dark:text-gray-400 self-center">
          {filteredSchedules.length} horarios
        </span>
      </div>

      {filteredSchedules.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Clock className="h-12 w-12 mx-auto text-gray-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-white">
              No hay horarios
            </h3>
            <p className="text-gray-500 dark:text-gray-400 mt-1">
              {searchTerm || routeFilter !== 'all' ? 'No se encontraron resultados' : 'Crea el primer horario de ruta'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredSchedules.map((schedule) => (
            <Card 
              key={schedule.id} 
              className={`hover:shadow-md transition-shadow ${!schedule.is_active ? 'opacity-60' : ''}`}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Badge variant={schedule.is_active ? 'default' : 'secondary'}>
                      {schedule.is_active ? 'Activo' : 'Inactivo'}
                    </Badge>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => onEdit(schedule)}>
                        <Edit className="h-4 w-4 mr-2" />
                        Editar
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onDuplicate(schedule)}>
                        <Copy className="h-4 w-4 mr-2" />
                        Duplicar
                      </DropdownMenuItem>
                      {onGenerateTrips && (
                        <DropdownMenuItem onClick={() => onGenerateTrips(schedule)}>
                          <Play className="h-4 w-4 mr-2" />
                          Generar viajes
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem onClick={() => onToggleStatus(schedule)}>
                        <Power className="h-4 w-4 mr-2" />
                        {schedule.is_active ? 'Desactivar' : 'Activar'}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => onDelete(schedule)}
                        className="text-red-600"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Eliminar
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                <div className="space-y-3">
                  <div>
                    <p className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                      <Clock className="h-4 w-4 text-blue-600" />
                      {schedule.departure_time}
                      {schedule.arrival_time && (
                        <span className="text-gray-500">→ {schedule.arrival_time}</span>
                      )}
                    </p>
                    {schedule.schedule_name && (
                      <p className="text-sm text-gray-500">{schedule.schedule_name}</p>
                    )}
                  </div>

                  <div className="space-y-2 text-sm">
                    <div className="flex items-center gap-2">
                      <Route className="h-4 w-4 text-gray-400" />
                      <span className="text-gray-600 dark:text-gray-300">
                        {schedule.transport_routes?.name || 'Sin ruta'}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-gray-400" />
                      <span className="text-gray-600 dark:text-gray-300">
                        {getRecurrenceLabel(schedule)}
                      </span>
                    </div>

                    {schedule.vehicles && (
                      <div className="flex items-center gap-2">
                        <Bus className="h-4 w-4 text-gray-400" />
                        <span className="text-gray-600 dark:text-gray-300">
                          {schedule.vehicles.plate_number}
                        </span>
                      </div>
                    )}

                    {schedule.available_seats && (
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-gray-400" />
                        <span className="text-gray-600 dark:text-gray-300">
                          {schedule.available_seats} cupos
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t text-xs text-gray-500">
                    <span>
                      Desde: {new Date(schedule.valid_from).toLocaleDateString('es-CO')}
                    </span>
                    {schedule.valid_until && (
                      <span>
                        Hasta: {new Date(schedule.valid_until).toLocaleDateString('es-CO')}
                      </span>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
