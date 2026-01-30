'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { CreditCard, Upload, Filter, BarChart3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { PlanCard, PlanDialog, PlansImportDialog } from '@/components/gym/planes';
import { PageHeader } from '@/components/gym/shared';
import { formatCurrency } from '@/utils/Utils';
import { 
  getPlans, 
  createPlan, 
  updatePlan, 
  togglePlanStatus,
  MembershipPlan 
} from '@/lib/services/gymService';

export default function GymPlanesPage() {
  const { toast } = useToast();
  
  const [isLoading, setIsLoading] = useState(true);
  const [plans, setPlans] = useState<MembershipPlan[]>([]);
  const [showDialog, setShowDialog] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<MembershipPlan | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');

  const loadPlans = useCallback(async () => {
    try {
      setIsLoading(true);
      const data = await getPlans();
      setPlans(data);
    } catch (error) {
      console.error('Error cargando planes:', error);
      toast({
        title: 'Error',
        description: 'Error al cargar los planes',
        variant: 'destructive'
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadPlans();
  }, [loadPlans]);

  const handleSave = async (data: Partial<MembershipPlan>) => {
    try {
      if (selectedPlan) {
        await updatePlan(selectedPlan.id, data);
        toast({ title: 'Plan actualizado', description: data.name });
      } else {
        await createPlan(data);
        toast({ title: 'Plan creado', description: data.name });
      }
      loadPlans();
    } catch (error) {
      console.error('Error guardando plan:', error);
      toast({
        title: 'Error',
        description: 'Error al guardar el plan',
        variant: 'destructive'
      });
      throw error;
    }
  };

  const handleEdit = (plan: MembershipPlan) => {
    setSelectedPlan(plan);
    setShowDialog(true);
  };

  const handleDuplicate = (plan: MembershipPlan) => {
    setSelectedPlan({
      ...plan,
      id: 0,
      name: `${plan.name} (copia)`
    } as MembershipPlan);
    setShowDialog(true);
  };

  const handleToggleStatus = async (plan: MembershipPlan) => {
    try {
      await togglePlanStatus(plan.id, !plan.is_active);
      toast({
        title: plan.is_active ? 'Plan desactivado' : 'Plan activado',
        description: plan.name
      });
      loadPlans();
    } catch (error) {
      console.error('Error cambiando estado:', error);
      toast({
        title: 'Error',
        description: 'Error al cambiar el estado',
        variant: 'destructive'
      });
    }
  };

  const handleNewPlan = () => {
    setSelectedPlan(null);
    setShowDialog(true);
  };

  const handleImport = async (importedPlans: Partial<MembershipPlan>[]) => {
    try {
      let successCount = 0;
      for (const plan of importedPlans) {
        await createPlan(plan);
        successCount++;
      }
      toast({
        title: 'Importación completada',
        description: `${successCount} plan${successCount !== 1 ? 'es' : ''} importado${successCount !== 1 ? 's' : ''} correctamente`
      });
      loadPlans();
    } catch (error) {
      console.error('Error importando planes:', error);
      toast({
        title: 'Error',
        description: 'Error al importar algunos planes',
        variant: 'destructive'
      });
      throw error;
    }
  };

  const filteredPlans = plans.filter(p => {
    if (statusFilter === 'active') return p.is_active;
    if (statusFilter === 'inactive') return !p.is_active;
    return true;
  });

  const activePlans = filteredPlans.filter(p => p.is_active);
  const inactivePlans = filteredPlans.filter(p => !p.is_active);

  const stats = {
    total: plans.length,
    active: plans.filter(p => p.is_active).length,
    inactive: plans.filter(p => !p.is_active).length,
    avgPrice: plans.length > 0 
      ? plans.reduce((sum, p) => sum + p.price, 0) / plans.length 
      : 0
  };

  return (
    <div className="p-6 space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      <PageHeader
        title="Planes de Membresía"
        icon={CreditCard}
        onRefresh={loadPlans}
        isLoading={isLoading}
        primaryAction={{
          label: 'Nuevo Plan',
          onClick: handleNewPlan,
        }}
        secondaryAction={{
          label: 'Importar',
          icon: Upload,
          onClick: () => setShowImportDialog(true),
        }}
      />

      {/* Stats Cards */}
      {!isLoading && plans.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                  <CreditCard className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.total}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Total planes</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
                  <BarChart3 className="h-5 w-5 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.active}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Activos</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-gray-100 dark:bg-gray-700 rounded-lg">
                  <CreditCard className="h-5 w-5 text-gray-500 dark:text-gray-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.inactive}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Inactivos</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
                  <BarChart3 className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">{formatCurrency(stats.avgPrice)}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Precio promedio</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      {!isLoading && plans.length > 0 && (
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-gray-500" />
            <span className="text-sm text-gray-600 dark:text-gray-400">Filtrar:</span>
          </div>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
            <SelectTrigger className="w-40 bg-white dark:bg-gray-800">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos ({plans.length})</SelectItem>
              <SelectItem value="active">Activos ({stats.active})</SelectItem>
              <SelectItem value="inactive">Inactivos ({stats.inactive})</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

        {/* Loading */}
        {isLoading && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="animate-pulse bg-white dark:bg-gray-800 rounded-lg p-5 border border-gray-200 dark:border-gray-700">
                <div className="flex items-center gap-3 mb-4">
                  <div className="h-10 w-10 bg-gray-200 dark:bg-gray-700 rounded-lg" />
                  <div className="space-y-2">
                    <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-24" />
                    <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-16" />
                  </div>
                </div>
                <div className="h-10 bg-gray-200 dark:bg-gray-700 rounded" />
              </div>
            ))}
          </div>
        )}

        {/* Empty state */}
        {!isLoading && plans.length === 0 && (
          <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
            <CreditCard className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
              No hay planes creados
            </h3>
            <p className="text-gray-500 dark:text-gray-400 mb-4">
              Crea tu primer plan de membresía
            </p>
            <Button onClick={handleNewPlan} className="bg-blue-600 hover:bg-blue-700 text-white">
              Crear Plan
            </Button>
          </div>
        )}

        {/* Planes activos */}
        {!isLoading && activePlans.length > 0 && (
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Planes Activos ({activePlans.length})
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {activePlans.map(plan => (
                <PlanCard
                  key={plan.id}
                  plan={plan}
                  onEdit={handleEdit}
                  onDuplicate={handleDuplicate}
                  onToggleStatus={handleToggleStatus}
                />
              ))}
            </div>
          </div>
        )}

        {/* Planes inactivos */}
        {!isLoading && inactivePlans.length > 0 && (
          <div>
            <h2 className="text-lg font-semibold text-gray-500 dark:text-gray-400 mb-4">
              Planes Inactivos ({inactivePlans.length})
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {inactivePlans.map(plan => (
                <PlanCard
                  key={plan.id}
                  plan={plan}
                  onEdit={handleEdit}
                  onDuplicate={handleDuplicate}
                  onToggleStatus={handleToggleStatus}
                />
              ))}
            </div>
          </div>
        )}

      <PlanDialog
        open={showDialog}
        onOpenChange={setShowDialog}
        plan={selectedPlan}
        onSave={handleSave}
      />

      <PlansImportDialog
        open={showImportDialog}
        onOpenChange={setShowImportDialog}
        onImport={handleImport}
      />
    </div>
  );
}
