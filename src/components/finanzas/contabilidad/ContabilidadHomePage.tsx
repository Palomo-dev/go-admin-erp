'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { BookOpen, FileText, Calculator, Calendar, Settings, ArrowRight, Loader2, BarChart3, TrendingUp, Shield, LayoutGrid, Package, Target, CalendarClock } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ContabilidadService, ContabilidadResumen } from './ContabilidadService';
import { formatNumber } from '@/utils/Utils';

const MODULES = [
  {
    title: 'Plan de Cuentas',
    description: 'Gestión del catálogo contable',
    icon: BookOpen,
    href: '/app/finanzas/contabilidad/plan-cuentas',
    color: 'blue'
  },
  {
    title: 'Asientos Contables',
    description: 'Registro y gestión de asientos',
    icon: FileText,
    href: '/app/finanzas/contabilidad/asientos',
    color: 'green'
  },
  {
    title: 'Balance de Comprobación',
    description: 'Reporte de saldos por cuenta',
    icon: BarChart3,
    href: '/app/finanzas/contabilidad/balance-comprobacion',
    color: 'blue'
  },
  {
    title: 'Estado de Resultados',
    description: 'P&G: ingresos, costos y gastos',
    icon: TrendingUp,
    href: '/app/finanzas/contabilidad/estado-resultados',
    color: 'green'
  },
  {
    title: 'Balance General',
    description: 'Estado de situación financiera',
    icon: Calculator,
    href: '/app/finanzas/contabilidad/balance-general',
    color: 'purple'
  },
  {
    title: 'Mayor Contable',
    description: 'Libro mayor por cuenta',
    icon: BookOpen,
    href: '/app/finanzas/contabilidad/mayor-contable',
    color: 'blue'
  },
  {
    title: 'Reglas Contables',
    description: 'Asientos automáticos por evento',
    icon: Shield,
    href: '/app/finanzas/reglas-contables',
    color: 'orange'
  },
  {
    title: 'Períodos Fiscales',
    description: 'Apertura y cierre de períodos',
    icon: CalendarClock,
    href: '/app/finanzas/contabilidad/periodos-fiscales',
    color: 'purple'
  },
  {
    title: 'Centro de Costos',
    description: 'Gestión de centros de costo',
    icon: LayoutGrid,
    href: '/app/finanzas/centro-costos',
    color: 'orange'
  },
  {
    title: 'Activos Fijos',
    description: 'Registro y depreciación de activos',
    icon: Package,
    href: '/app/finanzas/activos-fijos',
    color: 'green'
  },
  {
    title: 'Presupuestos',
    description: 'Planificación y control presupuestal',
    icon: Target,
    href: '/app/finanzas/presupuestos',
    color: 'blue'
  }
];

export function ContabilidadHomePage() {
  const [resumen, setResumen] = useState<ContabilidadResumen | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadResumen();
  }, []);

  const loadResumen = async () => {
    try {
      setIsLoading(true);
      const data = await ContabilidadService.obtenerResumen();
      setResumen(data);
    } catch (error) {
      console.error('Error cargando resumen:', error);
      toast.error('Error al cargar el resumen');
    } finally {
      setIsLoading(false);
    }
  };

  const getColorClasses = (color: string) => {
    const colors: Record<string, { bg: string; icon: string; hover: string }> = {
      blue: { 
        bg: 'bg-blue-100 dark:bg-blue-900/30', 
        icon: 'text-blue-600 dark:text-blue-400',
        hover: 'hover:border-blue-300 dark:hover:border-blue-700'
      },
      green: { 
        bg: 'bg-green-100 dark:bg-green-900/30', 
        icon: 'text-green-600 dark:text-green-400',
        hover: 'hover:border-green-300 dark:hover:border-green-700'
      },
      purple: { 
        bg: 'bg-purple-100 dark:bg-purple-900/30', 
        icon: 'text-purple-600 dark:text-purple-400',
        hover: 'hover:border-purple-300 dark:hover:border-purple-700'
      },
      orange: { 
        bg: 'bg-orange-100 dark:bg-orange-900/30', 
        icon: 'text-orange-600 dark:text-orange-400',
        hover: 'hover:border-orange-300 dark:hover:border-orange-700'
      },
      red: {
        bg: 'bg-red-100 dark:bg-red-900/30',
        icon: 'text-red-600 dark:text-red-400',
        hover: 'hover:border-red-300 dark:hover:border-red-700'
      }
    };
    return colors[color] || colors.blue;
  };

  return (
    <div className="p-6 space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-xl">
          <Calculator className="h-6 w-6 text-blue-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Contabilidad
          </h1>
          <p className="text-gray-500 dark:text-gray-400">
            Gestión contable y financiera
          </p>
        </div>
      </div>

      {/* Resumen */}
      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        </div>
      ) : resumen && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="dark:bg-gray-800 dark:border-gray-700">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">
                Total Asientos
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-gray-900 dark:text-white">
                {formatNumber(resumen.totalAsientos)}
              </div>
            </CardContent>
          </Card>
          <Card className="dark:bg-gray-800 dark:border-gray-700">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">
                Asientos Publicados
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                {formatNumber(resumen.asientosPosted)}
              </div>
            </CardContent>
          </Card>
          <Card className="dark:bg-gray-800 dark:border-gray-700">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">
                Cuentas Contables
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                {formatNumber(resumen.totalCuentas)}
              </div>
            </CardContent>
          </Card>
          <Card className="dark:bg-gray-800 dark:border-gray-700">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">
                Periodos Abiertos
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                {formatNumber(resumen.periodosAbiertos)}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Módulos */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Módulos de Contabilidad
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {MODULES.map((module) => {
            const colors = getColorClasses(module.color);
            return (
              <Link key={module.href} href={module.href}>
                <Card className={`cursor-pointer transition-all dark:bg-gray-800 dark:border-gray-700 ${colors.hover}`}>
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-4">
                        <div className={`p-3 rounded-xl ${colors.bg}`}>
                          <module.icon className={`h-6 w-6 ${colors.icon}`} />
                        </div>
                        <div>
                          <h3 className="font-semibold text-gray-900 dark:text-white">
                            {module.title}
                          </h3>
                          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                            {module.description}
                          </p>
                        </div>
                      </div>
                      <ArrowRight className="h-5 w-5 text-gray-400" />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Acciones Rápidas */}
      <Card className="dark:bg-gray-800 dark:border-gray-700">
        <CardHeader>
          <CardTitle className="text-gray-900 dark:text-white">Acciones Rápidas</CardTitle>
          <CardDescription className="dark:text-gray-400">
            Accesos directos a operaciones comunes
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            <Link href="/app/finanzas/contabilidad/asientos?action=new">
              <Button className="bg-blue-600 hover:bg-blue-700">
                <FileText className="h-4 w-4 mr-2" />
                Nuevo Asiento
              </Button>
            </Link>
            <Link href="/app/finanzas/contabilidad/plan-cuentas?action=new">
              <Button variant="outline" className="dark:border-gray-600 dark:hover:bg-gray-700">
                <BookOpen className="h-4 w-4 mr-2" />
                Nueva Cuenta
              </Button>
            </Link>
            <Link href="/app/finanzas/contabilidad/periodos-fiscales">
              <Button variant="outline" className="dark:border-gray-600 dark:hover:bg-gray-700">
                <CalendarClock className="h-4 w-4 mr-2" />
                Ver Períodos
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
