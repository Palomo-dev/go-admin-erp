'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useToast } from '@/components/ui/use-toast';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { supabase } from '@/lib/supabase/config';
import { Loader2, Building2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import ParkingDashboardService, {
  type ParkingDashboardStats,
  type ActiveSession,
  type ExpiringPass,
  type TopPlate,
  type HourlyStats,
} from '@/lib/services/parkingDashboardService';
import {
  ParkingHeader,
  OccupancyStats,
  RevenueStats,
  ActiveSessionsList,
  ExpiringPassesList,
  TopPlatesList,
  HourlyChart,
  AlertsPanel,
} from '@/components/parking';

export default function ParkingDashboardPage() {
  const { toast } = useToast();
  const { organization } = useOrganization();

  const [isLoading, setIsLoading] = useState(true);
  const [branchId, setBranchId] = useState<number | null>(null);
  const [stats, setStats] = useState<ParkingDashboardStats | null>(null);
  const [activeSessions, setActiveSessions] = useState<ActiveSession[]>([]);
  const [expiringPasses, setExpiringPasses] = useState<ExpiringPass[]>([]);
  const [topPlates, setTopPlates] = useState<TopPlate[]>([]);
  const [hourlyStats, setHourlyStats] = useState<HourlyStats[]>([]);

  // Obtener el branch de la organización actual
  useEffect(() => {
    async function fetchBranch() {
      if (!organization?.id) return;
      
      // Obtener el primer branch de la organización (ordenado por id para consistencia)
      const { data, error } = await supabase
        .from('branches')
        .select('id')
        .eq('organization_id', organization.id)
        .order('id', { ascending: true })
        .limit(1);
      
      if (error) {
        console.error('Error obteniendo branch:', error);
        setIsLoading(false);
        return;
      }
      
      const firstBranch = data?.[0];
      setBranchId(firstBranch?.id || null);
      
      // Si no hay branch, detener el loading
      if (!firstBranch?.id) {
        setIsLoading(false);
      }
    }
    
    // Reset branchId cuando cambia la organización
    setBranchId(null);
    setStats(null);
    setActiveSessions([]);
    fetchBranch();
  }, [organization?.id]);

  const loadData = useCallback(async () => {
    if (!organization?.id || !branchId) return;

    setIsLoading(true);
    try {
      const [
        statsData,
        sessionsData,
        passesData,
        platesData,
        hourlyData,
      ] = await Promise.all([
        ParkingDashboardService.getDashboardStats(branchId, organization.id),
        ParkingDashboardService.getActiveSessions(branchId, 20),
        ParkingDashboardService.getExpiringPasses(organization.id, 30),
        ParkingDashboardService.getTopPlates(branchId, 10),
        ParkingDashboardService.getHourlyStats(branchId),
      ]);

      setStats(statsData);
      setActiveSessions(sessionsData);
      setExpiringPasses(passesData);
      setTopPlates(platesData);
      setHourlyStats(hourlyData);
    } catch (error) {
      console.error('Error cargando datos:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar los datos del dashboard.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [organization?.id, branchId, toast]);

  useEffect(() => {
    if (organization && branchId) {
      loadData();
    }
  }, [organization, branchId, loadData]);

  // Auto-refresh cada 30 segundos
  useEffect(() => {
    const interval = setInterval(() => {
      if (organization && branchId && !isLoading) {
        loadData();
      }
    }, 30000);

    return () => clearInterval(interval);
  }, [organization, branchId, isLoading, loadData]);

  const handleExport = async () => {
    if (!organization?.id || !branchId) return;

    try {
      const summary = await ParkingDashboardService.getDailySummary(
        branchId,
        organization.id
      );

      // Crear CSV
      const csvContent = [
        ['Resumen Diario de Parking', summary.date],
        [],
        ['Métricas Generales'],
        ['Total Espacios', summary.stats.totalSpaces],
        ['Espacios Ocupados', summary.stats.occupiedSpaces],
        ['Espacios Libres', summary.stats.freeSpaces],
        ['Tasa de Ocupación', `${summary.stats.occupancyRate}%`],
        [],
        ['Ingresos'],
        ['Ingresos del Día', summary.stats.revenueToday],
        ['Por Sesiones', summary.stats.revenueSessions],
        ['Por Abonados', summary.stats.revenuePasses],
        [],
        ['Sesiones'],
        ['Sesiones Activas', summary.stats.activeSessions],
        ['Completadas Hoy', summary.stats.completedToday],
        ['En Riesgo', summary.stats.atRiskSessions],
        [],
        ['Abonados'],
        ['Total Activos', summary.stats.totalActivePasses],
        ['Vencen en 7 días', summary.stats.expiringIn7Days],
        ['Vencen en 15 días', summary.stats.expiringIn15Days],
        ['Vencen en 30 días', summary.stats.expiringIn30Days],
      ]
        .map((row) => row.join(','))
        .join('\n');

      // Descargar
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `parking_resumen_${summary.date}.csv`;
      link.click();

      toast({
        title: 'Exportado',
        description: 'Resumen diario exportado correctamente.',
      });
    } catch (error) {
      console.error('Error exportando:', error);
      toast({
        title: 'Error',
        description: 'No se pudo exportar el resumen.',
        variant: 'destructive',
      });
    }
  };

  // Si no hay branch para esta organización
  if (organization && branchId === null && !isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 p-6">
        <div className="max-w-md mx-auto mt-20">
          <Card>
            <CardContent className="pt-6 text-center">
              <Building2 className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
                Sin sucursal configurada
              </h2>
              <p className="text-gray-600 dark:text-gray-400 mb-4">
                La organización &quot;{organization.name}&quot; no tiene sucursales configuradas.
                Crea una sucursal para usar el módulo de Parking.
              </p>
              <Link href="/app/organizacion/sucursales">
                <Button className="bg-blue-600 hover:bg-blue-700">
                  Crear Sucursal
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (isLoading && !stats) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-4rem)]">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-400">Cargando dashboard...</p>
        </div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-4rem)]">
        <div className="text-center">
          <p className="text-gray-600 dark:text-gray-400">
            No se encontraron datos de parking
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 bg-gray-50 dark:bg-gray-950 min-h-screen">
      <ParkingHeader
        onRefresh={loadData}
        onExport={handleExport}
        isLoading={isLoading}
      />

      <div className="">
        {/* Primera fila: Ocupación, Ingresos, Alertas */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-6">
          <OccupancyStats
            totalSpaces={stats.totalSpaces}
            occupiedSpaces={stats.occupiedSpaces}
            freeSpaces={stats.freeSpaces}
            reservedSpaces={stats.reservedSpaces}
            occupancyRate={stats.occupancyRate}
          />

          <RevenueStats
            revenueToday={stats.revenueToday}
            revenueSessions={stats.revenueSessions}
            revenuePasses={stats.revenuePasses}
            completedToday={stats.completedToday}
          />

          <AlertsPanel
            atRiskSessions={stats.atRiskSessions}
            expiringIn7Days={stats.expiringIn7Days}
            occupancyRate={stats.occupancyRate}
            totalActivePasses={stats.totalActivePasses}
          />
        </div>

        {/* Segunda fila: Sesiones activas y Abonados por vencer */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <ActiveSessionsList
            sessions={activeSessions}
            atRiskCount={stats.atRiskSessions}
          />

          <ExpiringPassesList
            passes={expiringPasses}
            expiringIn7Days={stats.expiringIn7Days}
            expiringIn15Days={stats.expiringIn15Days}
            expiringIn30Days={stats.expiringIn30Days}
          />
        </div>

        {/* Tercera fila: Top placas y Horas pico */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <TopPlatesList plates={topPlates} />
          <HourlyChart data={hourlyStats} />
        </div>
      </div>
    </div>
  );
}
