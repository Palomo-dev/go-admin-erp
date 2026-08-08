'use client';

import { useState, useEffect } from 'react';
import { RefreshCw } from 'lucide-react';
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
import { toast } from 'sonner';

export function CargosServicioContent({ embedded = false }: { embedded?: boolean }) {
  const { organization, isLoading: orgLoading } = useOrganization();

  const [charges, setCharges] = useState<ServiceCharge[]>([]);
  const [branches, setBranches] = useState<{ id: number; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ total: 0, active: 0, inactive: 0 });

  const [filters, setFilters] = useState<ServiceChargeFilters>({});
  const [showForm, setShowForm] = useState(false);
  const [editingCharge, setEditingCharge] = useState<ServiceCharge | null>(null);

  const loadData = async () => {
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
    } catch (error: any) {
      console.error('Error loading service charges:', error);
      toast.error('Error al cargar los cargos de servicio');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (organization?.id) {
      loadData();
    }
  }, [organization?.id, filters]);

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
      <div className="flex items-center justify-center min-h-[400px]">
        <RefreshCw className="h-8 w-8 animate-spin text-blue-500" />
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
      />

      <Card className="dark:bg-gray-800 dark:border-gray-700">
        <CardContent className="p-6">
          <ChargesList
            charges={charges}
            loading={loading}
            onRefresh={loadData}
            onEdit={handleEdit}
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
