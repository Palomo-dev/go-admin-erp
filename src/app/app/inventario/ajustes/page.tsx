'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useTheme } from 'next-themes';
import { useToast } from '@/components/ui/use-toast';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { supabase } from '@/lib/supabase/config';
import { 
  adjustmentService, 
  type InventoryAdjustment, 
  type AdjustmentStats as AdjustmentStatsType 
} from '@/lib/services/adjustmentService';
import { AjustesHeader, AjustesStats, AjustesFilters, AjustesTable } from '@/components/inventario/ajustes';
import { Loader2 } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export default function AjustesPage() {
  const { theme } = useTheme();
  const { toast } = useToast();
  const { organization, isLoading: loadingOrg } = useOrganization();

  // Estados de datos
  const [adjustments, setAdjustments] = useState<InventoryAdjustment[]>([]);
  const [stats, setStats] = useState<AdjustmentStatsType>({
    total: 0,
    draft: 0,
    applied: 0,
    cancelled: 0
  });
  const [branches, setBranches] = useState<{ id: number; name: string }[]>([]);
  const [totalCount, setTotalCount] = useState(0);

  // Estados de filtros
  const [branchId, setBranchId] = useState('all');
  const [type, setType] = useState('all');
  const [status, setStatus] = useState('all');

  // Estados de paginación
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 50;

  // Estados de UI
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Estados para diálogos de confirmación
  const [applyDialog, setApplyDialog] = useState<{ open: boolean; adjustment: InventoryAdjustment | null }>({ open: false, adjustment: null });
  const [cancelDialog, setCancelDialog] = useState<{ open: boolean; adjustment: InventoryAdjustment | null }>({ open: false, adjustment: null });
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; adjustment: InventoryAdjustment | null }>({ open: false, adjustment: null });

  // Cargar datos iniciales
  const loadData = useCallback(async () => {
    if (!organization?.id) return;

    try {
      setIsLoading(true);

      // Cargar sucursales
      const branchesData = await adjustmentService.getBranches(organization.id);
      setBranches(branchesData);

      // Cargar ajustes y estadísticas
      await refreshData();
    } catch (error) {
      console.error('Error cargando datos:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'No se pudieron cargar los datos de ajustes'
      });
    } finally {
      setIsLoading(false);
    }
  }, [organization?.id]);

  // Refrescar datos
  const refreshData = useCallback(async () => {
    if (!organization?.id) return;

    try {
      setIsRefreshing(true);

      const filters: any = {};
      if (branchId !== 'all') filters.branchId = parseInt(branchId);
      if (type !== 'all') filters.type = type;
      if (status !== 'all') filters.status = status;

      const [adjustmentsData, statsData] = await Promise.all([
        adjustmentService.getAdjustments(organization.id, filters, currentPage, pageSize),
        adjustmentService.getAdjustmentStats(organization.id, branchId !== 'all' ? parseInt(branchId) : undefined)
      ]);

      if (adjustmentsData.error) throw adjustmentsData.error;

      setAdjustments(adjustmentsData.data);
      setTotalCount(adjustmentsData.count);
      setStats(statsData);
    } catch (error) {
      console.error('Error refrescando datos:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'No se pudieron actualizar los datos de ajustes'
      });
    } finally {
      setIsRefreshing(false);
    }
  }, [organization?.id, branchId, type, status, currentPage, pageSize]);

  // Efecto para cargar datos iniciales
  useEffect(() => {
    if (organization?.id) {
      loadData();
    }
  }, [organization?.id, loadData]);

  // Efecto para refrescar cuando cambian los filtros
  useEffect(() => {
    if (organization?.id && !isLoading) {
      setCurrentPage(1);
      refreshData();
    }
  }, [branchId, type, status]);

  // Aplicar ajuste
  const handleApply = async () => {
    if (!applyDialog.adjustment || !organization?.id) return;

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user?.id;

      if (!userId) {
        toast({
          variant: 'destructive',
          title: 'Error',
          description: 'Debes estar autenticado para aplicar ajustes'
        });
        return;
      }

      const { success, error } = await adjustmentService.applyAdjustment(
        applyDialog.adjustment.id,
        organization.id,
        userId
      );

      if (error) throw error;

      toast({
        title: 'Ajuste aplicado',
        description: 'Los movimientos de stock han sido generados correctamente'
      });

      refreshData();
    } catch (error: any) {
      console.error('Error aplicando ajuste:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message || 'No se pudo aplicar el ajuste'
      });
    } finally {
      setApplyDialog({ open: false, adjustment: null });
    }
  };

  // Cancelar ajuste
  const handleCancel = async () => {
    if (!cancelDialog.adjustment || !organization?.id) return;

    try {
      const { success, error } = await adjustmentService.cancelAdjustment(
        cancelDialog.adjustment.id,
        organization.id
      );

      if (error) throw error;

      toast({
        title: 'Ajuste cancelado',
        description: 'El ajuste ha sido cancelado correctamente'
      });

      refreshData();
    } catch (error: any) {
      console.error('Error cancelando ajuste:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message || 'No se pudo cancelar el ajuste'
      });
    } finally {
      setCancelDialog({ open: false, adjustment: null });
    }
  };

  // Eliminar ajuste
  const handleDelete = async () => {
    if (!deleteDialog.adjustment || !organization?.id) return;

    try {
      const { success, error } = await adjustmentService.deleteAdjustment(
        deleteDialog.adjustment.id,
        organization.id
      );

      if (error) throw error;

      toast({
        title: 'Ajuste eliminado',
        description: 'El ajuste ha sido eliminado correctamente'
      });

      refreshData();
    } catch (error: any) {
      console.error('Error eliminando ajuste:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message || 'No se pudo eliminar el ajuste'
      });
    } finally {
      setDeleteDialog({ open: false, adjustment: null });
    }
  };

  // Limpiar filtros
  const handleClearFilters = () => {
    setBranchId('all');
    setType('all');
    setStatus('all');
    setCurrentPage(1);
  };

  const hasActiveFilters = branchId !== 'all' || type !== 'all' || status !== 'all';

  // Loading inicial
  if (loadingOrg || isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        <span className="ml-2 text-gray-500 dark:text-gray-400">Cargando...</span>
      </div>
    );
  }

  return (
    <div className={`flex flex-col gap-6 p-6 ${theme === 'dark' ? 'bg-gray-900' : 'bg-gray-50'} min-h-screen`}>
      {/* Header */}
      <AjustesHeader
        onRefresh={refreshData}
        isLoading={isRefreshing}
      />

      {/* Estadísticas */}
      <AjustesStats stats={stats} isLoading={isRefreshing} />

      {/* Filtros */}
      <AjustesFilters
        branchId={branchId}
        onBranchChange={setBranchId}
        type={type}
        onTypeChange={setType}
        status={status}
        onStatusChange={setStatus}
        branches={branches}
        onClearFilters={handleClearFilters}
        hasActiveFilters={hasActiveFilters}
      />

      {/* Contador de resultados */}
      <div className="text-sm text-gray-500 dark:text-gray-400">
        Mostrando {adjustments.length} de {totalCount} ajustes
      </div>

      {/* Tabla */}
      <AjustesTable
        data={adjustments}
        isLoading={isRefreshing}
        onApply={(adj) => setApplyDialog({ open: true, adjustment: adj })}
        onCancel={(adj) => setCancelDialog({ open: true, adjustment: adj })}
        onDelete={(adj) => setDeleteDialog({ open: true, adjustment: adj })}
      />

      {/* Diálogo de aplicar */}
      <AlertDialog open={applyDialog.open} onOpenChange={(open) => setApplyDialog({ open, adjustment: applyDialog.adjustment })}>
        <AlertDialogContent className="dark:bg-gray-900 dark:border-gray-700">
          <AlertDialogHeader>
            <AlertDialogTitle className="dark:text-white">Aplicar ajuste</AlertDialogTitle>
            <AlertDialogDescription className="dark:text-gray-400">
              ¿Estás seguro de aplicar este ajuste? Esta acción generará los movimientos de stock correspondientes y no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleApply}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              Aplicar ajuste
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Diálogo de cancelar */}
      <AlertDialog open={cancelDialog.open} onOpenChange={(open) => setCancelDialog({ open, adjustment: cancelDialog.adjustment })}>
        <AlertDialogContent className="dark:bg-gray-900 dark:border-gray-700">
          <AlertDialogHeader>
            <AlertDialogTitle className="dark:text-white">Cancelar ajuste</AlertDialogTitle>
            <AlertDialogDescription className="dark:text-gray-400">
              ¿Estás seguro de cancelar este ajuste? El ajuste quedará marcado como cancelado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700">
              Volver
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleCancel}
              className="bg-orange-600 hover:bg-orange-700 text-white"
            >
              Cancelar ajuste
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Diálogo de eliminar */}
      <AlertDialog open={deleteDialog.open} onOpenChange={(open) => setDeleteDialog({ open, adjustment: deleteDialog.adjustment })}>
        <AlertDialogContent className="dark:bg-gray-900 dark:border-gray-700">
          <AlertDialogHeader>
            <AlertDialogTitle className="dark:text-white">Eliminar ajuste</AlertDialogTitle>
            <AlertDialogDescription className="dark:text-gray-400">
              ¿Estás seguro de eliminar este ajuste? Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDelete}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
