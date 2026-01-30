'use client';

import { useState, useEffect } from 'react';
import { useOrganization } from '@/lib/hooks/useOrganization';
import HRMDashboardService from '@/lib/services/hrmDashboardService';
import {
  HRMKPICards,
  HRMAlerts,
  HRMQuickActions,
  HRMPayrollStatus,
} from '@/components/hrm';
import type {
  HRMKPIs,
  HRMAlert,
  PayrollPeriodInfo,
  PayrollRunInfo,
} from '@/components/hrm';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Users,
  RefreshCw,
  Building2,
  ChevronRight,
} from 'lucide-react';
import Link from 'next/link';

interface DepartmentSummary {
  id: string;
  name: string;
  employeeCount: number;
}

export default function HrmPage() {
  const { organization, isLoading: orgLoading } = useOrganization();
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Estados para datos del dashboard
  const [kpis, setKpis] = useState<HRMKPIs>({
    activeEmployees: 0,
    absencesToday: 0,
    shiftsToday: 0,
    pendingTimesheets: 0,
    payrollInProcess: 0,
    activeLoans: 0,
  });
  const [alerts, setAlerts] = useState<HRMAlert[]>([]);
  const [currentPeriod, setCurrentPeriod] = useState<PayrollPeriodInfo | null>(null);
  const [recentRuns, setRecentRuns] = useState<PayrollRunInfo[]>([]);
  const [departments, setDepartments] = useState<DepartmentSummary[]>([]);

  const loadDashboardData = async (showRefreshing = false) => {
    if (!organization?.id) return;

    if (showRefreshing) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }

    try {
      const service = new HRMDashboardService(organization.id);

      const [kpisData, alertsData, periodData, runsData, deptData] = await Promise.all([
        service.getKPIs(),
        service.getAlerts(),
        service.getCurrentPayrollPeriod(),
        service.getRecentPayrollRuns(),
        service.getDepartmentsSummary(),
      ]);

      setKpis(kpisData);
      setAlerts(alertsData);
      setCurrentPeriod(periodData);
      setRecentRuns(runsData);
      setDepartments(deptData);
    } catch (error) {
      console.error('Error cargando datos del dashboard HRM:', error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    if (organization?.id && !orgLoading) {
      loadDashboardData();
    }
  }, [organization?.id, orgLoading]);

  const handleRefresh = () => {
    loadDashboardData(true);
  };

  if (orgLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      {/* Header */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
              <Users className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                Panel de Control HRM
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400 capitalize">
                {new Date().toLocaleDateString('es-ES', {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="self-start md:self-auto"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
            Actualizar
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <HRMKPICards kpis={kpis} isLoading={isLoading} />

      {/* Contenido Principal - Grid de 3 columnas */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Columna 1 - Alertas */}
        <div className="lg:col-span-1">
          <HRMAlerts alerts={alerts} isLoading={isLoading} />
        </div>

        {/* Columna 2 - Accesos Rápidos y Departamentos */}
        <div className="lg:col-span-1 space-y-6">
          <HRMQuickActions />

          {/* Resumen por Departamento */}
          <Card className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-gray-900 dark:text-white">
                <Building2 className="h-5 w-5 text-blue-600" />
                Departamentos
              </CardTitle>
              <Link href="/app/hrm/departamentos">
                <Button variant="ghost" size="sm" className="text-blue-600 dark:text-blue-400">
                  Ver todo
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </Link>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-2">
                  {[...Array(4)].map((_, i) => (
                    <div
                      key={i}
                      className="animate-pulse h-10 bg-gray-100 dark:bg-gray-700 rounded"
                    />
                  ))}
                </div>
              ) : departments.length === 0 ? (
                <div className="text-center py-6 text-gray-500 dark:text-gray-400">
                  <Building2 className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No hay departamentos configurados</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {departments.slice(0, 5).map((dept) => (
                    <div
                      key={dept.id}
                      className="flex items-center justify-between p-2 rounded-lg bg-gray-50 dark:bg-gray-700/50"
                    >
                      <span className="text-sm text-gray-700 dark:text-gray-300">
                        {dept.name}
                      </span>
                      <Badge variant="secondary" className="flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        {dept.employeeCount}
                      </Badge>
                    </div>
                  ))}
                  {departments.length > 5 && (
                    <p className="text-xs text-center text-gray-400 dark:text-gray-500 pt-2">
                      +{departments.length - 5} departamentos más
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Columna 3 - Estado de Nómina */}
        <div className="lg:col-span-1">
          <HRMPayrollStatus
            currentPeriod={currentPeriod}
            recentRuns={recentRuns}
            isLoading={isLoading}
          />
        </div>
      </div>

      {/* Enlaces Rápidos a Módulos */}
      <Card className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
        <CardHeader>
          <CardTitle className="text-gray-900 dark:text-white">
            Módulos HRM
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {[
              { name: 'Empleados', href: '/app/hrm/empleados', color: 'bg-blue-500' },
              { name: 'Departamentos', href: '/app/hrm/departamentos', color: 'bg-indigo-500' },
              { name: 'Cargos', href: '/app/hrm/cargos', color: 'bg-violet-500' },
              { name: 'Turnos', href: '/app/hrm/turnos', color: 'bg-green-500' },
              { name: 'Asistencia', href: '/app/hrm/asistencia', color: 'bg-yellow-500' },
              { name: 'Ausencias', href: '/app/hrm/ausencias', color: 'bg-orange-500' },
              { name: 'Nómina', href: '/app/hrm/nomina', color: 'bg-purple-500' },
              { name: 'Compensación', href: '/app/hrm/compensacion', color: 'bg-pink-500' },
              { name: 'Préstamos', href: '/app/hrm/prestamos', color: 'bg-cyan-500' },
              { name: 'Reportes', href: '/app/hrm/reportes', color: 'bg-emerald-500' },
              { name: 'Reglas País', href: '/app/hrm/reglas-pais', color: 'bg-amber-500' },
              { name: 'Configuración', href: '/app/hrm/configuracion', color: 'bg-gray-500' },
            ].map((module) => (
              <Link key={module.href} href={module.href}>
                <div className="flex items-center gap-2 p-3 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                  <div className={`h-3 w-3 rounded-full ${module.color}`} />
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    {module.name}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
