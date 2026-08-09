'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import {
  TipsList,
  TipsHeader,
  TipForm,
  ServerSummary,
  PropinasService,
  type Tip,
  type TipFilters,
  type TipSummary,
} from '@/components/pos/propinas';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { PageHeaderSkeleton, CardListSkeleton } from '@/components/common/PageSkeletons';
import { toast } from 'sonner';

export function PropinasContent({ embedded = false }: { embedded?: boolean }) {
  const { organization, isLoading: orgLoading } = useOrganization();

  const [tips, setTips] = useState<Tip[]>([]);
  const [summaries, setSummaries] = useState<TipSummary[]>([]);
  const [servers, setServers] = useState<{ id: string; name: string; email: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ total: 0, distributed: 0, pending: 0, count: 0 });

  const [filters, setFilters] = useState<TipFilters>({});
  const [showForm, setShowForm] = useState(false);
  const [editingTip, setEditingTip] = useState<Tip | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const loadData = async () => {
    if (!organization?.id) return;

    setLoading(true);
    try {
      const [tipsData, summaryData, serversData, statsData] = await Promise.all([
        PropinasService.getAll(filters),
        PropinasService.getSummaryByServer(filters),
        PropinasService.getServers(),
        PropinasService.getDayStats(),
      ]);

      setTips(tipsData);
      setSummaries(summaryData);
      setServers(serversData);
      setStats(statsData);
    } catch (error: any) {
      console.error('Error loading tips:', error);
      toast.error('Error al cargar las propinas');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (organization?.id) {
      loadData();
    }
  }, [organization?.id, filters]);

  const handleEdit = (tip: Tip) => {
    setEditingTip(tip);
    setShowForm(true);
  };

  const handleNewTip = () => {
    setEditingTip(null);
    setShowForm(true);
  };

  const handleFormSuccess = () => {
    loadData();
    setSelectedIds([]);
  };

  const handleDistributeSelected = async () => {
    if (selectedIds.length === 0) return;

    try {
      await PropinasService.markMultipleAsDistributed(selectedIds);
      toast.success(`${selectedIds.length} propina(s) marcadas como distribuidas`);
      setSelectedIds([]);
      loadData();
    } catch (error: any) {
      toast.error(error.message || 'Error al distribuir propinas');
    }
  };

  if (orgLoading) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 space-y-4 sm:space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
        <PageHeaderSkeleton />
        <CardListSkeleton cards={3} columns="1" />
      </div>
    );
  }

  return (
    <div className={embedded ? 'space-y-4' : 'min-h-screen bg-gray-50 dark:bg-gray-900 p-6 space-y-6'}>
      <TipsHeader
        filters={filters}
        onFiltersChange={setFilters}
        onRefresh={loadData}
        onNewTip={handleNewTip}
        servers={servers}
        stats={stats}
        loading={loading}
        selectedCount={selectedIds.length}
        onDistributeSelected={handleDistributeSelected}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Card className="dark:bg-gray-800 dark:border-gray-700">
            <CardContent className="p-6">
              <TipsList
                tips={tips}
                loading={loading}
                onRefresh={loadData}
                onEdit={handleEdit}
                selectedIds={selectedIds}
                onSelectionChange={setSelectedIds}
              />
            </CardContent>
          </Card>
        </div>

        <div>
          <ServerSummary summaries={summaries} loading={loading} />
        </div>
      </div>

      <TipForm
        open={showForm}
        onOpenChange={(open) => {
          setShowForm(open);
          if (!open) setEditingTip(null);
        }}
        tip={editingTip}
        servers={servers}
        onSuccess={handleFormSuccess}
      />
    </div>
  );
}
