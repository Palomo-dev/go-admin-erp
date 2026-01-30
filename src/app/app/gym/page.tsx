'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Dumbbell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { GymStats, QuickActions, ExpiringMemberships } from '@/components/gym/dashboard';
import { CheckinHistory } from '@/components/gym/checkin';
import { 
  getGymStats, 
  getMemberships,
  getTodayCheckins,
  GymStats as GymStatsType,
  Membership,
  MemberCheckin
} from '@/lib/services/gymService';
import { getCurrentBranchId } from '@/lib/hooks/useOrganization';

export default function GymDashboardPage() {
  const { toast } = useToast();
  
  const [isLoading, setIsLoading] = useState(true);
  const [stats, setStats] = useState<GymStatsType>({
    activeMemberships: 0,
    expiringIn7Days: 0,
    expiredMemberships: 0,
    todayCheckins: 0,
    todayRevenue: 0,
    weekRevenue: 0
  });
  const [expiringMemberships, setExpiringMemberships] = useState<Membership[]>([]);
  const [todayCheckins, setTodayCheckins] = useState<MemberCheckin[]>([]);

  const loadDashboardData = useCallback(async () => {
    try {
      setIsLoading(true);
      const branchId = getCurrentBranchId();
      
      const [statsData, expiringData, checkinsData] = await Promise.all([
        getGymStats(),
        getMemberships(undefined, { expiringIn: 7 }),
        getTodayCheckins(undefined, branchId || undefined)
      ]);

      setStats(statsData);
      setExpiringMemberships(expiringData);
      setTodayCheckins(checkinsData);
    } catch (error) {
      console.error('Error cargando dashboard:', error);
      toast({
        title: 'Error',
        description: 'Error al cargar datos del dashboard',
        variant: 'destructive'
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  const handleExportExpiring = () => {
    const csv = [
      ['Nombre', 'Plan', 'Vencimiento', 'Días Restantes', 'Código'].join(','),
      ...expiringMemberships.map(m => [
        `${m.customers?.first_name} ${m.customers?.last_name}`,
        m.membership_plans?.name || '',
        m.end_date,
        Math.ceil((new Date(m.end_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)),
        m.access_code || ''
      ].join(','))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `membresias-vencen-pronto-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);

    toast({
      title: 'Exportado',
      description: `${expiringMemberships.length} membresías exportadas`
    });
  };

  return (
    <div className="p-6 space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
            <Dumbbell className="h-6 w-6 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              Gimnasio
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Panel de control
            </p>
          </div>
        </div>
        
        <Button
          variant="outline"
          onClick={loadDashboardData}
          disabled={isLoading}
          className="border-gray-300 dark:border-gray-600"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
          Actualizar
        </Button>
      </div>

      {/* Estadísticas */}
      <GymStats stats={stats} isLoading={isLoading} />

      {/* Acciones rápidas */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Acciones Rápidas
        </h2>
        <QuickActions />
      </div>

      {/* Widgets */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ExpiringMemberships 
          memberships={expiringMemberships}
          isLoading={isLoading}
          onExport={handleExportExpiring}
        />
        
        <CheckinHistory 
          checkins={todayCheckins}
          isLoading={isLoading}
        />
      </div>
    </div>
  );
}
