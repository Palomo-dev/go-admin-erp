'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Clock,
  ArrowLeft,
  RefreshCw,
  ClipboardList,
  FileEdit,
  ChevronRight,
  Users,
  Calendar,
  CheckCircle,
  AlertCircle,
} from 'lucide-react';

export default function AsistenciaPage() {
  const { organization, isLoading: orgLoading } = useOrganization();
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (organization?.id && !orgLoading) {
      setIsLoading(false);
    }
  }, [organization?.id, orgLoading]);

  if (orgLoading || isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  const modules = [
    {
      title: 'Turno vs Asistencia',
      description: 'Comparar turnos programados con asistencia real',
      href: '/app/hrm/asistencia/comparacion',
      icon: <Calendar className="h-6 w-6" />,
      color: 'text-green-600',
      bgColor: 'bg-green-100 dark:bg-green-900/30',
    },
    {
      title: 'Timesheets',
      description: 'Ver y gestionar hojas de tiempo de empleados',
      href: '/app/hrm/asistencia/timesheets',
      icon: <ClipboardList className="h-6 w-6" />,
      color: 'text-blue-600',
      bgColor: 'bg-blue-100 dark:bg-blue-900/30',
    },
    {
      title: 'Ajustes',
      description: 'Gestionar ajustes de horas trabajadas',
      href: '/app/hrm/asistencia/ajustes',
      icon: <FileEdit className="h-6 w-6" />,
      color: 'text-orange-600',
      bgColor: 'bg-orange-100 dark:bg-orange-900/30',
    },
  ];

  return (
    <div className="p-6 space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href="/app/hrm">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <Clock className="h-7 w-7 text-blue-600" />
              Control de Asistencia
            </h1>
            <p className="text-gray-500 dark:text-gray-400">
              HRM / Asistencia y Control de Tiempo
            </p>
          </div>
        </div>
        <Button variant="outline" size="icon">
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Empleados Activos</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">0</p>
              </div>
              <div className="h-10 w-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                <Users className="h-5 w-5 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Turnos Hoy</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">0</p>
              </div>
              <div className="h-10 w-10 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <Calendar className="h-5 w-5 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Presentes</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">0</p>
              </div>
              <div className="h-10 w-10 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                <CheckCircle className="h-5 w-5 text-emerald-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Ajustes Pendientes</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">0</p>
              </div>
              <div className="h-10 w-10 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
                <AlertCircle className="h-5 w-5 text-orange-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Modules Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {modules.map((module) => (
          <Link key={module.href} href={module.href}>
            <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:shadow-lg transition-shadow cursor-pointer h-full">
              <CardContent className="pt-6">
                <div className="flex items-start gap-4">
                  <div className={`h-12 w-12 rounded-lg ${module.bgColor} flex items-center justify-center shrink-0`}>
                    <span className={module.color}>{module.icon}</span>
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold text-gray-900 dark:text-white">
                        {module.title}
                      </h3>
                      <ChevronRight className="h-5 w-5 text-gray-400" />
                    </div>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                      {module.description}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* Quick Links */}
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardHeader>
          <CardTitle className="text-gray-900 dark:text-white">Navegación Rápida</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            <Link href="/app/hrm">
              <Button variant="outline" size="sm">← Volver a HRM</Button>
            </Link>
            <Link href="/app/hrm/turnos">
              <Button variant="outline" size="sm">Turnos</Button>
            </Link>
            <Link href="/app/hrm/ausencias">
              <Button variant="outline" size="sm">Ausencias</Button>
            </Link>
            <Link href="/app/hrm/marcacion">
              <Button variant="outline" size="sm">Marcación</Button>
            </Link>
            <Link href="/app/hrm/reportes">
              <Button variant="outline" size="sm">Reportes</Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
