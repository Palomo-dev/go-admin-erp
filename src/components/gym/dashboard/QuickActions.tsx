'use client';

import React from 'react';
import Link from 'next/link';
import { LogIn, Users, CreditCard, Calendar, FileText, Settings } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/utils/Utils';

export function QuickActions() {
  const actions = [
    {
      title: 'Check-in Rápido',
      description: 'Control de acceso',
      icon: LogIn,
      href: '/app/gym/checkin',
      color: 'text-green-600 dark:text-green-400',
      bgColor: 'bg-green-100 dark:bg-green-900/30',
      primary: true
    },
    {
      title: 'Membresías',
      description: 'Gestión de miembros',
      icon: Users,
      href: '/app/gym/membresias',
      color: 'text-blue-600 dark:text-blue-400',
      bgColor: 'bg-blue-100 dark:bg-blue-900/30'
    },
    {
      title: 'Planes',
      description: 'Configurar planes',
      icon: CreditCard,
      href: '/app/gym/planes',
      color: 'text-purple-600 dark:text-purple-400',
      bgColor: 'bg-purple-100 dark:bg-purple-900/30'
    },
    {
      title: 'Clases',
      description: 'Horarios y reservas',
      icon: Calendar,
      href: '/app/gym/clases',
      color: 'text-orange-600 dark:text-orange-400',
      bgColor: 'bg-orange-100 dark:bg-orange-900/30'
    },
    {
      title: 'Reportes',
      description: 'Análisis y métricas',
      icon: FileText,
      href: '/app/gym/reportes',
      color: 'text-teal-600 dark:text-teal-400',
      bgColor: 'bg-teal-100 dark:bg-teal-900/30'
    },
    {
      title: 'Configuración',
      description: 'Ajustes del módulo',
      icon: Settings,
      href: '/app/gym/ajustes',
      color: 'text-gray-600 dark:text-gray-400',
      bgColor: 'bg-gray-100 dark:bg-gray-700'
    }
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
      {actions.map((action, index) => {
        const Icon = action.icon;
        return (
          <Link key={index} href={action.href}>
            <Card className={cn(
              "h-full transition-all hover:shadow-md cursor-pointer",
              "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700",
              action.primary && "ring-2 ring-green-500 dark:ring-green-400"
            )}>
              <CardContent className="p-4 text-center">
                <div className={cn("p-3 rounded-lg w-fit mx-auto mb-3", action.bgColor)}>
                  <Icon className={cn("h-6 w-6", action.color)} />
                </div>
                <p className="font-medium text-gray-900 dark:text-white text-sm">
                  {action.title}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {action.description}
                </p>
              </CardContent>
            </Card>
          </Link>
        );
      })}
    </div>
  );
}

export default QuickActions;
