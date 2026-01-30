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
  Route
} from 'lucide-react';

export function QuickActions() {
  const actions = [
    {
      label: 'Nuevo Viaje',
      href: '/app/transporte/viajes/nuevo',
      icon: Bus,
      color: 'bg-blue-600 hover:bg-blue-700',
    },
    {
      label: 'Nuevo Envío',
      href: '/app/transporte/envios/nuevo',
      icon: Package,
      color: 'bg-purple-600 hover:bg-purple-700',
    },
    {
      label: 'Nuevo Manifiesto',
      href: '/app/transporte/manifiestos/nuevo',
      icon: FileText,
      color: 'bg-green-600 hover:bg-green-700',
    },
    {
      label: 'Reportar Incidente',
      href: '/app/transporte/incidentes/nuevo',
      icon: AlertTriangle,
      color: 'bg-red-600 hover:bg-red-700',
    },
  ];

  const links = [
    { label: 'Transportadoras', href: '/app/transporte/transportadoras', icon: Truck },
    { label: 'Vehículos', href: '/app/transporte/vehiculos', icon: Bus },
    { label: 'Conductores', href: '/app/transporte/conductores', icon: Users },
    { label: 'Paradas', href: '/app/transporte/paradas', icon: MapPin },
    { label: 'Rutas', href: '/app/transporte/rutas', icon: Route },
  ];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">Acciones Rápidas</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {actions.map((action) => (
            <Link key={action.label} href={action.href}>
              <Button
                className={`w-full ${action.color} text-white`}
                size="sm"
              >
                <action.icon className="h-4 w-4 mr-1" />
                <span className="text-xs">{action.label}</span>
              </Button>
            </Link>
          ))}
        </div>
        
        <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
            Catálogos
          </p>
          <div className="flex flex-wrap gap-2">
            {links.map((link) => (
              <Link key={link.label} href={link.href}>
                <Button variant="outline" size="sm">
                  <link.icon className="h-4 w-4 mr-1" />
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
