'use client';

import { useState, useEffect, useCallback } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/utils/Utils';

import {
  ComisionesHeader,
  ComisionesStats,
  ComisionesFilters,
  ComisionesList,
} from '@/components/finanzas/comisiones';
import {
  commissionsService,
  type Commission,
  type CommissionStats,
  type CommissionFilters,
} from '@/lib/services/commissionsService';

export default function ComisionesPage() {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(true);
  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [stats, setStats] = useState<CommissionStats>({
    total: 0,
    accrued: 0,
    paid: 0,
    cancelled: 0,
    totalAccruedAmount: 0,
    totalPaidAmount: 0,
    byType: [],
    bySource: [],
  });
  const [filters, setFilters] = useState<CommissionFilters>({
    status: 'all',
    commission_type: 'all',
    source_type: 'all',
  });

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [commissionsData, statsData] = await Promise.all([
        commissionsService.getCommissions(filters),
        commissionsService.getStats(filters),
      ]);
      setCommissions(commissionsData);
      setStats(statsData);
    } catch (error: any) {
      console.error('Error cargando comisiones:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar las comisiones',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [filters, toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  return (
    <div className="p-6 space-y-4 bg-gray-50 dark:bg-gray-900 min-h-screen">
      <div className="flex items-center justify-between">
        <ComisionesHeader />
        <Button
          variant="outline"
          size="sm"
          onClick={loadData}
          disabled={isLoading}
          className="h-8 dark:bg-gray-800 dark:text-gray-200 dark:border-gray-600 dark:hover:bg-gray-700"
        >
          <RefreshCw className={cn('h-4 w-4 mr-1', isLoading && 'animate-spin')} />
          Actualizar
        </Button>
      </div>

      <ComisionesStats stats={stats} isLoading={isLoading} />

      <ComisionesFilters filters={filters} onChange={setFilters} />

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        </div>
      ) : (
        <ComisionesList commissions={commissions} isLoading={isLoading} onRefresh={loadData} />
      )}
    </div>
  );
}
