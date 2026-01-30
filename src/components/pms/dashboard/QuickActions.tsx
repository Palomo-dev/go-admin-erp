'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { 
  Plus, 
  CalendarPlus, 
  Ban, 
  Sparkles, 
  Wrench,
  LogIn,
  LogOut,
  LayoutGrid
} from 'lucide-react';
import { useRouter } from 'next/navigation';

interface QuickActionsProps {
  onNewReservation?: () => void;
  onNewBlock?: () => void;
  onNewHousekeeping?: () => void;
  onNewMaintenance?: () => void;
}

export function QuickActions({
  onNewReservation,
  onNewBlock,
  onNewHousekeeping,
  onNewMaintenance,
}: QuickActionsProps) {
  const router = useRouter();

  const actions = [
    {
      label: 'Nueva Reserva',
      icon: CalendarPlus,
      color: 'bg-blue-600 hover:bg-blue-700 text-white',
      onClick: () => onNewReservation?.() || router.push('/app/pms/reservas/nueva'),
    },
    {
      label: 'Nuevo Bloqueo',
      icon: Ban,
      color: 'bg-orange-600 hover:bg-orange-700 text-white',
      onClick: () => onNewBlock?.() || router.push('/app/pms/bloqueos'),
    },
    {
      label: 'Tarea Limpieza',
      icon: Sparkles,
      color: 'bg-yellow-600 hover:bg-yellow-700 text-white',
      onClick: () => onNewHousekeeping?.() || router.push('/app/pms/housekeeping'),
    },
    {
      label: 'Orden Mtto.',
      icon: Wrench,
      color: 'bg-red-600 hover:bg-red-700 text-white',
      onClick: () => onNewMaintenance?.() || router.push('/app/pms/mantenimiento'),
    },
  ];

  const quickLinks = [
    {
      label: 'Check-in',
      icon: LogIn,
      href: '/app/pms/checkin',
      color: 'text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-950',
    },
    {
      label: 'Check-out',
      icon: LogOut,
      href: '/app/pms/checkout',
      color: 'text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950',
    },
    {
      label: 'Espacios',
      icon: LayoutGrid,
      href: '/app/pms/espacios',
      color: 'text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-950',
    },
  ];

  return (
    <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-white">
          <Plus className="h-5 w-5 text-blue-600" />
          Acciones Rápidas
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-2">
          {actions.map((action) => {
            const Icon = action.icon;
            return (
              <Button
                key={action.label}
                size="sm"
                className={action.color}
                onClick={action.onClick}
              >
                <Icon className="h-4 w-4 mr-2" />
                {action.label}
              </Button>
            );
          })}
        </div>

        <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
            Acceso rápido
          </p>
          <div className="flex gap-2">
            {quickLinks.map((link) => {
              const Icon = link.icon;
              return (
                <Button
                  key={link.label}
                  variant="ghost"
                  size="sm"
                  className={link.color}
                  onClick={() => router.push(link.href)}
                >
                  <Icon className="h-4 w-4 mr-1" />
                  {link.label}
                </Button>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
