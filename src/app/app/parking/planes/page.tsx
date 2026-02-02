'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { useToast } from '@/components/ui/use-toast';
import { Loader2, CreditCard, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import parkingService, { type ParkingPassType } from '@/lib/services/parkingService';
import {
  PlanesHeader,
  PlanesStats,
  PlanesFilters,
  PlanesTable,
  PlanFormDialog,
  type PlanFiltersState,
} from '@/components/parking/planes';

const initialFilters: PlanFiltersState = {
  search: '',
  status: 'all',
  vehicleType: 'all',
};

export default function PlanesPage() {
  const { organization, isLoading: orgLoading } = useOrganization();
  const { toast } = useToast();

  const [plans, setPlans] = useState<ParkingPassType[]>([]);
  const [filters, setFilters] = useState<PlanFiltersState>(initialFilters);
  const [isLoading, setIsLoading] = useState(true);
  const [subscriberCounts, setSubscriberCounts] = useState<Record<string, number>>({});

  // Dialog states
  const [showFormDialog, setShowFormDialog] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<ParkingPassType | null>(null);

  // Load data
  const loadData = useCallback(async () => {
    if (!organization?.id) return;

    setIsLoading(true);
    try {
      const plansData = await parkingService.getAllPassTypes(organization.id);
      setPlans(plansData);

      // Load subscriber counts for each plan
      const counts: Record<string, number> = {};
      await Promise.all(
        plansData.map(async (plan) => {
          counts[plan.id] = await parkingService.countActivePassesByType(plan.id);
        })
      );
      setSubscriberCounts(counts);
    } catch (error) {
      console.error('Error loading plans:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar los planes',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [organization?.id, toast]);

  useEffect(() => {
    if (organization?.id && !orgLoading) {
      loadData();
    }
  }, [organization?.id, orgLoading, loadData]);

  // Stats
  const stats = useMemo(() => {
    const active = plans.filter((p) => p.is_active).length;
    const inactive = plans.filter((p) => !p.is_active).length;
    const totalSubscribers = Object.values(subscriberCounts).reduce((sum, count) => sum + count, 0);
    const avgPrice = plans.length > 0
      ? plans.reduce((sum, p) => sum + Number(p.price), 0) / plans.length
      : 0;

    return {
      total: plans.length,
      active,
      inactive,
      totalSubscribers,
      avgPrice,
    };
  }, [plans, subscriberCounts]);

  // Filtered plans
  const filteredPlans = useMemo(() => {
    return plans.filter((plan) => {
      // Search filter
      if (filters.search) {
        const searchLower = filters.search.toLowerCase();
        const matchesName = plan.name.toLowerCase().includes(searchLower);
        const matchesDesc = plan.description?.toLowerCase().includes(searchLower);
        if (!matchesName && !matchesDesc) return false;
      }

      // Status filter
      if (filters.status === 'active' && !plan.is_active) return false;
      if (filters.status === 'inactive' && plan.is_active) return false;

      // Vehicle type filter
      if (filters.vehicleType !== 'all') {
        if (!plan.allowed_vehicle_types?.includes(filters.vehicleType)) return false;
      }

      return true;
    });
  }, [plans, filters]);

  // Handlers
  const handleNewPlan = () => {
    setSelectedPlan(null);
    setShowFormDialog(true);
  };

  const handleEditPlan = (plan: ParkingPassType) => {
    setSelectedPlan(plan);
    setShowFormDialog(true);
  };

  const handleDuplicatePlan = async (plan: ParkingPassType) => {
    if (!organization?.id) return;

    try {
      await parkingService.duplicatePassType(plan.id, organization.id);
      toast({
        title: 'Plan duplicado',
        description: 'Se ha creado una copia del plan',
      });
      loadData();
    } catch (error) {
      console.error('Error duplicating plan:', error);
      toast({
        title: 'Error',
        description: 'No se pudo duplicar el plan',
        variant: 'destructive',
      });
    }
  };

  const handleToggleStatus = async (plan: ParkingPassType) => {
    try {
      await parkingService.togglePassTypeStatus(plan.id);
      toast({
        title: plan.is_active ? 'Plan desactivado' : 'Plan activado',
        description: plan.is_active
          ? 'El plan ya no está disponible para nuevos suscriptores'
          : 'El plan ahora está disponible para suscriptores',
      });
      loadData();
    } catch (error) {
      console.error('Error toggling plan status:', error);
      toast({
        title: 'Error',
        description: 'No se pudo cambiar el estado del plan',
        variant: 'destructive',
      });
    }
  };

  // Loading state
  if (orgLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  // No organization
  if (!organization) {
    return (
      <div className="flex flex-col items-center justify-center h-96 text-center">
        <AlertCircle className="h-12 w-12 text-yellow-500 mb-4" />
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
          Sin organización
        </h2>
        <p className="text-gray-500 dark:text-gray-400">
          Debes pertenecer a una organización para acceder a esta página.
        </p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      {/* Header */}
      <PlanesHeader
        onNewPlan={handleNewPlan}
        onRefresh={loadData}
        isLoading={isLoading}
      />

      {/* Stats */}
      <PlanesStats stats={stats} isLoading={isLoading} />

      {/* Filters */}
      <PlanesFilters filters={filters} onFiltersChange={setFilters} />

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          <span className="ml-3 text-gray-500 dark:text-gray-400">
            Cargando planes...
          </span>
        </div>
      ) : filteredPlans.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="p-4 bg-gray-100 dark:bg-gray-800 rounded-full mb-4">
            <CreditCard className="h-12 w-12 text-gray-400" />
          </div>
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
            No hay planes
          </h3>
          <p className="text-gray-500 dark:text-gray-400 mb-4 max-w-sm">
            {filters.search || filters.status !== 'all' || filters.vehicleType !== 'all'
              ? 'No se encontraron planes con los filtros seleccionados'
              : 'No hay planes de parking registrados'}
          </p>
          <Button onClick={handleNewPlan} className="bg-blue-600 hover:bg-blue-700">
            Crear primer plan
          </Button>
        </div>
      ) : (
        <PlanesTable
          plans={filteredPlans}
          subscriberCounts={subscriberCounts}
          onEdit={handleEditPlan}
          onDuplicate={handleDuplicatePlan}
          onToggleStatus={handleToggleStatus}
        />
      )}

      {/* Form Dialog */}
      {organization?.id && (
        <PlanFormDialog
          open={showFormDialog}
          onOpenChange={setShowFormDialog}
          organizationId={organization.id}
          plan={selectedPlan}
          onSuccess={loadData}
        />
      )}
    </div>
  );
}
