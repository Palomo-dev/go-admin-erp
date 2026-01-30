'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { 
  TipsList, 
  TipsHeader, 
  TipForm, 
  ServerSummary,
  PropinasService,
  type Tip,
  type TipFilters,
  type TipSummary
} from '@/components/pos/propinas';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { toast } from 'sonner';

export default function PropinasPage() {
  const router = useRouter();
  const { organization, isLoading: orgLoading } = useOrganization();
  
  const [tips, setTips] = useState<Tip[]>([]);
  const [summaries, setSummaries] = useState<TipSummary[]>([]);
  const [servers, setServers] = useState<{ id: string; name: string; email: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    total: 0,
    distributed: 0,
    pending: 0,
    count: 0
  });
  
  const [filters, setFilters] = useState<TipFilters>({});
  const [showForm, setShowForm] = useState(false);
  const [editingTip, setEditingTip] = useState<Tip | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Cargar datos
  const loadData = async () => {
    if (!organization?.id) return;
    
    setLoading(true);
    try {
      const [tipsData, summaryData, serversData, statsData] = await Promise.all([
        PropinasService.getAll(filters),
        PropinasService.getSummaryByServer(filters),
        PropinasService.getServers(),
        PropinasService.getDayStats()
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
      <div className="flex items-center justify-center h-screen">
        <RefreshCw className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6 space-y-6">
      {/* Navegación */}
      <div className="flex items-center gap-4">
        <Button 
          variant="ghost" 
          onClick={() => router.push('/app/pos')}
          className="dark:text-gray-300 dark:hover:bg-gray-800"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Volver al POS
        </Button>
      </div>

      {/* Header con filtros y métricas */}
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

      {/* Contenido principal */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Lista de propinas */}
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

        {/* Resumen por mesero */}
        <div>
          <ServerSummary
            summaries={summaries}
            loading={loading}
          />
        </div>
      </div>

      {/* Formulario de propina */}
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
