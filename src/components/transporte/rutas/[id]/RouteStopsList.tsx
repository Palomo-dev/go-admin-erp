'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Plus,
  MoreVertical,
  Edit,
  Trash2,
  GripVertical,
  MapPin,
  Clock,
  ArrowDown,
  ArrowUp,
  DollarSign,
  LogIn,
  LogOut,
} from 'lucide-react';
import { RouteStop } from '@/lib/services/transportRoutesService';

interface RouteStopsListProps {
  stops: RouteStop[];
  onAddStop: () => void;
  onEditStop: (stop: RouteStop) => void;
  onDeleteStop: (stop: RouteStop) => void;
  onReorder: (stops: { id: string; stop_order: number }[]) => void;
}

export function RouteStopsList({
  stops,
  onAddStop,
  onEditStop,
  onDeleteStop,
  onReorder,
}: RouteStopsListProps) {
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;

    const newStops = [...stops];
    const draggedStop = newStops[draggedIndex];
    newStops.splice(draggedIndex, 1);
    newStops.splice(index, 0, draggedStop);

    const reorderedStops = newStops.map((stop, i) => ({
      id: stop.id,
      stop_order: i + 1,
    }));
    
    onReorder(reorderedStops);
    setDraggedIndex(index);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
  };

  const moveStop = (index: number, direction: 'up' | 'down') => {
    if (
      (direction === 'up' && index === 0) ||
      (direction === 'down' && index === stops.length - 1)
    ) {
      return;
    }

    const newStops = [...stops];
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    [newStops[index], newStops[newIndex]] = [newStops[newIndex], newStops[index]];

    const reorderedStops = newStops.map((stop, i) => ({
      id: stop.id,
      stop_order: i + 1,
    }));
    
    onReorder(reorderedStops);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-lg flex items-center gap-2">
          <MapPin className="h-5 w-5 text-blue-600" />
          Paradas de la Ruta ({stops.length})
        </CardTitle>
        <Button size="sm" onClick={onAddStop} className="bg-blue-600 hover:bg-blue-700">
          <Plus className="h-4 w-4 mr-2" />
          Agregar Parada
        </Button>
      </CardHeader>
      <CardContent>
        {stops.length === 0 ? (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            <MapPin className="h-10 w-10 mx-auto mb-3 opacity-50" />
            <p>No hay paradas definidas</p>
            <p className="text-sm">Agrega paradas para definir el recorrido</p>
          </div>
        ) : (
          <div className="space-y-3">
            {stops.map((stop, index) => (
              <div
                key={stop.id}
                draggable
                onDragStart={() => handleDragStart(index)}
                onDragOver={(e) => handleDragOver(e, index)}
                onDragEnd={handleDragEnd}
                className={`flex items-center gap-3 p-3 border rounded-lg bg-white dark:bg-gray-800 hover:shadow-sm transition-shadow ${
                  draggedIndex === index ? 'opacity-50' : ''
                }`}
              >
                <div className="cursor-grab active:cursor-grabbing">
                  <GripVertical className="h-5 w-5 text-gray-400" />
                </div>

                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 font-semibold text-sm">
                  {stop.stop_order}
                </div>

                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 dark:text-white truncate">
                    {stop.transport_stops?.name}
                  </p>
                  <p className="text-sm text-gray-500 truncate">
                    {stop.transport_stops?.city}
                    {stop.transport_stops?.address && ` • ${stop.transport_stops.address}`}
                  </p>
                </div>

                <div className="flex items-center gap-4 text-sm text-gray-500">
                  {stop.estimated_arrival_minutes !== undefined && (
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      +{stop.estimated_arrival_minutes} min
                    </span>
                  )}
                  {stop.fare_from_origin !== undefined && stop.fare_from_origin > 0 && (
                    <span className="flex items-center gap-1">
                      <DollarSign className="h-3 w-3" />
                      ${stop.fare_from_origin.toLocaleString()}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1">
                  {stop.is_boarding_allowed && (
                    <Badge variant="outline" className="text-xs">
                      <LogIn className="h-3 w-3 mr-1" />
                      Aborda
                    </Badge>
                  )}
                  {stop.is_alighting_allowed && (
                    <Badge variant="outline" className="text-xs">
                      <LogOut className="h-3 w-3 mr-1" />
                      Desciende
                    </Badge>
                  )}
                </div>

                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => moveStop(index, 'up')}
                    disabled={index === 0}
                  >
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => moveStop(index, 'down')}
                    disabled={index === stops.length - 1}
                  >
                    <ArrowDown className="h-4 w-4" />
                  </Button>
                </div>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => onEditStop(stop)}>
                      <Edit className="h-4 w-4 mr-2" />
                      Editar
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onDeleteStop(stop)} className="text-red-600">
                      <Trash2 className="h-4 w-4 mr-2" />
                      Eliminar
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
