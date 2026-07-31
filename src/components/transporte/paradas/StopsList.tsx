'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { 
  MoreVertical, 
  Edit, 
  Trash2, 
  MapPin,
  Building,
  Bus,
  Users,
  Phone,
  Copy,
  ExternalLink,
} from 'lucide-react';
import { TransportStop } from '@/lib/services/transportService';

interface StopsListProps {
  stops: TransportStop[];
  isLoading?: boolean;
  onEdit: (stop: TransportStop) => void;
  onDelete: (stop: TransportStop) => void;
  onDuplicate: (stop: TransportStop) => void;
  onShowOnMap?: (stop: TransportStop) => void;
}

const stopTypeConfig: Record<string, { icon: React.ComponentType<{ className?: string }>; label: string; color: string }> = {
  terminal: { icon: Building, label: 'Terminal', color: 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400' },
  station: { icon: Bus, label: 'Estación', color: 'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400' },
  warehouse: { icon: Building, label: 'Bodega', color: 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400' },
  stop: { icon: MapPin, label: 'Parada', color: 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400' },
  branch: { icon: Building, label: 'Sucursal', color: 'bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400' },
  customer: { icon: Users, label: 'Cliente', color: 'bg-pink-100 text-pink-600 dark:bg-pink-900/30 dark:text-pink-400' },
};

export function StopsList({ stops, isLoading, onEdit, onDelete, onDuplicate, onShowOnMap }: StopsListProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[...Array(6)].map((_, i) => (
          <Card key={i} className="animate-pulse">
            <CardContent className="p-6">
              <div className="h-32 bg-gray-200 dark:bg-gray-700 rounded" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (stops.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <MapPin className="h-12 w-12 text-gray-400 mb-4" />
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
            No hay paradas
          </h3>
          <p className="text-gray-600 dark:text-gray-400 text-center">
            Crea terminales, estaciones y puntos de parada para tus rutas.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {stops.map((stop) => {
        const config = stopTypeConfig[stop.stop_type] || stopTypeConfig.stop;
        const Icon = config.icon;

        return (
          <Card
            key={stop.id}
            className="hover:shadow-md transition-shadow"
          >
            <CardContent className="p-4">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${config.color}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900 dark:text-white">
                      {stop.name}
                    </h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {stop.code}
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
                    <DropdownMenuItem onClick={() => onEdit(stop)}>
                      <Edit className="h-4 w-4 mr-2" />
                      Editar
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onDuplicate(stop)}>
                      <Copy className="h-4 w-4 mr-2" />
                      Duplicar
                    </DropdownMenuItem>
                    {stop.latitude && stop.longitude && onShowOnMap && (
                      <DropdownMenuItem onClick={() => onShowOnMap(stop)}>
                        <ExternalLink className="h-4 w-4 mr-2" />
                        Ver en mapa
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem
                      onClick={() => onDelete(stop)}
                      className="text-red-600"
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Eliminar
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              <div className="flex flex-wrap gap-2 mb-3">
                <Badge variant="outline">
                  {config.label}
                </Badge>
                <Badge variant={stop.is_active ? 'default' : 'secondary'}>
                  {stop.is_active ? 'Activo' : 'Inactivo'}
                </Badge>
                {stop.branches && (
                  <Badge variant="outline" className="bg-indigo-50 dark:bg-indigo-900/20">
                    {stop.branches.name}
                  </Badge>
                )}
              </div>

              <div className="space-y-1 text-sm text-gray-600 dark:text-gray-400">
                {stop.address && (
                  <p className="flex items-start gap-2">
                    <MapPin className="h-3 w-3 mt-1 flex-shrink-0" />
                    <span className="line-clamp-2">{stop.address}</span>
                  </p>
                )}
                {(stop.city || stop.department) && (
                  <p>
                    {[stop.city, stop.department].filter(Boolean).join(', ')}
                  </p>
                )}
                {stop.contact_name && (
                  <p className="flex items-center gap-2">
                    <Users className="h-3 w-3" />
                    {stop.contact_name}
                  </p>
                )}
                {stop.contact_phone && (
                  <p className="flex items-center gap-2">
                    <Phone className="h-3 w-3" />
                    {stop.contact_phone}
                  </p>
                )}
                {stop.latitude && stop.longitude && (
                  <p className="text-xs text-gray-400">
                    📍 {stop.latitude.toFixed(6)}, {stop.longitude.toFixed(6)}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
