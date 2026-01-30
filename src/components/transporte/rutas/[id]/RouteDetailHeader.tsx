'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Route, Edit, Copy, RefreshCw, Users, Package } from 'lucide-react';
import { TransportRoute } from '@/lib/services/transportRoutesService';

interface RouteDetailHeaderProps {
  route: TransportRoute;
  onRefresh: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  isLoading?: boolean;
}

export function RouteDetailHeader({
  route,
  onRefresh,
  onEdit,
  onDuplicate,
  isLoading,
}: RouteDetailHeaderProps) {
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

  const typeConfig = getRouteTypeConfig(route.route_type);
  const TypeIcon = typeConfig.icon;

  return (
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <Link href="/app/transporte/rutas">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-xl">
              <Route className="h-6 w-6 text-blue-600" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              {route.name}
            </h1>
            <Badge className={typeConfig.color}>
              <TypeIcon className="h-3 w-3 mr-1" />
              {typeConfig.label}
            </Badge>
            {!route.is_active && (
              <Badge variant="secondary">Inactiva</Badge>
            )}
          </div>
          <p className="text-gray-500 dark:text-gray-400">
            Código: {route.code} • {route.origin_stop?.name} → {route.destination_stop?.name}
          </p>
        </div>
      </div>
      
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="icon"
          onClick={onRefresh}
          disabled={isLoading}
        >
          <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
        </Button>
        <Button variant="outline" onClick={onDuplicate}>
          <Copy className="h-4 w-4 mr-2" />
          Duplicar
        </Button>
        <Button onClick={onEdit} className="bg-blue-600 hover:bg-blue-700">
          <Edit className="h-4 w-4 mr-2" />
          Editar
        </Button>
      </div>
    </div>
  );
}
