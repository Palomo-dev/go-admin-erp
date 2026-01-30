'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
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
  Eye,
  Power,
  MapPin,
  Clock,
  Users,
  Package,
  Route,
  Calendar,
} from 'lucide-react';
import { TransportRoute } from '@/lib/services/transportRoutesService';

interface RoutesListProps {
  routes: TransportRoute[];
  isLoading: boolean;
  onEdit: (route: TransportRoute) => void;
  onDelete: (route: TransportRoute) => void;
  onDuplicate: (route: TransportRoute) => void;
  onToggleStatus: (route: TransportRoute) => void;
  onViewSchedules: (route: TransportRoute) => void;
}

export function RoutesList({
  routes,
  isLoading,
  onEdit,
  onDelete,
  onDuplicate,
  onToggleStatus,
  onViewSchedules,
}: RoutesListProps) {
  const router = useRouter();
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');

  const filteredRoutes = routes.filter((route) => {
    const matchesSearch =
      route.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      route.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      route.origin_stop?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      route.destination_stop?.name?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = typeFilter === 'all' || route.route_type === typeFilter;
    return matchesSearch && matchesType;
  });

  const getRouteTypeConfig = (type: string) => {
    switch (type) {
      case 'passenger':
        return { label: 'Pasajeros', icon: Users, color: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300' };
      case 'cargo':
        return { label: 'Carga', icon: Package, color: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300' };
      case 'mixed':
        return { label: 'Mixto', icon: Route, color: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300' };
      default:
        return { label: type, icon: Route, color: 'bg-gray-100 text-gray-800' };
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex gap-4">
          <Skeleton className="h-10 w-full max-w-sm" />
          <Skeleton className="h-10 w-40" />
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-52" />
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
            placeholder="Buscar por nombre, código, origen, destino..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Tipo de ruta" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los tipos</SelectItem>
            <SelectItem value="passenger">Pasajeros</SelectItem>
            <SelectItem value="cargo">Carga</SelectItem>
            <SelectItem value="mixed">Mixto</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-sm text-gray-500 dark:text-gray-400 self-center">
          {filteredRoutes.length} rutas
        </span>
      </div>

      {filteredRoutes.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Route className="h-12 w-12 mx-auto text-gray-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-white">
              No hay rutas
            </h3>
            <p className="text-gray-500 dark:text-gray-400 mt-1">
              {searchTerm || typeFilter !== 'all' ? 'No se encontraron resultados' : 'Crea la primera ruta de transporte'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredRoutes.map((route) => {
            const typeConfig = getRouteTypeConfig(route.route_type);
            const TypeIcon = typeConfig.icon;

            return (
              <Card 
                key={route.id} 
                className={`hover:shadow-md transition-shadow cursor-pointer ${!route.is_active ? 'opacity-60' : ''}`}
                onClick={() => router.push(`/app/transporte/rutas/${route.id}`)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Badge className={typeConfig.color}>
                        <TypeIcon className="h-3 w-3 mr-1" />
                        {typeConfig.label}
                      </Badge>
                      {!route.is_active && (
                        <Badge variant="secondary">Inactiva</Badge>
                      )}
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); router.push(`/app/transporte/rutas/${route.id}`); }}>
                          <Eye className="h-4 w-4 mr-2" />
                          Ver detalles
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onEdit(route); }}>
                          <Edit className="h-4 w-4 mr-2" />
                          Editar
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onDuplicate(route); }}>
                          <Copy className="h-4 w-4 mr-2" />
                          Duplicar
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onViewSchedules(route); }}>
                          <Calendar className="h-4 w-4 mr-2" />
                          Ver horarios
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onToggleStatus(route); }}>
                          <Power className="h-4 w-4 mr-2" />
                          {route.is_active ? 'Desactivar' : 'Activar'}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={(e) => { e.stopPropagation(); onDelete(route); }}
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
                      <p className="font-semibold text-gray-900 dark:text-white">{route.name}</p>
                      <p className="text-sm text-gray-500">{route.code}</p>
                    </div>

                    <div className="space-y-2 text-sm">
                      <div className="flex items-center gap-2">
                        <MapPin className="h-4 w-4 text-green-500" />
                        <span className="text-gray-600 dark:text-gray-300">
                          {route.origin_stop?.name || 'Sin origen'} → {route.destination_stop?.name || 'Sin destino'}
                        </span>
                      </div>

                      <div className="flex items-center gap-4">
                        {route.estimated_distance_km && (
                          <span className="text-gray-500">
                            {route.estimated_distance_km.toFixed(1)} km
                          </span>
                        )}
                        {route.estimated_duration_minutes && (
                          <span className="flex items-center gap-1 text-gray-500">
                            <Clock className="h-3 w-3" />
                            {Math.floor(route.estimated_duration_minutes / 60)}h {route.estimated_duration_minutes % 60}m
                          </span>
                        )}
                      </div>

                      <div className="flex items-center justify-between pt-2 border-t">
                        <span className="text-xs text-gray-500">
                          {route._count?.route_stops || 0} paradas
                        </span>
                        {route.base_fare && route.base_fare > 0 && (
                          <span className="text-sm font-medium text-blue-600">
                            ${route.base_fare.toLocaleString()}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
