'use client';

import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { 
  Plus, 
  Bus, 
  Package, 
  FileText, 
  MapPin, 
  AlertTriangle,
  Truck,
  Users,
  Route,
  Calendar,
  Ticket,
  ClipboardList,
  Navigation
} from 'lucide-react';

export function DashboardQuickActions() {
  const primaryActions = [
    {
      label: 'Nuevo Viaje',
      href: '/app/transporte/viajes/nuevo',
      icon: Bus,
      color: 'bg-blue-600 hover:bg-blue-700',
      description: 'Programar un nuevo viaje',
    },
    {
      label: 'Nuevo Envío',
      href: '/app/transporte/envios/nuevo',
      icon: Package,
      color: 'bg-purple-600 hover:bg-purple-700',
      description: 'Crear un nuevo envío',
    },
    {
      label: 'Nuevo Manifiesto',
      href: '/app/transporte/manifiestos/nuevo',
      icon: FileText,
      color: 'bg-green-600 hover:bg-green-700',
      description: 'Crear manifiesto de carga',
    },
    {
      label: 'Registrar Evento',
      href: '/app/transporte/eventos/nuevo',
      icon: Navigation,
      color: 'bg-cyan-600 hover:bg-cyan-700',
      description: 'Registrar evento de tracking',
    },
    {
      label: 'Reportar Incidente',
      href: '/app/transporte/incidentes/nuevo',
      icon: AlertTriangle,
      color: 'bg-red-600 hover:bg-red-700',
      description: 'Reportar un incidente',
    },
  ];

  const catalogLinks = [
    { label: 'Transportadoras', href: '/app/transporte/transportadoras', icon: Truck },
    { label: 'Vehículos', href: '/app/transporte/vehiculos', icon: Bus },
    { label: 'Conductores', href: '/app/transporte/conductores', icon: Users },
    { label: 'Paradas', href: '/app/transporte/paradas', icon: MapPin },
    { label: 'Rutas', href: '/app/transporte/rutas', icon: Route },
    { label: 'Horarios', href: '/app/transporte/horarios', icon: Calendar },
  ];

  const operationLinks = [
    { label: 'Viajes', href: '/app/transporte/viajes', icon: Bus },
    { label: 'Boletos', href: '/app/transporte/boletos', icon: Ticket },
    { label: 'Envíos', href: '/app/transporte/envios', icon: Package },
    { label: 'Tracking', href: '/app/transporte/tracking', icon: Navigation },
    { label: 'Etiquetas', href: '/app/transporte/etiquetas', icon: ClipboardList },
    { label: 'Incidentes', href: '/app/transporte/incidentes', icon: AlertTriangle },
  ];

  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Plus className="h-5 w-5 text-blue-600" />
          Acciones Rápidas
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Acciones principales */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
          {primaryActions.map((action) => (
            <Link key={action.label} href={action.href}>
              <Button
                className={`w-full h-auto py-3 flex flex-col items-center gap-1 ${action.color} text-white`}
                size="sm"
              >
                <action.icon className="h-5 w-5" />
                <span className="text-xs font-medium text-center leading-tight">
                  {action.label}
                </span>
              </Button>
            </Link>
          ))}
        </div>
        
        {/* Separador con título */}
        <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
            Catálogos
          </p>
          <div className="flex flex-wrap gap-2">
            {catalogLinks.map((link) => (
              <Link key={link.label} href={link.href}>
                <Button 
                  variant="outline" 
                  size="sm"
                  className="h-8 text-xs"
                >
                  <link.icon className="h-3.5 w-3.5 mr-1" />
                  {link.label}
                </Button>
              </Link>
            ))}
          </div>
        </div>

        {/* Operaciones */}
        <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
            Operaciones
          </p>
          <div className="flex flex-wrap gap-2">
            {operationLinks.map((link) => (
              <Link key={link.label} href={link.href}>
                <Button 
                  variant="outline" 
                  size="sm"
                  className="h-8 text-xs"
                >
                  <link.icon className="h-3.5 w-3.5 mr-1" />
                  {link.label}
                </Button>
              </Link>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
