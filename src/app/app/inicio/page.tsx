'use client';

export const dynamic = 'force-dynamic';

import React, { Suspense, useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import ModuleAccessDenied from '@/components/modules/ModuleAccessDenied';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { useToast } from '@/components/ui/use-toast';
import { Home, RefreshCw, QrCode, Clock } from 'lucide-react';
import { cn } from '@/utils/Utils';
import {
  inicioService,
  DashboardKPIs,
  DashboardAtajos,
  DashboardActividad,
  OnboardingBanner,
} from '@/components/inicio';
import type { DashboardData } from '@/components/inicio';
import { moduleManagementService } from '@/lib/services/moduleManagementService';

function InicioContent() {
  const searchParams = useSearchParams();
  const error = searchParams.get('error');
  const module = searchParams.get('module');
  const { organization } = useOrganization();
  const { toast } = useToast();

  const [mounted, setMounted] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [fechaHoy, setFechaHoy] = useState('');
  const [activeModuleCodes, setActiveModuleCodes] = useState<string[] | undefined>(undefined);

  useEffect(() => {
    setMounted(true);
    setFechaHoy(
      new Date().toLocaleDateString('es-ES', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    );
  }, []);

  const loadData = useCallback(async () => {
    if (!organization?.id) return;
    setIsLoading(true);
    try {
      const [data, modules] = await Promise.all([
        inicioService.getDashboardData(organization.id),
        moduleManagementService.getActiveModules(organization.id).catch(() => null),
      ]);
      setDashboardData(data);
      if (modules) setActiveModuleCodes(modules.map(m => m.code));
    } catch (err) {
      console.error('Error cargando dashboard:', err);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar los datos del dashboard',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [organization?.id, toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadData();
    setIsRefreshing(false);
    toast({ title: 'Dashboard actualizado' });
  };

  if (error === 'module_not_activated' && module) {
    return <ModuleAccessDenied moduleCode={module} />;
  }

  if (!mounted || !organization) {
    return (
      <div className="p-4 sm:p-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
        <div className="animate-pulse space-y-6">
          <div className="h-10 bg-gray-200 dark:bg-gray-700 rounded w-48" />
          <div className="grid grid-cols-5 sm:grid-cols-10 gap-3">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="h-20 bg-gray-200 dark:bg-gray-700 rounded-xl" />
            ))}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-24 bg-gray-200 dark:bg-gray-700 rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      {/* Alertas de error */}
      {error && (
        <Alert className="max-w-2xl mx-auto">
          <AlertDescription>
            {error === 'module_not_activated' && 'El módulo solicitado no está activado.'}
            {error === 'insufficient_permissions' && 'No tienes permisos suficientes.'}
            {error === 'plan_limit_reached' && 'Tu plan no permite activar más módulos.'}
            {!['module_not_activated', 'insufficient_permissions', 'plan_limit_reached'].includes(error) && 'Ha ocurrido un error inesperado.'}
          </AlertDescription>
        </Alert>
      )}

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
            <Home className="h-6 w-6 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              Dashboard
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 capitalize">
              {fechaHoy}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link href="/marcar">
            <Button
              variant="outline"
              size="sm"
              className="border-blue-300 dark:border-blue-700 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20"
            >
              <QrCode className="h-4 w-4 mr-2" />
              Marcar Turno
            </Button>
          </Link>

          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="border-gray-300 dark:border-gray-700"
          >
            <RefreshCw className={cn('h-4 w-4 mr-2', isRefreshing && 'animate-spin')} />
            Actualizar
          </Button>
        </div>
      </div>

      {/* Onboarding para organizaciones nuevas */}
      <OnboardingBanner
        steps={dashboardData?.onboarding || []}
        organizacionCreatedAt={dashboardData?.organizacionCreatedAt || null}
      />

      {/* Atajos rápidos */}
      <DashboardAtajos activeModuleCodes={activeModuleCodes} />

      {/* KPIs */}
      <DashboardKPIs data={dashboardData?.kpis ?? null} isLoading={isLoading} />

      {/* Actividad Reciente */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <DashboardActividad
          data={dashboardData?.actividad ?? []}
          isLoading={isLoading}
        />

        {/* Info rápida */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
          <div className="flex items-center gap-2 mb-4">
            <Clock className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
              Accesos Rápidos
            </h3>
          </div>

          <div className="space-y-3">
            {(!activeModuleCodes || activeModuleCodes.includes('pos')) && (
              <Link href="/app/pos" className="block">
                <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 hover:shadow-sm transition-shadow">
                  <p className="text-sm font-medium text-blue-700 dark:text-blue-300">
                    Punto de Venta
                  </p>
                  <p className="text-xs text-blue-500 dark:text-blue-400 mt-0.5">
                    Abrir el POS para procesar ventas
                  </p>
                </div>
              </Link>
            )}

            {(!activeModuleCodes || activeModuleCodes.includes('pos')) && (
              <Link href="/app/pos/mesas" className="block">
                <div className="p-3 rounded-lg bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 hover:shadow-sm transition-shadow">
                  <p className="text-sm font-medium text-orange-700 dark:text-orange-300">
                    Mesas
                  </p>
                  <p className="text-xs text-orange-500 dark:text-orange-400 mt-0.5">
                    Gestionar mesas del restaurante
                  </p>
                </div>
              </Link>
            )}

            {(!activeModuleCodes || activeModuleCodes.includes('inventory')) && (
              <Link href="/app/inventario/productos" className="block">
                <div className="p-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 hover:shadow-sm transition-shadow">
                  <p className="text-sm font-medium text-green-700 dark:text-green-300">
                    Productos
                  </p>
                  <p className="text-xs text-green-500 dark:text-green-400 mt-0.5">
                    Administrar catálogo e inventario
                  </p>
                </div>
              </Link>
            )}

            {(!activeModuleCodes || activeModuleCodes.includes('reports')) && (
              <Link href="/app/reportes" className="block">
                <div className="p-3 rounded-lg bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 hover:shadow-sm transition-shadow">
                  <p className="text-sm font-medium text-purple-700 dark:text-purple-300">
                    Reportes
                  </p>
                  <p className="text-xs text-purple-500 dark:text-purple-400 mt-0.5">
                    Ver análisis y métricas detalladas
                  </p>
                </div>
              </Link>
            )}

            <Link href="/marcar" className="block">
              <div className="p-3 rounded-lg bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 hover:shadow-sm transition-shadow">
                <p className="text-sm font-medium text-indigo-700 dark:text-indigo-300">
                  Marcar Asistencia
                </p>
                <p className="text-xs text-indigo-500 dark:text-indigo-400 mt-0.5">
                  Registrar entrada/salida de turno
                </p>
              </div>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function InicioPage() {
  return (
    <Suspense
      fallback={
        <div className="p-4 sm:p-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
          <div className="animate-pulse space-y-6">
            <div className="h-10 bg-gray-200 dark:bg-gray-700 rounded w-48" />
            <div className="grid grid-cols-5 sm:grid-cols-10 gap-3">
              {Array.from({ length: 10 }).map((_, i) => (
                <div key={i} className="h-20 bg-gray-200 dark:bg-gray-700 rounded-xl" />
              ))}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="h-24 bg-gray-200 dark:bg-gray-700 rounded-xl" />
              ))}
            </div>
          </div>
        </div>
      }
    >
      <InicioContent />
    </Suspense>
  );
}
