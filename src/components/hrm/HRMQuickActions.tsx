'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/utils/Utils';
import {
  UserPlus,
  CalendarPlus,
  Upload,
  Calculator,
  Zap,
} from 'lucide-react';
import Link from 'next/link';

interface QuickAction {
  title: string;
  description: string;
  icon: React.ReactNode;
  href: string;
  color: string;
  bgColor: string;
  darkBgColor: string;
}

export function HRMQuickActions() {
  const actions: QuickAction[] = [
    {
      title: 'Nuevo Empleado',
      description: 'Registrar un nuevo empleado',
      icon: <UserPlus className="h-5 w-5" />,
      href: '/app/hrm/empleados/nuevo',
      color: 'text-blue-600 dark:text-blue-400',
      bgColor: 'bg-blue-100',
      darkBgColor: 'dark:bg-blue-900/30',
    },
    {
      title: 'Nuevo Turno',
      description: 'Asignar turno a empleado',
      icon: <CalendarPlus className="h-5 w-5" />,
      href: '/app/hrm/turnos/nuevo',
      color: 'text-green-600 dark:text-green-400',
      bgColor: 'bg-green-100',
      darkBgColor: 'dark:bg-green-900/30',
    },
    {
      title: 'Importar Empleados',
      description: 'Carga masiva desde Excel',
      icon: <Upload className="h-5 w-5" />,
      href: '/app/hrm/empleados/importar',
      color: 'text-purple-600 dark:text-purple-400',
      bgColor: 'bg-purple-100',
      darkBgColor: 'dark:bg-purple-900/30',
    },
    {
      title: 'Calcular Nómina',
      description: 'Ejecutar cálculo de nómina',
      icon: <Calculator className="h-5 w-5" />,
      href: '/app/hrm/nomina',
      color: 'text-orange-600 dark:text-orange-400',
      bgColor: 'bg-orange-100',
      darkBgColor: 'dark:bg-orange-900/30',
    },
  ];

  return (
    <Card className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-gray-900 dark:text-white">
          <Zap className="h-5 w-5 text-blue-600" />
          Accesos Rápidos
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3">
          {actions.map((action, index) => (
            <Link key={index} href={action.href}>
              <div
                className={cn(
                  'flex items-center gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700',
                  'hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors cursor-pointer'
                )}
              >
                <div
                  className={cn(
                    'h-10 w-10 rounded-lg flex items-center justify-center shrink-0',
                    action.bgColor,
                    action.darkBgColor
                  )}
                >
                  <span className={action.color}>{action.icon}</span>
                </div>
                <div className="min-w-0">
                  <p className="font-medium text-gray-900 dark:text-white text-sm truncate">
                    {action.title}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                    {action.description}
                  </p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export default HRMQuickActions;
