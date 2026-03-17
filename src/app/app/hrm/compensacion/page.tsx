'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  ArrowLeft,
  Package,
  Users,
  DollarSign,
  ArrowRight,
  TrendingUp,
  Award,
} from 'lucide-react';

const modules = [
  {
    title: 'Paquetes de Compensación',
    description: 'Crea y gestiona paquetes salariales con beneficios, bonos y deducciones predefinidas.',
    href: '/app/hrm/compensacion/paquetes',
    icon: Package,
    color: 'blue',
    features: ['Salarios base', 'Beneficios', 'Bonos', 'Deducciones'],
  },
  {
    title: 'Asignaciones',
    description: 'Asigna paquetes de compensación a empleados y gestiona sus compensaciones individuales.',
    href: '/app/hrm/compensacion/asignaciones',
    icon: Users,
    color: 'green',
    features: ['Asignar paquetes', 'Historial', 'Ajustes individuales', 'Reportes'],
  },
];

const stats = [
  {
    label: 'Gestión Centralizada',
    description: 'Administra todos los aspectos de compensación desde un solo lugar',
    icon: DollarSign,
  },
  {
    label: 'Escalabilidad',
    description: 'Crea paquetes reutilizables para múltiples empleados',
    icon: TrendingUp,
  },
  {
    label: 'Transparencia',
    description: 'Mantén un registro claro de todas las compensaciones',
    icon: Award,
  },
];

export default function CompensacionPage() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-3">
              <Link href="/app/hrm">
                <Button variant="ghost" size="icon" className="h-10 w-10">
                  <ArrowLeft className="h-5 w-5" />
                </Button>
              </Link>
              <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
                <DollarSign className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">
                  Compensación
                </h1>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Gestión de paquetes salariales y asignaciones
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Intro Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {stats.map((stat) => (
            <Card key={stat.label} className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30 shrink-0">
                    <stat.icon className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900 dark:text-white">
                      {stat.label}
                    </h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                      {stat.description}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Module Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {modules.map((module) => {
            const IconComponent = module.icon;
            const colorMap: Record<string, { bg: string; text: string; border: string }> = {
              blue: {
                bg: 'bg-blue-100 dark:bg-blue-900/30',
                text: 'text-blue-600 dark:text-blue-400',
                border: 'hover:border-blue-300 dark:hover:border-blue-700',
              },
              green: {
                bg: 'bg-green-100 dark:bg-green-900/30',
                text: 'text-green-600 dark:text-green-400',
                border: 'hover:border-green-300 dark:hover:border-green-700',
              },
            };
            const colorClasses = colorMap[module.color] || colorMap.blue;

            return (
              <Link key={module.href} href={module.href}>
                <Card className={`bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 transition-all cursor-pointer hover:shadow-lg ${colorClasses.border}`}>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className={`p-3 rounded-xl ${colorClasses.bg}`}>
                        <IconComponent className={`h-6 w-6 ${colorClasses.text}`} />
                      </div>
                      <ArrowRight className="h-5 w-5 text-gray-400 dark:text-gray-500" />
                    </div>
                    <CardTitle className="text-lg text-gray-900 dark:text-white mt-3">
                      {module.title}
                    </CardTitle>
                    <CardDescription className="text-gray-500 dark:text-gray-400">
                      {module.description}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="flex flex-wrap gap-2">
                      {module.features.map((feature) => (
                        <span
                          key={feature}
                          className="px-2.5 py-1 text-xs font-medium rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300"
                        >
                          {feature}
                        </span>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>

        {/* Quick Actions */}
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardHeader>
            <CardTitle className="text-lg text-gray-900 dark:text-white">
              Acciones Rápidas
            </CardTitle>
            <CardDescription className="text-gray-500 dark:text-gray-400">
              Accede directamente a las funciones más utilizadas
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              <Link href="/app/hrm/compensacion/paquetes">
                <Button variant="outline" size="sm">
                  <Package className="h-4 w-4 mr-2" />
                  Ver Paquetes
                </Button>
              </Link>
              <Link href="/app/hrm/compensacion/asignaciones">
                <Button variant="outline" size="sm">
                  <Users className="h-4 w-4 mr-2" />
                  Ver Asignaciones
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
