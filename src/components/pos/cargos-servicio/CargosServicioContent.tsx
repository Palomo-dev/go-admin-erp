'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import {
  ChargesList,
  ChargesHeader,
  ChargeForm,
  CargosServicioService,
  type ServiceCharge,
  type ServiceChargeFilters,
} from '@/components/pos/cargos-servicio';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { useBranch } from '@/lib/context/BranchContext';
import { PageHeaderSkeleton, CardListSkeleton } from '@/components/common/PageSkeletons';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';

export function CargosServicioContent({ embedded = false }: { embedded?: boolean }) {
  const t = useTranslations('posCargosServicio');
  const { organization, isLoading: orgLoading } = useOrganization();
  const { branchFilter } = useBranch();

  const [charges, setCharges] = useState<ServiceCharge[]>([]);
  const [branches, setBranches] = useState<{ id: number; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ total: 0, active: 0, inactive: 0 });

  const [filters, setFilters] = useState<ServiceChargeFilters>({});
  const [showForm, setShowForm] = useState(false);
  const [editingCharge, setEditingCharge] = useState<ServiceCharge | null>(null);
  const [puedeGestionar, setPuedeGestionar] = useState(false);

  // Permiso de escritura (billing_management), resuelto en la base.
  useEffect(() => {
    if (!organization?.id) return;
    let vigente = true;
    CargosServicioService.puedeGestionar()
      .then((puede) => { if (vigente) setPuedeGestionar(puede); })
      .catch(() => { if (vigente) setPuedeGestionar(false); });
    return () => { vigente = false; };
  }, [organization?.id]);

  // La sucursal global solo fija el valor inicial del filtro local; cambiar el
  // filtro de esta página no toca la sucursal global (ver ChargesHeader).
  useEffect(() => {
    setFilters(prev => prev.branch_id === (branchFilter ?? undefined) ? prev : { ...prev, branch_id: branchFilter ?? undefined });
  }, [branchFilter]);

  const loadData = useCallback(async () => {
    if (!organization?.id) return;

    setLoading(true);
    try {
      const [chargesData, branchesData] = await Promise.all([
        CargosServicioService.getAll(filters),
        CargosServicioService.getBranches(),
      ]);

      setCharges(chargesData);
      setBranches(branchesData);

      const allCharges = await CargosServicioService.getAll();
      setStats({
        total: allCharges.length,
        active: allCharges.filter((c) => c.is_active).length,
        inactive: allCharges.filter((c) => !c.is_active).length,
      });
    } catch (error: unknown) {
      console.error('Error loading service charges:', error);
      toast.error(t('toast.errorCarga'));
    } finally {
      setLoading(false);
    }
  }, [organization?.id, filters, t]);

  useEffect(() => {
    if (organization?.id) {
      void loadData();
    }
  }, [organization?.id, loadData]);

  const handleEdit = (charge: ServiceCharge) => {
    setEditingCharge(charge);
    setShowForm(true);
  };

  const handleNewCharge = () => {
    setEditingCharge(null);
    setShowForm(true);
  };

  const handleFormSuccess = () => {
    loadData();
  };

  if (orgLoading) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 space-y-4 sm:space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
        <PageHeaderSkeleton />
        <CardListSkeleton cards={4} columns="1" />
      </div>
    );
  }

  return (
    <div className={embedded ? 'space-y-4' : 'min-h-screen bg-gray-50 dark:bg-gray-900 p-6 space-y-6'}>
      <ChargesHeader
        filters={filters}
        onFiltersChange={setFilters}
        onRefresh={loadData}
        onNewCharge={handleNewCharge}
        branches={branches}
        stats={stats}
        loading={loading}
        puedeGestionar={puedeGestionar}
      />

      <Card className="dark:bg-gray-800 dark:border-gray-700">
        <CardContent className="p-6">
          <ChargesList
            charges={charges}
            loading={loading}
            onRefresh={loadData}
            onEdit={puedeGestionar ? handleEdit : undefined}
            puedeGestionar={puedeGestionar}
          />
        </CardContent>
      </Card>

      <ChargeForm
        open={showForm}
        onOpenChange={(open) => {
          setShowForm(open);
          if (!open) setEditingCharge(null);
        }}
        charge={editingCharge}
        branches={branches}
        onSuccess={handleFormSuccess}
      />
    </div>
  );
}
